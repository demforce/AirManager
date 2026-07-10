import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { parseDateOnlyUtc } from '@/lib/date-only';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: { findUnique: vi.fn(), findMany: vi.fn() },
    instructorProfile: { findUnique: vi.fn() },
    studentInstructorAssignment: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    flight: { groupBy: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    expiry: { findMany: vi.fn() },
    trainingNote: { groupBy: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  assignInstructor,
  createTrainingNote,
  getInstructorHourSummaries,
  getStudentHourSummaries,
  listOwnStudents,
  listStudentInstructors,
  listStudentSchoolFlights,
  listTrainingNotes,
  unassignInstructor,
  updateTrainingNote,
} = await import('./school.service');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const instructorProfileFindUniqueMock = vi.mocked(prisma.instructorProfile.findUnique);
const assignmentFindUniqueMock = vi.mocked(prisma.studentInstructorAssignment.findUnique);
const assignmentFindManyMock = vi.mocked(prisma.studentInstructorAssignment.findMany);
const assignmentCreateMock = vi.mocked(prisma.studentInstructorAssignment.create);
const assignmentDeleteMock = vi.mocked(prisma.studentInstructorAssignment.delete);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const flightFindUniqueMock = vi.mocked(prisma.flight.findUnique);
const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const noteGroupByMock = vi.mocked(prisma.trainingNote.groupBy);
const noteFindUniqueMock = vi.mocked(prisma.trainingNote.findUnique);
const noteFindManyMock = vi.mocked(prisma.trainingNote.findMany);
const noteCountMock = vi.mocked(prisma.trainingNote.count);
const noteCreateMock = vi.mocked(prisma.trainingNote.create);
const noteUpdateMock = vi.mocked(prisma.trainingNote.update);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as instructor-rates.service.test.ts).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockResolvedValueOnce: (v: Fixture) => { mockResolvedValueOnce: (v: Fixture) => void };
};
const personFindMany = personFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const instructorProfileFindUnique = instructorProfileFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const assignmentFindUnique = assignmentFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const assignmentFindMany = assignmentFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const assignmentCreate = assignmentCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const assignmentDelete = assignmentDeleteMock as unknown as { mockResolvedValue: (v: undefined) => void };
const flightGroupBy = flightGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightFindUnique = flightFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindMany = flightFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const noteGroupBy = noteGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const noteFindUnique = noteFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const noteFindMany = noteFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const noteCreate = noteCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const noteUpdate = noteUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };

/**
 * `listTrainingNotes` runs its read inside `prisma.$transaction(async (tx) =>
 * ...)` (same interactive-transaction pattern as `aircraft.service.ts#listAircraft`)
 * — handing the same mocked `prisma` back as `tx` is a faithful stand-in
 * (`trainingNote.findMany`/`.count`, mocked above, are what the callback
 * actually calls whether reached directly or via `tx`).
 */
function mockInteractiveTransaction(): void {
  transaction.mockImplementation((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg));
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}
function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}
function instructorActor(personId: string | null = 'person_instructor'): Actor {
  return { userId: 'instructor_user_1', personId, roles: ['INSTRUCTOR'] };
}

const ACTIVE_STUDENT_PERSON = { archivedAt: null, studentProfile: { id: 'student_profile_1', deactivatedAt: null } };
const DEACTIVATED_STUDENT_PERSON = { archivedAt: null, studentProfile: { id: 'student_profile_1', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } };
const ARCHIVED_STUDENT_PERSON = { archivedAt: new Date('2026-07-01T00:00:00.000Z'), studentProfile: { id: 'student_profile_1', deactivatedAt: null } };
const NO_STUDENT_PERSON = { archivedAt: null, studentProfile: null };
const ACTIVE_INSTRUCTOR_PERSON = { archivedAt: null, instructorProfile: { id: 'instructor_profile_1', deactivatedAt: null } };
const ARCHIVED_INSTRUCTOR_PERSON = { archivedAt: new Date('2026-07-01T00:00:00.000Z'), instructorProfile: { id: 'instructor_profile_1', deactivatedAt: null } };
const NO_INSTRUCTOR_PERSON = { archivedAt: null, instructorProfile: null };

const ASSIGNMENT_FIXTURE = {
  createdAt: new Date('2026-07-09T08:00:00.000Z'),
  instructorProfile: { person: { id: 'person_instructor', firstName: 'Ines', lastName: 'Istruttrice' } },
};

