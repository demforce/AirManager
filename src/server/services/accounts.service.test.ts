import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordAdjustmentSchema, recordTopUpSchema } from '@/lib/schemas/accounts';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    accountMovement: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    person: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    appSetting: {
      findUnique: vi.fn(),
    },
    cashCategory: {
      findUnique: vi.fn(),
    },
    cashMovement: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildNegativeBalanceAlertEmail: vi.fn(async () => ({ subject: 'Alert subject', text: 'Alert text' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { buildNegativeBalanceAlertEmail } = await import('@/server/adapters/mail/templates');
const { balanceBand, getAccountOverview, listAccountMovements, listNegativeBalances, recordAdjustment, recordTopUp } =
  await import('./accounts.service');
const { ConflictError, NotFoundError } = await import('./errors');

const accountFindUniqueMock = vi.mocked(prisma.account.findUnique);
const accountFindManyMock = vi.mocked(prisma.account.findMany);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const accountMovementFindManyMock = vi.mocked(prisma.accountMovement.findMany);
const accountMovementFindUniqueMock = vi.mocked(prisma.accountMovement.findUnique);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const accountMovementCountMock = vi.mocked(prisma.accountMovement.count);
const accountMovementGroupByMock = vi.mocked(prisma.accountMovement.groupBy);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const userFindUniqueMock = vi.mocked(prisma.user.findUnique);
const appSettingFindUniqueMock = vi.mocked(prisma.appSetting.findUnique);
const cashCategoryFindUniqueMock = vi.mocked(prisma.cashCategory.findUnique);
const cashMovementCreateMock = vi.mocked(prisma.cashMovement.create);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as aircraft.service.test.ts / people.service.test.ts).
type Fixture = Record<string, unknown> | null;
const accountFindUnique = accountFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountFindMany = accountFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementAggregate = accountMovementAggregateMock as unknown as {
  mockResolvedValue: (v: { _sum: { amountCents: number | null } }) => void;
  mockResolvedValueOnce: (v: { _sum: { amountCents: number | null } }) => {
    mockResolvedValueOnce: (v: { _sum: { amountCents: number | null } }) => void;
  };
};
const accountMovementFindMany = accountMovementFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const accountMovementFindUnique = accountMovementFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementCount = accountMovementCountMock as unknown as { mockResolvedValue: (v: number) => void };
const accountMovementCreate = accountMovementCreateMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockRejectedValue: (v: unknown) => void;
};
const accountMovementGroupBy = accountMovementGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const userFindUnique = userFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const appSettingFindUnique = appSettingFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const cashCategoryFindUnique = cashCategoryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const queryRaw = queryRawMock as unknown as { mockResolvedValue: (v: unknown[]) => void };

/**
 * `getAccountOverview` uses the batch/array `$transaction([aggregate, findMany])`
 * overload; `recordTopUp` uses the interactive-callback overload
 * (`$transaction(async (tx) => ...)`, same as `adjustHourMeter` in
 * aircraft.service.ts). A faithful stand-in for both: an array is awaited
 * with `Promise.all` (the already-invoked mocked calls inside it), a
 * function is invoked with the mocked `prisma` itself as `tx`.
 */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };

function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(personId: string | null = 'person_pilot'): Actor {
  return { userId: 'pilot_1', personId, roles: ['PILOT'] };
}

/** No role at all (e.g. a stale JWT carrying a role removed from `ROLE_PERMISSIONS`) — fails closed to zero permissions. */
function noRoleActor(): Actor {
  return { userId: 'ghost_1', personId: null, roles: [] };
}

