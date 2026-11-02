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
      // Story 19.4: the composite's pre-transaction read of the rows its `expiries.set` would create.
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    // Story 19.3 (AD-5): `upsertProfile`'s `Person` row lock.
    $queryRaw: vi.fn(),
  },
}));

// Story 13.1: `createPerson`'s `access` block sends the invite email via the
// REAL `sendInviteEmail` (only this one call is mocked out — `createUserCore`
// itself is the real function from `users.service.ts`, running against the
// same fake `prisma` above).
vi.mock('./auth-tokens.service', () => ({
  sendInviteEmail: vi.fn(),
}));

// Story 19.4 (AD-7, AC 9): every permission of the composite belongs to the
// ADMIN alone today, so "has people.manage but not payouts.manage" is no real
// role — this deny-list makes the REAL `authorize` refuse one permission at a
// time. Empty (every other test) = the real `authorize`, unchanged.
const deniedPermissions = vi.hoisted(() => new Set<string>());
vi.mock('@/server/auth/rbac', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/auth/rbac')>();
  const { ForbiddenError: Forbidden } = await import('./errors');
  return {
    ...actual,
    authorize: (actor: Parameters<typeof actual.authorize>[0], permission: Parameters<typeof actual.authorize>[1]) => {
      if (deniedPermissions.has(permission)) throw new Forbidden(`Actor lacks required permission: ${permission}`);
      actual.authorize(actor, permission);
    },
  };
});

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
  assertStudentProfileExclusive,
} = await import('./people.service');
const { ConflictError, NotFoundError } = await import('./errors');
const { updatePersonCompositeSchema } = await import('@/lib/schemas/people');
const { todayDateOnlyInZone } = await import('@/lib/zoned-time');
const { APP_TIMEZONE } = await import('@/lib/time');
const { parseDateOnlyUtc } = await import('@/lib/date-only');

const findUniqueMock = vi.mocked(prisma.person.findUnique);
const findFirstMock = vi.mocked(prisma.person.findFirst);
const findManyMock = vi.mocked(prisma.person.findMany);
const countMock = vi.mocked(prisma.person.count);
const createMock = vi.mocked(prisma.person.create);
const updateMock = vi.mocked(prisma.person.update);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);
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
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
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

