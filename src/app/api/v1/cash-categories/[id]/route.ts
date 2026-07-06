import { apiRoute } from '@/lib/api/handler';
import { renameCashCategorySchema, type RenameCashCategoryInput } from '@/lib/schemas/cash';
import { deleteCashCategory, renameCashCategory } from '@/server/services/cash.service';

type RouteParams = { id: string };

export const PATCH = apiRoute<undefined, RenameCashCategoryInput, RouteParams>({
  bodySchema: renameCashCategorySchema,
  handle: async ({ actor, params, body }) => renameCashCategory(actor, params.id, body),
});

/**
 * Physical delete — ONLY when the category has never been used (story 3.4,
 * Task 1, AC 1). `deleteCashCategory` returns a clear 409 otherwise
 * (`ConflictError`, suggesting deactivation) rather than letting the
 * `CashMovement.categoryId` FK `RESTRICT` surface as a raw 500.
 */
export const DELETE = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => {
    await deleteCashCategory(actor, params.id);
    return { ok: true };
  },
});
