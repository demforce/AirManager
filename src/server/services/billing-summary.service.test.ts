import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

/**
 * TDD (story Billing-1, AC 5/7) — `getBillingSummary` is a thin AGGREGATOR:
 * `result.revenueCents` and `byCategory` are pure delegation to
 * `getLedgerRevenueCents`/`getCashReport` (ratifica utente 4, "MAI
 * reimplementarle" — both already have their OWN dedicated unit tests, e.g.
 * `transactions.service.test.ts`'s `getLedgerRevenueCents` describe block
 * covers the "storno annulla il ricavo" rule) — so both sibling services are
 * MOCKED here, same isolation rationale as `stats.service.test.ts` mocking
 * `getLedgerRevenueCents` for the identical reason. `costCents`/`treasury`/
 * `deposits` are this module's OWN Prisma queries, tested against the raw
 * mocked client.
 */

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    cashMovement: { aggregate: vi.fn(), count: vi.fn() },
    accountMovement: { groupBy: vi.fn() },
  },
}));
vi.mock('./app-settings.service', () => ({ getTreasuryOpeningInternal: vi.fn() }));
vi.mock('./cash.service', () => ({ getCashReport: vi.fn() }));
// Review Billing-2 F6: `CASH_NOT_ALREADY_ON_ACCOUNT`/`CASH_COST_OR` are now
// re-exported from the REAL module (`vi.importActual`), only
// `getLedgerRevenueCents` is mocked — the OLD literal-copy fixtures below
// were the SAME hole review Billing-1 F4 closed elsewhere: if the real
// predicate ever changes, these copies silently stay frozen at the OLD
// shape and the assertions below would keep passing against a fixture
// nobody ships, never against the code that actually runs.
vi.mock('./transactions.service', async () => {
  const actual = await vi.importActual<typeof import('./transactions.service')>('./transactions.service');
  return { ...actual, getLedgerRevenueCents: vi.fn() };
});

const { prisma } = await import('@/server/db/prisma');
const { getTreasuryOpeningInternal } = await import('./app-settings.service');
const { getCashReport } = await import('./cash.service');
const { getLedgerRevenueCents } = await import('./transactions.service');
const { getBillingSummary } = await import('./billing-summary.service');

const cashAggregateMock = vi.mocked(prisma.cashMovement.aggregate);
const cashCountMock = vi.mocked(prisma.cashMovement.count);
const accountGroupByMock = vi.mocked(prisma.accountMovement.groupBy);
const getTreasuryOpeningInternalMock = vi.mocked(getTreasuryOpeningInternal);
const getCashReportMock = vi.mocked(getCashReport);
const getLedgerRevenueCentsMock = vi.mocked(getLedgerRevenueCents);

// Prisma's overloaded delegate types make a simplified fixture/implementation
// ambiguous (same workaround as every other service test in this codebase,
// e.g. `transactions.service.test.ts`'s `accountAggregate`/`cashAggregate`).
type AggregateResult = { _sum: { amountCents: number | null } };
const cashAggregateImpl = cashAggregateMock as unknown as { mockImplementation: (fn: (args: unknown) => Promise<AggregateResult>) => void };
const accountGroupBy = accountGroupByMock as unknown as { mockResolvedValue: (v: Array<{ accountId: string; _sum: { amountCents: number } }>) => void };

type Sums = { costRawSum?: number | null; cashSum?: number | null; bankSum?: number | null; unattributedSum?: number | null };

/**
 * Keys the 4 `cashMovement.aggregate` calls `getBillingSummary` makes
 * (cost, cash, bank, unattributed) by their DISTINGUISHING `where` shape —
 * robust regardless of `Promise.all` interleaving order, same rationale as
 * `transactions.service.test.ts`'s own `aggregateByRange` helper. Every raw
 * sum here is the RAW `_sum.amountCents` Prisma would return (signed,
 * un-negated) — `costRawSum` is therefore NEGATIVE for a real cost.
 */
function mockCashAggregates(sums: Sums): void {
  cashAggregateImpl.mockImplementation(async (args: unknown) => {
    const where = (args as { where: Record<string, unknown> }).where;
    if (where['paymentMethod'] === 'CASH') return { _sum: { amountCents: sums.cashSum ?? null } };
    if (where['paymentMethod'] === null) return { _sum: { amountCents: sums.unattributedSum ?? null } };
    if (where['paymentMethod'] && typeof where['paymentMethod'] === 'object') return { _sum: { amountCents: sums.bankSum ?? null } };
    return { _sum: { amountCents: sums.costRawSum ?? null } };
  });
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const REF = new Date('2026-07-15T12:00:00.000Z'); // unambiguously July in Europe/Rome (CEST, no DST edge).
const CASH_REPORT_FIXTURE = { from: '2026-07-01', to: '2026-07-31', totalInCents: 0, totalOutCents: 0, netCents: 0, categories: [], movementCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  getLedgerRevenueCentsMock.mockResolvedValue(0);
  getCashReportMock.mockResolvedValue(CASH_REPORT_FIXTURE);
  getTreasuryOpeningInternalMock.mockResolvedValue({ openingCashCents: 0, openingBankCents: 0, openingDate: null });
  accountGroupBy.mockResolvedValue([]);
  mockCashAggregates({});
  cashCountMock.mockResolvedValue(0);
});

