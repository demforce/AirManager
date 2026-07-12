'use client';

import { useState, type ChangeEvent } from 'react';
import { cn } from './cn';
import { inputBaseClasses } from './input';
import { DatePicker, type DatePickerLabels } from './date-picker';
import { parseTimeShorthand } from '@/lib/time-input';
import { composeDateTimeLocalValue, splitDateTimeLocalValue } from '@/lib/date-input';

export type DateTimeFieldLabels = DatePickerLabels & {
  /** Shown under the time field when the typed shorthand doesn't parse (`parseTimeShorthand` — same rule as the flight dialog). */
  invalidTime: string;
};

export type DateTimeFieldProps = {
  /** Base id — the date half keeps it verbatim (AC 1: "label/htmlFor invariati"), the time half gets `${id}-time`. */
  id: string;
  /** The EXISTING field label (`Inizio`, `ETA`, ...) — stays on the date half (Dev Notes). */
  dateLabel: string;
  /** Derived label for the time half (e.g. `Ora inizio`) — a caller string, not computed here (bilingual IT/EN wording varies by field). */
  timeLabel: string;
  /** `YYYY-MM-DDTHH:MM`, or `''` — byte-identical to the `datetime-local` input it replaces (Dev Notes). */
  value: string;
  onChange: (value: string) => void;
  labels: DateTimeFieldLabels;
  locale?: 'it' | 'en';
  disabled?: boolean;
  /** OR'd with each half's own internal invalid state — same contract as `DatePicker.ariaInvalid`. */
  ariaInvalid?: boolean;
  className?: string;
};

/**
 * `DatePicker` + a free-text time field reusing `parseTimeShorthand` (story
 * 12.5, AC 1/2 — the datetime-local replacement, same shorthand UX as the
 * flight dialog's takeoff/landing fields). `onChange` fires the SAME
 * `YYYY-MM-DDTHH:MM` string the native `datetime-local` input produced
 * (verified byte-identical against `new-booking-form`/`bookings-list`/
 * `ppr-form` before this story touched them) — ONLY once both halves parse;
 * an incomplete or malformed pair leaves the wire value untouched and shows
 * its own inline error, same "commit only on valid" contract as `DatePicker`.
 */
export function DateTimeField({
  id,
  dateLabel,
  timeLabel,
  value,
  onChange,
  labels,
  locale,
  disabled = false,
  ariaInvalid = false,
  className,
}: DateTimeFieldProps) {
  const initial = splitDateTimeLocalValue(value);
  const [dateIso, setDateIso] = useState(initial.date);
  const [timeText, setTimeText] = useState(initial.time);
  const [timeFocused, setTimeFocused] = useState(false);
  const [timeInvalid, setTimeInvalid] = useState(false);
  const [reconciledValue, setReconciledValue] = useState(value);

  // Same "adjust during render" reconciliation as `DatePicker` — only while
  // the time field isn't being actively edited (the date half owns its own
  // reconciliation internally).
  if (value !== reconciledValue && !timeFocused) {
    setReconciledValue(value);
    const next = splitDateTimeLocalValue(value);
    setDateIso(next.date);
    setTimeText(next.time);
    setTimeInvalid(false);
  }

  function commit(nextDateIso: string, nextTimeText: string): void {
    const trimmedTime = nextTimeText.trim();
    if (nextDateIso === '' && trimmedTime === '') {
      setReconciledValue('');
      onChange('');
      return;
    }
    const normalizedTime = trimmedTime === '' ? null : parseTimeShorthand(trimmedTime);
    if (nextDateIso && normalizedTime) {
      const composed = composeDateTimeLocalValue(nextDateIso, normalizedTime);
      setReconciledValue(composed);
      onChange(composed);
    }
    // Otherwise: incomplete/invalid pair — wire stays whatever it was.
  }

  function handleDateChange(iso: string): void {
    setDateIso(iso);
    commit(iso, timeText);
  }

  function handleTimeChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setTimeText(next);
    const trimmed = next.trim();
    setTimeInvalid(trimmed !== '' && parseTimeShorthand(trimmed) === null);
    commit(dateIso, next);
  }

  const timeId = `${id}-time`;

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>
      <DatePicker
        id={id}
        label={dateLabel}
        value={dateIso}
        onChange={handleDateChange}
        labels={labels}
        locale={locale}
        disabled={disabled}
        ariaInvalid={ariaInvalid}
      />
      <div>
        <label htmlFor={timeId} className="block text-sm font-medium text-ink">
          {timeLabel}
        </label>
        <input
          id={timeId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="14:30"
          disabled={disabled}
          aria-invalid={ariaInvalid || timeInvalid}
          value={timeText}
          onFocus={() => setTimeFocused(true)}
          onBlur={() => setTimeFocused(false)}
          onChange={handleTimeChange}
          className={cn(inputBaseClasses, 'mt-2 min-h-[44px] w-full')}
        />
        {timeInvalid ? <p className="mt-1 text-xs text-ember">{labels.invalidTime}</p> : null}
      </div>
    </div>
  );
}
