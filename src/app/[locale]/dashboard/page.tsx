import type { ReactElement } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icons';
import { KPI } from '@/components/ui/kpi';
import { FleetCard, type FleetCardItem } from '@/components/dashboard/fleet-card';
import { ScadenzeWidget } from '@/components/dashboard/scadenze-widget';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { clampToWindowPercent, projectDayBlocks, resolveWindowMinutes, wallMinutesOfDay } from '@/lib/booking-schedule';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { categoryOf } from '@/lib/expiry-status';
import { formatCents } from '@/lib/money';
import { deriveApprovedPprMovementStatus } from '@/lib/ppr-movement-status';
import { APP_TIMEZONE, formatDateOnly, formatDateTime, formatMinutes, formatTimeOfDay } from '@/lib/time';
import { addDaysDateOnly, dateOnlyInZone, todayDateOnlyInZone, zonedMidnightUtc } from '@/lib/zoned-time';
import { hasPermission, type Actor } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getAccountOverview } from '@/server/services/accounts.service';
import { listAircraft } from '@/server/services/aircraft.service';
import { getAirfieldBranding, getAirfieldIcao, getSchedulingSettings } from '@/server/services/app-settings.service';
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
import { getMe, type MeResult } from '@/server/services/me.service';
import { listPeople } from '@/server/services/people.service';
import { listPprRequests } from '@/server/services/ppr.service';
import { getEffectiveRates, todayDateOnlyUtc } from '@/server/services/rates.service';
import { getStats } from '@/server/services/stats.service';
import { buildBookingsTableLabels, buildNewBookingFormLabels, buildScheduleLabels, buildEditBookingFormLabels } from './bookings/booking-labels';
import { BookingsTable, type BookingRowDto, type BookingStatusDto } from './bookings/bookings-table';
import type { PersonOption } from './bookings/new-booking-form';
import { Schedule, type CalendarNav } from './bookings/schedule';
import { DispatchFlightButton } from './dispatch-flight-button';
import type { FlightEditorLabels } from './logbook/flight-editor';

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
/** Same set `bookings/page.tsx#ALL_BOOKING_STATUSES` shows — the embedded table is the SAME "Prenotazioni" card, just pending-first ordered and row-capped. */
const ALL_BOOKING_STATUSES: readonly BookingStatusDto[] = ['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED'];
/** `ALL_BOOKING_STATUSES` minus `PENDING` — the "fill the rest" query once every PENDING booking in-window is already fetched (see the pending-first fetch below). */
const NON_PENDING_BOOKING_STATUSES: readonly BookingStatusDto[] = ['APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED'];
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
 * Protected home page (story 12.12) — an AirOps-native, role-based landing:
 * console operativa reale per admin/staff (AC 1), "la mia giornata" per
 * l'istruttore (AC 5), saldo/scadenze/prossimi voli per pilota/allievo (AC
 * 4). The face is chosen from the REAL session role/permessi, never a query
 * param (AC 6) — gate order: `finance.manage` → INSTRUCTOR role (story
 * 12.13: the `school.manage.own` permission this used to read was the
 * feature-scoped "scuola" permission, removed with the school area — an
 * actor's INSTRUCTOR role membership is the same signal, plain and
 * unambiguous) → `me.person`.
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
  const showInstructorFace = !canManageFinance && actor.roles.includes('INSTRUCTOR');
  const showPersonalFace = !canManageFinance && !showInstructorFace && me.person !== null;

  if (canManageFinance) {
    return renderAdminOverview(actor, locale as AppLocale, displayLocale);
  }
  if (showInstructorFace) {
    return renderInstructorLanding(actor, me, locale as AppLocale, displayLocale);
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
    embedRestResult,
    expiriesResult,
    scheduleAircraftOptions,
    instructorOptions,
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
    // Pending-first (AC 1): fetched as its OWN top-priority query, never a
    // local re-sort of one page — a page-scoped sort would silently drop a
    // PENDING booking that fell outside the FIRST `startsAt`-ordered page.
    listBookings(actor, { from: listFrom, status: ['PENDING'], page: 1, pageSize: EMBED_BOOKINGS_PAGE_SIZE }),
    listBookings(actor, { from: listFrom, status: [...NON_PENDING_BOOKING_STATUSES], page: 1, pageSize: EMBED_BOOKINGS_PAGE_SIZE }),
    listAllExpiries(actor, { window: '60', page: 1, pageSize: EXPIRIES_WIDGET_SCAN_LIMIT }),
    listBookableAircraft(actor),
    listActiveInstructors(actor),
  ]);

  // --- .sub: ICAO (D3) + AOG + PPR pending + al suolo (12.4 reuse) --------
  const aogCount = aircraftResult.items.length - operationalIds.length;
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
  const calendarNav: CalendarNav = {
    prevHref: bookingsHref({ date: addDaysDateOnly(today, -1) }, today),
    todayHref: bookingsHref({}, today),
    nextHref: bookingsHref({ date: addDaysDateOnly(today, 1) }, today),
    dayViewHref: bookingsHref({ view: 'day' }, today),
    weekViewHref: bookingsHref({ view: 'week' }, today),
  };

  // --- Embedded BookingsTable (pending-first, AC 1) -----------------------
  // Every PENDING booking in-window comes first (up to the page size), THEN
  // non-pending bookings fill whatever slots remain — a TRUE priority
  // ordering, not a same-page re-sort (see the fetch comment above).
  const embedRemainingSlots = Math.max(0, EMBED_BOOKINGS_PAGE_SIZE - embedPendingResult.items.length);
  const embedBookingItems: BookingListItem[] = [...embedPendingResult.items, ...embedRestResult.items.slice(0, embedRemainingSlots)];
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
  const embedTotal = embedPendingResult.total + embedRestResult.total;
  const embedTotalPages = Math.max(1, Math.ceil(embedTotal / EMBED_BOOKINGS_PAGE_SIZE));

  const staffPersonOptions: PersonOption[] = peopleResult.items
    .filter((person) => person.archivedAt === null && (person.profiles.pilot || person.profiles.student || person.profiles.instructor))
    .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));

  // --- "Pianifica volo" CTA — the real `flights.manage` FlightEditor (story 12.8), reused as-is ---
  const dispatchAircraftOptions = aircraftResult.items.map((aircraft) => ({ id: aircraft.id, registration: aircraft.registration }));
  const dispatchPersonOptions = peopleResult.items
    .filter((person) => person.profiles.pilot || person.profiles.student)
    .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
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
        <div style={{ display: 'flex', gap: 8 }}>
          <DispatchFlightButton
            label={t('overview.dispatchButton')}
            aircraftOptions={dispatchAircraftOptions}
            personOptions={dispatchPersonOptions}
            instructorOptions={dispatchInstructorOptions}
            airfieldName={branding.name}
            moneyLocale={displayLocale}
            labels={buildFlightEditorLabels(tLogbook)}
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
        locale={displayLocale}
        nav={calendarNav}
        listPage={1}
        windowStartHour={Math.round(windowStartMinutes / 60)}
        windowEndHour={Math.round(windowEndMinutes / 60)}
        labels={buildScheduleLabels(tBookings)}
      />

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
        formMode="staff"
        personOptions={staffPersonOptions}
        instructorOptions={instructorOptions}
        studentOptions={[]}
        newBookingLabels={buildNewBookingFormLabels(tBookings)}
        editBookingLabels={buildEditBookingFormLabels(tBookings)}
        labels={buildBookingsTableLabels(tBookings)}
      />

      <div className="split">
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
function buildFlightEditorLabels(t: Awaited<ReturnType<typeof getTranslations>>): FlightEditorLabels {
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
      AIRCRAFT_ARCHIVED: t('editor.errors.AIRCRAFT_ARCHIVED'),
      PERSON_ARCHIVED: t('editor.errors.PERSON_ARCHIVED'),
      PERSON_NOT_PILOT_OR_STUDENT: t('editor.errors.PERSON_NOT_PILOT_OR_STUDENT'),
      INSTRUCTOR_NOT_FOUND: t('editor.errors.INSTRUCTOR_NOT_FOUND'),
      INSTRUCTOR_SAME_AS_PILOT: t('editor.errors.INSTRUCTOR_SAME_AS_PILOT'),
      FLIGHT_DATE_IN_FUTURE: t('editor.errors.FLIGHT_DATE_IN_FUTURE'),
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
    },
    picker: { placeholder: t('picker.placeholder'), noResults: t('picker.noResults') },
  };
}

