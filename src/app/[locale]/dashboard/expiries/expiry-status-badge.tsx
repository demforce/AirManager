'use client';

import type { ExpiryStatusDto } from '@/lib/schemas/expiries';

/**
 * The colored status-pill palette (story 6.2 Contesto): green `ok` (>60gg),
 * yellow `expiring` (<=60gg), red `expired`. Shared by every surface that
 * renders a scadenza's computed status — the scheda persona panel and
 * own-access "Le mie scadenze" (story 6.2), the staff dashboard and the home
 * widget (story 6.4). ONE palette, defined here only.
 */
export const EXPIRY_STATUS_BADGE_CLASSES: Record<ExpiryStatusDto, string> = {
  ok: 'bg-[#EDF3EC] text-[#346538]',
  expiring: 'bg-[#FBF3DB] text-[#956400]',
  expired: 'bg-[#FDEBEC] text-[#9F2F2D]',
};

export type ExpiryStatusBadgeProps = {
  status: ExpiryStatusDto;
  /** Already localized by the caller (Dev Notes: never a raw enum in the DOM) — this component only owns presentation, never i18n. */
  label: string;
  'data-testid'?: string;
};

/**
 * Shared status badge (story 6.4 Contesto: "UN componente condiviso, basta
 * duplicazioni") — extracted from the markup `expiries-panel.tsx` and
 * `my-expiries.tsx` (story 6.2) each had their own copy of, so all four
 * surfaces that render a scadenza's status (those two, plus the new 6.4
 * staff dashboard and home widget) render the exact same pill. Visual
 * output is byte-identical to the pre-6.4 markup (same classes, same
 * `data-testid` passed by the caller) so the existing 6.2 e2e assertions
 * keep passing unchanged.
 */
export function ExpiryStatusBadge({ status, label, 'data-testid': dataTestId }: ExpiryStatusBadgeProps) {
  return (
    <span
      data-testid={dataTestId}
      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${EXPIRY_STATUS_BADGE_CLASSES[status]}`}
    >
      {label}
    </span>
  );
}
