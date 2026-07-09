import { apiRoute } from '@/lib/api/handler';
import { createBookingSchema, listBookingsQuerySchema, type CreateBookingInput } from '@/lib/schemas/bookings';
import { createBooking, listBookings } from '@/server/services/bookings.service';

/**
 * Thin routes (AD-1): real authorization/business rules stay in
 * `bookings.service.ts` (AD-5). GET is `self.read` (every authenticated
 * role, story 7.1's FR-19 minimum); POST enforces the own/any creation
 * matrix.
 */
export const GET = apiRoute({
  querySchema: listBookingsQuerySchema,
  handle: async ({ actor, query }) => listBookings(actor, query),
});

export const POST = apiRoute<undefined, CreateBookingInput>({
  bodySchema: createBookingSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createBooking(actor, body),
});
