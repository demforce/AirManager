import { paginate, paginationOffset, type PaginatedResult, type PaginationQuery } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { computeExpiryStatus, type ExpiryStatus } from '@/lib/expiry-status';
import type { AssignInstructorInput, TrainingNoteInput } from '@/lib/schemas/school';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';

/**
 * Student <-> instructor assignment (epic 9, story 9.1; FR-32) — the staff
 * write side (`assignInstructor`/`unassignInstructor`/`listStudentInstructors`,
 * `school.manage.any`) plus the instructor's own read-only roster
 * (`listOwnStudents`, `school.manage.own`). `authorize()` always runs FIRST
 * in every exported function (pattern `instructor-rates.service.ts:120`).
 *
 * Story 9.2 (FR-33) extends this module with the training diary
 * (`TrainingNote`): `listTrainingNotes`/`createTrainingNote`/`updateTrainingNote`
 * plus two page-only helpers (`getTrainingDiaryHeader`, `listStudentSchoolFlights`
 * — not registered as API routes, see their doc-comments).
 */

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/** Prisma "record not found" on write (story TD-1 pattern) — the loser of a concurrent double-DELETE race. */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2025';
}

export type AssignedInstructorItem = {
  personId: string;
  firstName: string;
  lastName: string;
  assignedAt: Date;
};

export type OwnStudentItem = {
  personId: string;
  firstName: string;
  lastName: string;
  courseStartDate: string;
  totalMinutes: number;
  expiryStatus: ExpiryStatus | null;
  /** Most recent `TrainingNote.noteDate` across every instructor (story 9.2) — `null` when the student has no note yet. */
  lastNoteDate: string | null;
};

/**
 * Resolves the STUDENT side of a route/body-supplied `Person.id` to its
 * ACTIVE `StudentProfile.id` (404 unknown person — same split as
 * `instructor-rates.service.ts#resolveInstructorProfile` for a `{id}` route
 * param the caller already knows exists via `people.read`; 422
 * `STUDENT_NOT_FOUND` — same naming style as `flights.service.ts`'s
 * `INSTRUCTOR_NOT_FOUND` — when the person is archived or the profile is
 * missing or deactivated: an archived person is treated exactly like a
 * deactivated profile, same folded code, per the TD-1/5.1 D1 convention).
 */
async function resolveActiveStudentProfile(personId: string): Promise<{ id: string }> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { archivedAt: true, studentProfile: { select: { id: true, deactivatedAt: true } } },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }
  if (person.archivedAt !== null || !person.studentProfile || person.studentProfile.deactivatedAt !== null) {
    throw new ValidationError('This person has no active student profile.', undefined, 'STUDENT_NOT_FOUND');
  }
  return { id: person.studentProfile.id };
}

/**
 * Resolves the INSTRUCTOR side of a body-supplied `Person.id` to its ACTIVE
 * `InstructorProfile.id` — unknown person, ARCHIVED person, or no active
 * profile are FOLDED into the same 422 `INSTRUCTOR_NOT_FOUND`
 * (anti-enumeration, identical pattern/code to
 * `flights.service.ts#resolveFlightInput`'s instructor check, `archivedAt`
 * included per TD-1 AC 9 / decision 5.1 D1).
 */
async function resolveActiveInstructorProfile(personId: string): Promise<{ id: string }> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { archivedAt: true, instructorProfile: { select: { id: true, deactivatedAt: true } } },
  });
  const profile = person?.instructorProfile ?? null;
  if (!person || person.archivedAt !== null || !profile || profile.deactivatedAt !== null) {
    throw new ValidationError('Instructor has no active instructor profile.', undefined, 'INSTRUCTOR_NOT_FOUND');
  }
  return { id: profile.id };
}

/** Resolves a `Person.id` to its `StudentProfile.id` regardless of active state — 404 if the person doesn't exist or never activated one (there is then no assignment to find, by construction). Used by `unassignInstructor`, which must still remove an assignment left behind by a since-deactivated profile. */
async function resolveStudentProfileId(personId: string): Promise<string> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { studentProfile: { select: { id: true } } } });
  if (!person?.studentProfile) {
    throw new NotFoundError('Assignment not found.');
  }
  return person.studentProfile.id;
}

