import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

// --- Aircraft bookings (epic 7, story 7.1, FR-18) ---------------------------
// Reserves a `[startsAt, endsAt)` interval on an aircraft for a person — see
// `bookings.service.ts`'s module doc-comment for the full creation matrix
// and `Booking`'s Prisma doc-comment for the domain rationale (mirrors
// `Flight`'s shape, no status/cancellation field yet — story 7.3).

/**
 * `POST /api/v1/bookings` body (AC 1/2/3). `startsAt`/`endsAt` are FULL
 * instants (`z.iso.datetime()`, wire format ISO 8601 UTC, AD-8) — the first
 * request body in this codebase carrying real datetimes rather than
 * calendar-only dates. `.refine`: `endsAt` must be strictly AFTER `startsAt`
 * (a zero/negative-length interval is never valid, regardless of the
 * semi-open-interval overlap semantics the service applies between DIFFERENT
 * bookings) — compared as INSTANTS, not strings: `z.iso.datetime()` accepts
 * variable fractional-second precision, and a lexicographic comparison would
 * spuriously reject e.g. `10:00:00Z` → `10:00:00.500Z` ('.' sorts before
 * 'Z'). `instructorProfileId`, when present, is resolved/validated
 * server-side (`bookings.service.ts`) — never trusted as-is. `notes` is
 * capped at 500 chars, same convention as `registerExpirySchema`.
 *
 * `force`/`forceReason` (story 7.4, AC 2): a staff-only bypass of a blocking
 * expired document (`bookings.service.ts#createBooking`'s `EXPIRED_DOCUMENTS`
 * 422 — `bookings.manage.any` is checked SERVICE-side, this schema only
 * shapes the pair). The second `.refine` requires a non-empty `forceReason`
 * whenever `force` is `true` — UNCONDITIONALLY (not only when a real block
 * exists): the motivo is a property of the REQUEST, asked upfront, not
 * something the service can retroactively demand once it discovers a block.
 */
