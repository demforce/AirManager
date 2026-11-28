import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { STATS_RANKING_PREVIEW_SIZE, type StatsQuery, type StatsResponseDto } from '@/lib/schemas/stats';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getSchedulingSettings } from './app-settings.service';
import { monthRangeFor, resolveStatsPeriod, type StatsDateRange } from './stats-period';
import { listStatsRanking, readStatsRankingPreviewPair } from './stats-rankings.service';
import { getLedgerRevenueByDay } from './transactions.service';

/**
 * Statistics/reports (epic 12, story 12.10) — read-only aggregation over
 * flights/ledger/compensation, `finance.manage` (ADMIN-only). No new
 * model, no write path.
 *
 * **`ref` supports full history** (ratifica utente 3): `ref` (`YYYY-MM`,
 * Europe/Rome calendar) defaults to the current Rome month and may be any
 * month up to and including it — a FUTURE `ref` is a 422. The KPI window is
 * the calendar MONTH of `ref` (`period=month`) or the calendar YEAR
 * containing `ref` (`period=year`); the chart SERIES is always a ROLLING
 * window ending at `ref` (6 points for `period=month`, 12 for
 * `period=year`) — the two windows are NOT the same range when
 * `period=year` and `ref` isn't December (matches the prototype's own
 * `months.slice(-chartN)`, never calendar-year-aligned for the series).
 *
 * **Revenue (ratifica utente 4)** reuses `transactions.service.ts#getLedgerRevenueByDay`
 * — the SAME sign-normalization + twin-dedup
 * `billing-summary.service.ts#getBillingSummary` uses, parametrized on an
 * arbitrary period instead of reimplemented (the two-reader-divergence
 * lesson from story 12.8's `getFlightTotals`).
 *
 * **Movements (ratifica utente 1)**: a "movimento" is
 * a `Flight` — counted ONCE, never derived from takeoffs/landings.
 * `movementMix` counts the same flights by `flightType`, in the SAME unit (a
 * count of movements).
 *
 * **Instructors (ratifica utente 3)**: `minutes` is computed for ANY period
 * (a plain `groupBy` over SCHOOL flights) — `owedCents` is only meaningful
 * "as of now" (`getCompensationSummary`'s `owedMtd`/`owedYtd`), so it is
 * `null` whenever `ref` is NOT the current period, and is looked up ONLY
 * then (never called otherwise — a wasted query on every historical view).
 * Since story 16.5 the summary also carries the instructors no longer active
 * whose owed is not zero, so theirs shows too; one the summary leaves out
 * (no longer active, owed zero) stays `null`.
 *
 * **fleet and pilot ranking monetary values (ratifica utente 4)**
 * are FLIGHT-charge totals, a deliberately DIFFERENT notion from the
 * ledger-based `kpis.revenueCents`: fleet revenue is the
 * AIRCRAFT-component charge only (instructor time is not "the airframe's"
 * revenue), while pilot spending is the pilot's full spend
 * (aircraft + instructor component — everything actually charged to them).
 */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `fleetUtilization`'s own day-count arithmetic (AC 6) — a private copy, same rationale as `expiries.service.ts`'s own `MS_PER_DAY` doc-comment: the day-BOUNDARY semantics that matter (`computeExpiryStatus`) stay a single shared implementation, this is only a millisecond-per-day constant for a date-only range span. */
const MS_PER_DAY = 86_400_000;

/** `"HH:MM"` -> minutes since midnight (AC 6) — same tiny private parser as `bookings.service.ts#minutesOfDay`, not shared: both are one-line, single-file-local helpers over the identical `sched.*` string format. */
function minutesOfDay(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

/** `yyyymm` shifted by `delta` whole months (may be negative). */
function shiftMonth(yyyymm: string, delta: number): string {
  const [year, month] = yyyymm.split('-').map(Number) as [number, number];
  const total = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(total / 12);
  const shiftedMonth = (total % 12) + 1;
  return `${shiftedYear}-${pad2(shiftedMonth)}`;
}

/** The last `n` months ENDING at `ref` INCLUSIVE, ascending (oldest first) — the rolling series window. */
function rollingMonths(ref: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(ref, i - (n - 1)));
}

/** `[gte, lte]` bounds for a `Flight.flightDate` (`@db.Date`) filter. */
function flightDateWindow(range: StatsDateRange): { gte: Date; lte: Date } {
  return { gte: parseDateOnlyUtc(range.from), lte: parseDateOnlyUtc(range.to) };
}

