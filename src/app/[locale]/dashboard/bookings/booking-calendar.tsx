import { parseDateOnlyUtc } from '@/lib/date-only';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { AircraftOption } from './new-booking-form';

/**
 * Aircraft bookings calendar (epic 7, story 7.2; FR-19) — a pure server
 * component: every piece of state (`view`/`date`) lives in the URL, every
 * interaction is a `Link` (prev/today/next, day/week toggle), so nothing
 * here needs `'use client'` (Contesto: "la navigazione è tutta Link").
 * `page.tsx` does ALL the timezone/positioning math server-side
 * (`zoned-time.ts`'s `zonedWallTime`/`zonedMidnightUtc`) and hands this
 * component already-projected blocks/chips (`{top%, height%, label}` —
 * Dev Notes) — this component only lays them out, it never touches a
 * `Date` or a timezone.
 */

export type BookingCalendarView = 'day' | 'week';

/** A day-view block, already positioned (Dev Notes: "il client riceve blocchi già proiettati"). `top`/`height` are percentages of the 06:00-22:00 window. */
export type CalendarDayBlock = {
  id: string;
  aircraftId: string;
  top: number;
  height: number;
  /** The booking starts before 06:00 (or before this day entirely) — clamped to the top edge, shown with a "continues earlier" indicator (Contesto: "MAI nascosti"). */
  clampedTop: boolean;
  /** The booking ends after 22:00 (or after this day entirely) — clamped to the bottom edge, same rationale. */
  clampedBottom: boolean;
  /** The REAL (never clamped) `HH:MM–HH:MM` wall-clock start/end, already Europe/Rome. */
  timeLabel: string;
  personName: string;
  instructorName: string | null;
};

/** A week-view chip — no positioning, just a compact `HH:MM–HH:MM Nome` entry in its (day, aircraft) cell. */
export type CalendarWeekChip = {
  id: string;
  aircraftId: string;
  dateOnly: string;
  timeLabel: string;
  clampedStart: boolean;
  clampedEnd: boolean;
  personName: string;
  instructorName: string | null;
};

export type CalendarNav = {
  prevHref: { pathname: string; query: Record<string, string | number> };
  todayHref: { pathname: string; query: Record<string, string | number> };
  nextHref: { pathname: string; query: Record<string, string | number> };
  dayViewHref: { pathname: string; query: Record<string, string | number> };
  weekViewHref: { pathname: string; query: Record<string, string | number> };
};

export type BookingCalendarLabels = {
  prev: string;
  today: string;
  next: string;
  dayView: string;
  weekView: string;
  viewToggleLabel: string;
  outOfService: string;
  dayEmpty: string;
  weekEmpty: string;
  noAircraft: string;
  clampedStartHint: string;
  clampedEndHint: string;
  weekdayColumnLabel: string;
};

type BookingCalendarProps = {
  view: BookingCalendarView;
  /** Day view: the exact day shown. Week view: any day inside the shown week (kept for the heading range and as the toggle's carry-over anchor). */
  date: string;
  /** The 7 dates (Monday..Sunday) of the shown week — only read when `view === 'week'`. */
  weekDates: string[];
  aircraft: AircraftOption[];
  dayBlocks: CalendarDayBlock[];
  weekChips: CalendarWeekChip[];
  locale: 'it' | 'en';
  nav: CalendarNav;
  labels: BookingCalendarLabels;
};

/** The day grid's fixed pixel height for the 06:00-22:00 (16h) window — chosen so each hour is a clean 48px row, comfortably tappable on mobile. */
const DAY_GRID_HEIGHT_PX = 768;
const WINDOW_START_HOUR = 6;
const WINDOW_END_HOUR = 22;
const HOURS: readonly number[] = Array.from({ length: WINDOW_END_HOUR - WINDOW_START_HOUR + 1 }, (_, i) => WINDOW_START_HOUR + i);

function hourTopPercent(hour: number): number {
  return ((hour - WINDOW_START_HOUR) / (WINDOW_END_HOUR - WINDOW_START_HOUR)) * 100;
}

function intlLocale(locale: 'it' | 'en'): string {
  return locale === 'it' ? 'it-IT' : 'en-IE';
}

