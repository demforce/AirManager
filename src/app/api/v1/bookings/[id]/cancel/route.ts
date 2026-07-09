import { apiRoute } from '@/lib/api/handler';
import { cancelBooking } from '@/server/services/bookings.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): real authorization/business rules stay in
 * `bookings.service.ts` (AD-5, story 7.3). No body — FR-20 asks for
 * chi/quando (tracked as `cancelledAt`/`cancelledByUserId`), never a reason
 * — mirrors `POST /api/v1/flights/{id}/cancel`'s route shape, minus its
 * mandatory `reason` body.
 */
export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => cancelBooking(actor, params.id),
});
