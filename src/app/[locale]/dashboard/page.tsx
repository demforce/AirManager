import type { ReactElement } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import type { BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icons';
import { KPI } from '@/components/ui/kpi';
import { FleetCard, type FleetCardItem } from '@/components/dashboard/fleet-card';
import { MobileAlertsCard, type MobileAlertsCardItem } from '@/components/dashboard/mobile-alerts-card';
import { MobileMetarCard } from '@/components/dashboard/mobile-metar-card';
import { ScadenzeWidget } from '@/components/dashboard/scadenze-widget';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { dayPhaseOf, filterInProgress, type DayPhase } from '@/lib/booking-day-phase';
import { clampToWindowPercent, formatWallClock, projectDayBlocks, resolveWindowMinutes, wallMinutesOfDay } from '@/lib/booking-schedule';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { categoryOf } from '@/lib/expiry-status';
import { formatCents } from '@/lib/money';
import { buildOverviewAlerts } from '@/lib/overview-alerts';
import { deriveApprovedPprMovementStatus } from '@/lib/ppr-movement-status';
import { APP_TIMEZONE, formatDateOnly, formatDateTime, formatMinutes, formatTimeOfDay } from '@/lib/time';
import { addDaysDateOnly, dateOnlyInZone, todayDateOnlyInZone, zonedMidnightUtc } from '@/lib/zoned-time';
import { hasPermission, type Actor } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getAccountOverview, listNegativeBalances } from '@/server/services/accounts.service';
import { listAircraft, listOutOfServiceAircraft } from '@/server/services/aircraft.service';
import { getAirfieldBranding, getAirfieldIcao, getMetarStation, getSchedulingSettings } from '@/server/services/app-settings.service';
import {
  getOwnInstructorProfileId,
  listActiveInstructors,
  listBookableAircraft,
  listBookings,
  listCalendarBookings,
  listReservedAircraftIds,
  type BookingListItem,
} from '@/server/services/bookings.service';
import { listAllExpiries, listPersonExpiries } from '@/server/services/expiries.service';
import { getFlightTotals } from '@/server/services/flights.service';
import { getOwnCompensationSummary } from '@/server/services/instructor-compensation.service';
import { getMetar } from '@/server/services/metar.service';
import { getMe, type MeResult } from '@/server/services/me.service';
import { listPeople } from '@/server/services/people.service';
import { listPprRequests } from '@/server/services/ppr.service';
import { getEffectiveRates, todayDateOnlyUtc } from '@/server/services/rates.service';
import { getStats } from '@/server/services/stats.service';
import {
  buildBookingsTableLabels,
  buildNewBookingFormLabels,
  buildScheduleLabels,
  buildEditBookingFormLabels,
  buildSchedulingWindowSummary,
} from './bookings/booking-labels';
import { BookingsTable, type BookingRowDto, type BookingStatusDto } from './bookings/bookings-table';
import type { PersonOption } from './bookings/new-booking-form';
import { Schedule, type CalendarNav } from './bookings/schedule';
import { DispatchFlightButton } from './dispatch-flight-button';
import type { FlightEditorLabels } from './logbook/flight-editor';
import { MobileBookingList, type MobileBookingRow } from './mobile-booking-list';
import { MobilePendingBookings, type MobilePendingBookingRow } from './mobile-pending-bookings';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type DisplayLocale = 'it' | 'en';

// --- Shared small constants (AC 1/4/5) --------------------------------------
// Same "small admin-managed list" convention as `bookings/page.tsx`'s own
// `OPTIONS_PAGE_SIZE`/`fleet/page.tsx`'s fleet-wide reads — a real airfield's
// roster/fleet comfortably fits in one page.
const OPTIONS_PAGE_SIZE = 100;
/** Mirrors `movements/page.tsx`'s own `KPI_SCAN_LIMIT` — every currently-open APPROVED PPR request, for the "in transito al suolo" derivation. */
const PPR_GROUND_SCAN_LIMIT = 500;
/** The embedded "Prenotazioni" card shows a handful of rows — "next page" deep-links into the full `/dashboard/bookings` list (`bookings-table.tsx#pageHref` is hardcoded to that route regardless of caller). */
const EMBED_BOOKINGS_PAGE_SIZE = 8;
/** Same set `bookings/page.tsx#ALL_BOOKING_STATUSES` shows — the embedded table is the SAME "Prenotazioni" card, same `startsAt`-ascending order, just row-capped. */
const ALL_BOOKING_STATUSES: readonly BookingStatusDto[] = ['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED'];
/**
 * Generous cap on scadenze fetched for the widest widget window (60 days) —
 * the widget then filters/slices client-side per the 7/30/60 toggle without a
 * second round-trip. Review 12.12 F4 (accepted): the counts the widget shows
 * (e.g. "+N altre") are therefore also capped at this scan limit, not true
 * all-time totals — "Vedi tutte" links to `/dashboard/expiries`, which pages
 * through everything.
 */
const EXPIRIES_WIDGET_SCAN_LIMIT = 60;
/**
 * Story 15.3: rows of the mobile "Prenotazioni in attesa" card. The query that
 * feeds it is the one the desktop card already runs for its windowed PENDING
 * COUNT (`embedPendingResult`, review 12.12 F3) — this story only asks it for
 * rows too, so the card lists what the count counts and no query is added.
 * Deliberately NOT "filter PENDING out of the 8 mixed-status rows the desktop
 * table shows": on a busy day those 8 can contain zero pending ones while the
 * head claims five, which is exactly the class of defect 12.12 F3 was about.
 */
const MOBILE_PENDING_BOOKINGS_PAGE_SIZE = 8;

/**
 * Protected home page (story 12.12) — an AirOps-native, role-based landing:
 * console operativa reale per admin/staff (AC 1), "la mia giornata" per
 * l'istruttore (AC 5), saldo/scadenze/prossimi voli per pilota/allievo (AC
 * 4). The face is chosen from the REAL session role/permessi, never a query
 * param (AC 6) — gate order: `finance.manage` → an ACTIVE `InstructorProfile`
 * → `me.person`.
 *
 * Story 14.6 (D2/item 16 — "profili solo attivi"): the instructor face used
 * to gate on the coarser INSTRUCTOR *role* alone. A role and a profile's
 * activation state can diverge — `people.service.ts#deactivateProfile` never
 * touches `User.roles`, and `users.service.ts#updateUser` can set/clear
 * roles and the linked `personId` independently of any profile — so role
 * alone could still land someone whose `InstructorProfile` was deactivated
 * (or never linked) on the instructor console instead of their own
 * pilot/student landing. `getOwnInstructorProfileId` already resolves `null`
 * for exactly that case (deactivated or absent), so it is the correct gate;
 * resolving it once here also drops the duplicate lookup
 * `renderInstructorLanding` used to make for the same value.
 *
 * `src/proxy.ts` already blocks unauthenticated requests before they reach
 * this route; the session is re-checked here, close to the data fetch (AD-5).
 */
