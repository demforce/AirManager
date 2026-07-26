import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listTransactionsQuerySchema } from '@/lib/schemas/transactions';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    accountMovement: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    cashMovement: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  },
}));

// `recordTransaction` is a pure dispatcher (Dev Notes) — its own tests mock
// the THREE delegated writers directly (same isolation rationale as
// `exports.service.test.ts`'s sibling-service mocks): these tests are about
// which writer gets called with which (sign-adjusted) args, not a
// re-verification of `recordTopUp`/`recordAdjustment`/`recordCashMovement`'s
// own already-tested logic.
vi.mock('./accounts.service', () => ({ recordTopUp: vi.fn(), recordAdjustment: vi.fn() }));
vi.mock('./cash.service', () => ({ recordCashMovement: vi.fn() }));

const { prisma } = await import('@/server/db/prisma');
const { getBillingKpis, getLedgerRevenueCents, listTransactions, recordTransaction } = await import('./transactions.service');
const { recordTopUp, recordAdjustment } = await import('./accounts.service');
const { recordCashMovement } = await import('./cash.service');

const accountFindManyMock = vi.mocked(prisma.accountMovement.findMany);
const accountCountMock = vi.mocked(prisma.accountMovement.count);
const accountAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const cashFindManyMock = vi.mocked(prisma.cashMovement.findMany);
const cashCountMock = vi.mocked(prisma.cashMovement.count);
const cashAggregateMock = vi.mocked(prisma.cashMovement.aggregate);
const recordTopUpMock = vi.mocked(recordTopUp);
const recordAdjustmentMock = vi.mocked(recordAdjustment);
const recordCashMovementMock = vi.mocked(recordCashMovement);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as cash.service.test.ts).
type Fixture = Record<string, unknown>;
const accountFindMany = accountFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void; mockResolvedValueOnce: (v: Fixture[]) => void };
const accountCount = accountCountMock as unknown as { mockResolvedValue: (v: number) => void; mockResolvedValueOnce: (v: number) => void };
const cashFindMany = cashFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void; mockResolvedValueOnce: (v: Fixture[]) => void };
const cashCount = cashCountMock as unknown as { mockResolvedValue: (v: number) => void; mockResolvedValueOnce: (v: number) => void };

type AggregateArgs = { where?: { effectiveDate?: { gte: Date; lte: Date } } };
/** Keys an `aggregate` mock implementation by the `[from,to]` bounds of its call — robust to `Promise.all` interleaving order, same rationale as `instructor-compensation.service.test.ts#payoutGroupBy`'s `mockImplementation` (never a brittle `mockResolvedValueOnce` chain). */
function aggregateByRange(mock: { mockImplementation: (fn: (args: AggregateArgs) => Promise<{ _sum: { amountCents: number | null } }>) => void }, sums: Record<string, number | null>): void {
  mock.mockImplementation(async (args) => {
    const gte = args.where?.effectiveDate?.gte;
    const key = gte ? gte.toISOString().slice(0, 10) : 'unbounded';
    return { _sum: { amountCents: sums[key] ?? null } };
  });
}
const accountAggregate = accountAggregateMock as unknown as {
  mockImplementation: (fn: (args: AggregateArgs) => Promise<{ _sum: { amountCents: number | null } }>) => void;
};
const cashAggregate = cashAggregateMock as unknown as {
  mockImplementation: (fn: (args: AggregateArgs) => Promise<{ _sum: { amountCents: number | null } }>) => void;
};

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

/** Same `mock.calls[0]?.[0] as { where: ... }` cast convention as `aircraft.service.test.ts`/`instructor-compensation.service.test.ts`. */
function whereArg(mock: { mock: { calls: unknown[][] } }): { AND: Record<string, unknown>[] } {
  const call = mock.mock.calls[0]?.[0] as { where: { AND: Record<string, unknown>[] } };
  return call.where;
}

const baseAccountRow: Fixture = {
  id: 'am_1',
  type: 'TOP_UP',
  amountCents: 10000,
  paymentMethod: 'CASH',
  description: 'Ricarica contanti',
  effectiveDate: new Date('2026-07-10T00:00:00.000Z'),
  createdAt: new Date('2026-07-10T09:00:00.000Z'),
  flightId: null,
  reversalOfId: null,
  reversal: null,
  cashMovement: null,
  account: { personId: 'person_1', person: { firstName: 'Elena', lastName: 'Nakamura' } },
};

