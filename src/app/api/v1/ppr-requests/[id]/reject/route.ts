import { apiRoute } from '@/lib/api/handler';
import { rejectPprRequestSchema, type RejectPprRequestInput } from '@/lib/schemas/ppr';
import { rejectPprRequest, toPprRequestDto } from '@/server/services/ppr.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): `ppr.manage` — real authorization stays in
 * `ppr.service.ts` (AD-5). Body `{ reason }`, mandatory (AC 2). `idempotency`
 * (story TD-2, same rationale as the approve route's sibling): the outcome
 * email is an external effect, so a network retry must replay the first
 * response instead of re-deciding.
 */
export const POST = apiRoute<undefined, RejectPprRequestInput, RouteParams>({
  bodySchema: rejectPprRequestSchema,
  idempotency: { endpoint: 'ppr-reject' },
  handle: async ({ actor, params, body }) => toPprRequestDto(await rejectPprRequest(actor, params.id, body.reason)),
});
