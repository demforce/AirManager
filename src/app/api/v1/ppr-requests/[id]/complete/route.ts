import { apiRoute } from '@/lib/api/handler';
import { completePprRequestSchema, type CompletePprRequestInput } from '@/lib/schemas/ppr';
import { completePprRequest } from '@/server/services/ppr.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): `ppr.manage` — real authorization stays in
 * `ppr.service.ts` (AD-5). Body `{ landingFeeCents }` (AC 1, 0 admitted — a
 * waived fee). `idempotency` (TD-2: this POST creates a `CashMovement` when
 * `landingFeeCents > 0` — a monetary side effect, same rationale as the
 * approve/reject routes' outcome email): a network retry must replay the
 * FIRST response rather than risk a second landing-fee movement.
 */
export const POST = apiRoute<undefined, CompletePprRequestInput, RouteParams>({
  bodySchema: completePprRequestSchema,
  idempotency: { endpoint: 'ppr-complete' },
  handle: async ({ actor, params, body }) => completePprRequest(actor, params.id, body),
});
