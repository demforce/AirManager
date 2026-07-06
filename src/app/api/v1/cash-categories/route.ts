import { apiRoute } from '@/lib/api/handler';
import { createCashCategorySchema, listCashCategoriesQuerySchema } from '@/lib/schemas/cash';
import { createCashCategory, listCashCategories } from '@/server/services/cash.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. Authorization
 * stays in `cash.service.ts` (AD-5) — `GET` needs only `finance.manage`
 * (shared with the "new movement" picker), `POST` needs `settings.manage`
 * (category CRUD is admin-only configuration, story 3.4 Task 1).
 */
export const GET = apiRoute({
  querySchema: listCashCategoriesQuerySchema,
  handle: async ({ actor, query }) => listCashCategories(actor, query),
});

export const POST = apiRoute({
  bodySchema: createCashCategorySchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createCashCategory(actor, body),
});