describe('accounts.service (story 3.1 — AD-3 append-only ledger + AD-2 integer cents)', () => {
  beforeEach(() => {
    accountFindUniqueMock.mockReset();
    accountFindManyMock.mockReset();
    accountUpsertMock.mockReset();
    accountMovementAggregateMock.mockReset();
    accountMovementFindManyMock.mockReset();
    accountMovementFindUniqueMock.mockReset();
    accountMovementCreateMock.mockReset();
    accountMovementCountMock.mockReset();
    accountMovementGroupByMock.mockReset();
    personFindUniqueMock.mockReset();
    userFindUniqueMock.mockReset();
    appSettingFindUniqueMock.mockReset();
    cashCategoryFindUniqueMock.mockReset();
    cashMovementCreateMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    vi.mocked(buildNegativeBalanceAlertEmail).mockClear();
    mockTransaction();
    // Review 3.1 F4: `getAccountOverview` now 404s on an unknown person, so
    // every happy-path test needs the person to exist; per-test overrides
    // (e.g. the NotFound tests) still win by re-mocking.
    personFindUnique.mockResolvedValue({ id: 'person_1' });
  });

  describe('getAccountOverview — own-access (story 2.3 pattern, AC 1)', () => {
    it('staff (people.read) can read any account', async () => {
      accountFindUnique.mockResolvedValue(null);

      const result = await getAccountOverview(staffActor(), 'person_1');

      expect(result).toEqual({ account: null, balanceCents: 0, recentMovements: [] });
    });

    it('a pilot can read their own account', async () => {
      accountFindUnique.mockResolvedValue(null);

      const result = await getAccountOverview(pilotActor('person_pilot'), 'person_pilot');

      expect(result.account).toBeNull();
    });

    it('rejects a pilot reading someone else’s account, BEFORE any query', async () => {
      await expect(getAccountOverview(pilotActor('person_pilot'), 'person_other')).rejects.toThrow(ForbiddenError);
      expect(accountFindUniqueMock).not.toHaveBeenCalled();
    });

    it('rejects a pilot with no linked person (personId: null)', async () => {
      await expect(getAccountOverview(pilotActor(null), 'person_1')).rejects.toThrow(ForbiddenError);
      expect(accountFindUniqueMock).not.toHaveBeenCalled();
    });

    it('rejects an actor with neither self.read nor people.read (stale/unknown role)', async () => {
      await expect(getAccountOverview(noRoleActor(), 'person_1')).rejects.toThrow(ForbiddenError);
      expect(accountFindUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('getAccountOverview — balance (AD-3: always SUM(amountCents), never a stored column)', () => {
    it('returns { account: null, balanceCents: 0 } when the person never activated pilot/student (AC 1)', async () => {
      accountFindUnique.mockResolvedValue(null);

      const result = await getAccountOverview(staffActor(), 'person_1');

      expect(result).toEqual({ account: null, balanceCents: 0, recentMovements: [] });
      expect(accountMovementAggregateMock).not.toHaveBeenCalled();
    });

    it('returns balanceCents 0 for an account with zero movements (Prisma aggregates a null sum, not 0)', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: null } });
      accountMovementFindMany.mockResolvedValue([]);

      const result = await getAccountOverview(staffActor(), 'person_1');

      expect(result.balanceCents).toBe(0);
      expect(result.recentMovements).toEqual([]);
    });

    it('returns the SUM of signed amountCents as the balance', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 15000 } });
      accountMovementFindMany.mockResolvedValue([
        {
          id: 'movement_1',
          type: 'TOP_UP',
          amountCents: 15000,
          paymentMethod: 'CASH',
          description: null,
          effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
          actorUserId: 'staff_1',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      ]);

      const result = await getAccountOverview(staffActor(), 'person_1');

      expect(result.balanceCents).toBe(15000);
      expect(result.recentMovements).toEqual([
        {
          id: 'movement_1',
          type: 'TOP_UP',
          amountCents: 15000,
          paymentMethod: 'CASH',
          description: null,
          effectiveDate: '2026-03-01',
          actorUserId: 'staff_1',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      ]);
    });

    it('caps the recent-movements preview at 5, most-recent-first', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 500 } });
      accountMovementFindMany.mockResolvedValue([]);

      await getAccountOverview(staffActor(), 'person_1');

      expect(accountMovementFindManyMock).toHaveBeenCalledWith(
        // `id` tie-break keeps same-millisecond rows deterministic (review 3.1 F3).
        expect.objectContaining({ take: 5, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      );
    });

    it('throws NotFoundError for an unknown person instead of an empty overview (review 3.1 F4)', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(getAccountOverview(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(accountFindUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('listAccountMovements — own-access (story 3.2, AC 1/2)', () => {
    const query = { page: 1, pageSize: 20 };

    it('staff (people.read) can read any statement, WITH actorEmail (AC 2)', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1' });
      accountMovementFindMany.mockResolvedValue([
        {
          id: 'movement_1',
          type: 'TOP_UP',
          amountCents: 10000,
          description: 'Contanti',
          effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          actorUser: { email: 'staff@airmanager.local' },
          reversalOfId: null,
          reversal: null,
        },
      ]);
      accountMovementCount.mockResolvedValue(1);

      const result = await listAccountMovements(staffActor(), 'person_1', query);

      expect(result).toEqual({
        items: [
          {
            id: 'movement_1',
            type: 'TOP_UP',
            amountCents: 10000,
            effectiveDate: '2026-03-01',
            description: 'Contanti',
            createdAt: new Date('2026-03-01T10:00:00.000Z'),
            actorEmail: 'staff@airmanager.local',
            reversalOfId: null,
            hasReversal: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('maps a linked ADJUSTMENT row (reversalOfId set) and flags the reversed original (hasReversal, story 3.3 AC 1)', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1' });
      accountMovementFindMany.mockResolvedValue([
        {
          id: 'movement_adj',
          type: 'ADJUSTMENT',
          amountCents: -5000,
          description: 'Errore di registrazione',
          effectiveDate: new Date('2026-03-02T00:00:00.000Z'),
          createdAt: new Date('2026-03-02T10:00:00.000Z'),
          actorUser: { email: 'staff@airmanager.local' },
          reversalOfId: 'movement_1',
          reversal: null,
        },
        {
          id: 'movement_1',
          type: 'TOP_UP',
          amountCents: 5000,
          description: null,
          effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          actorUser: { email: 'staff@airmanager.local' },
          reversalOfId: null,
          reversal: { id: 'movement_adj' },
        },
      ]);
      accountMovementCount.mockResolvedValue(2);

      const result = await listAccountMovements(staffActor(), 'person_1', query);

      expect(result.items[0]).toMatchObject({ id: 'movement_adj', reversalOfId: 'movement_1', hasReversal: false });
      expect(result.items[1]).toMatchObject({ id: 'movement_1', reversalOfId: null, hasReversal: true });
    });

    it('a titolare can read their own statement, WITHOUT actorEmail (AC 1)', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1' });
      accountMovementFindMany.mockResolvedValue([
        {
          id: 'movement_1',
          type: 'TOP_UP',
          amountCents: 10000,
          description: 'Contanti',
          effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          actorUser: { email: 'staff@airmanager.local' },
          reversalOfId: null,
          reversal: null,
        },
      ]);
      accountMovementCount.mockResolvedValue(1);

      const result = await listAccountMovements(pilotActor('person_pilot'), 'person_pilot', query);

      expect(result.items[0]).not.toHaveProperty('actorEmail');
    });

    it('rejects a pilot reading someone else’s statement, BEFORE any query', async () => {
      await expect(listAccountMovements(pilotActor('person_pilot'), 'person_other', query)).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(accountFindUniqueMock).not.toHaveBeenCalled();
    });

    it('rejects a pilot with no linked person (personId: null)', async () => {
      await expect(listAccountMovements(pilotActor(null), 'person_1', query)).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(listAccountMovements(staffActor(), 'missing', query)).rejects.toThrow(NotFoundError);
      expect(accountFindUniqueMock).not.toHaveBeenCalled();
    });

    it('returns an empty page (total 0), NOT a 404, for a person with no account yet', async () => {
      accountFindUnique.mockResolvedValue(null);

      const result = await listAccountMovements(staffActor(), 'person_1', query);

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
      expect(accountMovementFindManyMock).not.toHaveBeenCalled();
    });

    it('paginates with the id tie-break, most-recent-first (review 3.1 F3 pattern)', async () => {
      accountFindUnique.mockResolvedValue({ id: 'account_1' });
      accountMovementFindMany.mockResolvedValue([]);
      accountMovementCount.mockResolvedValue(0);

      await listAccountMovements(staffActor(), 'person_1', { page: 2, pageSize: 10 });

      expect(accountMovementFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountId: 'account_1' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('recordTopUp — authorization (AD-5, AC 2)', () => {
    it('rejects an actor without finance.manage, before touching the DB', async () => {
      await expect(
        recordTopUp(pilotActor('person_pilot'), 'person_pilot', {
          amountCents: 10000,
          paymentMethod: 'CASH',
          effectiveDate: '2026-03-01',
          description: null,
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  describe('recordTopUp — the transaction (story 3.1, AC 2/3; AD-3)', () => {
    const input = { amountCents: 10000, paymentMethod: 'CASH' as const, effectiveDate: '2026-03-01', description: 'Contanti in segreteria' };

    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(recordTopUp(staffActor(), 'missing', input)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws an explicit error when the "Ricariche" cash category is missing (Dev Notes: never silently create it)', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      cashCategoryFindUnique.mockResolvedValue(null);

      await expect(recordTopUp(staffActor(), 'person_1', input)).rejects.toThrow(/Ricariche/);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('looks up the "Ricariche" category with isActive: true (story 3.4 Dev Notes) — a deactivated category also fails loudly, not silently', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      // A deactivated category is invisible to this WHERE (isActive: true),
      // so Prisma returns null exactly like a missing one — the same code
      // path, deliberately, per the Dev Notes.
      cashCategoryFindUnique.mockResolvedValue(null);

      await expect(recordTopUp(staffActor(), 'person_1', input)).rejects.toThrow(/Ricariche/);
      expect(cashCategoryFindUniqueMock).toHaveBeenCalledWith({
        where: { name: 'Ricariche', isActive: true },
        select: { id: true },
      });
    });

    it('upserts the Account, creates the TOP_UP AccountMovement and its linked CashMovement twin, all inside one transaction', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      cashCategoryFindUnique.mockResolvedValue({ id: 'category_ricariche' });
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      // The post-transaction re-read (getAccountOverview) needs its own fixtures.
      accountFindUnique.mockResolvedValue({ id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 10000 } });
      accountMovementFindMany.mockResolvedValue([]);

      const result = await recordTopUp(staffActor(), 'person_1', input);

      expect(accountUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' } }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account_1',
            type: 'TOP_UP',
            amountCents: 10000,
            paymentMethod: 'CASH',
            description: 'Contanti in segreteria',
            effectiveDate: new Date('2026-03-01'),
            actorUserId: 'staff_1',
          }),
        }),
      );
      expect(cashMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'category_ricariche',
            amountCents: 10000,
            description: 'Contanti in segreteria',
            effectiveDate: new Date('2026-03-01'),
            actorUserId: 'staff_1',
            accountMovementId: 'movement_1',
          }),
        }),
      );
      expect(result.balanceCents).toBe(10000);
    });

    it('normalizes a null description to null (not undefined) on both movements', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_1' });
      cashCategoryFindUnique.mockResolvedValue({ id: 'category_ricariche' });
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      accountFindUnique.mockResolvedValue({ id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 10000 } });
      accountMovementFindMany.mockResolvedValue([]);

      await recordTopUp(staffActor(), 'person_1', { ...input, description: null });

      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: null }) }),
      );
      expect(cashMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: null }) }),
      );
    });
  });

  describe('recordAdjustment (story 3.3, AC 1 — AD-3: a NEW movement, the original is never touched)', () => {
    const ACCOUNT = { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') };
    const PERSON = { id: 'person_1', firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com' };

    /** Flushes the fire-and-forget alert promise (`void sendNegativeBalanceAlert(...)`). */
    async function flushAsync(): Promise<void> {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }

    type HappyPathOptions = {
      balanceBeforeCents: number;
      amountCents: number;
      personEmail?: string | null;
      thresholdValue?: string;
      userLocale?: string | null;
    };

    function mockAdjustmentHappyPath(options: HappyPathOptions): void {
      personFindUnique.mockResolvedValue({
        ...PERSON,
        email: options.personEmail === undefined ? PERSON.email : options.personEmail,
      });
      accountFindUnique.mockResolvedValue(ACCOUNT);
      appSettingFindUnique.mockResolvedValue(options.thresholdValue === undefined ? null : { value: options.thresholdValue });
      queryRaw.mockResolvedValue([]);
      // First aggregate = the locked "balance before" read inside the tx;
      // second = buildOverview's post-commit balance.
      accountMovementAggregate
        .mockResolvedValueOnce({ _sum: { amountCents: options.balanceBeforeCents } })
        .mockResolvedValueOnce({ _sum: { amountCents: options.balanceBeforeCents + options.amountCents } });
      accountMovementCreate.mockResolvedValue({});
      accountMovementFindMany.mockResolvedValue([]);
      userFindUnique.mockResolvedValue(
        options.userLocale === undefined ? { locale: 'it' } : options.userLocale === null ? null : { locale: options.userLocale },
      );
    }

    it('rejects an actor without finance.manage (a pilot cannot rettificare, not even their own account), before touching the DB', async () => {
      await expect(
        recordAdjustment(pilotActor('person_pilot'), 'person_pilot', { amountCents: -100, reason: 'Errore' }),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);

      await expect(recordAdjustment(staffActor(), 'missing', { amountCents: -100, reason: 'Errore' })).rejects.toThrow(
        NotFoundError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the person has no account yet (Dev Notes: never create it implicitly)', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      accountFindUnique.mockResolvedValue(null);

      await expect(recordAdjustment(staffActor(), 'person_1', { amountCents: -100, reason: 'Errore' })).rejects.toThrow(
        NotFoundError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
      expect(accountMovementCreateMock).not.toHaveBeenCalled();
    });

    it('creates the ADJUSTMENT movement (reason in description, actor, linked original) WITHOUT ever updating the original (AD-3) and with NO CashMovement (story 3.4)', async () => {
      mockAdjustmentHappyPath({ balanceBeforeCents: 10000, amountCents: -2500 });
      accountMovementFindUnique.mockResolvedValue({ id: 'movement_1', accountId: 'account_1', reversal: null });

      const result = await recordAdjustment(staffActor(), 'person_1', {
        amountCents: -2500,
        reason: 'Importo errato',
        originalMovementId: 'movement_1',
      });

      expect(accountMovementCreateMock).toHaveBeenCalledTimes(1);
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account_1',
            type: 'ADJUSTMENT',
            amountCents: -2500,
            description: 'Importo errato',
            actorUserId: 'staff_1',
            reversalOfId: 'movement_1',
          }),
        }),
      );
      // The original stays intact: the mocked prisma exposes no
      // accountMovement.update/delete at all — any attempt would throw —
      // and the only write is the single create above. No CashMovement
      // either (cash-side corrections are story 3.4).
      expect(cashMovementCreateMock).not.toHaveBeenCalled();
      expect(result.balanceCents).toBe(7500);
    });

    it('locks the Account row (FOR UPDATE) inside the movement transaction (review 2.5 F1 pattern)', async () => {
      mockAdjustmentHappyPath({ balanceBeforeCents: 0, amountCents: 100 });

      await recordAdjustment(staffActor(), 'person_1', { amountCents: 100, reason: 'Quota mancante' });

      expect(queryRawMock).toHaveBeenCalledTimes(1);
      const [strings] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray];
      expect(strings.join('?')).toContain('FOR UPDATE');
    });

    it('throws NotFoundError for an originalMovementId belonging to ANOTHER account (never reveal it exists)', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      accountFindUnique.mockResolvedValue(ACCOUNT);
      accountMovementFindUnique.mockResolvedValue({ id: 'movement_x', accountId: 'account_OTHER', reversal: null });

      await expect(
        recordAdjustment(staffActor(), 'person_1', { amountCents: -100, reason: 'Errore', originalMovementId: 'movement_x' }),
      ).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
      expect(accountMovementCreateMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown originalMovementId', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      accountFindUnique.mockResolvedValue(ACCOUNT);
      accountMovementFindUnique.mockResolvedValue(null);

      await expect(
        recordAdjustment(staffActor(), 'person_1', { amountCents: -100, reason: 'Errore', originalMovementId: 'ghost' }),
      ).rejects.toThrow(NotFoundError);
      expect(accountMovementCreateMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the original already has a linked adjustment (reversalOfId is @unique)', async () => {
      personFindUnique.mockResolvedValue(PERSON);
      accountFindUnique.mockResolvedValue(ACCOUNT);
      accountMovementFindUnique.mockResolvedValue({
        id: 'movement_1',
        accountId: 'account_1',
        reversal: { id: 'movement_adj' },
      });

      await expect(
        recordAdjustment(staffActor(), 'person_1', { amountCents: -100, reason: 'Errore', originalMovementId: 'movement_1' }),
      ).rejects.toThrow(ConflictError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('maps a concurrent P2002 on the unique reversalOfId to ConflictError (TOCTOU backstop)', async () => {
      mockAdjustmentHappyPath({ balanceBeforeCents: 0, amountCents: -100 });
      accountMovementFindUnique.mockResolvedValue({ id: 'movement_1', accountId: 'account_1', reversal: null });
      accountMovementCreate.mockRejectedValue({ code: 'P2002' });

      await expect(
        recordAdjustment(staffActor(), 'person_1', { amountCents: -100, reason: 'Errore', originalMovementId: 'movement_1' }),
      ).rejects.toThrow(ConflictError);
    });

    describe('negative-balance band alert (AC 2/3 — stateless: only a WORSENING transition emails)', () => {
      it('ok → negative sends the alert email once, after the commit', async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: 5000, amountCents: -10000 });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: -10000, reason: 'Storno pacchetto' });
        await flushAsync();

        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mario@example.com' }));
      });

      it('ok → belowThreshold (a double worsening in one movement) sends exactly ONE email', async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: 0, amountCents: -30000 });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: -30000, reason: 'Storno pacchetto' });
        await flushAsync();

        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('negative → belowThreshold sends the alert (a further worsening within negative territory)', async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: -5000, amountCents: -20000 });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: -20000, reason: 'Storno' });
        await flushAsync();

        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT resend when the balance stays in the same band (AC 3)', async () => {
        // -5000 → -6000: both plain "negative" with the default -20000 threshold.
        mockAdjustmentHappyPath({ balanceBeforeCents: -5000, amountCents: -1000 });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: -1000, reason: 'Piccola correzione' });
        await flushAsync();

        expect(sendMock).not.toHaveBeenCalled();
      });

      it('does NOT send when the band improves (negative → ok)', async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: -5000, amountCents: 10000 });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: 10000, reason: 'Quota dimenticata' });
        await flushAsync();

        expect(sendMock).not.toHaveBeenCalled();
      });

      it('reads the threshold from AppSetting when present (key negativeBalanceAlertThresholdCents)', async () => {
        // With a -10000 threshold, -5000 → -15000 is negative → belowThreshold: alert.
        // (With the default -20000 both sides would be plain "negative": no alert.)
        mockAdjustmentHappyPath({ balanceBeforeCents: -5000, amountCents: -10000, thresholdValue: '-10000' });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: -10000, reason: 'Storno' });
        await flushAsync();

        expect(appSettingFindUniqueMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { key: 'negativeBalanceAlertThresholdCents' } }),
        );
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('skips silently when the person has no email — the movement stays valid', async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: 0, amountCents: -10000, personEmail: null });

        const result = await recordAdjustment(staffActor(), 'person_1', { amountCents: -10000, reason: 'Storno' });
        await flushAsync();

        expect(sendMock).not.toHaveBeenCalled();
        expect(accountMovementCreateMock).toHaveBeenCalledTimes(1);
        expect(result.balanceCents).toBe(-10000);
      });

      it('a failing SMTP send never fails the adjustment (email is outside the transaction)', async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: 0, amountCents: -10000 });
        sendMock.mockRejectedValue(new Error('SMTP down'));
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const result = await recordAdjustment(staffActor(), 'person_1', { amountCents: -10000, reason: 'Storno' });
        await flushAsync();

        expect(result.balanceCents).toBe(-10000);
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

      it("uses the recipient User's locale for the email (AD-7), not the actor's", async () => {
        mockAdjustmentHappyPath({ balanceBeforeCents: 0, amountCents: -10000, userLocale: 'en' });

        await recordAdjustment(staffActor(), 'person_1', { amountCents: -10000, reason: 'Storno' });
        await flushAsync();

        expect(vi.mocked(buildNegativeBalanceAlertEmail)).toHaveBeenCalledWith(
          'en',
          expect.objectContaining({ personName: 'Mario Rossi', balanceCents: -10000 }),
        );
      });
    });
  });

  describe('listNegativeBalances (story 3.3, AC 2 — the staff "saldi negativi" list)', () => {
    it('rejects an actor without finance.manage', async () => {
      await expect(listNegativeBalances(pilotActor())).rejects.toThrow(ForbiddenError);
      expect(accountMovementGroupByMock).not.toHaveBeenCalled();
    });

    it('returns [] when no account is negative (without the enrichment lookup)', async () => {
      accountMovementGroupBy.mockResolvedValue([]);

      const result = await listNegativeBalances(staffActor());

      expect(result).toEqual([]);
      expect(accountFindManyMock).not.toHaveBeenCalled();
    });

    it('queries only negative SUMs, most-negative first (the DB orders — SUM, never a stored column, AD-3)', async () => {
      accountMovementGroupBy.mockResolvedValue([]);

      await listNegativeBalances(staffActor());

      expect(accountMovementGroupByMock).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['accountId'],
          _sum: { amountCents: true },
          having: { amountCents: { _sum: { lt: 0 } } },
          orderBy: { _sum: { amountCents: 'asc' } },
        }),
      );
    });

    it('maps groups to person names + balance + last movement date, preserving the DB order', async () => {
      const lastA = new Date('2026-07-01T10:00:00.000Z');
      const lastB = new Date('2026-07-02T10:00:00.000Z');
      accountMovementGroupBy.mockResolvedValue([
        { accountId: 'account_a', _sum: { amountCents: -30000 }, _max: { createdAt: lastA } },
        { accountId: 'account_b', _sum: { amountCents: -500 }, _max: { createdAt: lastB } },
      ]);
      accountFindMany.mockResolvedValue([
        { id: 'account_b', person: { id: 'person_b', firstName: 'Bruna', lastName: 'Bianchi' } },
        { id: 'account_a', person: { id: 'person_a', firstName: 'Aldo', lastName: 'Neri' } },
      ]);

      const result = await listNegativeBalances(staffActor());

      expect(result).toEqual([
        { personId: 'person_a', firstName: 'Aldo', lastName: 'Neri', balanceCents: -30000, lastMovementAt: lastA },
        { personId: 'person_b', firstName: 'Bruna', lastName: 'Bianchi', balanceCents: -500, lastMovementAt: lastB },
      ]);
    });
  });
});

