import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { accountOverviewSchema } from './accounts';
import { z } from './zod-with-openapi';

// --- Flight logging with automatic charges (story 5.1, Task 4, AC 1/2/3/4) --

/** Mirrors the Prisma `FlightType` enum (story 5.1) — see the Prisma model doc for what each value means. */
export const flightTypeSchema = z.enum(['PRIVATE', 'SCHOOL', 'OTHER']);

export type FlightTypeDto = z.infer<typeof flightTypeSchema>;

/** Mirrors the Prisma `FlightStatus` enum (story 5.1) — always `REGISTERED` until story 5.3 introduces `CANCELLED`. */
export const flightStatusSchema = z.enum(['REGISTERED', 'CANCELLED']);

export type FlightStatusDto = z.infer<typeof flightStatusSchema>;

/**
 * `GET /api/v1/flights` query (story 5.4, AC 1/2/3/4): every filter is
 * optional and AND-combinable. `dateFrom`/`dateTo` bound `flightDate`
 * (`@db.Date`, date-only string comparison is safe here because `z.iso.date()`
 * guarantees the fixed-width `YYYY-MM-DD` shape — same reasoning as
 * `cashReportQuerySchema`); the `.refine` below rejects an inverted range with
 * a plain 422 `VALIDATION_ERROR` (Contesto: no custom code needed for this
 * one). `aircraftId`/`personId`/`flightType`/`status` are exact-match filters
 * — an id that does not exist simply yields zero results (a filter, never a
 * lookup, so never a 404). A non-staff actor's `personId` filter is further
 * constrained server-side (`flights.service.ts#listFlights`, AC 4): providing
 * anyone else's id is a 403, never silently ignored or narrowed.
 */
export const listFlightsQuerySchema = paginationQuerySchema
  .extend({
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    aircraftId: z.string().trim().min(1).optional(),
    personId: z.string().trim().min(1).optional(),
    flightType: flightTypeSchema.optional(),
    status: flightStatusSchema.optional(),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'dateFrom must not be after dateTo',
    path: ['dateTo'],
  });

export type ListFlightsQuery = z.infer<typeof listFlightsQuerySchema>;

/**
 * `POST /api/v1/flights` body (story 5.1, AC 1/2/3). EXACTLY ONE of
 * `minutes` (a direct duration) or the `hourMeterStart`/`hourMeterEnd` pair
 * (observed readings — the service derives `minutes = end - start`) must be
 * given; Zod has no native XOR so the `superRefine` below enforces it with
 * targeted messages. `instructorPersonId` is resolved server-side to an
 * ACTIVE `InstructorProfile` (`flights.service.ts`) — never trusted as an
 * `InstructorProfile.id` directly (consistent with
 * `.../people/{id}/instructor-rates`). `landings`/`notes` are optional.
 */
export const registerFlightSchema = z
  .object({
    aircraftId: z.string().min(1),
    personId: z.string().min(1),
    instructorPersonId: z.string().min(1).nullish(),
    flightDate: z.iso.date(),
    flightType: flightTypeSchema,
    // Capped at 1440 (24h) — a single flight cannot plausibly last longer
    // (same defense-in-depth cap philosophy as `hourMeterMinutes`).
    minutes: z.number().int().min(1).max(1440).optional(),
    hourMeterStart: z.number().int().min(0).max(2_147_483_647).optional(),
    hourMeterEnd: z.number().int().min(0).max(2_147_483_647).optional(),
    landings: z.number().int().min(0).max(500).nullish(),
    notes: z.string().trim().min(1).max(1000).nullish(),
  })
  .superRefine((value, ctx) => {
    const hasMinutes = value.minutes !== undefined;
    const hasStart = value.hourMeterStart !== undefined;
    const hasEnd = value.hourMeterEnd !== undefined;
    const hasAnyHourMeter = hasStart || hasEnd;

    if (hasMinutes && hasAnyHourMeter) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either minutes or the hourMeterStart/hourMeterEnd pair, not both.',
        path: ['minutes'],
      });
      return;
    }

    if (!hasMinutes && !hasAnyHourMeter) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either minutes or the hourMeterStart/hourMeterEnd pair.',
        path: ['minutes'],
      });
      return;
    }

    if (hasAnyHourMeter) {
      if (!hasStart || !hasEnd) {
        ctx.addIssue({
          code: 'custom',
          message: 'hourMeterStart and hourMeterEnd must both be provided together.',
          path: ['hourMeterEnd'],
        });
        return;
      }
      if (value.hourMeterEnd! <= value.hourMeterStart!) {
        ctx.addIssue({
          code: 'custom',
          message: 'hourMeterEnd must be strictly greater than hourMeterStart.',
          path: ['hourMeterEnd'],
        });
        return;
      }
      if (value.hourMeterEnd! - value.hourMeterStart! > 1440) {
        ctx.addIssue({
          code: 'custom',
          message: 'The duration derived from hourMeterStart/hourMeterEnd must not exceed 1440 minutes (24h).',
          path: ['hourMeterEnd'],
        });
      }
    }
  });

export type RegisterFlightInput = z.infer<typeof registerFlightSchema>;

/**
 * One package's contribution to a flight's breakdown (story 5.2, AC 1/2) —
 * documentation only, mirroring `flights.service.ts`'s
 * `FlightPackageConsumptionItem`. `typeName` is denormalized (the
 * `PackageType.name` at read time) so the UI never needs a second
 * round-trip to label the row.
 */
export const flightPackageConsumptionSchema = z.object({
  hourPackageId: z.string(),
  typeName: z.string(),
  minutes: z.number().int().positive(),
});

export type FlightPackageConsumptionDto = z.infer<typeof flightPackageConsumptionSchema>;

/**
 * The addebito breakdown carried by every flight (AC 1/2, AD-4). Documentation
 * only, mirroring `flights.service.ts`'s `FlightBreakdown` TS type.
 * `instructorRateCentsPerHour`/`instructorAmountCents` are present iff the
 * flight had an instructor; `totalAmountCents` is always the (already
 * separately rounded) sum, never a persisted column. `packageCoveredMinutes`/
 * `chargedMinutes`/`packageConsumptions` are story 5.2's consumption detail
 * (AD-6) — `packageCoveredMinutes` is 0 and `packageConsumptions` empty when
 * no eligible package existed at registration time.
 */
export const flightBreakdownSchema = z.object({
  aircraftRateCentsPerHour: z.number().int().positive(),
  aircraftAmountCents: z.number().int().nonnegative(),
  instructorRateCentsPerHour: z.number().int().positive().optional(),
  instructorAmountCents: z.number().int().nonnegative().optional(),
  packageCoveredMinutes: z.number().int().nonnegative(),
  chargedMinutes: z.number().int().nonnegative(),
  packageConsumptions: z.array(flightPackageConsumptionSchema),
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
  status: flightStatusSchema,
  minutes: z.number().int().positive(),
  hourMeterStart: z.number().int().nullable(),
  hourMeterEnd: z.number().int().nullable(),
  landings: z.number().int().nullable(),
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
 * mandatory `reason` — `.extend()` on a `superRefine`-wrapped `ZodObject`
 * preserves the underlying exactly-one-of-minutes-or-hourMeter refinement
 * (verified: zod v4's `.superRefine()` still returns an extendable
 * `ZodObject`, not a separate wrapper type).
 */
export const correctFlightSchema = registerFlightSchema.extend({
  reason: z.string().trim().min(1).max(500),
});

export type CorrectFlightInput = z.infer<typeof correctFlightSchema>;
