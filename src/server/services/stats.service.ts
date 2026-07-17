import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { currentMonthRange } from '@/lib/period-presets';
import type { StatsQuery, StatsResponseDto } from '@/lib/schemas/stats';
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, dateOnlyInZone, zonedMidnightUtc } from '@/lib/zoned-time';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getSchedulingSettings } from './app-settings.service';
import { listAircraft } from './aircraft.service';
import { ValidationError } from './errors';
import { getCompensationSummary } from './instructor-compensation.service';
import { getLedgerRevenueCents } from './transactions.service';

/**
 * Statistics/reports (epic 12, story 12.10) — read-only aggregation over
 * flights/PPR/ledger/compensation, staff-only (`finance.manage`, ADMIN+
 * STAFF). No new model, no write path.
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
 * **Revenue (ratifica utente 4)** reuses `transactions.service.ts#getLedgerRevenueCents`
 * — the SAME sign-normalization + twin-dedup `getBillingKpis` uses,
 * parametrized on an arbitrary period instead of reimplemented (the
 * two-reader-divergence lesson from story 12.8's `getFlightTotals`).
 *
 * **Movements (ratifica utente 1)**: a "movimento" is either a REGISTERED
 * `Flight` or a COMPLETED `PprRequest` (a transit) — counted ONCE each,
 * never derived from takeoffs/landings. `movementMix` counts FLIGHTS by
 * `flightType` plus transits, in the SAME unit (a count of movements).
 *
 * **Instructors (ratifica utente 3)**: `minutes` is computed for ANY period
 * (a plain `groupBy` over SCHOOL flights) — `owedCents` is only meaningful
 * "as of now" (`getCompensationSummary`'s `owedMtd`/`owedYtd`), so it is
 * `null` whenever `ref` is NOT the current period, and is looked up ONLY
 * then (never called otherwise — a wasted query on every historical view).
 *
 * **`fleet[].revenueCents`/`topPilots[].spentCents` (ratifica utente 4)**
 * are FLIGHT-charge totals, a deliberately DIFFERENT notion from the
 * ledger-based `kpis.revenueCents`: `fleet[].revenueCents` is the
 * AIRCRAFT-component charge only (instructor time is not "the airframe's"
 * revenue), while `topPilots[].spentCents` is the pilot's full spend
 * (aircraft + instructor component — everything actually charged to them).
 */

type DateRange = { from: string; to: string };

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

/** Last day-of-month (1-based `month`), UTC-calendar arithmetic (day 0 of the next month) — same trick as `period-presets.ts`'s own private helper, duplicated here because that module only builds ranges anchored on "now", never an arbitrary `ref` month. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `[from, to]` inclusive bounds of the calendar month `yyyymm` (`YYYY-MM`) — `ref` is already a validated Rome calendar month, so this is pure calendar arithmetic, no timezone conversion needed. */
function monthRangeFor(yyyymm: string): DateRange {
  const [year, month] = yyyymm.split('-').map(Number) as [number, number];
  return { from: `${yyyymm}-01`, to: `${yyyymm}-${pad2(lastDayOfMonth(year, month))}` };
}

