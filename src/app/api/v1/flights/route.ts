import { apiRoute } from '@/lib/api/handler';
import { listFlightsQuerySchema, registerFlightSchema } from '@/lib/schemas/flights';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { exportFlightsXlsx } from '@/server/services/exports.service';
import { listFlights, registerFlight } from '@/server/services/flights.service';

/**
 * Thin routes (AD-1): real authorization (`flights.manage`, story 5.1 —
 * FR-14) stays in `flights.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listFlightsQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportFlightsXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listFlights(actor, query);
  },
});

// Story TD-2 (AC 5): opt-in `Idempotency-Key` header on the registration
// POST — see `people/[id]/account/top-ups/route.ts`. `PUT`/`DELETE
// /flights/{id}` (story 19.6) are NOT covered: idempotent by HTTP semantics
// (`[id]/route.ts`). A replay after a delete answers the original 201 and
// never re-creates the flight (story 19.6, D-9).
export const POST = apiRoute({
  bodySchema: registerFlightSchema,
  successStatus: 201,
  idempotency: { endpoint: 'flight-register' },
  handle: async ({ actor, body }) => registerFlight(actor, body),
});