// --- InstructorLanding (AC 5) ------------------------------------------------

type DayPhase = 'inProgress' | 'completed' | 'scheduled';

function dayPhaseOf(startsAt: Date, endsAt: Date, now: Date): DayPhase {
  if (now >= endsAt) return 'completed';
  if (now >= startsAt) return 'inProgress';
  return 'scheduled';
}

async function renderInstructorLanding(actor: Actor, me: MeResult, locale: AppLocale, displayLocale: DisplayLocale): Promise<ReactElement> {
  const t = await getTranslations('DashboardPage');
  const now = new Date();
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const todayStart = zonedMidnightUtc(today, APP_TIMEZONE);
  const tomorrowStart = zonedMidnightUtc(addDaysDateOnly(today, 1), APP_TIMEZONE);

  const [ownInstructorProfileId, compensation, flightsTodayTotals, calendarBookingsToday] = await Promise.all([
    getOwnInstructorProfileId(actor),
    getOwnCompensationSummary(actor),
    me.person
      ? getFlightTotals(actor, { dateFrom: today, dateTo: today, status: 'REGISTERED', instructorPersonId: me.person.id, page: 1, pageSize: 1 })
      : Promise.resolve({ count: 0, minutes: 0, takeoffs: 0, landings: 0, revenueCents: 0 }),
    listCalendarBookings(actor, { from: todayStart.toISOString(), to: tomorrowStart.toISOString() }),
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
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/logbook" locale={locale} className="btn" data-testid="instructor-landing-logbook-cta">
            {t('instructorLanding.logbookCta')}
          </Link>
        </div>
      </div>

      <div className="kpi-row">
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

      <div className="card">
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

  const [accountOverview, myExpiries, upcomingBookingsResult] = await Promise.all([
    getAccountOverview(actor, person.id),
    listPersonExpiries(actor, person.id),
    listBookings(actor, { from: new Date().toISOString(), personId: person.id, status: ['APPROVED'], page: 1, pageSize: 5 }),
  ]);

  const noValue = t('pilotLanding.noValue');
  const medicalExpiry = myExpiries.find((expiry) => categoryOf(expiry.typeName) === 'Medico');
  // Ratifica PO 2026-07-18: la licenza è LIFETIME (mai una data di scadenza —
  // il KPI mostra il TIPO dal PilotProfile); solo i ratings scadono, e il KPI
  // ne mostra i NOMI, non un conteggio.
  const ratingNames = [...new Set(myExpiries.filter((expiry) => categoryOf(expiry.typeName) === 'Abilitazione').map((expiry) => expiry.typeName))];

  const canBook = hasPermission(actor, 'bookings.manage.own') || hasPermission(actor, 'bookings.manage.any');

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
        <div style={{ display: 'flex', gap: 8 }}>
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

      <div className="kpi-row">
        <Link
          href={`/dashboard/people/${person.id}/account`}
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

      <div className="card">
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
