/**
 * Shared, PURE computed-status helper for a scadenza (epic 6, story 6.2,
 * AC 1; Contesto: "lo stato NON si persiste MAI"). `Expiry.expiresAt` is the
 * only source of truth — this function derives `ok` / `expiring` / `expired`
 * from it against a given "today", never against `new Date()` implicitly,
 * so both server callers (which pass `todayDateOnlyUtc()`) and unit tests
 * (which pass an explicit date) get a deterministic result. Story 6.3's
 * alert job and 6.4's dashboard reuse this exact function — there must
 * never be a second implementation of the ok/expiring/expired boundary.
 *
 * Both `expiresAt` and `today` are expected to already be date-only UTC
 * values (`date-only.ts`'s `parseDateOnlyUtc`/`todayDateOnlyUtc` — UTC
 * midnight, no time-of-day component); the day-difference is computed on
 * the raw millisecond timestamps divided by a whole day, which is exact and
 * timezone-independent ONLY when both inputs already carry zero
 * time-of-day (review 3.5 F1's lesson, the same convention every other
 * date-only computation in this codebase follows).
 *
 * Boundaries (Contesto, mirrors `HourPackage.expiresAt >= flightDate` from
 * story 5.2's package eligibility): the expiry day itself is still valid —
 * `expired` is `expiresAt < today` (strictly before), never `<=`. `expiring`
 * covers 0 to `EXPIRY_WARNING_DAYS` days remaining, INCLUSIVE on both ends
 * (today itself, i.e. expiring exactly today, is `expiring` — not `ok` and
 * not yet `expired`, since the day itself is still valid). Beyond that
 * window is `ok`.
 */

/** Warning window (Contesto, AC 1): a scadenza within this many days of `expiresAt` (inclusive) is `expiring`. Story 6.3 reuses this same constant for the alert job's threshold. */
export const EXPIRY_WARNING_DAYS = 60;

export type ExpiryStatus = 'ok' | 'expiring' | 'expired';

const MS_PER_DAY = 86_400_000;

/**
 * Computes the calendar-day difference `expiresAt - today` (both already
 * UTC-midnight date-only values) and maps it to `ok` / `expiring` /
 * `expired` per the boundaries documented above.
 */
export function computeExpiryStatus(expiresAt: Date, today: Date): ExpiryStatus {
  const daysRemaining = Math.round((expiresAt.getTime() - today.getTime()) / MS_PER_DAY);

  if (daysRemaining < 0) {
    return 'expired';
  }
  if (daysRemaining <= EXPIRY_WARNING_DAYS) {
    return 'expiring';
  }
  return 'ok';
}
