import { apiRoute } from '@/lib/api/handler';
import { resendInvite } from '@/server/services/users.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => {
    await resendInvite(actor, params.id);
    return { ok: true };
  },
});