const baseCashRow: Fixture = {
  id: 'cm_1',
  amountCents: -3000,
  description: 'Acquisto materiale',
  effectiveDate: new Date('2026-07-09T00:00:00.000Z'),
  createdAt: new Date('2026-07-09T08:00:00.000Z'),
  reversalOfId: null,
  reversal: null,
  accountMovementId: null,
  category: { name: 'Manutenzione' },
  accountMovement: null,
  pprRequest: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default zero-sum stub for BOTH aggregate mocks (`getLedgerRevenueCents`'s
  // new revenue computation) — `vi.clearAllMocks()` clears calls but NOT a
  // previously-set `mockImplementation`, so every test gets an explicit,
  // predictable baseline here; tests that care about the actual numbers
  // override it via `aggregateByRange`.
  accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));
  cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));
});

describe('listTransactionsQuerySchema (AC 1 — movementType XOR categoryId)', () => {
  it('accepts movementType alone', () => {
    expect(listTransactionsQuerySchema.safeParse({ page: 1, pageSize: 20, movementType: 'TOP_UP' }).success).toBe(true);
  });

  it('accepts categoryId alone', () => {
    expect(listTransactionsQuerySchema.safeParse({ page: 1, pageSize: 20, categoryId: 'cat_1' }).success).toBe(true);
  });

  it('rejects both movementType AND categoryId together', () => {
    const result = listTransactionsQuerySchema.safeParse({ page: 1, pageSize: 20, movementType: 'TOP_UP', categoryId: 'cat_1' });
    expect(result.success).toBe(false);
  });
});