describe('recordAdjustmentSchema (story 3.3, AC 1; AD-2)', () => {
  it('accepts a negative adjustment with a reason', () => {
    expect(recordAdjustmentSchema.safeParse({ amountCents: -25000, reason: 'Importo errato' }).success).toBe(true);
  });

  it('accepts a positive adjustment linked to an original movement', () => {
    expect(
      recordAdjustmentSchema.safeParse({ amountCents: 5000, reason: 'Quota dimenticata', originalMovementId: 'movement_1' })
        .success,
    ).toBe(true);
  });

  it('rejects a zero amount (an adjustment must move the balance)', () => {
    expect(recordAdjustmentSchema.safeParse({ amountCents: 0, reason: 'Nulla' }).success).toBe(false);
  });

  it('rejects a missing or empty reason (AC 1: motivo obbligatorio)', () => {
    expect(recordAdjustmentSchema.safeParse({ amountCents: -100 }).success).toBe(false);
    expect(recordAdjustmentSchema.safeParse({ amountCents: -100, reason: '   ' }).success).toBe(false);
  });

  it('rejects a reason longer than 500 characters (shared free-text cap)', () => {
    expect(recordAdjustmentSchema.safeParse({ amountCents: -100, reason: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rejects a non-integer amount (AD-2: cents are always integer)', () => {
    expect(recordAdjustmentSchema.safeParse({ amountCents: -100.5, reason: 'Errore' }).success).toBe(false);
  });

  it('rejects amounts beyond ±INT_MAX (defense in depth, review 2.4 F2 pattern)', () => {
    expect(recordAdjustmentSchema.safeParse({ amountCents: 2_147_483_648, reason: 'Errore' }).success).toBe(false);
    expect(recordAdjustmentSchema.safeParse({ amountCents: -2_147_483_648, reason: 'Errore' }).success).toBe(false);
  });
});

describe('balanceBand (story 3.3, AC 2/3 — Dev Notes boundaries)', () => {
  const THRESHOLD = -20000;

  it('classifies 0 as ok (>= 0)', () => {
    expect(balanceBand(0, THRESHOLD)).toBe('ok');
  });

  it('classifies a positive balance as ok', () => {
    expect(balanceBand(15000, THRESHOLD)).toBe('ok');
  });

  it('classifies -1 as negative (< 0 but >= threshold)', () => {
    expect(balanceBand(-1, THRESHOLD)).toBe('negative');
  });

  it('classifies exactly the threshold as negative (>= threshold)', () => {
    expect(balanceBand(THRESHOLD, THRESHOLD)).toBe('negative');
  });

  it('classifies threshold − 1 as belowThreshold (< threshold)', () => {
    expect(balanceBand(THRESHOLD - 1, THRESHOLD)).toBe('belowThreshold');
  });
});

describe('recordTopUpSchema (story 3.1, AC 2; AD-2)', () => {
  it('accepts a valid top-up payload', () => {
    const result = recordTopUpSchema.safeParse({
      amountCents: 10000,
      paymentMethod: 'CASH',
      effectiveDate: '2026-03-01',
      description: 'Contanti',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero amount', () => {
    const result = recordTopUpSchema.safeParse({
      amountCents: 0,
      paymentMethod: 'CASH',
      effectiveDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative amount', () => {
    const result = recordTopUpSchema.safeParse({
      amountCents: -500,
      paymentMethod: 'CASH',
      effectiveDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer amount (AD-2: cents are always integer)', () => {
    const result = recordTopUpSchema.safeParse({
      amountCents: 100.5,
      paymentMethod: 'CASH',
      effectiveDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an amount above the Postgres INTEGER max (defense in depth, review 2.4 F2 pattern)', () => {
    const result = recordTopUpSchema.safeParse({
      amountCents: 2_147_483_648,
      paymentMethod: 'CASH',
      effectiveDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown payment method', () => {
    const result = recordTopUpSchema.safeParse({
      amountCents: 1000,
      paymentMethod: 'CRYPTO',
      effectiveDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });
});