/** Same as `resolveStudentProfileId`, for the instructor side. */
async function resolveInstructorProfileId(personId: string): Promise<string> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { instructorProfile: { select: { id: true } } } });
  if (!person?.instructorProfile) {
    throw new NotFoundError('Assignment not found.');
  }
  return person.instructorProfile.id;
}

const ASSIGNED_INSTRUCTOR_SELECT = {
  createdAt: true,
  instructorProfile: { select: { person: { select: { id: true, firstName: true, lastName: true } } } },
} as const;

type SelectedAssignment = {
  createdAt: Date;
  instructorProfile: { person: { id: string; firstName: string; lastName: string } };
};

function toAssignedInstructorItem(assignment: SelectedAssignment): AssignedInstructorItem {
  return {
    personId: assignment.instructorProfile.person.id,
    firstName: assignment.instructorProfile.person.firstName,
    lastName: assignment.instructorProfile.person.lastName,
    assignedAt: assignment.createdAt,
  };
}

/**
 * Lists a student's assigned instructors (AC 1, scheda persona panel).
 * `school.manage.any`. `studentPersonId` is the `Person.id` (route param) —
 * 404 unknown person; 422 `STUDENT_NOT_FOUND` if no active student profile.
 */
export async function listStudentInstructors(actor: Actor, studentPersonId: string): Promise<AssignedInstructorItem[]> {
  authorize(actor, 'school.manage.any');

  const studentProfile = await resolveActiveStudentProfile(studentPersonId);

  const assignments = await prisma.studentInstructorAssignment.findMany({
    where: { studentProfileId: studentProfile.id },
    select: ASSIGNED_INSTRUCTOR_SELECT,
    orderBy: [{ instructorProfile: { person: { lastName: 'asc' } } }, { instructorProfile: { person: { firstName: 'asc' } } }],
  });

  return assignments.map(toAssignedInstructorItem);
}

/**
 * Assigns an instructor to a student (AC 1). `school.manage.any`. Both sides
 * must have an ACTIVE profile (422, see the two resolvers above); a repeat
 * assignment is a 409 — pre-check (`assertAssignmentAvailable`) backstopped
 * by a `P2002` catch around the `create` (same check-then-write pattern as
 * `instructor-rates.service.ts#createInstructorRate`, the unique constraint
 * itself is the only concurrency guard needed, Dev Notes: "nessun lock/tx
 * speciali").
 */
