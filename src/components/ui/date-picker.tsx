'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocale } from 'next-intl';
import { cn } from './cn';
import { inputBaseClasses } from './input';
import { formatIsoDateToDisplay, parseDisplayDateToIso } from '@/lib/date-input';

/**
 * Grouped a11y/error strings for `DatePicker`/`DateTimeField` (story 12.5,
 * AC 1) — ONE object per page (same convention as `SearchCombobox`'s own
 * `pickerLabels: { placeholder, noResults }`), reused across every date
 * field that page renders instead of a prop per field.
 */
export type DatePickerLabels = {
  /** Accessible name of the calendar-toggle button — MUST differ from `label` (a wrapping/duplicate name breaks `getByLabel`, same lesson as `SearchCombobox`'s listbox). */
  openCalendar: string;
  previousMonth: string;
  nextMonth: string;
  /** Shown under the field when the typed text isn't a valid DD/MM/YYYY calendar date. */
  invalidDate: string;
};

export type DatePickerProps = {
  id: string;
  /** Rendered as a `<label htmlFor={id}>` OWNED by this component (never wrap it — same rule as `SearchCombobox`). */
  label: string;
  /** ISO `YYYY-MM-DD`, or `''` for empty. */
  value: string;
  /** Fired with a valid ISO date (or `''` when cleared) — never with malformed input (Dev Notes: "value ISO in/out"). */
  onChange: (value: string) => void;
  labels: DatePickerLabels;
  /** Month/weekday names and placeholder in the popover only (`Intl`, zero-dep) — the DD/MM/YYYY display format itself is locale-invariant (AC 1). Defaults to the active next-intl locale (review 12.5, 125-F2: EN surfaces were stuck in Italian). */
  locale?: 'it' | 'en';
  disabled?: boolean;
  /** OR'd with the component's own internal parse-invalid state — lets a caller's RHF "required field" error also mark the input invalid. */
  ariaInvalid?: boolean;
  testId?: string;
  className?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoOfDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  const now = new Date();
  return isoOfDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function addDaysIso(iso: string, delta: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return isoOfDate(new Date(date.getTime() + delta * DAY_MS));
}

function startOfWeekIso(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = Monday
  return addDaysIso(iso, -weekday);
}

type CalendarCell = { iso: string; day: number; inMonth: boolean };

/** Monday-first grid, padded to a full multiple of 7 with adjacent-month days (shown muted, still selectable). */
function buildWeeks(year: number, month: number): CalendarCell[][] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const leadingDays = (firstOfMonth.getUTCDay() + 6) % 7;
  const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: CalendarCell[] = [];
  for (let i = leadingDays; i > 0; i -= 1) {
    const date = new Date(Date.UTC(year, month, 1 - i));
    cells.push({ iso: isoOfDate(date), day: date.getUTCDate(), inMonth: false });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({ iso: isoOfDate(new Date(Date.UTC(year, month, day))), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const nextIso = addDaysIso(last.iso, 1);
    cells.push({ iso: nextIso, day: Number(nextIso.slice(8, 10)), inMonth: false });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function weekdayHeaderLabels(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const labels: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    // 2024-01-01 was a Monday — a fixed reference, unrelated to the viewed month.
    labels.push(formatter.format(new Date(Date.UTC(2024, 0, 1 + i))));
  }
  return labels;
}

/**
 * Text input (DD/MM/YYYY, keyboard-first) + calendar popover (story 12.5,
 * AC 1/8) — zero-dependency, overlay pattern borrowed from `Menu`/
 * `SearchCombobox` (a plain `absolute`-positioned div, NOT a portal, so it
 * still works inside a `Dialog`, lezione 12.3). The popover is a convenience
 * ONLY: typing a full `DD/MM/YYYY` and tabbing away works without ever
 * opening it.
 *
 * Text state is UNCOMMITTED until it parses: `onChange` only ever fires
 * with a valid ISO date (or `''` for a cleared field) — a malformed value
 * sets the component's own `invalid` flag (`aria-invalid` + `labels.invalidDate`)
 * and leaves the caller's `value` untouched, mirroring `SearchCombobox`'s
 * "query is local, value is committed" split.
 *
 * Keyboard grid (NFR-8): arrow keys move one day/week, Home/End jump to the
 * start/end of the visible week, Enter/Space activate the focused day
 * natively (no extra handling needed — it's a real `<button>`), Escape
 * closes and returns focus to the trigger (same convention as `Menu`).
 */
export function DatePicker({
  id,
  label,
  value,
  onChange,
  labels,
  locale,
  disabled = false,
  ariaInvalid = false,
  testId,
  className,
}: DatePickerProps) {
  const activeLocale = useLocale();
  const resolvedLocale: 'it' | 'en' = locale ?? (activeLocale === 'en' ? 'en' : 'it');
  const [text, setText] = useState(() => formatIsoDateToDisplay(value));
  const [reconciledValue, setReconciledValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number((value || todayIso()).slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number((value || todayIso()).slice(5, 7)) - 1);
  const [focusedIso, setFocusedIso] = useState(() => value || todayIso());
  // `position: fixed` + measured coordinates, NOT `position: absolute`
  // (Menu/SearchCombobox's usual overlay recipe) — a nude/faux-card table
  // wrapped in `overflow-x-auto` (AC 3) is a clipping ancestor for an
  // `absolute` popover (same CSS mechanic as `flights-manager.tsx`'s own
  // sticky-header doc-comment: any non-`visible` `overflow-x` computes
  // `overflow-y` to `auto` too), reproduced live inside `ExpiryRow`'s inline
  // edit form. `fixed` escapes every ancestor's overflow clipping and still
  // works inside `Dialog` (native `showModal()` doesn't clip fixed
  // descendants either) without needing a portal.
  const [popoverRect, setPopoverRect] = useState<{ top: number; left: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());

  // External value change (e.g. a form reset) while the field isn't
  // actively focused — the SAME "adjust during render" idiom as
  // `SearchCombobox`'s `reconciledValue` (React's documented derived-state
  // pattern: https://react.dev/learn/you-might-not-need-an-effect).
  if (value !== reconciledValue && !focused) {
    setReconciledValue(value);
    setText(formatIsoDateToDisplay(value));
    setInvalid(false);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    // A `fixed` popover doesn't move with the page — closing on scroll
    // (`capture: true` catches an inner scrollable ancestor too, e.g. the
    // table wrapper's own `overflow-x-auto`) avoids it drifting away from
    // the field it belongs to, same simplicity tradeoff as closing on
    // outside click rather than re-measuring continuously.
    function handleScroll(): void {
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  // Moves DOM focus onto the roving-tabindex day whenever it changes while open.
  useEffect(() => {
    if (!open) return;
    dayRefs.current.get(focusedIso)?.focus();
  }, [open, focusedIso, viewYear, viewMonth]);

  function commitText(next: string): void {
    setText(next);
    const parsed = parseDisplayDateToIso(next);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setReconciledValue(parsed);
    onChange(parsed);
  }

  function openPopover(): void {
    if (disabled) return;
    const seed = (value && parseDisplayDateToIso(formatIsoDateToDisplay(value))) || todayIso();
    setViewYear(Number(seed.slice(0, 4)));
    setViewMonth(Number(seed.slice(5, 7)) - 1);
    setFocusedIso(seed);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPopoverRect({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }

  function selectDay(iso: string): void {
    setInvalid(false);
    setText(formatIsoDateToDisplay(iso));
    setReconciledValue(iso);
    onChange(iso);
    setOpen(false);
    inputRef.current?.focus();
  }

  function goMonth(delta: number): void {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const next = addDaysIso(focusedIso, delta);
      setFocusedIso(next);
      if (next.slice(0, 7) !== `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`) {
        setViewYear(Number(next.slice(0, 4)));
        setViewMonth(Number(next.slice(5, 7)) - 1);
      }
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setFocusedIso(startOfWeekIso(focusedIso));
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setFocusedIso(addDaysIso(startOfWeekIso(focusedIso), 6));
    }
  }

  const weeks = buildWeeks(viewYear, viewMonth);
  const weekdayLabels = weekdayHeaderLabels(resolvedLocale);
  const monthYearLabel = new Intl.DateTimeFormat(resolvedLocale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(viewYear, viewMonth, 1)),
  );
  const gridLabelId = `${id}-grid-label`;
  const gridId = `${id}-grid`;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={resolvedLocale === 'it' ? 'GG/MM/AAAA' : 'DD/MM/YYYY'}
          disabled={disabled}
          aria-invalid={ariaInvalid || invalid}
          data-testid={testId}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => commitText(event.target.value)}
          className={cn(inputBaseClasses, 'min-h-[44px] w-full')}
        />
        <button
          ref={triggerRef}
          type="button"
          aria-label={labels.openCalendar}
          aria-haspopup="grid"
          aria-expanded={open}
          aria-controls={open ? gridId : undefined}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openPopover())}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-inputs border border-transparent bg-canvas text-ink transition-colors hover:bg-hairline disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CalendarGlyph />
        </button>
      </div>
      {invalid ? <p className="mt-1 text-xs text-ember">{labels.invalidDate}</p> : null}

      {open && popoverRect ? (
        <div
          style={{ top: popoverRect.top, left: popoverRect.left }}
          className="fixed z-20 w-[272px] rounded-nested border border-hairline bg-paper p-3 shadow-subtle"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label={labels.previousMonth}
              onClick={() => goMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-nested text-ink transition-colors hover:bg-canvas"
            >
              ‹
            </button>
            <span id={gridLabelId} className="text-sm font-medium capitalize text-ink">
              {monthYearLabel}
            </span>
            <button
              type="button"
              aria-label={labels.nextMonth}
              onClick={() => goMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-nested text-ink transition-colors hover:bg-canvas"
            >
              ›
            </button>
          </div>

          <div role="grid" id={gridId} aria-labelledby={gridLabelId} onKeyDown={handleGridKeyDown} className="mt-2">
            <div role="row" className="grid grid-cols-7">
              {weekdayLabels.map((weekday) => (
                <span key={weekday} role="columnheader" className="flex h-8 items-center justify-center text-xs text-mid-gray">
                  {weekday}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]!.iso} role="row" className="grid grid-cols-7">
                {week.map((cell) => (
                  <div key={cell.iso} role="gridcell" aria-selected={cell.iso === value}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) dayRefs.current.set(cell.iso, el);
                        else dayRefs.current.delete(cell.iso);
                      }}
                      tabIndex={cell.iso === focusedIso ? 0 : -1}
                      onClick={() => selectDay(cell.iso)}
                      onFocus={() => setFocusedIso(cell.iso)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-nested text-sm transition-colors',
                        !cell.inMonth && 'text-mid-gray',
                        cell.iso === value ? 'bg-accent text-paper' : cell.inMonth ? 'text-ink hover:bg-canvas' : 'hover:bg-canvas',
                      )}
                    >
                      {cell.day}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Thin-stroke calendar mark (DESIGN.md "Imagery": 1.5–2px geometric icons) — the app's first inline SVG, scoped to this one trigger. */
function CalendarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </svg>
  );
}
