import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import { formatDateTime } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listNegativeBalances } from '@/server/services/accounts.service';
import { listCashCategories, listCashMovements } from '@/server/services/cash.service';
import { CashRegister, type CashRegisterFilters } from './cash-register';
import { Pager } from '@/components/pager';
import { Card } from '@/components/ui/card';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; from?: string; to?: string; categoryId?: string; sign?: string }>;
};

const PAGE_SIZE = 20;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Hand-edited URL defense: only a well-formed `YYYY-MM-DD` reaches the service (the API route has the Zod schema; this page calls the service directly). */
function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

/**
 * The finance landing page: the staff-facing "Saldi negativi" list (story
 * 3.3, AC 2) plus the cash register (story 3.4, AC 2) — filterable by
 * period/category/sign via URL params (pattern of the people search, story
 * 2.1) and paginated server-side. Data always comes through the services
 * (AD-1), whose own `authorize()` calls remain the real guardians (AD-5) —
 * the `hasPermission` redirect here only hides navigation. The category
 * management page (`/dashboard/finance/categories`, story 3.4, AC 1) is
 * linked only for `settings.manage` actors. The package-type listino
 * (`/dashboard/finance/packages`, story 4.3, FR-12) is linked for every
 * `finance.manage` actor reaching this page — staff consult it read-only
 * (they will sell from it in story 4.4), only `settings.manage` gets its
 * write controls.
 */