export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const displayLocale: DisplayLocale = locale === 'en' ? 'en' : 'it';

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  const me = await getMe(actor);

  const canManageFinance = hasPermission(actor, 'finance.manage');
  const ownInstructorProfileId = canManageFinance ? null : await getOwnInstructorProfileId(actor);
  const showInstructorFace = !canManageFinance && ownInstructorProfileId !== null;
  const showPersonalFace = !canManageFinance && !showInstructorFace && me.person !== null;

  if (canManageFinance) {
    return renderAdminOverview(actor, locale as AppLocale, displayLocale);
  }
  if (showInstructorFace && ownInstructorProfileId) {
    return renderInstructorLanding(actor, me, ownInstructorProfileId, locale as AppLocale, displayLocale);
  }
  if (showPersonalFace) {
    return renderPilotLanding(actor, me, locale as AppLocale, displayLocale);
  }

  // Defensive fallback (Dev Notes): no REAL seed role ever falls through
  // here (every role holds `finance.manage`, the `INSTRUCTOR` role, or a
  // linked person) — kept for type-safety and any future role with none of
  // the three, never a crash.
  const t = await getTranslations('DashboardPage');
  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('fallback.title')}</h1>
          <div className="sub">{t('fallback.sub')}</div>
        </div>
      </div>
    </main>
  );
}

// --- Mobile home, shared across the three faces (story 15.3) ----------------

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** `DashboardPage.mobile.detail.*` — the nouns every booking bottom sheet lists. */
type MobileDetailLabels = {
  aircraft: string;
  pilot: string;
  instructor: string;
  startsAt: string;
  endsAt: string;
  duration: string;
  notes: string;
};

function buildMobileDetailLabels(t: Translator): MobileDetailLabels {
  return {
    aircraft: t('mobile.detail.aircraft'),
    pilot: t('mobile.detail.pilot'),
    instructor: t('mobile.detail.instructor'),
    startsAt: t('mobile.detail.startsAt'),
    endsAt: t('mobile.detail.endsAt'),
    duration: t('mobile.detail.duration'),
    notes: t('mobile.detail.notes'),
  };
}

/**
 * Rows of a booking's bottom sheet (AC 8, template's own `openBooking`): the
 * sheet shows everything the card shows PLUS what the card has no room for
 * (istruttore, durata, note). The STATUS is the sheet's badge, never a
 * duplicated line — the same choice `ppr-console.tsx#detailRows` made.
 */
function bookingDetailRows(booking: BookingListItem, labels: MobileDetailLabels, displayLocale: DisplayLocale, noValue: string): BottomSheetRow[] {
  const minutes = Math.max(0, Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000));
  return [
    { k: labels.aircraft, v: booking.aircraftRegistration },
    { k: labels.pilot, v: booking.personName ?? noValue },
    { k: labels.instructor, v: booking.instructorName ?? noValue },
    { k: labels.startsAt, v: formatDateTime(booking.startsAt, displayLocale) },
    { k: labels.endsAt, v: formatDateTime(booking.endsAt, displayLocale) },
    { k: labels.duration, v: `${formatMinutes(minutes)} h` },
    { k: labels.notes, v: booking.notes ?? noValue },
  ];
}

/** Mono over-line of every booking sheet ("PRENOTAZIONE · 30/07/2026"): the bookings have no human-facing number, so the date is what identifies the record (review 15.2 F6: a missing value never becomes part of the accessible name). */
function bookingSheetSub(booking: BookingListItem, bookingLabel: string, displayLocale: DisplayLocale): string {
  return `${bookingLabel} · ${formatDateOnly(dateOnlyInZone(booking.startsAt, APP_TIMEZONE), displayLocale)}`;
}

/** `HH:MM–HH:MM`, the mono sub-line of the mobile rows. */
function slotRange(booking: BookingListItem, displayLocale: DisplayLocale): string {
  return `${formatTimeOfDay(booking.startsAt, displayLocale)}–${formatTimeOfDay(booking.endsAt, displayLocale)}`;
}

/**
 * "Meteo campo" card (ratifica R-15.3-f) — rendered by the PAGE on all three
 * faces and visible only <=640px, because `Sidebar`'s own weather card is
 * `display: none` from 900px down: on a phone this is the ONLY way to see the
 * airfield weather, not a duplicate of something visible.
 *
 * `getMetar` keeps a 10-minute in-memory cache per station, so this is normally
 * the same cache entry `dashboard/layout.tsx` already filled; a cold process can
 * miss twice, once every 10 minutes — the cost the ratifica accepted. Any
 * failure degrades to `null` by the service's contract, and `null` renders
 * NOTHING (same `metar &&` guard the sidebar has always applied).
 */
async function renderMobileMetarCard(title: string): Promise<ReactElement | null> {
  const station = await getMetarStation();
  const metar = await getMetar(station);
  if (!metar) return null;
  return <MobileMetarCard station={station} tempC={Math.round(metar.tempC)} category={metar.category} raw={metar.raw} labels={{ title }} />;
}

// --- AdminOverview (AC 1) ----------------------------------------------------

/** Same day-scoped `/dashboard/bookings` href builder as `bookings/page.tsx#calendarHref`, simplified: the Overview always shows TODAY, so there is no `?page` list-state to preserve. */
function bookingsHref(overrides: { view?: 'day' | 'week'; date?: string }, today: string): { pathname: '/dashboard/bookings'; query: Record<string, string> } {
  const query: Record<string, string> = {};
  if (overrides.view && overrides.view !== 'day') query.view = overrides.view;
  if (overrides.date && overrides.date !== today) query.date = overrides.date;
  return { pathname: '/dashboard/bookings', query };
}

