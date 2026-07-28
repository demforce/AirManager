import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

/**
 * `POST /api/v1/aircraft/{id}/rates` body (story 4.1, AC 1/2): a new
 * historicized rate. `priceCentsPerHour` is an integer number of euro cents
 * (AD-2) — an HOURLY price, always > 0, capped at the Postgres INTEGER max
 * (same defense-in-depth as `hourMeterMinutes`). `validFrom` is a calendar
 * date only (`YYYY-MM-DD`, same `z.iso.date()` pattern as
 * `recordCashMovementSchema.effectiveDate`) — two rates sharing the same
 * `(aircraftId, validFrom)` are a 409 (AC 2), never silently overwritten.
 * `dryHourlyRateCents` (story 12.5, AC 1) is OPTIONAL — the "dry" (fuel
 * excluded) rate, display-only: it never feeds pricing/flight-cost
 * computation (`rates.service.ts`/`flights.service.ts` read `priceCentsPerHour`
 * exclusively). Moved above `createAircraftSchema` (story 14.8) so the
 * latter can embed it as an optional `rate` block — same shape reused
 * verbatim for the standalone endpoint and the composite create.
 */
export const createAircraftRateSchema = z.object({
  priceCentsPerHour: z.number().int().positive().max(2_147_483_647),
  dryHourlyRateCents: z.number().int().positive().max(2_147_483_647).nullish(),
  validFrom: z.iso.date(),
});

export type CreateAircraftRateInput = z.infer<typeof createAircraftRateSchema>;

/**
 * Shared by the create/edit aircraft forms and `POST`/`PATCH /api/v1/aircraft`
 * (Consistency Conventions: "Uno schema Zod per input/output per endpoint").
 * `registration` (marche, e.g. "I-ABCD") is normalized (`trim().toUpperCase()`)
 * here so uniqueness (enforced in the service) is case-insensitive in
 * practice — deliberately no ICAO-style regex (Dev Notes: foreign
 * registrations and ultralight schemes vary too much for a rigid format).
 * `hourMeterMinutes` is an integer number of minutes (AD-2, the cardinal
 * constraint of this story) — never a decimal-hours float. `seats`/`fuelType`/
 * `based` (story 12.5, AC 1) are all additive and optional — an
 * omitted `based` falls back to the DB default (`true`, same as every
 * pre-existing row); `fuelType` is free text (the fleet editor offers a
 * closed set of common options, the column itself does not enforce one).
 * `rate` (story 14.8, AC 1/2 — "form velivolo unificato") OPTIONALLY
 * creates the aircraft's first historicized rate in the SAME request,
 * reusing `createAircraftRateSchema` verbatim — `aircraft.service.ts#createAircraft`
 * runs both writes in one `$transaction` when present (same
 * `createPersonSchema`/`createPerson` composite precedent, story 13.1), so a
 * rejected rate never leaves a half-created aircraft.
 */
export const createAircraftSchema = z.object({
  registration: z.string().trim().toUpperCase().min(1),
  type: z.string().trim().min(1),
  model: z.string().trim().min(1),
  // Capped at Postgres INTEGER max so an absurd value fails as a clean 422
  // instead of a driver overflow error → 500 (review 2.4 F2).
  hourMeterMinutes: z.number().int().min(0).max(2_147_483_647),
  notes: z.string().trim().min(1).nullish(),
  seats: z.number().int().min(0).max(100).nullish(),
  fuelType: z.string().trim().min(1).nullish(),
  based: z.boolean().optional(),
  rate: createAircraftRateSchema.optional(),
});

export type CreateAircraftInput = z.infer<typeof createAircraftSchema>;

/**
 * Partial update — every field optional so a caller can patch just one.
 * Archiving/unarchiving are separate endpoints (AC 2), not part of this
 * schema — `archivedAt` is never client-settable directly. `hourMeterMinutes`
 * is deliberately NOT part of this schema (story 2.5): after that story the
 * contaore changes ONLY via a tracked `HourMeterAdjustment`
 * (`POST /api/v1/aircraft/{id}/hour-meter-adjustments`) — allowing it here
 * too would let a generic PATCH bypass the audit trail.
 */
export const updateAircraftSchema = z.object({
  registration: z.string().trim().toUpperCase().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).nullish(),
  seats: z.number().int().min(0).max(100).nullish(),
  fuelType: z.string().trim().min(1).nullish(),
  based: z.boolean().optional(),
});

export type UpdateAircraftInput = z.infer<typeof updateAircraftSchema>;

/**
 * `POST /api/v1/aircraft/{id}/out-of-service` body (story 2.5, AC 1):
 * `reason` is mandatory and non-empty — the whole point of the flag is that
 * staff records *why* the aircraft is grounded.
 */
export const setOutOfServiceSchema = z.object({
  // Length-capped for the same defense-in-depth reason the hour meter is
  // range-capped (review 2.4 F2 / 2.5 F3): an oversized body fails as 422.
  reason: z.string().trim().min(1).max(500),
});

export type SetOutOfServiceInput = z.infer<typeof setOutOfServiceSchema>;

/**
 * `POST /api/v1/aircraft/{id}/hour-meter-adjustments` body (story 2.5, AC 2).
 * `newMinutes` is an integer number of minutes (AD-2 — same cardinal
 * constraint as `createAircraftSchema.hourMeterMinutes`); a negative delta is
 * allowed (Dev Notes: a correction can go either direction), so the floor is
 * the same Postgres-safe `[0, INT_MAX]` range rather than requiring the value
 * to increase. `reason` is mandatory, same rationale as `setOutOfServiceSchema`.
 */
