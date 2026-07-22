import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

/**
 * TDD (epic 12, story 12.10, AC 1) — written BEFORE `stats.service.ts` exists.
 *
 * Deliberately mocks the SIBLING services (`aircraft.service`,
 * `instructor-compensation.service`, `transactions.service`) rather than
 * Prisma for the pieces they own (same "sibling-service mock" isolation
 * convention as `exports.service.test.ts`) — these tests are about
 * `stats.service.ts`'s OWN contract (which windows it computes, how it
 * composes the results), not a re-verification of those services' own
 * already-tested logic.
 *
 * Critically, the mocked `prisma` below has NO `accountMovement`/
 * `cashMovement` delegate at all (ratifica utente 4: "MAI reimplementarle" —
 * revenue reuses `transactions.service.ts#getLedgerRevenueCents`
 * exclusively) — if `stats.service.ts` ever queried the ledger tables
 * directly instead of going through that helper, these tests would fail
 * with a "not a function" error immediately, which IS the "dedup twin nel
 * revenue" guarantee at this layer: the real twin-dedup/sign-normalization
 * behavior itself stays covered by `transactions.service.test.ts`'s own
 * (unmodified, still-green) suite.
 */

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    flight: { findMany: vi.fn(), groupBy: vi.fn() },
    pprRequest: { findMany: vi.fn(), count: vi.fn() },
    person: { findMany: vi.fn() },
    instructorProfile: { findMany: vi.fn() },
  },
}));

vi.mock('./aircraft.service', () => ({ listAircraft: vi.fn() }));
vi.mock('./instructor-compensation.service', () => ({ getCompensationSummary: vi.fn() }));
vi.mock('./transactions.service', () => ({ getLedgerRevenueCents: vi.fn() }));
// Story 12.11, AC 6: `fleetUtilization` reads `getSchedulingSettings` from the
// SIBLING `app-settings.service.ts` — mocked per this file's own doc-comment
// convention, defaulted to "no sched.* configured" (`resetMocksToEmpty`) so
// every PRE-EXISTING test keeps its old `fleetUtilization: null` behavior.
vi.mock('./app-settings.service', () => ({ getSchedulingSettings: vi.fn() }));

const { prisma } = await import('@/server/db/prisma');
const { getStats } = await import('./stats.service');
const { ValidationError } = await import('./errors');
const { listAircraft } = await import('./aircraft.service');
const { getCompensationSummary } = await import('./instructor-compensation.service');
const { getLedgerRevenueCents } = await import('./transactions.service');
const { getSchedulingSettings } = await import('./app-settings.service');

const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const pprFindManyMock = vi.mocked(prisma.pprRequest.findMany);
const pprCountMock = vi.mocked(prisma.pprRequest.count);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const instructorProfileFindManyMock = vi.mocked(prisma.instructorProfile.findMany);
const listAircraftMock = vi.mocked(listAircraft);
const getCompensationSummaryMock = vi.mocked(getCompensationSummary);
const getLedgerRevenueCentsMock = vi.mocked(getLedgerRevenueCents);
const getSchedulingSettingsMock = vi.mocked(getSchedulingSettings);

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const EMPTY_AIRCRAFT_RESULT = { items: [], total: 0, page: 1, pageSize: 100 };

