import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordTopUpSchema } from '@/lib/schemas/accounts';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    accountMovement: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    person: {
      findUnique: vi.fn(),
    },
    cashCategory: {
      findUnique: vi.fn(),
    },
    cashMovement: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { getAccountOverview, recordTopUp } = await import('./accounts.service');
const { NotFoundError } = await import('./errors');

const accountFindUniqueMock = vi.mocked(prisma.account.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const accountMovementFindManyMock = vi.mocked(prisma.accountMovement.findMany);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const cashCategoryFindUniqueMock = vi.mocked(prisma.cashCategory.findUnique);
const cashMovementCreateMock = vi.mocked(prisma.cashMovement.create);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as aircraft.service.test.ts / people.service.test.ts).
type Fixture = Record<string, unknown> | null;
const accountFindUnique = accountFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementAggregate = accountMovementAggregateMock as unknown as {
  mockResolvedValue: (v: { _sum: { amountCents: number | null } }) => void;
};
const accountMovementFindMany = accountMovementFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const accountMovementCreate = accountMovementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const cashCategoryFindUnique = cashCategoryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };

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
    accountUpsertMock.mockReset();
    accountMovementAggregateMock.mockReset();
    accountMovementFindManyMock.mockReset();
    accountMovementCreateMock.mockReset();
    personFindUniqueMock.mockReset();
    cashCategoryFindUniqueMock.mockReset();
    cashMovementCreateMock.mockReset();
    transactionMock.mockReset();
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
