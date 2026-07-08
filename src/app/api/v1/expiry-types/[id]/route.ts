import { apiRoute } from '@/lib/api/handler';
import { updateExpiryTypeSchema, type UpdateExpiryTypeInput } from '@/lib/schemas/expiry-types';
import { deleteExpiryType, updateExpiryType } from '@/server/services/expiry-types.service';

type RouteParams = { id: string };

export const PATCH = apiRoute<undefined, UpdateExpiryTypeInput, RouteParams>({
  bodySchema: updateExpiryTypeSchema,
  handle: async ({ actor, params, body }) => updateExpiryType(actor, params.id, body),
});

/**
 * Physical delete — ONLY when the expiry type has never been used (story
 * 6.1, AC 2). `deleteExpiryType` returns a clear 409 (`ConflictError`)
 * otherwise via the `P2003` backstop (story 6.2 adds the FK this backstops
 * and an explicit pre-check). `204 No Content` — same convention as `DELETE
 * /api/v1/package-types/{id}` (story 4.3), `apiRoute()` already supports it.
 */
export const DELETE = apiRoute<undefined, undefined, RouteParams>({
  successStatus: 204,
  handle: async ({ actor, params }) => {
    await deleteExpiryType(actor, params.id);
    return undefined;
  },
});
