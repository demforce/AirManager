import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'filled' | 'ghost' | 'outline';
export type ButtonSize = 'default' | 'sm' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  filled: 'bg-accent text-paper hover:bg-accent-strong',
  ghost: 'bg-canvas text-ink hover:bg-hairline',
  outline: 'border border-hairline bg-transparent text-ink hover:bg-canvas',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'px-4 py-2 text-sm',
  // Preserves the compact table-row-action footprint duplicated across the
  // app before this story (row height/density is story 12.5's scope, not
  // this one's — this size variant only keeps dense rows unchanged).
  sm: 'px-3 py-1.5 text-xs',
  // TD-6 (AC 2) — square icon-only row action, min-target 32px (h-8 w-8).
  icon: 'h-8 w-8 p-0',
};

/**
 * Primitive filled/ghost/outline button (story 12.1, AC 2 — DESIGN.md
 * "Primary Filled Button" / "Secondary Ghost Button" / "Outline Button").
 * Pill radius (18px), 500-weight label, `active:scale` press feedback.
 * No default `type`: matches native `<button>` semantics exactly (implicit
 * "submit" inside a `<form>` when the caller omits it), so adopting this
 * component never changes existing form-submit behavior.
 */
export function Button({ variant = 'filled', size = 'default', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-buttons font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
