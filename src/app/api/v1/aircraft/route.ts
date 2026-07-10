import { apiRoute } from '@/lib/api/handler';
import { createAircraftSchema, listAircraftQuerySchema } from '@/lib/schemas/aircraft';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { createAircraft, listAircraft } from '@/server/services/aircraft.service';
import { exportAircraftXlsx } from '@/server/services/exports.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. All
 * authorization still lives in `aircraft.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listAircraftQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportAircraftXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listAircraft(actor, query);
  },
});

export const POST = apiRoute({
  bodySchema: createAircraftSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createAircraft(actor, body),
});
