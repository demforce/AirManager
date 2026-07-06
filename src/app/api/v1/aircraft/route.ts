import { apiRoute } from '@/lib/api/handler';
import { createAircraftSchema, listAircraftQuerySchema } from '@/lib/schemas/aircraft';
import { createAircraft, listAircraft } from '@/server/services/aircraft.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. All
 * authorization still lives in `aircraft.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listAircraftQuerySchema,
  handle: async ({ actor, query }) => listAircraft(actor, query),
});

export const POST = apiRoute({
  bodySchema: createAircraftSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createAircraft(actor, body),
});
