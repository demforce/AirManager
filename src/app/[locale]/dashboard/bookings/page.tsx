import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { APP_TIMEZONE, formatDateTime, formatTimeOfDay } from '@/lib/time';
import { addDaysDateOnly, todayDateOnlyInZone, weekStartDateOnly, zonedMidnightUtc, zonedWallTime } from '@/lib/zoned-time';
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
import { BookingCalendar, type BookingCalendarView, type CalendarDayBlock, type CalendarNav, type CalendarWeekChip } from './booking-calendar';
import { NewBookingForm, type AircraftOption, type InstructorOption, type NewBookingFormMode, type PersonOption } from './new-booking-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; view?: string; date?: string }>;
};

/** Staff/instructor picker candidate cap — same "small admin-managed list" convention as `flights/page.tsx`'s `OPTIONS_PAGE_SIZE`. */
const OPTIONS_PAGE_SIZE = 100;

/** "Prossime prenotazioni" page size. */
const BOOKINGS_PAGE_SIZE = 20;

// --- Calendar (epic 7, story 7.2, FR-19) ------------------------------------
// Hand-edited URL defense (same pattern as `expiries/page.tsx`'s
// `sanitizeScope`/`sanitizeStatus`): an invalid `?view`/`?date` NEVER
// errors, it silently falls back to the default — the calendar's own
// helpers (`zoned-time.ts`) also never see anything but a validated value.

const CALENDAR_VIEWS = ['day', 'week'] as const;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeView(value: string | undefined): BookingCalendarView {
  return value && (CALENDAR_VIEWS as readonly string[]).includes(value) ? (value as BookingCalendarView) : 'day';
}

/** Accepts only a REAL calendar date in `YYYY-MM-DD` form (rejects e.g. `2026-02-30` via a round-trip check) — anything else falls back to "today" in `APP_TIMEZONE`. */
function sanitizeDate(value: string | undefined, today: string): string {
  if (!value || !DATE_ONLY_PATTERN.test(value)) return today;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day;
  return isRealDate ? value : today;
}

