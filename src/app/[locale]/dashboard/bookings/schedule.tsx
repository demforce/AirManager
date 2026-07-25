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
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { getPathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { CalendarPopover } from '@/components/ui/calendar-popover';
import { Icon } from '@/components/ui/icons';
// Story 12.12 AC 1: the projection ITSELF (`projectDayBlocks`/`projectWeekChips`)
// moved to `@/lib/booking-schedule`, shared with the Overview's embedded day
// timeline — these output types moved with it, imported (and re-exported
// below) so no consumer of THIS module needs to change its own import.
import type { CalendarDayBlock, CalendarWeekChip } from '@/lib/booking-schedule';
import { parseDateOnlyUtc } from '@/lib/date-only';
import type { InstructorOption } from './new-booking-form';

export type { CalendarDayBlock, CalendarWeekChip } from '@/lib/booking-schedule';

export type BookingCalendarView = 'day' | 'week';

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

type FixedPopoverAnchor = { top: number; maxHeight: number; triggerRect: DOMRect };

/**
 * Shared "fixed, viewport-anchored popover" mechanism (review F1, story
 * 13.7): the CALENDAR popover turned out to share the exact clipping bug
 * the FILTER popover was fixed for in AC1 (`.card{overflow:hidden}`,
 * `airops.css:402`, ritaglia qualunque discendente `position:absolute` che
 * eccede il box della card) — same fix, same mechanism, extracted here
 * instead of duplicated per popover (two popovers, one mechanism). Vertical
 * anchor + open/close mechanics are shared; horizontal placement differs
 * (filter: right-aligned under its trigger; calendar: centered, via
 * `.cal-popover`'s own CSS `transform:translateX(-50%)`) and stays at each
 * call site.
 *
 * - `toggle(onOpen?)`: mirrors `toggleCalendarPopover`'s original
 *   "read-the-pre-toggle-value, then toggle" shape — measures the
 *   trigger's VIEWPORT position (`getBoundingClientRect`) before flipping
 *   `open`, since a `position:fixed` popover has no CSS equivalent of the
 *   old `top: calc(100% + 6px)` (relative-to-parent) rule. `maxHeight` caps
 *   the popover to whatever vertical room is left below the trigger in the
 *   viewport (18px bottom margin, found via a real e2e run against a fleet
 *   large enough to wrap the aircraft/instructor badges past one
 *   screenful): a `position:fixed` element does not scroll WITH the page,
 *   so an uncapped popover taller than the viewport would leave its footer
 *   permanently unreachable. `onOpen` runs only when the popover is about
 *   to OPEN (never on close), for a caller's own pre-open side effect
 *   (calendar: snapping the month cursor to the selected date).
 * - the scroll/resize effect below closes the popover so a `position:fixed`
 *   element (which no longer scrolls WITH the page like the old `absolute`
 *   one did) doesn't visually detach from its trigger. Capture phase so a
 *   scroll inside `.schedule`'s own horizontal scrollbar (a nested
 *   container, not the window) is caught too — EXCEPT the popover's own
 *   internal `overflow-y:auto` scroll (the `maxHeight` fix above): that
 *   scroll also fires a capture-phase 'scroll' event on `window` (found via
 *   a real e2e run — Playwright's own `scrollIntoView` to reach an
 *   off-screen footer button scrolled the popover, which this listener
 *   would otherwise close before the click could land), so a scroll whose
 *   target is inside the popover itself must NOT close it — `popoverRef`
 *   (created by the CALLER, same convention as `triggerRef`, and attached
 *   to the popover's own root DOM node) is what that exemption reads.
 *   Deliberately NOT created/returned by this hook itself: the
 *   `react-hooks/refs` lint rule flags ANY property read on an object
 *   returned by a custom hook once that object also carries a ref field,
 *   even a plain, non-`.current` read like `anchor.top` below — keeping
 *   both refs caller-owned params avoids that false positive without
 *   losing the "one mechanism" extraction. NOTE for future e2e authors
 *   (F6): a click on the TRIGGER that itself causes the page to
 *   scroll-into-view (e.g. Playwright's own actionability check on an
 *   off-screen trigger) opens and immediately closes the popover in the
 *   same instant — harmless for a real user (who scrolls to see the
 *   trigger BEFORE clicking it), but a trap for automation that clicks a
 *   trigger while the page is scrolled.
 */
function useFixedPopover(triggerRef: RefObject<HTMLElement | null>, popoverRef: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<FixedPopoverAnchor | null>(null);

  function toggle(onOpen?: () => void) {
    if (!open && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const top = triggerRect.bottom + 6;
      setAnchor({ top, maxHeight: window.innerHeight - top - 18, triggerRect });
      onOpen?.();
    }
    setOpen((wasOpen) => !wasOpen);
  }

  useEffect(() => {
    if (!open) return;
    function close(event: Event) {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, popoverRef]);

  return { open, setOpen, anchor, toggle };
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
  const [calCursor, setCalCursor] = useState(() => dateOnlyToLocalDate(date));
  const [filterAircraftId, setFilterAircraftId] = useState('all');
  const [filterInstructorId, setFilterInstructorId] = useState('all');
  // AC 1 fix (+ review F1: the SAME fix extended to the calendar popover,
  // its twin — see `useFixedPopover` above): both popovers are
  // `position: fixed` (viewport-anchored, coordinates computed from their
  // trigger button) rather than the shared `.popover`/`.cal-popover`
  // classes' default `position: absolute` — `.card` clips an
  // absolutely-positioned descendant that overflows its own box
  // (`overflow: hidden`, `airops.css:402`, needed elsewhere for the
  // timeline/week-grid's rounded corners), same reason `SlideOver` already
  // uses `position: fixed` to escape the SAME card boundary.
  const calTriggerRef = useRef<HTMLButtonElement>(null);
  const calPopoverRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const calPopover = useFixedPopover(calTriggerRef, calPopoverRef);
  const filterPopover = useFixedPopover(filterTriggerRef, filterPopoverRef);

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
   * selected date (prototype's own behavior) — the `onOpen` callback below
   * runs only on a real open (never on close), same "act only when about to
   * open" shape the original inline check had.
   */
  function toggleCalendarPopover() {
    filterPopover.setOpen(false);
    calPopover.toggle(() => {
      const selected = dateOnlyToLocalDate(date);
      setCalCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
    });
  }

  function toggleFilterPopover() {
    calPopover.setOpen(false);
    filterPopover.toggle();
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
          <button
            ref={calTriggerRef}
            type="button"
            className="btn date-pick-btn"
            onClick={toggleCalendarPopover}
            title={formatDayFull(date, locale)}
            data-testid="schedule-date-pick"
          >
            <Icon.calendar />
            <span>{view === 'week' ? `${formatDayMonth(weekDates[0]!.dateOnly, locale)}–${formatDayMonth(weekDates[6]!.dateOnly, locale)}` : formatDayShort(date, locale)}</span>
          </button>
          <a href={buildHrefString(nav.nextHref, locale)} onClick={(e) => navigateOnClick(e, router, nav.nextHref)} aria-label={labels.next} data-testid="calendar-next" className="iconbtn">
            <Icon.chevR />
          </a>
          {calPopover.open && calPopover.anchor && (
            <>
              <div className="popover-scrim" onClick={() => calPopover.setOpen(false)} />
              <CalendarPopover
                ref={calPopoverRef}
                style={{
                  position: 'fixed',
                  top: calPopover.anchor.top,
                  // Centered under the trigger button — same visual anchor
                  // `.cal-popover`'s own CSS (`left:50%; transform:
                  // translateX(-50%)`) gave it relative to its old
                  // `position:relative` parent; the `transform` half of
                  // that rule is left untouched (still applies from the
                  // CSS class), only `left` is overridden here to the
                  // trigger's own viewport-space center.
                  left: calPopover.anchor.triggerRect.left + calPopover.anchor.triggerRect.width / 2,
                  maxHeight: calPopover.anchor.maxHeight,
                  overflowY: 'auto',
                }}
                cursor={calCursor}
                onCursorChange={setCalCursor}
                selected={dateOnlyToLocalDate(date)}
                today={dateOnlyToLocalDate(today)}
                onPick={(picked) => {
                  navigateToDate(localDateToDateOnly(picked));
                  calPopover.setOpen(false);
                }}
                onToday={() => {
                  navigateToDate(today);
                  calPopover.setOpen(false);
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
            ref={filterTriggerRef}
            type="button"
            className={`btn ${filterCount ? 'primary' : ''}`}
            onClick={toggleFilterPopover}
            data-testid="schedule-filter-toggle"
          >
            <Icon.filter /> {labels.filters}
            {filterCount ? ` · ${filterCount}` : ''}
          </button>
          {filterPopover.open && filterPopover.anchor && (
            <>
              <div className="popover-scrim" onClick={() => filterPopover.setOpen(false)} />
              <div
                ref={filterPopoverRef}
                className="popover"
                style={{
                  position: 'fixed',
                  top: filterPopover.anchor.top,
                  right: window.innerWidth - filterPopover.anchor.triggerRect.right,
                  // Review F3: `position: fixed`'s containing block is the
                  // VIEWPORT, not the old `position: relative` wrapper — the
                  // shrink-to-fit width this popover relied on (collapsing
                  // onto `.popover`'s `min-width: 320px`, `airops.css:1155`)
                  // now grows with the fleet/instructor list instead
                  // (measured: up to viewport-width with a large fleet).
                  // Pinning the width back to the design system's 320px
                  // restores the original geometry regardless of list size.
                  width: 320,
                  maxHeight: filterPopover.anchor.maxHeight,
                  overflowY: 'auto',
                }}
              >
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
                  <button type="button" className="btn primary" onClick={() => filterPopover.setOpen(false)} data-testid="schedule-filter-done">
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
