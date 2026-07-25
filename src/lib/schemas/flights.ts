import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { accountOverviewSchema } from './accounts';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

// --- Flight logging with automatic charges (story 5.1, Task 4, AC 1/2/3/4) --

/** Mirrors the Prisma `FlightType` enum (story 5.1; values renamed to the real-world taxonomy in story 9.4) — see the Prisma model doc for what each value means. */
export const flightTypeSchema = z.enum(['TOURISM', 'SCHOOL', 'AERIAL_WORK']);

export type FlightTypeDto = z.infer<typeof flightTypeSchema>;

/** Mirrors the Prisma `FlightStatus` enum (story 5.1) — always `REGISTERED` until story 5.3 introduces `CANCELLED`. */
export const flightStatusSchema = z.enum(['REGISTERED', 'CANCELLED']);

export type FlightStatusDto = z.infer<typeof flightStatusSchema>;

/**
 * `GET /api/v1/flights` query (story 5.4, AC 1/2/3/4; story 9.3, AC 4):
 * every filter is optional and AND-combinable. `dateFrom`/`dateTo` bound
 * `flightDate` (`@db.Date`, date-only string comparison is safe here because
 * `z.iso.date()` guarantees the fixed-width `YYYY-MM-DD` shape — same
 * reasoning as `cashReportQuerySchema`); the `.refine` below rejects an
 * inverted range with a plain 422 `VALIDATION_ERROR` (Contesto: no custom
 * code needed for this one). `aircraftId`/`personId`/`instructorPersonId`/
 * `flightType`/`status` are exact-match filters — an id that does not exist
 * simply yields zero results (a filter, never a lookup, so never a 404).
 * `instructorPersonId` is a `Person.id`, resolved server-side to the
 * `instructorProfile` relation (story 9.3's `/dashboard/flights?instructorPersonId=…`
 * drill-down from the school hour summaries). A non-staff actor's `personId`/
 * `instructorPersonId` filter is further constrained server-side
 * (`flights.service.ts#listFlights`, AC 4): providing anyone else's id is a
 * 403, never silently ignored or narrowed. `personQuery` (story 13.5, AC 7)
 * is a SEPARATE, free-text narrowing filter — a case-insensitive substring
 * match on the flight's own `person.firstName`/`lastName` (the logbook
 * console's free-text pilot filter, replacing its old native `<select>`) —
 * AND-combined with every other filter, `personId` included; it carries no
 * own-access guard (the own-access base scope already restricts the result
 * set, so it can only ever narrow further, never leak another person's row).
 */
export const listFlightsQuerySchema = paginationQuerySchema
  .extend({
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    aircraftId: z.string().trim().min(1).optional(),
    personId: z.string().trim().min(1).optional(),
    personQuery: z.string().trim().min(1).optional(),
    instructorPersonId: z.string().trim().min(1).optional(),
    flightType: flightTypeSchema.optional(),
    status: flightStatusSchema.optional(),
    ...exportQuerySchema.shape,
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'dateFrom must not be after dateTo',
    path: ['dateTo'],
  });

export type ListFlightsQuery = z.infer<typeof listFlightsQuerySchema>;

/**
 * `POST /api/v1/flights` body (story 11.1, AC 1/2/3 — replaces story 5.1's
 * minutes/hourMeter-only shape). `departureAirfield`/`arrivalAirfield`
 * (free text, AC 1 defaults them to the airfield's own name for a local
 * flight) and `takeoffAt`/`landingAt` (full instants, `z.iso.datetime()`,
 * wire format ISO 8601 UTC — AD-8, same pattern as `createBookingSchema`)
 * are the SOURCE of both `minutes` and `flightDate`, derived server-side
 * (`flights.service.ts#resolveFlightInput`) — neither is an input anymore.
 * `hourMeterStart`/`hourMeterEnd` are now informational-only (never the
 * duration source): both optional, validated as a self-consistent PAIR by
 * the service (422 `HOUR_METER_INVALID` if incomplete or
 * `end <= start`) — no schema-level cross-field refine needed since a
 * malformed pair is just as easily checked once the service has resolved
 * everything else. `takeoffs`/`landings` default to 1 AT THE SERVICE CALL
 * SITE, never via Zod's own `.default()` (lesson 10.1: a `.default()`
 * masks a caller that forgot to pass the field, `?? 1` at the point of use
 * does not). `instructorPersonId` is resolved server-side to an ACTIVE
 * `InstructorProfile` (`flights.service.ts`) — never trusted as an
 * `InstructorProfile.id` directly (consistent with
 * `.../people/{id}/instructor-rates`). `notes` is optional.
 */
export const registerFlightSchema = z.object({
  aircraftId: z.string().min(1),
  personId: z.string().min(1),
  instructorPersonId: z.string().min(1).nullish(),
  departureAirfield: z.string().trim().min(1).max(120),
  arrivalAirfield: z.string().trim().min(1).max(120),
  takeoffAt: z.iso.datetime(),
  landingAt: z.iso.datetime(),
  flightType: flightTypeSchema,
  // Dual/solo distinction on SCHOOL flights (story 9.4) — the service
  // rejects `true` on a non-SCHOOL flightType (422 `SOLO_REQUIRES_SCHOOL`).
  isSolo: z.boolean().optional().default(false),
  hourMeterStart: z.number().int().min(0).max(2_147_483_647).optional(),
  hourMeterEnd: z.number().int().min(0).max(2_147_483_647).optional(),
  takeoffs: z.number().int().min(0).max(500).optional(),
  landings: z.number().int().min(0).max(500).optional(),
  notes: z.string().trim().min(1).max(1000).nullish(),
});

