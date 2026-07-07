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

export const POST = apiRoute({
  bodySchema: registerFlightSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => registerFlight(actor, body),
});
