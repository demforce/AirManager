import { apiRoute } from '@/lib/api/handler';
import { setOutOfServiceSchema, type SetOutOfServiceInput } from '@/lib/schemas/aircraft';
import { setOutOfService } from '@/server/services/aircraft.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, SetOutOfServiceInput, RouteParams>({
  bodySchema: setOutOfServiceSchema,
  handle: async ({ actor, params, body }) => setOutOfService(actor, params.id, body.reason),
});
