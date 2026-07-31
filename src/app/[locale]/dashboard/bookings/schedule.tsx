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
import { Fragment, useCallback, useRef, useState, type MouseEvent } from 'react';
import { getPathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { CAL_POPOVER_HEIGHT_DATE_ONLY, CalendarPopover } from '@/components/ui/calendar-popover';
import { anchorPositionStyle, CAL_POPOVER_WIDTH, clampPopoverLeft, useFixedPopover } from '@/components/ui/fixed-popover';
import { Icon } from '@/components/ui/icons';
import type { DayPhase } from '@/lib/booking-day-phase';
import { nowMarkerIndex } from '@/lib/mobile-agenda';
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

/**
 * One row of the phone agenda (story 15.4) — the day view a phone gets
 * instead of the desktop timeline. Ordered and phase-tagged server-side by
 * `@/lib/mobile-agenda` (AD-5); everything that needs a clock or a timezone
 * (`HH:MM`, `startsAfterNow`) is already resolved, so this component only
 * filters and renders.
 */
export type ScheduleAgendaRow = {
  /** `aog-<aircraftId>` on an out-of-service row, the booking id otherwise. */
  id: string;
  kind: 'aog' | 'booking';
  aircraftId: string;
  registration: string;
  /** Europe/Rome wall clock; both empty on an AOG row (an out-of-service aircraft has no slot). */
  timeStart: string;
  timeEnd: string;
  /** `null` on a masked row (story 14.5 R3) — rendered as `labels.occupied`, same as the desktop blocks. */
  personName: string | null;
  instructorProfileId: string | null;
  instructorName: string | null;
  notes: string | null;
  /** AOG rows only: why the aircraft is grounded. */
  statusReason: string | null;
  /** `null` on an AOG row (no slot, no phase). */
  phase: DayPhase | null;
  startsAfterNow: boolean;
};

export type CalendarNav = {
  prevHref: { pathname: string; query: Record<string, string | number> };
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
  /** Story 14.5 (ratifica R3): shown instead of `block.personName` when it's `null` (masked, non-own booking, actor lacks `bookings.read.names`). */
  occupied: string;
  /** Raw (`t.raw`) `"{count} …"` template — client-interpolated (see `weekBookingsLabel` below), same pattern as `new-booking-form.tsx`'s `outOfServiceSuffix`/`EXPIRED_DOCUMENTS`: the per-day count changes with the client-only aircraft/instructor filter, so it cannot be pre-formatted server-side. */
  weekBookingsCountTemplate: string;
  /** Story 15.4 — labels of the phone surfaces only (agenda, chips, week list, detail sheet). */
  mobile: {
    /** `t.raw` `"{count} movimenti"`: the count is what the CLIENT filter leaves on screen, so it cannot be pre-formatted. */
    agendaCountTemplate: string;
    /** `t.raw` `"ORA · {time}"` (template line 139). */
    nowTemplate: string;
    /** `t.raw` `"{registration} fuori servizio"`. */
    aogTitleTemplate: string;
    /** Verb of a row's accessible name ("Apri dettaglio"), never rendered as text. */
    openDetail: string;
    close: string;
    /** Mono chip on today's row in the week list. */
    today: string;
    time: string;
    pilot: string;
    instructor: string;
    aircraft: string;
    notes: string;
    /** AOG detail row: why the aircraft is grounded. */
    reason: string;
    phase: Record<DayPhase, string>;
  };
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
  /**
   * The "now" marker's wall clock (`HH:MM`), `null` when the shown day is not
   * today. Feeds BOTH the phone agenda's "ORA · HH:MM" separator and the
   * desktop `.now-line`'s `data-time` — the attribute `airops.css:567` prints
   * with `content: attr(data-time)` and that nobody has ever written (ratifica
   * R-15.4-b: the pill has been an empty 12px rectangle since story 12.3).
   */
  nowTime: string | null;
  /** Day view only — the phone agenda's rows, already ordered and phase-tagged (`@/lib/mobile-agenda`). Empty in week view, and on the Overview's embedded timeline (which has no phone face of its own). */
  agendaRows: ScheduleAgendaRow[];
  locale: 'it' | 'en';
  nav: CalendarNav;
  /** The list section's current `?page` — preserved by every date the calendar popover navigates to (lesson 6.4 M1, same crosstalk contract as the legacy calendar). */
  listPage: number;
  /** The list section's current `?status` (story 15.4, R-15.4-e), preserved by the same client-built hrefs as `listPage`. `null`/absent = no filter. */
  listStatus?: string | null;
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

/** `.popover`'s explicit `width` (review F3, story 13.7) — pinned here so the clamp math below (story 13.10) and the inline style share one source instead of a literal drifting out of sync. `CAL_POPOVER_WIDTH`, `clampPopoverLeft` and `useFixedPopover` used to be duplicated verbatim here; they now come from `@/components/ui/fixed-popover` (story TD-7 review F6, PO decision 2026-07-26: dedup, so this file also inherits the F1 flip/clamp fix instead of the two copies silently diverging). */
const FILTER_POPOVER_WIDTH = 320;
/** Rough estimate of the filter popover's own rendered height (two `.pop-row` segmented-button groups) — same "decide whether to flip, never a hard cap" role as `CAL_POPOVER_HEIGHT_DATE_ONLY` (`calendar-popover.tsx`); both of this file's triggers sit near the TOP of the card, so `useFixedPopover#toggle` never actually needs to flip either popover in practice. */
const FILTER_POPOVER_HEIGHT = 320;

/** Small client-only duplicate of `page.tsx#calendarHref`'s day-view case — see module doc-comment. */
function buildDateHref(dateOnly: string, view: BookingCalendarView, listPage: number, today: string, listStatus: string | null): string {
  const params = new URLSearchParams();
  if (view !== 'day') params.set('view', view);
  if (dateOnly !== today) params.set('date', dateOnly);
  if (listPage > 1) params.set('page', String(listPage));
  if (listStatus) params.set('status', listStatus);
  const qs = params.toString();
  return `/dashboard/bookings${qs ? `?${qs}` : ''}`;
}

/** Phase -> `Badge` tone, the SAME mapping the Overview's mobile lists use (`dashboard/page.tsx`): the two surfaces must not disagree on the same booking. */
const PHASE_TONE: Record<DayPhase, BadgeTone> = { inProgress: 'warn', completed: 'ok', scheduled: 'info' };

/** Phase -> left edge of the row (template's `edgeMap`, lines 630-634). `--accent` and `--warn` hold the same value in both themes, so the edge and the `warn` badge above read as one signal. */
const PHASE_EDGE_CLASS: Record<DayPhase, string> = {
  inProgress: 'mobile-row-edge-accent',
  completed: 'mobile-row-edge-ok',
  scheduled: 'mobile-row-edge-info',
};

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
  nowTime,
  agendaRows,
  locale,
  nav,
  listPage,
  listStatus = null,
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
    router.push(buildDateHref(dateOnly, view, listPage, today, listStatus));
  }

  // --- phone agenda (story 15.4) -----------------------------------------
  // The SAME `filterAircraftId`/`filterInstructorId` the popover drives
  // (ratifica R-15.4-c: the tail chips are a second AFFORDANCE, never a second
  // source of truth), applied to the server-ordered rows. An AOG row has no
  // instructor, so the instructor filter leaves it alone — exactly like the
  // desktop, where an out-of-service aircraft keeps its row whatever the
  // instructor filter says.
  const visibleAgendaRows = agendaRows.filter(
    (row) =>
      (filterAircraftId === 'all' || row.aircraftId === filterAircraftId) && (row.kind === 'aog' || matchesInstructorFilter(row.instructorProfileId)),
  );
  const agendaMovementCount = visibleAgendaRows.filter((row) => row.kind === 'booking').length;
  // Recomputed on the FILTERED rows, never precomputed server-side: filtering
  // the morning away moves the marker (unit-tested, `mobile-agenda.test.ts`).
  const markerIndex = nowTime === null ? -1 : nowMarkerIndex(visibleAgendaRows);
  const [openAgendaId, setOpenAgendaId] = useState<string | null>(null);
  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeAgendaSheet = useCallback((): void => setOpenAgendaId(null), []);
  const openAgendaRow = visibleAgendaRows.find((row) => row.id === openAgendaId) ?? null;

  function agendaTitle(row: ScheduleAgendaRow): string {
    return row.kind === 'aog' ? labels.mobile.aogTitleTemplate.replace('{registration}', row.registration) : (row.personName ?? labels.occupied);
  }

  /**
   * The template's own agenda sub (line 145): the registration leads, then
   * whoever else is on board. It is NOT the `.mobile-row-tail` chip the 15.3
   * lists use, and that is deliberate — measured at 375px with the chip in the
   * title row, the pilot's name was cut to a single letter ("P…"), because the
   * title has to share 1fr with the chip AND the badge once the 46px time
   * column is there. The template puts the tail in the sub for exactly the
   * rows that carry times.
   */
  function agendaSub(row: ScheduleAgendaRow): string {
    if (row.kind === 'aog') return row.statusReason ?? labels.outOfService;
    const trailing = row.instructorName ?? row.notes;
    return trailing ? `${row.registration} · ${trailing}` : row.registration;
  }

  function agendaDetailRows(row: ScheduleAgendaRow): BottomSheetRow[] {
    if (row.kind === 'aog') {
      return [
        { k: labels.mobile.aircraft, v: row.registration },
        { k: labels.mobile.reason, v: row.statusReason ?? labels.outOfService },
      ];
    }
    return [
      { k: labels.mobile.time, v: `${row.timeStart}–${row.timeEnd}` },
      { k: labels.mobile.pilot, v: row.personName ?? labels.occupied },
      { k: labels.mobile.instructor, v: row.instructorName ?? '—' },
      { k: labels.mobile.aircraft, v: row.registration },
      { k: labels.mobile.notes, v: row.notes ?? '—' },
    ];
  }

  /**
   * Opening the popover snaps its cursor to the month of the currently
   * selected date (prototype's own behavior) — the `onOpen` callback below
   * runs only on a real open (never on close), same "act only when about to
   * open" shape the original inline check had.
   */
  function toggleCalendarPopover() {
    filterPopover.setOpen(false);
    calPopover.toggle(CAL_POPOVER_HEIGHT_DATE_ONLY, () => {
      const selected = dateOnlyToLocalDate(date);
      setCalCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
    });
  }

  function toggleFilterPopover() {
    calPopover.setOpen(false);
    filterPopover.toggle(FILTER_POPOVER_HEIGHT);
  }

  return (
    <>
    <div className="card" data-testid="schedule-section">
      <div className="card-head">
        <div className="card-title">{isToday ? labels.cardTitleToday : labels.cardTitle}</div>
        <span className="card-sub" data-testid="calendar-heading">
          {view === 'day' ? formatDayShort(date, locale) : `${formatDayMonth(weekDates[0]!.dateOnly, locale)} – ${formatDayMonth(weekDates[6]!.dateOnly, locale)}`}
        </span>
        {/* The template's own testata sub ("MAR 21 APR · N movimenti in
            programma", line 129), split in two nodes rather than appended to
            `calendar-heading`: that heading's text is asserted by the desktop
            suite and this count only exists on the phone, where it states what
            the CLIENT filter actually left on screen (AC 1). */}
        {view === 'day' ? (
          <span className="card-sub mobile-agenda-count" data-testid="mobile-agenda-count">
            {labels.mobile.agendaCountTemplate.replace('{count}', String(agendaMovementCount))}
          </span>
        ) : null}
        <div className="spacer" />

        <div className="date-nav" style={{ position: 'relative' }}>
          <a href={buildHrefString(nav.prevHref, locale)} onClick={(e) => navigateOnClick(e, router, nav.prevHref)} aria-label={labels.prev} data-testid="calendar-prev" className="iconbtn">
            <Icon.chevL />
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
                  ...anchorPositionStyle(calPopover.anchor),
                  // Centered under the trigger button, clamped to the
                  // viewport (story 13.10, F4-13.7 twin) — the un-clamped
                  // version relied on `.cal-popover`'s own CSS (`left:50%;
                  // transform:translateX(-50%)`) for centering; `left` is
                  // now the popover's own LEFT edge (desired center minus
                  // half its width), clamped by `clampPopoverLeft`, and
                  // `transform` is cleared so the CSS class's centering
                  // transform (still active otherwise) doesn't double-offset it.
                  left: clampPopoverLeft(
                    calPopover.anchor.triggerRect.left + calPopover.anchor.triggerRect.width / 2 - CAL_POPOVER_WIDTH / 2,
                    CAL_POPOVER_WIDTH,
                  ),
                  transform: 'none',
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
                  ...anchorPositionStyle(filterPopover.anchor),
                  // Story 13.10 (F4-13.7): clamped LEFT instead of the old
                  // `right: viewportWidth - triggerRect.right` — at 375px a
                  // trigger sitting left of the popover's fixed width pushed
                  // the popover's own left edge 139px past the viewport's
                  // left edge (measured pre-fix). `right: 'auto'` disables
                  // the CSS class's own `right: 0` so it can't compete with
                  // the explicit `left`+`width` below (over-constrained
                  // otherwise).
                  left: clampPopoverLeft(filterPopover.anchor.triggerRect.right - FILTER_POPOVER_WIDTH, FILTER_POPOVER_WIDTH),
                  right: 'auto',
                  // Review F3: `position: fixed`'s containing block is the
                  // VIEWPORT, not the old `position: relative` wrapper — the
                  // shrink-to-fit width this popover relied on (collapsing
                  // onto `.popover`'s `min-width: 320px`, `airops.css:1155`)
                  // now grows with the fleet/instructor list instead
                  // (measured: up to viewport-width with a large fleet).
                  // Pinning the width back to the design system's 320px
                  // restores the original geometry regardless of list size.
                  width: FILTER_POPOVER_WIDTH,
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
                {/* Review F1 (story 14.5): `instructors` arrives EMPTY for an
                    actor without `bookings.read.names` (`page.tsx` gates the
                    fetch) — rendering this group off of that, rather than
                    unconditionally, means a masked actor never sees an
                    instructor roster (a filter that would match against
                    masked blocks' now-nulled `instructorProfileId` and so
                    "filter" nothing anyway) — no anagrafica reaches the DOM. */}
                {instructors.length > 0 ? (
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
                ) : null}
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
        <p className="schedule-desktop-body" style={{ marginTop: 16, fontSize: 14, lineHeight: '20px', padding: '0 18px 18px' }}>
          {labels.noAircraft}
        </p>
      ) : view === 'day' ? (
        <div className="schedule schedule-desktop-body">
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
                  {/* `data-time` (ratifica R-15.4-b): `.now-line::before` has
                      printed `content: attr(data-time)` since story 12.3
                      against an attribute nobody wrote — measured at 375px AND
                      1280px, an empty 12px `--accent` rectangle. One attribute
                      turns it into the "10:52" the CSS always meant to show. */}
                  {isToday && nowLinePercent !== null ? (
                    <div className="now-line" data-time={nowTime ?? undefined} style={{ left: `${nowLinePercent}%` }} />
                  ) : null}
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
                            {block.personName ?? labels.occupied}
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
            <p style={{ marginTop: 16, fontSize: 14, lineHeight: '20px', padding: '0 18px' }}>
              {labels.dayEmpty}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="week-grid schedule-desktop-body">
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

      {/* --- the phone face of this card (story 15.4, R2/R4) ---------------
          The card, its head and its two popovers are ONE node at every width
          (AD-2): only the BODY is swapped, so the eight navigation testids and
          the popover-clamp guard of story 13.10 stay exactly where they are.
          Day view becomes the agenda of the template (lines 136-152), week
          view the vertical list of seven days ratified in R-15.4-a — neither
          is a 1000px grid inside a horizontal scroller. */}
      <div className="schedule-mobile">
        {aircraft.length > 0 ? (
          <div className="mobile-chip-strip" data-testid="mobile-tail-chips">
            <button
              type="button"
              className={`btn ${filterAircraftId === 'all' ? 'primary' : ''}`}
              onClick={() => setFilterAircraftId('all')}
              aria-pressed={filterAircraftId === 'all'}
              data-testid="mobile-tail-chip-all"
            >
              {labels.filtersAll}
            </button>
            {aircraft.map((ac) => (
              <button
                key={ac.id}
                type="button"
                className={`btn ${filterAircraftId === ac.id ? 'primary' : ''}`}
                onClick={() => setFilterAircraftId(ac.id)}
                aria-pressed={filterAircraftId === ac.id}
                data-testid={`mobile-tail-chip-${ac.id}`}
              >
                {ac.registration}
              </button>
            ))}
          </div>
        ) : null}

        {view === 'day' ? (
          <div data-testid="mobile-agenda">
            {visibleAgendaRows.length === 0 ? (
              <p className="mobile-card-empty" data-testid="mobile-agenda-empty">
                {aircraft.length === 0 ? labels.noAircraft : labels.dayEmpty}
              </p>
            ) : (
              visibleAgendaRows.map((row, index) => (
                <Fragment key={row.id}>
                  {index === markerIndex ? (
                    // A separator, not a command: never a button, never in the
                    // tab order (AD-4). It exists only on the day that IS
                    // today AND only when a movement is still ahead.
                    <div className="mobile-agenda-now" data-testid="mobile-agenda-now">
                      <span className="mobile-agenda-now-dot" aria-hidden="true" />
                      <span className="mobile-agenda-now-label">{labels.mobile.nowTemplate.replace('{time}', nowTime ?? '')}</span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`mobile-row mobile-row-timed ${row.phase ? PHASE_EDGE_CLASS[row.phase] : 'mobile-row-edge-bad'}`}
                    aria-label={`${labels.mobile.openDetail}: ${agendaTitle(row)}`}
                    onClick={() => setOpenAgendaId(row.id)}
                    data-testid="mobile-agenda-row"
                  >
                    <span className="mobile-row-times">
                      <span className="mobile-row-t1">{row.kind === 'aog' ? '—' : row.timeStart}</span>
                      <span className="mobile-row-t2">{row.timeEnd}</span>
                    </span>
                    <span className="mobile-row-main">
                      <span className="mobile-row-title">
                        <span className="mobile-row-name">{agendaTitle(row)}</span>
                      </span>
                      <span className="mobile-row-sub">{agendaSub(row)}</span>
                    </span>
                    {row.phase ? (
                      <Badge tone={PHASE_TONE[row.phase]} dot>
                        {labels.mobile.phase[row.phase]}
                      </Badge>
                    ) : (
                      <Badge tone="bad" dot>
                        {labels.aog}
                      </Badge>
                    )}
                  </button>
                </Fragment>
              ))
            )}
          </div>
        ) : (
          <div data-testid="mobile-week">
            {weekDates.map(({ dateOnly }) => {
              // NOT `weekDates[].href`: that one keeps `view=week` (the desktop
              // grid's own behaviour — a cell there MOVES the anchor inside the
              // week and highlights it). On the phone the week IS the list, so
              // a row that stayed in the week view would go nowhere; ratifica
              // R-15.4-a says "tocco -> vista giorno". `buildDateHref` with
              // `'day'` is the same helper the calendar popover uses, so `?page`
              // and `?status` ride along exactly as they do there.
              const href = buildDateHref(dateOnly, 'day', listPage, today, listStatus);
              // The SAME count the desktop cell shows, filtered the same way
              // (ratifica R-15.4-a: "nessun dato nuovo dal server").
              const count = weekChips.filter(
                (chip) =>
                  chip.dateOnly === dateOnly &&
                  (filterAircraftId === 'all' || chip.aircraftId === filterAircraftId) &&
                  matchesInstructorFilter(chip.instructorProfileId),
              ).length;
              return (
                <a
                  key={dateOnly}
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    router.push(href);
                  }}
                  className="mobile-row"
                  data-testid="mobile-week-day"
                >
                  <span className="mobile-row-main">
                    <span className="mobile-row-title">
                      {dateOnly === today ? <span className="mobile-row-tail">{labels.mobile.today}</span> : null}
                      <span className="mobile-row-name">{formatDayShort(dateOnly, locale)}</span>
                    </span>
                    <span className="mobile-row-sub" data-testid="mobile-week-day-count">
                      {labels.weekBookingsCountTemplate.replace('{count}', String(count))}
                    </span>
                  </span>
                  <span className="mobile-row-chev" aria-hidden="true">
                    <Icon.chevR />
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* Read-only by construction (ratifica R-15.4-i): the agenda shows what is
        APPROVED, the list below is where decisions are taken. Rendered
        conditionally so `mobile-booking-sheet` is ONE node in the DOM even
        though this page has two sheet owners (AD-7). */}
    {openAgendaRow ? (
      <BottomSheet
        open
        onClose={closeAgendaSheet}
        testId="mobile-booking-sheet"
        sub={openAgendaRow.kind === 'aog' ? labels.aog : `${openAgendaRow.registration} · ${openAgendaRow.timeStart}–${openAgendaRow.timeEnd}`}
        title={agendaTitle(openAgendaRow)}
        badge={
          openAgendaRow.phase ? (
            <Badge tone={PHASE_TONE[openAgendaRow.phase]} dot>
              {labels.mobile.phase[openAgendaRow.phase]}
            </Badge>
          ) : (
            <Badge tone="bad" dot>
              {labels.aog}
            </Badge>
          )
        }
        rows={agendaDetailRows(openAgendaRow)}
        closeLabel={labels.mobile.close}
      />
    ) : null}
    </>
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
