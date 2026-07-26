'use client';

/**
 * Native `<input type="datetime-local">` paired with `CalendarPopover`'s
 * date+time mode (story TD-7, PO ratifiche 2026-07-26) — the datetime-local
 * sibling of `date-input.tsx`, replacing every remaining native
 * datetime-local picker in the app for the same reason `DateInput` replaced
 * `<input type="date">`'s.
 *
 * Ratifiche PO (binding, see `_bmad-output/implementation-artifacts/td-7-datetime-picker.md`):
 * 1. `CalendarPopover` is EXTENDED with an hour block (its own `time` prop),
 *    not a separate hour field bolted on beside the picker.
 * 2. The hour is a TYPABLE `HH:MM` text field — no 5-minute `step` rounding,
 *    every minute is reachable (`datetime-value.ts#isValidTimeText`).
 * 3. No default: the popover keeps a local DRAFT (day + typed time) and
 *    writes the underlying input ONLY on an explicit confirm, and only once
 *    BOTH pieces are valid — picking a day alone never writes a value, let
 *    alone invents `00:00`.
 *
 * Same transparent-wrapper contract as `DateInput`: every prop (including
 * RHF's `register()` spread) lands on the real input unchanged, and a
 * confirmed pick writes through the native value setter + `input`/`change`
 * events, so both a controlled `value`/`onChange` and RHF's registered
 * listener see it exactly as if the user had typed `YYYY-MM-DDTHH:MM`
 * directly — the format every consumer already expects.
 *
 * Story TD-7 (AC 5a): positions its popover via the SAME fixed/clamp
 * mechanism as `DateInput` (`./fixed-popover.ts`) — every one of this
 * story's new SlideOver/card consumers is a `.card{overflow:hidden}`/
 * `.so-body{overflow:auto}` context, the exact clipping class reviews
 * 13.7-F1/13.11 already fixed once for `schedule.tsx`; see `date-input.tsx`'s
 * doc comment for the full rationale (shared verbatim here), including WHY
 * the popover/scrim render through a `createPortal` to `document.body`
 * (`position:fixed` does not escape a `transform`-ed ancestor, and
 * `.slideover-panel` always has one while open).
 */
import { useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { CAL_POPOVER_WIDTH, CalendarPopover } from './calendar-popover';
import { composeDatetimeLocal, isValidTimeText, parseDatetimeLocal } from './datetime-value';
import { clampPopoverLeft, POPOVER_PORTAL_SCRIM_Z_INDEX, POPOVER_PORTAL_Z_INDEX, useFixedPopover } from './fixed-popover';
import { Icon } from './icons';

export type DateTimeInputProps = {
  inline?: boolean;
  ref?: Ref<HTMLInputElement>;
  /** Input class — defaults to the AirOps `.input`, same override escape hatch as `DateInput`. */
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>;

/** `CalendarPopover` works on plain LOCAL-constructor `Date`s — same convention as `date-input.tsx#dateOnlyToLocalDate`. */
function dateOnlyToLocalDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

function localDateToDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Writes through the PROTOTYPE value setter then dispatches the events a keystroke would — same technique as `date-input.tsx#setInputDate`. */
function setInputDatetime(input: HTMLInputElement, next: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The popover's local content (ratifica 3) — separate from `useFixedPopover`'s own open/position state. `selectedDay` and `time` are independent until confirm composes them; either, both, or neither may be set. */
type Content = { cursor: Date; selectedDay: Date | null; time: string };

export function DateTimeInput({ inline = false, ref: externalRef, disabled, className = 'input', ...inputProps }: DateTimeInputProps) {
  const t = useTranslations('ui.datePicker');
  const [content, setContent] = useState<Content>({ cursor: new Date(), selectedDay: null, time: '' });
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
    // Re-anchor on every open (same reasoning as `DateInput#toggle`): the
    // value may have changed since the popover was last shown. Only runs on
    // a real OPEN (`useFixedPopover.toggle` never invokes this on close).
    fixedPopover.toggle(() => {
      const value = inputRef.current?.value ?? '';
      const parsed = parseDatetimeLocal(value);
      setContent(
        parsed
          ? { cursor: dateOnlyToLocalDate(parsed.dateOnly), selectedDay: dateOnlyToLocalDate(parsed.dateOnly), time: parsed.time }
          : { cursor: new Date(), selectedDay: null, time: '' },
      );
    });
  }

  /** A day click/"Oggi" only updates the content — ratifica 3, no write, no close. */
  function pickDay(picked: Date): void {
    setContent((current) => ({ ...current, selectedDay: picked }));
  }

  function changeTime(value: string): void {
    setContent((current) => ({ ...current, time: value }));
  }

  const confirmDisabled = !content.selectedDay || !isValidTimeText(content.time);

  /** The ONLY path that writes the underlying input — requires both a day and a valid time (ratifica 2/3). */
  function confirm(): void {
    if (!content.selectedDay || !isValidTimeText(content.time)) return;
    if (inputRef.current) setInputDatetime(inputRef.current, composeDatetimeLocal(localDateToDateOnly(content.selectedDay), content.time));
    fixedPopover.setOpen(false);
  }

  return (
    <span className={inline ? 'date-input' : 'date-input grow'} ref={wrapperRef}>
      <input type="datetime-local" className={className} disabled={disabled} {...inputProps} ref={attachRefs} />
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
                selected={content.selectedDay ?? today}
                today={today}
                onPick={pickDay}
                onToday={() => pickDay(new Date())}
                todayLabel={t('today')}
                prevMonthLabel={t('prevMonth')}
                nextMonthLabel={t('nextMonth')}
                time={{
                  value: content.time,
                  onChange: changeTime,
                  onConfirm: confirm,
                  confirmDisabled,
                  invalid: content.time.length > 0 && !isValidTimeText(content.time),
                  label: t('time'),
                  confirmLabel: t('confirm'),
                  invalidLabel: t('invalidTime'),
                }}
              />
            </>,
            document.body,
          )
        : null}
    </span>
  );
}