export const createHourMeterAdjustmentSchema = z.object({
  newMinutes: z.number().int().min(0).max(2_147_483_647),
  // Same defense-in-depth cap as `setOutOfServiceSchema.reason`.
  reason: z.string().trim().min(1).max(500),
});

export type CreateHourMeterAdjustmentInput = z.infer<typeof createHourMeterAdjustmentSchema>;

/** `GET /api/v1/aircraft/{id}/hour-meter-adjustments` query — the shared pagination shape (story 1.5). */
export const listHourMeterAdjustmentsQuerySchema = paginationQuerySchema;

export type ListHourMeterAdjustmentsQuery = z.infer<typeof listHourMeterAdjustmentsQuerySchema>;

/**
 * One entry of the hour-meter adjustment history (AC 2: "chi, quando, delta,
 * motivo"). Documentation only, mirroring `aircraft.service.ts`'s
 * `HourMeterAdjustmentListItem` TS type — same pattern as
 * `aircraftListItemSchema`. `actorEmail` is a display-only join over
 * `actorUserId` (the stored FK) — a raw id is not a usable "chi" in the UI.
 */
export const hourMeterAdjustmentListItemSchema = z.object({
  id: z.string(),
  aircraftId: z.string(),
  actorUserId: z.string(),
  actorEmail: z.string(),
  previousMinutes: z.number().int(),
  newMinutes: z.number().int(),
  reason: z.string(),
  createdAt: z.iso.datetime(),
});

export type HourMeterAdjustmentListItemDto = z.infer<typeof hourMeterAdjustmentListItemSchema>;

/** `GET /api/v1/aircraft/{id}/hour-meter-adjustments` response — AD-8 paginated shape. */
export const hourMeterAdjustmentListResponseSchema = paginatedResponseSchema(hourMeterAdjustmentListItemSchema);

/**
 * `GET /api/v1/aircraft` query (AC 1): the shared pagination shape (story
 * 1.5) plus a case-insensitive search term (`q`, matched against
 * registration and model in the service) and the archived-inclusion toggle
 * (AC 2 — archived aircraft are hidden from the default list).
 */
export const listAircraftQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  // `z.coerce.boolean()` would treat the *string* `"false"` as truthy
  // (`Boolean("false")` is `true`) — same footgun avoided in `listPeopleQuerySchema`.
  includeArchived: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
  ...exportQuerySchema.shape,
});

export type ListAircraftQuery = z.infer<typeof listAircraftQuerySchema>;

/** Mirrors the Prisma `AircraftStatus` enum (story 2.5, AC 1). */
export const aircraftStatusSchema = z.enum(['OPERATIONAL', 'OUT_OF_SERVICE']);

export type AircraftStatusDto = z.infer<typeof aircraftStatusSchema>;

/**
 * Response shape of one list item (`aircraft.service.ts#AircraftListItem`).
 * Documentation only — the service's TS type remains the runtime source of
 * truth — registered in the OpenAPI registry (story 1.5 pattern). `Date`
 * fields are ISO 8601 UTC on the wire (AD-8); `hourMeterMinutes` stays an
 * integer number of minutes on the wire too (AD-2) — formatting to `H:MM`
 * is presentation-only, done in the UI. `status`/`statusReason` are story
 * 2.5's operational flag (AC 1).
 */
export const aircraftListItemSchema = z.object({
  id: z.string(),
  registration: z.string(),
  type: z.string(),
  model: z.string(),
  hourMeterMinutes: z.number().int().min(0),
  notes: z.string().nullable(),
  status: aircraftStatusSchema,
  statusReason: z.string().nullable(),
  seats: z.number().int().min(0).nullable(),
  fuelType: z.string().nullable(),
  based: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type AircraftListItemDto = z.infer<typeof aircraftListItemSchema>;

/** `GET /api/v1/aircraft` response — AD-8 paginated shape. */
export const aircraftListResponseSchema = paginatedResponseSchema(aircraftListItemSchema);

// --- Rates (story 4.1, Task 1/2/3, AC 1/2) ----------------------------------
// `createAircraftRateSchema`/`CreateAircraftRateInput` moved above
// `createAircraftSchema` (story 14.8) — see that schema's doc-comment.

/**
 * One entry of `GET /api/v1/aircraft/{id}/rates` (story 4.1). Documentation
 * only, mirroring `rates.service.ts`'s `AircraftRateListItem` TS type — same
 * pattern as `hourMeterAdjustmentListItemSchema`. `actorEmail` is a
 * display-only join over the stored `actorUserId`. `dryHourlyRateCents`
 * (story 12.5, AC 1) is display-only, `null` when not recorded.
 */
export const aircraftRateItemSchema = z.object({
  id: z.string(),
  aircraftId: z.string(),
  priceCentsPerHour: z.number().int().positive(),
  dryHourlyRateCents: z.number().int().positive().nullable(),
  validFrom: z.iso.date(),
  actorUserId: z.string(),
  actorEmail: z.string(),
  createdAt: z.iso.datetime(),
});

export type AircraftRateItemDto = z.infer<typeof aircraftRateItemSchema>;

/**
 * `GET /api/v1/aircraft/{id}/rates` response — a plain array, not the AD-8
 * paginated envelope (Dev Notes: no pagination for this story, defensively
 * capped at `take: 500` in the service) — same choice as
 * `cashCategoryListResponseSchema`.
 */
export const aircraftRateListResponseSchema = z.array(aircraftRateItemSchema);

export type AircraftRateListResponseDto = z.infer<typeof aircraftRateListResponseSchema>;
