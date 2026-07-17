import { apiRoute } from '@/lib/api/handler';
import { statsQuerySchema } from '@/lib/schemas/stats';
import { getStats } from '@/server/services/stats.service';

/**
 * Thin route (AD-1) — real authorization (`finance.manage`) and every
 * aggregation stays in `stats.service.ts` (AD-5). Epic 12, story 12.10.
 */
export const GET = apiRoute({
  querySchema: statsQuerySchema,
  handle: async ({ actor, query }) => getStats(actor, query),
});