describe('listTransactions (AC 1 — unified ledger)', () => {
  it('rejects a pilot (finance.manage required), no query issued', async () => {
    await expect(listTransactions(pilotActor(), { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
    expect(accountFindManyMock).not.toHaveBeenCalled();
    expect(cashFindManyMock).not.toHaveBeenCalled();
  });

  it('merges ACCOUNT + CASH rows, sorted effectiveDate desc then createdAt desc then id desc across sources', async () => {
    accountFindMany.mockResolvedValue([
      { ...baseAccountRow, id: 'am_new', effectiveDate: new Date('2026-07-10T00:00:00.000Z') },
      { ...baseAccountRow, id: 'am_old', effectiveDate: new Date('2026-07-08T00:00:00.000Z') },
    ]);
    accountCount.mockResolvedValue(2);
    cashFindMany.mockResolvedValue([{ ...baseCashRow, id: 'cm_mid', effectiveDate: new Date('2026-07-09T00:00:00.000Z') }]);
    cashCount.mockResolvedValue(1);

    const result = await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items.map((item) => item.id)).toEqual(['am_new', 'cm_mid', 'am_old']);
    expect(result.total).toBe(3);
  });

  it('tie-break id desc holds across sources when effectiveDate AND createdAt coincide (review 12.9 F1)', async () => {
    // Same-instant rows (ms-truncated createdAt: batch imports/seeds) must still come out in
    // GLOBAL id-desc order, interleaving the sources — the exact case the broken comparator
    // grouped per-source instead.
    const sameDate = new Date('2026-07-10T00:00:00.000Z');
    const sameCreated = new Date('2026-07-10T09:00:00.000Z');
    accountFindMany.mockResolvedValue([
      { ...baseAccountRow, id: 'id_a', effectiveDate: sameDate, createdAt: sameCreated },
      { ...baseAccountRow, id: 'id_c', effectiveDate: sameDate, createdAt: sameCreated },
    ]);
    accountCount.mockResolvedValue(2);
    cashFindMany.mockResolvedValue([
      { ...baseCashRow, id: 'id_b', effectiveDate: sameDate, createdAt: sameCreated },
      { ...baseCashRow, id: 'id_d', effectiveDate: sameDate, createdAt: sameCreated },
    ]);
    cashCount.mockResolvedValue(2);

    const result = await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items.map((item) => item.id)).toEqual(['id_d', 'id_c', 'id_b', 'id_a']);
  });

  it('normalizes ACCOUNT amounts club-centric (flipped sign): a positive-in-DB TOP_UP becomes negative (payment received)', async () => {
    accountFindMany.mockResolvedValue([baseAccountRow]);
    accountCount.mockResolvedValue(1);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    const result = await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({ id: 'am_1', source: 'ACCOUNT', amountCents: -10000, personName: 'Nakamura Elena' });
  });

  it('leaves CASH amounts as-is (already club-centric): a negative uscita stays negative', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([baseCashRow]);
    cashCount.mockResolvedValue(1);

    const result = await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({ id: 'cm_1', source: 'CASH', amountCents: -3000, personId: null, personName: null });
  });

  it('paginates CORRECTLY across the union (page 2 of a 3-row mixed set, pageSize 2)', async () => {
    // Both sources are asked for `skip + take` = 4 rows each, already ordered — the service merges/re-sorts/slices.
    accountFindMany.mockResolvedValue([
      { ...baseAccountRow, id: 'am_1', effectiveDate: new Date('2026-07-10T00:00:00.000Z') },
      { ...baseAccountRow, id: 'am_2', effectiveDate: new Date('2026-07-08T00:00:00.000Z') },
    ]);
    accountCount.mockResolvedValue(2);
    cashFindMany.mockResolvedValue([{ ...baseCashRow, id: 'cm_1', effectiveDate: new Date('2026-07-09T00:00:00.000Z') }]);
    cashCount.mockResolvedValue(1);

    const result = await listTransactions(staffActor(), { page: 2, pageSize: 2 });

    // Global order: am_1 (07-10), cm_1 (07-09), am_2 (07-08) — page 2 of size 2 is just [am_2].
    expect(result.items.map((item) => item.id)).toEqual(['am_2']);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
  });

  it('twin dedup WHERE (ACCOUNT side): excludes a zero-amount movement that has a linked cashMovement', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    const where = whereArg(accountFindManyMock);
    expect(where.AND).toContainEqual({ NOT: { AND: [{ amountCents: 0 }, { cashMovement: { isNot: null } }] } });
  });

  it('twin dedup WHERE (CASH side): excludes a twin whose linked account movement carries a non-zero amount', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    const where = whereArg(cashFindManyMock);
    expect(where.AND).toContainEqual({
      NOT: { AND: [{ accountMovementId: { not: null } }, { accountMovement: { amountCents: { not: 0 } } }] },
    });
  });

  it('a PACKAGE_PURCHASE-style zero-amount twin: only the CASH row is actionable=false and carries the person derived through accountMovement', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([
      {
        ...baseCashRow,
        id: 'cm_package',
        amountCents: 25000,
        accountMovementId: 'am_package',
        accountMovement: { amountCents: 0, account: { personId: 'person_2', person: { firstName: 'Paolo', lastName: 'Osei' } } },
      },
    ]);
    cashCount.mockResolvedValue(1);

    const result = await listTransactions(staffActor(), { page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({ id: 'cm_package', personId: 'person_2', personName: 'Osei Paolo', actionable: false });
  });

  it('applies from/to inclusive on effectiveDate to BOTH sources', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20, from: '2026-07-01', to: '2026-07-31' });

    const accountWhere = whereArg(accountFindManyMock);
    const cashWhere = whereArg(cashFindManyMock);
    expect(accountWhere.AND).toContainEqual({ effectiveDate: { gte: new Date('2026-07-01') } });
    expect(accountWhere.AND).toContainEqual({ effectiveDate: { lte: new Date('2026-07-31') } });
    expect(cashWhere.AND).toContainEqual({ effectiveDate: { gte: new Date('2026-07-01') } });
    expect(cashWhere.AND).toContainEqual({ effectiveDate: { lte: new Date('2026-07-31') } });
  });

  it('personId filters ACCOUNT by account.personId and CASH by the twin account.personId', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20, personId: 'person_9' });

    expect(whereArg(accountFindManyMock).AND).toContainEqual({ account: { personId: 'person_9' } });
    expect(whereArg(cashFindManyMock).AND).toContainEqual({ accountMovement: { account: { personId: 'person_9' } } });
  });

  it('movementType narrows to ACCOUNT only — CASH is skipped entirely (no query issued)', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20, movementType: 'ADJUSTMENT' });

    expect(whereArg(accountFindManyMock).AND).toContainEqual({ type: 'ADJUSTMENT' });
    expect(cashFindManyMock).not.toHaveBeenCalled();
    expect(cashCountMock).not.toHaveBeenCalled();
  });

  it('categoryId narrows to CASH only — ACCOUNT is skipped entirely (no query issued)', async () => {
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20, categoryId: 'cat_1' });

    expect(whereArg(cashFindManyMock).AND).toContainEqual({ categoryId: 'cat_1' });
    expect(accountFindManyMock).not.toHaveBeenCalled();
    expect(accountCountMock).not.toHaveBeenCalled();
  });

  it('direction=charge -> normalized-positive rows only (ACCOUNT: db amountCents<0; CASH: amountCents>0)', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20, direction: 'charge' });

    expect(whereArg(accountFindManyMock).AND).toContainEqual({ amountCents: { lt: 0 } });
    expect(whereArg(cashFindManyMock).AND).toContainEqual({ amountCents: { gt: 0 } });
  });

  it('direction=payment -> normalized-negative rows only (ACCOUNT: db amountCents>0; CASH: amountCents<0)', async () => {
    accountFindMany.mockResolvedValue([]);
    accountCount.mockResolvedValue(0);
    cashFindMany.mockResolvedValue([]);
    cashCount.mockResolvedValue(0);

    await listTransactions(staffActor(), { page: 1, pageSize: 20, direction: 'payment' });

    expect(whereArg(accountFindManyMock).AND).toContainEqual({ amountCents: { gt: 0 } });
    expect(whereArg(cashFindManyMock).AND).toContainEqual({ amountCents: { lt: 0 } });
  });
});

