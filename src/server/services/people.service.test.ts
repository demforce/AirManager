import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pilotProfile: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    studentProfile: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    instructorProfile: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    account: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  archivePerson,
  createPerson,
  deactivateProfile,
  getPerson,
  listPeople,
  unarchivePerson,
  updatePerson,
  upsertProfile,
} = await import('./people.service');
const { ConflictError, NotFoundError } = await import('./errors');

const findUniqueMock = vi.mocked(prisma.person.findUnique);
const findFirstMock = vi.mocked(prisma.person.findFirst);
const findManyMock = vi.mocked(prisma.person.findMany);
const countMock = vi.mocked(prisma.person.count);
const createMock = vi.mocked(prisma.person.create);
const updateMock = vi.mocked(prisma.person.update);
const transactionMock = vi.mocked(prisma.$transaction);
const pilotProfileUpsertMock = vi.mocked(prisma.pilotProfile.upsert);
const pilotProfileUpdateManyMock = vi.mocked(prisma.pilotProfile.updateMany);
const studentProfileUpsertMock = vi.mocked(prisma.studentProfile.upsert);
const studentProfileUpdateManyMock = vi.mocked(prisma.studentProfile.updateMany);
const instructorProfileUpsertMock = vi.mocked(prisma.instructorProfile.upsert);
const instructorProfileUpdateManyMock = vi.mocked(prisma.instructorProfile.updateMany);
const accountUpsertMock = vi.mocked(prisma.account.upsert);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as users.service.test.ts): narrow each
// mock to the shapes this service actually reads.
type PersonFixture = Record<string, unknown> | null;
const personFindUnique = findUniqueMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const personFindFirst = findFirstMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const personCreate = createMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const personUpdate = updateMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const transaction = transactionMock as unknown as { mockResolvedValue: (v: unknown) => void };
const pilotProfileUpsert = pilotProfileUpsertMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const studentProfileUpsert = studentProfileUpsertMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const instructorProfileUpsert = instructorProfileUpsertMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
type UpdateManyFixture = { count: number };
const pilotProfileUpdateMany = pilotProfileUpdateManyMock as unknown as {
  mockResolvedValue: (v: UpdateManyFixture) => void;
};
const studentProfileUpdateMany = studentProfileUpdateManyMock as unknown as {
  mockResolvedValue: (v: UpdateManyFixture) => void;
};
const instructorProfileUpdateMany = instructorProfileUpdateManyMock as unknown as {
  mockResolvedValue: (v: UpdateManyFixture) => void;
};
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

/** No role at all (e.g. a stale JWT carrying a role removed from `ROLE_PERMISSIONS`) — fails closed to zero permissions. */
function noRoleActor(): Actor {
  return { userId: 'ghost_1', personId: null, roles: [] };
}

const SELECTED_PERSON = {
  id: 'person_1',
  firstName: 'Maria',
  lastName: 'Bianchi',
  email: 'maria.bianchi@airmanager.local',
  phone: '+39 333 1234567',
  address: 'Via Roma 1, Torino',
  fiscalCode: 'BNCMRA80A01L219K',
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  // Story 2.2: `toListItem` derives the active-profile flags from these
  // 1-to-0/1 relations — `null` = never activated.
  pilotProfile: null,
  studentProfile: null,
  instructorProfile: null,
};

