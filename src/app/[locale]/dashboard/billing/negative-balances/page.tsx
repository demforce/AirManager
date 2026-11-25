import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getPathname, Link, redirect } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { NEGATIVE_BALANCES_HREF } from '@/lib/negative-balance-links';
import { negativeBalancesQuerySchema } from '@/lib/schemas/accounts';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listNegativeBalances, NEGATIVE_BALANCE_PREVIEW_SIZE } from '@/server/services/accounts.service';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
};

export default async function NegativeBalancesPage({ params, searchParams }: PageProps) {
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
  const q = typeof raw.q === 'string' ? raw.q.trim().slice(0, 120) : '';
  const query = negativeBalancesQuerySchema.safeParse({ q, page: raw.page, pageSize: NEGATIVE_BALANCE_PREVIEW_SIZE });
  let result = await listNegativeBalances(actor, query.success ? query.data : { q, page: 1, pageSize: NEGATIVE_BALANCE_PREVIEW_SIZE });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (result.page > totalPages) result = await listNegativeBalances(actor, { q, page: totalPages, pageSize: result.pageSize });
  const t = await getTranslations('NegativeBalancesPage');
  const pageHref = (page: number) => ({ pathname: NEGATIVE_BALANCES_HREF, query: { ...(q ? { q } : {}), ...(page > 1 ? { page } : {}) } });

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <p className="sub" data-testid="negative-balances-total">{t('count', { count: result.total })}</p>
        </div>
        <Link className="btn" href="/dashboard/billing">{t('back')}</Link>
      </div>
      <section className="card" aria-label={t('title')}>
        <div className="card-body">
          <form action={getPathname({ href: NEGATIVE_BALANCES_HREF, locale })} method="get" className="filter-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginBottom: 12 }}>
            <div>
              <label className="fld-label" htmlFor="negative-balance-search">{t('person')}</label>
              <input id="negative-balance-search" className="input" name="q" type="search" maxLength={120} defaultValue={q} />
            </div>
            <button className="btn primary" type="submit" style={{ minHeight: 44 }}>{t('search')}</button>
            {q ? <Link className="btn" href={NEGATIVE_BALANCES_HREF} style={{ minHeight: 44 }}>{t('clear')}</Link> : null}
          </form>
          {result.items.length === 0 ? <p data-testid="negative-balances-empty">{t('empty')}</p> : (
            <div className="negative-balances-table-wrap">
              <table className="negative-balances-table">
                <thead><tr><th scope="col">{t('person')}</th><th scope="col">{t('balance')}</th></tr></thead>
                <tbody>
                  {result.items.map((row) => (
                    <tr key={row.personId} data-testid="negative-balances-item" data-person-id={row.personId}>
                      <td><Link href={`/dashboard/people/${row.personId}`} className="negative-balances-person">{row.lastName} {row.firstName}</Link></td>
                      <td className="mono num stat-tone-bad" data-balance-cents={row.balanceCents}>{formatCents(row.balanceCents, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 ? (
            <nav aria-label={t('pages')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
              {result.page > 1 ? <Link className="btn" href={pageHref(result.page - 1)} style={{ minHeight: 44 }}>{t('previous')}</Link> : null}
              <span className="mono" data-testid="negative-balances-page">{t('page', { page: result.page, total: totalPages })}</span>
              {result.page < totalPages ? <Link className="btn" href={pageHref(result.page + 1)} style={{ minHeight: 44 }}>{t('next')}</Link> : null}
            </nav>
          ) : null}
        </div>
      </section>
    </main>
  );
}