describe('getBillingKpis (AC 1/2 — TRUE server-side month aggregates, Europe/Rome)', () => {
  it('rejects a pilot (finance.manage required), no query issued', async () => {
    await expect(getBillingKpis(pilotActor())).rejects.toThrow(ForbiddenError);
    expect(accountFindManyMock).not.toHaveBeenCalled();
  });

  it('uses the current calendar month bounds for the raw ledger rows (paymentsCents/chargesCount/revenueByKind), AND both current+previous for the aggregate-based revenueCents (mid-month ref, no DST edge)', async () => {
    accountFindMany.mockResolvedValue([]);
    cashFindMany.mockResolvedValue([]);

    // 2026-07-15 12:00 UTC is unambiguously July in Europe/Rome (CEST, no DST edge).
    await getBillingKpis(staffActor(), new Date('2026-07-15T12:00:00.000Z'));

    // `fetchAllLedgerRows` is only ever called for the CURRENT month now (story Billing-1: the previous month's raw rows are no longer needed — `prevMonthRevenueCents` comes from `getLedgerRevenueCents`'s aggregate query instead).
    expect(accountFindManyMock).toHaveBeenCalledTimes(1);
    const accountWhere = accountFindManyMock.mock.calls[0]?.[0]?.where;
    expect(accountWhere?.AND).toContainEqual({ effectiveDate: { gte: new Date('2026-07-01') } });
    expect(accountWhere?.AND).toContainEqual({ effectiveDate: { lte: new Date('2026-07-31') } });

    const accountAggregateDates = accountAggregateMock.mock.calls.map((call) => (call[0] as { where: { effectiveDate: { gte: Date; lte: Date } } }).where.effectiveDate);
    expect(accountAggregateDates).toContainEqual({ gte: new Date('2026-07-01'), lte: new Date('2026-07-31') });
    expect(accountAggregateDates).toContainEqual({ gte: new Date('2026-06-01'), lte: new Date('2026-06-30') });
  });

  it('rolls the previous-month bound back across a year boundary (ref = January)', async () => {
    accountFindMany.mockResolvedValue([]);
    cashFindMany.mockResolvedValue([]);

    await getBillingKpis(staffActor(), new Date('2026-01-15T12:00:00.000Z'));

    const accountAggregateDates = accountAggregateMock.mock.calls.map((call) => (call[0] as { where: { effectiveDate: { gte: Date; lte: Date } } }).where.effectiveDate);
    expect(accountAggregateDates).toContainEqual({ gte: new Date('2025-12-01'), lte: new Date('2025-12-31') });
  });

  it('revenueCents/chargesCents/paymentsCents/netCents/counts — same fixture used across a positive ACCOUNT row and a negative+positive CASH pair', async () => {
    // Current month's raw rows (for paymentsCents/chargesCount/revenueByKind): one ACCOUNT charge (normalized +18500 from a -18500 db FLIGHT_CHARGE), one CASH entrata +5000, one CASH uscita -2000.
    accountFindMany.mockResolvedValue([{ ...baseAccountRow, id: 'am_charge', type: 'FLIGHT_CHARGE', amountCents: -18500 }]);
    cashFindMany.mockResolvedValue([
      { ...baseCashRow, id: 'cm_in', amountCents: 5000 },
      { ...baseCashRow, id: 'cm_out', amountCents: -2000 },
    ]);
    // getLedgerRevenueCents's own aggregate-based computation, same fixture: -18500 debit (FLIGHT_CHARGE) + 5000 non-twin cash entrata = 23500 current, 0 previous.
    aggregateByRange(accountAggregate, { '2026-07-01': -18500, '2026-06-01': 0 });
    aggregateByRange(cashAggregate, { '2026-07-01': 5000, '2026-06-01': 0 });

    const kpis = await getBillingKpis(staffActor(), new Date('2026-07-15T12:00:00.000Z'));

    expect(kpis.revenueCents).toBe(18500 + 5000);
    expect(kpis.chargesCents).toBe(18500 + 5000);
    expect(kpis.chargesCount).toBe(2);
    expect(kpis.paymentsCents).toBe(2000);
    expect(kpis.paymentsCount).toBe(1);
    expect(kpis.netCents).toBe(18500 + 5000 - 2000);
    expect(kpis.prevMonthRevenueCents).toBe(0);
  });

  it('revenueByKind groups by kind (AccountMovementType or CashCategory name), positives only, largest first', async () => {
    accountFindMany.mockResolvedValue([
      { ...baseAccountRow, id: 'am_a', type: 'FLIGHT_CHARGE', amountCents: -1000 },
      { ...baseAccountRow, id: 'am_b', type: 'FLIGHT_CHARGE', amountCents: -500 },
    ]);
    cashFindMany.mockResolvedValue([{ ...baseCashRow, id: 'cm_a', amountCents: 4000, category: { name: 'Carburante' } }]);

    const kpis = await getBillingKpis(staffActor(), new Date('2026-07-15T12:00:00.000Z'));

    expect(kpis.revenueByKind).toEqual([
      { kind: 'Carburante', amountCents: 4000 },
      { kind: 'FLIGHT_CHARGE', amountCents: 1500 },
    ]);
  });
});

