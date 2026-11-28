import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { STATS_RANKING_PREVIEW_SIZE, statsRankingQuerySchema } from '@/lib/schemas/stats';
import { statsRankingHref } from '@/lib/stats-ranking-links';
import { formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { ValidationError } from '@/server/services/errors';
import { listStatsRanking } from '@/server/services/stats-rankings.service';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StatsRankingsPage({ params, searchParams }: PageProps) {
  const locale = (await params).locale === 'en' ? 'en' : 'it';
  setRequestLocale(locale);
  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'finance.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const raw = await searchParams;
  const parsed = statsRankingQuerySchema.safeParse({
    rank: raw.rank ?? 'fleet-hours',
    period: raw.period ?? 'month',
    ref: raw.ref,
    page: raw.page,
    pageSize: STATS_RANKING_PREVIEW_SIZE,
  });
  if (!parsed.success) {
    redirect({ href: '/dashboard/reports', locale });
    return;
  }
  const { rank, period } = parsed.data;
  const now = new Date();
  let result;
  try {
    result = await listStatsRanking(actor, parsed.data, now);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    redirect({ href: '/dashboard/reports', locale });
    return;
  }
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (result.page > lastPage) result = await listStatsRanking(actor, { ...parsed.data, page: lastPage }, now);
  const t = await getTranslations('StatsRankingsPage');
  const title = t(`titles.${rank}`);
  const backHref = { pathname: '/dashboard/reports', query: { period, ref: result.ref } };
  const moneyLabel = rank === 'instructor-hours' ? t('owed') : rank.startsWith('fleet-') ? t('revenue') : t('spent');

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{title}</h1>
          <p className="sub" data-testid="stats-rankings-total">{t('count', { count: result.total })} · {period === 'year' ? result.ref.slice(0, 4) : result.ref}</p>
        </div>
        <Link className="btn" href={backHref}>{t('back')}</Link>
      </div>
      <section className="card" aria-label={title}>
        <div className="card-body">
          {result.items.length === 0 ? <p data-testid="stats-rankings-empty">{t('empty')}</p> : (
            <table className="stats-rankings-table">
              <thead><tr><th scope="col">{t('label')}</th><th scope="col">{t('hours')}</th><th scope="col">{moneyLabel}</th></tr></thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.key} data-testid="stats-rankings-item" data-key={row.key}>
                    <td>{row.label}</td>
                    <td className="mono num">{formatMinutes(row.minutes)}</td>
                    <td className="mono num">{row.cents === null ? '—' : formatCents(row.cents, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {lastPage > 1 ? (
            <nav aria-label={t('pages')} className="stats-rankings-pagination">
              {result.page > 1 ? <Link className="btn" href={statsRankingHref(rank, period, result.ref, result.page - 1)}>{t('previous')}</Link> : null}
              <span className="mono" data-testid="stats-rankings-page">{t('page', { page: result.page, total: lastPage })}</span>
              {result.page < lastPage ? <Link className="btn" href={statsRankingHref(rank, period, result.ref, result.page + 1)}>{t('next')}</Link> : null}
            </nav>
          ) : null}
        </div>
      </section>
    </main>
  );
}
