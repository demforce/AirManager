import { apiRoute } from '@/lib/api/handler';
import { listFlightsQuerySchema } from '@/lib/schemas/flights';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportFlightsPdf } from '@/server/services/exports.service';

/**
 * Dedicated PDF route (story 10.2, AC 2/3 — spine :105). Reuses the SAME
 * query schema as `GET /api/v1/flights` (own/staff filters + `locale`) —
 * `page`/`pageSize`/`format`, also present on that schema, are simply
 * ignored here (`exportFlightsPdf` always re-pages internally, same as the
 * xlsx export). Real authorization stays in `flights.service.ts#listFlights`
 * (AD-5).
 */
export const GET = apiRoute({
  querySchema: listFlightsQuerySchema,
  handle: async ({ actor, query }) => {
    const { buffer, filename } = await exportFlightsPdf(actor, query);
    return pdfResponse(buffer, filename);
  },
});
