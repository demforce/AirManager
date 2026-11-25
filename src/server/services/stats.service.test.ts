import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: { flight: { findMany: vi.fn(), groupBy: vi.fn() } },
}));
vi.mock('./stats-rankings.service', () => ({ listStatsRanking: vi.fn(), readStatsRankingPreviewPair: vi.fn() }));
vi.mock('./transactions.service', () => ({ getLedgerRevenueByDay: vi.fn(), getLedgerRevenueCents: vi.fn() }));
// Story 12.11, AC 6: `fleetUtilization` reads `getSchedulingSettings` from the
// SIBLING `app-settings.service.ts` — mocked per this file's own doc-comment
// convention, defaulted to "no sched.* configured" (`resetMocksToEmpty`) so
// every PRE-EXISTING test keeps its old `fleetUtilization: null` behavior.
vi.mock('./app-settings.service', () => ({ getSchedulingSettings: vi.fn() }));

const { prisma } = await import('@/server/db/prisma');
const { getStats } = await import('./stats.service');
const { ValidationError } = await import('./errors');
const { listStatsRanking, readStatsRankingPreviewPair } = await import('./stats-rankings.service');
const { getLedgerRevenueByDay, getLedgerRevenueCents } = await import('./transactions.service');
const { getSchedulingSettings } = await import('./app-settings.service');

const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const rankingsMock = vi.mocked(readStatsRankingPreviewPair);
const instructorsMock = vi.mocked(listStatsRanking);
const getLedgerRevenueByDayMock = vi.mocked(getLedgerRevenueByDay);
const getLedgerRevenueCentsMock = vi.mocked(getLedgerRevenueCents);
const getSchedulingSettingsMock = vi.mocked(getSchedulingSettings);

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const empty = { items: [], total: 0 };

