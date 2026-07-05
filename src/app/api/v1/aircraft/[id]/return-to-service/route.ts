import { apiRoute } from '@/lib/api/handler';
import { returnToService } from '@/server/services/aircraft.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => returnToService(actor, params.id),
});