async function renderAdminOverview(actor: Actor, locale: AppLocale, displayLocale: DisplayLocale): Promise<ReactElement> {
  const t = await getTranslations('DashboardPage');
  const tBookings = await getTranslations('BookingsPage');
  const tLogbook = await getTranslations('LogbookPage');

  const now = new Date();
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const todayStart = zonedMidnightUtc(today, APP_TIMEZONE);
  const tomorrowStart = zonedMidnightUtc(addDaysDateOnly(today, 1), APP_TIMEZONE);
  const listFrom = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  // Sequential (NOT Promise.all): `listAircraft`/`listPeople` each run their
  // own interactive `$transaction` (Dev Notes, `people.service.ts#listPeople`'s
  // own doc-comment) — never concurrently with EACH OTHER.
  const aircraftResult = await listAircraft(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });
  const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });

  const allAircraftIds = aircraftResult.items.map((aircraft) => aircraft.id);
  const operationalIds = aircraftResult.items.filter((aircraft) => aircraft.status === 'OPERATIONAL').map((aircraft) => aircraft.id);

  const [
    icao,
    branding,
    schedulingSettings,
    reservedIds,
    currentRatesById,
    pendingPprResult,
    groundScanResult,
    pendingBookingsResult,
    monthStats,
    flightsTodayTotals,
    calendarBookingsToday,
    embedPendingResult,
    embedBookingsResult,
    expiriesResult,
    scheduleAircraftOptions,
    instructorOptions,
    negativeBalances,
    metarCard,
    outOfServiceAircraft,
  ] = await Promise.all([
    getAirfieldIcao(),
    getAirfieldBranding(),
    getSchedulingSettings(),
    listReservedAircraftIds(actor, allAircraftIds, now),
    getEffectiveRates(actor, allAircraftIds, todayDateOnlyUtc()),
    listPprRequests(actor, { status: 'PENDING', page: 1, pageSize: 1 }),
    listPprRequests(actor, { status: 'APPROVED', to: today, page: 1, pageSize: PPR_GROUND_SCAN_LIMIT }),
    listBookings(actor, { status: ['PENDING'], page: 1, pageSize: 1 }),
    getStats(actor, { period: 'month' }),
    getFlightTotals(actor, { dateFrom: today, dateTo: today, status: 'REGISTERED', page: 1, pageSize: 1 }),
    listCalendarBookings(actor, { from: todayStart.toISOString(), to: tomorrowStart.toISOString() }),
    // Windowed PENDING count for the desktop card's "N in attesa" summary
    // (review 12.12 F3) AND, since story 15.3, the ROWS of the mobile
    // "Prenotazioni in attesa" card — same query, so the card lists exactly
    // what its head counts.
    listBookings(actor, { from: listFrom, status: ['PENDING'], page: 1, pageSize: MOBILE_PENDING_BOOKINGS_PAGE_SIZE }),
    // The card's ROWS: one `startsAt`-ascending query over every status, so
    // the embedded table reads in the same order as `/dashboard/bookings`
    // (PO decision 2026-07-26, replacing story 12.12's pending-first
    // ordering — two concatenated queries made the dates look unsorted).
    listBookings(actor, { from: listFrom, status: [...ALL_BOOKING_STATUSES], page: 1, pageSize: EMBED_BOOKINGS_PAGE_SIZE }),
    listAllExpiries(actor, { window: '60', page: 1, pageSize: EXPIRIES_WIDGET_SCAN_LIMIT }),
    listBookableAircraft(actor),
    listActiveInstructors(actor),
    // Story 15.3 (ratifica R-15.3-e): the ONE new query the mobile "Avvisi"
    // feed needed — a `groupBy` with a `having` on the aggregate plus one name
    // lookup, `finance.manage`-gated exactly like this face. Not
    // `hasNegativeBalanceAlert`, which is the per-charge point check, not a list.
    listNegativeBalances(actor),
    // IN the Promise.all, not awaited after it (review 15.3 F6): the card costs
    // a settings read plus an upstream HTTP fetch, and serializing it added
    // that latency to every render of the home — including at 1280px, where the
    // card has a 0x0 box. R-15.3-f ratified the double fetch, not the wait.
    renderMobileMetarCard(t('mobile.metarTitle')),
    // Story AOG-1a, AC 13 (ratifica R-AOG-f): the FLEET-WIDE grounded set, the
    // very same unpaginated reader `/dashboard/fleet` uses for its own "N AOG".
    // See `aogCount` below for the defect this closes.
    listOutOfServiceAircraft(actor),
  ]);

  // --- .sub: ICAO (D3) + AOG + PPR pending + al suolo (12.4 reuse) --------
  // Story AOG-1a, AC 13 — was `aircraftResult.items.length - operationalIds.length`,
  // i.e. the grounded aircraft among the FIRST `OPTIONS_PAGE_SIZE` (100) by
  // registration only: measured on a post-suite DB (148 active aircraft) the
  // Panoramica announced "1 AOG" while the Flotta announced the true "3 AOG",
  // same instant, same data. `listOutOfServiceAircraft` is unpaginated, filters
  // on `status`, and is already gated on the same `aircraft.manage` — the two
  // pages now count with ONE reader. (The wider `OPTIONS_PAGE_SIZE` TD on the
  // other three pages stays open, out of this story's perimeter.)
  const aogCount = outOfServiceAircraft.length;
  const onGroundCount = groundScanResult.items.filter((item) => deriveApprovedPprMovementStatus(item.eta, now) === 'AL_SUOLO').length;
  const subParts = [
    icao || null,
    t('overview.aogCount', { count: aogCount }),
    t('overview.pprPendingCount', { count: pendingPprResult.total }),
    t('overview.onGroundCount', { count: onGroundCount }),
  ].filter((part): part is string => Boolean(part));

  // --- KPI row (AC 1) ------------------------------------------------------
  const trulyAvailableCount = operationalIds.filter((id) => !reservedIds.has(id)).length;
  // Review 12.12 F2, PO-ratified overcount 2026-07-19: planned + flown; a
  // today APPROVED booking keeps counting after its flight is registered —
  // FLOWN is a separate manual step.
  const flightsToday = flightsTodayTotals.count + calendarBookingsToday.length;

  // --- Embedded Schedule (vista giorno, oggi) — data-prep shared with `bookings/page.tsx` (@/lib/booking-schedule, AC 1) ---
  const { start: windowStartMinutes, end: windowEndMinutes } = resolveWindowMinutes(schedulingSettings.openTime, schedulingSettings.closeTime);
  const dayBlocks = projectDayBlocks(calendarBookingsToday, today, windowStartMinutes, windowEndMinutes);
  const nowLinePercent = clampToWindowPercent(wallMinutesOfDay(now) - windowStartMinutes, windowEndMinutes - windowStartMinutes);
  // Ratifica R-15.4-g: the embedded create/edit panels are the SAME components
  // `/dashboard/bookings` mounts, so they get the same "which window" message.
  const schedulingWindowSummary = buildSchedulingWindowSummary(tBookings, schedulingSettings);
  const calendarNav: CalendarNav = {
    prevHref: bookingsHref({ date: addDaysDateOnly(today, -1) }, today),
    nextHref: bookingsHref({ date: addDaysDateOnly(today, 1) }, today),
    dayViewHref: bookingsHref({ view: 'day' }, today),
    weekViewHref: bookingsHref({ view: 'week' }, today),
  };

  // --- Embedded BookingsTable (startsAt ascending) ------------------------
  // Same order as `/dashboard/bookings` (PO decision 2026-07-26): the card is
  // a window onto that list, so it must not reorder it. Pending bookings stay
  // findable via their badge, the "N in attesa" card summary and the KPI.
  const embedBookingItems: BookingListItem[] = embedBookingsResult.items;
  const embedBookingRows: BookingRowDto[] = embedBookingItems.map((booking) => ({
    id: booking.id,
    aircraftId: booking.aircraftId,
    aircraftRegistration: booking.aircraftRegistration,
    personId: booking.personId,
    personName: booking.personName,
    instructorProfileId: booking.instructorProfileId,
    instructorName: booking.instructorName,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    startsAtDateOnly: dateOnlyInZone(booking.startsAt, APP_TIMEZONE),
    endsAtDateOnly: dateOnlyInZone(booking.endsAt, APP_TIMEZONE),
    notes: booking.notes,
    status: booking.status,
    denyReason: booking.denyReason,
  }));
  const embedTotal = embedBookingsResult.total;
  const embedTotalPages = Math.max(1, Math.ceil(embedTotal / EMBED_BOOKINGS_PAGE_SIZE));

  const staffPersonOptions: PersonOption[] = peopleResult.items
    .filter((person) => person.archivedAt === null && (person.profiles.pilot || person.profiles.student || person.profiles.instructor))
    .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));

  // --- "Pianifica volo" CTA — the real `flights.manage` FlightEditor (story 12.8), reused as-is ---
  // Story AOG-1a, AC 12 — same option shape (and same suffix language) as the registro voli' own picker.
  const dispatchAircraftOptions = aircraftResult.items.map((aircraft) => ({
    id: aircraft.id,
    registration: aircraft.registration,
    status: aircraft.status,
    statusReason: aircraft.statusReason,
  }));
  const dispatchPersonOptions = peopleResult.items
    .filter((person) => person.profiles.pilot || person.profiles.student)
    .map((person) => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      profiles: { pilot: person.profiles.pilot, student: person.profiles.student },
    }));
  const dispatchInstructorOptions = peopleResult.items
    .filter((person) => person.profiles.instructor)
    .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));

  const fleetItems: FleetCardItem[] = aircraftResult.items.map((aircraft) => ({
    id: aircraft.id,
    registration: aircraft.registration,
    type: aircraft.type,
    model: aircraft.model,
    hourMeterMinutes: aircraft.hourMeterMinutes,
    notes: aircraft.notes,
    status: aircraft.status,
    statusReason: aircraft.statusReason,
    seats: aircraft.seats,
    fuelType: aircraft.fuelType,
    based: aircraft.based,
    archivedAt: null,
    wetRateCents: currentRatesById.get(aircraft.id)?.priceCentsPerHour ?? null,
    reserved: reservedIds.has(aircraft.id),
  }));

  // --- Mobile Panoramica (story 15.3) -------------------------------------
  // Same DOM, one CSS switch: `.overview-mobile` is `display: none` above
  // 640px and the five desktop surfaces it replaces (`.home-desktop-surface`)
  // are `display: none` below it. No query here is new except
  // `listNegativeBalances` above: the rows below are derivations of data the
  // desktop face already had on the page.
  const mobileDetailLabels = buildMobileDetailLabels(t);
  const mobileNoValue = t('pilotLanding.noValue');
  const bookingLabel = t('mobile.bookingLabel');

  // Ratifica R-15.3-a: "In corso ora", NOT the template's "In volo ora" — the
  // app has no airborne state at all (`FlightStatus` is REGISTERED|CANCELLED,
  // a flight is logged afterwards), so what the card can honestly show is the
  // BOOKING covering this instant. Derived from `calendarBookingsToday`, which
  // is already in hand, with the pure boundary of `@/lib/booking-day-phase`.
  const inProgressBookings = filterInProgress(calendarBookingsToday, now);
  const inProgressRows: MobileBookingRow[] = inProgressBookings.map((booking) => ({
    id: booking.id,
    tail: booking.aircraftRegistration,
    title: booking.personName ?? mobileNoValue,
    sub: booking.instructorName ? `${slotRange(booking, displayLocale)} · ${booking.instructorName}` : slotRange(booking, displayLocale),
    badgeTone: 'warn',
    // Same wording the instructor face already uses for this exact state —
    // one lexicon, one key, no second string that could drift.
    badgeLabel: t('instructorLanding.status.inProgress'),
    sheetSub: bookingSheetSub(booking, bookingLabel, displayLocale),
    sheetTitle: `${booking.aircraftRegistration} · ${booking.personName ?? mobileNoValue}`,
    detail: bookingDetailRows(booking, mobileDetailLabels, displayLocale, mobileNoValue),
  }));

  const pendingRows: MobilePendingBookingRow[] = embedPendingResult.items.map((booking) => ({
    id: booking.id,
    title: booking.personName ?? tBookings('occupied'),
    sub: `${booking.aircraftRegistration} · ${formatDateTime(booking.startsAt, displayLocale)}`,
    sheetSub: bookingSheetSub(booking, bookingLabel, displayLocale),
    detail: bookingDetailRows(booking, mobileDetailLabels, displayLocale, mobileNoValue),
  }));

  // Ratifica R-15.3-e: scadenze + saldi negativi + PPR in attesa, ordered by
  // real urgency and capped at 5. The order and the cap are unit-tested on the
  // pure function (AD-4); here only the wording is added.
  const alerts = buildOverviewAlerts({
    expiries: expiriesResult.items,
    negativeBalances,
    pprPendingCount: pendingPprResult.total,
    // The same cap the fetch above used: when the scan comes back full, the
    // feed's "+N" is a floor and says so (review 15.3 F7).
    expiriesScanLimit: EXPIRIES_WIDGET_SCAN_LIMIT,
  });
  const alertItems: MobileAlertsCardItem[] = alerts.items.map((alert) => {
    const common = { key: alert.key, kind: alert.kind, tone: alert.tone, href: alert.href };
    switch (alert.kind) {
      case 'expiry': {
        const { personLastName, personFirstName, typeName, daysUntil } = alert.expiry;
        // The SAME three templates `ScadenzeWidget` renders, so the same
        // scadenza reads identically on both surfaces.
        const sub =
          daysUntil === 0
            ? t('scadenzeWidget.today')
            : daysUntil < 0
              ? t('scadenzeWidget.ago', { n: Math.abs(daysUntil) })
              : t('scadenzeWidget.inDays', { n: daysUntil });
        return { ...common, title: `${personLastName} ${personFirstName} · ${typeName}`, sub };
      }
      case 'negativeBalance':
        return {
          ...common,
          title: `${alert.balance.lastName} ${alert.balance.firstName}`,
          sub: t('overview.mobile.alerts.balanceSub', { amount: formatCents(alert.balance.balanceCents, displayLocale) }),
        };
      case 'pprPending':
        return { ...common, title: t('overview.pprPendingCount', { count: alert.count }), sub: t('overview.mobile.alerts.pprSub') };
    }
  });

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('overview.title')}</h1>
          <div className="sub">
            <span className="dot" />
            {subParts.join(' · ')}
          </div>
        </div>
        {/* Story 15.3 (ratifica R-15.3-d): same `display: flex; gap: 8px` this
            div carried inline, now a class so the phone can turn the header
            actions into a full-width stack UNDER the sub-line instead of
            squeezing them into the title row. Desktop computed style unchanged. */}
        <div className="home-head-actions">
          <DispatchFlightButton
            label={t('overview.dispatchButton')}
            aircraftOptions={dispatchAircraftOptions}
            personOptions={dispatchPersonOptions}
            instructorOptions={dispatchInstructorOptions}
            airfieldName={branding.name}
            moneyLocale={displayLocale}
            canForce={hasPermission(actor, 'flights.forceExpiry')}
            labels={buildFlightEditorLabels(tLogbook, tBookings)}
          />
        </div>
      </div>

      <div className="kpi-row">
        <div data-testid="kpi-flights-today">
          <KPI label={t('overview.kpis.flightsToday')} value={flightsToday} />
        </div>
        <div data-testid="kpi-fleet-available">
          <KPI label={t('overview.kpis.fleetAvailable')} value={trulyAvailableCount} unit={`/ ${operationalIds.length}`} />
        </div>
        <div data-testid="kpi-ppr-pending">
          <KPI label={t('overview.kpis.pprPending')} value={pendingPprResult.total} />
        </div>
        <div data-testid="kpi-bookings-pending">
          <KPI label={t('overview.kpis.bookingsPending')} value={pendingBookingsResult.total} />
        </div>
        <div data-testid="kpi-revenue">
          <KPI label={t('overview.kpis.revenue')} value={formatCents(monthStats.kpis.revenueCents, displayLocale)} />
        </div>
      </div>

      {/* Story 15.3 — the phone Panoramica, in the template's own order (64-121):
          "In corso ora", "Prenotazioni in attesa", "Avvisi", "Meteo campo", then
          the two links to the desktop surfaces that are hidden here. It sits
          right after the (single, AD-3) KPI strip so the reading order on the
          phone is the template's; above 640px the whole subtree is
          `display: none`. */}
      <div className="overview-mobile">
        <MobileBookingList
          rows={inProgressRows}
          labels={{
            title: t('overview.mobile.inProgress.title'),
            count: t('overview.mobile.inProgress.count', { count: inProgressRows.length }),
            empty: t('overview.mobile.inProgress.empty'),
            openDetail: t('mobile.openDetail'),
            close: t('mobile.close'),
          }}
          testId="mobile-overview-inprogress"
          rowTestId="mobile-overview-inprogress-row"
          emptyTestId="mobile-overview-inprogress-empty"
        />

        <MobilePendingBookings
          rows={pendingRows}
          labels={{
            title: t('overview.mobile.pending.title'),
            // Review 12.12 F3's distinction, kept: the WINDOW's pending total
            // (the very query these rows come from), never the all-time
            // `kpi-bookings-pending` value above.
            count: t('overview.mobile.pending.count', { count: embedPendingResult.total }),
            empty: t('overview.mobile.pending.empty'),
            openDetail: t('mobile.openDetail'),
            close: t('mobile.close'),
            pendingStatus: tBookings('list.status.PENDING'),
            approve: tBookings('list.actions.approve'),
            reject: tBookings('list.actions.reject'),
            approveSuccess: tBookings('list.actions.approveSuccess'),
            rejectSuccess: tBookings('list.actions.rejectSuccess'),
            reasonSubtitle: tBookings('list.denyModal.subtitle'),
            reasonPlaceholder: tBookings('list.denyModal.reasonPlaceholder'),
            reasonRequired: tBookings('list.denyModal.reasonRequired'),
            reasonTitle: tBookings('list.denyModal.title'),
            reasonSubmit: tBookings('list.denyModal.submit'),
            reasonCancel: tBookings('list.denyModal.cancel'),
            // `t.raw`: the `{count}` placeholder is filled client-side, and
            // `t()` would render the KEY (the ICU lesson of epic 13/14.3).
            seeAll: t.raw('overview.mobile.pending.seeAll') as string,
            errors: buildBookingsTableLabels(tBookings).actions.errors,
          }}
          locale={locale}
          // Review 15.3 F3: what the head counts minus what the card lists.
          // Never negative — the rows come from the very same query, capped.
          hiddenCount={Math.max(0, embedPendingResult.total - pendingRows.length)}
        />

        <MobileAlertsCard
          items={alertItems}
          locale={locale}
          hiddenCount={alerts.hiddenCount}
          hiddenCountIsFloor={alerts.hiddenCountIsFloor}
          moreHref={alerts.moreHref}
          labels={{
            title: t('overview.mobile.alerts.title'),
            empty: t('overview.mobile.alerts.empty'),
            seeAll: t.raw('overview.mobile.alerts.seeAll') as string,
            seeAllAtLeast: t.raw('overview.mobile.alerts.seeAllAtLeast') as string,
          }}
        />

        {metarCard}

        {/* Ratifica R-15.3-d: the calendar, the full bookings table and the
            fleet card are hidden on the phone, so the page says where they
            went. ONE link per destination: the calendar and the table both live
            at `/dashboard/bookings`. */}
        <div className="mobile-shortcuts">
          <Link href="/dashboard/bookings" locale={locale} className="btn" data-testid="mobile-overview-schedule-shortcut">
            {t('overview.mobile.shortcuts.schedule')}
          </Link>
          <Link href="/dashboard/fleet" locale={locale} className="btn" data-testid="mobile-overview-fleet-shortcut">
            {t('overview.mobile.shortcuts.fleet')}
          </Link>
        </div>
      </div>

      {/* `.home-desktop-surface` is the page's OWN switch class (never `.card`,
          never `.split` — 13 consoles share those): it marks the three desktop
          surfaces the cards above replace on the phone. One wrapper PER surface,
          not one around all three: `.page` is a flex column with `gap: 22px`, so
          a single wrapper would have collapsed the spacing between them at
          desktop widths. */}
      <div className="home-desktop-surface">
        <Schedule
          view="day"
          date={today}
          today={today}
          isToday
          weekDates={[]}
          aircraft={scheduleAircraftOptions}
          instructors={instructorOptions}
          dayBlocks={dayBlocks}
          weekChips={[]}
          nowLinePercent={nowLinePercent}
          // Story 15.4 (ratifica R-15.4-b): the same fix as on
          // `/dashboard/bookings` — this embedded timeline shows the SAME
          // `.now-line`, whose `data-time` pill has been empty since 12.3.
          nowTime={formatWallClock(now)}
          // This card has a phone face of its own (the Panoramica's mobile
          // cards, story 15.3) and is `display: none` under 640px, so it needs
          // no agenda: the rows would be markup nobody can ever see.
          agendaRows={[]}
          locale={displayLocale}
          nav={calendarNav}
          listPage={1}
          windowStartHour={Math.round(windowStartMinutes / 60)}
          windowEndHour={Math.round(windowEndMinutes / 60)}
          labels={buildScheduleLabels(tBookings)}
        />
      </div>

      <div className="home-desktop-surface">
      <BookingsTable
        items={embedBookingRows}
        // Review 12.12 F3: windowed PENDING count (same `listFrom` window as
        // the embedded rows), NOT the all-time `pendingBookingsResult.total`
        // used by the KPI above — the card can only ever list what's in its
        // own window, so its "N in attesa" summary must match what it shows.
        pendingCount={embedPendingResult.total}
        total={embedTotal}
        aircraftOptions={scheduleAircraftOptions}
        view="day"
        date={today}
        today={today}
        canManageAny
        canManageOwn={false}
        ownPersonId={actor.personId}
        ownInstructorProfileId={null}
        locale={displayLocale}
        page={1}
        totalPages={embedTotalPages}
        exportHref={buildExportHref('/api/v1/bookings', { from: listFrom, status: ALL_BOOKING_STATUSES.join(',') }, locale)}
        exportPdfHref={buildPdfExportHref('/api/v1/bookings/pdf', { from: listFrom, status: ALL_BOOKING_STATUSES.join(',') }, locale)}
        canCreate
        // Staff-only surface (this is the admin Panoramica): a `bookings.manage.any`
        // actor books for OTHERS, so ratifica R-15.4-f's own-profile requirement
        // never applies here.
        canCreateNew
        // The home's embedded list has no `?status` of its own — the filter is a
        // contract of the Pianificazione URL (R-15.4-e), not of this widget.
        status={null}
        formMode="staff"
        personOptions={staffPersonOptions}
        instructorOptions={instructorOptions}
        studentOptions={[]}
        newBookingLabels={buildNewBookingFormLabels(tBookings, schedulingWindowSummary)}
        editBookingLabels={buildEditBookingFormLabels(tBookings, schedulingWindowSummary)}
        labels={buildBookingsTableLabels(tBookings)}
      />
      </div>

      <div className="split home-desktop-surface">
        <ScadenzeWidget
          items={expiriesResult.items}
          locale={locale}
          viewAllHref="/dashboard/expiries"
          labels={{
            cardTitle: t('scadenzeWidget.cardTitle'),
            countInWindow: t.raw('scadenzeWidget.countInWindow') as string,
            empty: t.raw('scadenzeWidget.empty') as string,
            windowLabels: { '7': t('scadenzeWidget.window7'), '30': t('scadenzeWidget.window30'), '60': t('scadenzeWidget.window60') },
            today: t('scadenzeWidget.today'),
            agoTemplate: t.raw('scadenzeWidget.ago') as string,
            inDaysTemplate: t.raw('scadenzeWidget.inDays') as string,
            seeAll: t.raw('scadenzeWidget.seeAll') as string,
          }}
        />
        <FleetCard
          items={fleetItems}
          totalCount={aircraftResult.items.length}
          availableCount={operationalIds.length}
          aogCount={aogCount}
          locale={displayLocale}
          canManageAircraft={hasPermission(actor, 'aircraft.manage')}
          addHref="/dashboard/fleet"
          labels={{
            cardTitle: t('fleetCard.cardTitle'),
            summary: t.raw('fleetCard.summary') as string,
            addAircraft: t('fleetCard.addAircraft'),
            empty: t('fleetCard.empty'),
            rateLabel: t('fleetCard.rateLabel'),
            badge: {
              aog: t('fleetCard.badge.aog'),
              reserved: t('fleetCard.badge.reserved'),
              available: t('fleetCard.badge.available'),
              archived: t('fleetCard.badge.archived'),
            },
          }}
        />
      </div>
    </main>
  );
}