/** Sane empty defaults every test starts from — override per-scenario. */
function resetMocksToEmpty(): void {
  flightFindManyMock.mockResolvedValue([]);
  flightGroupByMock.mockResolvedValue([]);
  rankingsMock.mockResolvedValue({ hours: empty, money: empty });
  instructorsMock.mockResolvedValue({ ...empty, page: 1, pageSize: 8, ref: '2026-07', period: 'month' });
  getLedgerRevenueCentsMock.mockResolvedValue(0);
  getLedgerRevenueByDayMock.mockResolvedValue(new Map());
  getSchedulingSettingsMock.mockResolvedValue({ openTime: null, closeTime: null, minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMocksToEmpty();
});

/** 15 July 2026, well inside CEST — the fixed "now" every test anchors on unless it overrides it. */
const NOW = new Date('2026-07-15T10:00:00.000Z');

describe('getStats (story 12.10, AC 1)', () => {
  it('403s a caller without finance.manage (e.g. a pilot)', async () => {
    await expect(getStats(pilotActor(), { period: 'month' }, NOW)).rejects.toThrow(ForbiddenError);
    expect(flightGroupByMock).not.toHaveBeenCalled();
  });

  it('422s a FUTURE ref (month after the current Rome month)', async () => {
    await expect(getStats(adminActor(), { period: 'month', ref: '2026-08' }, NOW)).rejects.toThrow(ValidationError);
  });

  it('accepts ref === the current Rome month (not "future")', async () => {
    await expect(getStats(adminActor(), { period: 'month', ref: '2026-07' }, NOW)).resolves.toBeDefined();
  });

  it('builds a 6-point rolling series ending at ref for period=month, and a 12-point one for period=year', async () => {
    const monthResult = await getStats(adminActor(), { period: 'month', ref: '2026-07' }, NOW);
    expect(monthResult.series.months).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);

    const yearResult = await getStats(adminActor(), { period: 'year', ref: '2026-07' }, NOW);
    expect(yearResult.series.months).toEqual([
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ]);
  });

  it('rolls the series across a year boundary (ref=2026-02, period=month)', async () => {
    const result = await getStats(adminActor(), { period: 'month', ref: '2026-02' }, NOW);
    expect(result.series.months).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('movements/movementMix are coherent in the SAME unit (flights by type, ratifica 1) and the response carries exactly these keys', async () => {
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'flightType') {
        return [
          { flightType: 'SCHOOL', _count: { _all: 3 }, _sum: { minutes: 180 } },
          { flightType: 'TOURISM', _count: { _all: 2 }, _sum: { minutes: 90 } },
        ];
      }
      return [];
    }) as never);

    const result = await getStats(adminActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(result.kpis.movements).toBe(5); // 3 + 2 flights
    expect(result.kpis.flightMinutes).toBe(270);
    expect(result.movementMix).toEqual([
      { key: 'SCHOOL', count: 3 },
      { key: 'TOURISM', count: 2 },
    ]);
    // The `/api/v1/stats` contract (a future Flutter client reads it): the
    // exact key sets, so a field added or left behind fails here.
    expect(Object.keys(result.kpis).sort()).toEqual(['fleetUtilization', 'flightMinutes', 'movements', 'revenueCents']);
    expect(Object.keys(result.series).sort()).toEqual(['flightMinutes', 'months', 'revenueCents']);
    expect(result.movementMix.map((m) => m.key)).toEqual(['SCHOOL', 'TOURISM']);
  });

  it('returns bounded, independent previews and delegates current instructor compensation to the ranking service', async () => {
    const fast = { key: 'fast', label: 'Fast', minutes: 60, cents: 5 };
    const costly = { key: 'costly', label: 'Costly', minutes: 5, cents: 60 };
    rankingsMock.mockImplementation(async (scope) => scope === 'pilot'
      ? { hours: { items: [fast], total: 2000 }, money: { items: [costly], total: 2000 } }
      : { hours: { items: [fast], total: 400 }, money: { items: [costly], total: 400 } });
    const instructor = { ...fast, cents: 300 };
    instructorsMock.mockResolvedValue({ items: [instructor], total: 99, page: 1, pageSize: 8, ref: '2026-07', period: 'month' });
    const result = await getStats(adminActor(), { period: 'month' }, NOW);
    expect(result.rankings.pilotHours.items).toEqual([fast]);
    expect(result.rankings.pilotSpent.items).toEqual([costly]);
    expect(result.rankings.fleetHours.total).toBe(400);
    expect(result.rankings.fleetRevenue.items).toEqual([costly]);
    expect(result.rankings.instructorHours).toEqual({ items: [instructor], total: 99 });
    expect(instructorsMock).toHaveBeenCalledWith(adminActor(), { rank: 'instructor-hours', period: 'month', ref: '2026-07', page: 1, pageSize: 8 }, NOW);
    expect(rankingsMock).toHaveBeenCalledTimes(2);
  });

  it('uses the total operational fleet, not the number of preview rows, as the utilization denominator', async () => {
    getSchedulingSettingsMock.mockResolvedValue({ openTime: '08:00', closeTime: '20:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });
    rankingsMock.mockResolvedValue({ hours: { items: [{ key:'a', label: 'A', minutes: 6696, cents: 0 }], total: 12 }, money: empty });
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => args.by[0] === 'flightType'
      ? [{ flightType: 'SCHOOL', _count: { _all: 1 }, _sum: { minutes: 6696 } }]
      : []) as never);
    const result = await getStats(adminActor(), { period: 'month', ref: '2026-07' }, NOW);
    expect(result.kpis.fleetUtilization).toBeCloseTo(6696 / (31 * 12 * 60 * 12));
    rankingsMock.mockResolvedValue({ hours: empty, money: empty });
    expect((await getStats(adminActor(), { period: 'month' }, NOW)).kpis.fleetUtilization).toBeNull();
  });

  it('loads revenue once for the union of rolling and KPI windows, including legacy year-end amounts', async () => {
    getLedgerRevenueByDayMock.mockResolvedValue(new Map([
      ['2025-12-31', 500], ['2026-01-01', 1500], ['2026-02-01', -250], ['2026-12-15', 2000],
    ]));

    const result = await getStats(adminActor(), { period: 'year', ref: '2026-02' }, NOW);

    expect(getLedgerRevenueByDayMock).toHaveBeenCalledExactlyOnceWith(expect.anything(), '2025-03-01', '2026-12-31');
    expect(getLedgerRevenueCentsMock).not.toHaveBeenCalled();
    expect(result.kpis.revenueCents).toBe(3250);
    expect(result.series.revenueCents.slice(-4)).toEqual([0, 500, 1500, -250]);
  });

  it('folds grouped calendar days into months and leaves empty months at zero without reading whole flights', async () => {
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => args.by[0] === 'flightDate' ? [
      { flightDate: new Date('2025-12-31T00:00:00.000Z'), _sum: { minutes: 33 } },
      { flightDate: new Date('2026-01-01T00:00:00.000Z'), _sum: { minutes: 82 } },
      { flightDate: new Date('2026-01-31T00:00:00.000Z'), _sum: { minutes: 73 } },
    ] : []) as never);
    const result = await getStats(adminActor(), { period: 'month', ref: '2026-02' }, NOW);
    expect(result.series.flightMinutes).toEqual([0, 0, 0, 33, 155, 0]);
    expect(flightFindManyMock).not.toHaveBeenCalled();
    expect(flightGroupByMock.mock.calls.map(([args]) => args.by).filter(([by]) => by === 'flightDate')).toEqual([['flightDate']]);
  });
});
