'use client';

/**
 * "Programma" timeline card (story 12.3, AC 2) — port of
 * `docs/design-reference/airops/src/Schedule.jsx`'s day/week timeline onto
 * real data. The day/week toggle and prev/today/next navigation stay
 * URL-driven Links (Contesto: "le convenzioni URL esistenti restano
 * IDENTICHE" — `?view`/`?date` sanitized server-side, `page.tsx`), same as
 * the legacy `booking-calendar.tsx` this replaces; ONLY the calendar
 * popover's arbitrary date pick and the week view's day-cell click need a
 * client-computed href (`buildDateHref` below, a small pure duplicate of
 * `page.tsx`'s own `calendarHref` — every OTHER nav link stays a
 * server-computed prop, no point sharing a module for one tiny function).
 * The aircraft/instructor filters (Contesto AC 2: "filtro tipo volo" from
 * the prototype does not exist on the Booking domain, D13 — replaced with
 * aircraft/instructor) are pure client state, never persisted to the URL.
 *
 * Blocks/AOG rows reuse `page.tsx`'s existing `projectDayBlocks`/
 * `projectWeekChips` output UNCHANGED (Contesto: "cambia la PRESENTAZIONE,
 * non la meccanica") — only the CSS axis flips from the legacy calendar's
 * vertical (aircraft = column, hour = row) to the prototype's horizontal
 * (aircraft = row, hour = column); the SAME `top`/`height` percentages the
 * projection already computes are reused verbatim as `left`/`width` here,
 * since both are just "how far through the 06:00-22:00 window" percentages.
 */
import { useState, type MouseEvent } from 'react';
import { getPathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { CalendarPopover } from '@/components/ui/calendar-popover';
import { Icon } from '@/components/ui/icons';
import { parseDateOnlyUtc } from '@/lib/date-only';
import type { InstructorOption } from './new-booking-form';

export type BookingCalendarView = 'day' | 'week';

/** A day-view block, already positioned by `page.tsx#projectDayBlocks` — `top`/`height` are percentages of the 06:00-22:00 window, reused as `left`/`width` here (see module doc-comment). */
export type CalendarDayBlock = {
  id: string;
  aircraftId: string;
  top: number;
  height: number;
  clampedTop: boolean;
  clampedBottom: boolean;
  timeLabel: string;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
};

/** A week-view (booking, day) overlap, produced by `page.tsx#projectWeekChips` — story 12.3 only reads it for PER-DAY COUNTS (Contesto: "griglia .week-grid con conteggi reali per giorno"), never renders individual chips (the prototype's own week view has no per-aircraft breakdown). */
export type CalendarWeekChip = {
  id: string;
  aircraftId: string;
  dateOnly: string;
  timeLabel: string;
  clampedStart: boolean;
  clampedEnd: boolean;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
};

export type ScheduleAircraftRow = {
  id: string;
  registration: string;
  model: string;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
};

export type CalendarNav = {
  prevHref: { pathname: string; query: Record<string, string | number> };
  todayHref: { pathname: string; query: Record<string, string | number> };
  nextHref: { pathname: string; query: Record<string, string | number> };
  dayViewHref: { pathname: string; query: Record<string, string | number> };
  weekViewHref: { pathname: string; query: Record<string, string | number> };
};

export type ScheduleLabels = {
  cardTitle: string;
  cardTitleToday: string;
  prev: string;
  today: string;
  next: string;
  dayView: string;
  weekView: string;
  viewToggleLabel: string;
  filters: string;
  filtersDone: string;
  filtersReset: string;
  filtersAll: string;
  filtersAircraft: string;
  filtersInstructor: string;
  prevMonth: string;
  nextMonth: string;
  aog: string;
  available: string;
  outOfService: string;
  dayEmpty: string;
  noAircraft: string;
  clampedStartHint: string;
  clampedEndHint: string;
  /** Raw (`t.raw`) `"{count} …"` template — client-interpolated (see `weekBookingsLabel` below), same pattern as `new-booking-form.tsx`'s `outOfServiceSuffix`/`EXPIRED_DOCUMENTS`: the per-day count changes with the client-only aircraft/instructor filter, so it cannot be pre-formatted server-side. */
  weekBookingsCountTemplate: string;
};

export type ScheduleProps = {
  view: BookingCalendarView;
  /** Day view: the exact day shown. Week view: any day inside the shown week (the toggle's carry-over anchor). */
  date: string;
  today: string;
  isToday: boolean;
  /** The 7 dates (Monday..Sunday) of the shown week, each with its own precomputed day-view href — only read when `view === 'week'`. */
  weekDates: Array<{ dateOnly: string; href: string }>;
  aircraft: ScheduleAircraftRow[];
  instructors: InstructorOption[];
  dayBlocks: CalendarDayBlock[];
  weekChips: CalendarWeekChip[];
  /** Day view only — the "now" vertical line's `left%`, `null` when `!isToday`. */
  nowLinePercent: number | null;
  locale: 'it' | 'en';
  nav: CalendarNav;
  /** The list section's current `?page` — preserved by every date the calendar popover navigates to (lesson 6.4 M1, same crosstalk contract as the legacy calendar). */
  listPage: number;
  /**
   * The day-view axis bounds, in whole hours (story 12.11, AC 4: "la
   * timeline legge l'asse orario dalle settings quando presenti"). Always
   * concrete numbers — `page.tsx` resolves the 6/22 default itself when
   * `sched.openTime`/`closeTime` are not configured, so this component never
   * needs a second default.
   */
  windowStartHour: number;
  windowEndHour: number;
  labels: ScheduleLabels;
};

function intlLocale(locale: 'it' | 'en'): string {
  return locale === 'it' ? 'it-IT' : 'en-IE';
}

/** Short weekday + day, e.g. "LUN 06 LUG" — the day view's `card-sub`/date-pick label. */
function formatDayShort(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(parseDateOnlyUtc(dateOnly))
    .toUpperCase();
}

/** Full localized day heading, for the date-pick button's `title`. */
function formatDayFull(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    parseDateOnlyUtc(dateOnly),
  );
}

