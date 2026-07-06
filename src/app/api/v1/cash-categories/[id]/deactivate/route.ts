import { apiRoute } from '@/lib/api/handler';
import { deactivateCashCategory } from '@/server/services/cash.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => {
    await deactivateCashCategory(actor, params.id);
    return { ok: true };
  },
});
