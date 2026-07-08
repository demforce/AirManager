import { apiRoute } from '@/lib/api/handler';
import { listPersonExpiries } from '@/server/services/expiries.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1) — real authorization (`expiries.manage` OR own-access
 * via `self.read`) stays in `expiries.service.ts` (AD-5). Person-scoped
 * (`{id}` is the `Person.id`), same nested-route shape as
 * `.../instructor-rates`/`.../packages`.
 */
export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => listPersonExpiries(actor, params.id),
});
