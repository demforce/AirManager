/**
 * `.badge` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/primitives.jsx#Badge`, typed.
 */
import type { ReactNode } from 'react';

export type BadgeTone = '' | 'ok' | 'warn' | 'bad' | 'info';

export type BadgeProps = {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
};

export function Badge({ tone = '', dot = false, children }: BadgeProps) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="b-dot" />}
      {children}
    </span>
  );
}
