import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { currentMonthRange } from '@/lib/period-presets';
import type { BookTypeDto } from '@/lib/schemas/transactions';
import { formatDateOnly } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listNegativeBalances } from '@/server/services/accounts.service';
import { getBillingSummary } from '@/server/services/billing-summary.service';
import { listCashCategories } from '@/server/services/cash.service';
import { getCompensationSummary } from '@/server/services/instructor-compensation.service';
import { listPeople } from '@/server/services/people.service';
import { listTransactions } from '@/server/services/transactions.service';
import { BillingConsole, type BillingFilters } from './billing-console';
import { BillingPanels } from './billing-panels';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; dateFrom?: string; dateTo?: string; bookType?: string; categoryId?: string; personQuery?: string; unattributed?: string }>;
};

/** Form pickers' seed candidates (story TD-3 convention, same as logbook/fleet/pilots). */
const OPTIONS_PAGE_SIZE = 100;

/** The ledger's own page size. */
const TX_PAGE_SIZE = 20;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BOOK_TYPES: readonly BookTypeDto[] = ['REVENUE', 'COST', 'DEPOSIT', 'TRANSFER'];

function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

/**
 * Contabilità (epic 12, story 12.9; reworked story Billing-2) — AirOps-
 * native, port of `docs/design-reference/airops/src/BillingView.jsx`,
 * replacing the legacy `/dashboard/finance` + `/dashboard/finance/report`
 * (deleted by story 12.9). `finance.manage` only (ADMIN-only, story 14.9) — no
 * own-access face, unlike logbook/bookings (the titolare's own estratto
 * conto stays on `people/[id]/account`, untouched — AC 7).
 *
 * Story Billing-2, AC 1: the old 5-tile `.kpi-row` (`getBillingKpis`,
 * ratifica D1, DELETED) is replaced by the three riquadri
 * (`billing-panels.tsx`) fed by ONE `getBillingSummary` call — Risultato
 * (the CURRENT Europe/Rome calendar month, always, independent of the
 * table's own filters — same "never re-derived from the filtered page"
 * invariant `getBillingKpis` had), Liquidità (a running balance, NOT
 * month-scoped), Acconti piloti (all-time account balances).
 *
 * The single "Tipo" filter (AC 2) is now `bookType` (the coarse
 * ricavo/costo/acconto/giroconto classification) — a SEPARATE, single-
 * purpose "Categoria" filter (`categoryId`, cash categories only) replaces
 * the old combined kind/category select. The old `movementType` param has
 * no UI control anymore (Dev Notes) — still valid at the schema/service
 * level, just unused by this page.
 */
