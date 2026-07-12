import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Shared status-pill tone tripletta (story 12.1 Dev Notes — the semaforo
 * palette duplicated inline across 9+ call sites before this story: green
 * "ok"/active, amber "warning"/pending, red "danger"/inactive-error).
 * Values are UNCHANGED from before this story (AC 4: no re-design of status
 * color semantics, only consolidating where the classes are defined).
 */
export const STATUS_TONE_CLASSES = {
  ok: 'bg-[#EDF3EC] text-[#346538]',
  warning: 'bg-[#FBF3DB] text-[#956400]',
  danger: 'bg-[#FDEBEC] text-[#9F2F2D]',
} as const;

export type StatusTone = keyof typeof STATUS_TONE_CLASSES;

function isKnownTone(tone: string): tone is StatusTone {
  return tone in STATUS_TONE_CLASSES;
}

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  /**
   * A `StatusTone` key, or a raw `bg-[...] text-[...]` pair for a status
   * outside the tripletta (e.g. PPR's PENDING/COMPLETED states carry their
   * own established colors — AC 4 keeps those invariant too, this component
   * just renders whatever tone classes it is given).
   */
  tone: StatusTone | string;
};

/**
 * Centralized status/scadenza badge (story 12.1 Dev Notes — extracted from
 * `expiry-status-badge.tsx` plus 8 other inline duplications, closed list).
 * Capsule geometry coherent with `Badge`, byte-identical markup to the
 * pre-12.1 pills so existing e2e assertions on `data-testid`/text keep
 * passing.
 */
export function StatusPill({ tone, className, ...props }: StatusPillProps) {
  const toneClasses = isKnownTone(tone) ? STATUS_TONE_CLASSES[tone] : tone;
  return (
    <span className={cn('rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em]', toneClasses, className)} {...props} />
  );
}
