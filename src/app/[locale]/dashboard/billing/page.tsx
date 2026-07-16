import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KPI } from '@/components/ui/kpi';
import { redirect } from '@/i18n/navigation';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { formatCents } from '@/lib/money';
import { currentMonthRange } from '@/lib/period-presets';
import type { AccountMovementTypeDto } from '@/lib/schemas/accounts';
import { formatDateOnly } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listNegativeBalances } from '@/server/services/accounts.service';
import { listCashCategories } from '@/server/services/cash.service';
import { getCompensationSummary } from '@/server/services/instructor-compensation.service';
import { listPeople } from '@/server/services/people.service';
import { getBillingKpis, listTransactions } from '@/server/services/transactions.service';
import { BillingConsole, type BillingFilters } from './billing-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; dateFrom?: string; dateTo?: string; type?: string; personId?: string }>;
};

/** Form pickers' seed candidates (story TD-3 convention, same as logbook/fleet/pilots). */
const OPTIONS_PAGE_SIZE = 100;

/** The ledger's own page size. */
const TX_PAGE_SIZE = 20;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_MOVEMENT_TYPES: readonly AccountMovementTypeDto[] = ['TOP_UP', 'ADJUSTMENT', 'PACKAGE_PURCHASE', 'FLIGHT_CHARGE', 'FLIGHT_CHARGE_REVERSAL'];

function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

