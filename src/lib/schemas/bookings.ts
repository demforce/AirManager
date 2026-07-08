import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
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
 * bookings). `instructorProfileId`, when present, is resolved/validated
 * server-side (`bookings.service.ts`) — never trusted as-is. `notes` is
 * capped at 500 chars, same convention as `registerExpirySchema`.
 */
export const createBookingSchema = z
  .object({
    aircraftId: z.string().min(1),
    personId: z.string().min(1),
    instructorProfileId: z.string().min(1).optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.endsAt > value.startsAt, { message: 'endsAt must be strictly after startsAt', path: ['endsAt'] });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * `GET /api/v1/bookings` query (AC 1, FR-19 anticipated to its minimum).
 * `from`/`to` use the SAME semi-open semantics as the overlap check
 * (`bookings.service.ts#listBookings`'s doc-comment): `from` matches a
 * booking whose `endsAt` is strictly after it, `to` matches a booking whose
 * `startsAt` is strictly before it — every filter optional and
 * AND-combinable, same pattern as `listFlightsQuerySchema`.
 */
export const listBookingsQuerySchema = paginationQuerySchema.extend({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  aircraftId: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

/**
 * One entry of `GET /api/v1/bookings` (AC 1). Mirrors
 * `bookings.service.ts`'s `BookingListItem` — `aircraftRegistration`/
 * `personName`/`instructorName` are denormalized at read time (never
 * snapshotted, same choice as `expiryItemSchema`'s `typeName`).
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
  createdAt: z.iso.datetime(),
});

export type BookingItemDto = z.infer<typeof bookingItemSchema>;

/** `GET /api/v1/bookings` response — the AD-8 paginated envelope (same shape as `flightListResponseSchema`). */
export const bookingListResponseSchema = paginatedResponseSchema(bookingItemSchema);

export type BookingListResponseDto = z.infer<typeof bookingListResponseSchema>;
