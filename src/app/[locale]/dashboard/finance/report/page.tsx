import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExportButton } from '@/components/export-button';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildPdfExportHref } from '@/lib/export-href';
import { formatCents, formatSignedCents } from '@/lib/money';
import { currentMonthRange } from '@/lib/period-presets';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getCashReport } from '@/server/services/cash.service';
import { ReportFilters } from './report-filters';
import { Card } from '@/components/ui/card';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Same hand-edited URL defense as `finance/page.tsx#sanitizeDateParam`. */
function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

/**
 * The period financial report (story 3.5, AC 1/2): a read-only aggregation
 * page over the cash ledger, reached from `/dashboard/finance`. No `?from`/
 * `?to` in the URL defaults to the CURRENT MONTH (`currentMonthRange`,
 * Europe/Rome) — the same helper the client-side preset buttons
 * (`ReportFilters`) use for "mese/trimestre/anno correnti", so the initial
 * render and a later "mese corrente" click always agree. Movement detail is
 * intentionally NOT duplicated here (Dev Notes): the "Apri nel registro"
 * link reopens the existing cash register (`/dashboard/finance`,
 * story 3.4) with `from`/`to` prefilled instead.
 */
export default async function FinancialReportPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
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

  const defaultRange = currentMonthRange();
  const from = sanitizeDateParam(fromParam) ?? defaultRange.from;
  const to = sanitizeDateParam(toParam) ?? defaultRange.to;

  const report = await getCashReport(actor, { from, to });

  const t = await getTranslations('CashReportPage');
  const tExport = await getTranslations('Export');
  // Money must follow the page locale (review 3.1 M1 — mandatory), same
  // pattern as the finance/account-statement pages.
  const moneyLocale = locale === 'en' ? ('en' as const) : ('it' as const);

  const registerHref = { pathname: '/dashboard/finance', query: { from, to } };
  // Story 10.2 (AC 5) — dedicated PDF route, same mandatory from/to period as the JSON view.
  const exportPdfHref = buildPdfExportHref('/api/v1/cash-report/pdf', { from, to }, locale);

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
              {t('kicker')}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-ink">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-mid-gray">{t('description')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ExportButton href={exportPdfHref} label={tExport('buttonPdf')} testId="cash-report-export-pdf-button" />
            <Link
              href="/dashboard/finance"
              locale={locale as AppLocale}
              className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {t('backToFinance')}
            </Link>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('filters.heading')}</h2>
          <div className="mt-4">
            <ReportFilters
              initialFilters={{ from, to }}
              labels={{
                month: t('filters.month'),
                quarter: t('filters.quarter'),
                year: t('filters.year'),
                custom: t('filters.custom'),
                from: t('filters.from'),
                to: t('filters.to'),
              }}
            />
          </div>
        </section>

        <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="cash-report-summary">
          <Card className="p-6">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{t('summary.totalIn')}</p>
            <p className="mt-2 text-2xl font-medium text-[#346538]" data-testid="cash-report-total-in">
              {formatCents(report.totalInCents, moneyLocale)}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{t('summary.totalOut')}</p>
            <p className="mt-2 text-2xl font-medium text-[#9F2F2D]" data-testid="cash-report-total-out">
              {formatCents(report.totalOutCents, moneyLocale)}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{t('summary.net')}</p>
            <p
              className={`mt-2 text-2xl font-medium ${report.netCents >= 0 ? 'text-[#346538]' : 'text-[#9F2F2D]'}`}
              data-testid="cash-report-net"
            >
              {formatSignedCents(report.netCents, moneyLocale)}
            </p>
          </Card>
          <p className="text-sm text-mid-gray sm:col-span-3" data-testid="cash-report-movement-count">
            {t('summary.movementCount')}: {report.movementCount}
          </p>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('categories.heading')}</h2>
            <Link
              href={registerHref}
              locale={locale as AppLocale}
              data-testid="cash-report-open-register"
              className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {t('openInRegister')}
            </Link>
          </div>
          <Card className="mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-left text-sm" data-testid="cash-report-categories-table">
              <thead>
                <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
                  <th className="px-5 py-3">{t('categories.name')}</th>
                  <th className="px-5 py-3">{t('categories.in')}</th>
                  <th className="px-5 py-3">{t('categories.out')}</th>
                  <th className="px-5 py-3">{t('categories.net')}</th>
                </tr>
              </thead>
              <tbody>
                {report.categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-mid-gray">
                      {t('categories.empty')}
                    </td>
                  </tr>
                ) : (
                  report.categories.map((category) => (
                    <tr key={category.categoryId} className="border-b border-hairline last:border-b-0" data-testid="cash-report-category-row">
                      <td className="px-5 py-3 align-middle font-medium text-ink">{category.categoryName}</td>
                      <td className="px-5 py-3 align-middle text-[#346538]">{formatCents(category.inCents, moneyLocale)}</td>
                      <td className="px-5 py-3 align-middle text-[#9F2F2D]">{formatCents(category.outCents, moneyLocale)}</td>
                      <td
                        className={`px-5 py-3 align-middle font-medium ${category.netCents >= 0 ? 'text-[#346538]' : 'text-[#9F2F2D]'}`}
                      >
                        {formatSignedCents(category.netCents, moneyLocale)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </section>
      </div>
    </main>
  );
}