/**
 * Contabilità (epic 12, story 12.9) — AirOps-native, port of
 * `docs/design-reference/airops/src/BillingView.jsx`, replacing the legacy
 * `/dashboard/finance` + `/dashboard/finance/report` (deleted by this
 * story). `finance.manage` only (ADMIN+STAFF) — no own-access face, unlike
 * logbook/bookings (the titolare's own estratto conto stays on
 * `people/[id]/account`, untouched).
 *
 * KPI row (ratifica utente 2): ALWAYS the current Europe/Rome calendar
 * month's TRUE server aggregates (`getBillingKpis`), completely INDEPENDENT
 * of the table's own filters — computed here with NO query params, never
 * re-derived from `listTransactions`'s (filtered) page.
 *
 * The single "Tipo" filter covers BOTH vocabularies behind one URL param
 * (`type`): one of the 5 `AccountMovementType` values resolves to
 * `movementType`, anything else (a cash category id) resolves to
 * `categoryId` — `listTransactionsQuerySchema`'s XOR is therefore never
 * hit from this UI (the two can never both be set at once here).
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
  const typeParam = sp.type || undefined;
  const movementType = typeParam && (ACCOUNT_MOVEMENT_TYPES as readonly string[]).includes(typeParam) ? (typeParam as AccountMovementTypeDto) : undefined;
  const categoryId = typeParam && !movementType ? typeParam : undefined;
  const personId = sp.personId || undefined;

  // Sequential (not `Promise.all`): `listPeople` runs an interactive
  // `$transaction` internally — same "never concurrent with another
  // `$transaction`-based read" constraint documented on the logbook/fleet
  // pages' own options-fetch blocks.
  const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, profile: 'pilot-or-student', includeArchived: false });
  const personOptions = peopleResult.items.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));

  const cashCategories = await listCashCategories(actor, { includeInactive: false });
  const categoryOptions = cashCategories.map((category) => ({ id: category.id, name: category.name }));

  const kpis = await getBillingKpis(actor);
  const compensation = await getCompensationSummary(actor);
  const negativeBalances = await listNegativeBalances(actor);

  const txQuery = { pageSize: TX_PAGE_SIZE, from: dateFrom, to: dateTo, personId, movementType, categoryId };
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
  const tExport = await getTranslations('Export');

  const filterQuery = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(typeParam ? { type: typeParam } : {}),
    ...(personId ? { personId } : {}),
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

  const revenueDelta = kpis.prevMonthRevenueCents > 0 ? Math.round(((kpis.revenueCents - kpis.prevMonthRevenueCents) / kpis.prevMonthRevenueCents) * 1000) / 10 : null;
  const revenueDeltaLabel = revenueDelta === null ? undefined : t('kpi.revenueDelta', { value: revenueDelta >= 0 ? `+${revenueDelta}` : `${revenueDelta}` });
  const revenueTrend: 'up' | 'down' | '' = revenueDelta === null ? '' : revenueDelta >= 0 ? 'up' : 'down';

  const filters: BillingFilters = {
    dateFrom: dateFrom ?? '',
    dateTo: dateTo ?? '',
    type: typeParam ?? '',
    personId: personId ?? '',
  };

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { count: result.total, period: periodLabel })}</div>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label={t('kpi.revenue')} value={formatCents(kpis.revenueCents, displayLocale)} delta={revenueDeltaLabel} trend={revenueTrend} />
        <KPI label={t('kpi.charges')} value={formatCents(kpis.chargesCents, displayLocale)} delta={t('kpi.chargesSub', { count: kpis.chargesCount })} />
        <KPI label={t('kpi.payments')} value={formatCents(kpis.paymentsCents, displayLocale)} delta={t('kpi.paymentsSub', { count: kpis.paymentsCount })} trend="up" />
        <KPI label={t('kpi.net')} value={formatCents(kpis.netCents, displayLocale)} />
        <KPI label={t('kpi.instructors')} value={formatCents(compensation.reduce((sum, row) => sum + (row.owedMtdCents ?? 0), 0), displayLocale)} delta={t('kpi.instructorsSub', { count: compensation.length })} />
      </div>

      <BillingConsole
        key={JSON.stringify({ page, ...filterQuery })}
        items={result.items}
        page={page}
        totalPages={totalPages}
        filters={filters}
        personOptions={personOptions}
        categoryOptions={categoryOptions}
        revenueByKind={kpis.revenueByKind}
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
          statements: t('statements'),
          revenueByCategory: { title: t('revenueByCategory.title'), sub: t('revenueByCategory.sub', { month: monthLabel }), empty: t('revenueByCategory.empty') },
          instructorCompensation: { title: t('instructorCompensation.title'), sub: t('instructorCompensation.sub'), noRate: t('instructorCompensation.noRate'), empty: t('instructorCompensation.empty') },
          negativeBalances: { title: t('negativeBalances.title'), empty: t('negativeBalances.empty'), link: t('negativeBalances.link') },
          exportMenu: { label: tExport('button'), xlsLabel: t('exportMenu.xlsLabel'), pdfLabel: t('exportMenu.pdfLabel') },
          table: {
            cardTitle: t('table.cardTitle'),
            shown: t('table.shown', { shown: result.items.length, total: result.total }),
            date: t('table.date'),
            pilot: t('table.pilot'),
            type: t('table.type'),
            description: t('table.description'),
            method: t('table.method'),
            amount: t('table.amount'),
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
          },
          filters: {
            dateFrom: t('filters.dateFrom'),
            dateTo: t('filters.dateTo'),
            type: t('filters.type'),
            allTypes: t('filters.allTypes'),
            accountGroup: t('filters.accountGroup'),
            cashGroup: t('filters.cashGroup'),
            pilot: t('filters.pilot'),
            allPilots: t('filters.allPilots'),
            reset: t('filters.reset'),
          },
          pagination: { prev: '←', next: '→' },
          picker: { placeholder: t('newTransactionForm.picker.placeholder'), noResults: t('newTransactionForm.picker.noResults') },
          actions: { adjust: t('actions.adjust'), reverse: t('actions.reverse') },
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
          statementsDialog: {
            title: t('statementsDialog.title'),
            subtitle: t('statementsDialog.subtitle'),
            pilot: t('statementsDialog.pilot'),
            dateFrom: t('statementsDialog.dateFrom'),
            dateTo: t('statementsDialog.dateTo'),
            picker: { placeholder: t('newTransactionForm.picker.placeholder'), noResults: t('newTransactionForm.picker.noResults') },
            submit: t('statementsDialog.submit'),
            cancel: t('statementsDialog.cancel'),
            requiredField: t('statementsDialog.requiredField'),
          },
        }}
      />
    </main>
  );
}
