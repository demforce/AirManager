import { apiRoute } from '@/lib/api/handler';
import { approvePprRequest, toPprRequestDto } from '@/server/services/ppr.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): `ppr.manage` — real authorization stays in
 * `ppr.service.ts` (AD-5). No request body. `idempotency` (story TD-2,
 * closes handoff deferral 2 for the authenticated PPR mutations): the
 * decision has an external effect (the outcome email, AC 1) — a network
 * retry of this POST must replay the first response (with the SAME
 * `pprNumber`) rather than risk a second decision attempt.
 */
export const POST = apiRoute<undefined, undefined, RouteParams>({
  idempotency: { endpoint: 'ppr-approve' },
  handle: async ({ actor, params }) => toPprRequestDto(await approvePprRequest(actor, params.id)),
});
