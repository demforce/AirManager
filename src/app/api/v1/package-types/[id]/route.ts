import { apiRoute } from '@/lib/api/handler';
import { updatePackageTypeSchema, type UpdatePackageTypeInput } from '@/lib/schemas/package-types';
import { deletePackageType, updatePackageType } from '@/server/services/package-types.service';

type RouteParams = { id: string };

export const PATCH = apiRoute<undefined, UpdatePackageTypeInput, RouteParams>({
  bodySchema: updatePackageTypeSchema,
  handle: async ({ actor, params, body }) => updatePackageType(actor, params.id, body),
});

/**
 * Physical delete — ONLY when the package type has never been sold (story
 * 4.3, AC 2). `deletePackageType` returns a clear 409 (`ConflictError`)
 * otherwise via the `P2003` backstop (story 4.4 adds the FK this backstops
 * and an explicit pre-check). `204 No Content` — no representation to
 * return once the resource is gone (unlike `DELETE
 * /api/v1/cash-categories/{id}`, story 3.4, which predates this convention).
 */
export const DELETE = apiRoute<undefined, undefined, RouteParams>({
  successStatus: 204,
  handle: async ({ actor, params }) => {
    await deletePackageType(actor, params.id);
    return undefined;
  },
});
