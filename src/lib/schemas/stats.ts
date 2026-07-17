import { z } from './zod-with-openapi';

/**
 * `GET /api/v1/stats` query (epic 12, story 12.10). `period` picks the KPI
 * window's granularity (`month`/`year`) — REQUIRED, no default (the UI
 * always sends one, same convention as `cashReportQuerySchema`'s mandatory
 * `from`/`to`). `ref` is the OPTIONAL anchor month (`YYYY-MM`, Europe/Rome
 * calendar), defaulting to the current Rome month in the service
 * (`stats.service.ts#getStats`) — never resolved here, this schema only
 * validates SHAPE (ratifica utente 3: historical `ref` is fully supported;
 * a FUTURE `ref` is rejected as a 422 by the service, a semantic check that
 * needs "now", not a Zod concern).
 */
export const statsQuerySchema = z.object({
  period: z.enum(['month', 'year']),
  ref: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ref must be YYYY-MM')
    .optional(),
});

export type StatsQuery = z.infer<typeof statsQuerySchema>;

/**
 * Top-line KPIs (AC 1) — `movements` = COUNT of REGISTERED flights + COUNT
 * of COMPLETED PPR transits in the window (ratifica utente 1: a transit is
 * counted ONCE, as a PPR, never re-derived from a takeoff/landing pair).
 * `transitShare` is a 0..1 FRACTION (transits / movements, `0` when
 * `movements` is `0`) — formatting to a percentage is presentation-only,
 * done in the UI (AD-2 convention: the wire never carries a formatted
 * string). Deliberately NO `fleetUtilization` (ratifica utente 2 — arrives
 * in story 12.11 once the "finestra prenotabile" settings exist).
 */
export const statsKpisSchema = z.object({
  revenueCents: z.number().int(),
  flightMinutes: z.number().int(),
  movements: z.number().int(),
  transitShare: z.number(),
});

/**
 * Rolling monthly series (AC 1) — `months` are `YYYY-MM` labels, ASCENDING,
 * ending at `ref` inclusive: 6 points for `period=month`, 12 for
 * `period=year` (both rolling windows, matching the prototype's own
 * `months.slice(-chartN)` — NEVER calendar-year-aligned for `period=year`,
 * that alignment only applies to the KPI window itself). The three data
 * arrays are parallel to `months` (same length, same order).
 */
export const statsSeriesSchema = z.object({
  months: z.array(z.string()),
  revenueCents: z.array(z.number().int()),
  flightMinutes: z.array(z.number().int()),
  transitMovements: z.array(z.number().int()),
});

/**
 * Per-aircraft utilization/revenue row (AC 1) — one entry per OPERATIONAL,
 * non-archived aircraft (ratifica utente 2's definition), REGARDLESS of
 * whether it flew in the window (`minutes`/`revenueCents` default to `0`).
 * `revenueCents` is the AIRCRAFT-component charge only (never the
 * instructor's), the "doppia nozione" the ratifica calls out versus the
 * ledger-based `kpis.revenueCents`.
 */
export const statsFleetItemSchema = z.object({
  registration: z.string(),
  minutes: z.number().int(),
  revenueCents: z.number().int(),
});

/** Movement composition key (ratifica utente 1) — the 3 real `FlightType` values plus `TRANSIT` (a PPR `COMPLETED`, never a `Flight` row). */
export const statsMovementMixKeySchema = z.enum(['SCHOOL', 'TOURISM', 'AERIAL_WORK', 'TRANSIT']);

export const statsMovementMixItemSchema = z.object({
  key: statsMovementMixKeySchema,
  count: z.number().int(),
});

/**
 * Per-instructor row (AC 1) — `minutes` = SUM over SCHOOL flights in the
 * window, computed for ANY period (ratifica utente 3). `owedCents` is
 * `null` unless `ref` is the CURRENT period (the compensation summary's
 * `owedMtd`/`owedYtd` are only meaningful "as of now") — the UI renders "—".
 */
export const statsInstructorItemSchema = z.object({
  name: z.string(),
  minutes: z.number().int(),
  owedCents: z.number().int().nullable(),
});

/** Top-10-by-minutes pilot row (AC 1) — `spentCents` is the FLIGHT-charge total (aircraft + instructor component), the pilot's real spend, distinct from the ledger-based `kpis.revenueCents`. */
export const statsTopPilotItemSchema = z.object({
  name: z.string(),
  minutes: z.number().int(),
  spentCents: z.number().int(),
});

export const statsResponseSchema = z.object({
  kpis: statsKpisSchema,
  series: statsSeriesSchema,
  fleet: z.array(statsFleetItemSchema),
  movementMix: z.array(statsMovementMixItemSchema),
  instructors: z.array(statsInstructorItemSchema),
  topPilots: z.array(statsTopPilotItemSchema),
});

export type StatsResponseDto = z.infer<typeof statsResponseSchema>;
