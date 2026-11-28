'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { StatsQuery, StatsRankingKey } from '@/lib/schemas/stats';
import { statsRankingHref } from '@/lib/stats-ranking-links';

/** The preview is already bounded by the server. Open the full ranking instead of expanding the DOM. */
export function RankedCapFoot({ shown, total, rank, period, reference, testId }: {
  shown: number;
  total: number;
  rank: StatsRankingKey;
  period: StatsQuery['period'];
  reference: string;
  testId: string;
}) {
  const t = useTranslations('ReportsPage.rankingPreview');
  if (shown >= total) return null;
  return (
    <div className="mobile-card-foot ranked-cap-foot" data-testid={testId}>
      <span className="mobile-card-count">{t('capNote', { shown, total })}</span>
      <Link className="btn" href={statsRankingHref(rank, period, reference)} data-testid={`${testId}-button`}>
        {t('showAll', { count: total - shown })}
      </Link>
    </div>
  );
}
