import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Loading placeholder (story 12.2, AC 3 — DESIGN.md tokens only). Flat
 * canvas-fill pulse, NO shimmer/gradient: a plain `animate-pulse` opacity
 * tween on a solid `bg-canvas` (`#f5f5f5`) block. Callers size it via
 * `className` (width/height) and place it inside a `Card` for the
 * hairline-bordered container the AC calls for.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // cn() is a naive join: if the caller brings its own bg- utility (e.g. bg-hairline
  // on the bare canvas, review 12.2 122-F1), skip the default so the two don't clash.
  const hasBg = /(^|\s)bg-/.test(className ?? '');
  return (
    <div
      className={cn('animate-pulse rounded-nested', hasBg ? undefined : 'bg-canvas', className)}
      {...props}
    />
  );
}
