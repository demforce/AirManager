import type { ExpiryScopeDto } from '@/lib/schemas/expiry-types';

/**
 * Client-side mirror of `expiries.service.ts#assertScopeCompatible` (story
 * 13.2, AC 1/2/5) — used ONLY to decide which catalogue chips to OFFER in the
 * ratings/medical pickers (create form and inline editor). The server
 * re-validates the same rule on every write (`SCOPE_MISMATCH`, 422) — this is
 * a UX filter, never the source of truth.
 */
export type ProfileFlags = { pilot: boolean; student: boolean; instructor: boolean };

export function isExpiryScopeCompatible(scope: ExpiryScopeDto, profiles: ProfileFlags): boolean {
  if (scope === 'ALL') return true;
  if (scope === 'PILOTS') return profiles.pilot;
  if (scope === 'STUDENTS') return profiles.student;
  return profiles.instructor;
}

/**
 * Name of the "Quota associativa" `ExpiryType`, upserted by this exact name
 * in `membership.service.ts` (which imports it from here — single source of
 * truth) and seeded by the same name. Only the KEY of that upsert: since
 * story 19.7a (D-1) the type is the one `ExpiryTypeKind.MEMBERSHIP` row, and
 * every reader — the editor chips that must not offer it, the Ratings card,
 * the Scadenze category — tells it apart by that kind, never by this name.
 */
export const MEMBERSHIP_FEE_TYPE_NAME = 'Quota associativa';
