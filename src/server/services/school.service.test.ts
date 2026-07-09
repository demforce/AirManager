import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: { findUnique: vi.fn() },
    instructorProfile: { findUnique: vi.fn() },
    studentInstructorAssignment: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    flight: { groupBy: vi.fn() },
    expiry: { findMany: vi.fn() },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { assignInstructor, listOwnStudents, listStudentInstructors, unassignInstructor } = await import('./school.service');
const { ConflictError, NotFoundError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const instructorProfileFindUniqueMock = vi.mocked(prisma.instructorProfile.findUnique);
const assignmentFindUniqueMock = vi.mocked(prisma.studentInstructorAssignment.findUnique);
const assignmentFindManyMock = vi.mocked(prisma.studentInstructorAssignment.findMany);
const assignmentCreateMock = vi.mocked(prisma.studentInstructorAssignment.create);
const assignmentDeleteMock = vi.mocked(prisma.studentInstructorAssignment.delete);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as instructor-rates.service.test.ts).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockResolvedValueOnce: (v: Fixture) => { mockResolvedValueOnce: (v: Fixture) => void };
};
const instructorProfileFindUnique = instructorProfileFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const assignmentFindUnique = assignmentFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const assignmentFindMany = assignmentFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const assignmentCreate = assignmentCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const assignmentDelete = assignmentDeleteMock as unknown as { mockResolvedValue: (v: undefined) => void };
const flightGroupBy = flightGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}
function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}
function instructorActor(personId: string | null = 'person_instructor'): Actor {
  return { userId: 'instructor_user_1', personId, roles: ['INSTRUCTOR'] };
}

const ACTIVE_STUDENT_PERSON = { studentProfile: { id: 'student_profile_1', deactivatedAt: null } };
const DEACTIVATED_STUDENT_PERSON = { studentProfile: { id: 'student_profile_1', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } };
const NO_STUDENT_PERSON = { studentProfile: null };
const ACTIVE_INSTRUCTOR_PERSON = { instructorProfile: { id: 'instructor_profile_1', deactivatedAt: null } };
const NO_INSTRUCTOR_PERSON = { instructorProfile: null };

const ASSIGNMENT_FIXTURE = {
  createdAt: new Date('2026-07-09T08:00:00.000Z'),
  instructorProfile: { person: { id: 'person_instructor', firstName: 'Ines', lastName: 'Istruttrice' } },
};

describe('school.service (story 9.1 — student-instructor assignment, FR-32)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
    instructorProfileFindUniqueMock.mockReset();
    assignmentFindUniqueMock.mockReset();
    assignmentFindManyMock.mockReset();
    assignmentCreateMock.mockReset();
    assignmentDeleteMock.mockReset();
    flightGroupByMock.mockReset();
    expiryFindManyMock.mockReset();
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
  });
});
