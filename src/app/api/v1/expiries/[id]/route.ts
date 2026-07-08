import { apiRoute } from '@/lib/api/handler';
import { updateExpirySchema, type UpdateExpiryInput } from '@/lib/schemas/expiries';
import { deleteExpiry, updateExpiry } from '@/server/services/expiries.service';

type RouteParams = { id: string };

/** Thin route (AD-1): `expiries.manage` only — real authorization stays in `expiries.service.ts` (AD-5). */
export const PATCH = apiRoute<undefined, UpdateExpiryInput, RouteParams>({
  bodySchema: updateExpirySchema,
  handle: async ({ actor, params, body }) => updateExpiry(actor, params.id, body),
});

/** 204 No Content — same convention as `DELETE /api/v1/expiry-types/{id}`. */
export const DELETE = apiRoute<undefined, undefined, RouteParams>({
  successStatus: 204,
  handle: async ({ actor, params }) => {
    await deleteExpiry(actor, params.id);
    return undefined;
  },
});
