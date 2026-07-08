import { apiRoute } from '@/lib/api/handler';
import { correctFlightSchema, type CorrectFlightInput } from '@/lib/schemas/flights';
import { correctFlight } from '@/server/services/flights.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): real authorization/logic (`flights.manage`, story 5.3,
 * AC 2/3/4 — FR-16) stays in `flights.service.ts` (AD-5). No
 * `Idempotency-Key` (story TD-2, AC 5): the storno half of this correction
 * is already protected by `AccountMovement.reversalOfId`'s unique
 * constraint (at most one storno per flight charge, 409 on a retry) — a
 * second layer here would duplicate that protection, not add to it.
 */
export const POST = apiRoute<undefined, CorrectFlightInput, RouteParams>({
  bodySchema: correctFlightSchema,
  successStatus: 201,
  handle: async ({ actor, params, body }) => correctFlight(actor, params.id, body),
});