export default async function BillingPage({ params, searchParams }: PageProps) {
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

  const dateFrom = sanitizeDateParam(sp.dateFrom);
  const dateTo = sanitizeDateParam(sp.dateTo);
  const bookTypeParam = sp.bookType && (BOOK_TYPES as readonly string[]).includes(sp.bookType) ? (sp.bookType as BookTypeDto) : undefined;
  const categoryId = sp.categoryId || undefined;
  const personQuery = sp.personQuery || undefined;
  const unattributed = sp.unattributed === 'true';

  // Sequential (not `Promise.all`): `listPeople` runs an interactive
  // `$transaction` internally — same "never concurrent with another
  // `$transaction`-based read" constraint documented on the logbook/fleet
  // pages' own options-fetch blocks.
  const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, profile: 'pilot-or-student', includeArchived: false });
  const personOptions = peopleResult.items.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));

  const cashCategories = await listCashCategories(actor, { includeInactive: false });
  const categoryOptions = cashCategories.map((category) => ({ id: category.id, name: category.name }));

  const summary = await getBillingSummary(actor);
  const compensation = await getCompensationSummary(actor);
  const negativeBalances = await listNegativeBalances(actor);

  const txQuery = { pageSize: TX_PAGE_SIZE, from: dateFrom, to: dateTo, personQuery, bookType: bookTypeParam, categoryId, unattributed };
  let page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  let result = await listTransactions(actor, { ...txQuery, page });
  const lastPage = Math.max(1, Math.ceil(result.total / TX_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    result = await listTransactions(actor, { ...txQuery, page });
  }
  const totalPages = Math.max(1, Math.ceil(result.total / TX_PAGE_SIZE));

  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const t = await getTranslations('BillingPage');

  const filterQuery = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(bookTypeParam ? { bookType: bookTypeParam } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(personQuery ? { personQuery } : {}),
    ...(unattributed ? { unattributed: 'true' } : {}),
  };
  const exportHref = buildExportHref('/api/v1/transactions', filterQuery, locale);
  const reportPeriod = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : currentMonthRange();
  const cashReportPdfHref = buildPdfExportHref('/api/v1/cash-report/pdf', reportPeriod, locale);

  const periodLabel = dateFrom && dateTo
    ? `${formatDateOnly(dateFrom, displayLocale)} – ${formatDateOnly(dateTo, displayLocale)}`
    : dateFrom
      ? `${t('filters.dateFrom')} ${formatDateOnly(dateFrom, displayLocale)}`
      : dateTo
        ? `${t('filters.dateTo')} ${formatDateOnly(dateTo, displayLocale)}`
        : t('periodAll');

  const monthLabel = new Intl.DateTimeFormat(displayLocale === 'en' ? 'en-IE' : 'it-IT', { month: 'long', year: 'numeric' }).format(new Date());

  const filters: BillingFilters = {
    dateFrom: dateFrom ?? '',
    dateTo: dateTo ?? '',
    bookType: bookTypeParam ?? '',
    categoryId: categoryId ?? '',
    personQuery: personQuery ?? '',
    unattributed,
  };

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { count: result.total, period: periodLabel })}</div>
        </div>
      </div>

      <BillingPanels
        summary={summary}
        monthLabel={monthLabel}
        moneyLocale={displayLocale}
        locale={displayLocale}
        unattributedHref={{ pathname: '/dashboard/billing', query: { unattributed: 'true' } }}
        labels={{
          result: { title: t('panels.result.title'), revenue: t('panels.result.revenue'), cost: t('panels.result.cost'), net: t('panels.result.net') },
          treasury: {
            title: t('panels.treasury.title'),
            cash: t('panels.treasury.cash'),
            bank: t('panels.treasury.bank'),
            deposits: t('panels.treasury.deposits'),
            available: t('panels.treasury.available'),
            unattributed: t('panels.treasury.unattributed', { count: summary.treasury.unattributedCount }),
          },
          deposits: {
            title: t('panels.deposits.title'),
            total: t('panels.deposits.total'),
            exposure: t('panels.deposits.exposure'),
            inRed: t('panels.deposits.inRed'),
            detailLink: t('panels.deposits.detailLink'),
          },
        }}
        mobileLabels={{
          kpiResult: t('mobile.kpiResult'),
          kpiAvailable: t('mobile.kpiAvailable'),
          kpiDeposits: t('mobile.kpiDeposits'),
          openPanel: t('mobile.openPanel'),
          treasurySub: t('mobile.treasurySub'),
          depositsSub: t('mobile.depositsSub'),
          close: t('mobile.close'),
        }}
      />

      <BillingConsole
        key={JSON.stringify({ page, ...filterQuery })}
        items={result.items}
        page={page}
        totalPages={totalPages}
        filters={filters}
        personOptions={personOptions}
        categoryOptions={categoryOptions}
        byCategory={summary.byCategory.categories}
        compensation={compensation.map((row) => ({
          personId: row.personId,
          firstName: row.firstName,
          lastName: row.lastName,
          mtdMinutes: row.mtdMinutes,
          payoutRateCents: row.payoutRateCents,
          owedMtdCents: row.owedMtdCents,
        }))}
        negativeBalances={negativeBalances.map((item) => ({ personId: item.personId, firstName: item.firstName, lastName: item.lastName, balanceCents: item.balanceCents }))}
        exportHref={exportHref}
        cashReportPdfHref={cashReportPdfHref}
        moneyLocale={displayLocale}
        locale={displayLocale}
        labels={{
          newTransaction: t('newTransaction'),
          byCategory: {
            title: t('byCategory.title'),
            sub: t('byCategory.sub', { month: monthLabel }),
            empty: t('byCategory.empty'),
            in: t('byCategory.in'),
            out: t('byCategory.out'),
            net: t('byCategory.net'),
          },
          instructorCompensation: { title: t('instructorCompensation.title'), sub: t('instructorCompensation.sub'), noRate: t('instructorCompensation.noRate'), empty: t('instructorCompensation.empty') },
          negativeBalances: { title: t('negativeBalances.title'), empty: t('negativeBalances.empty'), link: t('negativeBalances.link') },
          exportMenu: { label: t('exportMenu.label'), xlsLabel: t('exportMenu.xlsLabel'), pdfLabel: t('exportMenu.pdfLabel') },
          table: {
            cardTitle: t('table.cardTitle'),
            shown: t('table.shown', { shown: result.items.length, total: result.total }),
            date: t('table.date'),
            pilot: t('table.pilot'),
            type: t('table.type'),
            description: t('table.description'),
            method: t('table.method'),
            entrate: t('table.entrate'),
            uscite: t('table.uscite'),
            status: t('table.status'),
            actions: t('table.actions'),
            noValue: t('table.noValue'),
            empty: t('table.empty'),
            statusOptions: { registered: t('table.statusOptions.registered'), reversed: t('table.statusOptions.reversed'), reversal: t('table.statusOptions.reversal') },
            kinds: {
              TOP_UP: t('table.kinds.TOP_UP'),
              ADJUSTMENT: t('table.kinds.ADJUSTMENT'),
              PACKAGE_PURCHASE: t('table.kinds.PACKAGE_PURCHASE'),
              FLIGHT_CHARGE: t('table.kinds.FLIGHT_CHARGE'),
              FLIGHT_CHARGE_REVERSAL: t('table.kinds.FLIGHT_CHARGE_REVERSAL'),
            },
            methods: { CASH: t('table.methods.CASH'), BANK_TRANSFER: t('table.methods.BANK_TRANSFER'), POS: t('table.methods.POS') },
            bookTypes: {
              REVENUE: t('table.bookTypes.REVENUE'),
              COST: t('table.bookTypes.COST'),
              DEPOSIT: t('table.bookTypes.DEPOSIT'),
              TRANSFER: t('table.bookTypes.TRANSFER'),
            },
            noResultImpact: t('table.noResultImpact'),
          },
          filters: {
            dateFrom: t('filters.dateFrom'),
            dateTo: t('filters.dateTo'),
            bookType: t('filters.bookType'),
            allBookTypes: t('filters.allBookTypes'),
            category: t('filters.category'),
            allCategories: t('filters.allCategories'),
            pilot: t('filters.pilot'),
            personSearchPlaceholder: t('filters.personSearchPlaceholder'),
            reset: t('filters.reset'),
            unattributedChip: t('filters.unattributedChip'),
            unattributedChipDismiss: t('filters.unattributedChipDismiss'),
          },
          pagination: { prev: '←', next: '→' },
          actions: {
            adjust: t('actions.adjust'),
            reverse: t('actions.reverse'),
            reclassifyPlaceholder: t('actions.reclassifyPlaceholder'),
            reclassifySuccess: t('actions.reclassifySuccess'),
            reclassifyError: t('actions.reclassifyError'),
          },
          adjustModal: {
            title: t('adjustModal.title'),
            linkedTo: t.raw('adjustModal.linkedTo') as string,
            amount: t('adjustModal.amount'),
            amountHint: t('adjustModal.amountHint'),
            reason: t('adjustModal.reason'),
            submit: t('adjustModal.submit'),
            cancel: t('adjustModal.cancel'),
            invalidAmount: t('adjustModal.invalidAmount'),
            requiredReason: t('adjustModal.requiredReason'),
            conflictError: t('adjustModal.conflictError'),
            genericError: t('adjustModal.genericError'),
            success: t('adjustModal.success'),
          },
          reverseModal: {
            title: t('reverseModal.title'),
            reason: t('reverseModal.reason'),
            confirm: t('reverseModal.confirm'),
            cancel: t('reverseModal.cancel'),
            requiredReason: t('reverseModal.requiredReason'),
            conflictError: t('reverseModal.conflictError'),
            genericError: t('reverseModal.genericError'),
            success: t('reverseModal.success'),
          },
          newTransactionForm: {
            title: t('newTransactionForm.title'),
            subtitle: t('newTransactionForm.subtitle'),
            closeLabel: t('newTransactionForm.closeLabel'),
            kind: t('newTransactionForm.kind'),
            kinds: { payment: t('newTransactionForm.kinds.payment'), adjustment: t('newTransactionForm.kinds.adjustment'), cash: t('newTransactionForm.kinds.cash') },
            fields: {
              pilot: t('newTransactionForm.fields.pilot'),
              amount: t('newTransactionForm.fields.amount'),
              method: t('newTransactionForm.fields.method'),
              methods: {
                CASH: t('newTransactionForm.fields.methods.CASH'),
                BANK_TRANSFER: t('newTransactionForm.fields.methods.BANK_TRANSFER'),
                POS: t('newTransactionForm.fields.methods.POS'),
              },
              date: t('newTransactionForm.fields.date'),
              description: t('newTransactionForm.fields.description'),
              reason: t('newTransactionForm.fields.reason'),
              category: t('newTransactionForm.fields.category'),
              direction: t('newTransactionForm.fields.direction'),
              directionIn: t('newTransactionForm.fields.directionIn'),
              directionOut: t('newTransactionForm.fields.directionOut'),
            },
            submit: t('newTransactionForm.submit'),
            cancel: t('newTransactionForm.cancel'),
            requiredField: t('newTransactionForm.requiredField'),
            invalidAmount: t('newTransactionForm.invalidAmount'),
            conflictError: t('newTransactionForm.conflictError'),
            genericError: t('newTransactionForm.genericError'),
            result: { title: t('newTransactionForm.result.title'), newBalance: t('newTransactionForm.result.newBalance'), close: t('newTransactionForm.result.close') },
            picker: { placeholder: t('newTransactionForm.picker.placeholder'), noResults: t('newTransactionForm.picker.noResults') },
          },
          mobile: {
            bookTypeAll: t('mobile.bookTypeAll'),
            unattributedChip: t('filters.unattributedChip'),
            filters: t('mobile.filters'),
            // Placeholder filled client-side (the count is client state) — `t.raw`, per the convention.
            filtersCount: t.raw('mobile.filtersCount') as string,
            filtersTitle: t('mobile.filtersTitle'),
            apply: t('mobile.apply'),
            close: t('mobile.close'),
            back: t('mobile.back'),
            openDetail: t('mobile.openDetail'),
            empty: t('mobile.empty'),
            source: t('mobile.source'),
            sourceAccount: t('mobile.sourceAccount'),
            sourceCash: t('mobile.sourceCash'),
            reference: t('mobile.reference'),
            id: t('mobile.id'),
            reclassify: t('mobile.reclassify'),
            reclassifyConfirm: t('mobile.reclassifyConfirm'),
            unattributedMethod: t('mobile.unattributedMethod'),
          },
        }}
      />
    </main>
  );
}
