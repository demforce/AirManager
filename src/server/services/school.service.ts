import { toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { computeExpiryStatus, type ExpiryStatus } from '@/lib/expiry-status';
import type { AssignInstructorInput } from '@/lib/schemas/school';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError, ValidationError } from './errors';

/**
 * Student <-> instructor assignment (epic 9, story 9.1; FR-32) — the staff
 * write side (`assignInstructor`/`unassignInstructor`/`listStudentInstructors`,
 * `school.manage.any`) plus the instructor's own read-only roster
 * (`listOwnStudents`, `school.manage.own`). `authorize()` always runs FIRST
 * in every exported function (pattern `instructor-rates.service.ts:120`).
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
 * The instructor's own "I miei allievi" roster (AC 3, `/dashboard/school`).
 * `school.manage.own`, self-scoped on `actor.personId` — resolves the
 * ACTOR's own active `InstructorProfile` (422 `INSTRUCTOR_PROFILE_REQUIRED`
 * if absent/deactivated/no linked person — same "own profile required" shape
 * as `bookings.service.ts#getOwnInstructorProfileId`, but throwing instead
 * of returning `null` since this is the actor's own data, not an optional
 * UI affordance).
 *
 * Hours and scadenze status are BOTH batched (Dev Notes: "MAI N+1 per riga"):
 * one `groupBy` sums each student's non-cancelled `SCHOOL` flight minutes
 * ACROSS every instructor (the student's own progress, not just flights with
 * THIS instructor); one `findMany` fetches every student's scadenze and the
 * worst status is reduced in JS with the exact same `computeExpiryStatus`
 * story 6.2/6.4 already use.
 */
export async function listOwnStudents(actor: Actor): Promise<OwnStudentItem[]> {
  authorize(actor, 'school.manage.own');

  if (actor.personId === null) {
    throw new ValidationError('Actor has no linked instructor profile.', undefined, 'INSTRUCTOR_PROFILE_REQUIRED');
  }
  const ownProfile = await prisma.instructorProfile.findUnique({
    where: { personId: actor.personId },
    select: { id: true, deactivatedAt: true },
  });
  if (!ownProfile || ownProfile.deactivatedAt !== null) {
    throw new ValidationError('Actor has no active instructor profile.', undefined, 'INSTRUCTOR_PROFILE_REQUIRED');
  }

  // Archived students drop out of the roster (91-F1): everywhere else the
  // app hides archived persons by default, and a lingering archived student
  // in an active roster is exactly the post-archival leftover this filters.
  // The assignment row itself is kept — unassignInstructor still works.
  const assignments = await prisma.studentInstructorAssignment.findMany({
    where: { instructorProfileId: ownProfile.id, studentProfile: { person: { archivedAt: null } } },
    select: {
      studentProfile: {
        select: { courseStartDate: true, person: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
    orderBy: [{ studentProfile: { person: { lastName: 'asc' } } }, { studentProfile: { person: { firstName: 'asc' } } }],
  });
  if (assignments.length === 0) return [];

  const studentPersonIds = assignments.map((assignment) => assignment.studentProfile.person.id);

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

  return assignments.map((assignment) => {
    const person = assignment.studentProfile.person;
    return {
      personId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      courseStartDate: toDateOnlyString(assignment.studentProfile.courseStartDate),
      totalMinutes: minutesByPerson.get(person.id) ?? 0,
      expiryStatus: worstStatusByPerson.get(person.id) ?? null,
    };
  });
}
