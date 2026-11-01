import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

/**
 * `POST /api/v1/aircraft/{id}/rates` body (story 4.1, AC 1/2), reshaped by
 * story 19.3 (R-19-e): TWO billed hourly prices, `studentPriceCents` and
 * `pilotPriceCents` — the flight takes the column of the flying person's
 * profile. Both are integer euro cents (AD-2), always > 0, capped at the
 * Postgres INTEGER max so an absurd value fails as a clean 422 instead of a
 * driver overflow error → 500 (review 2.4 F2), and BOTH are mandatory ("leave
 * empty to keep it" is a UI rule, the client fills the field with the current
 * price — D-1). `validFrom` is a calendar date only (`YYYY-MM-DD`, same
 * `z.iso.date()` pattern as `recordCashMovementSchema.effectiveDate`); the
 * service rejects one in the past (`RATE_VALID_FROM_IN_PAST`, Europe/Rome
 * calendar) and REWRITES the row already on the same `(aircraftId,
 * validFrom)` instead of answering 409 (R-19-f). Declared above
 * `createAircraftSchema` (story 14.8) so the aircraft composites can embed it
 * as an optional `rate` block — same shape reused verbatim for the standalone
 * endpoint, the composite create and the composite update.
 */
export const createAircraftRateSchema = z.object({
  studentPriceCents: z.number().int().positive().max(2_147_483_647),
  pilotPriceCents: z.number().int().positive().max(2_147_483_647),
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
  rate: createAircraftRateSchema.optional(),
});

export type CreateAircraftInput = z.infer<typeof createAircraftSchema>;

/**
 * Partial update — every field optional so a caller can patch just one.
 * Archiving/unarchiving are separate endpoints (AC 2), not part of this
 * schema — `archivedAt` is never client-settable directly. `rate` (story
 * 19.3, A17 — the editor's ONE Salva) OPTIONALLY records or rewrites a rate
 * in the SAME transaction as the identity fields
 * (`aircraft.service.ts#updateAircraft`), reusing `createAircraftRateSchema`
 * verbatim, the same block `createAircraftSchema` carries.
 */
export const updateAircraftSchema = z.object({
  registration: z.string().trim().toUpperCase().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  rate: createAircraftRateSchema.optional(),
});

export type UpdateAircraftInput = z.infer<typeof updateAircraftSchema>;

/**
 * `POST /api/v1/aircraft/{id}/out-of-service` body (story 2.5, AC 1):
 * `reason` is mandatory and non-empty — the whole point of the flag is that
 * staff records *why* the aircraft is grounded.
 *
 * `outOfServiceUntil` (story AOG-1a, P3) is the OPTIONAL expected end of the
 * grounding, `YYYY-MM-DD` (`z.iso.date()`, same wire shape as every other
 * calendar-only date in this repo, `@db.Date` at rest). Its semantics — LAST
 * grounded day, INCLUSIVE (ratifica R-AOG-a) — are written ONCE in
 * `schema.prisma`'s doc-comment on `Aircraft.outOfServiceUntil` and never
 * re-stated per surface. Omitting it is a legitimate state ("return date not
 * yet known", invariant [b]), and a date in the past is accepted (invariant
 * [a]: the field decides nothing).
 *
 * `.nullish()`, not `.optional()` (review MINOR-2): the DTO this same endpoint
 * RETURNS carries `outOfServiceUntil: string | null`, so a client (the future
 * Flutter app is a declared consumer) that reads an `Aircraft` and sends the
 * field back exactly as it read it must not get a 422 for saying `null` —
 * which is precisely what "return date not yet known" means. Same convention
 * as every other optional-AND-clearable field of this API
 * (`updatePersonSchema`'s `phone`/`address`); `null` and an omitted key are
 * stored identically by `setOutOfService`.
 */
export const setOutOfServiceSchema = z.object({
  // Length-capped for the same defense-in-depth reason the rate is
  // range-capped (review 2.4 F2 / 2.5 F3): an oversized body fails as 422.
  reason: z.string().trim().min(1).max(500),
  outOfServiceUntil: z.iso.date().nullish(),
});

export type SetOutOfServiceInput = z.infer<typeof setOutOfServiceSchema>;