export type RegisterFlightInput = z.infer<typeof registerFlightSchema>;

/**
 * The addebito breakdown carried by every flight (AC 1/2, AD-4). Documentation
 * only, mirroring `flights.service.ts`'s `FlightBreakdown` TS type.
 * `instructorRateCentsPerHour`/`instructorAmountCents` are present iff the
 * flight had an instructor; `totalAmountCents` is always the (already
 * separately rounded) sum, never a persisted column. Story 12.13 retired
 * package consumption (ratifica utente 4a) — the aircraft component is
 * always charged on the full flight duration.
 */
export const flightBreakdownSchema = z.object({
  aircraftRateCentsPerHour: z.number().int().positive(),
  aircraftAmountCents: z.number().int().nonnegative(),
  instructorRateCentsPerHour: z.number().int().positive().optional(),
  instructorAmountCents: z.number().int().nonnegative().optional(),
  totalAmountCents: z.number().int().nonnegative(),
});

export type FlightBreakdownDto = z.infer<typeof flightBreakdownSchema>;

/**
 * One entry of `GET /api/v1/flights` (AC 1/2/3, story 5.1, extended story
 * 5.4 to own-access + filters). Documentation only, mirroring
 * `flights.service.ts`'s `FlightListItem` TS type. `hourMeterStart`/
 * `hourMeterEnd` are the OBSERVATIONS recorded on this flight — never the
 * aircraft's own contaore. `actorEmail` is now CONDITIONAL (story 5.4,
 * Contesto): present only when the caller has `people.read` (staff), same
 * pattern as `AccountStatementItem` (3.2) — a pilot/student reading their own
 * registry never learns who registered the movement.
 */
export const flightListItemSchema = z.object({
  id: z.string(),
  flightDate: z.iso.date(),
  flightType: flightTypeSchema,
  /** Story 9.4 — dual/solo distinction, meaningful only when `flightType === 'SCHOOL'`. */
  isSolo: z.boolean(),
  status: flightStatusSchema,
  /** Story 11.1 — `null` on a historical (pre-11.1) flight only; required on every new registration/correction. */
  departureAirfield: z.string().nullable(),
  arrivalAirfield: z.string().nullable(),
  takeoffAt: z.iso.datetime().nullable(),
  landingAt: z.iso.datetime().nullable(),
  minutes: z.number().int().positive(),
  /** Story 11.1 — NOT NULL DEFAULT 1 on the DB; never null on the wire. */
  takeoffs: z.number().int(),
  hourMeterStart: z.number().int().nullable(),
  hourMeterEnd: z.number().int().nullable(),
  /** Story 11.1 — NOT NULL DEFAULT 1 on the DB (backfilled from historical NULL); never null on the wire anymore. */
  landings: z.number().int(),
  notes: z.string().nullable(),
  aircraft: z.object({ id: z.string(), registration: z.string() }),
  person: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }),
  instructor: z.object({ personId: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  breakdown: flightBreakdownSchema,
  actorEmail: z.string().optional(),
  createdAt: z.iso.datetime(),
  /** Story 5.3 — set together, exactly once, when `status` becomes `CANCELLED`. Both `null` while `REGISTERED`. */
  cancelledAt: z.iso.datetime().nullable(),
  cancelReason: z.string().nullable(),
  /** Story 5.3 — the ORIGINAL flight this one replaces, when this flight IS a correction. `null` for a plain registration. */
  correctionOfId: z.string().nullable(),
  /** Story 5.3 — the NEW flight that replaced THIS one (inverse relation). `null` unless this flight was corrected. */
  correctedByFlightId: z.string().nullable(),
});

export type FlightListItemDto = z.infer<typeof flightListItemSchema>;

/** `GET /api/v1/flights` response — AD-8 paginated shape. */
export const flightListResponseSchema = paginatedResponseSchema(flightListItemSchema);

export type FlightListResponseDto = z.infer<typeof flightListResponseSchema>;

/**
 * `POST /api/v1/flights` response (AC 1/2) — the created flight plus the
 * refreshed account overview (same "return the fresh overview directly"
 * pattern as `sellPackage`'s response), so the UI shows the new balance
 * without a second round-trip.
 */
export const registerFlightResponseSchema = z.object({
  flight: flightListItemSchema,
  account: accountOverviewSchema,
});

export type RegisterFlightResponseDto = z.infer<typeof registerFlightResponseSchema>;

// --- Cancellation and correction with reversal (story 5.3, Task 3, AC 1/2/3/4) --

/**
 * `POST /api/v1/flights/{id}/cancel` body (story 5.3, AC 1). `reason` is
 * mandatory (Contesto: "il motivo è OBBLIGATORIO nell'input", same convention
 * as `recordAdjustment`'s `reason` and `setOutOfServiceSchema`'s).
 */
export const cancelFlightSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CancelFlightInput = z.infer<typeof cancelFlightSchema>;

/**
 * `POST /api/v1/flights/{id}/correct` body (story 5.3, AC 2): exactly the
 * same fields as `registerFlightSchema` (Dev Notes: `registerFlightSchema`
 * itself is NEVER changed for `registerFlight`'s own input) plus the
 * mandatory `reason` — plain `.extend()`. Story 11.1 removed the former
 * minutes/hourMeter XOR `superRefine`; the only remaining cross-field
 * check on this shape (`HOUR_METER_INVALID`) lives in
 * `resolveFlightInput`, shared by both `registerFlight`/`correctFlight`.
 */
export const correctFlightSchema = registerFlightSchema.extend({
  reason: z.string().trim().min(1).max(500),
});

export type CorrectFlightInput = z.infer<typeof correctFlightSchema>;
