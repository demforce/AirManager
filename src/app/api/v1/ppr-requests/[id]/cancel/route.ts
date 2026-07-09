import { apiRoute } from '@/lib/api/handler';
import { cancelPprRequest } from '@/server/services/ppr.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): `ppr.manage` — real authorization stays in
 * `ppr.service.ts` (AD-5). No request body (AC 2: no reason, no fee).
 * `idempotency` (TD-2, same rationale as `approve`'s sibling): a network
 * retry of this POST must replay the first response rather than risk a
 * second decision attempt on the same request.
 */
export const POST = apiRoute<undefined, undefined, RouteParams>({
  idempotency: { endpoint: 'ppr-cancel' },
  handle: async ({ actor, params }) => cancelPprRequest(actor, params.id),
});
