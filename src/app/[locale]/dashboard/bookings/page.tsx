import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { buildExportHref } from '@/lib/export-href';
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, dateOnlyInZone, todayDateOnlyInZone, weekStartDateOnly, zonedMidnightUtc, zonedWallTime } from '@/lib/zoned-time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import {
  getOwnInstructorProfileId,
  listActiveInstructors,
  listBookableAircraft,
  listBookableStudents,
  listBookings,
  listCalendarBookings,
  type BookingListItem,
} from '@/server/services/bookings.service';
import { listPeople } from '@/server/services/people.service';
import type { BookingRowDto, BookingsTableLabels, BookingStatusDto } from './bookings-table';
import { BookingsTable } from './bookings-table';
import type { EditBookingFormLabels } from './edit-booking-form';
import type { AircraftOption, InstructorOption, NewBookingFormLabels, NewBookingFormMode, PersonOption } from './new-booking-form';
import { Schedule, type CalendarDayBlock, type CalendarNav, type CalendarWeekChip, type ScheduleLabels } from './schedule';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; view?: string; date?: string }>;
};

/** Staff/instructor picker candidate cap — same "small admin-managed list" convention as `flights/page.tsx`'s `OPTIONS_PAGE_SIZE`. */
const OPTIONS_PAGE_SIZE = 100;

/** "Prenotazioni" table page size. */
const BOOKINGS_PAGE_SIZE = 20;

/**
 * Every `BookingStatus` the new UI shows (story 12.3, AC 3: "default UI:
 * tutti") — a deliberate scope decision, documented here (Karpathy: surface
 * assumptions): the list's lower bound is `listFrom` = now MINUS 48 HOURS
 * (ratified with the user, review 12.3 F7, 2026-07-15) rather than a bare
 * "now", so this is "every status, within the last-48h/future window", not
 * "every booking ever". The 48h grace window is deliberate: a booking that
 * ended minutes (or hours) ago still needs to stay operable —
 * DENIED/FLOWN/NO_SHOW's "Riapri", or an APPROVED booking's
 * Effettuato/Assente — not just up to the second it technically elapses. A
 * booking whose `endsAt` is more than 48h in the past still naturally drops
 * off the list, same as it always has, just with a wider grace window than
 * the legacy "Prossime prenotazioni" list's bare `from: now`.
 */
const ALL_BOOKING_STATUSES: readonly BookingStatusDto[] = ['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED'];

// --- Calendar (epic 7, story 7.2, FR-19; re-presented story 12.3) ----------
// Hand-edited URL defense (same pattern as `expiries/page.tsx`'s
// `sanitizeScope`/`sanitizeStatus`): an invalid `?view`/`?date` NEVER
// errors, it silently falls back to the default — the calendar's own
// helpers (`zoned-time.ts`) also never see anything but a validated value.

const CALENDAR_VIEWS = ['day', 'week'] as const;
type BookingCalendarView = (typeof CALENDAR_VIEWS)[number];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeView(value: string | undefined): BookingCalendarView {
  return value && (CALENDAR_VIEWS as readonly string[]).includes(value) ? (value as BookingCalendarView) : 'day';
}

/**
 * Accepts only a REAL calendar date in `YYYY-MM-DD` form (rejects e.g.
 * `2026-02-30` via a round-trip check) — anything else falls back to "today"
 * in `APP_TIMEZONE`. The year is additionally bounded to 1900–9000 (review
 * 7.2 F1): the downstream `addDaysDateOnly(date, 1)`/`+7` arithmetic must
 * never overflow into a 5-digit ISO year, whose expanded `+010000-…`
 * `toISOString()` form would corrupt the date-only round-trip and crash
 * `zonedMidnightUtc` — the Contesto's contract is "invalid → default, MAI
 * errore".
 */
function sanitizeDate(value: string | undefined, today: string): string {
  if (!value || !DATE_ONLY_PATTERN.test(value)) return today;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (year < 1900 || year > 9000) return today;
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day;
  return isRealDate ? value : today;
}

