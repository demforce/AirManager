/**
 * Shared read-only grouping helper for the "Certificazioni" sections (story
 * 12.6, AC 4/5) — used by both `pilot-editor.tsx` (editor, read-only) and
 * `pilot-profile.tsx` (profile card). Grouped BY TYPE NAME (D13: no enum —
 * `ExpiryType.name` is the only category that exists), never by an invented
 * license/medical/rating split. `expiries.service.ts` guarantees at most one
 * current `Expiry` row per person+type, so in practice each `typeName`
 * already appears once; the worst-status-wins reduction below is a
 * defensive no-op for that case, not a real multi-row aggregation.
 */
export type ExpiryStatus = 'ok' | 'expiring' | 'expired';

export type ExpiryGroupSource = {
  typeName: string;
  status: ExpiryStatus;
  expiresAt: string;
};

export type ExpiryGroup = {
  typeName: string;
  status: ExpiryStatus;
  expiresAt: string;
};

const SEVERITY: Record<ExpiryStatus, number> = { ok: 0, expiring: 1, expired: 2 };

export function groupExpiriesByTypeName(expiries: readonly ExpiryGroupSource[]): ExpiryGroup[] {
  const worstByType = new Map<string, ExpiryGroup>();
  for (const expiry of expiries) {
    const existing = worstByType.get(expiry.typeName);
    if (!existing || SEVERITY[expiry.status] > SEVERITY[existing.status]) {
      worstByType.set(expiry.typeName, { typeName: expiry.typeName, status: expiry.status, expiresAt: expiry.expiresAt });
    }
  }
  return Array.from(worstByType.values()).sort((a, b) => a.typeName.localeCompare(b.typeName));
}
