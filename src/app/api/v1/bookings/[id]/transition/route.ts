import { apiRoute } from '@/lib/api/handler';
import { transitionBookingSchema, type TransitionBookingInput } from '@/lib/schemas/bookings';
import { transitionBooking } from '@/server/services/bookings.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): real authorization/business rules stay in
 * `bookings.service.ts#transitionBooking` (AD-5, story 12.2). `to` excludes
 * `CANCELLED` (schema-level) — cancelling stays `POST
 * /api/v1/bookings/{id}/cancel`'s own endpoint. No idempotency (TD-2 scope
 * unchanged — not a money endpoint).
 */
export const POST = apiRoute<undefined, TransitionBookingInput, RouteParams>({
  bodySchema: transitionBookingSchema,
  handle: async ({ actor, params, body }) => transitionBooking(actor, params.id, body),
});
