import { apiRoute } from '@/lib/api/handler';
import { archiveAircraft } from '@/server/services/aircraft.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => archiveAircraft(actor, params.id),
});
