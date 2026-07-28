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

/**
 * Story TD-7 (AC 1/2/6, additive): opts a consumer into date+TIME mode —
 * renders a typable `HH:MM` field plus a confirm action below the grid.
 * `CalendarPopover` stays a dumb, controlled-value widget (same convention
 * as every other prop here): parsing/validity/draft-state all live in the
 * consumer (`datetime-input.tsx`), this just renders what it's told and
 * reports keystrokes/clicks back.
 */
export type CalendarPopoverTimeProps = {
  /** Raw `HH:MM` text as typed so far — may be empty or invalid; the consumer decides. */
  value: string;
  onChange: (value: string) => void;
  /** Ratifica 3: the ONLY path that ever writes to the underlying input — never a bare day click. */
  onConfirm: () => void;
  /** True until both a day AND a valid time are present (ratifica 2/3). */
  confirmDisabled: boolean;
  /** True only for a NON-empty, malformed value (an empty field is "not yet filled", not "invalid"). */
  invalid: boolean;
  label: string;
  confirmLabel: string;
  invalidLabel: string;
};

export type CalendarPopoverProps = {
  cursor: Date;
  onCursorChange: (next: Date) => void;
  /** `null` = no day picked yet (story TD-7 review F2: passing `today` as a stand-in used to render it as visually SELECTED — full accent fill — even with nothing chosen; `null` renders no `.sel` cell at all, while `.today`'s own border stays a separate, always-on indicator). */
  selected: Date | null;
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
  /** Story TD-7: omitted entirely by every date-ONLY consumer (`date-input.tsx`, both `schedule.tsx` popovers) — their render stays byte-identical (AC 1). */
  time?: CalendarPopoverTimeProps;
};

/** `.cal-popover`'s CSS `width` (`airops.css`) — pinned here so `fixed-popover.ts`'s left-clamp math shares one source instead of a literal drifting out of sync with the CSS. `schedule.tsx` imports this (and the two constants below) from `fixed-popover.ts`, which re-exports it (story TD-7 review F6, PO decision 2026-07-26: dedup the three symbols that used to be duplicated verbatim there). */
export const CAL_POPOVER_WIDTH = 280;

/** `CalendarPopover`'s own natural rendered height (`scrollHeight`, measured in a real browser — story TD-7 review F1) in each of its two modes. `useFixedPopover#toggle` uses these only to decide whether flipping the popover above its trigger is worth it, never as a hard cap — see `fixed-popover.ts`. */
export const CAL_POPOVER_HEIGHT_DATE_ONLY = 359;
export const CAL_POPOVER_HEIGHT_DATE_TIME = 427;

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
  time,
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
    <div className="cal-popover" style={style} ref={ref} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
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
          const isSel = selected !== null && sameDay(date, selected);
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
      {time ? (
        <>
          <label className="fld">
            <span className="fld-label">{time.label}</span>
            <span className="fld-ctrl">
              <input
                type="text"
                autoComplete="off"
                placeholder="09:30"
                className="input"
                value={time.value}
                onChange={(event) => time.onChange(event.target.value)}
                onKeyDown={(event) => {
                  // A bare text input inside the surrounding `<form>` would
                  // otherwise submit it on Enter (the browser's implicit-
                  // submit rule) — Enter here means "confirm the picker",
                  // never "submit the whole booking/PPR form".
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!time.confirmDisabled) time.onConfirm();
                  }
                }}
                aria-invalid={time.invalid}
              />
            </span>
          </label>
          {time.invalid ? <p className="fld-error">{time.invalidLabel}</p> : null}
        </>
      ) : null}
      <div className="cal-foot">
        <button type="button" className="btn" onClick={onToday}>
          {todayLabel}
        </button>
        {time ? (
          // Story TD-7 review F2(b): the native `disabled` attribute has NO
          // visual effect here — the design system's only disabled look is
          // keyed off `aria-disabled` (`airops.css`, `.btn[aria-disabled="true"]`,
          // lesson 13.11-F1) — so a disabled `disabled` button rendered fully
          // opaque and apparently clickable while actually inert. `aria-disabled`
          // + a guard in the handler (same pattern the rest of the app's
          // disabled buttons use) gives it both the dimmed look AND blocks
          // activation.
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              if (!time.confirmDisabled) time.onConfirm();
            }}
            aria-disabled={time.confirmDisabled}
          >
            {time.confirmLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
