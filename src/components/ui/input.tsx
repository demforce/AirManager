import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Shared token classes for a form control's resting/focus look (story 12.1,
 * AC 2 — DESIGN.md "Input Field"): canvas fill, transparent border at rest,
 * hairline ring on focus, 18px radius, body-size text. Exported so
 * `<select>`/`<textarea>` — which share this exact look across the app but
 * aren't `<input>` elements — can consume the same tokens without
 * duplicating hex (see the 16 local `inputClasses` consolidated by this
 * story). `<Input>` below is the `<input>`-specific wrapper.
 */
export const inputBaseClasses =
  'rounded-inputs border border-transparent bg-canvas px-2.5 py-2 text-body text-ink outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Forwards its ref: required for `react-hook-form`'s `{...register(name)}`
 * spread (which includes a `ref`) to keep working unchanged on every call
 * site this replaces.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputBaseClasses, className)} {...props} />;
});
