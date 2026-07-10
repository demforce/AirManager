import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExportButton } from '@/components/export-button';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref } from '@/lib/export-href';
import { formatCents } from '@/lib/money';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getAccountOverview, listAccountMovements } from '@/server/services/accounts.service';
import { ForbiddenError, NotFoundError } from '@/server/services/errors';
import { getPerson } from '@/server/services/people.service';
import { PackagesPanel } from '../../packages-panel';
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
  const tPackages = await getTranslations('HourPackagesPanel');
  const tExport = await getTranslations('Export');
  const totalPages = Math.max(1, Math.ceil(statement.total / PAGE_SIZE));

  // Story 10.1 (AC 1/5) — this view has no filters beyond pagination
  // (ignored by the export), so the href is just the endpoint + format/locale.
  const exportHref = buildExportHref(`/api/v1/people/${id}/account/movements`, {}, locale);

  function pageHref(targetPage: number) {
    return { pathname: `/dashboard/people/${id}/account`, query: { page: targetPage } };
  }

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
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

        <div className="mt-10">
          <PackagesPanel
            personId={id}
            canSell={false}
            labels={{
              heading: tPackages('heading'),
              loadError: tPackages('loadError'),
              empty: tPackages('empty'),
              addAction: tPackages('addAction'),
              feedback: tPackages('feedback'),
              table: {
                remaining: tPackages('table.remaining'),
                price: tPackages('table.price'),
                expiresAt: tPackages('table.expiresAt'),
                noExpiry: tPackages('table.noExpiry'),
                expiredBadge: tPackages('table.expiredBadge'),
                // `t.raw`: literal `{duration}` placeholder, CLIENT-filled
                // (same pattern as account-statement-table.tsx's `adjustmentOfDate`).
                consumedNote: tPackages.raw('table.consumedNote') as string,
              },
              form: {
                title: tPackages('form.title'),
                packageType: tPackages('form.packageType'),
                noActiveTypes: tPackages('form.noActiveTypes'),
                paymentMethod: tPackages('form.paymentMethod'),
                paymentMethods: {
                  cash: tPackages('form.paymentMethods.cash'),
                  bankTransfer: tPackages('form.paymentMethods.bankTransfer'),
                  pos: tPackages('form.paymentMethods.pos'),
                },
                effectiveDate: tPackages('form.effectiveDate'),
                description: tPackages('form.description'),
                submit: tPackages('form.submit'),
                cancel: tPackages('form.cancel'),
                requiredField: tPackages('form.requiredField'),
                inactiveTypeError: tPackages('form.inactiveTypeError'),
                genericError: tPackages('form.genericError'),
              },
            }}
          />
        </div>

        <div className="mt-10 flex justify-end">
          <ExportButton href={exportHref} label={tExport('button')} testId="account-statement-export-button" />
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