describe('getLedgerRevenueCents (story Billing-1, AC 5/6 — replaces the old Σ-positivi definition)', () => {
  it('rejects a pilot (finance.manage required), no query issued', async () => {
    await expect(getLedgerRevenueCents(pilotActor(), '2026-07-01', '2026-07-31')).rejects.toThrow(ForbiddenError);
    expect(accountAggregateMock).not.toHaveBeenCalled();
  });

  it('queries the FULL where clause on both aggregates (review Billing-1 F4 — discriminant: a regression on any predicate here must fail loudly, not pass on a partial match)', async () => {
    accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));
    cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));

    await getLedgerRevenueCents(staffActor(), '2026-07-01', '2026-07-31');

    expect(accountAggregateMock.mock.calls[0]?.[0]).toEqual({
      where: {
        effectiveDate: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
        OR: [
          { type: 'FLIGHT_CHARGE' },
          { type: 'FLIGHT_CHARGE_REVERSAL' },
          { type: 'ADJUSTMENT', amountCents: { lt: 0 } },
          { type: 'ADJUSTMENT', amountCents: { gt: 0 }, reversalOfId: { not: null } },
        ],
      },
      _sum: { amountCents: true },
    });

    expect(cashAggregateMock.mock.calls[0]?.[0]).toEqual({
      where: {
        effectiveDate: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
        OR: [{ reversalOfId: null, amountCents: { gt: 0 } }, { reversalOfId: { not: null }, amountCents: { lt: 0 } }],
        NOT: { AND: [{ accountMovementId: { not: null } }, { accountMovement: { amountCents: { not: 0 } } }] },
      },
      _sum: { amountCents: true },
    });
  });

  it('a FLIGHT_CHARGE reversed in the SAME period nets to ZERO revenue (storno annulla il ricavo — the bug the old Σ-positivi definition had: it only ever summed the positive side and never subtracted a same-period storno)', async () => {
    // -18500 (the original FLIGHT_CHARGE) + 18500 (its FLIGHT_CHARGE_REVERSAL, same period) = 0.
    accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: -18500 + 18500 } }));
    cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: null } }));

    const revenueCents = await getLedgerRevenueCents(staffActor(), '2026-07-01', '2026-07-31');

    expect(revenueCents).toBe(0);
  });

  it('an unreversed FLIGHT_CHARGE counts in full (negated from its negative raw amount)', async () => {
    accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: -18500 } }));
    cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: null } }));

    const revenueCents = await getLedgerRevenueCents(staffActor(), '2026-07-01', '2026-07-31');

    expect(revenueCents).toBe(18500);
  });

  it('review Billing-1 F3 (the review\'s own case): a 5000c cash entrata reversed in the SAME period nets revenue 5000 -> 0, never counted as a cost', async () => {
    // The cash aggregate's OR now sums the +5000 entrata AND its -5000 storno together (same query) -> 0.
    accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));
    cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: 5000 + -5000 } }));

    const revenueCents = await getLedgerRevenueCents(staffActor(), '2026-07-01', '2026-07-31');

    expect(revenueCents).toBe(0);
  });

  it('review Billing-1 F3: a cash entrata reversed in a LATER period shows as NEGATIVE revenue in that later period (storno nel mese in cui avviene, mai retroattivo)', async () => {
    // Only the storno row (-5000, reversalOfId set) falls inside THIS period's query — the original +5000 entrata was recorded, and stays counted, in the earlier period.
    accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));
    cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: -5000 } }));

    const revenueCents = await getLedgerRevenueCents(staffActor(), '2026-08-01', '2026-08-31');

    expect(revenueCents).toBe(-5000);
  });

  it('review Billing-1 F3: a positive ADJUSTMENT reversal (e.g. stornoing a "Quota associativa" debit) nets revenue in ITS OWN period, not the original debit\'s', async () => {
    // Only the +800 reversal ADJUSTMENT falls inside THIS period's query.
    accountAggregate.mockImplementation(async () => ({ _sum: { amountCents: 800 } }));
    cashAggregate.mockImplementation(async () => ({ _sum: { amountCents: 0 } }));

    const revenueCents = await getLedgerRevenueCents(staffActor(), '2026-08-01', '2026-08-31');

    expect(revenueCents).toBe(-800);
  });
});

