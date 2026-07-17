import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KPI } from '@/components/ui/kpi';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import { formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getStats } from '@/server/services/stats.service';
import { ReportsConsole, type ReportsLabels } from './reports-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
};

/** `YYYY-MM` -> a locale-appropriate short month label (e.g. "Lug"/"Jul") for the chart x-axis, UTC-parsed (a series bucket is already a Rome CALENDAR month, no further timezone conversion needed to just NAME it). */
function shortMonthLabel(yyyymm: string, locale: 'it' | 'en'): string {
  const [year, month] = yyyymm.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const raw = new Intl.DateTimeFormat(locale === 'en' ? 'en-IE' : 'it-IT', { month: 'short', timeZone: 'UTC' }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace('.', '');
}

/**
 * Statistiche / reports (epic 12, story 12.10) — AirOps-native, port of
 * `docs/design-reference/airops/src/ReportsView.jsx`. `finance.manage` only
 * (ADMIN+STAFF, same perimeter as `/dashboard/billing`). The page itself
 * only ever requests the CURRENT period (`ref` defaults server-side) — the
 * `?ref=` history support lives in the API for now (ratifica utente 3), no
 * UI picker for it in this story.
 */
export default async function ReportsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
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

  const isYear = sp.period !== 'month';
  const period: 'month' | 'year' = isYear ? 'year' : 'month';

  const stats = await getStats(actor, { period });

  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const intlLocale = displayLocale === 'en' ? 'en-IE' : 'it-IT';
  const t = await getTranslations('ReportsPage');

  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric' }).format(now);
  const yearLabel = t('periodToggle.year', { year: now.getFullYear() });
  const periodLabel = isYear ? yearLabel : monthLabel;

  const chartCount = isYear ? 12 : 6;
  const seriesLabels = stats.series.months.map((month) => shortMonthLabel(month, displayLocale));
  const transitSharePercent = new Intl.NumberFormat(intlLocale, { style: 'percent', maximumFractionDigits: 1 }).format(stats.kpis.transitShare);

  const labels: ReportsLabels = {
    charts: {
      revenue: { title: t('charts.revenue.title'), sub: t('charts.revenue.sub', { count: chartCount }) },
      hours: { title: t('charts.hours.title'), sub: t('charts.hours.sub', { count: chartCount }) },
      transits: { title: t('charts.transits.title'), sub: t('charts.transits.sub', { count: chartCount }) },
      fleet: { title: t('charts.fleet.title'), sub: t('charts.fleet.sub', { period: periodLabel }), empty: t('charts.fleet.empty') },
    },
    movementMix: {
      title: t('movementMix.title'),
      sub: t('movementMix.sub', { period: periodLabel }),
      keys: {
        SCHOOL: t('movementMix.keys.SCHOOL'),
        TOURISM: t('movementMix.keys.TOURISM'),
        AERIAL_WORK: t('movementMix.keys.AERIAL_WORK'),
        TRANSIT: t('movementMix.keys.TRANSIT'),
      },
    },
    instructors: {
      title: t('instructors.title'),
      sub: t('instructors.sub', { period: periodLabel }),
      empty: t('instructors.empty'),
      owedUnknown: t('instructors.owedUnknown'),
    },
    rankAircraft: {
      title: t('rankAircraft.title'),
      sub: t('rankAircraft.sub', { period: periodLabel }),
      metrics: { hours: t('rankAircraft.metrics.hours'), revenue: t('rankAircraft.metrics.revenue') },
      empty: t('rankAircraft.empty'),
    },
    rankPilots: {
      title: t('rankPilots.title'),
      sub: t('rankPilots.sub', { period: periodLabel }),
      metrics: { hours: t('rankPilots.metrics.hours'), spent: t('rankPilots.metrics.spent') },
      empty: t('rankPilots.empty'),
    },
  };

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { period: periodLabel })}</div>
        </div>
        <div className="segmented" title={t('periodToggle.title')}>
          <Link
            href={{ pathname: '/dashboard/reports', query: { period: 'month' } }}
            locale={locale as AppLocale}
            className={!isYear ? 'on' : ''}
            data-testid="reports-period-month"
          >
            {monthLabel}
          </Link>
          <Link
            href={{ pathname: '/dashboard/reports', query: { period: 'year' } }}
            locale={locale as AppLocale}
            className={isYear ? 'on' : ''}
            data-testid="reports-period-year"
          >
            {yearLabel}
          </Link>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label={t('kpi.revenue')} value={formatCents(stats.kpis.revenueCents, displayLocale)} />
        <KPI label={t('kpi.hours')} value={formatMinutes(stats.kpis.flightMinutes)} />
        <KPI label={t('kpi.movements')} value={stats.kpis.movements} />
        <KPI label={t('kpi.transitShare')} value={transitSharePercent} />
      </div>

      <ReportsConsole stats={stats} seriesLabels={seriesLabels} moneyLocale={displayLocale} labels={labels} />
    </main>
  );
}
