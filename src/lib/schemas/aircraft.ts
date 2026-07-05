import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { z } from './zod-with-openapi';

/**
 * Shared by the create/edit aircraft forms and `POST`/`PATCH /api/v1/aircraft`
 * (Consistency Conventions: "Uno schema Zod per input/output per endpoint").
 * `registration` (marche, e.g. "I-ABCD") is normalized (`trim().toUpperCase()`)
 * here so uniqueness (enforced in the service) is case-insensitive in
 * practice — deliberately no ICAO-style regex (Dev Notes: foreign
 * registrations and ultralight schemes vary too much for a rigid format).
 * `hourMeterMinutes` is an integer number of minutes (AD-2, the cardinal
 * constraint of this story) — never a decimal-hours float.
 */
export const createAircraftSchema = z.object({
  registration: z.string().trim().toUpperCase().min(1),
  type: z.string().trim().min(1),
  model: z.string().trim().min(1),
  // Capped at Postgres INTEGER max so an absurd value fails as a clean 422
  // instead of a driver overflow error → 500 (review 2.4 F2).
  hourMeterMinutes: z.number().int().min(0).max(2_147_483_647),
  notes: z.string().trim().min(1).nullish(),
});

export type CreateAircraftInput = z.infer<typeof createAircraftSchema>;

/**
 * Partial update — every field optional so a caller can patch just one.
 * Archiving/unarchiving are separate endpoints (AC 2), not part of this
 * schema — `archivedAt` is never client-settable directly.
 */
export const updateAircraftSchema = z.object({
  registration: z.string().trim().toUpperCase().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  hourMeterMinutes: z.number().int().min(0).max(2_147_483_647).optional(),
  notes: z.string().trim().min(1).nullish(),
});

export type UpdateAircraftInput = z.infer<typeof updateAircraftSchema>;

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
});

export type ListAircraftQuery = z.infer<typeof listAircraftQuerySchema>;

/**
 * Response shape of one list item (`aircraft.service.ts#AircraftListItem`).
 * Documentation only — the service's TS type remains the runtime source of
 * truth — registered in the OpenAPI registry (story 1.5 pattern). `Date`
 * fields are ISO 8601 UTC on the wire (AD-8); `hourMeterMinutes` stays an
 * integer number of minutes on the wire too (AD-2) — formatting to `H:MM`
 * is presentation-only, done in the UI.
 */
export const aircraftListItemSchema = z.object({
  id: z.string(),
  registration: z.string(),
  type: z.string(),
  model: z.string(),
  hourMeterMinutes: z.number().int().min(0),
  notes: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type AircraftListItemDto = z.infer<typeof aircraftListItemSchema>;

/** `GET /api/v1/aircraft` response — AD-8 paginated shape. */
export const aircraftListResponseSchema = paginatedResponseSchema(aircraftListItemSchema);