describe('recordTransaction (AC 4 — pure dispatcher onto the 3 pre-existing writers)', () => {
  it('TOP_UP delegates to recordTopUp with the SAME sign (a top-up is already positive on the wire)', async () => {
    recordTopUpMock.mockResolvedValue({ account: { id: 'acc_1', createdAt: new Date() }, balanceCents: 10000, recentMovements: [] });

    const result = await recordTransaction(staffActor(), {
      kind: 'TOP_UP',
      personId: 'person_1',
      amountCents: 10000,
      paymentMethod: 'CASH',
      effectiveDate: '2026-07-10',
    });

    expect(recordTopUpMock).toHaveBeenCalledWith(
      expect.anything(),
      'person_1',
      expect.objectContaining({ amountCents: 10000, paymentMethod: 'CASH', effectiveDate: '2026-07-10' }),
    );
    expect(result).toMatchObject({ kind: 'TOP_UP', account: { balanceCents: 10000 } });
  });

  it('ADJUSTMENT negates the positive wire amount into recordAdjustment\'s DB "addebito" sign convention, standalone (no originalMovementId)', async () => {
    recordAdjustmentMock.mockResolvedValue({ account: { id: 'acc_1', createdAt: new Date() }, balanceCents: -5000, recentMovements: [] });

    const result = await recordTransaction(staffActor(), { kind: 'ADJUSTMENT', personId: 'person_1', amountCents: 5000, reason: 'Addebito manuale' });

    expect(recordAdjustmentMock).toHaveBeenCalledWith(
      expect.anything(),
      'person_1',
      expect.objectContaining({ amountCents: -5000, reason: 'Addebito manuale' }),
    );
    expect(recordAdjustmentMock.mock.calls[0]?.[2]).not.toHaveProperty('originalMovementId');
    expect(result).toMatchObject({ kind: 'ADJUSTMENT', account: { balanceCents: -5000 } });
  });

  it('CASH direction=in keeps the positive sign; direction=out negates it; paymentMethod is forwarded as-is', async () => {
    recordCashMovementMock.mockResolvedValue({
      id: 'cm_1',
      categoryId: 'cat_1',
      categoryName: 'Manutenzione',
      amountCents: 5000,
      effectiveDate: '2026-07-10',
      description: null,
      actorEmail: 'staff@airmanager.local',
      createdAt: new Date(),
      reversalOfId: null,
      hasReversal: false,
      isAutomatic: false,
    });

    await recordTransaction(staffActor(), {
      kind: 'CASH',
      categoryId: 'cat_1',
      direction: 'in',
      amountCents: 5000,
      paymentMethod: 'CASH',
      effectiveDate: '2026-07-10',
    });
    expect(recordCashMovementMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 5000, paymentMethod: 'CASH' }));

    await recordTransaction(staffActor(), {
      kind: 'CASH',
      categoryId: 'cat_1',
      direction: 'out',
      amountCents: 5000,
      paymentMethod: 'BANK_TRANSFER',
      effectiveDate: '2026-07-10',
    });
    expect(recordCashMovementMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: -5000, paymentMethod: 'BANK_TRANSFER' }));
  });
});