/**
 * The impacted-bookings count (story AOG-1b, ratifica R-AOG-b) — the SAME
 * shape the preview, the grounding response and the persistent row all render,
 * because they all come from the SAME domain function
 * (`aog-impact.ts#computeAogImpact`, AD-1).
 *
 * The split is not cosmetic: `pending` bookings are already frozen (an approval
 * on a grounded aircraft answers 422), `approved` ones are the ones nothing in
 * the app stops — and the only ones the grounding email goes to (R-AOG-i).
 */
export const aogBookingImpactSchema = z.object({
  pending: z.number().int().min(0),
  approved: z.number().int().min(0),
  /**
   * The upper bound the count ACTUALLY used (`YYYY-MM-DD`), or `null` when the
   * window was not delimited — no date given (invariant [b]) OR a date whose
   * day had already passed, which `computeAogImpact` treats as no bound at all.
   * Every surface that puts a SENTENCE beside the number chooses it on this
   * field: deriving the window a second time from `outOfServiceUntil` is
   * exactly the drift review MAJOR-1 found ("conteggio fino al {ieri}
   * compreso" printed over a count that had counted every future booking).
   */
  effectiveUntil: z.iso.date().nullable(),
});

export type AogBookingImpactDto = z.infer<typeof aogBookingImpactSchema>;

/**
 * `GET /api/v1/aircraft/{id}/out-of-service-impact` query (story AOG-1b, AD-2)
 * — the CANDIDATE expected-return date the admin is typing, in the same
 * `YYYY-MM-DD` wire shape `setOutOfServiceSchema` accepts. Omitted means the
 * window is NOT delimited (invariant [b]), which is a different answer from
 * "delimited by today" and is why this cannot be `.default(today)`.
 */
export const outOfServiceImpactQuerySchema = z.object({
  until: z.iso.date().optional(),
});

export type OutOfServiceImpactQuery = z.infer<typeof outOfServiceImpactQuerySchema>;

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
 * fields are ISO 8601 UTC on the wire (AD-8). `status`/`statusReason` are
 * story 2.5's operational flag (AC 1).
 */
export const aircraftListItemSchema = z.object({
  id: z.string(),
  registration: z.string(),
  type: z.string(),
  model: z.string(),
  status: aircraftStatusSchema,
  statusReason: z.string().nullable(),
  /** Story AOG-1a — last GROUNDED day, INCLUSIVE (`schema.prisma`'s own doc-comment on the column is the single source of the semantics). Calendar-only `YYYY-MM-DD`, same wire convention as every other `@db.Date` in this API; `null` = "return date not yet known". */
  outOfServiceUntil: z.iso.date().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type AircraftListItemDto = z.infer<typeof aircraftListItemSchema>;

/** `GET /api/v1/aircraft` response — AD-8 paginated shape. */
export const aircraftListResponseSchema = paginatedResponseSchema(aircraftListItemSchema);

/**
 * `POST /api/v1/aircraft/{id}/out-of-service` response (story AOG-1b, AD-5).
 * The contract CHANGES here: the endpoint used to answer the bare
 * `AircraftListItem`. It now answers the aircraft under its own key PLUS the
 * advisory count — the same shape `POST /api/v1/flights` already uses for
 * `balanceAlert` (`registerFlightResponseSchema`, story 14.4), so an advisory
 * datum about a write is never smuggled into the entity DTO a client reads and
 * writes back. Declared here, after `aircraftListItemSchema`, because it
 * composes it.
 */
export const setOutOfServiceResponseSchema = z.object({
  aircraft: aircraftListItemSchema,
  impactedBookings: aogBookingImpactSchema,
});

// --- Rates (story 4.1, Task 1/2/3, AC 1/2) ----------------------------------
// `createAircraftRateSchema`/`CreateAircraftRateInput` moved above
// `createAircraftSchema` (story 14.8) — see that schema's doc-comment.

/**
 * One entry of `GET /api/v1/aircraft/{id}/rates` (story 4.1; two prices since
 * story 19.3). Documentation only, mirroring `rates.service.ts`'s
 * `AircraftRateListItem` TS type — same pattern as `aircraftListItemSchema`.
 * `actorEmail` is a display-only join over the stored `actorUserId`.
 */
export const aircraftRateItemSchema = z.object({
  id: z.string(),
  aircraftId: z.string(),
  studentPriceCents: z.number().int().positive(),
  pilotPriceCents: z.number().int().positive(),
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
