/**
 * `.segmented` port (story 12.1, AC 3) — the prototype repeats this
 * `<div className="segmented"><button className={active?"on":""}>` markup
 * inline everywhere (e.g. `Schedule.jsx` day/week toggle, filter popovers);
 * this component is the single typed, reusable version of that pattern.
 */
import type { ReactNode } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Story 14.7, AC 1: when the control needs its OWN accessible name (e.g.
   * a caller that does not wrap it in a `Field`'s implicit `<label>`), this
   * renders `role="group" aria-label={ariaLabel}` on the wrapping `div` —
   * same pattern `schedule.tsx`'s hand-rolled view-toggle already uses.
   * Omitted (the default) keeps today's plain `<div className="segmented">`
   * for every existing caller (`aircraft-editor.tsx`'s `BasedSegmented`),
   * unchanged.
   */
  ariaLabel?: string;
};

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="segmented" {...(ariaLabel ? { role: 'group', 'aria-label': ariaLabel } : {})}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
