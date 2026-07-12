import type { HTMLAttributes } from 'react';
import { cn } from './cn';

// No tailwind-merge (story 12.1 Dev Notes: no new dependency) — a naive
// class-string concat can't resolve two conflicting padding utilities
// (Card's default `p-5` vs. a caller's `p-8`/`p-0`/etc.) because Tailwind's
// cascade order depends on stylesheet generation order, not class-list
// order. So instead: detect whether the caller already specifies padding
// and skip Card's own default entirely when they do — only one padding
// utility is ever emitted at a time, no ambiguity.
const HAS_PADDING_RE = /(^|\s)(p|px|py|pt|pr|pb|pl)-/;

/**
 * Content card (story 12.1, AC 2 — DESIGN.md "Card"). Paper surface,
 * 24px radius, hairline border, `--shadow-subtle`, 20px padding by default
 * (pass your own `p-*`/`px-*`/`py-*` in `className` to override it).
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const hasCustomPadding = className ? HAS_PADDING_RE.test(className) : false;
  return (
    <div
      className={cn('rounded-cards border border-hairline bg-paper shadow-subtle', !hasCustomPadding && 'p-5', className)}
      {...props}
    />
  );
}

/**
 * Nested header band (DESIGN.md "Nested Card Header/Footer"): bleeds to the
 * card's own edges via negative margins so its top corners share the card's
 * 24px radius, with a hairline divider separating it from the card body.
 * No call site yet in this story (T2 scaffolding — the app has no
 * header/footer card pattern today per the 12.1 recon); future stories
 * (e.g. 12.3 dialogs) are the first consumers.
 */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-5 -mt-5 mb-5 rounded-t-cards border-b border-hairline px-5 py-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mx-5 -mb-5 mt-5 rounded-b-cards border-t border-hairline px-5 py-5', className)} {...props} />;
}
