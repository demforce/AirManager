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
 */
import { useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPopover } from './calendar-popover';
import { Icon } from './icons';

export type DateInputProps = {
  inline?: boolean;
  ref?: Ref<HTMLInputElement>;
  /** Input class — defaults to the AirOps `.input`; the legacy Tailwind pages (`people/{id}[…/account]`) pass their own classes and keep their frozen styling. */
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

export function DateInput({ inline = false, ref: externalRef, disabled, className = 'input', ...inputProps }: DateInputProps) {
  const t = useTranslations('ui.datePicker');
  // The whole popover anchor (month cursor + selected day) is CAPTURED when
  // the popover opens — the input's value is read in the event handler, never
  // during render (react-hooks/refs), and cannot change while the popover is
  // open (the scrim covers the input; a pick closes it).
  const [anchor, setAnchor] = useState<{ cursor: Date; selected: Date | null } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function attachRefs(node: HTMLInputElement | null): void {
    inputRef.current = node;
    if (typeof externalRef === 'function') externalRef(node);
    else if (externalRef) (externalRef as { current: HTMLInputElement | null }).current = node;
  }

  const today = new Date();

  function toggle(): void {
    if (anchor) {
      setAnchor(null);
      return;
    }
    // Re-anchor the month on every open — the value may have changed (typed,
    // reset, form re-populated) since the last time the popover was shown.
    const value = inputRef.current?.value ?? '';
    const selected = value ? dateOnlyToLocalDate(value) : null;
    setAnchor({ cursor: selected ?? new Date(), selected });
  }

  function pick(picked: Date): void {
    if (inputRef.current) setInputDate(inputRef.current, localDateToDateOnly(picked));
    setAnchor(null);
  }

  return (
    <span className={inline ? 'date-input' : 'date-input grow'}>
      <input type="date" className={className} disabled={disabled} {...inputProps} ref={attachRefs} />
      <button type="button" className="date-input-btn" aria-label={t('openCalendar')} onClick={toggle} disabled={disabled}>
        <Icon.calendar />
      </button>
      {anchor ? (
        <>
          <div className="popover-scrim" onClick={() => setAnchor(null)} />
          <CalendarPopover
            cursor={anchor.cursor}
            onCursorChange={(next) => setAnchor({ ...anchor, cursor: next })}
            selected={anchor.selected ?? today}
            today={today}
            onPick={pick}
            onToday={() => pick(new Date())}
            todayLabel={t('today')}
            prevMonthLabel={t('prevMonth')}
            nextMonthLabel={t('nextMonth')}
          />
        </>
      ) : null}
    </span>
  );
}
