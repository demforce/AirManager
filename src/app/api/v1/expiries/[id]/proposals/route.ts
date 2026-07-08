import { apiRoute } from '@/lib/api/handler';
import { proposeExpirySchema, type ProposeExpiryInput } from '@/lib/schemas/expiries';
import { proposeExpiryUpdate } from '@/server/services/expiries.service';

type RouteParams = { id: string };

/**
 * Thin route (AD-1): `expiries.propose.own` (the scadenza's own titolare) —
 * real authorization + own-check stays in `expiries.service.ts` (AD-5).
 * `{id}` is the `Expiry.id`.
 */
export const POST = apiRoute<undefined, ProposeExpiryInput, RouteParams>({
  bodySchema: proposeExpirySchema,
  successStatus: 201,
  handle: async ({ actor, params, body }) => proposeExpiryUpdate(actor, params.id, body),
});
