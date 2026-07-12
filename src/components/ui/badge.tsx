import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'solid' | 'soft' | 'outline';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  solid: 'bg-ink-soft text-surface-alt',
  soft: 'bg-canvas text-ink-soft',
  outline: 'border border-hairline bg-transparent text-ink',
};

/**
 * Tag / counter / neutral label (story 12.1, AC 2 — DESIGN.md "Badge —
 * Solid/Soft/Outline"). Capsule geometry, 18px radius, 12px/500 label.
 * For the colored scadenze/status semaphore, see `StatusPill` instead —
 * that palette is a separate, invariant-by-AC-4 tone set, not a Badge
 * variant.
 */
export function Badge({ variant = 'soft', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-badges px-2 py-0.5 text-caption font-medium', VARIANT_CLASSES[variant], className)}
      {...props}
    />
  );
}