/** Sane empty defaults every test starts from — override per-scenario. */
function resetMocksToEmpty(): void {
  flightFindManyMock.mockResolvedValue([]);
  flightGroupByMock.mockResolvedValue([]);
  pprFindManyMock.mockResolvedValue([]);
  pprCountMock.mockResolvedValue(0);
  personFindManyMock.mockResolvedValue([]);
  instructorProfileFindManyMock.mockResolvedValue([]);
  listAircraftMock.mockResolvedValue(EMPTY_AIRCRAFT_RESULT as never);
  getCompensationSummaryMock.mockResolvedValue([]);
  getLedgerRevenueCentsMock.mockResolvedValue(0);
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
    await expect(getStats(staffActor(), { period: 'month', ref: '2026-08' }, NOW)).rejects.toThrow(ValidationError);
  });

  it('accepts ref === the current Rome month (not "future")', async () => {
    await expect(getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW)).resolves.toBeDefined();
  });

  it('builds a 6-point rolling series ending at ref for period=month, and a 12-point one for period=year', async () => {
    const monthResult = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);
    expect(monthResult.series.months).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);

    const yearResult = await getStats(staffActor(), { period: 'year', ref: '2026-07' }, NOW);
    expect(yearResult.series.months).toEqual([
      '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ]);
  });

  it('rolls the series across a year boundary (ref=2026-02, period=month)', async () => {
    const result = await getStats(staffActor(), { period: 'month', ref: '2026-02' }, NOW);
    expect(result.series.months).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('buckets a PPR transit by its EUROPE/ROME calendar month, not its UTC one (bordi mese Rome)', async () => {
    // 2026-10-31T23:30Z is already CET (DST ended 2026-10-25) -> Rome wall-clock 2026-11-01T00:30, i.e. NOVEMBER.
    pprFindManyMock.mockResolvedValue([{ eta: new Date('2026-10-31T23:30:00.000Z') }] as never);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-11' }, new Date('2026-11-15T10:00:00.000Z'));
    const novIndex = result.series.months.indexOf('2026-11');
    const octIndex = result.series.months.indexOf('2026-10');
    expect(result.series.transitMovements[novIndex]).toBe(1);
    expect(result.series.transitMovements[octIndex]).toBe(0);
  });

  it('movements/movementMix are coherent in the SAME unit (flights by type + transits, ratifica 1)', async () => {
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'flightType') {
        return [
          { flightType: 'SCHOOL', _count: { _all: 3 }, _sum: { minutes: 180 } },
          { flightType: 'TOURISM', _count: { _all: 2 }, _sum: { minutes: 90 } },
          { flightType: 'AERIAL_WORK', _count: { _all: 1 }, _sum: { minutes: 30 } },
        ];
      }
      return [];
    }) as never);
    pprCountMock.mockResolvedValue(2);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(result.kpis.movements).toBe(8); // 3 + 2 + 1 flights + 2 transits
    expect(result.kpis.flightMinutes).toBe(300);
    expect(result.kpis.transitShare).toBeCloseTo(0.25);
    expect(result.movementMix).toEqual([
      { key: 'SCHOOL', count: 3 },
      { key: 'TOURISM', count: 2 },
      { key: 'AERIAL_WORK', count: 1 },
      { key: 'TRANSIT', count: 2 },
    ]);
  });

  it('transitShare is 0 when there are no movements at all (never NaN/Infinity)', async () => {
    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);
    expect(result.kpis.movements).toBe(0);
    expect(result.kpis.transitShare).toBe(0);
  });

  it('instructors: minutes computed for a HISTORICAL ref, owedCents forced null (never asks the compensation summary)', async () => {
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'instructorProfileId') {
        return [{ instructorProfileId: 'ip_1', _sum: { minutes: 120 } }];
      }
      return [];
    }) as never);
    instructorProfileFindManyMock.mockResolvedValue([{ id: 'ip_1', personId: 'person_instr', person: { firstName: 'Elena', lastName: 'Nakamura' } }] as never);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-01' }, NOW);

    expect(getCompensationSummaryMock).not.toHaveBeenCalled();
    expect(result.instructors).toEqual([{ name: 'Elena Nakamura', minutes: 120, owedCents: null }]);
  });

  it('instructors: owedCents populated from the compensation summary when ref IS the current period', async () => {
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'instructorProfileId') {
        return [{ instructorProfileId: 'ip_1', _sum: { minutes: 60 } }];
      }
      return [];
    }) as never);
    instructorProfileFindManyMock.mockResolvedValue([{ id: 'ip_1', personId: 'person_instr', person: { firstName: 'Elena', lastName: 'Nakamura' } }] as never);
    getCompensationSummaryMock.mockResolvedValue([
      { personId: 'person_instr', firstName: 'Elena', lastName: 'Nakamura', payoutRateCents: 4000, mtdMinutes: 60, ytdMinutes: 60, totalMinutes: 60, owedMtdCents: 4000, owedYtdCents: 4000, owedTotalCents: 4000 },
    ] as never);

    const monthResult = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);
    expect(getCompensationSummaryMock).toHaveBeenCalledTimes(1);
    expect(monthResult.instructors).toEqual([{ name: 'Elena Nakamura', minutes: 60, owedCents: 4000 }]);
  });

  it('topPilots: top 10 by minutes, spentCents = aircraft + instructor component, deterministic tie-break by name', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      personId: `p_${i}`,
      _sum: { minutes: i === 11 ? 100 : 100 - i, aircraftAmountCents: 1000, instructorAmountCents: 200 },
    }));
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'personId') return rows;
      return [];
    }) as never);
    personFindManyMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ id: `p_${i}`, firstName: 'Pilot', lastName: `${i}` })) as never,
    );

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(result.topPilots).toHaveLength(10);
    expect(result.topPilots[0]).toEqual({ name: 'Pilot 0', minutes: 100, spentCents: 1200 });
    // Two rows tie at 100 minutes (index 0 and index 11) -> tie-broken alphabetically by name ("Pilot 0" < "Pilot 11").
    expect(result.topPilots[1]).toEqual({ name: 'Pilot 11', minutes: 100, spentCents: 1200 });
  });

  it('fleet: only OPERATIONAL, non-archived aircraft, revenueCents is the AIRCRAFT-component only', async () => {
    listAircraftMock.mockResolvedValue({
      items: [
        { id: 'ac_1', registration: 'I-AERO', status: 'OPERATIONAL' },
        { id: 'ac_2', registration: 'I-OOS', status: 'OUT_OF_SERVICE' },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    } as never);
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'aircraftId') {
        return [
          { aircraftId: 'ac_1', _sum: { minutes: 240, aircraftAmountCents: 50000 } },
          { aircraftId: 'ac_2', _sum: { minutes: 999, aircraftAmountCents: 999999 } },
        ];
      }
      return [];
    }) as never);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(result.fleet).toEqual([{ registration: 'I-AERO', minutes: 240, revenueCents: 50000 }]);
  });

  // --- fleetUtilization (story 12.11, AC 6 — closes ratifica utente 2 from 12.10) ---

  it('fleetUtilization is null when sched.openTime/closeTime are not configured (default)', async () => {
    listAircraftMock.mockResolvedValue({ items: [{ id: 'ac_1', registration: 'I-AERO', status: 'OPERATIONAL' }], total: 1, page: 1, pageSize: 100 } as never);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(result.kpis.fleetUtilization).toBeNull();
  });

  it('fleetUtilization is null when there is NO OPERATIONAL aircraft, even if sched.* is configured', async () => {
    getSchedulingSettingsMock.mockResolvedValue({ openTime: '08:00', closeTime: '20:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });
    listAircraftMock.mockResolvedValue({ items: [{ id: 'ac_1', registration: 'I-OOS', status: 'OUT_OF_SERVICE' }], total: 1, page: 1, pageSize: 100 } as never);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(result.kpis.fleetUtilization).toBeNull();
  });

  it('fleetUtilization = flown hours / (window hours × days in the KPI range × OPERATIONAL aircraft)', async () => {
    getSchedulingSettingsMock.mockResolvedValue({ openTime: '08:00', closeTime: '20:00', minSlotMinutes: null, turnaroundMinutes: null, maxAdvanceDays: null });
    listAircraftMock.mockResolvedValue({ items: [{ id: 'ac_1', registration: 'I-AERO', status: 'OPERATIONAL' }], total: 1, page: 1, pageSize: 100 } as never);
    flightGroupByMock.mockImplementation((async (args: { by: string[] }) => {
      if (args.by[0] === 'flightType') return [{ flightType: 'TOURISM', _count: { _all: 1 }, _sum: { minutes: 6696 } }]; // 111.6h flown, an arbitrary round number vs. the 22320min/372h available window below.
      return [];
    }) as never);

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    // July = 31 days; window = 08:00-20:00 = 12h/day; 1 aircraft -> 31 * 12 * 60 = 22320 available minutes.
    expect(result.kpis.fleetUtilization).toBeCloseTo(6696 / 22320);
  });

  it('revenue reuses getLedgerRevenueCents for every series bucket AND the kpi window, with the correct [from,to] per call', async () => {
    getLedgerRevenueCentsMock.mockImplementation(async (_actor, from: string) => (from === '2026-07-01' ? 123456 : 0));

    const result = await getStats(staffActor(), { period: 'month', ref: '2026-07' }, NOW);

    expect(getLedgerRevenueCentsMock).toHaveBeenCalledTimes(7); // 6 series months + 1 kpi window
    expect(getLedgerRevenueCentsMock).toHaveBeenCalledWith(expect.anything(), '2026-07-01', '2026-07-31');
    expect(result.kpis.revenueCents).toBe(123456);
    expect(result.series.revenueCents[result.series.months.indexOf('2026-07')]).toBe(123456);
    expect(result.series.revenueCents[result.series.months.indexOf('2026-02')]).toBe(0);
  });
});
