import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExportButton } from '@/components/export-button';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { formatCents } from '@/lib/money';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getAccountOverview, listAccountMovements } from '@/server/services/accounts.service';
import { ForbiddenError, NotFoundError } from '@/server/services/errors';
import { getPerson } from '@/server/services/people.service';
import { AccountStatementTable } from './account-statement-table';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;

/**
 * The full, paginated "estratto conto" (story 3.2, AC 1/2) — the drill-down
 * behind `AccountPanel`'s 5-entry preview (story 3.1). Reachable by
 * `people.read` (staff/admin, any person) or "own" access — `self.read`
 * plus a matching `actor.personId` (same rule as the scheda persona, story
 * 2.3, AC 2). The redirect below is defense in depth only (AD-5):
 * `getAccountOverview`/`listAccountMovements` re-check the very same rule.
 */
export default async function AccountStatementPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  const isOwnAccess = hasPermission(actor, 'self.read') && actor.personId === id;
  if (!hasPermission(actor, 'people.read') && !isOwnAccess) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);

  let person;
  let overview;
  let statement;
  try {
    person = await getPerson(actor, id);
    overview = await getAccountOverview(actor, id);
    statement = await listAccountMovements(actor, id, { page, pageSize: PAGE_SIZE });
    // Clamp an out-of-range ?page to the last real page (review 3.2 F1):
    // otherwise a hand-edited URL shows a misleading "no movements" table
    // with no nav rendered to get back (totalPages guards the nav block).
    const lastPage = Math.max(1, Math.ceil(statement.total / PAGE_SIZE));
    if (page > lastPage) {
      page = lastPage;
      statement = await listAccountMovements(actor, id, { page, pageSize: PAGE_SIZE });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    // Can't fire today (the page-level check above mirrors the service
    // rule, same as story 2.3's person-detail page) — kept as defense in
    // depth (AD-5) should the two ever diverge.
    if (error instanceof ForbiddenError) {
      redirect({ href: '/dashboard', locale });
      return;
    }
    throw error;
  }

  // `people.read` gates the "registrato da" column (AC 2's operational
  // detail for staff) — the service already omits `actorEmail` from the
  // wire payload for anyone without it (AD-5: it is the real guardian), this
  // only decides whether to render an extra column.
  const showActor = hasPermission(actor, 'people.read');
  // Story 3.3: `finance.manage` gates the "Registra rettifica" actions —
  // the UI hides, `recordAdjustment`'s own `authorize()` is the guardian (AD-5).
  const canManageFinance = hasPermission(actor, 'finance.manage');
  // Money must follow the page locale (review 3.1 M1 — mandatory), same
  // pattern as `AccountPanel`.
  const moneyLocale = locale === 'en' ? ('en' as const) : ('it' as const);
  const t = await getTranslations('AccountStatementPage');
  const tExport = await getTranslations('Export');
  const totalPages = Math.max(1, Math.ceil(statement.total / PAGE_SIZE));

  // Story 10.1 (AC 1/5) — this view has no filters beyond pagination
  // (ignored by the export), so the href is just the endpoint + format/locale.
  const exportHref = buildExportHref(`/api/v1/people/${id}/account/movements`, {}, locale);
  // Story 10.2 (AC 5) — dedicated PDF route, same "no filters" shape.
  const exportPdfHref = buildPdfExportHref(`/api/v1/people/${id}/account/pdf`, {}, locale);

  function pageHref(targetPage: number) {
    return { pathname: `/dashboard/people/${id}/account`, query: { page: targetPage } };
  }

  return (
    // Story 12.13 review (F1): this legacy Tailwind page is light-only by
    // design (ratifica 3 — kept alongside `people/{id}`, not ported to
    // AirOps). It used to inherit a light backdrop from the now-removed
    // `LegacyBackdrop` (`dashboard/layout.tsx`'s `.main` is dark in dark
    // theme, and the fixed `#111111`/`#2F3437` text below would go
    // dark-on-dark without this). Same colors as that shim.
    <main className="flex-1 px-6 py-16 sm:px-16" style={{ background: '#FBFBFA', color: '#2F3437' }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
              {person.lastName} {person.firstName}
            </h1>
            <p data-testid="account-statement-balance" className="mt-3 text-2xl font-medium text-[#111111]">
              {overview.account ? formatCents(overview.balanceCents, moneyLocale) : t('noAccount')}
            </p>
          </div>
          <Link
            href={`/dashboard/people/${id}`}
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToPerson')}
          </Link>
        </div>

        <div className="mt-10 flex justify-end gap-3">
          <ExportButton href={exportHref} label={tExport('button')} testId="account-statement-export-button" />
          <ExportButton href={exportPdfHref} label={tExport('buttonPdf')} testId="account-statement-export-pdf-button" />
        </div>

        <div className="mt-4">
          <AccountStatementTable
            personId={id}
            rows={statement.items}
            showActor={showActor}
            canManageFinance={canManageFinance}
            moneyLocale={moneyLocale}
            labels={{
              date: t('table.date'),
              type: t('table.type'),
              description: t('table.description'),
              amount: t('table.amount'),
              recordedBy: t('table.recordedBy'),
              actions: t('table.actions'),
              noValue: t('table.noValue'),
              empty: t('table.empty'),
              movementType: {
                topUp: t('movementType.topUp'),
                adjustment: t('movementType.adjustment'),
                packagePurchase: t('movementType.packagePurchase'),
                flightCharge: t('movementType.flightCharge'),
                flightChargeReversal: t('movementType.flightChargeReversal'),
              },
              // `t.raw`: these carry a literal `{date}` placeholder the CLIENT
              // fills in (the original movement's date lives in the row data)
              // — `t()` would fail on the missing ICU value server-side.
              adjustmentOfDate: t.raw('adjustmentBadge.ofDate') as string,
              adjustmentLinked: t('adjustmentBadge.linked'),
              reversalOfDate: t.raw('reversalBadge.ofDate') as string,
              reversalLinked: t('reversalBadge.linked'),
            }}
            adjustmentLabels={{
              action: t('adjustments.action'),
              rowAction: t('adjustments.rowAction'),
              title: t('adjustments.title'),
              // Same `t.raw` rationale as `adjustmentOfDate` above.
              linkedTo: t.raw('adjustments.linkedTo') as string,
              amount: t('adjustments.amount'),
              amountHint: t('adjustments.amountHint'),
              reason: t('adjustments.reason'),
              submit: t('adjustments.submit'),
              cancel: t('adjustments.cancel'),
              invalidAmount: t('adjustments.invalidAmount'),
              requiredReason: t('adjustments.requiredReason'),
              conflictError: t('adjustments.conflictError'),
              genericError: t('adjustments.genericError'),
              success: t('adjustments.success'),
            }}
          />
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-[#787774]">
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
              }`}
            >
              ←
            </Link>
            <span>
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
              }`}
            >
              →
            </Link>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