/** Story 14.9: the only role left with `people.manage` — also holds `users.manage`, so the composite create's `access` block (below) never sees the two permissions apart. */
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
    expiryFindManyMock.mockReset();
    deniedPermissions.clear();
    sendInviteEmailMock.mockReset();
    queryRawMock.mockReset();
    // Story 19.3 default: the `Person` row lock finds the person.
    (queryRawMock as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([{ id: 'person_1' }]);

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
        createPerson(pilotActor(), { firstName: 'X', lastName: 'Y', email: null, phone: null, address: null }),
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

      const result = await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result).toEqual({
        items: [
          {
            id: 'person_1',
            firstName: 'Maria',
            lastName: 'Bianchi',
            email: 'maria.bianchi@airmanager.local',
            phone: '+39 333 1234567',
            address: 'Via Roma 1, Torino',
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

      const result = await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

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

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

      // Story TD-3: `where` is now an `AND` array of the conditions that
      // apply (combinable `q`/`profile`, see `people.service.ts`) — assert
      // against the array's contents rather than top-level keys.
      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({ archivedAt: null });
    });

    it('includes archived persons when includeArchived is true (AC 2)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND?: Record<string, unknown>[] } };
      expect(findManyCall.where.AND ?? []).not.toContainEqual({ archivedAt: null });
    });

    it('returns ONLY archived persons when archivedOnly is true (feedback utente 2026-07-28, toggle pagina Piloti)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false, archivedOnly: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({ archivedAt: { not: null } });
      expect(findManyCall.where.AND).not.toContainEqual({ archivedAt: null });
    });

    it('searches first name, last name and email case-insensitively (AC 1)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'maria' });

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

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'zz', profile: 'pilot-or-student' });

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

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false, profile: 'pilot-or-student' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({
        OR: [{ pilotProfile: { deactivatedAt: null } }, { studentProfile: { deactivatedAt: null } }],
      });
    });

    it('profile: instructor filters to an active instructor profile (AC 3, story TD-3)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: false, profile: 'instructor' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
      expect(findManyCall.where.AND).toContainEqual({ instructorProfile: { deactivatedAt: null } });
    });

    it('no profile filter (filter-bar usage) leaves the where clause unrestricted by profile (AC 3, story TD-3)', async () => {
      findManyMock.mockResolvedValue([]);
      countMock.mockResolvedValue(0);

      await listPeople(adminActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: { AND?: Record<string, unknown>[] } };
      expect(findManyCall.where).toEqual({});
    });
  });

  describe('getPerson', () => {
    it('throws NotFoundError for a missing id', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(getPerson(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('returns the mapped person', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      const result = await getPerson(adminActor(), 'person_1');
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

      const result = await getPerson(adminActor(), 'person_1');

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
    };

    it('creates the person (AC 1)', async () => {
      personFindFirst.mockResolvedValue(null); // no existing conflict
      personCreate.mockResolvedValue(SELECTED_PERSON);

      const result = await createPerson(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ firstName: 'Maria', lastName: 'Bianchi', email: input.email }),
        }),
      );
      expect(result.id).toBe('person_1');
    });

    it('throws ConflictError when the email is already taken', async () => {
      personFindFirst.mockResolvedValue({ id: 'other_person' });

      await expect(createPerson(adminActor(), input)).rejects.toThrow(new ConflictError('A person with this email already exists.'));
      expect(createMock).not.toHaveBeenCalled();
    });

    it('checks uniqueness on the email ALONE (story 19.2, AC 3: one field, no OR)', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);

      await createPerson(adminActor(), input);

      expect(findFirstMock).toHaveBeenCalledWith({ where: { email: input.email }, select: { id: true } });
    });

    it('never queries uniqueness when the email is omitted', async () => {
      personCreate.mockResolvedValue({ ...SELECTED_PERSON, email: null });

      await createPerson(adminActor(), { firstName: 'X', lastName: 'Y', email: null, phone: null, address: null });

      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError', async () => {
      personFindFirst.mockResolvedValue(null);
      createMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(createPerson(adminActor(), input)).rejects.toThrow(ConflictError);
    });
  });

  describe('createPerson — one-step composite (story 13.1, AC 5/7)', () => {
    const input = { firstName: 'Maria', lastName: 'Bianchi' };

    it('with none of profiles/expiries/access: behaves exactly like the pre-13.1 create (retro-compatibility) — no new-block queries at all', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);

      await createPerson(adminActor(), input);

      expect(expiryTypeFindManyMock).not.toHaveBeenCalled();
      expect(userFindUniqueMock).not.toHaveBeenCalled();
      expect(userCreateMock).not.toHaveBeenCalled();
      expect(sendInviteEmailMock).not.toHaveBeenCalled();
    });

    it('activates pilot+instructor (the student profile excludes both since story 19.3), registers an expiry per profile scope, and creates+invites the linked user — all in ONE $transaction, invite sent only AFTER it resolves', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);
      pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });
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
          instructor: {},
        },
        expiries: [{ expiryTypeId: 'et_pilot', expiresAt: '2027-01-01' }],
        access: { email: 'maria@airmanager.local', roles: ['PILOT'] },
      });

      // Every write shares the SAME transaction (AC 5: atomic).
      expect(transactionMock).toHaveBeenCalledTimes(1);

      expect(pilotProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1' } }));
      expect(instructorProfileUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1' } }));
      expect(expiryCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ personId: 'person_1', expiryTypeId: 'et_pilot', actorUserId: 'admin_1' }) }),
      );
      expect(userCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'maria@airmanager.local', roles: ['PILOT'], personId: 'person_1' }) }),
      );

      // The invite is sent AFTER the transaction resolves (fire-and-forget), never inside it.
      expect(sendInviteEmailMock).toHaveBeenCalledWith('user_1', 'maria@airmanager.local', 'it');

      expect(result.profiles).toEqual({ pilot: true, student: false, instructor: true });
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
        createPerson(adminActor(), { ...input, expiries: [{ expiryTypeId: 'et_ghost', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow(ValidationError);

      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('a deactivated expiry type → 422 ValidationError', async () => {
      personFindFirst.mockResolvedValue(null);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_1', scope: 'ALL', isActive: false }]);

      await expect(
        createPerson(adminActor(), { ...input, expiries: [{ expiryTypeId: 'et_1', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow(ValidationError);
    });

    it('a scope not matched by any activated profile → 422 ValidationError (PILOTS type, no pilot profile in this call)', async () => {
      personFindFirst.mockResolvedValue(null);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_pilot', scope: 'PILOTS', isActive: true }]);

      await expect(
        createPerson(adminActor(), { ...input, expiries: [{ expiryTypeId: 'et_pilot', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow(ValidationError);
    });

    it('atomicity: a failure INSIDE the shared transaction (e.g. the expiry write) propagates and the invite is NEVER sent', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_1', scope: 'ALL', isActive: true }]);
      expiryCreateMock.mockRejectedValue(new Error('db unavailable'));

      await expect(
        createPerson(adminActor(), { ...input, expiries: [{ expiryTypeId: 'et_1', expiresAt: '2027-01-01' }] }),
      ).rejects.toThrow('db unavailable');

      expect(sendInviteEmailMock).not.toHaveBeenCalled();
    });

    it('an expiresAt in the PAST succeeds (review F1, closed at the root by R6: `Expiry.issuedAt` no longer exists, so there is nothing left for a past `expiresAt` to be inconsistent with — the resulting scadenza is simply already `expired`, the real state of the world)', async () => {
      personFindFirst.mockResolvedValue(null);
      personCreate.mockResolvedValue(SELECTED_PERSON);
      expiryTypeFindMany.mockResolvedValue([{ id: 'et_1', scope: 'ALL', isActive: true }]);
      expiryCreate.mockResolvedValue({ id: 'expiry_past' });

      await expect(
        createPerson(adminActor(), { ...input, expiries: [{ expiryTypeId: 'et_1', expiresAt: '2020-01-01' }] }),
      ).resolves.toBeDefined();

      expect(expiryCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expiryTypeId: 'et_1', expiresAt: expect.any(Date) }) }),
      );
      // No `issuedAt` is ever written (the column is gone from the domain).
      const writtenData = expiryCreateMock.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(writtenData).not.toHaveProperty('issuedAt');
    });
  });

  describe('updatePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(updatePerson(adminActor(), 'missing', { firstName: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('updates only the provided fields', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, phone: '+39 333 7654321' });

      const result = await updatePerson(adminActor(), 'person_1', { phone: '+39 333 7654321' });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, data: { phone: '+39 333 7654321' } }),
      );
      expect(result.phone).toBe('+39 333 7654321');
    });

    it('allows clearing email (null) without a uniqueness check', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, email: null });

      await updatePerson(adminActor(), 'person_1', { email: null });

      expect(findFirstMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { email: null } }));
    });

    it('throws ConflictError when re-using an email already taken by another person', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personFindFirst.mockResolvedValue({ id: 'someone_else' });

      await expect(
        updatePerson(adminActor(), 'person_1', { email: 'taken@airmanager.local' }),
      ).rejects.toThrow(ConflictError);
      // Story 19.2 (AC 3): the email alone, the person itself excluded.
      expect(findFirstMock).toHaveBeenCalledWith({
        where: { email: 'taken@airmanager.local', id: { not: 'person_1' } },
        select: { id: true },
      });
    });
  });

  // Story 19.4 (AD-2..AD-7): `updatePerson` is the person composite — every
  // part of the editors' single "Salva" in ONE transaction, on a `tx` DISTINCT
  // from the global `prisma` (review 14.8 F4's idiom), so a write that escaped
  // the transaction could not pass unnoticed.
  describe('updatePerson — one atomic save (story 19.4)', () => {
    const ACTIVE = { deactivatedAt: null };
    const INACTIVE = { deactivatedAt: new Date('2026-01-01T00:00:00.000Z') };
    /** A deactivated student keeps its course start date (read back into the `PersonDetail`). */
    const STUDENT_INACTIVE = { courseStartDate: new Date('2026-03-01'), ...INACTIVE };
    const today = todayDateOnlyInZone(APP_TIMEZONE);

    type Profiles = { pilotProfile?: unknown; studentProfile?: unknown; instructorProfile?: unknown };
    type ExpiryRow = { id: string; expiryTypeId: string; expiresAt: Date };

    /** The person's state as the transaction sees it; `profiles` is what the profile reads return (the FINAL state the writes produced, in these fakes). */
    function fakeTx(
      calls: string[],
      state: { profiles?: Profiles; archivedAt?: Date | null; expiries?: ExpiryRow[]; expiryCreateError?: unknown } = {},
    ) {
      const profiles = { pilotProfile: null, studentProfile: null, instructorProfile: null, ...state.profiles };
      const record = (name: string, value: unknown = {}) => async () => (calls.push(name), value);
      return {
        $queryRaw: vi.fn(async (strings: TemplateStringsArray) => (calls.push(`queryRaw:${strings.join('?')}`), [{ id: 'person_1', archivedAt: state.archivedAt ?? null }])),
        pilotProfile: { upsert: vi.fn(record('pilotProfile.upsert', { licenseNumber: 'L', licenseType: 'PPL', deactivatedAt: null })), updateMany: vi.fn(record('pilotProfile.updateMany', { count: 0 })) },
        studentProfile: {
          upsert: vi.fn(record('studentProfile.upsert', { courseStartDate: new Date('2026-03-01'), deactivatedAt: null })),
          updateMany: vi.fn(record('studentProfile.updateMany', { count: 0 })),
        },
        instructorProfile: {
          upsert: vi.fn(record('instructorProfile.upsert', { deactivatedAt: null })),
          updateMany: vi.fn(record('instructorProfile.updateMany', { count: 0 })),
          update: vi.fn(record('instructorProfile.update')),
        },
        account: { upsert: vi.fn(record('account.upsert', { id: 'account_1' })) },
        person: {
          findUnique: vi.fn(record('person.findUnique', profiles)),
          findUniqueOrThrow: vi.fn(record('person.findUniqueOrThrow', { ...SELECTED_PERSON, ...profiles })),
          update: vi.fn(record('person.update', { ...SELECTED_PERSON, ...profiles })),
        },
        expiry: {
          deleteMany: vi.fn(record('expiry.deleteMany', { count: 1 })),
          findMany: vi.fn(record('expiry.findMany', state.expiries ?? [])),
          create: vi.fn(async () => {
            calls.push('expiry.create');
            if (state.expiryCreateError) throw state.expiryCreateError;
            return { id: 'exp_new' };
          }),
          update: vi.fn(record('expiry.update')),
        },
        sentAlert: { deleteMany: vi.fn(record('sentAlert.deleteMany', { count: 2 })) },
        instructorRate: { upsert: vi.fn(record('instructorRate.upsert', { id: 'rate_1' })) },
      };
    }

    function runOn(tx: unknown): void {
      (transaction as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void }).mockImplementation((arg: unknown) =>
        (arg as (t: unknown) => unknown)(tx),
      );
    }

    /** The pre-transaction reads find the person, an unused email, these expiry types and these already registered rows. */
    function outside(types: Array<{ id: string; scope: string; isActive: boolean }> = [], registered: string[] = []): void {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      personFindFirst.mockResolvedValue(null);
      expiryTypeFindMany.mockResolvedValue(types);
      (expiryFindManyMock as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(registered.map((expiryTypeId) => ({ expiryTypeId })));
    }

    const writesOn = (calls: string[]) => calls.filter((call) => /\.(upsert|update|updateMany|create|deleteMany)$/.test(call));

    it('an anagrafica-only body behaves as before (AC 1): the lock, the update, the PersonDetail — no profile, expiry or instructor call', async () => {
      const calls: string[] = [];
      outside();
      runOn(fakeTx(calls));

      const result = await updatePerson(adminActor(), 'person_1', { phone: '+39 333 0000000' });

      expect(calls).toEqual([expect.stringContaining('FOR NO KEY UPDATE'), 'person.update']);
      expect(result).toHaveProperty('pilotProfile', null);
      expect(result).toHaveProperty('studentProfile', null);
      expect(result).toHaveProperty('instructorProfile', null);
    });

    it('a body with no anagrafica key reads the PersonDetail back instead of updating the person', async () => {
      const calls: string[] = [];
      outside();
      runOn(fakeTx(calls, { profiles: { instructorProfile: INACTIVE } }));

      await updatePerson(adminActor(), 'person_1', { profiles: { instructor: { active: false } } });

      expect(calls).not.toContain('person.update');
      expect(calls.at(-1)).toBe('person.findUniqueOrThrow');
    });

    it('profiles are declarative (AC 2): active:true activates through the cores (Account included), active:false on an inactive profile is a 200 no-op', async () => {
      const calls: string[] = [];
      outside();
      const tx = fakeTx(calls, { profiles: { pilotProfile: ACTIVE, instructorProfile: INACTIVE } });
      runOn(tx);

      await expect(
        updatePerson(adminActor(), 'person_1', {
          profiles: { pilot: { active: true, licenseNumber: 'IT-1', licenseType: 'PPL(A)' }, student: { active: false }, instructor: { active: false } },
        }),
      ).resolves.toMatchObject({ profiles: { pilot: true, student: false, instructor: false } });

      expect(tx.pilotProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { licenseNumber: 'IT-1', licenseType: 'PPL(A)', deactivatedAt: null } }));
      expect(tx.account.upsert).toHaveBeenCalled();
      // `count: 0` (nothing active to deactivate) is no error: the body states the final state (D-2).
      expect(tx.studentProfile.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { personId: 'person_1', deactivatedAt: null } }));
      expect(tx.instructorProfile.updateMany).toHaveBeenCalled();
    });

    it('exclusivity on the FINAL state (AC 3): deactivations first, activations next, ONE check after the last profile write and before the expiries', async () => {
      const calls: string[] = [];
      outside([{ id: 'type_all', scope: 'ALL', isActive: true }]);
      runOn(fakeTx(calls, { profiles: { pilotProfile: ACTIVE, studentProfile: STUDENT_INACTIVE } }));

      await updatePerson(adminActor(), 'person_1', {
        profiles: { student: { active: false }, pilot: { active: true, licenseNumber: 'IT-1', licenseType: 'PPL(A)' } },
        expiries: { set: [{ expiryTypeId: 'type_all', expiresAt: '2030-01-01' }] },
      });

      const checks = calls.filter((call) => call === 'person.findUnique');
      expect(checks).toHaveLength(1);
      expect(calls.indexOf('studentProfile.updateMany')).toBeLessThan(calls.indexOf('pilotProfile.upsert'));
      expect(calls.indexOf('account.upsert')).toBeLessThan(calls.indexOf('person.findUnique'));
      expect(calls.indexOf('person.findUnique')).toBeLessThan(calls.indexOf('expiry.findMany'));
    });

    it('activating Pilot with Student still active, or both in one body: 422 STUDENT_PROFILE_EXCLUSIVE thrown inside the transaction (the rollback undoes the Account too)', async () => {
      const calls: string[] = [];
      outside();
      runOn(fakeTx(calls, { profiles: { pilotProfile: ACTIVE, studentProfile: ACTIVE } }));
      await expect(
        updatePerson(adminActor(), 'person_1', { phone: '+39 1', profiles: { pilot: { active: true, licenseNumber: 'IT-1', licenseType: 'PPL(A)' } } }),
      ).rejects.toMatchObject({ code: 'STUDENT_PROFILE_EXCLUSIVE' });
      expect(calls).toContain('account.upsert');
      expect(calls).not.toContain('person.update');

      runOn(fakeTx([], { profiles: { pilotProfile: ACTIVE, studentProfile: ACTIVE } }));
      await expect(
        updatePerson(adminActor(), 'person_1', {
          profiles: { pilot: { active: true, licenseNumber: 'IT-1', licenseType: 'PPL(A)' }, student: { active: true, courseStartDate: '2026-03-01' } },
        }),
      ).rejects.toMatchObject({ code: 'STUDENT_PROFILE_EXCLUSIVE' });
    });

    it('expiries by type (AC 4): removals, then a missing row created, a moved date rewritten with its sent alerts wiped, an equal date not written', async () => {
      const calls: string[] = [];
      outside(
        [
          { id: 'type_new', scope: 'ALL', isActive: true },
          { id: 'type_moved', scope: 'ALL', isActive: true },
          { id: 'type_same', scope: 'ALL', isActive: true },
        ],
        ['type_moved', 'type_same'],
      );
      const tx = fakeTx(calls, {
        expiries: [
          { id: 'exp_moved', expiryTypeId: 'type_moved', expiresAt: parseDateOnlyUtc('2027-01-01') },
          { id: 'exp_same', expiryTypeId: 'type_same', expiresAt: parseDateOnlyUtc('2027-06-30') },
        ],
      });
      runOn(tx);

      await updatePerson(adminActor(), 'person_1', {
        expiries: {
          set: [
            { expiryTypeId: 'type_new', expiresAt: '2028-01-01' },
            { expiryTypeId: 'type_moved', expiresAt: '2028-02-01' },
            { expiryTypeId: 'type_same', expiresAt: '2027-06-30' },
          ],
          remove: ['type_gone'],
        },
      });

      expect(tx.expiry.deleteMany).toHaveBeenCalledWith({ where: { personId: 'person_1', expiryTypeId: { in: ['type_gone'] } } });
      expect(calls.indexOf('expiry.deleteMany')).toBeLessThan(calls.indexOf('expiry.create'));
      expect(tx.expiry.create).toHaveBeenCalledTimes(1);
      expect(tx.expiry.create).toHaveBeenCalledWith({
        data: { personId: 'person_1', expiryTypeId: 'type_new', expiresAt: parseDateOnlyUtc('2028-01-01'), actorUserId: 'admin_1' },
      });
      expect(tx.sentAlert.deleteMany).toHaveBeenCalledTimes(1);
      expect(tx.sentAlert.deleteMany).toHaveBeenCalledWith({ where: { expiryId: 'exp_moved' } });
      expect(tx.expiry.update).toHaveBeenCalledTimes(1);
      expect(tx.expiry.update).toHaveBeenCalledWith({ where: { id: 'exp_moved' }, data: { expiresAt: parseDateOnlyUtc('2028-02-01'), actorUserId: 'admin_1' } });
    });

    it('a row to CREATE on an unknown or deactivated type is a 422 before any lock; an existing row on a deactivated type still moves its date', async () => {
      outside([]);
      await expect(updatePerson(adminActor(), 'person_1', { expiries: { set: [{ expiryTypeId: 'nope', expiresAt: '2030-01-01' }] } })).rejects.toMatchObject({
        code: 'EXPIRY_TYPE_NOT_FOUND',
      });

      outside([{ id: 'type_off', scope: 'ALL', isActive: false }]);
      await expect(updatePerson(adminActor(), 'person_1', { expiries: { set: [{ expiryTypeId: 'type_off', expiresAt: '2030-01-01' }] } })).rejects.toMatchObject({
        code: 'EXPIRY_TYPE_INACTIVE',
      });
      expect(transactionMock).not.toHaveBeenCalled();

      const calls: string[] = [];
      outside([{ id: 'type_off', scope: 'ALL', isActive: false }], ['type_off']);
      runOn(fakeTx(calls, { expiries: [{ id: 'exp_off', expiryTypeId: 'type_off', expiresAt: parseDateOnlyUtc('2027-01-01') }] }));
      await expect(updatePerson(adminActor(), 'person_1', { expiries: { set: [{ expiryTypeId: 'type_off', expiresAt: '2030-01-01' }] } })).resolves.toBeDefined();
      expect(calls).toContain('expiry.update');
    });

    it('a new row whose scope matches none of the FINAL profiles is 422 SCOPE_MISMATCH inside the transaction, after the deactivation; on an archived person 409 PERSON_ARCHIVED', async () => {
      const calls: string[] = [];
      outside([{ id: 'type_pilots', scope: 'PILOTS', isActive: true }]);
      // The profile reads return the state AFTER the deactivation of this same body.
      runOn(fakeTx(calls, { profiles: { pilotProfile: INACTIVE } }));
      await expect(
        updatePerson(adminActor(), 'person_1', {
          phone: '+39 1',
          profiles: { pilot: { active: false } },
          expiries: { set: [{ expiryTypeId: 'type_pilots', expiresAt: '2030-01-01' }] },
        }),
      ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
      expect(calls.indexOf('pilotProfile.updateMany')).toBeLessThan(calls.indexOf('expiry.findMany'));
      expect(calls).not.toContain('expiry.create');
      expect(calls).not.toContain('person.update');

      outside([{ id: 'type_all', scope: 'ALL', isActive: true }]);
      runOn(fakeTx([], { archivedAt: new Date('2026-05-01T00:00:00.000Z') }));
      await expect(updatePerson(adminActor(), 'person_1', { expiries: { set: [{ expiryTypeId: 'type_all', expiresAt: '2030-01-01' }] } })).rejects.toMatchObject({
        code: 'PERSON_ARCHIVED',
      });
    });

    it('a concurrent create of the same row (P2002) is 409 EXPIRY_CONFLICT — never the generic CONFLICT a client reads as "email already used"', async () => {
      outside([{ id: 'type_all', scope: 'ALL', isActive: true }]);
      runOn(fakeTx([], { expiryCreateError: Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }) }));

      await expect(updatePerson(adminActor(), 'person_1', { expiries: { set: [{ expiryTypeId: 'type_all', expiresAt: '2030-01-01' }] } })).rejects.toMatchObject({
        code: 'EXPIRY_CONFLICT',
      });
    });

    it('instructor parts (AC 5): compensation assigned only when it changes, the rate through upsertInstructorRateCore — also when this same body activates the profile', async () => {
      const calls: string[] = [];
      outside();
      const tx = fakeTx(calls, { profiles: { instructorProfile: { id: 'ip_1', deactivatedAt: null, payoutRateCents: 3000 } } });
      runOn(tx);

      await updatePerson(adminActor(), 'person_1', {
        profiles: { instructor: { active: true } },
        payoutRateCents: 4500,
        instructorRate: { priceCentsPerHour: 5000, validFrom: today },
      });

      expect(tx.instructorProfile.update).toHaveBeenCalledWith({ where: { id: 'ip_1' }, data: { payoutRateCents: 4500 } });
      expect(tx.instructorRate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { instructorProfileId_validFrom: { instructorProfileId: 'ip_1', validFrom: parseDateOnlyUtc(today) } } }),
      );
      expect(calls.indexOf('instructorProfile.upsert')).toBeLessThan(calls.indexOf('instructorProfile.update'));

      const sameRate = fakeTx([], { profiles: { instructorProfile: { id: 'ip_1', deactivatedAt: null, payoutRateCents: 4500 } } });
      runOn(sameRate);
      await updatePerson(adminActor(), 'person_1', { payoutRateCents: 4500 });
      expect(sameRate.instructorProfile.update).not.toHaveBeenCalled();

      const cleared = fakeTx([], { profiles: { instructorProfile: { id: 'ip_1', deactivatedAt: null, payoutRateCents: 4500 } } });
      runOn(cleared);
      await updatePerson(adminActor(), 'person_1', { payoutRateCents: null });
      expect(cleared.instructorProfile.update).toHaveBeenCalledWith({ where: { id: 'ip_1' }, data: { payoutRateCents: null } });
    });

    it('compensation or rate without an instructor profile active on the FINAL state: 409 INSTRUCTOR_PROFILE_INACTIVE, propagated out of the transaction, the anagrafica never written (AC 5, AC 7)', async () => {
      const calls: string[] = [];
      outside();
      runOn(fakeTx(calls, { profiles: { instructorProfile: { id: 'ip_1', ...INACTIVE, payoutRateCents: 3000 } } }));

      await expect(
        updatePerson(adminActor(), 'person_1', { firstName: 'Nuovo', profiles: { instructor: { active: false } }, payoutRateCents: 4500 }),
      ).rejects.toMatchObject({ code: 'INSTRUCTOR_PROFILE_INACTIVE' });
      expect(calls).not.toContain('instructorProfile.update');
      expect(calls).not.toContain('person.update');

      runOn(fakeTx([], {}));
      await expect(updatePerson(adminActor(), 'person_1', { instructorRate: { priceCentsPerHour: 5000, validFrom: today } })).rejects.toMatchObject({
        code: 'INSTRUCTOR_PROFILE_INACTIVE',
      });
    });

    it('a rate dated before today (Europe/Rome) is 422 RATE_VALID_FROM_IN_PAST before the transaction opens', async () => {
      outside();
      await expect(
        updatePerson(adminActor(), 'person_1', { firstName: 'Nuovo', instructorRate: { priceCentsPerHour: 5000, validFrom: '2000-01-01' } }),
      ).rejects.toMatchObject({ code: 'RATE_VALID_FROM_IN_PAST' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('every write of a save touching ALL the parts runs on tx (AC 7), the Person lock first and the anagrafica last (AC 8)', async () => {
      const calls: string[] = [];
      outside([{ id: 'type_all', scope: 'ALL', isActive: true }]);
      runOn(
        fakeTx(calls, {
          profiles: { pilotProfile: ACTIVE, studentProfile: STUDENT_INACTIVE, instructorProfile: { id: 'ip_1', deactivatedAt: null, payoutRateCents: 3000 } },
        }),
      );

      await updatePerson(adminActor(), 'person_1', {
        firstName: 'Nuovo',
        email: 'nuovo@airmanager.local',
        profiles: { student: { active: false }, pilot: { active: true, licenseNumber: 'IT-1', licenseType: 'PPL(A)' }, instructor: { active: true } },
        expiries: { set: [{ expiryTypeId: 'type_all', expiresAt: '2030-01-01' }], remove: ['type_gone'] },
        payoutRateCents: 4500,
        instructorRate: { priceCentsPerHour: 5000, validFrom: today },
      });

      expect(calls[0]).toContain('FROM "Person"');
      expect(calls[0]).toContain('FOR NO KEY UPDATE');
      expect(calls.filter((call) => call.startsWith('queryRaw:'))).toHaveLength(1);
      expect(writesOn(calls).at(-1)).toBe('person.update');
      expect(calls.indexOf('studentProfile.updateMany')).toBeLessThan(calls.indexOf('pilotProfile.upsert'));
      expect(calls.indexOf('expiry.create')).toBeLessThan(calls.indexOf('instructorProfile.update'));
      expect(calls.indexOf('instructorProfile.update')).toBeLessThan(calls.indexOf('instructorRate.upsert'));
      // Nothing written on the global client: every write of the save went through `tx`.
      for (const mock of [updateMock, pilotProfileUpsertMock, pilotProfileUpdateManyMock, studentProfileUpdateManyMock, instructorProfileUpsertMock, instructorProfileUpdateManyMock, accountUpsertMock, expiryCreateMock, queryRawMock]) {
        expect(mock).not.toHaveBeenCalled();
      }
    });

    it('a failure before the transaction (403, 404, 409 email, 422) takes no lock (AC 8)', async () => {
      await expect(updatePerson(pilotActor(), 'person_1', { firstName: 'X' })).rejects.toThrow(ForbiddenError);

      personFindUnique.mockResolvedValue(null);
      await expect(updatePerson(adminActor(), 'missing', { firstName: 'X' })).rejects.toThrow(NotFoundError);

      personFindUnique.mockResolvedValue({ id: 'person_1' });
      personFindFirst.mockResolvedValue({ id: 'someone_else' });
      await expect(updatePerson(adminActor(), 'person_1', { email: 'taken@airmanager.local' })).rejects.toMatchObject({ code: 'CONFLICT' });

      expect(transactionMock).not.toHaveBeenCalled();
    });

    describe('one permission per part present (AD-7, AC 9)', () => {
      const parts: Array<{ permission: string; body: Parameters<typeof updatePerson>[2] }> = [
        { permission: 'payouts.manage', body: { payoutRateCents: 4500 } },
        { permission: 'settings.manage', body: { instructorRate: { priceCentsPerHour: 5000, validFrom: today } } },
        { permission: 'expiries.manage', body: { expiries: { remove: ['type_x'] } } },
      ];

      for (const { permission, body } of parts) {
        it(`without ${permission}: a body carrying its part is a 403 before any query; a body without it saves`, async () => {
          deniedPermissions.add(permission);
          outside();

          await expect(updatePerson(adminActor(), 'person_1', { firstName: 'Nuovo', ...body })).rejects.toThrow(ForbiddenError);
          expect(findUniqueMock).not.toHaveBeenCalled();
          expect(transactionMock).not.toHaveBeenCalled();

          runOn(fakeTx([]));
          await expect(updatePerson(adminActor(), 'person_1', { firstName: 'Nuovo' })).resolves.toBeDefined();
        });
      }
    });

    it('idempotency (AC 10): the same full body twice gives 200 twice, and the second time wipes no sent alert', async () => {
      const body = {
        phone: '+39 333 1111111',
        profiles: { student: { active: false as const } },
        expiries: { set: [{ expiryTypeId: 'type_all', expiresAt: '2030-01-01' }], remove: ['type_gone'] },
        payoutRateCents: 4500,
        instructorRate: { priceCentsPerHour: 5000, validFrom: today },
      };
      const instructorProfile = { id: 'ip_1', deactivatedAt: null, payoutRateCents: 3000 };
      outside([{ id: 'type_all', scope: 'ALL', isActive: true }], ['type_all']);

      const first = fakeTx([], { profiles: { instructorProfile }, expiries: [{ id: 'exp_1', expiryTypeId: 'type_all', expiresAt: parseDateOnlyUtc('2029-01-01') }] });
      runOn(first);
      await expect(updatePerson(adminActor(), 'person_1', body)).resolves.toBeDefined();
      expect(first.sentAlert.deleteMany).toHaveBeenCalledTimes(1);

      // The state the first save left behind: date moved, compensation set, student already inactive.
      const second = fakeTx([], {
        profiles: { instructorProfile: { ...instructorProfile, payoutRateCents: 4500 } },
        expiries: [{ id: 'exp_1', expiryTypeId: 'type_all', expiresAt: parseDateOnlyUtc('2030-01-01') }],
      });
      runOn(second);
      await expect(updatePerson(adminActor(), 'person_1', body)).resolves.toBeDefined();
      expect(second.sentAlert.deleteMany).not.toHaveBeenCalled();
      expect(second.expiry.update).not.toHaveBeenCalled();
      expect(second.instructorProfile.update).not.toHaveBeenCalled();
    });

    it('the body schema: a type at most once across set and remove, profile shapes by final state', () => {
      const parse = (body: unknown) => updatePersonCompositeSchema.safeParse(body).success;
      expect(parse({ expiries: { set: [{ expiryTypeId: 'a', expiresAt: '2030-01-01' }], remove: ['b'] } })).toBe(true);
      expect(parse({ expiries: { set: [{ expiryTypeId: 'a', expiresAt: '2030-01-01' }], remove: ['a'] } })).toBe(false);
      expect(parse({ expiries: { set: [{ expiryTypeId: 'a', expiresAt: '2030-01-01' }, { expiryTypeId: 'a', expiresAt: '2031-01-01' }] } })).toBe(false);
      expect(parse({ expiries: { remove: ['a', 'a'] } })).toBe(false);
      expect(parse({ profiles: { pilot: { active: false } } })).toBe(true);
      expect(parse({ profiles: { pilot: { active: true } } })).toBe(false);
      expect(parse({ profiles: { student: { active: true, courseStartDate: '2026-03-01' }, instructor: { active: true } } })).toBe(true);
      expect(parse({ payoutRateCents: null })).toBe(true);
      expect(parse({ payoutRateCents: -1 })).toBe(false);
      expect(parse({ instructorRate: { priceCentsPerHour: 0, validFrom: '2030-01-01' } })).toBe(false);
    });
  });

  describe('archivePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(archivePerson(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when already archived', async () => {
      personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      await expect(archivePerson(adminActor(), 'person_1')).rejects.toThrow(ConflictError);
    });

    it('sets archivedAt (AC 2)', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });

      const result = await archivePerson(adminActor(), 'person_1');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, data: { archivedAt: expect.any(Date) } }),
      );
      expect(result.archivedAt).not.toBeNull();
    });
  });

  describe('unarchivePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(unarchivePerson(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when not archived', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      await expect(unarchivePerson(adminActor(), 'person_1')).rejects.toThrow(ConflictError);
    });

    it('clears archivedAt', async () => {
      personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: null });

      const result = await unarchivePerson(adminActor(), 'person_1');

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { archivedAt: null } }));
      expect(result.archivedAt).toBeNull();
    });
  });

  describe('upsertProfile (story 2.2, AC 1/2)', () => {
    it('throws NotFoundError for a missing person (the Person row lock finds no row, story 19.3)', async () => {
      (queryRawMock as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);

      await expect(
        upsertProfile(adminActor(), 'missing', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' }),
      ).rejects.toThrow(NotFoundError);
      expect(pilotProfileUpsertMock).not.toHaveBeenCalled();
    });

    it('creates or updates+reactivates the pilot profile in one upsert', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });

      const result = await upsertProfile(adminActor(), 'person_1', 'pilot', {
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

      const result = await upsertProfile(adminActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' });

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

      const result = await upsertProfile(adminActor(), 'person_1', 'instructor', {});

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

        await upsertProfile(adminActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' });

        expect(accountUpsertMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' } }),
        );
      });

      it('upserts the Account alongside the student profile', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        studentProfileUpsert.mockResolvedValue({ courseStartDate: new Date('2026-03-01'), deactivatedAt: null });

        await upsertProfile(adminActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' });

        expect(accountUpsertMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' } }),
        );
      });

      it('does NOT create an Account for the instructor profile', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        instructorProfileUpsert.mockResolvedValue({ deactivatedAt: null });

        await upsertProfile(adminActor(), 'person_1', 'instructor', {});

        expect(accountUpsertMock).not.toHaveBeenCalled();
      });

      it('reactivating an already-accounted person does not duplicate the account (idempotent upsert, AD-11 unique personId)', async () => {
        personFindUnique.mockResolvedValue({ id: 'person_1' });
        pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null });
        accountUpsert.mockResolvedValue({ id: 'account_1' });

        await upsertProfile(adminActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' });
        await upsertProfile(adminActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' });

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

      await expect(deactivateProfile(adminActor(), 'missing', 'student')).rejects.toThrow(NotFoundError);
      expect(studentProfileUpdateManyMock).not.toHaveBeenCalled();
    });

    it('sets deactivatedAt on an active profile via a single guarded update (review 2.2 F1)', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      studentProfileUpdateMany.mockResolvedValue({ count: 1 });

      await deactivateProfile(adminActor(), 'person_1', 'student');

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

      await expect(deactivateProfile(adminActor(), 'person_1', 'instructor')).rejects.toThrow(ConflictError);
    });

    it('throws ConflictError when the profile is already deactivated (guarded update matches no row)', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      pilotProfileUpdateMany.mockResolvedValue({ count: 0 });

      await expect(deactivateProfile(adminActor(), 'person_1', 'pilot')).rejects.toThrow(ConflictError);
    });
  });

  describe('student → pilot transition (story 2.2, AC 2)', () => {
    it('deactivates the student profile and activates the pilot profile without ever touching Person', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      studentProfileUpdateMany.mockResolvedValue({ count: 1 });
      pilotProfileUpsert.mockResolvedValue({ licenseNumber: 'IT-PPL-9', licenseType: 'PPL(A)', deactivatedAt: null });

      await deactivateProfile(adminActor(), 'person_1', 'student');
      await upsertProfile(adminActor(), 'person_1', 'pilot', { licenseNumber: 'IT-PPL-9', licenseType: 'PPL(A)' });

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

  // Story 19.3 (R-19-e, Q-19.3-c, AD-5): the student profile excludes the
  // pilot AND the instructor profile — checked on the FINAL state, from the
  // transaction's own client, under a `Person` row lock.
  describe('exclusive student profile (story 19.3, AC 13-15)', () => {
    const PILOT_INPUT = { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)' };
    const ACTIVE = { deactivatedAt: null };
    const INACTIVE = { deactivatedAt: new Date('2026-01-01T00:00:00.000Z') };

    /** A `tx` DISTINCT from the global `prisma` (review 14.8 F4's idiom): a read that escapes the transaction cannot pass. */
    function distinctTx(profiles: { pilotProfile?: unknown; studentProfile?: unknown; instructorProfile?: unknown }, calls: string[]) {
      return {
        $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
          calls.push(`queryRaw:${strings.join('?')}`);
          return [{ id: 'person_1' }];
        }),
        pilotProfile: { upsert: vi.fn(async () => (calls.push('pilotProfile.upsert'), { licenseNumber: 'IT-PPL-1', licenseType: 'PPL(A)', deactivatedAt: null })) },
        studentProfile: { upsert: vi.fn(async () => (calls.push('studentProfile.upsert'), { courseStartDate: new Date('2026-03-01'), deactivatedAt: null })) },
        instructorProfile: { upsert: vi.fn(async () => (calls.push('instructorProfile.upsert'), { deactivatedAt: null })) },
        account: { upsert: vi.fn(async () => (calls.push('account.upsert'), { id: 'account_1' })) },
        person: {
          findUnique: vi.fn(async () => (calls.push('person.findUnique'), { pilotProfile: null, studentProfile: null, instructorProfile: null, ...profiles })),
        },
      };
    }

    function runOn(tx: unknown): void {
      (transaction as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void }).mockImplementation((arg: unknown) =>
        (arg as (t: unknown) => unknown)(tx),
      );
    }

    it('activating Pilot while Student is active: 422 STUDENT_PROFILE_EXCLUSIVE, raised AFTER the core write so the rollback undoes it', async () => {
      const calls: string[] = [];
      const tx = distinctTx({ pilotProfile: ACTIVE, studentProfile: ACTIVE }, calls);
      runOn(tx);

      await expect(upsertProfile(adminActor(), 'person_1', 'pilot', PILOT_INPUT)).rejects.toMatchObject({ code: 'STUDENT_PROFILE_EXCLUSIVE' });
      expect(calls).toEqual([expect.stringContaining('FROM "Person"'), 'pilotProfile.upsert', 'account.upsert', 'person.findUnique']);
    });

    it('the FIRST statement of the transaction locks the Person row FOR NO KEY UPDATE, before any other query (AC 14)', async () => {
      const calls: string[] = [];
      runOn(distinctTx({ studentProfile: ACTIVE }, calls));

      await upsertProfile(adminActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' });

      expect(calls[0]).toContain('FROM "Person"');
      expect(calls[0]).toContain('FOR NO KEY UPDATE');
      expect(calls.filter((call) => call.startsWith('queryRaw:'))).toHaveLength(1);
      // Nothing touched the global client: the lock, the write and the check all ran on `tx`.
      expect(queryRawMock).not.toHaveBeenCalled();
      expect(findUniqueMock).not.toHaveBeenCalled();
      expect(studentProfileUpsertMock).not.toHaveBeenCalled();
    });

    it('activating Student while Pilot is active, or while Instructor is active (Q-19.3-c): same 422', async () => {
      runOn(distinctTx({ studentProfile: ACTIVE, pilotProfile: ACTIVE }, []));
      await expect(upsertProfile(adminActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' })).rejects.toMatchObject({
        code: 'STUDENT_PROFILE_EXCLUSIVE',
      });

      runOn(distinctTx({ studentProfile: ACTIVE, instructorProfile: ACTIVE }, []));
      await expect(upsertProfile(adminActor(), 'person_1', 'student', { courseStartDate: '2026-03-01' })).rejects.toMatchObject({
        code: 'STUDENT_PROFILE_EXCLUSIVE',
      });
    });

    it('activating Instructor while Student is active (Q-19.3-c): 422 — the instructor branch is checked too', async () => {
      const calls: string[] = [];
      runOn(distinctTx({ instructorProfile: ACTIVE, studentProfile: ACTIVE }, calls));

      await expect(upsertProfile(adminActor(), 'person_1', 'instructor', {})).rejects.toMatchObject({ code: 'STUDENT_PROFILE_EXCLUSIVE' });
      expect(calls[0]).toContain('FOR NO KEY UPDATE');
    });

    it('pilot + instructor stays allowed, and a deactivated student never blocks (the student → pilot transition)', async () => {
      runOn(distinctTx({ pilotProfile: ACTIVE, instructorProfile: ACTIVE, studentProfile: INACTIVE }, []));
      await expect(upsertProfile(adminActor(), 'person_1', 'pilot', PILOT_INPUT)).resolves.toMatchObject({ deactivatedAt: null });
      await expect(upsertProfile(adminActor(), 'person_1', 'instructor', {})).resolves.toEqual({ deactivatedAt: null });
    });

    it('assertStudentProfileExclusive reads the three profiles from the given tx', async () => {
      const tx = distinctTx({ studentProfile: ACTIVE, pilotProfile: INACTIVE, instructorProfile: null }, []);

      await expect(assertStudentProfileExclusive(tx as never, 'person_1')).resolves.toBeUndefined();
      expect(tx.person.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, select: expect.objectContaining({ pilotProfile: expect.anything(), studentProfile: expect.anything(), instructorProfile: expect.anything() }) }),
      );
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('createPerson with profiles.student AND profiles.pilot (or .instructor): 422 before any query or transaction (AC 15)', async () => {
      const base = { firstName: 'Ada', lastName: 'Lovelace' };
      await expect(
        createPerson(adminActor(), { ...base, profiles: { pilot: PILOT_INPUT, student: { courseStartDate: '2026-03-01' } } }),
      ).rejects.toMatchObject({ code: 'STUDENT_PROFILE_EXCLUSIVE' });
      await expect(
        createPerson(adminActor(), { ...base, profiles: { instructor: {}, student: { courseStartDate: '2026-03-01' } } }),
      ).rejects.toMatchObject({ code: 'STUDENT_PROFILE_EXCLUSIVE' });
      expect(transactionMock).not.toHaveBeenCalled();
      expect(findFirstMock).not.toHaveBeenCalled();
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

      const result = await listPilotsPageData(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

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

      const result = await listPilotsPageData(adminActor(), { page: 1, pageSize: 20, q: 'Alfa', includeArchived: false });

      expect(result.totalCount).toBe(42);
      expect(result.suspendedCount).toBe(3);
      expect(countMock).toHaveBeenCalledWith({ where: { archivedAt: null } });
      expect(userCountMock).toHaveBeenCalledWith({ where: { isActive: false, person: { archivedAt: null } } });
    });

    it('skips every enrichment query when the page is empty', async () => {
      transaction.mockResolvedValue([[], 0]);
      countMock.mockResolvedValue(0);
      userCount.mockResolvedValue(0);

      const result = await listPilotsPageData(adminActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result.items).toEqual([]);
      expect(accountFindManyMock).not.toHaveBeenCalled();
      expect(flightGroupByMock).not.toHaveBeenCalled();
      expect(userFindManyMock).not.toHaveBeenCalled();
    });
  });
});
