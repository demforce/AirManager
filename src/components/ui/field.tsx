/**
 * `.fld`/`.input`/`.input-group` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/SlideOver.jsx#Field/Input/Select`, typed;
 * `InputGroup` extracts the prefix/suffix markup repeated inline across the
 * prototype (e.g. `Fleet.jsx`, `Forms.jsx`, `SettingsView.jsx`) into one
 * reusable component.
 */
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export type FieldProps = {
  label: ReactNode;
  children: ReactNode;
  wide?: boolean;
};

export function Field({ label, children, wide = false }: FieldProps) {
  return (
    <label className={`fld ${wide ? 'wide' : ''}`}>
      <span className="fld-label">{label}</span>
      <span className="fld-ctrl">{children}</span>
    </label>
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