/** The day-view vertical axis (Contesto: "06:00–22:00 Europe/Rome ... su 960'"). Minutes from midnight. */
const WINDOW_START_MINUTES = 6 * 60;
const WINDOW_END_MINUTES = 22 * 60;
const WINDOW_SPAN_MINUTES = WINDOW_END_MINUTES - WINDOW_START_MINUTES;
const MINUTES_PER_DAY = 24 * 60;
/**
 * A block is never rendered with zero (or near-zero) visible height, even
 * for a booking that is entirely clamped away (Contesto: "MAI nascosti") —
 * 8% of the 768px grid is ~61px, enough to fit the clamp indicator + time +
 * name on three short lines without the `overflow-hidden` wrapper clipping
 * them (verified interactively, Playwright MCP: a booking entirely before
 * 06:00 needs exactly this).
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
 * ALREADY-POSITIONED day-view block (Dev Notes: "il client riceve blocchi
 * già proiettati ({top%, height%, label})") — SERVER-SIDE, via
 * `zonedWallTime`/`zonedMidnightUtc` (`zoned-time.ts`, story 7.2 Task 1):
 * the client never redoes this conversion (lesson 7.1: "container UTC vs
 * display CEST").
 *
 * A booking that starts before this day (or before 06:00 within it) is
 * clamped to the top edge with `clampedTop`; one that ends after this day
 * (or after 22:00) is clamped to the bottom edge with `clampedBottom` —
 * EITHER WAY IT IS STILL RENDERED (Contesto: "MAI nascosti"), just clamped,
 * with the REAL (unclamped) `HH:MM–HH:MM` always shown as `timeLabel`.
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

    blocks.push({
      id: booking.id,
      aircraftId: booking.aircraftId,
      top,
      height: Math.max(bottom - top, MIN_BLOCK_HEIGHT_PERCENT),
      clampedTop: rawTop < 0,
      clampedBottom: rawBottom > WINDOW_SPAN_MINUTES,
      timeLabel: `${formatWallClock(startsAt)}–${formatWallClock(endsAt)}`,
      personName: booking.personName,
      instructorName: booking.instructorName,
    });
  }
  return blocks;
}

/**
 * Projects every booking overlapping any of `weekDates` into a compact
 * week-view chip (Contesto: "celle con chip compatti HH:MM–HH:MM Nome") —
 * one chip PER (booking, day) it overlaps, so a booking spanning midnight
 * appears once in each neighboring day's cell, each clamped independently
 * (same rationale as {@link projectDayBlocks}, without the 06-22 window —
 * the week view has no vertical axis to clamp against, only day
 * boundaries). Composite `id` (`bookingId:dateOnly`) keeps React's
 * `key={id}` unique across those repeats.
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
        instructorName: booking.instructorName,
      });
    }
  }
  return chips;
}

/**
 * Aircraft bookings (epic 7, stories 7.1/7.2; FR-18/FR-19) — Task 5 (7.1) +
 * Task 3 (7.2). Page order (7.2 Contesto): header -> **calendar** -> "Nuova
 * prenotazione" form (unchanged, `canCreate`-gated) -> "Prossime
 * prenotazioni" (unchanged). Gate: `bookings.manage.own` OR
 * `bookings.manage.any` OR `self.read` (in practice every authenticated
 * actor — the calendar/list serve everyone, FR-19). `canCreate` (either
 * `bookings.manage.*` permission) decides whether the "Nuova prenotazione"
 * form renders at all; within that, `formMode` picks the SHAPE of the form
 * (AD-5: only what to RENDER — `bookings.service.ts#createBooking` is the
 * real guardian regardless of what this page decides to show):
 *
 * - `staff` (`bookings.manage.any`): free person + optional instructor picker.
 * - `instructor` (`bookings.manage.own` AND an active own `InstructorProfile`,
 *   `getOwnInstructorProfileId`): "per me" / "per un allievo" toggle.
 * - `pilot` (`bookings.manage.own`, no active own instructor profile): books
 *   for self only, no picker at all.
 *
 * The calendar (7.2) and "Prossime prenotazioni" (7.1) table are BOTH plain
 * server reads (AD-1) — the form is the only client-interactive piece, and
 * its `router.refresh()` on success is what makes a freshly created booking
 * show up in either. `?view`/`?date` (calendar) and `?page` (list) are two
 * INDEPENDENT pieces of URL state on the SAME page (lesson 6.4 M1, same
 * pattern as `expiries/page.tsx`'s `dashboardPage`/`page`): every href
 * below preserves the OTHER section's current state, never resets it.
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

  // `listBookableAircraft` now serves the calendar too (story 7.2) — moved
  // OUT of the `canCreate` branch below, called unconditionally for every
  // viewer (Task 3: "ORA serve anche ai non-creator").
  const aircraftOptions: AircraftOption[] = await listBookableAircraft(actor);

  let formMode: NewBookingFormMode = 'pilot';
  let personOptions: PersonOption[] = [];
  let instructorOptions: InstructorOption[] = [];
  let studentOptions: PersonOption[] = [];
  let ownInstructorProfileId: string | null = null;

  if (canCreate) {
    if (canManageAny) {
      formMode = 'staff';
      const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });
      personOptions = peopleResult.items
        .filter((person) => person.archivedAt === null && (person.profiles.pilot || person.profiles.student || person.profiles.instructor))
        .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
      instructorOptions = await listActiveInstructors(actor);
    } else {
      ownInstructorProfileId = await getOwnInstructorProfileId(actor);
      if (ownInstructorProfileId) {
        formMode = 'instructor';
        studentOptions = await listBookableStudents(actor);
      } else {
        formMode = 'pilot';
      }
    }
  }

  const nowIso = new Date().toISOString();
  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  let bookingsResult = await listBookings(actor, { from: nowIso, pageSize: BOOKINGS_PAGE_SIZE, page });
  // Clamp an out-of-range ?page to the last real page (same pattern as `FlightsPage`).
  const lastPage = Math.max(1, Math.ceil(bookingsResult.total / BOOKINGS_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    bookingsResult = await listBookings(actor, { from: nowIso, pageSize: BOOKINGS_PAGE_SIZE, page });
  }
  const totalPages = Math.max(1, Math.ceil(bookingsResult.total / BOOKINGS_PAGE_SIZE));

  // --- Calendar (story 7.2, AC 1) --------------------------------------
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const view = sanitizeView(viewParam);
  const date = sanitizeDate(dateParam, today);

  const weekStart = weekStartDateOnly(date);
  const weekDates = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDaysDateOnly(weekStart, i)) : [];
  const rangeFromDateOnly = view === 'day' ? date : weekStart;
  const rangeToDateOnly = view === 'day' ? addDaysDateOnly(date, 1) : addDaysDateOnly(weekStart, 7);
  const calendarFrom = zonedMidnightUtc(rangeFromDateOnly, APP_TIMEZONE);
  const calendarTo = zonedMidnightUtc(rangeToDateOnly, APP_TIMEZONE);

  const calendarBookings = await listCalendarBookings(actor, { from: calendarFrom.toISOString(), to: calendarTo.toISOString() });
  const dayBlocks = view === 'day' ? projectDayBlocks(calendarBookings, date) : [];
  const weekChips = view === 'week' ? projectWeekChips(calendarBookings, weekDates) : [];

  const prevDate = view === 'day' ? addDaysDateOnly(date, -1) : addDaysDateOnly(date, -7);
  const nextDate = view === 'day' ? addDaysDateOnly(date, 1) : addDaysDateOnly(date, 7);

  // Href builder (lesson 6.4 M1): every calendar link preserves the LIST
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

  // `pageHref` (list pagination) preserves the CALENDAR's `?view`/`?date`
  // the same way (lesson 6.4 M1) — the inverse direction of `calendarHref` above.
  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/bookings',
      query: {
        page: targetPage,
        ...(view !== 'day' ? { view } : {}),
        ...(date !== today ? { date } : {}),
      },
    };
  }

  const t = await getTranslations('BookingsPage');
  const dateLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">{t('title')}</h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#787774]">{t('description')}</p>
          </div>
          <Link
            href="/dashboard"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        <BookingCalendar
          view={view}
          date={date}
          weekDates={weekDates}
          aircraft={aircraftOptions}
          dayBlocks={dayBlocks}
          weekChips={weekChips}
          locale={dateLocale}
          nav={calendarNav}
          labels={{
            prev: t('calendar.toolbar.prev'),
            today: t('calendar.toolbar.today'),
            next: t('calendar.toolbar.next'),
            dayView: t('calendar.toolbar.dayView'),
            weekView: t('calendar.toolbar.weekView'),
            viewToggleLabel: t('calendar.toolbar.viewToggleLabel'),
            outOfService: t('calendar.outOfService'),
            dayEmpty: t('calendar.dayEmpty'),
            weekEmpty: t('calendar.weekEmpty'),
            noAircraft: t('calendar.noAircraft'),
            clampedStartHint: t('calendar.clampedStartHint'),
            clampedEndHint: t('calendar.clampedEndHint'),
            weekdayColumnLabel: t('calendar.weekdayColumnLabel'),
          }}
        />

        {canCreate ? (
          <div className="mt-10">
            <NewBookingForm
              mode={formMode}
              aircraftOptions={aircraftOptions}
              personOptions={personOptions}
              instructorOptions={instructorOptions}
              studentOptions={studentOptions}
              ownPersonId={actor.personId}
              ownInstructorProfileId={ownInstructorProfileId}
              labels={{
                title: t('form.title'),
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
                  overlap: t('form.errors.overlap'),
                  generic: t('form.errors.generic'),
                },
                success: t('form.success'),
              }}
            />
          </div>
        ) : null}

        <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="bookings-list-section">
          <h2 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">{t('list.heading')}</h2>
          <p className="mt-1 text-sm text-[#787774]">{t('list.description')}</p>

          <div className="mt-6 overflow-x-auto rounded-[12px] border border-[#EAEAEA]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">
                  <th className="px-5 py-3">{t('list.table.aircraft')}</th>
                  <th className="px-5 py-3">{t('list.table.date')}</th>
                  <th className="px-5 py-3">{t('list.table.time')}</th>
                  <th className="px-5 py-3">{t('list.table.person')}</th>
                  <th className="px-5 py-3">{t('list.table.instructor')}</th>
                </tr>
              </thead>
              <tbody>
                {bookingsResult.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[#787774]">
                      {t('list.empty')}
                    </td>
                  </tr>
                ) : (
                  bookingsResult.items.map((booking) => {
                    const startsAt = new Date(booking.startsAt);
                    const endsAt = new Date(booking.endsAt);
                    return (
                      <tr key={booking.id} className="border-b border-[#EAEAEA] last:border-b-0" data-testid="booking-row">
                        <td className="px-5 py-3 align-middle font-medium text-[#111111]">{booking.aircraftRegistration}</td>
                        <td className="px-5 py-3 align-middle whitespace-nowrap text-[#2F3437]">
                          {/* `formatDateTime` is "DD/MM/YYYY, HH:MM" (Intl's it-IT/en-IE locale separator) — split on the comma, not a bare space. */}
                          {formatDateTime(startsAt, dateLocale).split(',')[0]}
                        </td>
                        <td className="px-5 py-3 align-middle whitespace-nowrap text-[#2F3437]">
                          {formatTimeOfDay(startsAt, dateLocale)}–{formatTimeOfDay(endsAt, dateLocale)}
                        </td>
                        <td className="px-5 py-3 align-middle text-[#2F3437]">{booking.personName}</td>
                        <td className="px-5 py-3 align-middle text-[#787774]">{booking.instructorName ?? t('list.table.noInstructor')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-[#787774]">
              <Link
                href={pageHref(page - 1)}
                locale={locale as AppLocale}
                aria-disabled={page <= 1}
                className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                  page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
                }`}
              >
                &larr;
              </Link>
              <span data-testid="booking-pagination-status">
                {page} / {totalPages}
              </span>
              <Link
                href={pageHref(page + 1)}
                locale={locale as AppLocale}
                aria-disabled={page >= totalPages}
                className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                  page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
                }`}
              >
                &rarr;
              </Link>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