/** `LogbookPage.editor.*` labels for the reused `FlightEditor` (story 12.8) — same keys `logbook/page.tsx` builds, duplicated here (not extracted, Dev Notes: `logbook/page.tsx` is not a declared cross-story touch for this story) so that page stays completely untouched. */
function buildFlightEditorLabels(
  t: Awaited<ReturnType<typeof getTranslations>>,
  tBookings: Awaited<ReturnType<typeof getTranslations>>,
): FlightEditorLabels {
  return {
    newTitle: t('editor.newTitle'),
    newSubtitle: t('editor.newSubtitle'),
    correctTitle: t('editor.correctTitle'),
    closeLabel: t('editor.closeLabel'),
    cancel: t('editor.cancel'),
    submit: t('editor.submit'),
    correctSubmit: t('editor.correctSubmit'),
    correctReason: t('editor.correctReason'),
    requiredReason: t('editor.requiredReason'),
    conflictError: t('editor.conflictError'),
    requiredField: t('editor.requiredField'),
    invalidHourMeter: t('editor.invalidHourMeter'),
    fields: {
      aircraft: t('editor.fields.aircraft'),
      noAircraftAvailable: t('editor.fields.noAircraftAvailable'),
      person: t('editor.fields.person'),
      noPersonAvailable: t('editor.fields.noPersonAvailable'),
      instructor: t('editor.fields.instructor'),
      noInstructor: t('editor.fields.noInstructor'),
      flightDate: t('editor.fields.flightDate'),
      flightType: t('editor.fields.flightType'),
      soloMode: t('editor.fields.soloMode'),
      soloModes: { dual: t('editor.fields.soloModes.dual'), solo: t('editor.fields.soloModes.solo') },
      studentOnlyHint: t('editor.fields.studentOnlyHint'),
      // `t.raw`: the {type} placeholder is filled CLIENT-side by the editor —
              // plain `t()` fails ICU formatting and renders the key path instead
              // (lezione fix post-epic-13, HANDOFF).
              studentOnlyCorrectionHint: t.raw('editor.fields.studentOnlyCorrectionHint'),
      departure: t('editor.fields.departure'),
      arrival: t('editor.fields.arrival'),
      takeoffTime: t('editor.fields.takeoffTime'),
      landingTime: t('editor.fields.landingTime'),
      computedDuration: t('editor.fields.computedDuration'),
      takeoffs: t('editor.fields.takeoffs'),
      landings: t('editor.fields.landings'),
      hourMeterStart: t('editor.fields.hourMeterStart'),
      hourMeterEnd: t('editor.fields.hourMeterEnd'),
      notes: t('editor.fields.notes'),
    },
    flightTypes: { private: t('flightTypes.private'), school: t('flightTypes.school'), other: t('flightTypes.other') },
    errors: {
      HOUR_METER_INVALID: t('editor.errors.HOUR_METER_INVALID'),
      FLIGHT_TIMES_INVALID: t('editor.errors.FLIGHT_TIMES_INVALID'),
      NO_AIRCRAFT_RATE: t('editor.errors.NO_AIRCRAFT_RATE'),
      NO_INSTRUCTOR_RATE: t('editor.errors.NO_INSTRUCTOR_RATE'),
      SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR: t('editor.errors.SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR'),
      SOLO_REQUIRES_SCHOOL: t('editor.errors.SOLO_REQUIRES_SCHOOL'),
      STUDENT_FLIGHT_MUST_BE_SCHOOL: t('editor.errors.STUDENT_FLIGHT_MUST_BE_SCHOOL'),
      AIRCRAFT_ARCHIVED: t('editor.errors.AIRCRAFT_ARCHIVED'),
      PERSON_ARCHIVED: t('editor.errors.PERSON_ARCHIVED'),
      PERSON_NOT_PILOT_OR_STUDENT: t('editor.errors.PERSON_NOT_PILOT_OR_STUDENT'),
      INSTRUCTOR_NOT_FOUND: t('editor.errors.INSTRUCTOR_NOT_FOUND'),
      INSTRUCTOR_SAME_AS_PILOT: t('editor.errors.INSTRUCTOR_SAME_AS_PILOT'),
      FLIGHT_DATE_IN_FUTURE: t('editor.errors.FLIGHT_DATE_IN_FUTURE'),
      // Story AOG-1a, AC 11 — `{registration}`/`{reason}`/`{date}` filled CLIENT-side, same reasoning.
      AIRCRAFT_OUT_OF_SERVICE: t.raw('editor.errors.AIRCRAFT_OUT_OF_SERVICE'),
      AIRCRAFT_OUT_OF_SERVICE_UNTIL: t.raw('editor.errors.AIRCRAFT_OUT_OF_SERVICE_UNTIL'),
      FLIGHT_BLOCKED_BY_EXPIRY: t.raw('editor.errors.FLIGHT_BLOCKED_BY_EXPIRY'),
      // Review F5/F6 — `{date}` filled CLIENT-side, same reasoning as above.
      documentExpiredOn: t.raw('editor.errors.documentExpiredOn'),
      documentMissing: t('editor.errors.documentMissing'),
      documentRolePerson: t('editor.errors.documentRolePerson'),
      documentRoleInstructor: t('editor.errors.documentRoleInstructor'),
      generic: t('editor.errors.generic'),
    },
    result: {
      title: t('editor.result.title'),
      minutes: t('editor.result.minutes'),
      aircraftRate: t('editor.result.aircraftRate'),
      aircraftAmount: t('editor.result.aircraftAmount'),
      instructorRate: t('editor.result.instructorRate'),
      instructorAmount: t('editor.result.instructorAmount'),
      total: t('editor.result.total'),
      newBalance: t('editor.result.newBalance'),
      balanceAlert: t('editor.result.balanceAlert'),
      // Review F11 — `{reason}` filled CLIENT-side, same reasoning.
      forcedNotice: t.raw('editor.result.forcedNotice'),
    },
    // Story AOG-1a, AC 12: the SAME `BookingsPage` key the booking form uses.
    outOfServiceSuffix: tBookings.raw('form.outOfServiceSuffix') as string,
    picker: { placeholder: t('picker.placeholder'), noResults: t('picker.noResults') },
    force: {
      title: t('editor.force.title'),
      description: t('editor.force.description'),
      reasonLabel: t('editor.force.reasonLabel'),
      submit: t('editor.force.submit'),
      cancel: t('editor.force.cancel'),
      requiredReason: t('editor.force.requiredReason'),
      generic: t('editor.force.generic'),
    },
  };
}