export default async function FinancePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam, from: fromParam, to: toParam, categoryId: categoryIdParam, sign: signParam } = await searchParams;
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

  const from = sanitizeDateParam(fromParam);
  const to = sanitizeDateParam(toParam);
  const categoryId = categoryIdParam || undefined;
  const sign: 'in' | 'out' | undefined = signParam === 'in' ? 'in' : signParam === 'out' ? 'out' : undefined;
  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);

  const negativeBalances = await listNegativeBalances(actor);
  // Inactive categories included: the FILTER select must cover historical
  // movements recorded under a since-deactivated category; the new-movement
  // picker inside `CashRegister` filters down to active ones itself.
  const categories = await listCashCategories(actor, { includeInactive: true });

  const movementsQuery = { pageSize: PAGE_SIZE, from, to, categoryId, sign };
  let movements = await listCashMovements(actor, { ...movementsQuery, page });
  // Clamp an out-of-range ?page to the last real page (review 3.2 F1 pattern).
  const lastPage = Math.max(1, Math.ceil(movements.total / PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    movements = await listCashMovements(actor, { ...movementsQuery, page });
  }

  const canManageSettings = hasPermission(actor, 'settings.manage');
  const t = await getTranslations('FinancePage');
  const tExport = await getTranslations('Export');
  // Money must follow the page locale (review 3.1 M1 — mandatory), same
  // pattern as the account statement page.
  const moneyLocale = locale === 'en' ? ('en' as const) : ('it' as const);
  const totalPages = Math.max(1, Math.ceil(movements.total / PAGE_SIZE));

  const filterQuery = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(sign ? { sign } : {}),
  };

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/finance', query: { page: targetPage, ...filterQuery } };
  }

  const initialFilters: CashRegisterFilters = {
    from: from ?? '',
    to: to ?? '',
    categoryId: categoryId ?? '',
    sign: sign ?? '',
  };

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
            <Link
              href="/dashboard/finance/report"
              locale={locale as AppLocale}
              className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {t('viewReport')}
            </Link>
            <Link
              href="/dashboard/finance/packages"
              locale={locale as AppLocale}
              className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {t('viewPackages')}
            </Link>
            {canManageSettings ? (
              <Link
                href="/dashboard/finance/categories"
                locale={locale as AppLocale}
                className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
              >
                {t('manageCategories')}
              </Link>
            ) : null}
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('negativeBalances.heading')}</h2>
          <Card className="mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-left text-sm" data-testid="negative-balances-table">
              <thead>
                <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
                  <th className="px-5 py-3">{t('negativeBalances.table.person')}</th>
                  <th className="px-5 py-3">{t('negativeBalances.table.balance')}</th>
                  <th className="px-5 py-3">{t('negativeBalances.table.lastMovement')}</th>
                </tr>
              </thead>
              <tbody>
                {negativeBalances.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-mid-gray">
                      {t('negativeBalances.empty')}
                    </td>
                  </tr>
                ) : (
                  negativeBalances.map((item) => (
                    <tr key={item.personId} className="border-b border-hairline last:border-b-0" data-testid="negative-balance-row">
                      <td className="px-5 py-3 align-middle">
                        <Link
                          href={`/dashboard/people/${item.personId}`}
                          locale={locale as AppLocale}
                          className="font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {item.lastName} {item.firstName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 align-middle font-medium text-[#9F2F2D]">
                        {formatCents(item.balanceCents, moneyLocale)}
                      </td>
                      <td className="px-5 py-3 align-middle text-ink">
                        {item.lastMovementAt ? formatDateTime(item.lastMovementAt, moneyLocale) : t('negativeBalances.table.noValue')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </section>

        <section className="mt-14">
          <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('cashRegister.heading')}</h2>
          <div className="mt-4">
            <CashRegister
              rows={movements.items.map((item) => ({
                id: item.id,
                categoryId: item.categoryId,
                categoryName: item.categoryName,
                amountCents: item.amountCents,
                effectiveDate: item.effectiveDate,
                description: item.description,
                actorEmail: item.actorEmail,
                reversalOfId: item.reversalOfId,
                hasReversal: item.hasReversal,
                isAutomatic: item.isAutomatic,
              }))}
              categories={categories.map((category) => ({
                id: category.id,
                name: category.name,
                isActive: category.isActive,
                isSystem: category.isSystem,
              }))}
              initialFilters={initialFilters}
              moneyLocale={moneyLocale}
              exportLabel={tExport('button')}
              labels={{
                newMovement: t('cashRegister.newMovement'),
                filters: {
                  from: t('cashRegister.filters.from'),
                  to: t('cashRegister.filters.to'),
                  category: t('cashRegister.filters.category'),
                  sign: t('cashRegister.filters.sign'),
                  allCategories: t('cashRegister.filters.allCategories'),
                  allSigns: t('cashRegister.filters.allSigns'),
                  signIn: t('cashRegister.filters.signIn'),
                  signOut: t('cashRegister.filters.signOut'),
                },
                datePicker: {
                  openCalendar: t('datePicker.openCalendar'),
                  previousMonth: t('datePicker.previousMonth'),
                  nextMonth: t('datePicker.nextMonth'),
                  invalidDate: t('datePicker.invalidDate'),
                },
                table: {
                  date: t('cashRegister.table.date'),
                  category: t('cashRegister.table.category'),
                  description: t('cashRegister.table.description'),
                  amount: t('cashRegister.table.amount'),
                  recordedBy: t('cashRegister.table.recordedBy'),
                  actions: t('cashRegister.table.actions'),
                  noValue: t('cashRegister.table.noValue'),
                  empty: t('cashRegister.table.empty'),
                },
                // `t.raw`: carries a literal `{date}` placeholder the CLIENT
                // fills in (same rationale as the 3.3 adjustment badge).
                reversalOfDate: t.raw('cashRegister.reversalBadge.ofDate') as string,
                reversalLinked: t('cashRegister.reversalBadge.linked'),
                automaticBadge: t('cashRegister.automaticBadge'),
                form: {
                  title: t('cashRegister.form.title'),
                  direction: t('cashRegister.form.direction'),
                  directionIn: t('cashRegister.form.directionIn'),
                  directionOut: t('cashRegister.form.directionOut'),
                  category: t('cashRegister.form.category'),
                  amount: t('cashRegister.form.amount'),
                  amountHint: t('cashRegister.form.amountHint'),
                  effectiveDate: t('cashRegister.form.effectiveDate'),
                  description: t('cashRegister.form.description'),
                  submit: t('cashRegister.form.submit'),
                  cancel: t('cashRegister.form.cancel'),
                  invalidAmount: t('cashRegister.form.invalidAmount'),
                  requiredField: t('cashRegister.form.requiredField'),
                  conflictError: t('cashRegister.form.conflictError'),
                  genericError: t('cashRegister.form.genericError'),
                  success: t('cashRegister.form.success'),
                },
                reverse: {
                  action: t('cashRegister.reverse.action'),
                  reason: t('cashRegister.reverse.reason'),
                  confirm: t('cashRegister.reverse.confirm'),
                  cancel: t('cashRegister.reverse.cancel'),
                  requiredReason: t('cashRegister.reverse.requiredReason'),
                  conflictError: t('cashRegister.reverse.conflictError'),
                  genericError: t('cashRegister.reverse.genericError'),
                  success: t('cashRegister.reverse.success'),
                },
              }}
            />
          </div>

          <Pager page={page} totalPages={totalPages} hrefBuilder={pageHref} locale={locale as AppLocale} />
        </section>
      </div>
    </main>
  );
}
