import { apiRoute } from '@/lib/api/handler';
import { getFlight } from '@/server/services/flights.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): real authorization/own-access scoping (story 12.3,
 * AC 6 — the detail sheet's data source) stays in `flights.service.ts`
 * (AD-5). A flight belonging to someone else answers 404, never 403 —
 * see `getFlight`'s doc-comment.
 */
export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => getFlight(actor, params.id),
});
