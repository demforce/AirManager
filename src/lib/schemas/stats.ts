import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
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
 * Top-line KPIs (AC 1) — `movements` = COUNT of flights in the
 * window (ratifica utente 1: counted ONCE, never re-derived from a
 * takeoff/landing pair).
 *
 * `fleetUtilization` (story 12.11, AC 6 — closes ratifica utente 2 from
 * story 12.10): flown hours in the KPI window / available hours (`(closeTime
 * - openTime) hours × days in the window × OPERATIONAL non-archived
 * aircraft`) — a 0..1-ish FRACTION (can exceed 1 if the fleet flew more
 * than its nominal window, e.g. after-hours flights once `sched.*` is
 * configured). `null` whenever `sched.openTime`/`sched.closeTime` are not
 * configured OR there is no OPERATIONAL aircraft to divide by (Contesto: "no
 * dati finti") — the UI OMITS the 4th KPI card entirely in that case, never
 * shows a `0%`.
 */
export const statsKpisSchema = z.object({
  revenueCents: z.number().int(),
  flightMinutes: z.number().int(),
  movements: z.number().int(),
  fleetUtilization: z.number().nullable(),
});

/**
 * Rolling monthly series (AC 1) — `months` are `YYYY-MM` labels, ASCENDING,
 * ending at `ref` inclusive: 6 points for `period=month`, 12 for
 * `period=year` (both rolling windows, matching the prototype's own
 * `months.slice(-chartN)` — NEVER calendar-year-aligned for `period=year`,
 * that alignment only applies to the KPI window itself). The two data
 * arrays are parallel to `months` (same length, same order).
 */
export const statsSeriesSchema = z.object({
  months: z.array(z.string()),
  revenueCents: z.array(z.number().int()),
  flightMinutes: z.array(z.number().int()),
});

/** Movement composition key (ratifica utente 1) — the 2 real `FlightType` values (story 19.5). */
export const statsMovementMixKeySchema = z.enum(['SCHOOL', 'TOURISM']);

export const statsMovementMixItemSchema = z.object({
  key: statsMovementMixKeySchema,
  count: z.number().int(),
});

export const STATS_RANKING_PREVIEW_SIZE = 8;

export const statsRankingKeySchema = z.enum(['fleet-hours', 'fleet-revenue', 'instructor-hours', 'pilot-hours', 'pilot-spent']);
export type StatsRankingKey = z.infer<typeof statsRankingKeySchema>;

export const statsRankingQuerySchema = statsQuerySchema.extend(paginationQuerySchema.shape).extend({
  rank: statsRankingKeySchema,
  pageSize: paginationQuerySchema.shape.pageSize.default(STATS_RANKING_PREVIEW_SIZE),
});

export type StatsRankingQuery = z.infer<typeof statsRankingQuerySchema>;

export const statsRankingItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  minutes: z.number().int(),
  /** Fleet revenue, pilot spend, or currently owed compensation, depending on the ranking. */
  cents: z.number().int().nullable(),
});

export const statsRankingResponseSchema = paginatedResponseSchema(statsRankingItemSchema).extend({
  ref: z.string(),
  period: statsQuerySchema.shape.period,
});

export type StatsRankingResponseDto = z.infer<typeof statsRankingResponseSchema>;

export const statsRankingPreviewSchema = z.object({
  items: z.array(statsRankingItemSchema).max(STATS_RANKING_PREVIEW_SIZE),
  total: z.number().int().nonnegative(),
});

export const statsResponseSchema = z.object({
  referenceMonth: z.string(),
  kpis: statsKpisSchema,
  series: statsSeriesSchema,
  movementMix: z.array(statsMovementMixItemSchema),
  rankings: z.object({
    fleetHours: statsRankingPreviewSchema,
    fleetRevenue: statsRankingPreviewSchema,
    instructorHours: statsRankingPreviewSchema,
    pilotHours: statsRankingPreviewSchema,
    pilotSpent: statsRankingPreviewSchema,
  }),
});

export type StatsResponseDto = z.infer<typeof statsResponseSchema>;