/** The day-view horizontal axis (Contesto: "06:00–22:00 Europe/Rome"). Minutes from midnight. */
const WINDOW_START_MINUTES = 6 * 60;
const WINDOW_END_MINUTES = 22 * 60;
const WINDOW_SPAN_MINUTES = WINDOW_END_MINUTES - WINDOW_START_MINUTES;
const MINUTES_PER_DAY = 24 * 60;
/**
 * A block is never rendered with zero (or near-zero) visible width, even
 * for a booking that is entirely clamped away (Contesto: "MAI nascosti") —
 * story 7.2's own rationale, unchanged by story 12.3's axis flip (top/height
 * -> left/width, same percentages).
 */
const MIN_BLOCK_HEIGHT_PERCENT = 8;

function wallMinutesOfDay(instant: Date): number {
  const { hour, minute } = zonedWallTime(instant, APP_TIMEZONE);
  return hour * 60 + minute;
}

function formatWallClock(instant: Date): string {
  const { hour, minute } = zonedWallTime(instant, APP_TIMEZONE);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function clampToWindowPercent(rawMinutes: number): number {
  return (Math.min(WINDOW_SPAN_MINUTES, Math.max(0, rawMinutes)) / WINDOW_SPAN_MINUTES) * 100;
}

/**
 * Projects every booking overlapping `dateOnly` (Europe/Rome) into an
 * ALREADY-POSITIONED block — SERVER-SIDE, via `zonedWallTime`/
 * `zonedMidnightUtc` (`zoned-time.ts`, story 7.2 Task 1): the client never
 * redoes this conversion (lesson 7.1: "container UTC vs display CEST").
 * UNCHANGED mechanics from story 7.2 (story 12.3, Contesto: "cambia la
 * PRESENTAZIONE, non la meccanica") — `instructorProfileId` is the only
 * additive field (the Schedule timeline's instructor filter, AC 2).
 *
 * A booking that starts before this day (or before 06:00 within it) is
 * clamped to the top/left edge with `clampedTop`; one that ends after this
 * day (or after 22:00) is clamped to the bottom/right edge with
 * `clampedBottom` — EITHER WAY IT IS STILL RENDERED (Contesto: "MAI
 * nascosti"), just clamped, with the REAL (unclamped) `HH:MM–HH:MM` always
 * shown as `timeLabel`.
 */
function projectDayBlocks(bookings: BookingListItem[], dateOnly: string): CalendarDayBlock[] {
  const dayStart = zonedMidnightUtc(dateOnly, APP_TIMEZONE);
  const dayEnd = zonedMidnightUtc(addDaysDateOnly(dateOnly, 1), APP_TIMEZONE);

  const blocks: CalendarDayBlock[] = [];
  for (const booking of bookings) {
    const startsAt = new Date(booking.startsAt);
    const endsAt = new Date(booking.endsAt);
    if (endsAt <= dayStart || startsAt >= dayEnd) continue; // does not overlap this day at all

    const startsBeforeDay = startsAt < dayStart;
    const endsAtOrAfterDay = endsAt >= dayEnd;
    const startMinutesOfDay = startsBeforeDay ? 0 : wallMinutesOfDay(startsAt);
    const endMinutesOfDay = endsAtOrAfterDay ? MINUTES_PER_DAY : wallMinutesOfDay(endsAt);

    const rawTop = startMinutesOfDay - WINDOW_START_MINUTES;
    const rawBottom = endMinutesOfDay - WINDOW_START_MINUTES;
    const top = clampToWindowPercent(rawTop);
    const bottom = clampToWindowPercent(rawBottom);

    // Review 7.2 F2: after the min-height inflation, re-anchor the top so
    // `top + height` never exceeds 100% — a bottom-clamped short block must
    // pin AT the bottom edge (the ▼ indicator shows), never render below the
    // grid (the exact mirror of the before-06:00 min-height case above).
    const height = Math.max(bottom - top, MIN_BLOCK_HEIGHT_PERCENT);
    blocks.push({
      id: booking.id,
      aircraftId: booking.aircraftId,
      top: Math.min(top, 100 - height),
      height,
      clampedTop: rawTop < 0,
      clampedBottom: rawBottom > WINDOW_SPAN_MINUTES,
      timeLabel: `${formatWallClock(startsAt)}–${formatWallClock(endsAt)}`,
      personName: booking.personName,
      instructorProfileId: booking.instructorProfileId,
      instructorName: booking.instructorName,
    });
  }
  return blocks;
}

/**
 * Projects every booking overlapping any of `weekDates` into a (booking,
 * day) overlap record — one PER (booking, day) it overlaps, so a booking
 * spanning midnight appears once in each neighboring day's count. Story
 * 12.3 reads this ONLY for per-day counts (Contesto: the prototype's own
 * week view has no per-aircraft chip matrix, just a 7-cell grid of counts) —
 * UNCHANGED mechanics from story 7.2 otherwise, `instructorProfileId` is the
 * only additive field (Dev Notes, same as `projectDayBlocks` above).
 */
function projectWeekChips(bookings: BookingListItem[], weekDates: string[]): CalendarWeekChip[] {
  const chips: CalendarWeekChip[] = [];
  for (const dateOnly of weekDates) {
    const dayStart = zonedMidnightUtc(dateOnly, APP_TIMEZONE);
    const dayEnd = zonedMidnightUtc(addDaysDateOnly(dateOnly, 1), APP_TIMEZONE);
    for (const booking of bookings) {
      const startsAt = new Date(booking.startsAt);
      const endsAt = new Date(booking.endsAt);
      if (endsAt <= dayStart || startsAt >= dayEnd) continue;

      chips.push({
        id: `${booking.id}:${dateOnly}`,
        aircraftId: booking.aircraftId,
        dateOnly,
        timeLabel: `${formatWallClock(startsAt)}–${formatWallClock(endsAt)}`,
        clampedStart: startsAt < dayStart,
        clampedEnd: endsAt >= dayEnd,
        personName: booking.personName,
        instructorProfileId: booking.instructorProfileId,
        instructorName: booking.instructorName,
      });
    }
  }
  return chips;
}

/**
 * Aircraft bookings (epic 7 stories 7.1-7.4; epic 12 story 12.2's approval
 * workflow; re-presented in the AirOps visual language by story 12.3, AC
 * 1-5) — the FIRST AirOps-native page with real content (story 12.1 only
 * shipped the shell). Gate: `bookings.manage.own` OR `bookings.manage.any`
 * OR `self.read` (in practice every authenticated actor — the timeline/list
 * serve everyone, FR-19). `canCreate` (either `bookings.manage.*`
 * permission) decides whether the "Nuova prenotazione" button/slide-over
 * renders at all; within that, `formMode` picks the SHAPE of the form
 * (AD-5: only what to RENDER — `bookings.service.ts#createBooking` is the
 * real guardian regardless of what this page decides to show):
 *
 * - `staff` (`bookings.manage.any`): free person + optional instructor picker.
 * - `instructor` (`bookings.manage.own` AND an active own `InstructorProfile`,
 *   `getOwnInstructorProfileId`): "per me" / "per un allievo" toggle.
 * - `pilot` (`bookings.manage.own`, no active own instructor profile): books
 *   for self only, no picker at all.
 *
 * Both cards are plain server reads (AD-1) handed to client components for
 * their OWN interactivity (`Schedule`'s filters/calendar popover,
 * `BookingsTable`'s workflow actions) — `router.refresh()` on every
 * successful mutation is what makes a change show up in either. `?view`/
 * `?date` (timeline) and `?page` (list) are two INDEPENDENT pieces of URL
 * state on the SAME page (lesson 6.4 M1): every href below preserves the
 * OTHER section's current state, never resets it.
 */
export default async function BookingsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam, view: viewParam, date: dateParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  const canManageAny = hasPermission(actor, 'bookings.manage.any');
  const canManageOwn = hasPermission(actor, 'bookings.manage.own');
  if (!canManageAny && !canManageOwn && !hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const canCreate = canManageAny || canManageOwn;

  // `listBookableAircraft` serves both the timeline (every viewer) and the
  // create form's picker — called unconditionally (story 7.2 Task 3).
  const aircraftOptions: AircraftOption[] = await listBookableAircraft(actor);

  // Story 7.3/12.3: needed for the create form's instructor toggle, the
  // list's row-ownership check, AND (new, story 12.3 AC 2) the timeline's
  // own instructor filter — `self.read` (every role), called unconditionally.
  const ownInstructorProfileId = await getOwnInstructorProfileId(actor);
  const instructorOptions: InstructorOption[] = await listActiveInstructors(actor);

  let formMode: NewBookingFormMode = 'pilot';
  let personOptions: PersonOption[] = [];
  let staffInstructorOptions: InstructorOption[] = [];
  let studentOptions: PersonOption[] = [];

  if (canCreate) {
    if (canManageAny) {
      formMode = 'staff';
      const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });
      personOptions = peopleResult.items
        .filter((person) => person.archivedAt === null && (person.profiles.pilot || person.profiles.student || person.profiles.instructor))
        .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
      staffInstructorOptions = instructorOptions;
    } else if (ownInstructorProfileId) {
      formMode = 'instructor';
      studentOptions = await listBookableStudents(actor);
    } else {
      formMode = 'pilot';
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  // Review 12.3 F7: the visible list's lower bound, `nowIso` minus 48h — see
  // `ALL_BOOKING_STATUSES`'s doc-comment above for the ratified rationale.
  const listFrom = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  let bookingsResult = await listBookings(actor, { from: listFrom, pageSize: BOOKINGS_PAGE_SIZE, page, status: [...ALL_BOOKING_STATUSES] });
  // Clamp an out-of-range ?page to the last real page (same pattern as `FlightsPage`).
  const lastPage = Math.max(1, Math.ceil(bookingsResult.total / BOOKINGS_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    bookingsResult = await listBookings(actor, { from: listFrom, pageSize: BOOKINGS_PAGE_SIZE, page, status: [...ALL_BOOKING_STATUSES] });
  }
  const totalPages = Math.max(1, Math.ceil(bookingsResult.total / BOOKINGS_PAGE_SIZE));

  // "N in attesa" (story 12.3, AC 3, card-sub) — a dedicated cheap count
  // query (`pageSize: 1`, only `.total` is read) rather than counting
  // `bookingsResult.items` client-side, since that's only the CURRENT page.
  const pendingResult = await listBookings(actor, { from: nowIso, status: ['PENDING'], page: 1, pageSize: 1 });
  const pendingCount = pendingResult.total;

  // --- Timeline (story 7.2, AC 1; re-presented story 12.3, AC 2) ---------
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const view = sanitizeView(viewParam);
  const date = sanitizeDate(dateParam, today);
  const isToday = view === 'day' && date === today;

  const weekStart = weekStartDateOnly(date);
  const weekDatesOnly = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDaysDateOnly(weekStart, i)) : [];
  const rangeFromDateOnly = view === 'day' ? date : weekStart;
  const rangeToDateOnly = view === 'day' ? addDaysDateOnly(date, 1) : addDaysDateOnly(weekStart, 7);
  const calendarFrom = zonedMidnightUtc(rangeFromDateOnly, APP_TIMEZONE);
  const calendarTo = zonedMidnightUtc(rangeToDateOnly, APP_TIMEZONE);

  const calendarBookings = await listCalendarBookings(actor, { from: calendarFrom.toISOString(), to: calendarTo.toISOString() });
  const dayBlocks = view === 'day' ? projectDayBlocks(calendarBookings, date) : [];
  // Story 12.3: the week view needs chips across the WHOLE displayed week
  // regardless of `view` (the day-view branch above only projects `date`
  // itself) — always computed when `view === 'week'`, matching the
  // `calendarBookings` range fetched for that case.
  const weekChips = view === 'week' ? projectWeekChips(calendarBookings, weekDatesOnly) : [];

  const nowLinePercent = isToday ? clampToWindowPercent(wallMinutesOfDay(new Date()) - WINDOW_START_MINUTES) : null;

  const prevDate = view === 'day' ? addDaysDateOnly(date, -1) : addDaysDateOnly(date, -7);
  const nextDate = view === 'day' ? addDaysDateOnly(date, 1) : addDaysDateOnly(date, 7);

  // Href builder (lesson 6.4 M1): every timeline link preserves the LIST
  // section's `?page` (only when it isn't the default page 1), never resets
  // it — a next-intl `Link`'s query object REPLACES the whole query string.
  function calendarHref(overrides: { view?: BookingCalendarView; date?: string }) {
    const nextView = overrides.view ?? view;
    const nextDateValue = overrides.date ?? date;
    return {
      pathname: '/dashboard/bookings',
      query: {
        ...(nextView !== 'day' ? { view: nextView } : {}),
        ...(nextDateValue !== today ? { date: nextDateValue } : {}),
        ...(page > 1 ? { page } : {}),
      },
    };
  }

  const calendarNav: CalendarNav = {
    prevHref: calendarHref({ date: prevDate }),
    todayHref: calendarHref({ date: today }),
    nextHref: calendarHref({ date: nextDate }),
    dayViewHref: calendarHref({ view: 'day' }),
    weekViewHref: calendarHref({ view: 'week' }),
  };

  // Week-day cell hrefs (story 12.3, AC 2: click a day -> its day view) —
  // bounded to exactly 7 dates, so (unlike the calendar popover's arbitrary
  // pick, `schedule.tsx`'s own small client-only `buildDateHref`)
  // precomputing them here needs no client-side duplication.
  function hrefString(overrides: { view?: BookingCalendarView; date?: string }): string {
    const href = calendarHref(overrides);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(href.query)) {
      params.set(key, String(value));
    }
    const qs = params.toString();
    return `${href.pathname}${qs ? `?${qs}` : ''}`;
  }
  const weekDates = weekDatesOnly.map((dateOnly) => ({ dateOnly, href: hrefString({ date: dateOnly }) }));

  const t = await getTranslations('BookingsPage');
  const dateLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';

  // Story 10.1 (AC 5): the export mirrors the SAME `from` + `status` filters
  // the list above was fetched with (12.2 review F2's lesson, story 12.3: now
  // ALL statuses since the list itself shows all of them; review 12.3 F7:
  // `listFrom`, not a bare `nowIso`, so the export never diverges from what
  // the list actually shows).
  const exportHref = buildExportHref('/api/v1/bookings', { from: listFrom, status: ALL_BOOKING_STATUSES.join(',') }, locale);

  // Story 7.3/12.3: serialize the already status-filtered, service-side rows
  // into plain wire DTOs before crossing the server -> client boundary
  // (`bookings-table.tsx`) — `startsAtDateOnly`/`endsAtDateOnly` (AC 3:
  // "formato formatDateOnly") are computed here with `dateOnlyInZone`
  // (SERVER-ONLY, `zoned-time.ts`'s own doc-comment) so the client component
  // never re-derives a Europe/Rome calendar day from a raw instant.
  const bookingRows: BookingRowDto[] = bookingsResult.items.map((booking) => ({
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

  const scheduleLabels: ScheduleLabels = {
    cardTitle: t('schedule.cardTitle'),
    cardTitleToday: t('schedule.cardTitleToday'),
    prev: t('calendar.toolbar.prev'),
    today: t('calendar.toolbar.today'),
    next: t('calendar.toolbar.next'),
    dayView: t('calendar.toolbar.dayView'),
    weekView: t('calendar.toolbar.weekView'),
    viewToggleLabel: t('calendar.toolbar.viewToggleLabel'),
    filters: t('schedule.filters'),
    filtersDone: t('schedule.filtersDone'),
    filtersReset: t('schedule.filtersReset'),
    filtersAll: t('schedule.filtersAll'),
    filtersAircraft: t('schedule.filtersAircraft'),
    filtersInstructor: t('schedule.filtersInstructor'),
    prevMonth: t('schedule.prevMonth'),
    nextMonth: t('schedule.nextMonth'),
    aog: t('schedule.aog'),
    available: t('schedule.available'),
    outOfService: t('calendar.outOfService'),
    dayEmpty: t('calendar.dayEmpty'),
    noAircraft: t('calendar.noAircraft'),
    clampedStartHint: t('calendar.clampedStartHint'),
    clampedEndHint: t('calendar.clampedEndHint'),
    weekBookingsCountTemplate: t.raw('schedule.weekBookingsCount') as string,
  };

  const newBookingLabels: NewBookingFormLabels = {
    title: t('form.title'),
    subtitle: t('list.cardTitle'),
    selectPlaceholder: t('form.selectPlaceholder'),
    aircraft: t('form.aircraft'),
    outOfServiceSuffix: t.raw('form.outOfServiceSuffix') as string,
    person: t('form.person'),
    noPersonAvailable: t('form.noPersonAvailable'),
    instructorOptional: t('form.instructorOptional'),
    noInstructor: t('form.noInstructor'),
    bookingTarget: t('form.bookingTarget'),
    bookForMe: t('form.bookForMe'),
    bookForStudent: t('form.bookForStudent'),
    student: t('form.student'),
    noStudentAvailable: t('form.noStudentAvailable'),
    startsAt: t('form.startsAt'),
    endsAt: t('form.endsAt'),
    notes: t('form.notes'),
    submit: t('form.submit'),
    requiredField: t('form.requiredField'),
    invalidRange: t('form.invalidRange'),
    errors: {
      AIRCRAFT_OUT_OF_SERVICE: t.raw('form.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
      BOOKING_IN_PAST: t('form.errors.BOOKING_IN_PAST'),
      PERSON_NOT_BOOKABLE: t('form.errors.PERSON_NOT_BOOKABLE'),
      EXPIRED_DOCUMENTS: t.raw('form.errors.EXPIRED_DOCUMENTS') as string,
      overlap: t('form.errors.overlap'),
      generic: t('form.errors.generic'),
    },
    success: t('form.success'),
    successWithWarnings: t('form.successWithWarnings'),
    force: {
      title: t('form.force.title'),
      description: t('form.force.description'),
      reasonLabel: t('form.force.reasonLabel'),
      submit: t('form.force.submit'),
      cancel: t('form.force.cancel'),
      requiredReason: t('form.force.requiredReason'),
      generic: t('form.force.generic'),
    },
  };

  const editBookingLabels: EditBookingFormLabels = {
    title: t('list.actions.moveTitle'),
    subtitle: t('list.cardTitle'),
    cancel: t('list.actions.dismiss'),
    save: t('list.actions.save'),
    selectPlaceholder: t('form.selectPlaceholder'),
    aircraft: t('form.aircraft'),
    outOfServiceSuffix: t.raw('form.outOfServiceSuffix') as string,
    startsAt: t('form.startsAt'),
    endsAt: t('form.endsAt'),
    notes: t('form.notes'),
    requiredField: t('form.requiredField'),
    invalidRange: t('form.invalidRange'),
    errors: {
      BOOKING_ALREADY_STARTED: t('list.actions.errors.BOOKING_ALREADY_STARTED'),
      BOOKING_IN_PAST: t('form.errors.BOOKING_IN_PAST'),
      AIRCRAFT_OUT_OF_SERVICE: t.raw('form.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
      EXPIRED_DOCUMENTS: t.raw('list.actions.errors.EXPIRED_DOCUMENTS') as string,
      conflict: t('list.actions.errors.conflict'),
      generic: t('list.actions.errors.generic'),
    },
  };

  const bookingsTableLabels: BookingsTableLabels = {
    cardTitle: t('list.cardTitle'),
    pendingSummary: t.raw('list.pendingSummary') as string,
    newButton: t('list.newButton'),
    exportLabel: t('list.exportLabel'),
    exportXls: t('list.exportXls'),
    empty: t('list.empty'),
    table: {
      pilot: t('list.table.pilot'),
      startsAt: t('list.table.startsAt'),
      endsAt: t('list.table.endsAt'),
      aircraft: t('list.table.aircraft'),
      status: t('list.table.status'),
      actions: t('list.table.actions'),
    },
    status: {
      PENDING: t('list.status.PENDING'),
      APPROVED: t('list.status.APPROVED'),
      DENIED: t('list.status.DENIED'),
      FLOWN: t('list.status.FLOWN'),
      NO_SHOW: t('list.status.NO_SHOW'),
      CANCELLED: t('list.status.CANCELLED'),
    },
    actions: {
      approve: t('list.actions.approve'),
      reject: t('list.actions.reject'),
      move: t('list.actions.move'),
      markFlown: t('list.actions.markFlown'),
      markNoShow: t('list.actions.markNoShow'),
      cancel: t('list.actions.cancel'),
      reopen: t('list.actions.reopen'),
      cancelPrompt: t('list.actions.cancelPrompt'),
      cancelConfirm: t('list.actions.cancelConfirm'),
      dismiss: t('list.actions.dismiss'),
      moveTitle: t('list.actions.moveTitle'),
      save: t('list.actions.save'),
      approveSuccess: t('list.actions.approveSuccess'),
      rejectSuccess: t('list.actions.rejectSuccess'),
      reopenSuccess: t('list.actions.reopenSuccess'),
      flownSuccess: t('list.actions.flownSuccess'),
      noShowSuccess: t('list.actions.noShowSuccess'),
      moveSuccess: t('list.actions.moveSuccess'),
      cancelSuccess: t('list.actions.cancelSuccess'),
      errors: {
        BOOKING_ALREADY_STARTED: t('list.actions.errors.BOOKING_ALREADY_STARTED'),
        BOOKING_TRANSITION_INVALID: t('list.actions.errors.BOOKING_TRANSITION_INVALID'),
        BOOKING_DENY_REASON_REQUIRED: t('list.actions.errors.BOOKING_DENY_REASON_REQUIRED'),
        EXPIRED_DOCUMENTS: t.raw('list.actions.errors.EXPIRED_DOCUMENTS') as string,
        AIRCRAFT_OUT_OF_SERVICE: t.raw('list.actions.errors.AIRCRAFT_OUT_OF_SERVICE') as string,
        conflict: t('list.actions.errors.conflict'),
        generic: t('list.actions.errors.generic'),
      },
    },
    denyModal: {
      title: t('list.denyModal.title'),
      subtitle: t('list.denyModal.subtitle'),
      reasonPlaceholder: t('list.denyModal.reasonPlaceholder'),
      reasonRequired: t('list.denyModal.reasonRequired'),
      submit: t('list.denyModal.submit'),
      cancel: t('list.denyModal.cancel'),
    },
  };

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub')}</div>
        </div>
      </div>

      <Schedule
        view={view}
        date={date}
        today={today}
        isToday={isToday}
        weekDates={weekDates}
        aircraft={aircraftOptions}
        instructors={instructorOptions}
        dayBlocks={dayBlocks}
        weekChips={weekChips}
        nowLinePercent={nowLinePercent}
        locale={dateLocale}
        nav={calendarNav}
        listPage={page}
        labels={scheduleLabels}
      />

      <BookingsTable
        items={bookingRows}
        pendingCount={pendingCount}
        total={bookingsResult.total}
        aircraftOptions={aircraftOptions}
        view={view}
        date={date}
        today={today}
        canManageAny={canManageAny}
        canManageOwn={canManageOwn}
        ownPersonId={actor.personId}
        ownInstructorProfileId={ownInstructorProfileId}
        locale={dateLocale}
        page={page}
        totalPages={totalPages}
        exportHref={exportHref}
        canCreate={canCreate}
        formMode={formMode}
        personOptions={personOptions}
        instructorOptions={staffInstructorOptions}
        studentOptions={studentOptions}
        newBookingLabels={newBookingLabels}
        editBookingLabels={editBookingLabels}
        labels={bookingsTableLabels}
      />
    </main>
  );
}
