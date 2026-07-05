import { apiRoute } from '@/lib/api/handler';
import { getAccountOverview } from '@/server/services/accounts.service';

type RouteParams = { id: string };

export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => getAccountOverview(actor, params.id),
});