describe('getBillingSummary (story Billing-1, AC 5)', () => {
  it('rejects a pilot (finance.manage required), no query issued', async () => {
    await expect(getBillingSummary(pilotActor(), REF)).rejects.toThrow(ForbiddenError);
    expect(getLedgerRevenueCentsMock).not.toHaveBeenCalled();
    expect(cashAggregateMock).not.toHaveBeenCalled();
  });

  it('result.revenueCents delegates VERBATIM to getLedgerRevenueCents for the ref month (never reimplemented)', async () => {
    getLedgerRevenueCentsMock.mockResolvedValue(23500);

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.result.revenueCents).toBe(23500);
    expect(getLedgerRevenueCentsMock).toHaveBeenCalledWith(expect.anything(), '2026-07-01', '2026-07-31');
  });

  it('result.costCents is the month\'s negative cash movements (normal uscite), FULL where clause asserted (review Billing-1 F4 — discriminant) — includes an instructor payout gemello (AC 4) exactly like any other cost category', async () => {
    // -7500 raw (the instructor payout's uscita, AC 4) -> costCents 7500.
    mockCashAggregates({ costRawSum: -7500 });

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.result.costCents).toBe(7500);
    const costCall = cashAggregateMock.mock.calls.find((call) => Array.isArray((call[0] as { where: Record<string, unknown> }).where['OR']));
    expect(costCall?.[0]).toEqual({
      where: {
        effectiveDate: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
        OR: [{ reversalOfId: null, amountCents: { lt: 0 } }, { reversalOfId: { not: null }, amountCents: { gt: 0 } }],
        NOT: { AND: [{ accountMovementId: { not: null } }, { accountMovement: { amountCents: { not: 0 } } }] },
      },
      _sum: { amountCents: true },
    });
  });

  it('review Billing-1 F3: a storno of an uscita in the SAME period nets costCents to ZERO (never left as a positive cost)', async () => {
    // -3000 (the original uscita) + 3000 (its storno, reversalOfId set, same period) = 0.
    mockCashAggregates({ costRawSum: -3000 + 3000 });

    const summary = await getBillingSummary(adminActor(), REF);

    // `-(0)` is `-0` in JS (`Object.is(-0, 0)` is false) — `===` treats them
    // as equal, which is the semantically correct check here (an integer
    // cents value, never a signed-zero-sensitive computation).
    expect(summary.result.costCents === 0).toBe(true);
  });

  it('review Billing-1 F3: a storno of an uscita in a LATER period shows as a NEGATIVE costCents there ("riduzione dei costi nel suo mese", never retroactive on the original\'s own month)', async () => {
    // Only the +3000 storno row falls inside THIS period's aggregate.
    mockCashAggregates({ costRawSum: 3000 });

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.result.costCents).toBe(-3000);
  });

  it('result.netCents = revenueCents - costCents', async () => {
    getLedgerRevenueCentsMock.mockResolvedValue(20000);
    mockCashAggregates({ costRawSum: -7500 });

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.result.netCents).toBe(20000 - 7500);
  });

  it('treasury.cashCents/bankCents = opening balance + Σ matching-method movements from openingDate onward, FULL where clause asserted (review Billing-1 F4)', async () => {
    getTreasuryOpeningInternalMock.mockResolvedValue({ openingCashCents: 100000, openingBankCents: 500000, openingDate: '2026-01-01' });
    mockCashAggregates({ cashSum: 15000, bankSum: -3000 });

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.treasury.cashCents).toBe(100000 + 15000);
    expect(summary.treasury.bankCents).toBe(500000 - 3000);
    const cashCall = cashAggregateMock.mock.calls.find((call) => (call[0] as { where: Record<string, unknown> }).where['paymentMethod'] === 'CASH');
    expect(cashCall?.[0]).toEqual({ where: { paymentMethod: 'CASH', effectiveDate: { gte: new Date('2026-01-01') } }, _sum: { amountCents: true } });
    const bankCall = cashAggregateMock.mock.calls.find(
      (call) => typeof (call[0] as { where: Record<string, unknown> }).where['paymentMethod'] === 'object',
    );
    expect(bankCall?.[0]).toEqual({
      where: { paymentMethod: { in: ['BANK_TRANSFER', 'POS'] }, effectiveDate: { gte: new Date('2026-01-01') } },
      _sum: { amountCents: true },
    });
  });

  it('no openingDate configured yet -> cash/bank aggregates are ALL-TIME (no effectiveDate filter at all), opening balances default to 0', async () => {
    getTreasuryOpeningInternalMock.mockResolvedValue({ openingCashCents: 0, openingBankCents: 0, openingDate: null });
    mockCashAggregates({ cashSum: 5000 });

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.treasury.cashCents).toBe(5000);
    const cashCall = cashAggregateMock.mock.calls.find((call) => (call[0] as { where: Record<string, unknown> }).where['paymentMethod'] === 'CASH');
    expect(cashCall?.[0]).toEqual({ where: { paymentMethod: 'CASH' }, _sum: { amountCents: true } });
  });

  it('a movement with NO method at all lands in unattributedCents, NEVER in cash/bank — queried ALL-TIME regardless of openingDate, FULL where clause asserted (review Billing-1 F4)', async () => {
    getTreasuryOpeningInternalMock.mockResolvedValue({ openingCashCents: 0, openingBankCents: 0, openingDate: '2026-01-01' });
    mockCashAggregates({ cashSum: 0, bankSum: 0, unattributedSum: 4200 });

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.treasury.unattributedCents).toBe(4200);
    expect(summary.treasury.cashCents).toBe(0);
    expect(summary.treasury.bankCents).toBe(0);
    const unattributedCall = cashAggregateMock.mock.calls.find((call) => (call[0] as { where: Record<string, unknown> }).where['paymentMethod'] === null);
    expect(unattributedCall?.[0]).toEqual({ where: { paymentMethod: null }, _sum: { amountCents: true } });
  });

  it('review Billing-2 F1: unattributedCount is a plain row COUNT over the SAME paymentMethod:null scope as the sum, from the SAME Promise.all — two opposite-signed unattributed rows (sum 0, count 2) still report count 2 so the UI link never disappears', async () => {
    mockCashAggregates({ unattributedSum: 0 });
    cashCountMock.mockResolvedValue(2);

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.treasury.unattributedCents).toBe(0);
    expect(summary.treasury.unattributedCount).toBe(2);
    expect(cashCountMock).toHaveBeenCalledWith({ where: { paymentMethod: null } });
  });

  it('a cash top-up (paymentMethod CASH, accountMovementId pointing at a NON-zero TOP_UP) feeds treasury.cashCents AND deposits.totalCents, but revenueCents is untouched (delegated separately, never re-derived from cash movements)', async () => {
    getLedgerRevenueCentsMock.mockResolvedValue(0); // no revenue this month
    mockCashAggregates({ cashSum: 15000 }); // the top-up's cash twin
    accountGroupBy.mockResolvedValue([{ accountId: 'acc_1', _sum: { amountCents: 15000 } }]); // the pilot's resulting positive balance

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.treasury.cashCents).toBe(15000);
    expect(summary.deposits.totalCents).toBe(15000);
    expect(summary.result.revenueCents).toBe(0);
  });

  it('deposits: positive account balances sum into totalCents, negative ones into exposureCents + inRedCount, FULL groupBy args asserted (review Billing-1 F4 — the 5th aggregate)', async () => {
    accountGroupBy.mockResolvedValue([
      { accountId: 'acc_1', _sum: { amountCents: 8000 } },
      { accountId: 'acc_2', _sum: { amountCents: 150 } },
      { accountId: 'acc_3', _sum: { amountCents: -180 } },
    ]);

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.deposits).toEqual({ totalCents: 8150, exposureCents: 180, inRedCount: 1 });
    expect(accountGroupByMock).toHaveBeenCalledWith({ by: ['accountId'], _sum: { amountCents: true } });
  });

  it('treasury.availableCents = cash + bank - deposits.totalCents', async () => {
    getTreasuryOpeningInternalMock.mockResolvedValue({ openingCashCents: 200000, openingBankCents: 1000000, openingDate: null });
    mockCashAggregates({});
    accountGroupBy.mockResolvedValue([{ accountId: 'acc_1', _sum: { amountCents: 8150 } }]);

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.treasury.availableCents).toBe(200000 + 1000000 - 8150);
  });

  it('byCategory is a straight pass-through of getCashReport for the ref month (AC 5: reuse, never reimplement)', async () => {
    const fixture = { ...CASH_REPORT_FIXTURE, totalInCents: 12345 };
    getCashReportMock.mockResolvedValue(fixture);

    const summary = await getBillingSummary(adminActor(), REF);

    expect(summary.byCategory).toBe(fixture);
    expect(getCashReportMock).toHaveBeenCalledWith(expect.anything(), { from: '2026-07-01', to: '2026-07-31' });
  });
});
