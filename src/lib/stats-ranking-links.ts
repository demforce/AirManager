import type { StatsQuery, StatsRankingKey } from '@/lib/schemas/stats';

export function statsRankingHref(rank: StatsRankingKey, period: StatsQuery['period'], ref?: string, page = 1) {
  return {
    pathname: '/dashboard/reports/rankings',
    query: { rank, period, ...(ref ? { ref } : {}), ...(page > 1 ? { page } : {}) },
  };
}
