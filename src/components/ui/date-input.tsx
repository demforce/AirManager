'use client';

/**
 * Native `<input type="date">` paired with the app's own `CalendarPopover`
 * instead of the browser calendar (user decision 2026-07-21, superseding the
 * prototype's native pickers): typing — and e2e `fill()` — still go through
 * the real date input; the UA picker indicator is hidden (`airops.css`,
 * `.date-input`) so the calendar button beside it is the only popup
 * affordance.
 *
 * Deliberately a TRANSPARENT wrapper: every prop (including `value`/
 * `onChange` on controlled call sites and react-hook-form's `register()`
 * spread on uncontrolled ones) lands on the real input unchanged, so a call
 * site swaps `<input type="date" className="input" …>` for `<DateInput …>`
 * and nothing else. A calendar pick writes through the native value setter
 * and dispatches `input`/`change` events — both React controlled state and
 * RHF's registered listener observe it as if the user had typed it.
 *
 * `inline` keeps the control content-sized for toolbar/filter rows
 * (Field/slide-over contexts stretch full-width by default).
 *
 * Story TD-7 (AC 5a): the popover now positions itself via the SAME
 * `position:fixed`/clamp mechanism `schedule.tsx` already uses for its own
 * two popovers (`./fixed-popover.ts`) — auditing every real consumer found
 * this component's OLD `position:absolute` popover silently clipped by
 * `.card{overflow:hidden}` (the public `/ppr` form, the pre-existing
 * billing console filter) and `.so-body{overflow:auto}` (every SlideOver
 * form: `confirmHit`/`hitTestsOwnControl`-style measurement showed its
 * lower controls present in the DOM but NOT hit-testable whenever the field
 * sat low enough in the scrollable/clipped container) — exactly the bug
 * class reviews 13.7-F1/13.11 already fixed once for `schedule.tsx`. The
 * fixed-popover's coordinates are computed from the SAME wrapper box the
 * old CSS centered under (`.date-input`'s own rect), so the on-screen
 * position is unchanged for every ALREADY-visible case; only the
 * previously-clipped cases move (into view, which is the fix).
 *
 * The popover/scrim render through a `createPortal` to `document.body`
 * (see `./fixed-popover.ts`'s doc comment) — `position:fixed` does NOT
 * escape a `transform`-ed ancestor's containing block (`.slideover-panel`
 * always has one, for its slide transition), so leaving them in place
 * inside a SlideOver would still be trapped by `.so-body`'s clip despite
 * `position:fixed`.
 */
import { useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { CAL_POPOVER_WIDTH, CalendarPopover } from './calendar-popover';
import { clampPopoverLeft, POPOVER_PORTAL_SCRIM_Z_INDEX, POPOVER_PORTAL_Z_INDEX, useFixedPopover } from './fixed-popover';
import { Icon } from './icons';

export type DateInputProps = {
  inline?: boolean;
  ref?: Ref<HTMLInputElement>;
  /** Input class — defaults to the AirOps `.input`; kept overridable for call sites that need a different look, though none currently do (story 13.11 review F6: the pages that used to pass their own class are gone). */
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>;

/** `CalendarPopover` works on plain LOCAL-constructor `Date`s (same convention as `bookings/schedule.tsx`) — a client-side calendar WIDGET, never an instant, so there is no UTC/zone concern here. */
function dateOnlyToLocalDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

function localDateToDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Writes through the PROTOTYPE value setter (bypassing React's own tracker) then dispatches the events a keystroke would — the standard way to feed a controlled/registered input from outside. */
function setInputDate(input: HTMLInputElement, next: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The popover's content (month cursor + selected day) — separate from `useFixedPopover`'s own open/position state (story TD-7 refactor). */
type Content = { cursor: Date; selected: Date | null };

export function DateInput({ inline = false, ref: externalRef, disabled, className = 'input', ...inputProps }: DateInputProps) {
  const t = useTranslations('ui.datePicker');
  // Re-derived every time the popover opens (see `toggle` below) — the
  // initial value here is never rendered (the popover only shows while
  // `fixedPopover.open`).
  const [content, setContent] = useState<Content>({ cursor: new Date(), selected: null });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const fixedPopover = useFixedPopover(wrapperRef, popoverRef);

  function attachRefs(node: HTMLInputElement | null): void {
    inputRef.current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) (externalRef as { current: HTMLInputElement | null }).current = node;
  }

  const today = new Date();

  function toggle(): void {
    // Re-anchor the month on every open — the value may have changed (typed,
    // reset, form re-populated) since the last time the popover was shown.
    // `useFixedPopover.toggle` only invokes this callback on a real OPEN
    // (never on close), same "act only when about to open" shape the
    // pre-TD-7 inline check had.
    fixedPopover.toggle(() => {
      const value = inputRef.current?.value ?? '';
      const selected = value ? dateOnlyToLocalDate(value) : null;
      setContent({ cursor: selected ?? new Date(), selected });
    });
  }

  function pick(picked: Date): void {
    if (inputRef.current) setInputDate(inputRef.current, localDateToDateOnly(picked));
    fixedPopover.setOpen(false);
  }

  return (
    <span className={inline ? 'date-input' : 'date-input grow'} ref={wrapperRef}>
      <input type="date" className={className} disabled={disabled} {...inputProps} ref={attachRefs} />
      <button type="button" className="date-input-btn" aria-label={t('openCalendar')} onClick={toggle} disabled={disabled}>
        <Icon.calendar />
      </button>
      {fixedPopover.open && fixedPopover.anchor
        ? createPortal(
            <>
              <div className="popover-scrim" style={{ zIndex: POPOVER_PORTAL_SCRIM_Z_INDEX }} onClick={() => fixedPopover.setOpen(false)} />
              <CalendarPopover
                ref={popoverRef}
                style={{
                  position: 'fixed',
                  zIndex: POPOVER_PORTAL_Z_INDEX,
                  top: fixedPopover.anchor.top,
                  // Centered under the trigger (this wrapper's own box) —
                  // matches the pre-TD-7 CSS centering (`left:50%;
                  // transform:translateX(-50%)` relative to `.date-input`),
                  // clamped to the viewport (same mechanism as `schedule.tsx`).
                  left: clampPopoverLeft(
                    fixedPopover.anchor.triggerRect.left + fixedPopover.anchor.triggerRect.width / 2 - CAL_POPOVER_WIDTH / 2,
                    CAL_POPOVER_WIDTH,
                  ),
                  transform: 'none',
                  maxHeight: fixedPopover.anchor.maxHeight,
                  overflowY: 'auto',
                }}
                cursor={content.cursor}
                onCursorChange={(next) => setContent((current) => ({ ...current, cursor: next }))}
                selected={content.selected ?? today}
                today={today}
                onPick={pick}
                onToday={() => pick(new Date())}
                todayLabel={t('today')}
                prevMonthLabel={t('prevMonth')}
                nextMonthLabel={t('nextMonth')}
              />
            </>,
            document.body,
          )
        : null}
    </span>
  );
}
