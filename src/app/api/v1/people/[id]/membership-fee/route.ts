import { apiRoute, IDEMPOTENCY_KEY_HEADER } from '@/lib/api/handler';
import { chargeMembershipFeeSchema, type ChargeMembershipFeeInput } from '@/lib/schemas/membership';
import { ValidationError } from '@/server/services/errors';
import { chargeMembershipFee } from '@/server/services/membership.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1) — story 12.11, AC 7. `Idempotency-Key` is MANDATORY
 * (same pattern as `POST /api/v1/transactions`, story 12.9/TD-2's
 * "money-mutating discriminated write" convention, not the opt-in shape of
 * the plain rettifica endpoint) — a network retry of this addebito+renewal
 * gesture must replay, never double-charge. Real authorization stays in
 * `membership.service.ts` (AD-5).
 */
export const POST = apiRoute<undefined, ChargeMembershipFeeInput, RouteParams>({
  bodySchema: chargeMembershipFeeSchema,
  idempotency: { endpoint: 'membership-fee' },
  handle: async ({ actor, params, body, request }) => {
    if (!request.headers.get(IDEMPOTENCY_KEY_HEADER)) {
      throw new ValidationError(`The ${IDEMPOTENCY_KEY_HEADER} header is required for this endpoint.`, undefined, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    return chargeMembershipFee(actor, params.id, body);
  },
});
