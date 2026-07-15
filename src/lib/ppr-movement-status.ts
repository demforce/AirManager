/**
 * PPR movement status derivation (epic 12, story 12.4, AC 3) — pure,
 * side-effect-free helper for `/dashboard/movements`
 * (`docs/design-reference/airops/src/Ops.jsx#VisitingView`). An APPROVED
 * PprRequest silently drifts through atteso -> in arrivo -> al suolo purely
 * as time passes, with no explicit status transition recorded anywhere —
 * this function is the ONLY place that math happens. `PprStatus` itself
 * never gains extra values for this (`schemas/ppr.ts`'s own comment: "gli
 * stati derivati NON entrano nello schema: sono presentazione") —
 * COMPLETED/CANCELLED/PENDING/REJECTED map 1:1 to their REAL status
 * (`'partito'`/`'annullato'`/etc, no date math needed) directly by the
 * caller; only APPROVED needs this derivation.
 *
 * Server-side only (same convention as `zoned-time.ts`, which this composes
 * — that module's own doc-comment: "the client never re-derives this").
 *
 * **Rome-day boundary** (lesson PR #17): `eta`'s calendar day is computed in
 * Europe/Rome, NOT UTC — between 22:00 and 24:00 UTC in summer (CEST,
 * UTC+2) or 23:00-24:00 UTC in winter (CET, UTC+1), the Rome day is already
 * tomorrow; comparing raw UTC dates would misclassify an eta right at that
 * boundary as "today" when Rome already sees it as tomorrow, or vice versa.
 */
import { APP_TIMEZONE } from './time';
import { dateOnlyInZone } from './zoned-time';

export type ApprovedPprMovementStatus = 'ATTESO' | 'IN_ARRIVO' | 'AL_SUOLO';

/**
 * Classifies an APPROVED PprRequest's `eta` relative to `now` (AC 3):
 * - `eta <= now` (already passed, ANY day — including a still-open PPR from
 *   a PREVIOUS day the staff never closed out): `'AL_SUOLO'`.
 * - `eta` on the SAME Rome calendar day as `now`, still in the future:
 *   `'IN_ARRIVO'`.
 * - `eta` on a LATER Rome calendar day: `'ATTESO'`.
 */
export function deriveApprovedPprMovementStatus(eta: Date, now: Date): ApprovedPprMovementStatus {
  if (eta.getTime() <= now.getTime()) {
    return 'AL_SUOLO';
  }
  return dateOnlyInZone(eta, APP_TIMEZONE) === dateOnlyInZone(now, APP_TIMEZONE) ? 'IN_ARRIVO' : 'ATTESO';
}
