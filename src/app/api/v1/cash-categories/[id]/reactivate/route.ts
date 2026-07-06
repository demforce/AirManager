import { apiRoute } from '@/lib/api/handler';
import { reactivateCashCategory } from '@/server/services/cash.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => {
    await reactivateCashCategory(actor, params.id);
    return { ok: true };
  },
});
