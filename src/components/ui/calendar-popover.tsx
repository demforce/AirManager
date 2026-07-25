'use client';

/**
 * `.cal-popover` port (story 12.1, AC 3) — 1:1 DOM/classes of
 * `docs/design-reference/airops/src/Schedule.jsx#CalendarPopover`, typed;
 * grid math lives in `./calendar-grid` (unit-tested separately). Month
 * label and weekday abbreviations are locale-formatted via `Intl` (house
 * convention, see `src/lib/time.ts`) instead of the prototype's
 * hardcoded Italian strings, so the component reads correctly on `/en` too.
 */
import { useLocale } from 'next-intl';
import { useMemo, type CSSProperties, type Ref } from 'react';
import { buildCalendarGrid } from './calendar-grid';
import { Icon } from './icons';

export type CalendarPopoverProps = {
  cursor: Date;
  onCursorChange: (next: Date) => void;
  selected: Date;
  today: Date;
  onPick: (date: Date) => void;
  onToday: () => void;
  todayLabel: string;
  prevMonthLabel: string;
  nextMonthLabel: string;
  /**
   * Story 13.7 review fix (F1): optional override for the popover's own
   * `.cal-popover` CSS anchor (`position:absolute`) — lets `schedule.tsx`
   * escape the same `.card{overflow:hidden}` clip its filter popover was
   * fixed for in AC1, by switching to `position:fixed` with viewport
   * coordinates. Additive/optional so `date-input.tsx`'s existing usage
   * (no clipping card there) is unaffected.
   */
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
};

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export function CalendarPopover({
  cursor,
  onCursorChange,
  selected,
  today,
  onPick,
  onToday,
  todayLabel,
  prevMonthLabel,
  nextMonthLabel,
  style,
  ref,
}: CalendarPopoverProps) {
  const rawLocale = useLocale();
  const intlLocale = rawLocale === 'en' ? 'en-IE' : 'it-IT';

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(cursor),
    [cursor, intlLocale],
  );

  const dowLabels = useMemo(() => {
    // 2026-01-05..11 is a real Monday-first week (any Monday-first week works).
    const formatter = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2026, 0, 5 + i)).toUpperCase());
  }, [intlLocale]);

  const cells = useMemo(() => buildCalendarGrid(cursor), [cursor]);

  function stepMonth(delta: number) {
    onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  }

  return (
    <div className="cal-popover" style={style} ref={ref} onClick={(event) => event.stopPropagation()}>
      <div className="cal-head">
        <button type="button" className="iconbtn" onClick={() => stepMonth(-1)} aria-label={prevMonthLabel}>
          <Icon.chevL />
        </button>
        <div className="cal-month">{monthLabel}</div>
        <button type="button" className="iconbtn" onClick={() => stepMonth(1)} aria-label={nextMonthLabel}>
          <Icon.chevR />
        </button>
      </div>
      <div className="cal-dows">
        {dowLabels.map((label) => (
          <div key={label} className="cal-dow">
            {label}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((date) => {
          const inMonth = date.getMonth() === cursor.getMonth();
          const isSel = sameDay(date, selected);
          const isToday = sameDay(date, today);
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`cal-cell ${inMonth ? '' : 'out'} ${isSel ? 'sel' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => onPick(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="cal-foot">
        <button type="button" className="btn" onClick={onToday}>
          {todayLabel}
        </button>
      </div>
    </div>
  );
}