describe('school.service (story 9.1 — student-instructor assignment, FR-32; story 9.2 — training notes, FR-33)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
    personFindManyMock.mockReset();
    instructorProfileFindUniqueMock.mockReset();
    assignmentFindUniqueMock.mockReset();
    assignmentFindManyMock.mockReset();
    assignmentCreateMock.mockReset();
    assignmentDeleteMock.mockReset();
    flightGroupByMock.mockReset();
    flightFindUniqueMock.mockReset();
    flightFindManyMock.mockReset();
    expiryFindManyMock.mockReset();
    noteGroupByMock.mockReset();
    noteFindUniqueMock.mockReset();
    noteFindManyMock.mockReset();
    noteCountMock.mockReset();
    noteCreateMock.mockReset();
    noteUpdateMock.mockReset();
    transactionMock.mockReset();
    // Default: no notes yet — `listOwnStudents`'s batched `lastNoteDate`
    // query is unconditional once the roster is non-empty, so every
    // pre-existing 9.1 roster test (which doesn't care about notes) needs a
    // safe default rather than an unmocked (`undefined`) resolution.
    noteGroupBy.mockResolvedValue([]);
  });

  describe('authorization (AD-5)', () => {
    it('listStudentInstructors rejects a pilot (needs school.manage.any)', async () => {
      await expect(listStudentInstructors(pilotActor(), 'person_student')).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('assignInstructor rejects an instructor (needs school.manage.any, not .own)', async () => {
      await expect(assignInstructor(instructorActor(), 'person_student', { instructorPersonId: 'x' })).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('unassignInstructor rejects a pilot', async () => {
      await expect(unassignInstructor(pilotActor(), 'person_student', 'person_instructor')).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('listOwnStudents rejects staff (needs school.manage.own, not .any)', async () => {
      await expect(listOwnStudents(staffActor())).rejects.toThrow(ForbiddenError);
      expect(instructorProfileFindUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('assignInstructor (AC 1)', () => {
    it('throws NotFoundError for an unknown student person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(assignInstructor(staffActor(), 'missing', { instructorPersonId: 'person_instructor' })).rejects.toThrow(NotFoundError);
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError STUDENT_NOT_FOUND when the student profile is missing', async () => {
      personFindUnique.mockResolvedValue(NO_STUDENT_PERSON);
      const error = await assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as InstanceType<typeof ValidationError>).code).toBe('STUDENT_NOT_FOUND');
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError STUDENT_NOT_FOUND when the student profile is deactivated', async () => {
      personFindUnique.mockResolvedValue(DEACTIVATED_STUDENT_PERSON);
      await expect(assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' })).rejects.toThrow(
        ValidationError,
      );
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError INSTRUCTOR_NOT_FOUND (folded) for an unknown OR inactive instructor', async () => {
      personFindUnique.mockResolvedValueOnce(ACTIVE_STUDENT_PERSON).mockResolvedValueOnce(null);
      const error = await assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'missing' }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as InstanceType<typeof ValidationError>).code).toBe('INSTRUCTOR_NOT_FOUND');
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError STUDENT_NOT_FOUND for an ARCHIVED student person with an active profile (review 9.1 F1, TD-1/5.1 D1 convention)', async () => {
      personFindUnique.mockResolvedValue(ARCHIVED_STUDENT_PERSON);
      const error = await assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as InstanceType<typeof ValidationError>).code).toBe('STUDENT_NOT_FOUND');
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError INSTRUCTOR_NOT_FOUND (same folded code) for an ARCHIVED instructor person with an active profile (review 9.1 F1)', async () => {
      personFindUnique.mockResolvedValueOnce(ACTIVE_STUDENT_PERSON).mockResolvedValueOnce(ARCHIVED_INSTRUCTOR_PERSON);
      const error = await assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' }).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as InstanceType<typeof ValidationError>).code).toBe('INSTRUCTOR_NOT_FOUND');
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the pre-check finds an existing assignment (AC 1, duplicate -> 409)', async () => {
      personFindUnique.mockResolvedValueOnce(ACTIVE_STUDENT_PERSON).mockResolvedValueOnce(ACTIVE_INSTRUCTOR_PERSON);
      assignmentFindUnique.mockResolvedValue({ id: 'existing' });

      await expect(assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' })).rejects.toThrow(
        ConflictError,
      );
      expect(assignmentCreateMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError (concurrency backstop)', async () => {
      personFindUnique.mockResolvedValueOnce(ACTIVE_STUDENT_PERSON).mockResolvedValueOnce(ACTIVE_INSTRUCTOR_PERSON);
      assignmentFindUnique.mockResolvedValue(null);
      assignmentCreateMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' })).rejects.toThrow(
        ConflictError,
      );
    });

    it('creates the assignment with assignedByUserId = actor.userId and returns the instructor DTO', async () => {
      personFindUnique.mockResolvedValueOnce(ACTIVE_STUDENT_PERSON).mockResolvedValueOnce(ACTIVE_INSTRUCTOR_PERSON);
      assignmentFindUnique.mockResolvedValue(null);
      assignmentCreate.mockResolvedValue(ASSIGNMENT_FIXTURE);

      const result = await assignInstructor(staffActor(), 'person_student', { instructorPersonId: 'person_instructor' });

      expect(assignmentCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { studentProfileId: 'student_profile_1', instructorProfileId: 'instructor_profile_1', assignedByUserId: 'staff_1' },
        }),
      );
      expect(result).toEqual({
        personId: 'person_instructor',
        firstName: 'Ines',
        lastName: 'Istruttrice',
        assignedAt: ASSIGNMENT_FIXTURE.createdAt,
      });
    });
  });

  describe('unassignInstructor (AC 2 — TD-1 double-DELETE pattern)', () => {
    it('throws NotFoundError when the student person/profile cannot be resolved', async () => {
      personFindUnique.mockResolvedValueOnce(NO_STUDENT_PERSON);
      await expect(unassignInstructor(staffActor(), 'person_student', 'person_instructor')).rejects.toThrow(NotFoundError);
      expect(assignmentDeleteMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the instructor person/profile cannot be resolved', async () => {
      personFindUnique.mockResolvedValueOnce({ studentProfile: { id: 'student_profile_1' } }).mockResolvedValueOnce(NO_INSTRUCTOR_PERSON);
      await expect(unassignInstructor(staffActor(), 'person_student', 'person_instructor')).rejects.toThrow(NotFoundError);
      expect(assignmentDeleteMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the assignment pre-check finds nothing (first of two concurrent DELETEs already won)', async () => {
      personFindUnique
        .mockResolvedValueOnce({ studentProfile: { id: 'student_profile_1' } })
        .mockResolvedValueOnce({ instructorProfile: { id: 'instructor_profile_1' } });
      assignmentFindUnique.mockResolvedValue(null);

      await expect(unassignInstructor(staffActor(), 'person_student', 'person_instructor')).rejects.toThrow(NotFoundError);
      expect(assignmentDeleteMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2025 (the SECOND of two concurrent DELETEs) to NotFoundError, never a 500', async () => {
      personFindUnique
        .mockResolvedValueOnce({ studentProfile: { id: 'student_profile_1' } })
        .mockResolvedValueOnce({ instructorProfile: { id: 'instructor_profile_1' } });
      assignmentFindUnique.mockResolvedValue({ id: 'assignment_1' });
      assignmentDeleteMock.mockRejectedValue(Object.assign(new Error('Record not found'), { code: 'P2025' }));

      await expect(unassignInstructor(staffActor(), 'person_student', 'person_instructor')).rejects.toThrow(NotFoundError);
    });

    it('deletes by the compound unique key when the assignment exists', async () => {
      personFindUnique
        .mockResolvedValueOnce({ studentProfile: { id: 'student_profile_1' } })
        .mockResolvedValueOnce({ instructorProfile: { id: 'instructor_profile_1' } });
      assignmentFindUnique.mockResolvedValue({ id: 'assignment_1' });
      assignmentDelete.mockResolvedValue(undefined);

      await unassignInstructor(staffActor(), 'person_student', 'person_instructor');

      expect(assignmentDeleteMock).toHaveBeenCalledWith({
        where: { studentProfileId_instructorProfileId: { studentProfileId: 'student_profile_1', instructorProfileId: 'instructor_profile_1' } },
      });
    });
  });

  describe('listStudentInstructors (AC 1)', () => {
    it('throws NotFoundError for an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(listStudentInstructors(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError STUDENT_NOT_FOUND without an active student profile', async () => {
      personFindUnique.mockResolvedValue(NO_STUDENT_PERSON);
      await expect(listStudentInstructors(staffActor(), 'person_student')).rejects.toThrow(ValidationError);
    });

    it('returns the mapped instructor list', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
      assignmentFindMany.mockResolvedValue([ASSIGNMENT_FIXTURE]);

      const result = await listStudentInstructors(staffActor(), 'person_student');

      expect(assignmentFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { studentProfileId: 'student_profile_1' } }));
      expect(result).toEqual([
        { personId: 'person_instructor', firstName: 'Ines', lastName: 'Istruttrice', assignedAt: ASSIGNMENT_FIXTURE.createdAt },
      ]);
    });
  });

  describe('listOwnStudents (AC 3/4 — self-scoped, batched hours + worst-status badge)', () => {
    it('throws ValidationError INSTRUCTOR_PROFILE_REQUIRED when the actor has no linked person', async () => {
      const error = await listOwnStudents(instructorActor(null)).catch((e) => e);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as InstanceType<typeof ValidationError>).code).toBe('INSTRUCTOR_PROFILE_REQUIRED');
      expect(instructorProfileFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError INSTRUCTOR_PROFILE_REQUIRED when the actor has no active instructor profile', async () => {
      instructorProfileFindUnique.mockResolvedValue(null);
      await expect(listOwnStudents(instructorActor())).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError INSTRUCTOR_PROFILE_REQUIRED when the profile is deactivated', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') });
      await expect(listOwnStudents(instructorActor())).rejects.toThrow(ValidationError);
    });

    it('returns an empty array (no further queries) when the instructor has no students', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([]);

      const result = await listOwnStudents(instructorActor());

      expect(result).toEqual([]);
      expect(flightGroupByMock).not.toHaveBeenCalled();
      expect(expiryFindManyMock).not.toHaveBeenCalled();
    });

    it('filters ARCHIVED students out of the roster query (review 9.1 F1)', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([]);

      await listOwnStudents(instructorActor());

      expect(assignmentFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instructorProfileId: 'instructor_profile_1', studentProfile: { person: { archivedAt: null } } },
        }),
      );
    });

    it('sums SCHOOL minutes ACROSS every instructor via ONE batched groupBy (never N+1), excluding CANCELLED', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([
        {
          studentProfile: { courseStartDate: new Date('2026-01-15T00:00:00.000Z'), person: { id: 'student_1', firstName: 'Sara', lastName: 'Allieva' } },
        },
      ]);
      flightGroupBy.mockResolvedValue([{ personId: 'student_1', _sum: { minutes: 125 } }]);
      expiryFindMany.mockResolvedValue([]);

      const result = await listOwnStudents(instructorActor());

      expect(flightGroupByMock).toHaveBeenCalledTimes(1);
      expect(flightGroupByMock).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['personId'],
          where: { personId: { in: ['student_1'] }, flightType: 'SCHOOL', status: { not: 'CANCELLED' } },
        }),
      );
      expect(result[0]?.totalMinutes).toBe(125);
    });

    it('defaults totalMinutes to 0 for a student absent from the groupBy result (no SCHOOL flights yet)', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([
        {
          studentProfile: { courseStartDate: new Date('2026-01-15T00:00:00.000Z'), person: { id: 'student_1', firstName: 'Sara', lastName: 'Allieva' } },
        },
      ]);
      flightGroupBy.mockResolvedValue([]);
      expiryFindMany.mockResolvedValue([]);

      const result = await listOwnStudents(instructorActor());
      expect(result[0]?.totalMinutes).toBe(0);
    });

    it('picks the WORST status among a student\'s scadenze (expired beats expiring beats ok) via ONE batched query', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([
        {
          studentProfile: { courseStartDate: new Date('2026-01-15T00:00:00.000Z'), person: { id: 'student_1', firstName: 'Sara', lastName: 'Allieva' } },
        },
      ]);
      flightGroupBy.mockResolvedValue([]);
      // Today is server-clock UTC "now" — use dates safely far in the past/future to avoid flakiness.
      expiryFindMany.mockResolvedValue([
        { personId: 'student_1', expiresAt: new Date('2099-01-01T00:00:00.000Z') }, // ok
        { personId: 'student_1', expiresAt: new Date('2020-01-01T00:00:00.000Z') }, // expired
      ]);

      const result = await listOwnStudents(instructorActor());

      expect(expiryFindManyMock).toHaveBeenCalledTimes(1);
      expect(result[0]?.expiryStatus).toBe('expired');
    });

    it('leaves expiryStatus null for a student with no scadenze registered', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([
        {
          studentProfile: { courseStartDate: new Date('2026-01-15T00:00:00.000Z'), person: { id: 'student_1', firstName: 'Sara', lastName: 'Allieva' } },
        },
      ]);
      flightGroupBy.mockResolvedValue([]);
      expiryFindMany.mockResolvedValue([]);

      const result = await listOwnStudents(instructorActor());
      expect(result[0]?.expiryStatus).toBeNull();
    });

    it('picks up the batched last-note date, keyed by studentProfileId (story 9.2)', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([
        {
          studentProfile: {
            id: 'student_profile_1',
            courseStartDate: new Date('2026-01-15T00:00:00.000Z'),
            person: { id: 'student_1', firstName: 'Sara', lastName: 'Allieva' },
          },
        },
      ]);
      flightGroupBy.mockResolvedValue([]);
      expiryFindMany.mockResolvedValue([]);
      noteGroupBy.mockResolvedValue([{ studentProfileId: 'student_profile_1', _max: { noteDate: new Date('2026-02-01T00:00:00.000Z') } }]);

      const result = await listOwnStudents(instructorActor());

      expect(noteGroupByMock).toHaveBeenCalledTimes(1);
      expect(noteGroupByMock).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['studentProfileId'], where: { studentProfileId: { in: ['student_profile_1'] } } }),
      );
      expect(result[0]?.lastNoteDate).toBe('2026-02-01');
    });

    it('leaves lastNoteDate null for a student with no notes yet', async () => {
      instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
      assignmentFindMany.mockResolvedValue([
        {
          studentProfile: {
            id: 'student_profile_1',
            courseStartDate: new Date('2026-01-15T00:00:00.000Z'),
            person: { id: 'student_1', firstName: 'Sara', lastName: 'Allieva' },
          },
        },
      ]);
      flightGroupBy.mockResolvedValue([]);
      expiryFindMany.mockResolvedValue([]);
      noteGroupBy.mockResolvedValue([]);

      const result = await listOwnStudents(instructorActor());
      expect(result[0]?.lastNoteDate).toBeNull();
    });
  });

  describe('hour summaries (story 9.3, FR-34)', () => {
    /** Queues N sequential `flight.groupBy` results, in call order (`flightGroupBy`'s wrapper only exposes `mockResolvedValue`, story 9.3's functions issue several SEQUENTIAL groupBy calls per invocation). */
    function queueGroupByResults(...results: Fixture[][]): void {
      const mock = flightGroupByMock as unknown as { mockResolvedValueOnce: (v: Fixture[]) => void };
      for (const result of results) {
        mock.mockResolvedValueOnce(result);
      }
    }

    const STUDENT_A = { id: 'student_a', firstName: 'Anna', lastName: 'Allieva' };
    const STUDENT_B = { id: 'student_b', firstName: 'Bruno', lastName: 'Barone' };

    describe('getStudentHourSummaries (AC 1, AC 3 bounds, AC 5)', () => {
      it('rejects an actor without school.manage.any (e.g. an instructor with only .own)', async () => {
        await expect(getStudentHourSummaries(instructorActor(), { from: '2026-01-01', to: '2026-01-31' })).rejects.toThrow(ForbiddenError);
        expect(personFindManyMock).not.toHaveBeenCalled();
      });

      it('scopes the platea to non-archived persons with an active (non-deactivated) student profile', async () => {
        personFindMany.mockResolvedValue([]);

        await getStudentHourSummaries(staffActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(personFindManyMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { archivedAt: null, studentProfile: { deactivatedAt: null } } }),
        );
      });

      it('returns an empty array (no groupBy at all) when there are no active students', async () => {
        personFindMany.mockResolvedValue([]);

        const result = await getStudentHourSummaries(staffActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(result).toEqual([]);
        expect(flightGroupByMock).not.toHaveBeenCalled();
      });

      it('issues exactly 4 batched groupBy calls (dual/solo x period/all-time), all on personId IN (...), keyed off isSolo (story 9.4)', async () => {
        personFindMany.mockResolvedValue([STUDENT_A]);
        queueGroupByResults([], [], [], []);

        await getStudentHourSummaries(staffActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(flightGroupByMock).toHaveBeenCalledTimes(4);
        const calls = flightGroupByMock.mock.calls.map((call) => call[0]);
        expect(calls[0]).toMatchObject({
          by: ['personId'],
          where: {
            personId: { in: ['student_a'] },
            status: { not: 'CANCELLED' },
            flightType: 'SCHOOL',
            isSolo: false,
            flightDate: { gte: parseDateOnlyUtc('2026-01-01'), lte: parseDateOnlyUtc('2026-01-31') },
          },
        });
        expect(calls[1]).toMatchObject({
          where: {
            personId: { in: ['student_a'] },
            status: { not: 'CANCELLED' },
            flightType: 'SCHOOL',
            isSolo: true,
            flightDate: { gte: parseDateOnlyUtc('2026-01-01'), lte: parseDateOnlyUtc('2026-01-31') },
          },
        });
        // All-time: same shape, NO flightDate bound.
        expect(calls[2]).toMatchObject({
          where: { personId: { in: ['student_a'] }, status: { not: 'CANCELLED' }, flightType: 'SCHOOL', isSolo: false },
        });
        expect((calls[2] as { where: Record<string, unknown> }).where).not.toHaveProperty('flightDate');
        expect(calls[3]).toMatchObject({
          where: { personId: { in: ['student_a'] }, status: { not: 'CANCELLED' }, flightType: 'SCHOOL', isSolo: true },
        });
        expect((calls[3] as { where: Record<string, unknown> }).where).not.toHaveProperty('flightDate');
      });

      it('derives dual/solo/total/all-time correctly from the 4 batched sums, per student', async () => {
        personFindMany.mockResolvedValue([STUDENT_A, STUDENT_B]);
        // dual period, solo period, dual all-time, solo all-time.
        queueGroupByResults(
          [{ personId: 'student_a', _sum: { minutes: 90 } }],
          [{ personId: 'student_a', _sum: { minutes: 30 } }],
          [{ personId: 'student_a', _sum: { minutes: 300 } }, { personId: 'student_b', _sum: { minutes: 60 } }],
          [{ personId: 'student_a', _sum: { minutes: 30 } }],
        );

        const result = await getStudentHourSummaries(staffActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(result).toEqual([
          {
            personId: 'student_a',
            firstName: 'Anna',
            lastName: 'Allieva',
            dualMinutes: 90,
            soloMinutes: 30,
            totalMinutes: 120,
            totalMinutesAllTime: 330,
          },
          {
            personId: 'student_b',
            firstName: 'Bruno',
            lastName: 'Barone',
            dualMinutes: 0,
            soloMinutes: 0,
            totalMinutes: 0,
            totalMinutesAllTime: 60,
          },
        ]);
      });
    });

    describe('getInstructorHourSummaries (AC 2, AC 3 bounds, AC 5 — two-way permission matrix)', () => {
      it('rejects an actor with neither school.manage.any nor .own', async () => {
        await expect(getInstructorHourSummaries(pilotActor(), { from: '2026-01-01', to: '2026-01-31' })).rejects.toThrow(ForbiddenError);
        expect(personFindManyMock).not.toHaveBeenCalled();
        expect(flightGroupByMock).not.toHaveBeenCalled();
      });

      it('school.manage.any: lists every ACTIVE instructor (non-archived person, non-deactivated profile)', async () => {
        personFindMany.mockResolvedValue([
          { id: 'instructor_a', firstName: 'Ines', lastName: 'Istruttrice', instructorProfile: { id: 'profile_a' } },
        ]);
        flightGroupBy.mockResolvedValue([{ instructorProfileId: 'profile_a', _sum: { minutes: 45 } }]);

        const result = await getInstructorHourSummaries(staffActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(personFindManyMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { archivedAt: null, instructorProfile: { deactivatedAt: null } } }),
        );
        expect(result).toEqual([{ personId: 'instructor_a', firstName: 'Ines', lastName: 'Istruttrice', minutes: 45 }]);
      });

      it('school.manage.own: returns ONLY the caller\'s own row, never touching person.findMany (the platea query)', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue({ firstName: 'Ines', lastName: 'Istruttrice' });
        flightGroupBy.mockResolvedValue([{ instructorProfileId: 'instructor_profile_1', _sum: { minutes: 45 } }]);

        const result = await getInstructorHourSummaries(instructorActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(personFindManyMock).not.toHaveBeenCalled();
        expect(flightGroupByMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ instructorProfileId: { in: ['instructor_profile_1'] } }) }),
        );
        expect(result).toEqual([{ personId: 'person_instructor', firstName: 'Ines', lastName: 'Istruttrice', minutes: 45 }]);
      });

      it('school.manage.own: throws ValidationError INSTRUCTOR_PROFILE_REQUIRED when the actor has no active instructor profile', async () => {
        instructorProfileFindUnique.mockResolvedValue(null);

        const error = await getInstructorHourSummaries(instructorActor(), { from: '2026-01-01', to: '2026-01-31' }).catch((e) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as InstanceType<typeof ValidationError>).code).toBe('INSTRUCTOR_PROFILE_REQUIRED');
      });

      it('a student aboard a SCHOOL flight with no matching groupBy row defaults to 0 minutes', async () => {
        personFindMany.mockResolvedValue([
          { id: 'instructor_a', firstName: 'Ines', lastName: 'Istruttrice', instructorProfile: { id: 'profile_a' } },
        ]);
        flightGroupBy.mockResolvedValue([]);

        const result = await getInstructorHourSummaries(staffActor(), { from: '2026-01-01', to: '2026-01-31' });

        expect(result[0]?.minutes).toBe(0);
      });

      it('period bounds are inclusive date-only via parseDateOnlyUtc, flightType SCHOOL, CANCELLED excluded', async () => {
        personFindMany.mockResolvedValue([
          { id: 'instructor_a', firstName: 'Ines', lastName: 'Istruttrice', instructorProfile: { id: 'profile_a' } },
        ]);
        flightGroupBy.mockResolvedValue([]);

        await getInstructorHourSummaries(staffActor(), { from: '2026-02-01', to: '2026-02-28' });

        expect(flightGroupByMock).toHaveBeenCalledWith(
          expect.objectContaining({
            by: ['instructorProfileId'],
            where: {
              instructorProfileId: { in: ['profile_a'] },
              flightType: 'SCHOOL',
              status: { not: 'CANCELLED' },
              flightDate: { gte: parseDateOnlyUtc('2026-02-01'), lte: parseDateOnlyUtc('2026-02-28') },
            },
          }),
        );
      });
    });
  });

  describe('training notes (story 9.2, FR-33)', () => {
    const ASSIGNED_STUDENT_PROFILE = { id: 'assignment_1' };
    const SCHOOL_FLIGHT = { flightType: 'SCHOOL', personId: 'person_student' };
    const NOTE_FIXTURE = {
      id: 'note_1',
      noteDate: new Date('2026-07-05T00:00:00.000Z'),
      exercises: 'Circuiti, decolli e atterraggi',
      assessment: 'Buon controllo direzionale',
      nextSteps: 'Ripetere con vento al traverso',
      createdAt: new Date('2026-07-05T10:00:00.000Z'),
      updatedAt: new Date('2026-07-05T10:00:00.000Z'),
      instructorProfile: { person: { id: 'person_instructor', firstName: 'Ines', lastName: 'Istruttrice' } },
      flight: null,
    };

    function studentActor(personId = 'person_student'): Actor {
      return { userId: 'student_user_1', personId, roles: ['STUDENT'] };
    }
    function adminActor(personId: string | null = null): Actor {
      return { userId: 'admin_1', personId, roles: ['ADMIN'] };
    }

    describe('createTrainingNote (AC 1)', () => {
      it('rejects staff, pilot and student — none hold school.manage.own (staff has .any, never .own: "staff non crea")', async () => {
        await expect(createTrainingNote(staffActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x' })).rejects.toThrow(
          ForbiddenError,
        );
        await expect(createTrainingNote(pilotActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x' })).rejects.toThrow(
          ForbiddenError,
        );
        await expect(createTrainingNote(studentActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x' })).rejects.toThrow(
          ForbiddenError,
        );
        expect(personFindUniqueMock).not.toHaveBeenCalled();
      });

      it('throws ValidationError INSTRUCTOR_PROFILE_REQUIRED when the actor has no active instructor profile', async () => {
        instructorProfileFindUnique.mockResolvedValue(null);
        const error = await createTrainingNote(instructorActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x' }).catch(
          (e) => e,
        );
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as InstanceType<typeof ValidationError>).code).toBe('INSTRUCTOR_PROFILE_REQUIRED');
        expect(noteCreateMock).not.toHaveBeenCalled();
      });

      it('throws ForbiddenError when the instructor is not assigned to this student (AC 1)', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(null);

        await expect(createTrainingNote(instructorActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x' })).rejects.toThrow(
          ForbiddenError,
        );
        expect(noteCreateMock).not.toHaveBeenCalled();
      });

      it('throws ValidationError STUDENT_NOT_FOUND when the student profile is inactive', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(DEACTIVATED_STUDENT_PERSON);

        const error = await createTrainingNote(instructorActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x' }).catch(
          (e) => e,
        );
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as InstanceType<typeof ValidationError>).code).toBe('STUDENT_NOT_FOUND');
      });

      it('throws ValidationError FLIGHT_NOT_LINKABLE when the flight does not exist', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(ASSIGNED_STUDENT_PROFILE);
        flightFindUnique.mockResolvedValue(null);

        const error = await createTrainingNote(instructorActor(), 'person_student', {
          noteDate: '2026-07-05',
          exercises: 'x',
          flightId: 'flight_missing',
        }).catch((e) => e);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as InstanceType<typeof ValidationError>).code).toBe('FLIGHT_NOT_LINKABLE');
        expect(noteCreateMock).not.toHaveBeenCalled();
      });

      it('throws ValidationError FLIGHT_NOT_LINKABLE for a non-SCHOOL flight', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(ASSIGNED_STUDENT_PROFILE);
        flightFindUnique.mockResolvedValue({ flightType: 'TOURISM', personId: 'person_student' });

        await expect(
          createTrainingNote(instructorActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x', flightId: 'flight_1' }),
        ).rejects.toThrow(ValidationError);
      });

      it('throws ValidationError FLIGHT_NOT_LINKABLE for a SCHOOL flight of a DIFFERENT person', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(ASSIGNED_STUDENT_PROFILE);
        flightFindUnique.mockResolvedValue({ flightType: 'SCHOOL', personId: 'someone_else' });

        await expect(
          createTrainingNote(instructorActor(), 'person_student', { noteDate: '2026-07-05', exercises: 'x', flightId: 'flight_1' }),
        ).rejects.toThrow(ValidationError);
      });

      it('creates the note with author = the actor\'s own InstructorProfile and returns the mapped DTO', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(ASSIGNED_STUDENT_PROFILE);
        flightFindUnique.mockResolvedValue(SCHOOL_FLIGHT);
        noteCreate.mockResolvedValue({ ...NOTE_FIXTURE, flight: { id: 'flight_1', flightDate: new Date('2026-07-05T00:00:00.000Z'), minutes: 60 } });

        const result = await createTrainingNote(instructorActor(), 'person_student', {
          noteDate: '2026-07-05',
          exercises: 'Circuiti, decolli e atterraggi',
          assessment: 'Buon controllo direzionale',
          nextSteps: 'Ripetere con vento al traverso',
          flightId: 'flight_1',
        });

        expect(noteCreateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              studentProfileId: 'student_profile_1',
              instructorProfileId: 'instructor_profile_1',
              noteDate: new Date('2026-07-05T00:00:00.000Z'),
              flightId: 'flight_1',
              exercises: 'Circuiti, decolli e atterraggi',
              assessment: 'Buon controllo direzionale',
              nextSteps: 'Ripetere con vento al traverso',
            },
          }),
        );
        expect(result.author).toEqual({ personId: 'person_instructor', firstName: 'Ines', lastName: 'Istruttrice' });
        expect(result.flight).toEqual({ id: 'flight_1', flightDate: '2026-07-05', minutes: 60 });
      });
    });

    describe('listTrainingNotes (AC 2 — triple access)', () => {
      beforeEach(() => {
        mockInteractiveTransaction();
        noteFindMany.mockResolvedValue([NOTE_FIXTURE]);
        noteCountMock.mockResolvedValue(1);
      });

      it('school.manage.any (staff/admin) reads ANY student\'s diary', async () => {
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);

        const result = await listTrainingNotes(staffActor(), 'person_student', { page: 1, pageSize: 20 });

        expect(result.items).toHaveLength(1);
        expect(result.total).toBe(1);
      });

      it('422 STUDENT_NOT_FOUND for school.manage.any on an inactive student profile', async () => {
        personFindUnique.mockResolvedValue(DEACTIVATED_STUDENT_PERSON);
        await expect(listTrainingNotes(staffActor(), 'person_student', { page: 1, pageSize: 20 })).rejects.toThrow(ValidationError);
      });

      it('own-access: the student reads their OWN diary, even with a deactivated profile', async () => {
        personFindUnique.mockResolvedValue({ studentProfile: { id: 'student_profile_1' } });

        const result = await listTrainingNotes(studentActor('person_student'), 'person_student', { page: 1, pageSize: 20 });
        expect(result.items).toHaveLength(1);
      });

      it('own-access without any student profile: diary-appropriate 404, not the unassign message (review 9.2 N1)', async () => {
        personFindUnique.mockResolvedValue({ studentProfile: null });

        const error = await listTrainingNotes(pilotActor(), 'person_pilot', { page: 1, pageSize: 20 }).catch((e) => e);
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as Error).message).toBe('Training diary not found.');
      });

      it('403 for a student reading ANOTHER student\'s diary', async () => {
        await expect(listTrainingNotes(studentActor('person_student_A'), 'person_student_B', { page: 1, pageSize: 20 })).rejects.toThrow(
          ForbiddenError,
        );
        expect(personFindUniqueMock).not.toHaveBeenCalled();
      });

      it('403 for a pilot with no relation to this student', async () => {
        await expect(listTrainingNotes(pilotActor(), 'person_student', { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      });

      it('an ASSIGNED instructor reads the FULL diary (every author\'s entries)', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(ASSIGNED_STUDENT_PROFILE);

        const result = await listTrainingNotes(instructorActor(), 'person_student', { page: 1, pageSize: 20 });
        expect(result.items).toHaveLength(1);
      });

      it('403 for a NON-assigned instructor', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(null);

        await expect(listTrainingNotes(instructorActor(), 'person_student', { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      });
    });

    describe('updateTrainingNote (AC 3 — author/admin, 7-day window)', () => {
      const SELECTED_NOTE = {
        instructorProfileId: 'instructor_profile_1',
        createdAt: new Date('2026-07-05T10:00:00.000Z'),
        studentProfile: { person: { id: 'person_student' } },
      };

      it('404 when the note does not exist', async () => {
        noteFindUnique.mockResolvedValue(null);
        await expect(
          updateTrainingNote(instructorActor(), 'person_student', 'note_missing', { noteDate: '2026-07-05', exercises: 'x' }),
        ).rejects.toThrow(NotFoundError);
      });

      it('404 when the note belongs to a DIFFERENT student than the route param', async () => {
        noteFindUnique.mockResolvedValue({ ...SELECTED_NOTE, studentProfile: { person: { id: 'someone_else' } } });
        await expect(
          updateTrainingNote(instructorActor(), 'person_student', 'note_1', { noteDate: '2026-07-05', exercises: 'x' }),
        ).rejects.toThrow(NotFoundError);
      });

      it('403 for an instructor who is NOT the author, even if otherwise assigned', async () => {
        noteFindUnique.mockResolvedValue(SELECTED_NOTE);
        instructorProfileFindUnique.mockResolvedValue({ id: 'a_different_instructor_profile' });

        await expect(
          updateTrainingNote(instructorActor(), 'person_student', 'note_1', { noteDate: '2026-07-05', exercises: 'x' }),
        ).rejects.toThrow(ForbiddenError);
        expect(noteUpdateMock).not.toHaveBeenCalled();
      });

      it('403 for staff (holds school.manage.any, never .own — never an author)', async () => {
        noteFindUnique.mockResolvedValue(SELECTED_NOTE);
        await expect(
          updateTrainingNote(staffActor(), 'person_student', 'note_1', { noteDate: '2026-07-05', exercises: 'x' }),
        ).rejects.toThrow(ForbiddenError);
      });

      it('the AUTHOR edits successfully within the 7-day window', async () => {
        noteFindUnique.mockResolvedValue({ ...SELECTED_NOTE, createdAt: new Date(Date.now() - 60_000) });
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1' });
        noteUpdate.mockResolvedValue(NOTE_FIXTURE);

        const result = await updateTrainingNote(instructorActor(), 'person_student', 'note_1', {
          noteDate: '2026-07-06',
          exercises: 'Aggiornato',
        });

        expect(noteUpdateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'note_1' },
            data: expect.objectContaining({ exercises: 'Aggiornato', flightId: null, assessment: null, nextSteps: null }),
          }),
        );
        expect(result.id).toBe(NOTE_FIXTURE.id);
      });

      it('409 NOTE_IMMUTABLE for the AUTHOR past the 7-day window', async () => {
        noteFindUnique.mockResolvedValue({ ...SELECTED_NOTE, createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1' });

        const error = await updateTrainingNote(instructorActor(), 'person_student', 'note_1', {
          noteDate: '2026-07-06',
          exercises: 'x',
        }).catch((e) => e);
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as InstanceType<typeof ConflictError>).code).toBe('NOTE_IMMUTABLE');
        expect(noteUpdateMock).not.toHaveBeenCalled();
      });

      it('409 NOTE_IMMUTABLE for the ADMIN override past the 7-day window too ("per CHIUNQUE, admin incluso")', async () => {
        noteFindUnique.mockResolvedValue({ ...SELECTED_NOTE, createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });

        const error = await updateTrainingNote(adminActor(), 'person_student', 'note_1', { noteDate: '2026-07-06', exercises: 'x' }).catch(
          (e) => e,
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as InstanceType<typeof ConflictError>).code).toBe('NOTE_IMMUTABLE');
      });

      it('the ADMIN override edits a note authored by someone else, within the window', async () => {
        noteFindUnique.mockResolvedValue({ ...SELECTED_NOTE, createdAt: new Date(Date.now() - 60_000) });
        noteUpdate.mockResolvedValue(NOTE_FIXTURE);

        await updateTrainingNote(adminActor(), 'person_student', 'note_1', { noteDate: '2026-07-06', exercises: 'x' });

        expect(noteUpdateMock).toHaveBeenCalled();
        // The admin override never needs to resolve its OWN instructor profile.
        expect(instructorProfileFindUniqueMock).not.toHaveBeenCalled();
      });

      it('re-validates a changed flightId (422 FLIGHT_NOT_LINKABLE)', async () => {
        noteFindUnique.mockResolvedValue({ ...SELECTED_NOTE, createdAt: new Date(Date.now() - 60_000) });
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1' });
        flightFindUnique.mockResolvedValue(null);

        await expect(
          updateTrainingNote(instructorActor(), 'person_student', 'note_1', {
            noteDate: '2026-07-06',
            exercises: 'x',
            flightId: 'flight_missing',
          }),
        ).rejects.toThrow(ValidationError);
        expect(noteUpdateMock).not.toHaveBeenCalled();
      });
    });

    describe('listStudentSchoolFlights (page-only helper for the new-note form)', () => {
      it('rejects a non-assigned instructor', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(null);

        await expect(listStudentSchoolFlights(instructorActor(), 'person_student')).rejects.toThrow(ForbiddenError);
        expect(flightFindManyMock).not.toHaveBeenCalled();
      });

      it('returns the SCHOOL flights of the assigned student, most recent first', async () => {
        instructorProfileFindUnique.mockResolvedValue({ id: 'instructor_profile_1', deactivatedAt: null });
        personFindUnique.mockResolvedValue(ACTIVE_STUDENT_PERSON);
        assignmentFindUnique.mockResolvedValue(ASSIGNED_STUDENT_PROFILE);
        flightFindMany.mockResolvedValue([{ id: 'flight_1', flightDate: new Date('2026-07-01T00:00:00.000Z'), minutes: 60 }]);

        const result = await listStudentSchoolFlights(instructorActor(), 'person_student');

        expect(flightFindManyMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { personId: 'person_student', flightType: 'SCHOOL' } }),
        );
        expect(result).toEqual([{ id: 'flight_1', flightDate: '2026-07-01', minutes: 60 }]);
      });
    });
  });
});