export async function assignInstructor(actor: Actor, studentPersonId: string, input: AssignInstructorInput): Promise<AssignedInstructorItem> {
  authorize(actor, 'school.manage.any');

  const studentProfile = await resolveActiveStudentProfile(studentPersonId);
  const instructorProfile = await resolveActiveInstructorProfile(input.instructorPersonId);

  const existing = await prisma.studentInstructorAssignment.findUnique({
    where: {
      studentProfileId_instructorProfileId: { studentProfileId: studentProfile.id, instructorProfileId: instructorProfile.id },
    },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError('This instructor is already assigned to this student.');
  }

  let assignment: SelectedAssignment;
  try {
    assignment = await prisma.studentInstructorAssignment.create({
      data: { studentProfileId: studentProfile.id, instructorProfileId: instructorProfile.id, assignedByUserId: actor.userId },
      select: ASSIGNED_INSTRUCTOR_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('This instructor is already assigned to this student.');
    }
    throw error;
  }

  return toAssignedInstructorItem(assignment);
}

/**
 * Removes a student-instructor assignment (AC 2). `school.manage.any`. Hard
 * delete (Contesto: no history required). Resolves BOTH sides to their
 * profile id regardless of active state (a since-deactivated profile must
 * still be unassignable) — 404 if either person/profile doesn't exist (no
 * assignment could reference it), then a pre-check + `P2025` catch around
 * the `delete` so two concurrent removals answer one 204 + one 404, never a
 * 500 (TD-1 pattern).
 */
export async function unassignInstructor(actor: Actor, studentPersonId: string, instructorPersonId: string): Promise<void> {
  authorize(actor, 'school.manage.any');

  const studentProfileId = await resolveStudentProfileId(studentPersonId);
  const instructorProfileId = await resolveInstructorProfileId(instructorPersonId);
  const where = { studentProfileId_instructorProfileId: { studentProfileId, instructorProfileId } } as const;

  const existing = await prisma.studentInstructorAssignment.findUnique({ where, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Assignment not found.');
  }

  try {
    await prisma.studentInstructorAssignment.delete({ where });
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new NotFoundError('Assignment not found.');
    }
    throw error;
  }
}

/** Worse-first ordering for the "worst status" reduction below — mirrors the ok < expiring < expired severity `expiry-status.ts` already establishes. */
const STATUS_SEVERITY: Record<ExpiryStatus, number> = { ok: 0, expiring: 1, expired: 2 };

function worseStatus(a: ExpiryStatus, b: ExpiryStatus): ExpiryStatus {
  return STATUS_SEVERITY[b] > STATUS_SEVERITY[a] ? b : a;
}

/**
 * Resolves the ACTOR's own ACTIVE `InstructorProfile` (422
 * `INSTRUCTOR_PROFILE_REQUIRED` if the actor has no linked person, no
 * profile, or a deactivated one) — the "own profile required" shape
 * `listOwnStudents` established (story 9.1), factored out here (story 9.2)
 * since the training-note create/read paths need the exact same resolution.
 */
async function resolveOwnActiveInstructorProfile(actor: Actor): Promise<{ id: string }> {
  if (actor.personId === null) {
    throw new ValidationError('Actor has no linked instructor profile.', undefined, 'INSTRUCTOR_PROFILE_REQUIRED');
  }
  const profile = await prisma.instructorProfile.findUnique({
    where: { personId: actor.personId },
    select: { id: true, deactivatedAt: true },
  });
  if (!profile || profile.deactivatedAt !== null) {
    throw new ValidationError('Actor has no active instructor profile.', undefined, 'INSTRUCTOR_PROFILE_REQUIRED');
  }
  return { id: profile.id };
}

/**
 * The instructor's own "I miei allievi" roster (AC 3, `/dashboard/school`).
 * `school.manage.own`, self-scoped on `actor.personId` — resolves the
 * ACTOR's own active `InstructorProfile` (422 `INSTRUCTOR_PROFILE_REQUIRED`
 * if absent/deactivated/no linked person — same "own profile required" shape
 * as `bookings.service.ts#getOwnInstructorProfileId`, but throwing instead
 * of returning `null` since this is the actor's own data, not an optional
 * UI affordance).
 *
 * Hours, scadenze status AND the last training-note date (story 9.2, closing
 * the 9.1 "ultima annotazione" deferral) are ALL batched (Dev Notes: "MAI
 * N+1 per riga"): one `groupBy` sums each student's non-cancelled `SCHOOL`
 * flight minutes ACROSS every instructor (the student's own progress, not
 * just flights with THIS instructor); one `findMany` fetches every student's
 * scadenze and the worst status is reduced in JS with the exact same
 * `computeExpiryStatus` story 6.2/6.4 already use; one `groupBy` (MAX)
 * fetches each student's most recent `TrainingNote.noteDate` ACROSS every
 * instructor (same "the diary is the allievo's" rule as `listTrainingNotes`).
 */
export async function listOwnStudents(actor: Actor): Promise<OwnStudentItem[]> {
  authorize(actor, 'school.manage.own');

  const ownProfile = await resolveOwnActiveInstructorProfile(actor);

  // Archived students drop out of the roster (91-F1): everywhere else the
  // app hides archived persons by default, and a lingering archived student
  // in an active roster is exactly the post-archival leftover this filters.
  // The assignment row itself is kept — unassignInstructor still works.
  const assignments = await prisma.studentInstructorAssignment.findMany({
    where: { instructorProfileId: ownProfile.id, studentProfile: { person: { archivedAt: null } } },
    select: {
      studentProfile: {
        select: { id: true, courseStartDate: true, person: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ studentProfile: { person: { lastName: 'asc' } } }, { studentProfile: { person: { firstName: 'asc' } } }],
  });
  if (assignments.length === 0) return [];

  const studentPersonIds = assignments.map((assignment) => assignment.studentProfile.person.id);
  const studentProfileIds = assignments.map((assignment) => assignment.studentProfile.id);

  // Batched hours (Dev Notes: never one query per row) — every non-cancelled
  // SCHOOL flight of the student, regardless of which instructor flew it.
  const minutesByPerson = new Map<string, number>();
  const grouped = await prisma.flight.groupBy({
    by: ['personId'],
    where: { personId: { in: studentPersonIds }, flightType: 'SCHOOL', status: { not: 'CANCELLED' } },
    _sum: { minutes: true },
  });
  for (const group of grouped) {
    minutesByPerson.set(group.personId, group._sum.minutes ?? 0);
  }

  // Batched worst scadenza status — same `computeExpiryStatus` as 6.2/6.4,
  // reduced per person in JS (one query total, not one per student).
  const today = todayDateOnlyUtc();
  const worstStatusByPerson = new Map<string, ExpiryStatus>();
  const expiries = await prisma.expiry.findMany({
    where: { personId: { in: studentPersonIds } },
    select: { personId: true, expiresAt: true },
  });
  for (const expiry of expiries) {
    const status = computeExpiryStatus(expiry.expiresAt, today);
    const current = worstStatusByPerson.get(expiry.personId);
    worstStatusByPerson.set(expiry.personId, current ? worseStatus(current, status) : status);
  }

  // Batched last-note date (story 9.2) — one `groupBy` MAX over every
  // student's `TrainingNote`s, keyed by `studentProfileId` (the FK
  // `TrainingNote` actually carries).
  const lastNoteDateByStudentProfile = new Map<string, string>();
  const noteGroups = await prisma.trainingNote.groupBy({
    by: ['studentProfileId'],
    where: { studentProfileId: { in: studentProfileIds } },
    _max: { noteDate: true },
  });
  for (const group of noteGroups) {
    if (group._max.noteDate) {
      lastNoteDateByStudentProfile.set(group.studentProfileId, toDateOnlyString(group._max.noteDate));
    }
  }

  return assignments.map((assignment) => {
    const person = assignment.studentProfile.person;
    return {
      personId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      courseStartDate: toDateOnlyString(assignment.studentProfile.courseStartDate),
      totalMinutes: minutesByPerson.get(person.id) ?? 0,
      lastNoteDate: lastNoteDateByStudentProfile.get(assignment.studentProfile.id) ?? null,
      expiryStatus: worstStatusByPerson.get(person.id) ?? null,
    };
  });
}

// --- Training notes (epic 9, story 9.2, FR-33) ------------------------------

export type TrainingNoteItem = {
  id: string;
  noteDate: string;
  exercises: string;
  assessment: string | null;
  nextSteps: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { personId: string; firstName: string; lastName: string };
  flight: { id: string; flightDate: string; minutes: number } | null;
};

const TRAINING_NOTE_SELECT = {
  id: true,
  noteDate: true,
  exercises: true,
  assessment: true,
  nextSteps: true,
  createdAt: true,
  updatedAt: true,
  instructorProfile: { select: { person: { select: { id: true, firstName: true, lastName: true } } } },
  flight: { select: { id: true, flightDate: true, minutes: true } },
} as const;

type SelectedTrainingNote = {
  id: string;
  noteDate: Date;
  exercises: string;
  assessment: string | null;
  nextSteps: string | null;
  createdAt: Date;
  updatedAt: Date;
  instructorProfile: { person: { id: string; firstName: string; lastName: string } };
  flight: { id: string; flightDate: Date; minutes: number } | null;
};

function toTrainingNoteItem(note: SelectedTrainingNote): TrainingNoteItem {
  return {
    id: note.id,
    noteDate: toDateOnlyString(note.noteDate),
    exercises: note.exercises,
    assessment: note.assessment,
    nextSteps: note.nextSteps,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    author: {
      personId: note.instructorProfile.person.id,
      firstName: note.instructorProfile.person.firstName,
      lastName: note.instructorProfile.person.lastName,
    },
    flight: note.flight
      ? { id: note.flight.id, flightDate: toDateOnlyString(note.flight.flightDate), minutes: note.flight.minutes }
      : null,
  };
}

/** `createTrainingNote`'s assignment guard — an instructor may only write about a student explicitly assigned to them (AC 1: "l'allievo non è suo" -> 403), reused by the read-side triple-access check below. */
async function assertInstructorAssignedToStudent(instructorProfileId: string, studentProfileId: string): Promise<void> {
  const assignment = await prisma.studentInstructorAssignment.findUnique({
    where: { studentProfileId_instructorProfileId: { studentProfileId, instructorProfileId } },
    select: { id: true },
  });
  if (!assignment) {
    throw new ForbiddenError('Actor is not assigned to this student.');
  }
}

/**
 * `flightId` guard shared by create/update (AC 1): the flight must EXIST, be
 * a `SCHOOL` flight, and belong to THIS student — 422 `FLIGHT_NOT_LINKABLE`
 * otherwise (new code, same style as `flights.service.ts`'s 422s). The
 * flight's `status` is deliberately NOT checked (Contesto: "una nota può
 * citare un volo poi stornato: la nota è cronaca, non contabilità").
 */
async function assertFlightLinkable(flightId: string, studentPersonId: string): Promise<void> {
  const flight = await prisma.flight.findUnique({ where: { id: flightId }, select: { flightType: true, personId: true } });
  if (!flight || flight.flightType !== 'SCHOOL' || flight.personId !== studentPersonId) {
    throw new ValidationError("This flight cannot be linked to this student's training note.", undefined, 'FLIGHT_NOT_LINKABLE');
  }
}

type TrainingDiaryAccess = { studentProfileId: string; isAssignedInstructor: boolean };

/**
 * Resolves the AC 2 triple access for the training diary of
 * `studentPersonId`: `school.manage.any` (staff/admin, full diary) OR
 * `school.manage.own` PLUS an existing assignment to this student (the
 * diary is the allievo's — an assigned instructor sees EVERY author's
 * entries, not just their own) OR own-access (`self.read` AND
 * `actor.personId === studentPersonId`, the allievo reading their OWN
 * diary). Throws `ForbiddenError` otherwise (AC 2: another student's diary,
 * or a pilot/student with no relation to this one, is always a 403).
 *
 * The two "management" branches (any/assigned) resolve the ACTIVE student
 * profile (422 `STUDENT_NOT_FOUND` if inactive/archived, Dev Notes: "SOLO
 * per i path di gestione"); the own-access branch uses the non-strict
 * resolver (Dev Notes: "il diario resta leggibile" even on a deactivated
 * profile — it is the allievo's own history).
 */
async function resolveTrainingDiaryAccess(actor: Actor, studentPersonId: string): Promise<TrainingDiaryAccess> {
  const canManageAny = hasPermission(actor, 'school.manage.any');
  const isOwnAccess = !canManageAny && hasPermission(actor, 'self.read') && actor.personId === studentPersonId;

  if (canManageAny) {
    const studentProfile = await resolveActiveStudentProfile(studentPersonId);
    return { studentProfileId: studentProfile.id, isAssignedInstructor: false };
  }

  if (isOwnAccess) {
    // Non-strict resolver, but with a diary-appropriate 404: its default
    // "Assignment not found." belongs to `unassignInstructor` and would be
    // misleading for a self.read caller with no student profile (92-N1).
    const person = await prisma.person.findUnique({ where: { id: studentPersonId }, select: { studentProfile: { select: { id: true } } } });
    if (!person?.studentProfile) {
      throw new NotFoundError('Training diary not found.');
    }
    return { studentProfileId: person.studentProfile.id, isAssignedInstructor: false };
  }

  if (!hasPermission(actor, 'school.manage.own')) {
    throw new ForbiddenError("Actor may not read this student's training notes.");
  }
  const ownProfile = await resolveOwnActiveInstructorProfile(actor);
  const studentProfile = await resolveActiveStudentProfile(studentPersonId);
  await assertInstructorAssignedToStudent(ownProfile.id, studentProfile.id);
  return { studentProfileId: studentProfile.id, isAssignedInstructor: true };
}

/**
 * Lists a student's training diary, paginated (AC 2/4). `noteDate desc,
 * createdAt desc` (Dev Notes) — an interactive transaction batches the page
 * + total count in one round trip (same pattern as `aircraft.service.ts#listAircraft`).
 */
export async function listTrainingNotes(
  actor: Actor,
  studentPersonId: string,
  query: PaginationQuery,
): Promise<PaginatedResult<TrainingNoteItem>> {
  const { studentProfileId } = await resolveTrainingDiaryAccess(actor, studentPersonId);

  const where = { studentProfileId };
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.trainingNote.findMany({
      where,
      select: TRAINING_NOTE_SELECT,
      orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
      ...paginationOffset(query),
    });
    const total = await tx.trainingNote.count({ where });
    return [items, total] as const;
  });

  return paginate(items.map(toTrainingNoteItem), total, query);
}

/**
 * Creates a training note (AC 1). `school.manage.own` FIRST (staff holds
 * `school.manage.any` instead, never this one — a 403, "staff non crea: non
 * è autore"), then the ACTOR's own active `InstructorProfile` is the AUTHOR
 * (422 `INSTRUCTOR_PROFILE_REQUIRED` if absent), then the assignment guard
 * (403 if this allievo is not assigned to this instructor), then the
 * optional flight link (422 `FLIGHT_NOT_LINKABLE`).
 */
export async function createTrainingNote(actor: Actor, studentPersonId: string, input: TrainingNoteInput): Promise<TrainingNoteItem> {
  authorize(actor, 'school.manage.own');

  const ownProfile = await resolveOwnActiveInstructorProfile(actor);
  const studentProfile = await resolveActiveStudentProfile(studentPersonId);
  await assertInstructorAssignedToStudent(ownProfile.id, studentProfile.id);

  if (input.flightId) {
    await assertFlightLinkable(input.flightId, studentPersonId);
  }

  const note = await prisma.trainingNote.create({
    data: {
      studentProfileId: studentProfile.id,
      instructorProfileId: ownProfile.id,
      noteDate: parseDateOnlyUtc(input.noteDate),
      flightId: input.flightId ?? null,
      exercises: input.exercises,
      assessment: input.assessment ?? null,
      nextSteps: input.nextSteps ?? null,
    },
    select: TRAINING_NOTE_SELECT,
  });

  return toTrainingNoteItem(note);
}

/** The 7-day edit window (AC 3), exact UTC timestamps — no timezone logic (Dev Notes). */
const NOTE_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Edits a training note's content (AC 3) — noteDate/flightId/exercises/
 * assessment/nextSteps ONLY, never the author or the student (a full
 * replace of those fields, same input shape as create). 404 if the note
 * doesn't exist or doesn't belong to this student's `{id}` route param
 * (never leaks a note across students via the wrong path). Permission:
 * the AUTHOR (`school.manage.own` AND `actor.personId` resolves to the
 * SAME `InstructorProfile` as `note.instructorProfileId`) OR
 * `school.notes.manage.any` (admin only, via `ALL_PERMISSIONS`) — anyone
 * else is a 403. THEN the 7-day window: `Date.now() - createdAt > 7d` is
 * 409 `NOTE_IMMUTABLE` for EVERYONE, admin included (AC 3: "dopo -> 409 ...
 * per CHIUNQUE, admin incluso") — checked AFTER the permission gate, so a
 * non-author/non-admin still gets a plain 403, never a 409 that would leak
 * the note's age. Last-write-wins between concurrent edits (Dev Notes,
 * accepted — no optimistic lock).
 */
export async function updateTrainingNote(
  actor: Actor,
  studentPersonId: string,
  noteId: string,
  input: TrainingNoteInput,
): Promise<TrainingNoteItem> {
  const note = await prisma.trainingNote.findUnique({
    where: { id: noteId },
    select: {
      instructorProfileId: true,
      createdAt: true,
      studentProfile: { select: { person: { select: { id: true } } } },
    },
  });
  if (!note || note.studentProfile.person.id !== studentPersonId) {
    throw new NotFoundError('Training note not found.');
  }

  let isAuthor = false;
  if (hasPermission(actor, 'school.manage.own') && actor.personId !== null) {
    const ownProfile = await prisma.instructorProfile.findUnique({ where: { personId: actor.personId }, select: { id: true } });
    isAuthor = ownProfile?.id === note.instructorProfileId;
  }
  const isAdminOverride = hasPermission(actor, 'school.notes.manage.any');
  if (!isAuthor && !isAdminOverride) {
    throw new ForbiddenError('Only the author or an admin may edit this training note.');
  }

  if (Date.now() - note.createdAt.getTime() > NOTE_EDIT_WINDOW_MS) {
    throw new ConflictError('This training note can no longer be edited (7-day window elapsed).', undefined, 'NOTE_IMMUTABLE');
  }

  if (input.flightId) {
    await assertFlightLinkable(input.flightId, studentPersonId);
  }

  const updated = await prisma.trainingNote.update({
    where: { id: noteId },
    data: {
      noteDate: parseDateOnlyUtc(input.noteDate),
      flightId: input.flightId ?? null,
      exercises: input.exercises,
      assessment: input.assessment ?? null,
      nextSteps: input.nextSteps ?? null,
    },
    select: TRAINING_NOTE_SELECT,
  });

  return toTrainingNoteItem(updated);
}

export type TrainingDiaryHeader = {
  firstName: string;
  lastName: string;
  courseStartDate: string;
  /** Whether THIS actor is the assigned instructor — the only branch that gets the "Nuova annotazione" form (`/dashboard/school/{id}` page-only, Dev Notes). */
  isAssignedInstructor: boolean;
};

/**
 * Header (name + course start date) for the training diary page
 * (`/dashboard/school/{id}`) — deliberately NOT `people.service.ts#getPerson`
 * (that requires `people.read` or own-access to the person being viewed; an
 * assigned instructor has neither for a DIFFERENT person). NOT registered as
 * an API route (Dev Notes/AC 4 only require the three `training-notes`
 * endpoints in OpenAPI) — called directly by the server page, same pattern
 * as `dashboard/page.tsx` calling `listPersonExpiries` directly. Same triple
 * access as `listTrainingNotes` (deliberately re-resolved here rather than
 * folded into that function's response, so the AD-8 list envelope stays
 * exactly `{items,total,page,pageSize}`).
 */
export async function getTrainingDiaryHeader(actor: Actor, studentPersonId: string): Promise<TrainingDiaryHeader> {
  const { isAssignedInstructor } = await resolveTrainingDiaryAccess(actor, studentPersonId);

  const person = await prisma.person.findUnique({
    where: { id: studentPersonId },
    select: { firstName: true, lastName: true, studentProfile: { select: { courseStartDate: true } } },
  });
  if (!person || !person.studentProfile) {
    throw new NotFoundError('Person not found.');
  }

  return {
    firstName: person.firstName,
    lastName: person.lastName,
    courseStartDate: toDateOnlyString(person.studentProfile.courseStartDate),
    isAssignedInstructor,
  };
}

export type StudentSchoolFlightOption = { id: string; flightDate: string; minutes: number };

/**
 * The assigned student's `SCHOOL` flights, for the "Nuova annotazione"
 * form's optional flight-link `<select>` (AC 1) — page-only, NOT an API
 * route (same rationale as `getTrainingDiaryHeader`). Deliberately NOT
 * routed through `flights.service.ts#listFlights`: its own-access guard 403s
 * a `personId` filter that isn't the caller's OWN person, so an assigned
 * instructor querying a DIFFERENT person's (the student's) flights would
 * never pass it — even though this diary explicitly lets any assigned
 * instructor link ANY of the student's SCHOOL flights, not just ones they
 * personally flew (deviation from the Dev Notes' literal
 * `GET /api/v1/flights?personId=...` suggestion, documented in the story's
 * Completion Notes). Only the ASSIGNED instructor may call this (same guard
 * as `createTrainingNote`) — no amounts/charges in the result (same "mai
 * dati contabili" rule as `TrainingNoteItem.flight`).
 */
export async function listStudentSchoolFlights(actor: Actor, studentPersonId: string): Promise<StudentSchoolFlightOption[]> {
  authorize(actor, 'school.manage.own');

  const ownProfile = await resolveOwnActiveInstructorProfile(actor);
  const studentProfile = await resolveActiveStudentProfile(studentPersonId);
  await assertInstructorAssignedToStudent(ownProfile.id, studentProfile.id);

  const flights = await prisma.flight.findMany({
    where: { personId: studentPersonId, flightType: 'SCHOOL' },
    select: { id: true, flightDate: true, minutes: true },
    orderBy: { flightDate: 'desc' },
  });

  return flights.map((flight) => ({ id: flight.id, flightDate: toDateOnlyString(flight.flightDate), minutes: flight.minutes }));
}
