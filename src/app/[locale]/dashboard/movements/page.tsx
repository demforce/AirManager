import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref } from '@/lib/export-href';
import { currentMonthRange } from '@/lib/period-presets';
import { deriveApprovedPprMovementStatus } from '@/lib/ppr-movement-status';
import type { PprStatusDto } from '@/lib/schemas/ppr';
import { APP_TIMEZONE } from '@/lib/time';
import { addDaysDateOnly, todayDateOnlyInZone } from '@/lib/zoned-time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listPprRequests, toPprRequestDto } from '@/server/services/ppr.service';
import { LogArrivalLaunchButton } from './log-arrival-launch-button';
import { MovementsTable, type MovementRowDto, type MovementsFilters } from './movements-table';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: string; from?: string; to?: string }>;
};

const MOVEMENTS_PAGE_SIZE = 20;

/** Mirrors `listPprRequestsQuerySchema`'s status enum (AC 3) — same set the pre-12.4 register offered, unchanged semantics (TD-5). */
const MOVEMENTS_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'ALL'] as const;
type MovementsStatus = (typeof MOVEMENTS_STATUSES)[number];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Hand-edited URL defense (same pattern as `FlightsPage`/`FinancePage`'s `sanitizeDateParam`). */
function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

function sanitizeStatus(value: string | undefined): MovementsStatus {
  return value && (MOVEMENTS_STATUSES as readonly string[]).includes(value) ? (value as MovementsStatus) : 'APPROVED';
}

/** Upper bound on how many currently-open (never-closed) APPROVED rows the KPI scan below reads at once (Dev Notes: a realistic airfield has well under this many simultaneously in flight; exceeding it undercounts the "al suolo ora"/"in arrivo oggi" KPIs rather than crashing — a documented, accepted degradation, not a hard cap on the register itself). */
const KPI_SCAN_LIMIT = 500;

/**
 * `PprStatus` -> the movements table's own presentation status (AC 3): only
 * `APPROVED` needs real derivation (`deriveApprovedPprMovementStatus`) —
 * `COMPLETED` maps 1:1 to `'PARTITO'` ("partito", Ops.jsx's own vocabulary),
 * every other status (`PENDING`/`REJECTED`/`CANCELLED`) is shown with its
 * REAL status, unchanged (Dev Notes: "CANCELLED -> badge annullato, stato
 * reale, non derivato" — extended here to the other two terminal-ish
 * statuses the `'ALL'` filter can still surface).
 */
function movementStatusOf(status: PprStatusDto, eta: Date, now: Date): MovementRowDto['movementStatus'] {
  if (status === 'APPROVED') return deriveApprovedPprMovementStatus(eta, now);
  if (status === 'COMPLETED') return 'PARTITO';
  return status;
}

/**
 * Voli in transito / movements register (epic 8, story 8.3; epic 12, story
 * 12.4, AC 3) — REPLACES `/dashboard/ppr/register` (permanently redirected,
 * `ppr/register/page.tsx`), rebuilt as `Ops.jsx#VisitingView`: real KPI row
 * plus the SAME closure/landing-fee/filter mechanics as before (TD-5
 * semantics unchanged), now rendering the DERIVED atteso/in-arrivo/al-suolo
 * status for `APPROVED` rows instead of a bare status badge. Gated
 * `ppr.manage`, same as the console.
 */
export default async function MovementsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'ppr.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const status = sanitizeStatus(sp.status);
  const from = sanitizeDateParam(sp.from);
  const to = sanitizeDateParam(sp.to);

  const now = new Date();
  const today = todayDateOnlyInZone(APP_TIMEZONE);
  const tomorrow = addDaysDateOnly(today, 1);
  const monthRange = currentMonthRange(now);

  const listQuery = { pageSize: MOVEMENTS_PAGE_SIZE, status, from, to };
  let page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const results = await Promise.all([
    listPprRequests(actor, { ...listQuery, page }),
    // KPI: "attesi domani" — an exact day-bound query, no now-comparison needed (AC 3).
    listPprRequests(actor, { status: 'APPROVED', from: tomorrow, to: tomorrow, page: 1, pageSize: 1 }),
    // KPI: "al suolo ora" / "in arrivo oggi" — every currently-open APPROVED
    // row up to and including today (no `from` bound: an overdue APPROVED
    // request from a PREVIOUS day the staff never closed still counts as
    // "al suolo ora", AC 3's own rule), classified in JS below.
    listPprRequests(actor, { status: 'APPROVED', to: today, page: 1, pageSize: KPI_SCAN_LIMIT }),
    // KPI: "movimenti nel mese" — every request (any status) whose eta falls
    // in the current Rome month (Dev Notes: a simple, documented reading of
    // "conteggi dal periodo" — historical statistics beyond this stay out of
    // scope, story 12.10).
    listPprRequests(actor, { status: 'ALL', from: monthRange.from, to: monthRange.to, page: 1, pageSize: 1 }),
  ]);
  let listResult = results[0];
  const expectedTomorrowCount = results[1].total;
  const kpiScanItems = results[2].items;
  const monthMovementsCount = results[3].total;

  const onGroundCount = kpiScanItems.filter((item) => deriveApprovedPprMovementStatus(item.eta, now) === 'AL_SUOLO').length;
  const inboundTodayCount = kpiScanItems.filter((item) => deriveApprovedPprMovementStatus(item.eta, now) === 'IN_ARRIVO').length;

  // Clamp an out-of-range ?page to the last real page (same pattern as `FlightsPage`/`FinancePage`).
  const lastPage = Math.max(1, Math.ceil(listResult.total / MOVEMENTS_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    listResult = await listPprRequests(actor, { ...listQuery, page });
  }
  const totalPages = Math.max(1, Math.ceil(listResult.total / MOVEMENTS_PAGE_SIZE));

  const filters: MovementsFilters = { status, from: from ?? '', to: to ?? '' };
  const filterQuery = {
    ...(status !== 'APPROVED' ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/movements' as const, query: { page: targetPage, ...filterQuery } };
  }

  const t = await getTranslations('MovementsPage');
  const tExport = await getTranslations('Export');
  const displayLocale = locale as 'it' | 'en';

  const rows: MovementRowDto[] = listResult.items.map((item) => ({
    ...toPprRequestDto(item),
    movementStatus: movementStatusOf(item.status, item.eta, now),
  }));

  const exportHref = buildExportHref('/api/v1/ppr-requests', { status: filters.status, from: filters.from, to: filters.to }, locale);

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { onGround: onGroundCount })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <LogArrivalLaunchButton
            locale={locale as AppLocale}
            buttonLabel={t('header.logArrival')}
            successToast={t.raw('toast.logArrivalCreated') as string}
            labels={{
              title: t('logArrivalForm.title'),
              subtitle: t('logArrivalForm.subtitle'),
              firstName: t('logArrivalForm.firstName'),
              lastName: t('logArrivalForm.lastName'),
              email: t('logArrivalForm.email'),
              phone: t('logArrivalForm.phone'),
              aircraftRegistration: t('logArrivalForm.aircraftRegistration'),
              aircraftType: t('logArrivalForm.aircraftType'),
              origin: t('logArrivalForm.origin'),
              destination: t('logArrivalForm.destination'),
              eta: t('logArrivalForm.eta'),
              etd: t('logArrivalForm.etd'),
              personsOnBoard: t('logArrivalForm.personsOnBoard'),
              notes: t('logArrivalForm.notes'),
              submit: t('logArrivalForm.submit'),
              cancel: t('logArrivalForm.cancel'),
              requiredField: t('logArrivalForm.requiredField'),
              invalidEmail: t('logArrivalForm.invalidEmail'),
              invalidRange: t('logArrivalForm.invalidRange'),
              invalidPersons: t('logArrivalForm.invalidPersons'),
              contactRequired: t('logArrivalForm.contactRequired'),
              errors: {
                ETA_IN_PAST: t('logArrivalForm.errors.ETA_IN_PAST'),
                ETD_NOT_AFTER_ETA: t('logArrivalForm.errors.ETD_NOT_AFTER_ETA'),
                generic: t('logArrivalForm.errors.generic'),
              },
            }}
          />
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi" data-testid="movements-kpi-on-ground">
          <div className="kpi-label">{t('kpi.onGround')}</div>
          <div className="kpi-value num">{onGroundCount}</div>
        </div>
        <div className="kpi" data-testid="movements-kpi-inbound-today">
          <div className="kpi-label">{t('kpi.inboundToday')}</div>
          <div className="kpi-value num">{inboundTodayCount}</div>
        </div>
        <div className="kpi" data-testid="movements-kpi-expected-tomorrow">
          <div className="kpi-label">{t('kpi.expectedTomorrow')}</div>
          <div className="kpi-value num">{expectedTomorrowCount}</div>
        </div>
        <div className="kpi" data-testid="movements-kpi-month">
          <div className="kpi-label">{t('kpi.month')}</div>
          <div className="kpi-value num">{monthMovementsCount}</div>
        </div>
      </div>

      <MovementsTable
        // Remounts on every filter/page navigation (same idiom as the
        // pre-12.4 register's own `PprRegister` and `FlightsManager`'s):
        // the parent server component re-queries and passes fresh `rows`,
        // and this `key` forces the client component's own local state
        // (which row's "Completa"/cancel-confirm panel is open) to start
        // clean rather than bleed across different filter/page views.
        key={JSON.stringify({ page, ...filterQuery })}
        rows={rows}
        locale={displayLocale}
        filters={filters}
        exportTriggerLabel={t('export.label')}
        exportXlsLabel={tExport('button')}
        exportHref={exportHref}
        labels={{
          filters: {
            status: t('filters.status'),
            statusAll: t('filters.statusAll'),
            statusOptions: {
              pending: t('filters.statusOptions.pending'),
              approved: t('filters.statusOptions.approved'),
              rejected: t('filters.statusOptions.rejected'),
              completed: t('filters.statusOptions.completed'),
              cancelled: t('filters.statusOptions.cancelled'),
            },
            from: t('filters.from'),
            to: t('filters.to'),
            reset: t('filters.reset'),
          },
          card: { title: t('card.title'), subTemplate: t.raw('card.subTemplate') as string },
          table: {
            aircraft: t('table.aircraft'),
            type: t('table.type'),
            route: t('table.route'),
            requester: t('table.requester'),
            eta: t('table.eta'),
            etd: t('table.etd'),
            status: t('table.status'),
            fee: t('table.fee'),
            actions: t('table.actions'),
            noValue: t('table.noValue'),
          },
          status: {
            ATTESO: t('status.ATTESO'),
            IN_ARRIVO: t('status.IN_ARRIVO'),
            AL_SUOLO: t('status.AL_SUOLO'),
            PARTITO: t('status.PARTITO'),
            PENDING: t('filters.statusOptions.pending'),
            REJECTED: t('filters.statusOptions.rejected'),
            CANCELLED: t('filters.statusOptions.cancelled'),
          },
          actions: {
            complete: t('actions.complete'),
            cancel: t('actions.cancel'),
            confirmCancelPrompt: t('actions.confirmCancelPrompt'),
            confirmYes: t('actions.confirmYes'),
            confirmNo: t('actions.confirmNo'),
            feeLabel: t('actions.feeLabel'),
            feeHint: t('actions.feeHint'),
            invalidFee: t('actions.invalidFee'),
            submitComplete: t('actions.submitComplete'),
            closePanel: t('actions.closePanel'),
          },
          toast: {
            completed: t('toast.completed'),
            cancelled: t('toast.cancelled'),
            conflictError: t('toast.conflictError'),
            genericError: t('toast.genericError'),
          },
          empty: t('empty'),
        }}
      />

      {totalPages > 1 ? (
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }} data-testid="movements-pagination">
          <Link href={pageHref(page - 1)} locale={locale as AppLocale} aria-disabled={page <= 1} className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>
            &larr;
          </Link>
          <span className="mono" data-testid="movements-pagination-status">
            {page} / {totalPages}
          </span>
          <Link href={pageHref(page + 1)} locale={locale as AppLocale} aria-disabled={page >= totalPages} className={`btn ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}>
            &rarr;
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