export const createBookingSchema = z
  .object({
    aircraftId: z.string().min(1),
    personId: z.string().min(1),
    instructorProfileId: z.string().min(1).optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    notes: z.string().trim().max(500).optional(),
    force: z.boolean().optional(),
    forceReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: 'endsAt must be strictly after startsAt',
    path: ['endsAt'],
  })
  .refine((value) => !value.force || (value.forceReason !== undefined && value.forceReason.length > 0), {
    message: 'forceReason is required when force is true',
    path: ['forceReason'],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * `PATCH /api/v1/bookings/{id}` body (story 7.3, AC 1/2). Every field is
 * OPTIONAL (partial PATCH) — the refine below only rejects a completely
 * empty body, same pattern as `updateExpirySchema`. `personId`/
 * `instructorProfileId` are deliberately ABSENT (Contesto: immutable —
 * changing the prenotante is a cancel + recreate, mirroring 6.2's person/
 * type immutability). `startsAt`/`endsAt` are full instants
 * (`z.iso.datetime()`, same N1-lesson caveat as `createBookingSchema`).
 * `notes` is nullable (explicit `null` clears it, `undefined`/absent leaves
 * it untouched) — same convention as `updateExpirySchema`'s `notes`.
 *
 * There is deliberately NO cross-field refine here (e.g. "if both startsAt
 * and endsAt are given, endsAt > startsAt"): a partial PATCH can change just
 * ONE of the two, so the only place that can validate the RESULTING interval
 * is `bookings.service.ts#updateBooking`, after merging against the
 * booking's current values (Dev Notes: "validazione sui valori RISULTANTI
 * dal merge").
 */
export const updateBookingSchema = z
  .object({
    aircraftId: z.string().min(1).optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

/**
 * Mirrors the Prisma `BookingStatus` enum (story 7.3; extended by the
 * approval workflow, story 12.2) — see `bookings.service.ts#transitionBooking`'s
 * doc-comment for the full transition matrix. `PENDING` is a pilot/
 * instructor's own-path starting state; `APPROVED` is staff's own starting
 * state AND the only state that occupies a slot for the overlap invariant.
 * Declared BEFORE `listBookingsQuerySchema` (below), which references it.
 */
export const bookingStatusSchema = z.enum(['PENDING', 'APPROVED', 'DENIED', 'FLOWN', 'NO_SHOW', 'CANCELLED']);

export type BookingStatusDto = z.infer<typeof bookingStatusSchema>;

/**
 * `GET /api/v1/bookings` query (AC 1, FR-19 anticipated to its minimum).
 * `from`/`to` use the SAME semi-open semantics as the overlap check
 * (`bookings.service.ts#listBookings`'s doc-comment): `from` matches a
 * booking whose `endsAt` is strictly after it, `to` matches a booking whose
 * `startsAt` is strictly before it — every filter optional and
 * AND-combinable, same pattern as `listFlightsQuerySchema`. `status` (story
 * 12.2, AC 4) is a comma-separated list (e.g. `?status=PENDING,APPROVED`) —
 * a raw HTTP query string has no native array syntax, and `apiRoute` parses
 * `searchParams` via `Object.fromEntries` (last-value-wins on a repeated
 * key), so CSV is this codebase's own convention for a multi-value filter;
 * absent, the service defaults to `APPROVED` only (`bookings.service.ts#listBookings`'s
 * doc-comment) — added ahead of its first consumer (story 12.3's UI).
 */
export const listBookingsQuerySchema = paginationQuerySchema.extend({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  aircraftId: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
  status: z.preprocess((value) => (typeof value === 'string' ? value.split(',') : value), z.array(bookingStatusSchema).min(1)).optional(),
  ...exportQuerySchema.shape,
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

/**
 * One entry of `GET /api/v1/bookings` (AC 1). Mirrors
 * `bookings.service.ts`'s `BookingListItem` — `aircraftRegistration`/
 * `personName`/`instructorName` are denormalized at read time (never
 * snapshotted, same choice as `expiryItemSchema`'s `typeName`). `status`/
 * `cancelledAt` (story 7.3, AC 2) are additive — every 7.1/7.2 consumer of
 * this DTO already ignores unknown fields, so the wire contract stays
 * backward-compatible. `forcedAt` (story 7.4, AC 2) is likewise additive —
 * `null` on every normal booking, set only when staff bypassed a real
 * blocking-expiry check; `forcedByUserId`/`forceReason` are deliberately NOT
 * exposed here (DB-only for now, Contesto) to keep this read-side DTO small.
 * `denyReason`/`decidedAt` (story 12.2, AC 6) are likewise additive — `null`
 * unless the booking was decided (approved/denied) at least once;
 * `decidedByUserId`/`closedAt`/`closedByUserId` stay DB-only, same
 * deliberate omission as `forcedByUserId`/`forceReason` above.
 */
export const bookingItemSchema = z.object({
  id: z.string(),
  aircraftId: z.string(),
  aircraftRegistration: z.string(),
  personId: z.string(),
  personName: z.string(),
  instructorProfileId: z.string().nullable(),
  instructorName: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  notes: z.string().nullable(),
  status: bookingStatusSchema,
  cancelledAt: z.iso.datetime().nullable(),
  forcedAt: z.iso.datetime().nullable(),
  denyReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type BookingItemDto = z.infer<typeof bookingItemSchema>;

/** `GET /api/v1/bookings` response — the AD-8 paginated envelope (same shape as `flightListResponseSchema`). */
export const bookingListResponseSchema = paginatedResponseSchema(bookingItemSchema);

export type BookingListResponseDto = z.infer<typeof bookingListResponseSchema>;

/**
 * One non-blocking expired document surfaced by a successful `POST
 * /api/v1/bookings` (story 7.4, AC 1) — `expiresAt` is DATE-ONLY
 * (`z.iso.date()`, the `Expiry.expiresAt` `@db.Date` convention, same as
 * `expiryItemSchema.expiresAt`), never a full instant.
 */
export const bookingExpiryWarningSchema = z.object({
  typeName: z.string(),
  expiresAt: z.iso.date(),
});

export type BookingExpiryWarningDto = z.infer<typeof bookingExpiryWarningSchema>;

/**
 * `POST /api/v1/bookings` response (story 7.4, AC 1/2) — REPLACES the bare
 * `bookingItemSchema` the 201 answered before this story (Contesto: "additivo
 * per il client" in the sense that `booking` carries everything the old
 * response did, but the envelope shape itself changes, a deliberate breaking
 * change to this one endpoint's response — `new-booking-form.tsx` and every
 * 7.1/7.3 consumer were updated in the SAME story, see the Debug Log).
 * `warnings` is always present, empty when there is nothing to warn about.
 */
export const createBookingResponseSchema = z.object({
  booking: bookingItemSchema,
  warnings: z.array(bookingExpiryWarningSchema),
});

export type CreateBookingResponseDto = z.infer<typeof createBookingResponseSchema>;

// --- Booking calendar (epic 7, story 7.2, FR-19) ----------------------------
// The calendar view's own read — deliberately UNPAGINATED (a calendar
// renders a bounded window, never "page 2"), see
// `bookings.service.ts#listCalendarBookings`'s doc-comment for the full
// range-validation rationale.

/**
 * `GET /api/v1/bookings/calendar` query (AC 1). Both `from`/`to` are
 * REQUIRED (unlike `listBookingsQuerySchema`'s optional filters). `.refine`:
 * `to` must be strictly AFTER `from`, compared as INSTANTS, not strings —
 * same lesson as `createBookingSchema`'s N1 review fix
 * (`z.iso.datetime()` accepts variable fractional-second precision, so a
 * lexicographic compare would spuriously reject mixed-precision pairs).
 * The 8-day range cap itself is enforced service-side
 * (`RANGE_TOO_WIDE`) — not duplicated here, since the schema's job is
 * shape/ordering, not the domain-specific span limit.
 */
export const calendarBookingsQuerySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), {
    message: 'to must be strictly after from',
    path: ['to'],
  });

export type CalendarBookingsQuery = z.infer<typeof calendarBookingsQuerySchema>;

/** `GET /api/v1/bookings/calendar` response — a bare array (Contesto: "un calendario non si pagina"), never the paginated envelope `bookingListResponseSchema` uses. */
export const calendarBookingsResponseSchema = z.array(bookingItemSchema);

export type CalendarBookingsResponseDto = z.infer<typeof calendarBookingsResponseSchema>;

// --- Booking approval workflow (epic 12, story 12.2) -------------------------
// PENDING/APPROVED/DENIED/FLOWN/NO_SHOW — see
// `bookings.service.ts#transitionBooking`'s doc-comment for the full matrix.

/**
 * `POST /api/v1/bookings/{id}/transition` body (AC 3/6). `to` excludes
 * `CANCELLED` (`bookingStatusSchema.exclude`) — cancelling stays
 * `POST /api/v1/bookings/{id}/cancel`'s own endpoint (story 7.3), never
 * part of this matrix. `reason` is OPTIONAL here (unlike
 * `createBookingSchema`'s `force`/`forceReason` schema-level `.refine`):
 * whether it is required depends on `to` (mandatory only for `DENIED`,
 * 422 `BOOKING_DENY_REASON_REQUIRED`) — a domain rule the SERVICE checks
 * (`bookings.service.ts#transitionBooking`), not this shape-only schema.
 */
export const transitionBookingSchema = z.object({
  to: bookingStatusSchema.exclude(['CANCELLED']),
  reason: z.string().trim().max(500).optional(),
});

export type TransitionBookingInput = z.infer<typeof transitionBookingSchema>;
