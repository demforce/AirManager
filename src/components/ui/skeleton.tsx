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
  return <div className={cn('animate-pulse rounded-nested bg-canvas', className)} {...props} />;
}
