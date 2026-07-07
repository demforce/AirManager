import { apiRoute } from '@/lib/api/handler';
import { createAircraftRateSchema, type CreateAircraftRateInput } from '@/lib/schemas/aircraft';
import { createAircraftRate, listAircraftRates } from '@/server/services/rates.service';

type RouteParams = { id: string };

/**
 * Thin routes (AD-1) — real authorization (`settings.manage` for POST,
 * `aircraft.manage` for GET) stays in `rates.service.ts` (AD-5), same
 * pattern as `.../hour-meter-adjustments`.
 */
export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => listAircraftRates(actor, params.id),
});

export const POST = apiRoute<undefined, CreateAircraftRateInput, RouteParams>({
  bodySchema: createAircraftRateSchema,
  successStatus: 201,
  handle: async ({ actor, params, body }) => createAircraftRate(actor, params.id, body),
});
