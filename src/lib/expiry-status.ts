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

/**
 * Alert cadence markers (story 6.3, Contesto) — NOT strict equalities: a
 * threshold `T` is "due" for a scadenza whenever `daysLeft <= T`. Consumed
 * once via `SentAlert` (unique per `(expiryId, threshold)`, AD-9). The
 * normal rhythm walks this array in order (60 -> 30 -> 7 -> 0, one email
 * each); a job that skipped days (or a scadenza registered already close
 * to/past its date) instead finds several DUE-but-unconsumed thresholds at
 * once and catches them all up behind a SINGLE holder email — see
 * `expiry-alerts.service.ts#runExpiryAlertsJob`'s doc-comment. `Math.max`
 * of this array (never a second hardcoded `60`) bounds the job's candidate
 * query window.
 */
export const EXPIRY_ALERT_THRESHOLDS = [60, 30, 7, 0] as const;

export type ExpiryStatus = 'ok' | 'expiring' | 'expired';

const MS_PER_DAY = 86_400_000;

/**
 * Calendar-day difference `expiresAt - today` (both already UTC-midnight
 * date-only values) — positive means "still ahead", 0 means "expires
 * today", negative means "already expired that many days ago". Extracted
 * (story 6.3, Dev Notes: "riusare la stessa aritmetica ... senza duplicare
 * la formula") so `computeExpiryStatus` below and the alert job's threshold
 * calculation share the exact same day-boundary arithmetic — there must
 * never be a second implementation of it.
 */
export function daysUntilUtc(expiresAt: Date, today: Date): number {
  return Math.round((expiresAt.getTime() - today.getTime()) / MS_PER_DAY);
}

/**
 * Computes the calendar-day difference `expiresAt - today` (both already
 * UTC-midnight date-only values) and maps it to `ok` / `expiring` /
 * `expired` per the boundaries documented above.
 */
export function computeExpiryStatus(expiresAt: Date, today: Date): ExpiryStatus {
  const daysRemaining = daysUntilUtc(expiresAt, today);

  if (daysRemaining < 0) {
    return 'expired';
  }
  if (daysRemaining <= EXPIRY_WARNING_DAYS) {
    return 'expiring';
  }
  return 'ok';
}

/**
 * Finer-grained urgency tier (0-4), extracted from
 * `dashboard/expiries/scadenze-console.tsx` (story 12.11) so story 12.12's
 * `ScadenzeWidget` and Overview KPI can share the EXACT same
 * `daysUntilUtc`/soglie boundaries — there must never be a second
 * implementation (Contesto: `tierOf`, `ScadenzeView.jsx:12-20`). 0 = scaduto,
 * 1 = entro 7 giorni, 2 = entro 30, 3 = entro 60, 4 = valido oltre 60.
 */
export type ExpiryTier = 0 | 1 | 2 | 3 | 4;

export function tierOf(daysUntil: number): ExpiryTier {
  if (daysUntil < 0) return 0;
  if (daysUntil <= 7) return 1;
  if (daysUntil <= 30) return 2;
  if (daysUntil <= 60) return 3;
  return 4;
}

/**
 * Scadenza category, derived from its `ExpiryType.name` (Contesto: `catTone`/
 * `categoryOf`, `ScadenzeView.jsx`'s own heuristic) — extracted alongside
 * {@link tierOf} for the same single-implementation reason. A free-text
 * type name is bucketed by substring match: "medic..." -> Medico,
 * "licenz..." -> Licenza, everything else -> Abilitazione.
 */
export type ExpiryCategory = 'Medico' | 'Licenza' | 'Abilitazione';

export function categoryOf(typeName: string): ExpiryCategory {
  const lower = typeName.toLowerCase();
  if (lower.includes('medic')) return 'Medico';
  if (lower.includes('licenz')) return 'Licenza';
  return 'Abilitazione';
}