/** Full localized day heading, e.g. "lunedì 6 luglio 2026" — `date-only.ts#parseDateOnlyUtc` + `timeZone: 'UTC'` is reused deliberately: it already turns a `YYYY-MM-DD` string into the exact UTC-midnight `Date` `Intl` needs to print the CALENDAR date (already resolved server-side, story 7.2 Task 1) without any further zone conversion here. */
function formatDayHeading(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    parseDateOnlyUtc(dateOnly),
  );
}

/** Short weekday + day/month for the week grid's row labels and the week heading's range, e.g. "lun 06/07". */
function formatWeekdayShort(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(
    parseDateOnlyUtc(dateOnly),
  );
}

function formatDayMonth(dateOnly: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(parseDateOnlyUtc(dateOnly));
}

const NAV_LINK_CLASSES =
  'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border border-[#EAEAEA] bg-white px-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]';

function viewToggleClasses(active: boolean): string {
  return `flex min-h-[44px] items-center justify-center rounded-[6px] px-4 text-sm font-medium transition-colors ${
    active ? 'bg-[#111111] text-white' : 'text-[#2F3437] hover:bg-[#F7F6F3]'
  }`;
}

/** Truncated to one line (`title` carries the full reason) — the day view's header sits in a FIXED-height row (it must align exactly with the hours gutter's own fixed height), so an arbitrarily long `statusReason` must never be allowed to wrap and overflow it. */
function OutOfServiceBadge({ reason, label }: { reason: string | null; label: string }) {
  const text = reason ? `${label}: ${reason}` : label;
  return (
    <span
      title={text}
      className="mt-1 inline-block max-w-full truncate rounded-full bg-[#FBF3DB] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-[#956400]"
    >
      {text}
    </span>
  );
}

