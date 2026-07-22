import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError, ValidationError } from './errors';

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
      findMany: vi.fn(),
    },
    // Story 12.6, AC 1: `listPilotsPageData`'s three batched enrichment reads.
    accountMovement: {
      groupBy: vi.fn(),
    },
    flight: {
      groupBy: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      // Story 13.1: the one-step composite's `access` block (pre-check + `createUserCore`'s write inside the transaction).
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // Story 13.1: the one-step composite's `expiries` block.
    expiryType: {
      findMany: vi.fn(),
    },
    expiry: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Story 13.1: `createPerson`'s `access` block sends the invite email via the
// REAL `sendInviteEmail` (only this one call is mocked out — `createUserCore`
// itself is the real function from `users.service.ts`, running against the
// same fake `prisma` above).
vi.mock('./auth-tokens.service', () => ({
  sendInviteEmail: vi.fn(),
}));

const { prisma } = await import('@/server/db/prisma');
const { sendInviteEmail } = await import('./auth-tokens.service');
const {
  archivePerson,
  createPerson,
  deactivateProfile,
  getPerson,
  listPeople,
  listPilotsPageData,
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
const accountFindManyMock = vi.mocked(prisma.account.findMany);
const accountMovementGroupByMock = vi.mocked(prisma.accountMovement.groupBy);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const userFindManyMock = vi.mocked(prisma.user.findMany);
const userCountMock = vi.mocked(prisma.user.count);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const userCreateMock = vi.mocked(prisma.user.create);
const expiryTypeFindManyMock = vi.mocked(prisma.expiryType.findMany);
const expiryCreateMock = vi.mocked(prisma.expiry.create);
const sendInviteEmailMock = vi.mocked(sendInviteEmail);

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
const accountFindMany = accountFindManyMock as unknown as { mockResolvedValue: (v: PersonFixture[]) => void };
const accountMovementGroupBy = accountMovementGroupByMock as unknown as { mockResolvedValue: (v: PersonFixture[]) => void };
const flightGroupBy = flightGroupByMock as unknown as { mockResolvedValue: (v: PersonFixture[]) => void };
const userFindMany = userFindManyMock as unknown as { mockResolvedValue: (v: PersonFixture[]) => void };
const userCount = userCountMock as unknown as { mockResolvedValue: (v: number) => void };
const userFindUnique = userFindUniqueMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const userCreate = userCreateMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const expiryTypeFindMany = expiryTypeFindManyMock as unknown as { mockResolvedValue: (v: PersonFixture[]) => void };
const expiryCreate = expiryCreateMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

/** `people.manage` AND `users.manage` (STAFF only has the former) — needed for the composite create's `access` block. */
function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
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
    accountFindManyMock.mockReset();
    accountMovementGroupByMock.mockReset();
    flightGroupByMock.mockReset();
    userFindManyMock.mockReset();
    userCountMock.mockReset();
    userFindUniqueMock.mockReset();
    userCreateMock.mockReset();
    expiryTypeFindManyMock.mockReset();
    expiryCreateMock.mockReset();
    sendInviteEmailMock.mockReset();

    // Story 3.1 (interactive-callback form since story TD-1, AC 3):
    // `upsertProfile`'s pilot/student branches run their profile upsert
    // alongside the Account upsert inside ONE `$transaction(async (tx) =>
    // ...)` — this generic stand-in handles BOTH the interactive-callback
    // form (invokes the callback with the plain `prisma` mock as `tx`) and a
    // legacy batch-array argument (`Promise.all`), same rationale as
    // `mockTransaction` in `cash.service.test.ts`.
    // Per-test `transaction.mockResolvedValue(...)` calls (e.g. `listPeople`'s
    // `[items, total]`) still override this default outright (they don't
    // inspect the argument at all), since they run later in the same test.
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
      // Interactive-callback transaction (story TD-1, AC 3): the generic
      // `beforeEach` `mockImplementation` invokes the callback with `prisma`
      // as `tx`, so `findMany`/`count` must resolve on their OWN mocks now —
      // a per-test `transaction.mockResolvedValue(...)` override would skip
      // invoking the callback entirely (never calling `findMany`).
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      // Story TD-3: `where` is now an `AND` array of the conditions that
      // apply (combinable `q`/`profile`, see `people.service.ts`) — assert
      // against the array's contents rather than top-level keys.
      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({ archivedAt: null });
    });

    it('includes archived persons when includeArchived is true (AC 2)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND?: Record<string, unknown>[] } };
      expect(findManyCall.where.AND ?? []).not.toContainEqual({ archivedAt: null });
    });

    it('searches first name, last name and email case-insensitively (AC 1)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'maria' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({
        OR: [
          { firstName: { contains: 'maria', mode: 'insensitive' } },
          { lastName: { contains: 'maria', mode: 'insensitive' } },
          { email: { contains: 'maria', mode: 'insensitive' } },
        ],
      });
    });

    it('combines q and profile as separate AND conditions, never colliding on the OR key (AC 1/3, story TD-3)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'zz', profile: 'pilot-or-student' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({
        OR: [
          { firstName: { contains: 'zz', mode: 'insensitive' } },
          { lastName: { contains: 'zz', mode: 'insensitive' } },
          { email: { contains: 'zz', mode: 'insensitive' } },
        ],
      });
      expect(findManyCall.where.AND).toContainEqual({
        OR: [{ pilotProfile: { deactivatedAt: null } }, { studentProfile: { deactivatedAt: null } }],
      });
    });

    it('profile: pilot-or-student filters to an active pilot or student profile (AC 3, story TD-3)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false, profile: 'pilot-or-student' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({
        OR: [{ pilotProfile: { deactivatedAt: null } }, { studentProfile: { deactivatedAt: null } }],
      });
    });

    it('profile: instructor filters to an active instructor profile (AC 3, story TD-3)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false, profile: 'instructor' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({ instructorProfile: { deactivatedAt: null } });
    });

    it('no profile filter (filter-bar usage) leaves the where clause unrestricted by profile (AC 3, story TD-3)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND?: Record<string, unknown>[] } };
      expect(findManyCall.where).toEqual({});
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

  describe('createPerson — one-step composite (story 13.1, AC 5/7)', () => {
    const input = { firstName: 'Maria', lastName: 'Bianchi' };

    it('with none of profiles/expiries/access: behaves exactly like the pre-13.1 create (retro-compatibility) — no new-block queries at all', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);

      await createPerson(staffActor(), input);

      expect(expiryTypeFindManyMock).not.toHaveBeenCalled();
      expect(userFindUniqueMock).not.toHaveBeenCalled();
      expect(userCreateMock).not.toHaveBeenCalled();
      expect(sendInviteEmailMock).not.toHaveBeenCalled();
    });

    it('activates pilot+student+instructor, registers an expiry per profile scope, and creates+invites the linked user — all in ONE $transaction, invite sent only AFTER it resolves', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);
      pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });
      studentProfileUpsert.mockResolvedValue({ courseStartDate: new Date('2026-01-01'), deactivatedAt: null });
      instructorProfileUpsert.mockResolvedValue({ deactivatedAt: null });
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_pilot', scope: 'PILOTS', isActive: true }]);
      expiryCreate.mockResolvedValue({ id: 'expiry_1' });
      userFindUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({ id: 'user_1', email: 'maria@airmanager.local', locale: 'it' });
      sendInviteEmailMock.mockResolvedValue(undefined);

      const result = await createPerson(adminActor(), {
        ...input,
        profiles: {
          pilot: { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' },
          student: { courseStartDate: '2026-01-01' },
          instructor: {},
        },
        expiries: [{ expiryTypeId: 'et_pilot', expiresAt: '2027-01-01' }],
        access: { email: 'maria@airmanager.local', roles: ['PILOT'] },
      });

      // Every write shares the SAME transaction (AC 5: atomic).
      expect(transactionMock).toHaveBeenCalledTimes(1);

      expect(pilotProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1' } }));
      expect(studentProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1' } }));
      expect(instructorProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1' } }));
      expect(expiryCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ personId: 'person_1', expiryTypeId: 'et_pilot', actorUserId: 'admin_1' }) }),
      );
      expect(userCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'maria@airmanager.local', roles: ['PILOT'], personId: 'person_1' }) }),
      );

      // The invite is sent AFTER the transaction resolves (fire-and-forget), never inside it.
      expect(sendInviteEmailMock).toHaveBeenCalledWith('user_1', 'maria@airmanager.local', 'it');

      expect(result.profiles).toEqual({ pilot: true, student: true, instructor: true });
    });

    it('access without users.manage → 403, before any read/write (the block is never silently dropped)', async () => {
      await expect(
        createPerson(staffActor(), { ...input, access: { email: 'maria@airmanager.local', roles: ['PILOT'] } }),
      ).rejects.toThrow(ForbiddenError);

      expect(findFirstMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('access.email already taken by another user → ConflictError, before the transaction opens', async () => {
      personFindFirst.mockResolvedValue(null);
      userFindUnique.mockResolvedValue({ id: 'existing_user' });

      await expect(
        createPerson(adminActor(), { ...input, access: { email: 'maria@airmanager.local', roles: ['PILOT'] } }),
      ).rejects.toThrow(ConflictError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('an unknown expiryTypeId → 422 ValidationError, before the transaction opens', async () => {
      personFindFirst.mockResolvedValue(null);
      expiryTypeFindMany.mockResolvedValue([]); // nothing matches

      await expect(
        createPerson(staffActor(), { ...input, expiries: [{ expiryTypeId: 'et_ghost', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow(ValidationError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('a deactivated expiry type → 422 ValidationError', async () => {
      personFindFirst.mockResolvedValue(null);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_1', scope: 'ALL', isActive: false }]);

      await expect(
        createPerson(staffActor(), { ...input, expiries: [{ expiryTypeId: 'et_1', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow(ValidationError);
    });

    it('a scope not matched by any activated profile → 422 ValidationError (PILOTS type, no pilot profile in this call)', async () => {
      personFindFirst.mockResolvedValue(null);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_pilot', scope: 'PILOTS', isActive: true }]);

      await expect(
        createPerson(staffActor(), { ...input, expiries: [{ expiryTypeId: 'et_pilot', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow(ValidationError);
    });

    it('atomicity: a failure INSIDE the shared transaction (e.g. the expiry write) propagates and the invite is NEVER sent', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_1', scope: 'ALL', isActive: true }]);
      expiryCreateMock.mockRejectedValue(new Error('db unavailable'));

      await expect(
        createPerson(staffActor(), { ...input, expiries: [{ expiryTypeId: 'et_1', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow('db unavailable');

      expect(sendInviteEmailMock).not.toHaveBeenCalled();
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

    it('upserts (activates/reactivates) the instructor profile — no own field left (story 13.1, R-13.1-b)', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      instructorProfileUpsert.mockResolvedValue({ deactivatedAt: null });

      const result = await upsertProfile(staffActor(), 'person_1', 'instructor', {});

      expect(instructorProfileUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { personId: 'person_1' },
          create: { personId: 'person_1' },
          update: { deactivatedAt: null },
        }),
      );
      expect(result).toEqual({ deactivatedAt: null });
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
        instructorProfileUpsert.mockResolvedValue({ deactivatedAt: null });

        await upsertProfile(staffActor(), 'person_1', 'instructor', {});

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

  describe('listPilotsPageData (story 12.6, AC 1 — batched saldo/ultimo volo/stato utente)', () => {
    const PERSON_A = { ...SELECTED_PERSON, id: 'person_a', firstName: 'Anna', lastName: 'Alfa' };
    const PERSON_B = { ...SELECTED_PERSON, id: 'person_b', firstName: 'Bruno', lastName: 'Beta' };

    it('rejects an actor without people.read (delegates authorization to listPeople)', async () => {
      await expect(listPilotsPageData(pilotActor(), { page: 1, pageSize: 20, includeArchived: false })).rejects.toThrow(
        ForbiddenError,
      );
      expect(accountFindManyMock).not.toHaveBeenCalled();
    });

    it('enriches a multi-person page with batched balance/last-flight/user-status reads, never a per-row query', async () => {
      transaction.mockResolvedValue([[PERSON_A, PERSON_B], 2]);
      accountFindMany.mockResolvedValue([
        { id: 'account_a', personId: 'person_a' },
        // person_b never activated a pilot/student profile — no Account row.
      ]);
      accountMovementGroupBy.mockResolvedValue([{ accountId: 'account_a', _sum: { amountCents: -1500 } }]);
      flightGroupBy.mockResolvedValue([{ personId: 'person_a', _max: { flightDate: new Date('2026-02-10T00:00:00.000Z') } }]);
      userFindMany.mockResolvedValue([
        { id: 'user_a', personId: 'person_a', email: 'anna@airmanager.local', roles: ['PILOT'], isActive: true, passwordHash: 'x' },
        // person_b has no linked user at all.
      ]);
      userCount.mockResolvedValue(0);

      const result = await listPilotsPageData(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result.items).toEqual([
        expect.objectContaining({
          id: 'person_a',
          balanceCents: -1500,
          lastFlightDate: '2026-02-10',
          user: { id: 'user_a', email: 'anna@airmanager.local', roles: ['PILOT'], isActive: true, passwordSet: true },
        }),
        expect.objectContaining({
          id: 'person_b',
          balanceCents: 0,
          lastFlightDate: null,
          user: null,
        }),
      ]);
      expect(result.total).toBe(2);

      // Batched: exactly ONE call per enrichment kind for the whole page —
      // never one call per person (that would be N+1, the thing AC 1 forbids).
      expect(accountFindManyMock).toHaveBeenCalledTimes(1);
      expect(accountFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personId: { in: ['person_a', 'person_b'] } } }),
      );
      expect(accountMovementGroupByMock).toHaveBeenCalledTimes(1);
      expect(accountMovementGroupByMock).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['accountId'], where: { accountId: { in: ['account_a'] } }, _sum: { amountCents: true } }),
      );
      expect(flightGroupByMock).toHaveBeenCalledTimes(1);
      expect(flightGroupByMock).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['personId'],
          where: { personId: { in: ['person_a', 'person_b'] }, status: 'REGISTERED' },
          _max: { flightDate: true },
        }),
      );
      expect(userFindManyMock).toHaveBeenCalledTimes(1);
    });

    it('reports fleet-wide (unfiltered) totalCount/suspendedCount headline stats alongside the filtered page', async () => {
      transaction.mockResolvedValue([[PERSON_A], 1]);
      accountFindMany.mockResolvedValue([]);
      flightGroupBy.mockResolvedValue([]);
      userFindMany.mockResolvedValue([]);
      countMock.mockResolvedValue(42);
      userCount.mockResolvedValue(3);

      const result = await listPilotsPageData(staffActor(), { page: 1, pageSize: 20, q: 'Alfa', includeArchived: false });

      expect(result.totalCount).toBe(42);
      expect(result.suspendedCount).toBe(3);
      expect(countMock).toHaveBeenCalledWith({ where: { archivedAt: null } });
      expect(userCountMock).toHaveBeenCalledWith({ where: { isActive: false, person: { archivedAt: null } } });
    });

    it('skips every enrichment query when the page is empty', async () => {
      transaction.mockResolvedValue([[], 0]);
      countMock.mockResolvedValue(0);
      userCount.mockResolvedValue(0);

      const result = await listPilotsPageData(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result.items).toEqual([]);
      expect(accountFindManyMock).not.toHaveBeenCalled();
      expect(flightGroupByMock).not.toHaveBeenCalled();
      expect(userFindManyMock).not.toHaveBeenCalled();
    });
  });
});