describe('people.service (story 2.1 — people.read/people.manage RBAC + CRUD/archiving)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    findManyMock.mockReset();
    countMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    transactionMock.mockReset();
    pilotProfileUpsertMock.mockReset();
    pilotProfileUpdateManyMock.mockReset();
    studentProfileUpsertMock.mockReset();
    studentProfileUpdateManyMock.mockReset();
    instructorProfileUpsertMock.mockReset();
    instructorProfileUpdateManyMock.mockReset();
    accountUpsertMock.mockReset();

    // Story 3.1: `upsertProfile`'s pilot/student branches now run their
    // profile upsert alongside the Account upsert inside `$transaction([...])`
    // (the batch/array overload, not the interactive-callback one aircraft
    // uses) — a faithful stand-in just awaits every already-invoked mock
    // call, same rationale as `mockInteractiveTransaction` in
    // aircraft.service.test.ts. Per-test `transaction.mockResolvedValue(...)`
    // calls (e.g. `listPeople`'s `[items, total]`) still override this
    // default, since they run later in the same test.
    (transaction as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void }).mockImplementation(
      (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])),
    );
  });

  describe('authorization (AD-5, AC 3)', () => {
    it('listPeople rejects an actor without people.read', async () => {
      await expect(listPeople(pilotActor(), { page: 1, pageSize: 20, includeArchived: false })).rejects.toThrow(
        ForbiddenError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('getPerson rejects an actor without people.read', async () => {
      await expect(getPerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
    });

    it('createPerson rejects an actor without people.manage', async () => {
      await expect(
        createPerson(pilotActor(), { firstName: 'X', lastName: 'Y', email: null, phone: null, address: null, fiscalCode: null }),
      ).rejects.toThrow(ForbiddenError);
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('updatePerson rejects an actor without people.manage', async () => {
      await expect(updatePerson(pilotActor(), 'person_1', { firstName: 'X' })).rejects.toThrow(ForbiddenError);
    });

    it('archivePerson rejects an actor without people.manage', async () => {
      await expect(archivePerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
    });

    it('unarchivePerson rejects an actor without people.manage', async () => {
      await expect(unarchivePerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
    });

    it('upsertProfile rejects an actor without people.manage (story 2.2, AC 3)', async () => {
      await expect(
        upsertProfile(pilotActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' }),
      ).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
      expect(pilotProfileUpsertMock).not.toHaveBeenCalled();
    });

    it('deactivateProfile rejects an actor without people.manage (story 2.2, AC 3)', async () => {
      await expect(deactivateProfile(pilotActor(), 'person_1', 'pilot')).rejects.toThrow(ForbiddenError);
      expect(pilotProfileUpdateManyMock).not.toHaveBeenCalled();
    });
  });

  describe('listPeople', () => {
    it('returns the AD-8 paginated shape', async () => {
      transaction.mockResolvedValue([[SELECTED_PERSON], 1]);

      const result = await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result).toEqual({
        items: [
          {
            id: 'person_1',
            firstName: 'Maria',
            lastName: 'Bianchi',
            email: 'maria.bianchi@airmanager.local',
            phone: '+39 333 1234567',
            address: 'Via Roma 1, Torino',
            fiscalCode: 'BNCMRA80A01L219K',
            archivedAt: null,
            createdAt: SELECTED_PERSON.createdAt,
            profiles: { pilot: false, student: false, instructor: false },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('flags a profile as active only when it exists with deactivatedAt null (story 2.2, AC 1)', async () => {
      transaction.mockResolvedValue([
        [
          {
            ...SELECTED_PERSON,
            pilotProfile: { deactivatedAt: null },
            studentProfile: { deactivatedAt: new Date('2026-03-01T00:00:00.000Z') },
            instructorProfile: null,
          },
        ],
        1,
      ]);

      const result = await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result.items[0]?.profiles).toEqual({ pilot: true, student: false, instructor: false });
    });

    it('excludes archived persons by default (AC 2)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({ archivedAt: null });
    });

    it('includes archived persons when includeArchived is true (AC 2)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).not.toHaveProperty('archivedAt');
    });

    it('searches first name, last name and email case-insensitively (AC 1)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'maria' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({
        OR: [
          { firstName: { contains: 'maria', mode: 'insensitive' } },
          { lastName: { contains: 'maria', mode: 'insensitive' } },
          { email: { contains: 'maria', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('getPerson', () => {
    it('throws NotFoundError for a missing id', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(getPerson(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('returns the mapped person', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      const result = await getPerson(staffActor(), 'person_1');
      expect(result.id).toBe('person_1');
      expect(result.pilotProfile).toBeNull();
      expect(result.studentProfile).toBeNull();
      expect(result.instructorProfile).toBeNull();
    });

    it('includes full profile data with people.read alone (story 2.2, AC 1)', async () => {
      personFindUnique.mockResolvedValue({
        ...SELECTED_PERSON,
        pilotProfile: { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null },
        studentProfile: {
          courseStartDate: new Date('2026-03-01T00:00:00.000Z'),
          deactivatedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
        instructorProfile: null,
      });

      const result = await getPerson(staffActor(), 'person_1');

      expect(result.pilotProfile).toEqual({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });
      // `courseStartDate` is a calendar date on the wire — `YYYY-MM-DD`, never a datetime.
      expect(result.studentProfile).toEqual({
        courseStartDate: '2026-03-01',
        deactivatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      expect(result.instructorProfile).toBeNull();
      expect(result.profiles).toEqual({ pilot: true, student: false, instructor: false });
    });

    describe('own access (story 2.3, AC 2 — self.read + matching personId, scoped in the service)', () => {
      it('lets a pilot read their own person record', async () => {
        personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, id: 'person_pilot' });

        const result = await getPerson(pilotActor(), 'person_pilot');

        expect(result.id).toBe('person_pilot');
      });

      it('rejects a pilot reading someone else’s person record', async () => {
        await expect(getPerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
        expect(findUniqueMock).not.toHaveBeenCalled();
      });

      it('rejects a pilot with no linked person (personId: null)', async () => {
        const actor: Actor = { userId: 'pilot_no_person', personId: null, roles: ['PILOT'] };

        await expect(getPerson(actor, 'person_1')).rejects.toThrow(ForbiddenError);
        expect(findUniqueMock).not.toHaveBeenCalled();
      });

      it('rejects an actor with neither self.read nor people.read (stale/unknown role)', async () => {
        await expect(getPerson(noRoleActor(), 'person_1')).rejects.toThrow(ForbiddenError);
        expect(findUniqueMock).not.toHaveBeenCalled();
      });
    });
  });

  describe('createPerson', () => {
    const input = {
      firstName: 'Maria',
      lastName: 'Bianchi',
      email: 'maria.bianchi@airmanager.local',
      phone: '+39 333 1234567',
      address: 'Via Roma 1, Torino',
      fiscalCode: 'BNCMRA80A01L219K',
    };

    it('creates the person (AC 1)', async () => {
      personFindFirst.mockResolvedValue(null); // no existing conflict
      personCreate.mockResolvedValue(SELECTED_PERSON);

      const result = await createPerson(staffActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ firstName: 'Maria', lastName: 'Bianchi', email: input.email }),
        }),
      );
      expect(result.id).toBe('person_1');
    });

    it('throws ConflictError when the email is already taken', async () => {
      personFindFirst.mockResolvedValue({ id: 'other_person' });

      await expect(createPerson(staffActor(), input)).rejects.toThrow(ConflictError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the fiscal code is already taken', async () => {
      personFindFirst.mockResolvedValue({ id: 'other_person' });

      await expect(
        createPerson(staffActor(), { ...input, email: null, fiscalCode: 'BNCMRA80A01L219K' }),
      ).rejects.toThrow(ConflictError);
    });

    it('never conflicts when email and fiscalCode are both omitted', async () => {
      personCreate.mockResolvedValue({ ...SELECTED_PERSON, email: null, fiscalCode: null });

      await createPerson(staffActor(), { firstName: 'X', lastName: 'Y', email: null, phone: null, address: null, fiscalCode: null });

      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError', async () => {
      personFindFirst.mockResolvedValue(null);
      createMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(createPerson(staffActor(), input)).rejects.toThrow(ConflictError);
    });
  });

  describe('updatePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(updatePerson(staffActor(), 'missing', { firstName: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('updates only the provided fields', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, phone: '+39 333 7654321' });

      const result = await updatePerson(staffActor(), 'person_1', { phone: '+39 333 7654321' });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, data: { phone: '+39 333 7654321' } }),
      );
      expect(result.phone).toBe('+39 333 7654321');
    });

    it('allows clearing email (null) without a uniqueness check', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, email: null });

      await updatePerson(staffActor(), 'person_1', { email: null });

      expect(findFirstMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { email: null } }));
    });

    it('throws ConflictError when re-using an email already taken by another person', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personFindFirst.mockResolvedValue({ id: 'someone_else' });

      await expect(
        updatePerson(staffActor(), 'person_1', { email: 'taken@airmanager.local' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('archivePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(archivePerson(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when already archived', async () => {
      personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      await expect(archivePerson(staffActor(), 'person_1')).rejects.toThrow(ConflictError);
    });

    it('sets archivedAt (AC 2)', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });

      const result = await archivePerson(staffActor(), 'person_1');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, data: { archivedAt: expect.any(Date) } }),
      );
      expect(result.archivedAt).not.toBeNull();
    });
  });

  describe('unarchivePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(unarchivePerson(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when not archived', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      await expect(unarchivePerson(staffActor(), 'person_1')).rejects.toThrow(ConflictError);
    });

    it('clears archivedAt', async () => {
      personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: null });

      const result = await unarchivePerson(staffActor(), 'person_1');

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { archivedAt: null } }));
      expect(result.archivedAt).toBeNull();
    });
  });

  describe('upsertProfile (story 2.2, AC 1/2)', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(
        upsertProfile(staffActor(), 'missing', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' }),
      ).rejects.toThrow(NotFoundError);
      expect(pilotProfileUpsertMock).not.toHaveBeenCalled();
    });

    it('creates or updates+reactivates the pilot profile in one upsert', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });

      const result = await upsertProfile(staffActor(), 'person_1', 'pilot', {
        licenseNumber: 'IT-PPL-1',
        licenseType: 'PPL(A)',
      });

      expect(pilotProfileUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personId: 'person_1' },
          create: { personId: 'person_1', licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' },
          // Reactivation is part of the update path: `deactivatedAt` is always cleared (AC 2).
          update: { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null },
        }),
      );
      expect(result).toEqual({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });
    });

    it('stores the student courseStartDate as a Date and returns it as YYYY-MM-DD', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      studentProfileUpsert.mockResolvedValue({
        courseStartDate: new Date('2026-03-01T00:00:00.000Z'),
        deactivatedAt: null,
      });

      const result = await upsertProfile(staffActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' });

      expect(studentProfileUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personId: 'person_1' },
          create: { personId: 'person_1', courseStartDate: new Date('2026-03-01') },
          update: { courseStartDate: new Date('2026-03-01'), deactivatedAt: null },
        }),
      );
      expect(result).toEqual({ courseStartDate: '2026-03-01', deactivatedAt: null });
    });

    it('upserts the instructor profile with its free-text ratings', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      instructorProfileUpsert.mockResolvedValue({ ratings: 'SEP(land), FI(A)', deactivatedAt: null });

      const result = await upsertProfile(staffActor(), 'person_1', 'instructor', { ratings: 'SEP(land), FI(A)' });

      expect(instructorProfileUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personId: 'person_1' },
          create: { personId: 'person_1', ratings: 'SEP(land), FI(A)' },
          update: { ratings: 'SEP(land), FI(A)', deactivatedAt: null },
        }),
      );
      expect(result).toEqual({ ratings: 'SEP(land), FI(A)', deactivatedAt: null });
    });

    describe('Account creation on activation (story 3.1, AC 1, AD-11)', () => {
      it('upserts the Account alongside the pilot profile', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });

        await upsertProfile(staffActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' });

        expect(accountUpsertMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' } }),
        );
      });

      it('upserts the Account alongside the student profile', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        studentProfileUpsert.mockResolvedValue({ courseStartDate: new Date('2026-03-01'), deactivatedAt: null });

        await upsertProfile(staffActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' });

        expect(accountUpsertMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' } }),
        );
      });

      it('does NOT create an Account for the instructor profile', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        instructorProfileUpsert.mockResolvedValue({ ratings: 'SEP(land), FI(A)', deactivatedAt: null });

        await upsertProfile(staffActor(), 'person_1', 'instructor', { ratings: 'SEP(land), FI(A)' });

        expect(accountUpsertMock).not.toHaveBeenCalled();
      });

      it('reactivating an already-accounted person does not duplicate the account (idempotent upsert, AD-11 unique personId)', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });
        accountUpsert.mockResolvedValue({ id: 'account_1' });

        await upsertProfile(staffActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' });
        await upsertProfile(staffActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' });

        // Both calls are themselves upserts (create-if-missing / no-op
        // update) — the unique `personId` constraint is what actually
        // prevents a second row, this only asserts the call shape stays the
        // same idempotent upsert on every activation.
        expect(accountUpsertMock).toHaveBeenCalledTimes(2);
        expect(accountUpsertMock).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' }, update: {} }),
        );
        expect(accountUpsertMock).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' }, update: {} }),
        );
      });
    });
  });

  describe('deactivateProfile (story 2.2, AC 1/2)', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(deactivateProfile(staffActor(), 'missing', 'student')).rejects.toThrow(NotFoundError);
      expect(studentProfileUpdateManyMock).not.toHaveBeenCalled();
    });

    it('sets deactivatedAt on an active profile via a single guarded update (review 2.2 F1)', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      studentProfileUpdateMany.mockResolvedValue({ count: 1 });

      await deactivateProfile(staffActor(), 'person_1', 'student');

      // The `deactivatedAt: null` guard in the where is what makes concurrent
      // deactivations safe — exactly one of them can match the row.
      expect(studentProfileUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personId: 'person_1', deactivatedAt: null },
          data: { deactivatedAt: expect.any(Date) },
        }),
      );
    });

    it('throws ConflictError when the profile was never activated', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      instructorProfileUpdateMany.mockResolvedValue({ count: 0 });

      await expect(deactivateProfile(staffActor(), 'person_1', 'instructor')).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError when the profile is already deactivated (guarded update matches no row)', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      pilotProfileUpdateMany.mockResolvedValue({ count: 0 });

      await expect(deactivateProfile(staffActor(), 'person_1', 'pilot')).rejects.toThrow(ConflictError);
    });
  });

  describe('student → pilot transition (story 2.2, AC 2)', () => {
    it('deactivates the student profile and activates the pilot profile without ever touching Person', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      studentProfileUpdateMany.mockResolvedValue({ count: 1 });
      pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-9', licenseType: 'PPL(A)', deactivatedAt: null });

      await deactivateProfile(staffActor(), 'person_1', 'student');
      await upsertProfile(staffActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-9', licenseType: 'PPL(A)' });

      // Both operations address the same Person.id, and the transition never
      // creates/updates/deletes a Person row — the id (and its history/future
      // account, AD-11) survives untouched.
      expect(studentProfileUpdateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personId: 'person_1', deactivatedAt: null } }),
      );
      expect(pilotProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1' } }));
      expect(createMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