function formatDayMonth(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(parseDateOnlyUtc(dateOnly));
}

function formatWeekdayShort(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' }).format(parseDateOnlyUtc(dateOnly)).toUpperCase();
}

/** `CalendarPopover` needs plain LOCAL-constructor `Date`s (same convention its own `calendar-grid.ts` uses) — this is a client-side-only calendar WIDGET, never an instant, so there is no UTC/zone concern to guard against here (unlike every `Date` `page.tsx` hands the server). */
function dateOnlyToLocalDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

function localDateToDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Small client-only duplicate of `page.tsx#calendarHref`'s day-view case — see module doc-comment. */
function buildDateHref(dateOnly: string, view: BookingCalendarView, listPage: number, today: string): string {
  const params = new URLSearchParams();
  if (view !== 'day') params.set('view', view);
  if (dateOnly !== today) params.set('date', dateOnly);
  if (listPage > 1) params.set('page', String(listPage));
  const qs = params.toString();
  return `/dashboard/bookings${qs ? `?${qs}` : ''}`;
}

export function Schedule({
  view,
  date,
  today,
  isToday,
  weekDates,
  aircraft,
  instructors,
  dayBlocks,
  weekChips,
  nowLinePercent,
  locale,
  nav,
  listPage,
  windowStartHour,
  windowEndHour,
  labels,
}: ScheduleProps) {
  const router = useRouter();
  const HOURS = Array.from({ length: windowEndHour - windowStartHour + 1 }, (_, i) => windowStartHour + i);
  const hourLeftPercent = (hour: number) => ((hour - windowStartHour) / (windowEndHour - windowStartHour)) * 100;
  const [calOpen, setCalOpen] = useState(false);
  const [calCursor, setCalCursor] = useState(() => dateOnlyToLocalDate(date));
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAircraftId, setFilterAircraftId] = useState('all');
  const [filterInstructorId, setFilterInstructorId] = useState('all');

  const filterCount = (filterAircraftId !== 'all' ? 1 : 0) + (filterInstructorId !== 'all' ? 1 : 0);
  const visibleAircraft = aircraft.filter((ac) => filterAircraftId === 'all' || ac.id === filterAircraftId);

  function matchesInstructorFilter(instructorProfileId: string | null): boolean {
    return filterInstructorId === 'all' || instructorProfileId === filterInstructorId;
  }

  function navigateToDate(dateOnly: string) {
    router.push(buildDateHref(dateOnly, view, listPage, today));
  }

  /**
   * Opening the popover snaps its cursor to the month of the currently
   * selected date (prototype's own behavior) — done here, in the click
   * handler, rather than an effect keyed on `calOpen` (react-hooks/set-state-in-effect:
   * a setState call synchronous in an effect body is a lint error in this
   * codebase). `calOpen` read here is still the PRE-toggle value (this
   * closure runs before the state update below applies), so `!calOpen`
   * correctly means "about to open".
   */
  function toggleCalendarPopover() {
    setFilterOpen(false);
    if (!calOpen) {
      const selected = dateOnlyToLocalDate(date);
      setCalCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
    setCalOpen((open) => !open);
  }

  return (
    <div className="card" data-testid="schedule-section">
      <div className="card-head">
        <div className="card-title">{isToday ? labels.cardTitleToday : labels.cardTitle}</div>
        <span className="card-sub" data-testid="calendar-heading">
          {view === 'day' ? formatDayShort(date, locale) : `${formatDayMonth(weekDates[0]!.dateOnly, locale)} – ${formatDayMonth(weekDates[6]!.dateOnly, locale)}`}
        </span>
        <div className="spacer" />

        <div className="date-nav" style={{ position: 'relative' }}>
          <a href={buildHrefString(nav.prevHref, locale)} onClick={(e) => navigateOnClick(e, router, nav.prevHref)} aria-label={labels.prev} data-testid="calendar-prev" className="iconbtn">
            <Icon.chevL />
          </a>
          <a href={buildHrefString(nav.todayHref, locale)} onClick={(e) => navigateOnClick(e, router, nav.todayHref)} data-testid="calendar-today" className="today-btn">
            {labels.today}
          </a>
          <button type="button" className="btn date-pick-btn" onClick={toggleCalendarPopover} title={formatDayFull(date, locale)} data-testid="schedule-date-pick">
            <Icon.calendar />
            <span>{view === 'week' ? `${formatDayMonth(weekDates[0]!.dateOnly, locale)}–${formatDayMonth(weekDates[6]!.dateOnly, locale)}` : formatDayShort(date, locale)}</span>
          </button>
          <a href={buildHrefString(nav.nextHref, locale)} onClick={(e) => navigateOnClick(e, router, nav.nextHref)} aria-label={labels.next} data-testid="calendar-next" className="iconbtn">
            <Icon.chevR />
          </a>
          {calOpen && (
            <>
              <div className="popover-scrim" onClick={() => setCalOpen(false)} />
              <CalendarPopover
                cursor={calCursor}
                onCursorChange={setCalCursor}
                selected={dateOnlyToLocalDate(date)}
                today={dateOnlyToLocalDate(today)}
                onPick={(picked) => {
                  navigateToDate(localDateToDateOnly(picked));
                  setCalOpen(false);
                }}
                onToday={() => {
                  navigateToDate(today);
                  setCalOpen(false);
                }}
                todayLabel={labels.today}
                prevMonthLabel={labels.prevMonth}
                nextMonthLabel={labels.nextMonth}
              />
            </>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={`btn ${filterCount ? 'primary' : ''}`}
            onClick={() => {
              setCalOpen(false);
              setFilterOpen((open) => !open);
            }}
            data-testid="schedule-filter-toggle"
          >
            <Icon.filter /> {labels.filters}
            {filterCount ? ` · ${filterCount}` : ''}
          </button>
          {filterOpen && (
            <>
              <div className="popover-scrim" onClick={() => setFilterOpen(false)} />
              <div className="popover">
                <div className="pop-row">
                  <div className="fld-label">{labels.filtersAircraft}</div>
                  <div className="segmented" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className={filterAircraftId === 'all' ? 'on' : ''} onClick={() => setFilterAircraftId('all')}>
                      {labels.filtersAll}
                    </button>
                    {aircraft.map((ac) => (
                      <button
                        key={ac.id}
                        type="button"
                        className={filterAircraftId === ac.id ? 'on' : ''}
                        onClick={() => setFilterAircraftId(ac.id)}
                        data-testid={`schedule-filter-aircraft-${ac.id}`}
                      >
                        {ac.registration}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pop-row">
                  <div className="fld-label">{labels.filtersInstructor}</div>
                  <div className="segmented" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className={filterInstructorId === 'all' ? 'on' : ''} onClick={() => setFilterInstructorId('all')}>
                      {labels.filtersAll}
                    </button>
                    {instructors.map((instructor) => (
                      <button
                        key={instructor.instructorProfileId}
                        type="button"
                        className={filterInstructorId === instructor.instructorProfileId ? 'on' : ''}
                        onClick={() => setFilterInstructorId(instructor.instructorProfileId)}
                        data-testid={`schedule-filter-instructor-${instructor.instructorProfileId}`}
                      >
                        {instructor.lastName}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pop-foot">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setFilterAircraftId('all');
                      setFilterInstructorId('all');
                    }}
                  >
                    {labels.filtersReset}
                  </button>
                  <button type="button" className="btn primary" onClick={() => setFilterOpen(false)}>
                    {labels.filtersDone}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="segmented" role="group" aria-label={labels.viewToggleLabel}>
          <a
            href={buildHrefString(nav.dayViewHref, locale)}
            onClick={(e) => navigateOnClick(e, router, nav.dayViewHref)}
            className={view === 'day' ? 'on' : ''}
            aria-current={view === 'day' ? 'true' : undefined}
            data-testid="calendar-view-day"
          >
            {labels.dayView}
          </a>
          <a
            href={buildHrefString(nav.weekViewHref, locale)}
            onClick={(e) => navigateOnClick(e, router, nav.weekViewHref)}
            className={view === 'week' ? 'on' : ''}
            aria-current={view === 'week' ? 'true' : undefined}
            data-testid="calendar-view-week"
          >
            {labels.weekView}
          </a>
        </div>
      </div>

      {aircraft.length === 0 ? (
        <p className="mt-4 text-sm" style={{ padding: '0 18px 18px' }}>
          {labels.noAircraft}
        </p>
      ) : view === 'day' ? (
        <div className="schedule">
          <div className="sched-axis">
            <div className="axis-label">{labels.filtersAircraft}</div>
            <div className="axis-ticks" style={{ gridTemplateColumns: `repeat(${HOURS.length - 1}, 1fr)` }}>
              {HOURS.slice(0, -1).map((hour) => (
                <div key={hour} className="tick">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>
          {visibleAircraft.map((ac) => {
            const isAog = ac.status === 'OUT_OF_SERVICE';
            const blocks = isAog ? [] : dayBlocks.filter((block) => block.aircraftId === ac.id && matchesInstructorFilter(block.instructorProfileId));
            return (
              <div key={ac.id} className="sched-row" data-testid="schedule-aircraft-row">
                <div className="sched-resource">
                  <div className="res-meta">
                    <div className="tail">{ac.registration}</div>
                    <div className="res-type">{ac.model}</div>
                    <div className={`res-status ${isAog ? 'aog' : ''}`}>
                      <span className="pill-dot" />
                      {isAog ? labels.aog : labels.available}
                    </div>
                  </div>
                </div>
                <div className="sched-track">
                  {HOURS.map((hour) => (
                    <div key={hour} className="grid-line" style={{ left: `${hourLeftPercent(hour)}%` }} />
                  ))}
                  {isToday && nowLinePercent !== null ? <div className="now-line" style={{ left: `${nowLinePercent}%` }} /> : null}
                  {isAog ? (
                    <div className="flight aog-block" style={{ left: '0%', width: 'calc(100% - 3px)' }} data-testid="schedule-aog-block">
                      <div className="f-head">
                        <span>{labels.aog}</span>
                      </div>
                      <div className="f-sub">{ac.statusReason ?? labels.outOfService}</div>
                    </div>
                  ) : (
                    blocks.map((block) => (
                      <div
                        key={block.id}
                        className="flight"
                        style={{ left: `${block.top}%`, width: `calc(${block.height}% - 3px)` }}
                        title={block.timeLabel}
                        data-testid="schedule-block"
                      >
                        <div className="f-head">
                          <span>
                            {block.clampedTop ? (
                              <span aria-hidden="true">
                                &#9664; <span className="sr-only">{labels.clampedStartHint}</span>
                              </span>
                            ) : null}
                            {block.personName}
                          </span>
                          {block.instructorName ? <span className="mono">{block.instructorName}</span> : null}
                        </div>
                        <div className="f-sub">
                          {block.timeLabel}
                          {block.clampedBottom ? (
                            <span aria-hidden="true">
                              {' '}
                              &#9654; <span className="sr-only">{labels.clampedEndHint}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          {dayBlocks.length === 0 && visibleAircraft.every((ac) => ac.status !== 'OUT_OF_SERVICE') ? (
            <p className="mt-4 text-sm" style={{ padding: '0 18px' }}>
              {labels.dayEmpty}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="week-grid">
          {weekDates.map(({ dateOnly, href }) => {
            const count = weekChips.filter(
              (chip) =>
                chip.dateOnly === dateOnly &&
                (filterAircraftId === 'all' || chip.aircraftId === filterAircraftId) &&
                matchesInstructorFilter(chip.instructorProfileId),
            ).length;
            const isTodayCell = dateOnly === today;
            const isSelected = dateOnly === date;
            return (
              <a
                key={dateOnly}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(href);
                }}
                className={`week-day ${isTodayCell ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                data-testid="schedule-week-day"
              >
                <div className="wd-head">
                  <div className="wd-label mono">{formatWeekdayShort(dateOnly, locale)}</div>
                  <div className="wd-num">{parseDateOnlyUtc(dateOnly).getUTCDate()}</div>
                </div>
                <div className="wd-meta">
                  <span className="num" data-testid="schedule-week-day-count">
                    {labels.weekBookingsCountTemplate.replace('{count}', String(count))}
                  </span>
                </div>
                <div className="wd-bars">
                  {Array.from({ length: Math.min(count, 8) }).map((_, j) => (
                    <div key={j} className={`wd-bar ${j % 4 === 0 ? 'a' : j % 3 === 0 ? 'b' : ''}`} style={{ height: `${30 + ((j * 13) % 50)}%` }} />
                  ))}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** `next-intl`'s `Link` href shape (`{pathname, query}`) flattened into a plain, LOCALE-PREFIXED string via `getPathname` (the same helper `Link` itself uses internally) — so the same nav target can back BOTH a real `<a href>` (works without JS, crawlable, correct locale prefix for e.g. a right-click "open in new tab") and the `router.push` used for actual client-side navigation. */
function buildHrefString(href: { pathname: string; query: Record<string, string | number> }, locale: AppLocale): string {
  return getPathname({ href, locale });
}

type Router = ReturnType<typeof useRouter>;

/** Intercepts a plain `<a>` click to go through next-intl's locale-aware client router instead of a full navigation — the `href` stays a real one (crawlable, works without JS) for every nav link in this component. */
function navigateOnClick(event: MouseEvent<HTMLAnchorElement>, router: Router, href: { pathname: string; query: Record<string, string | number> }): void {
  event.preventDefault();
  router.push(href);
}