// --- InstructorLanding (AC 5) ------------------------------------------------

/** `dayPhaseOf`/`DayPhase` moved to `@/lib/booking-day-phase` in story 15.3 (AD-4): the mobile "In corso ora" card needs the same boundary, and it must have one implementation. Behaviour unchanged. */

async function renderInstructorLanding(
  actor: Actor,
  me: MeResult,
  ownInstructorProfileId: string,
  locale: AppLocale,
  displayLocale: DisplayLocale,
): Promise<ReactElement> {
  const t = await getTranslations('DashboardPage');
  const now = new Date();
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const todayStart = zonedMidnightUtc(today, APP_TIMEZONE);
  const tomorrowStart = zonedMidnightUtc(addDaysDateOnly(today, 1), APP_TIMEZONE);

  const [compensation, flightsTodayTotals, calendarBookingsToday, metarCard] = await Promise.all([
    getOwnCompensationSummary(actor),
    me.person
      ? getFlightTotals(actor, { dateFrom: today, dateTo: today, status: 'REGISTERED', instructorPersonId: me.person.id, page: 1, pageSize: 1 })
      : Promise.resolve({ count: 0, minutes: 0, takeoffs: 0, landings: 0, revenueCents: 0 }),
    listCalendarBookings(actor, { from: todayStart.toISOString(), to: tomorrowStart.toISOString() }),
    // Parallel, not serialized after the queries — review 15.3 F6.
    renderMobileMetarCard(t('mobile.metarTitle')),
  ]);

  const myDayBookings: BookingListItem[] = calendarBookingsToday.filter((booking) => booking.instructorProfileId === ownInstructorProfileId);
  // Review 12.12 F2, PO-ratified overcount 2026-07-19: planned + flown; a
  // today APPROVED booking keeps counting after its flight is registered —
  // FLOWN is a separate manual step.
  const flightsToday = flightsTodayTotals.count + myDayBookings.length;
  const displayName = me.person ? me.person.firstName : me.email;

  const noValue = t('instructorLanding.noValue');
  const hoursMonthValue = compensation ? formatMinutes(compensation.mtdMinutes) : noValue;
  const payoutRateValue = compensation && compensation.payoutRateCents !== null ? `${formatCents(compensation.payoutRateCents, displayLocale)}/h` : noValue;
  const owedMonthValue = compensation && compensation.owedMtdCents !== null ? formatCents(compensation.owedMtdCents, displayLocale) : noValue;
  const owedForSub = compensation && compensation.owedMtdCents !== null ? formatCents(compensation.owedMtdCents, displayLocale) : noValue;

  const statusLabels: Record<DayPhase, string> = {
    inProgress: t('instructorLanding.status.inProgress'),
    completed: t('instructorLanding.status.completed'),
    scheduled: t('instructorLanding.status.scheduled'),
  };
  const statusTone: Record<DayPhase, 'warn' | 'ok' | 'info'> = { inProgress: 'warn', completed: 'ok', scheduled: 'info' };

  // --- Mobile "Oggi" (story 15.3, AC 7) -----------------------------------
  const mobileDetailLabels = buildMobileDetailLabels(t);
  const mobileNoValue = t('instructorLanding.noValue');
  const bookingLabel = t('mobile.bookingLabel');
  // Template 447-456: the time column moves to the LEFT of the row (start bold,
  // end quiet) instead of sitting between the name and the badge.
  const myDayRows: MobileBookingRow[] = myDayBookings.map((booking) => {
    const phase = dayPhaseOf(booking.startsAt, booking.endsAt, now);
    return {
      id: booking.id,
      title: booking.personName ?? mobileNoValue,
      sub: booking.aircraftRegistration,
      timeStart: formatTimeOfDay(booking.startsAt, displayLocale),
      timeEnd: formatTimeOfDay(booking.endsAt, displayLocale),
      badgeTone: statusTone[phase],
      badgeLabel: statusLabels[phase],
      sheetSub: bookingSheetSub(booking, bookingLabel, displayLocale),
      sheetTitle: booking.personName ?? mobileNoValue,
      detail: bookingDetailRows(booking, mobileDetailLabels, displayLocale, mobileNoValue),
    };
  });
  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('instructorLanding.greeting', { name: displayName })}</h1>
          <div className="sub">
            <span className="dot" />
            {t('instructorLanding.sub', { flightsToday, owed: owedForSub })}
          </div>
        </div>
        <div className="home-head-actions">
          <Link href="/dashboard/logbook" locale={locale} className="btn" data-testid="instructor-landing-logbook-cta">
            {t('instructorLanding.logbookCta')}
          </Link>
        </div>
      </div>

      {/* Ratifica R-15.3-c: 4 KPIs fit a 2x2 grid, so on the phone this row is
          the template's grid (439-446) instead of the 15.2 scroll strip that
          hid half of them behind a swipe. A modifier on the SAME row, never a
          second tree (AD-3). */}
      <div className="kpi-row kpi-row-grid">
        <div data-testid="kpi-hours-month">
          <KPI label={t('instructorLanding.kpis.hoursMonth')} value={hoursMonthValue} />
        </div>
        <div data-testid="kpi-payout-rate">
          <KPI label={t('instructorLanding.kpis.payoutRate')} value={payoutRateValue} />
        </div>
        <div data-testid="kpi-owed-month">
          <KPI label={t('instructorLanding.kpis.owedMonth')} value={owedMonthValue} />
        </div>
        <div data-testid="kpi-flights-today">
          <KPI label={t('instructorLanding.kpis.flightsToday')} value={flightsToday} />
        </div>
      </div>

      <div className="landing-mobile">
        <MobileBookingList
          rows={myDayRows}
          withTimeColumn
          labels={{
            title: t('instructorLanding.myDay.title'),
            count: formatDateOnly(today, displayLocale),
            empty: t('instructorLanding.myDay.empty'),
            openDetail: t('mobile.openDetail'),
            close: t('mobile.close'),
          }}
          testId="instructor-landing-myday-mobile"
          rowTestId="instructor-landing-myday-row-mobile"
          emptyTestId="instructor-landing-myday-empty-mobile"
        />
        {metarCard}
      </div>

      <div className="card home-desktop-surface">
        <div className="card-head">
          <div className="card-title">{t('instructorLanding.myDay.title')}</div>
        </div>
        <div className="list">
          {myDayBookings.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--ink-3)' }} data-testid="instructor-landing-myday-empty">
              {t('instructorLanding.myDay.empty')}
            </p>
          ) : (
            myDayBookings.map((booking) => {
              const phase = dayPhaseOf(booking.startsAt, booking.endsAt, now);
              return (
                <div key={booking.id} className="list-item" style={{ gridTemplateColumns: '44px 1fr auto auto' }} data-testid="instructor-landing-myday-row">
                  <div className="list-icon amber">
                    <Icon.plane />
                  </div>
                  <div>
                    <div className="list-title">{booking.personName}</div>
                    <div className="list-sub">{booking.aircraftRegistration}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {formatTimeOfDay(booking.startsAt, displayLocale)}–{formatTimeOfDay(booking.endsAt, displayLocale)}
                  </div>
                  <Badge tone={statusTone[phase]} dot>
                    {statusLabels[phase]}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

// --- PilotLanding (AC 4) -----------------------------------------------------

async function renderPilotLanding(actor: Actor, me: MeResult, locale: AppLocale, displayLocale: DisplayLocale): Promise<ReactElement> {
  const t = await getTranslations('DashboardPage');
  const person = me.person!;

  const [accountOverview, myExpiries, upcomingBookingsResult, metarCard] = await Promise.all([
    getAccountOverview(actor, person.id),
    listPersonExpiries(actor, person.id),
    listBookings(actor, { from: new Date().toISOString(), personId: person.id, status: ['APPROVED'], page: 1, pageSize: 5 }),
    // Parallel, not serialized after the queries — review 15.3 F6.
    renderMobileMetarCard(t('mobile.metarTitle')),
  ]);

  const noValue = t('pilotLanding.noValue');
  const medicalExpiry = myExpiries.find((expiry) => categoryOf(expiry.typeName) === 'Medico');
  // Ratifica PO 2026-07-18: la licenza è LIFETIME (mai una data di scadenza —
  // il KPI mostra il TIPO dal PilotProfile); solo i ratings scadono, e il KPI
  // ne mostra i NOMI, non un conteggio.
  const ratingNames = [...new Set(myExpiries.filter((expiry) => categoryOf(expiry.typeName) === 'Abilitazione').map((expiry) => expiry.typeName))];

  // Review 14.6 F2: the permission alone is the ROLE; `createBooking`'s own-self
  // path requires an ACTIVE flying profile (`isActivePilot || isActiveInstructor`,
  // bookings.service.ts:485) — gating the primary CTA on the role sent a
  // deactivated pilot straight into a 403 dead end. An actor reaching THIS
  // landing has no active instructor profile by construction (that case renders
  // the instructor face), so the active pilot profile is the whole condition.
  const canBook =
    (hasPermission(actor, 'bookings.manage.own') || hasPermission(actor, 'bookings.manage.any')) && person.activePilotLicenseType !== null;

  // --- Mobile "Home" (story 15.3, AC 6) -----------------------------------
  const mobileDetailLabels = buildMobileDetailLabels(t);
  const bookingLabel = t('mobile.bookingLabel');
  const upcomingRows: MobileBookingRow[] = upcomingBookingsResult.items.map((booking) => ({
    id: booking.id,
    title: booking.aircraftRegistration,
    sub: formatDateTime(booking.startsAt, displayLocale),
    badgeTone: 'info',
    badgeLabel: t('pilotLanding.status.scheduled'),
    sheetSub: bookingSheetSub(booking, bookingLabel, displayLocale),
    sheetTitle: booking.aircraftRegistration,
    detail: bookingDetailRows(booking, mobileDetailLabels, displayLocale, noValue),
  }));
  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('pilotLanding.greeting', { name: person.firstName })}</h1>
          <div className="sub">
            <span className="dot" />
            {t('pilotLanding.subAccount', { balance: formatCents(accountOverview.balanceCents, displayLocale) })}
          </div>
        </div>
        <div className="home-head-actions">
          <Link href={`/dashboard/people/${person.id}`} locale={locale} className="btn" data-testid="pilot-landing-profile-cta">
            {t('pilotLanding.profileCta')}
          </Link>
          <Link href="/dashboard/logbook" locale={locale} className="btn" data-testid="pilot-landing-logbook-cta">
            {t('pilotLanding.logbookCta')}
          </Link>
          {canBook ? (
            <Link href="/dashboard/bookings" locale={locale} className="btn primary" data-testid="pilot-landing-book-cta">
              {t('pilotLanding.bookCta')}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Ratifica R-15.3-c, same as the instructor face: 4 KPIs, so the phone
          gets the template's 2x2 grid (407-414) rather than the 15.2 strip. */}
      <div className="kpi-row kpi-row-grid">
        <Link
          /* Review 14.6 F5: the pilot's own statement now lives at the
             self-service page (story 14.6); the staff-shaped scheda persona
             stays reachable from the "Profilo" CTA above. */
          href="/dashboard/my-account"
          locale={locale}
          aria-label={t('pilotLanding.accountLink')}
          data-testid="kpi-balance"
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <KPI label={t('pilotLanding.kpis.balance')} value={formatCents(accountOverview.balanceCents, displayLocale)} />
        </Link>
        <div data-testid="kpi-license">
          <KPI label={t('pilotLanding.kpis.license')} value={person.activePilotLicenseType ?? noValue} />
        </div>
        <div data-testid="kpi-medical">
          <KPI label={t('pilotLanding.kpis.medical')} value={medicalExpiry ? formatDateOnly(medicalExpiry.expiresAt, displayLocale) : noValue} />
        </div>
        <div data-testid="kpi-ratings">
          <KPI label={t('pilotLanding.kpis.ratings')} value={ratingNames.length > 0 ? ratingNames.join(' · ') : noValue} />
        </div>
      </div>

      <div className="landing-mobile">
        <MobileBookingList
          rows={upcomingRows}
          labels={{
            title: t('pilotLanding.upcomingFlights.title'),
            empty: t('pilotLanding.upcomingFlights.empty'),
            openDetail: t('mobile.openDetail'),
            close: t('mobile.close'),
          }}
          testId="pilot-landing-upcoming-mobile"
          rowTestId="pilot-landing-upcoming-row-mobile"
          emptyTestId="pilot-landing-upcoming-empty-mobile"
        />
        {metarCard}
      </div>

      <div className="card home-desktop-surface">
        <div className="card-head">
          <div className="card-title">{t('pilotLanding.upcomingFlights.title')}</div>
        </div>
        <div className="list">
          {upcomingBookingsResult.items.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--ink-3)' }} data-testid="pilot-landing-upcoming-empty">
              {t('pilotLanding.upcomingFlights.empty')}
            </p>
          ) : (
            upcomingBookingsResult.items.map((booking) => (
              <div key={booking.id} className="list-item" data-testid="pilot-landing-upcoming-row">
                <div className="list-icon amber">
                  <Icon.plane />
                </div>
                <div>
                  <div className="list-title">{booking.aircraftRegistration}</div>
                  <div className="list-sub">{formatDateTime(booking.startsAt, displayLocale)}</div>
                </div>
                <Badge tone="info" dot>
                  {t('pilotLanding.status.scheduled')}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