/** `[from, to]` inclusive bounds of the calendar YEAR containing `yyyymm`. */
function yearRangeFor(yyyymm: string): DateRange {
  const year = yyyymm.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
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

/** The current Rome calendar month as `YYYY-MM`. */
function currentMonthRef(now: Date): string {
  return currentMonthRange(now).from.slice(0, 7);
}

/** Semi-open `[from, to)` UTC instant bounds for a Rome calendar-day range (`DateRange`'s `to` is inclusive of that WHOLE day) — the `PprRequest.eta` instant filter, same pattern as `movements/page.tsx`/`ppr.service.ts#listPprRequests`. */
function etaWindow(range: DateRange): { gte: Date; lt: Date } {
  return { gte: zonedMidnightUtc(range.from, APP_TIMEZONE), lt: zonedMidnightUtc(addDaysDateOnly(range.to, 1), APP_TIMEZONE) };
}

/** `[gte, lte]` bounds for a `Flight.flightDate` (`@db.Date`) filter. */
function flightDateWindow(range: DateRange): { gte: Date; lte: Date } {
  return { gte: parseDateOnlyUtc(range.from), lte: parseDateOnlyUtc(range.to) };
}

export async function getStats(actor: Actor, query: StatsQuery, now: Date = new Date()): Promise<StatsResponseDto> {
  authorize(actor, 'finance.manage');

  const nowRef = currentMonthRef(now);
  const ref = query.ref ?? nowRef;
  if (ref > nowRef) {
    throw new ValidationError('ref must not be in the future.', undefined, 'STATS_REF_IN_FUTURE');
  }

  const isCurrentPeriod = query.period === 'month' ? ref === nowRef : ref.slice(0, 4) === nowRef.slice(0, 4);

  const kpiRange = query.period === 'month' ? monthRangeFor(ref) : yearRangeFor(ref);
  const seriesMonths = rollingMonths(ref, query.period === 'month' ? 6 : 12);
  const seriesRange: DateRange = { from: monthRangeFor(seriesMonths[0]!).from, to: monthRangeFor(seriesMonths[seriesMonths.length - 1]!).to };

  const kpiFlightWhere = { status: 'REGISTERED' as const, flightDate: flightDateWindow(kpiRange) };

  const [
    revenueSeries,
    kpiRevenueCents,
    seriesFlights,
    seriesTransitRows,
    typeGroups,
    aircraftGroups,
    personGroups,
    instructorGroups,
    kpiTransitCount,
    aircraftResult,
    compensation,
    schedulingSettings,
  ] = await Promise.all([
    Promise.all(
      seriesMonths.map((month) => {
        const range = monthRangeFor(month);
        return getLedgerRevenueCents(actor, range.from, range.to);
      }),
    ),
    getLedgerRevenueCents(actor, kpiRange.from, kpiRange.to),
    prisma.flight.findMany({ where: { status: 'REGISTERED', flightDate: flightDateWindow(seriesRange) }, select: { flightDate: true, minutes: true } }),
    prisma.pprRequest.findMany({ where: { status: 'COMPLETED', eta: etaWindow(seriesRange) }, select: { eta: true } }),
    prisma.flight.groupBy({ by: ['flightType'], where: kpiFlightWhere, _count: { _all: true }, _sum: { minutes: true } }),
    prisma.flight.groupBy({ by: ['aircraftId'], where: kpiFlightWhere, _sum: { minutes: true, aircraftAmountCents: true } }),
    prisma.flight.groupBy({ by: ['personId'], where: kpiFlightWhere, _sum: { minutes: true, aircraftAmountCents: true, instructorAmountCents: true } }),
    prisma.flight.groupBy({ by: ['instructorProfileId'], where: { ...kpiFlightWhere, flightType: 'SCHOOL' }, _sum: { minutes: true } }),
    prisma.pprRequest.count({ where: { status: 'COMPLETED', eta: etaWindow(kpiRange) } }),
    listAircraft(actor, { page: 1, pageSize: 100, includeArchived: false }),
    isCurrentPeriod ? getCompensationSummary(actor) : Promise.resolve(null),
    getSchedulingSettings(),
  ]);

  const personIds = personGroups.map((group) => group.personId);
  const instructorProfileIds = instructorGroups
    .map((group) => group.instructorProfileId)
    .filter((id): id is string => id !== null);

  const [people, instructorProfiles] = await Promise.all([
    personIds.length > 0 ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, firstName: true, lastName: true } }) : Promise.resolve([]),
    instructorProfileIds.length > 0
      ? prisma.instructorProfile.findMany({
          where: { id: { in: instructorProfileIds } },
          select: { id: true, personId: true, person: { select: { firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const nameByPersonId = new Map(people.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
  const owedCentsByPersonId = new Map<string, number | null>(
    compensation ? compensation.map((row) => [row.personId, query.period === 'month' ? row.owedMtdCents : row.owedYtdCents]) : [],
  );

  // --- kpis --------------------------------------------------------------
  const flightsCount = typeGroups.reduce((sum, group) => sum + group._count._all, 0);
  const flightMinutes = typeGroups.reduce((sum, group) => sum + (group._sum.minutes ?? 0), 0);
  const movements = flightsCount + kpiTransitCount;
  const transitShare = movements > 0 ? kpiTransitCount / movements : 0;

  // --- series --------------------------------------------------------------
  const seriesMinutesByMonth = new Map<string, number>();
  for (const flight of seriesFlights) {
    const key = toDateOnlyString(flight.flightDate).slice(0, 7);
    seriesMinutesByMonth.set(key, (seriesMinutesByMonth.get(key) ?? 0) + flight.minutes);
  }
  const seriesTransitsByMonth = new Map<string, number>();
  for (const ppr of seriesTransitRows) {
    const key = dateOnlyInZone(ppr.eta, APP_TIMEZONE).slice(0, 7);
    seriesTransitsByMonth.set(key, (seriesTransitsByMonth.get(key) ?? 0) + 1);
  }

  // --- fleet (ratifica utente 2: OPERATIONAL, non-archived aircraft only, `listAircraft` already orders by registration asc) ---
  const fleetTotalsByAircraftId = new Map(aircraftGroups.map((group) => [group.aircraftId, { minutes: group._sum.minutes ?? 0, revenueCents: group._sum.aircraftAmountCents ?? 0 }]));
  const fleet = aircraftResult.items
    .filter((aircraft) => aircraft.status === 'OPERATIONAL')
    .map((aircraft) => {
      const totals = fleetTotalsByAircraftId.get(aircraft.id);
      return { registration: aircraft.registration, minutes: totals?.minutes ?? 0, revenueCents: totals?.revenueCents ?? 0 };
    });

  // --- fleetUtilization (story 12.11, AC 6 — closes ratifica utente 2 from
  // 12.10): flown hours / available hours over the KPI window. `null` when
  // `sched.openTime`/`sched.closeTime` are absent OR there is no OPERATIONAL
  // aircraft — never a fake `0`/divide-by-zero.
  let fleetUtilization: number | null = null;
  if (schedulingSettings.openTime && schedulingSettings.closeTime && fleet.length > 0) {
    const dailyWindowMinutes = minutesOfDay(schedulingSettings.closeTime) - minutesOfDay(schedulingSettings.openTime);
    const daysInKpiRange = Math.round((parseDateOnlyUtc(kpiRange.to).getTime() - parseDateOnlyUtc(kpiRange.from).getTime()) / MS_PER_DAY) + 1;
    const availableMinutes = dailyWindowMinutes * daysInKpiRange * fleet.length;
    if (dailyWindowMinutes > 0 && availableMinutes > 0) {
      fleetUtilization = flightMinutes / availableMinutes;
    }
  }

  // --- movementMix (ratifica utente 1: fixed order, always all 4 keys) ---
  const countByType = new Map(typeGroups.map((group) => [group.flightType, group._count._all]));
  const movementMix = [
    { key: 'SCHOOL' as const, count: countByType.get('SCHOOL') ?? 0 },
    { key: 'TOURISM' as const, count: countByType.get('TOURISM') ?? 0 },
    { key: 'AERIAL_WORK' as const, count: countByType.get('AERIAL_WORK') ?? 0 },
    { key: 'TRANSIT' as const, count: kpiTransitCount },
  ];

  // --- instructors ---------------------------------------------------------
  const instructors = instructorGroups
    .filter((group): group is typeof group & { instructorProfileId: string } => group.instructorProfileId !== null)
    .map((group) => {
      const profile = instructorProfiles.find((p) => p.id === group.instructorProfileId);
      const name = profile ? `${profile.person.firstName} ${profile.person.lastName}` : '—';
      const owedCents = profile ? (owedCentsByPersonId.get(profile.personId) ?? null) : null;
      return { name, minutes: group._sum.minutes ?? 0, owedCents };
    })
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

  // --- topPilots (top 10 by minutes) ---------------------------------------
  const topPilots = personGroups
    .map((group) => ({
      name: nameByPersonId.get(group.personId) ?? '—',
      minutes: group._sum.minutes ?? 0,
      spentCents: (group._sum.aircraftAmountCents ?? 0) + (group._sum.instructorAmountCents ?? 0),
    }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
    .slice(0, 10);

  return {
    kpis: { revenueCents: kpiRevenueCents, flightMinutes, movements, transitShare, fleetUtilization },
    series: {
      months: seriesMonths,
      revenueCents: revenueSeries,
      flightMinutes: seriesMonths.map((month) => seriesMinutesByMonth.get(month) ?? 0),
      transitMovements: seriesMonths.map((month) => seriesTransitsByMonth.get(month) ?? 0),
    },
    fleet,
    movementMix,
    instructors,
    topPilots,
  };
}
