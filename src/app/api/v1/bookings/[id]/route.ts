import { apiRoute } from '@/lib/api/handler';
import { updateBookingSchema, type UpdateBookingInput } from '@/lib/schemas/bookings';
import { updateBooking } from '@/server/services/bookings.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): real authorization/business rules stay in
 * `bookings.service.ts` (AD-5, story 7.3). `bookings.manage.any` moves any
 * booking, `bookings.manage.own` moves only the actor's own (person or
 * indicated instructor) — see `updateBooking`'s doc-comment for the full
 * matrix.
 */
export const PATCH = apiRoute<undefined, UpdateBookingInput, RouteParams>({
  bodySchema: updateBookingSchema,
  handle: async ({ actor, params, body }) => updateBooking(actor, params.id, body),
});
