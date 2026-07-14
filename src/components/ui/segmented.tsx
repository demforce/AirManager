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
};

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented">
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
