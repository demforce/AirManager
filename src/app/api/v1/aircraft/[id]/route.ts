import { apiRoute } from '@/lib/api/handler';
import { updateAircraftSchema, type UpdateAircraftInput } from '@/lib/schemas/aircraft';
import { getAircraft, updateAircraft } from '@/server/services/aircraft.service';

type RouteParams = { id: string };

export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => getAircraft(actor, params.id),
});

export const PATCH = apiRoute<undefined, UpdateAircraftInput, RouteParams>({
  bodySchema: updateAircraftSchema,
  handle: async ({ actor, params, body }) => updateAircraft(actor, params.id, body),
});
