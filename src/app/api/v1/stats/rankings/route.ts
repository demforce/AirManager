import { apiRoute } from '@/lib/api/handler';
import { statsRankingQuerySchema } from '@/lib/schemas/stats';
import { listStatsRanking } from '@/server/services/stats-rankings.service';

export const GET = apiRoute({
  querySchema: statsRankingQuerySchema,
  handle: async ({ actor, query }) => listStatsRanking(actor, query),
});