export async function getStats(actor: Actor, query: StatsQuery, now: Date = new Date()): Promise<StatsResponseDto> {
  authorize(actor, 'finance.manage');

  const { ref, range: kpiRange } = resolveStatsPeriod(query, now);
  const seriesMonths = rollingMonths(ref, query.period === 'month' ? 6 : 12);
  const seriesRange: StatsDateRange = { from: monthRangeFor(seriesMonths[0]!).from, to: monthRangeFor(seriesMonths[seriesMonths.length - 1]!).to };

  // An old year may contain December entries even when the rolling series
  // ends months earlier. Read the union, not only the chart's bounds.
  const revenueFrom = seriesRange.from < kpiRange.from ? seriesRange.from : kpiRange.from;
  const revenueTo = seriesRange.to > kpiRange.to ? seriesRange.to : kpiRange.to;
  const kpiFlightWhere = { flightDate: flightDateWindow(kpiRange) };

  const [
    revenueByDay,
    seriesFlights,
    typeGroups,
    fleetRanking,
    pilotRanking,
    instructorRanking,
    schedulingSettings,
  ] = await Promise.all([
    getLedgerRevenueByDay(actor, revenueFrom, revenueTo),
    prisma.flight.groupBy({ by: ['flightDate'], where: { flightDate: flightDateWindow(seriesRange) }, _sum: { minutes: true } }),
    prisma.flight.groupBy({ by: ['flightType'], where: kpiFlightWhere, _count: { _all: true }, _sum: { minutes: true } }),
    readStatsRankingPreviewPair('fleet', kpiRange),
    readStatsRankingPreviewPair('pilot', kpiRange),
    listStatsRanking(actor, { ...query, ref, rank: 'instructor-hours', page: 1, pageSize: STATS_RANKING_PREVIEW_SIZE }, now),
    getSchedulingSettings(),
  ]);

  // --- kpis --------------------------------------------------------------
  const flightsCount = typeGroups.reduce((sum, group) => sum + group._count._all, 0);
  const flightMinutes = typeGroups.reduce((sum, group) => sum + (group._sum.minutes ?? 0), 0);
  const movements = flightsCount;

  // --- series --------------------------------------------------------------
  let kpiRevenueCents = 0;
  const revenueByMonth = new Map<string, number>();
  for (const [day, amount] of revenueByDay) {
    if (day >= kpiRange.from && day <= kpiRange.to) kpiRevenueCents += amount;
    const key = day.slice(0, 7);
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + amount);
  }
  const seriesMinutesByMonth = new Map<string, number>();
  for (const flight of seriesFlights) {
    const key = toDateOnlyString(flight.flightDate).slice(0, 7);
    seriesMinutesByMonth.set(key, (seriesMinutesByMonth.get(key) ?? 0) + (flight._sum.minutes ?? 0));
  }

  // --- fleetUtilization (story 12.11, AC 6 — closes ratifica utente 2 from
  // 12.10): flown hours / available hours over the KPI window. `null` when
  // `sched.openTime`/`sched.closeTime` are absent OR there is no OPERATIONAL
  // aircraft — never a fake `0`/divide-by-zero.
  let fleetUtilization: number | null = null;
  if (schedulingSettings.openTime && schedulingSettings.closeTime && fleetRanking.hours.total > 0) {
    const dailyWindowMinutes = minutesOfDay(schedulingSettings.closeTime) - minutesOfDay(schedulingSettings.openTime);
    const daysInKpiRange = Math.round((parseDateOnlyUtc(kpiRange.to).getTime() - parseDateOnlyUtc(kpiRange.from).getTime()) / MS_PER_DAY) + 1;
    const availableMinutes = dailyWindowMinutes * daysInKpiRange * fleetRanking.hours.total;
    if (dailyWindowMinutes > 0 && availableMinutes > 0) {
      fleetUtilization = flightMinutes / availableMinutes;
    }
  }

  // --- movementMix (ratifica utente 1: fixed order, always both keys — story 19.5) ---
  const countByType = new Map(typeGroups.map((group) => [group.flightType, group._count._all]));
  const movementMix = [
    { key: 'SCHOOL' as const, count: countByType.get('SCHOOL') ?? 0 },
    { key: 'TOURISM' as const, count: countByType.get('TOURISM') ?? 0 },
  ];

  return {
    referenceMonth: ref,
    kpis: { revenueCents: kpiRevenueCents, flightMinutes, movements, fleetUtilization },
    series: {
      months: seriesMonths,
      revenueCents: seriesMonths.map((month) => revenueByMonth.get(month) ?? 0),
      flightMinutes: seriesMonths.map((month) => seriesMinutesByMonth.get(month) ?? 0),
    },
    movementMix,
    rankings: {
      fleetHours: fleetRanking.hours,
      fleetRevenue: fleetRanking.money,
      instructorHours: { items: instructorRanking.items, total: instructorRanking.total },
      pilotHours: pilotRanking.hours,
      pilotSpent: pilotRanking.money,
    },
  };
}
