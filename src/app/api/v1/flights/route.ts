import { apiRoute } from '@/lib/api/handler';
import { listFlightsQuerySchema, registerFlightSchema } from '@/lib/schemas/flights';
import { listFlights, registerFlight } from '@/server/services/flights.service';

/**
 * Thin routes (AD-1): real authorization (`flights.manage`, story 5.1 —
 * FR-14) stays in `flights.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listFlightsQuerySchema,
  handle: async ({ actor, query }) => listFlights(actor, query),
});

// Story TD-2 (AC 5): opt-in `Idempotency-Key` header on the registration
// POST — see `people/[id]/account/top-ups/route.ts`. `POST
// /flights/{id}/cancel` and `/correct` (flight storno/correction) are NOT
// covered: they are already protected by `AccountMovement.reversalOfId`'s
// existing unique constraint (at most one storno per movement, 409 on a
// retry) — a second idempotency layer there would duplicate protection
// rather than add any.
export const POST = apiRoute({
  bodySchema: registerFlightSchema,
  successStatus: 201,
  idempotency: { endpoint: 'flight-register' },
  handle: async ({ actor, body }) => registerFlight(actor, body),
});
