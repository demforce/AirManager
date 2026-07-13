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
 * `<input type="checkbox">`, only visually hidden (`sr-only`): `getByLabel`,
 * `.check()`/`.uncheck()`/`toBeChecked()` and screen readers keep working
 * exactly as before — zero e2e churn by construction. The visible track/thumb
 * are pure `peer-checked` styling on the accent token (Palette v2), same
 * zero-dependency discipline as every other primitive here.
 */
export function Switch({ label, className, labelClassName, ...props }: SwitchProps) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-ink', className)}>
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-hairline transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-60 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-paper after:shadow-subtle after:transition-transform peer-checked:after:translate-x-4"
      />
      <span className={labelClassName}>{label}</span>
    </label>
  );
}
