import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type SwitchProps = {
  /** Rendered as the visible text next to the track — the whole row is one `<label>`. */
  label: string;
  className?: string;
  labelClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>;

/**
 * On/off switch (full UI audit, 2026-07-13 — user: "checkbox → bottoni
 * on/off belli da vedere"). The REAL control stays a native
 * `<input type="checkbox">`, invisible but overlaying the track: `getByLabel`,
 * `.check()`/`.uncheck()`/`toBeChecked()` and screen readers keep working
 * exactly as before — zero e2e churn by construction. The visible track/thumb
 * are pure `peer-checked` styling on the accent token (Palette v2), same
 * zero-dependency discipline as every other primitive here.
 */
export function Switch({ label, className, labelClassName, ...props }: SwitchProps) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-ink', className)}>
      <span className="relative inline-flex h-5 w-9 shrink-0">
        {/* The input OVERLAYS the track (opacity-0, not sr-only): it stays the
            real pointer hit-target, so Playwright's .check() and real clicks
            land on the control itself instead of being intercepted by the
            decorative track. */}
        <input
          type="checkbox"
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
          {...props}
        />
        {/* OFF track is `mid-gray`, not `hairline` (audit review 2026-07-13, WCAG 1.4.11 non-text contrast): the component boundary needs ≥3:1 against the card — mid-gray on paper is 4.87:1, hairline was 1.18:1. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-mid-gray transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-paper after:shadow-subtle after:transition-transform peer-checked:after:translate-x-4"
        />
      </span>
      <span className={labelClassName}>{label}</span>
    </label>
  );
}
