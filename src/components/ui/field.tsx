/**
 * `.fld`/`.input`/`.input-group` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/SlideOver.jsx#Field/Input/Select`, typed;
 * `InputGroup` extracts the prefix/suffix markup repeated inline across the
 * prototype (e.g. `Fleet.jsx`, `Forms.jsx`, `SettingsView.jsx`) into one
 * reusable component.
 */
import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react';

export type FieldProps = {
  label: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /**
   * Story 14.2, AC 1: per-field validation message, rendered INLINE right
   * below the control instead of the app's old pattern (a single generic
   * string at the bottom of the whole form — the user's own complaint: "non
   * so QUALE campo"). The red border itself comes for free from
   * `airops.css`'s `.input[aria-invalid="true"]` rule — every call site
   * already sets `aria-invalid` on its `Input`/`Select` directly (RHF's
   * `errors.field`), independently of this prop; `error` only adds the
   * visible text. `.fld-error`'s color is a measured-safe darker literal in
   * light theme (raw `--bad` text is 3.75-3.97:1 there, below the 4.5:1
   * floor — same fix as `.stat-tone-bad`/`.badge.bad`, lezione 13.9).
   */
  error?: string;
};

export function Field({ label, children, wide = false, error }: FieldProps) {
  // Review F8: the error text and the control are ARIA-linked (screen reader
  // announces the message alongside the accessible name), on top of the
  // already-visible red border/inline text — `useId()` keyed to THIS Field
  // instance, not the caller's own `id` (many `Input`s here have none).
  const errorId = useId();
  const control = error && isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': errorId }) : children;

  return (
    <div className={`fld ${wide ? 'wide' : ''}`}>
      {/* The `<label>` wraps ONLY the label text + control (implicit
          association) — `error` must stay OUTSIDE it: a wrapping `<label>`'s
          accessible name is computed from ALL of its text content, so an
          error span nested INSIDE would get appended to the control's own
          accessible name (e.g. "Nome" -> "Nome Campo obbligatorio."),
          breaking both `getByLabel` lookups and the screen-reader experience
          (caught by `e2e/ppr-public.spec.ts`'s own AC 1/2 guard). */}
      <label className="fld-label-group">
        <span className="fld-label">{label}</span>
        <span className="fld-ctrl">{control}</span>
      </label>
      {error ? (
        <span id={errorId} className="fld-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
  );
}

export type InputGroupProps = {
  prefix?: ReactNode;
  suffix?: ReactNode;
  children: ReactNode;
};

export function InputGroup({ prefix, suffix, children }: InputGroupProps) {
  return (
    <div className="input-group">
      {prefix && <span className="prefix">{prefix}</span>}
      {children}
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}
