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
  /**
   * Story 14.3, AC 2 — a neutral, non-error informational message in the
   * SAME slot as `error` (muted `.fld-hint`, no `role="alert"`): used when
   * another field's selection forces/narrows this one's choices (e.g. Tipo
   * volo forced to SCHOOL once a student-only person is picked) so the
   * reason is never a silent disabled control. Ignored when `error` is also
   * set (a real validation error always wins).
   */
  hint?: string;
};

export function Field({ label, children, wide = false, error, hint }: FieldProps) {
  // Review F8: the error text and the control are ARIA-linked (screen reader
  // announces the message alongside the accessible name), on top of the
  // already-visible red border/inline text — `useId()` keyed to THIS Field
  // instance, not the caller's own `id` (many `Input`s here have none).
  // Review F4 (story 14.3): `hint` gets the SAME treatment — a disabled
  // control (e.g. Tipo volo force-locked to SCHOOL) is out of the tab order,
  // so its only programmatic explanation for AT is this link. `error` and
  // `hint` never BOTH render (the JSX below is a strict either/or, matching
  // `FieldProps.hint`'s own doc-comment: "ignored when `error` is also
  // set") — `describedById` picks whichever one IS actually in the DOM, so
  // it can never point at a non-existent id.
  const errorId = useId();
  const hintId = useId();
  const describedById = error ? errorId : hint ? hintId : undefined;
  const control =
    describedById && isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': describedById }) : children;

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
      ) : hint ? (
        <span id={hintId} className="fld-hint">
          {hint}
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