export function BookingCalendar({ view, date, weekDates, aircraft, dayBlocks, weekChips, locale, nav, labels }: BookingCalendarProps) {
  const heading =
    view === 'day'
      ? formatDayHeading(date, locale)
      : weekDates.length > 0
        ? `${formatDayMonth(weekDates[0]!, locale)} – ${formatDayMonth(weekDates[weekDates.length - 1]!, locale)}`
        : '';

  return (
    <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="bookings-calendar-section">
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="calendar-toolbar">
        <div className="flex items-center gap-2">
          <Link href={nav.prevHref} locale={locale as AppLocale} aria-label={labels.prev} data-testid="calendar-prev" className={NAV_LINK_CLASSES}>
            &larr;
          </Link>
          <Link href={nav.todayHref} locale={locale as AppLocale} data-testid="calendar-today" className={NAV_LINK_CLASSES}>
            {labels.today}
          </Link>
          <Link href={nav.nextHref} locale={locale as AppLocale} aria-label={labels.next} data-testid="calendar-next" className={NAV_LINK_CLASSES}>
            &rarr;
          </Link>
        </div>

        <h3 className="text-center text-sm font-medium text-[#111111] capitalize" data-testid="calendar-heading">
          {heading}
        </h3>

        <div role="group" aria-label={labels.viewToggleLabel} className="flex items-center gap-1 rounded-[8px] border border-[#EAEAEA] p-1">
          <Link
            href={nav.dayViewHref}
            locale={locale as AppLocale}
            aria-current={view === 'day' ? 'true' : undefined}
            data-testid="calendar-view-day"
            className={viewToggleClasses(view === 'day')}
          >
            {labels.dayView}
          </Link>
          <Link
            href={nav.weekViewHref}
            locale={locale as AppLocale}
            aria-current={view === 'week' ? 'true' : undefined}
            data-testid="calendar-view-week"
            className={viewToggleClasses(view === 'week')}
          >
            {labels.weekView}
          </Link>
        </div>
      </div>

      {aircraft.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[#787774]">{labels.noAircraft}</p>
      ) : view === 'day' ? (
        <div className="mt-6 overflow-x-auto rounded-[12px] border border-[#EAEAEA]">
          <div className="flex min-w-fit">
            {/* Hours gutter — sticky so it stays visible while scrolling the aircraft columns horizontally (mobile usability, AC 1). */}
            <div className="sticky left-0 z-10 w-12 shrink-0 border-r border-[#EAEAEA] bg-white">
              <div className="h-12 border-b border-[#EAEAEA]" />
              <div className="relative" style={{ height: `${DAY_GRID_HEIGHT_PX}px` }}>
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-[#787774]"
                    style={{ top: `${hourTopPercent(hour)}%` }}
                  >
                    {String(hour).padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>

            {aircraft.map((ac) => {
              const blocks = dayBlocks.filter((block) => block.aircraftId === ac.id);
              return (
                <div key={ac.id} className="w-[168px] shrink-0 border-r border-[#EAEAEA] last:border-r-0" data-testid="calendar-aircraft-column">
                  <div className="flex h-12 flex-col items-center justify-center overflow-hidden border-b border-[#EAEAEA] px-2 text-center">
                    <span className="text-sm font-medium text-[#111111]">{ac.registration}</span>
                    {ac.status === 'OUT_OF_SERVICE' ? <OutOfServiceBadge reason={ac.statusReason} label={labels.outOfService} /> : null}
                  </div>
                  <div className="relative" style={{ height: `${DAY_GRID_HEIGHT_PX}px` }}>
                    {HOURS.map((hour) => (
                      <div key={hour} className="absolute left-0 right-0 border-t border-[#F2F1EC]" style={{ top: `${hourTopPercent(hour)}%` }} />
                    ))}
                    {blocks.map((block) => (
                      <div
                        key={block.id}
                        data-testid="calendar-block"
                        className="absolute left-1 right-1 overflow-hidden rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] px-2 py-1 text-[11px] leading-tight text-[#2F3437]"
                        style={{ top: `${block.top}%`, height: `${block.height}%` }}
                      >
                        {block.clampedTop ? (
                          <span className="block text-[9px] text-[#787774]" aria-hidden="true">
                            &#9650; <span className="sr-only">{labels.clampedStartHint}</span>
                          </span>
                        ) : null}
                        <div className="font-medium">{block.timeLabel}</div>
                        <div className="truncate">{block.personName}</div>
                        {block.instructorName ? <div className="truncate text-[#787774]">{block.instructorName}</div> : null}
                        {block.clampedBottom ? (
                          <span className="block text-[9px] text-[#787774]" aria-hidden="true">
                            &#9660; <span className="sr-only">{labels.clampedEndHint}</span>
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[12px] border border-[#EAEAEA]">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm" data-testid="calendar-week-table">
            <thead>
              <tr className="border-b border-[#EAEAEA]">
                <th className="w-24 border-r border-[#EAEAEA] px-3 py-2 text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">
                  {labels.weekdayColumnLabel}
                </th>
                {aircraft.map((ac) => (
                  <th
                    key={ac.id}
                    className="min-w-[160px] border-r border-[#EAEAEA] px-3 py-2 text-sm font-medium text-[#111111] last:border-r-0"
                    data-testid="calendar-aircraft-column"
                  >
                    {ac.registration}
                    {ac.status === 'OUT_OF_SERVICE' ? <OutOfServiceBadge reason={ac.statusReason} label={labels.outOfService} /> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map((dateOnly) => (
                <tr key={dateOnly} className="border-b border-[#EAEAEA] last:border-b-0">
                  <td className="border-r border-[#EAEAEA] px-3 py-2 align-top text-xs font-medium whitespace-nowrap text-[#2F3437] capitalize">
                    {formatWeekdayShort(dateOnly, locale)}
                  </td>
                  {aircraft.map((ac) => {
                    const chips = weekChips.filter((chip) => chip.aircraftId === ac.id && chip.dateOnly === dateOnly);
                    return (
                      <td key={ac.id} className="border-r border-[#EAEAEA] px-2 py-2 align-top last:border-r-0">
                        <div className="flex flex-col gap-1">
                          {chips.map((chip) => (
                            <div
                              key={chip.id}
                              data-testid="calendar-chip"
                              className="rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] px-2 py-1 text-[11px] leading-tight text-[#2F3437]"
                            >
                              {chip.clampedStart ? <span aria-hidden="true">&#9650; </span> : null}
                              <span className="font-medium">{chip.timeLabel}</span> {chip.personName}
                              {chip.clampedEnd ? (
                                <span aria-hidden="true"> &#9660;</span>
                              ) : null}
                              {chip.instructorName ? <div className="text-[#787774]">{chip.instructorName}</div> : null}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aircraft.length > 0 && view === 'day' && dayBlocks.length === 0 ? <p className="mt-4 text-sm text-[#787774]">{labels.dayEmpty}</p> : null}
      {aircraft.length > 0 && view === 'week' && weekChips.length === 0 ? <p className="mt-4 text-sm text-[#787774]">{labels.weekEmpty}</p> : null}
    </section>
  );
}
