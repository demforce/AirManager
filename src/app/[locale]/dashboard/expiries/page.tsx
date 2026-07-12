import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExportButton } from '@/components/export-button';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import type { ExpiryScopeDto } from '@/lib/schemas/expiry-types';
import type { ExpiryItemDto, ExpiryProposalItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import {
  listAllExpiries,
  listExpiryProposals,
  listPersonExpiries,
  type ExpiryListItem,
  type ExpiryProposalListItem,
} from '@/server/services/expiries.service';
import { listExpiryTypes } from '@/server/services/expiry-types.service';
import { ExpiryDashboardFilters, type ExpiryDashboardFiltersValue } from './dashboard-filters';
import { ExpiryStatusBadge } from './expiry-status-badge';
import { MyExpiries } from './my-expiries';
import { ProposalsQueue } from './proposals-queue';
import { Card } from '@/components/ui/card';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    dashboardPage?: string;
    expiryTypeId?: string;
    scope?: string;
    status?: string;
  }>;
};

/** The staff dashboard's own page size (story 6.4, AC 1) — its own `dashboardPage` query param, deliberately SEPARATE from the proposal queue's `page` above (Dev Notes: two independently paginated sections on one landing page). */
const DASHBOARD_PAGE_SIZE = 20;

const EXPIRY_SCOPES: readonly ExpiryScopeDto[] = ['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'];
const EXPIRY_STATUSES: readonly ExpiryStatusDto[] = ['ok', 'expiring', 'expired'];

/** Hand-edited URL defense (pattern `finance/page.tsx`'s `sanitizeDateParam`/`flights/page.tsx`'s enum sanitizers): only a value actually in the enum reaches `listAllExpiries` — the service also validates at the Zod boundary (`GET /api/v1/expiries`), this only keeps a malformed page param from ever being forwarded. */
function sanitizeScope(value: string | undefined): ExpiryScopeDto | undefined {
  return value && (EXPIRY_SCOPES as readonly string[]).includes(value) ? (value as ExpiryScopeDto) : undefined;
}

function sanitizeStatus(value: string | undefined): ExpiryStatusDto | undefined {
  return value && (EXPIRY_STATUSES as readonly string[]).includes(value) ? (value as ExpiryStatusDto) : undefined;
}

/**
 * The client components below receive their INITIAL data as server-component
 * props (React Server Components serialize `Date` faithfully across that
 * boundary) but their MUTATION responses (decide/propose) via `fetch` —
 * real JSON, where a `Date` only ever arrives as an ISO string. Rather than
 * have every client component juggle two shapes for the same field, both
 * mappers below convert to the wire DTO shape (string dates) right here, so
 * props and fetch responses are uniformly typed (same rationale as
 * `finance/page.tsx`'s `CashMovementRow` mapping, applied to a Zod DTO
 * instead of a hand-rolled type).
 */
function toProposalDto(item: ExpiryProposalListItem): ExpiryProposalItemDto {
  return { ...item, decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null, createdAt: item.createdAt.toISOString() };
}

function toExpiryDto(item: ExpiryListItem): ExpiryItemDto {
  return {
    ...item,
    pendingProposal: item.pendingProposal ? { ...item.pendingProposal, createdAt: item.pendingProposal.createdAt.toISOString() } : null,
  };
}

const PROPOSALS_PAGE_SIZE = 20;

/**
 * The Scadenze landing (epic 6, stories 6.1/6.2/6.4) — two faces of the SAME
 * page, decided by `expiries.manage` (same dual-face pattern as
 * `FlightsPage`, story 5.4):
 *
 * - **Staff/admin** (`canManage`): "Tutte le scadenze" (story 6.4, AC 1) —
 *   every scadenza ordered by urgency (`expiresAt asc`), with combinable
 *   filters (tipo/ambito/stato) and its OWN pagination (`?dashboardPage=`,
 *   deliberately separate from the queue's own `?page=` below — two
 *   independently paginated sections on one page); PLUS, unchanged since
 *   6.2, "Coda proposte" — the FIFO queue of PENDING
 *   `ExpiryUpdateProposal`s (AC 2), paginated (`?page=`) once past
 *   `PROPOSALS_PAGE_SIZE`; PLUS the unchanged 6.1 catalogue link/stat.
 * - **Everyone else** (own-access, `self.read` — every role holds it):
 *   "Le mie scadenze" — the actor's own scadenze (status badges, same
 *   colors as the scheda persona's `ExpiriesPanel`) with a "Proponi
 *   aggiornamento" action per row (AC 2).
 *
 * Gate: `expiries.manage` OR `self.read` (redirect to `/dashboard`
 * otherwise — defense in depth only, AD-5: both services re-authorize).
 */
export default async function ExpiriesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const {
    page: pageParam,
    dashboardPage: dashboardPageParam,
    expiryTypeId: expiryTypeIdParam,
    scope: scopeParam,
    status: statusParam,
  } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  const canManage = hasPermission(actor, 'expiries.manage');
  if (!canManage && !hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const t = await getTranslations('ExpiriesPage');

  if (canManage) {
    const canManageSettings = hasPermission(actor, 'settings.manage');
    // `includeInactive: true` (Contesto: the dashboard filter must cover a
    // scadenza registered against a since-deactivated type too) — the
    // "Tipi attivi" stat below simply counts the active subset of the same
    // list rather than issuing a second query.
    const allTypes = await listExpiryTypes(actor, { includeInactive: true });
    const activeTypesCount = allTypes.filter((type) => type.isActive).length;

    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
    const proposalsResult = await listExpiryProposals(actor, { status: 'PENDING', page, pageSize: PROPOSALS_PAGE_SIZE });
    const totalPages = Math.max(1, Math.ceil(proposalsResult.total / PROPOSALS_PAGE_SIZE));

    // --- "Tutte le scadenze" (AC 1) — its own filters + pagination, a
    // SEPARATE `dashboardPage` query param from the proposal queue's `page`
    // above (Dev Notes: two independently paginated sections on one page).
    const expiryTypeId = expiryTypeIdParam || undefined;
    const scope = sanitizeScope(scopeParam);
    const status = sanitizeStatus(statusParam);

    const dashboardQuery = { expiryTypeId, scope, status, pageSize: DASHBOARD_PAGE_SIZE };
    let dashboardPage = Math.max(1, Number.parseInt(dashboardPageParam ?? '1', 10) || 1);
    let dashboardResult = await listAllExpiries(actor, { ...dashboardQuery, page: dashboardPage });
    // Clamp an out-of-range ?dashboardPage to the last real page (same pattern as `FinancePage`/`FlightsPage`).
    const dashboardLastPage = Math.max(1, Math.ceil(dashboardResult.total / DASHBOARD_PAGE_SIZE));
    if (dashboardPage > dashboardLastPage) {
      dashboardPage = dashboardLastPage;
      dashboardResult = await listAllExpiries(actor, { ...dashboardQuery, page: dashboardPage });
    }
    const dashboardTotalPages = Math.max(1, Math.ceil(dashboardResult.total / DASHBOARD_PAGE_SIZE));

    const dashboardFilterQuery = {
      ...(expiryTypeId ? { expiryTypeId } : {}),
      ...(scope ? { scope } : {}),
      ...(status ? { status } : {}),
    };

    // Review 6.4 M1: each section's pagination Link must PRESERVE the other
    // section's URL state (a Next `Link` query object replaces the whole
    // query string — a bare `{ page }` would silently reset the dashboard's
    // filters/page, and vice versa).
    function dashboardPageHref(targetPage: number) {
      return {
        pathname: '/dashboard/expiries',
        query: { dashboardPage: targetPage, ...dashboardFilterQuery, ...(page > 1 ? { page } : {}) },
      };
    }

    function proposalsPageHref(targetPage: number) {
      return {
        pathname: '/dashboard/expiries',
        query: {
          page: targetPage,
          ...(dashboardPage > 1 ? { dashboardPage } : {}),
          ...dashboardFilterQuery,
        },
      };
    }

    const dashboardInitialFilters: ExpiryDashboardFiltersValue = {
      expiryTypeId: expiryTypeId ?? '',
      scope: scope ?? '',
      status: status ?? '',
    };

    // Story 10.1 (AC 5) — server-driven view, same `expiryTypeId`/`scope`/`status` the dashboard table above was fetched with.
    const tExport = await getTranslations('Export');
    const exportHref = buildExportHref('/api/v1/expiries', { expiryTypeId, scope, status }, locale);
    // Story 10.2 (AC 5) — dedicated PDF route, same filters.
    const exportPdfHref = buildPdfExportHref('/api/v1/expiries/pdf', { expiryTypeId, scope, status }, locale);

    // Ambito/stato labels are REUSED (Dev Notes), never redefined: `ExpiryTypesPage.scope` (story 6.1) and this same page's own `own.table.status` (story 6.2).
    const tTypes = await getTranslations('ExpiryTypesPage');
    const scopeLabels: Record<ExpiryScopeDto, string> = {
      PILOTS: tTypes('scope.PILOTS'),
      STUDENTS: tTypes('scope.STUDENTS'),
      INSTRUCTORS: tTypes('scope.INSTRUCTORS'),
      ALL: tTypes('scope.ALL'),
    };
    const statusLabels: Record<ExpiryStatusDto, string> = {
      ok: t('own.table.status.ok'),
      expiring: t('own.table.status.expiring'),
      expired: t('own.table.status.expired'),
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
              {canManageSettings ? (
                <Link
                  href="/dashboard/expiries/types"
                  locale={locale as AppLocale}
                  className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                >
                  {t('manageTypes')}
                </Link>
              ) : null}
              <Link
                href="/dashboard"
                locale={locale as AppLocale}
                className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
              >
                {t('backToDashboard')}
              </Link>
            </div>
          </div>

          <section className="mt-10 rounded-cards border border-hairline bg-paper shadow-subtle p-6" data-testid="expiry-dashboard-section">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                  {t('dashboard.heading')}
                </h2>
                <p className="mt-1 text-sm text-mid-gray">{t('dashboard.description')}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ExportButton href={exportHref} label={tExport('button')} testId="expiries-export-button" />
                <ExportButton href={exportPdfHref} label={tExport('buttonPdf')} testId="expiries-export-pdf-button" />
              </div>
            </div>

            <div className="mt-6 border-b border-hairline pb-6">
              <ExpiryDashboardFilters
                types={allTypes}
                initialFilters={dashboardInitialFilters}
                labels={{
                  type: t('dashboard.filters.type'),
                  allTypes: t('dashboard.filters.allTypes'),
                  inactiveSuffix: t('dashboard.filters.inactiveSuffix'),
                  scope: t('dashboard.filters.scope'),
                  allScopes: t('dashboard.filters.allScopes'),
                  scopeOptions: scopeLabels,
                  status: t('dashboard.filters.status'),
                  allStatuses: t('dashboard.filters.allStatuses'),
                  statusOptions: statusLabels,
                  reset: t('dashboard.filters.reset'),
                }}
              />
            </div>

            <div className="mt-6 overflow-x-auto rounded-cards border border-hairline">
              <table className="w-full min-w-[720px] text-left text-sm" data-testid="expiry-dashboard-table">
                <thead>
                  <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
                    <th className="px-5 py-3">{t('dashboard.table.person')}</th>
                    <th className="px-5 py-3">{t('dashboard.table.type')}</th>
                    <th className="px-5 py-3">{t('dashboard.table.scope')}</th>
                    <th className="px-5 py-3">{t('dashboard.table.issuedAt')}</th>
                    <th className="px-5 py-3">{t('dashboard.table.expiresAt')}</th>
                    <th className="px-5 py-3">{t('dashboard.table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardResult.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-mid-gray">
                        {t('dashboard.table.empty')}
                      </td>
                    </tr>
                  ) : (
                    dashboardResult.items.map((item) => (
                      <tr key={item.id} className="border-b border-hairline last:border-b-0" data-testid="expiry-dashboard-row">
                        <td className="px-5 py-3 align-middle">
                          <Link
                            href={`/dashboard/people/${item.personId}`}
                            locale={locale as AppLocale}
                            className="font-medium text-ink underline-offset-4 hover:underline"
                          >
                            {item.personLastName} {item.personFirstName}
                          </Link>
                        </td>
                        <td className="px-5 py-3 align-middle text-ink">{item.typeName}</td>
                        <td className="px-5 py-3 align-middle text-ink">{scopeLabels[item.typeScope]}</td>
                        <td className="px-5 py-3 align-middle whitespace-nowrap text-ink">{formatDateOnly(item.issuedAt, locale as 'it' | 'en')}</td>
                        <td className="px-5 py-3 align-middle whitespace-nowrap text-ink">{formatDateOnly(item.expiresAt, locale as 'it' | 'en')}</td>
                        <td className="px-5 py-3 align-middle">
                          <ExpiryStatusBadge status={item.status} label={statusLabels[item.status]} data-testid="expiry-dashboard-status-badge" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {dashboardTotalPages > 1 ? (
              <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-mid-gray">
                <Link
                  href={dashboardPageHref(dashboardPage - 1)}
                  locale={locale as AppLocale}
                  aria-disabled={dashboardPage <= 1}
                  className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                    dashboardPage <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
                  }`}
                >
                  &larr;
                </Link>
                <span data-testid="expiry-dashboard-pagination-status">
                  {dashboardPage} / {dashboardTotalPages}
                </span>
                <Link
                  href={dashboardPageHref(dashboardPage + 1)}
                  locale={locale as AppLocale}
                  aria-disabled={dashboardPage >= dashboardTotalPages}
                  className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                    dashboardPage >= dashboardTotalPages ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
                  }`}
                >
                  &rarr;
                </Link>
              </nav>
            ) : null}
          </section>

          <section className="mt-10 rounded-cards border border-hairline bg-paper shadow-subtle p-6">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {t('queue.heading')}
            </h2>
            <p className="mt-1 text-sm text-mid-gray">{t('queue.description')}</p>

            <div className="mt-6">
              <ProposalsQueue
                proposals={proposalsResult.items.map(toProposalDto)}
                labels={{
                  empty: t('queue.empty'),
                  table: {
                    person: t('queue.table.person'),
                    type: t('queue.table.type'),
                    current: t('queue.table.current'),
                    proposed: t('queue.table.proposed'),
                    proposedBy: t('queue.table.proposedBy'),
                    when: t('queue.table.when'),
                    actions: t('queue.table.actions'),
                  },
                  actions: {
                    approve: t('queue.actions.approve'),
                    reject: t('queue.actions.reject'),
                    confirmApprove: t('queue.actions.confirmApprove'),
                    confirmReject: t('queue.actions.confirmReject'),
                    confirmYes: t('queue.actions.confirmYes'),
                    confirmCancel: t('queue.actions.confirmCancel'),
                  },
                  feedback: {
                    approved: t('queue.feedback.approved'),
                    rejected: t('queue.feedback.rejected'),
                    genericError: t('queue.feedback.genericError'),
                  },
                }}
              />
            </div>

            {totalPages > 1 ? (
              <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-mid-gray">
                <Link
                  href={proposalsPageHref(page - 1)}
                  locale={locale as AppLocale}
                  aria-disabled={page <= 1}
                  className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                    page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
                  }`}
                >
                  &larr;
                </Link>
                <span>
                  {page} / {totalPages}
                </span>
                <Link
                  href={proposalsPageHref(page + 1)}
                  locale={locale as AppLocale}
                  aria-disabled={page >= totalPages}
                  className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                    page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
                  }`}
                >
                  &rarr;
                </Link>
              </nav>
            ) : null}
          </section>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-6 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{t('stat.label')}</p>
              <p className="mt-3 text-4xl font-medium text-ink">{activeTypesCount}</p>
              <p className="mt-1 text-sm text-mid-gray">{t('stat.hint')}</p>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  // Own-access — "Le mie scadenze" (AC 2). An actor with no linked
  // `personId` has nothing of their own: an empty page, never a query
  // (same rule as `listFlights`'s own-access branch, story 5.4).
  const myExpiries = actor.personId !== null ? await listPersonExpiries(actor, actor.personId) : [];

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
              {t('kicker')}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-ink">
              {t('titleOwn')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-mid-gray">{t('descriptionOwn')}</p>
          </div>
          <Link
            href="/dashboard"
            locale={locale as AppLocale}
            className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        <section className="mt-10 rounded-cards border border-hairline bg-paper shadow-subtle p-6">
          <MyExpiries
            expiries={myExpiries.map(toExpiryDto)}
            labels={{
              empty: t('own.empty'),
              table: {
                type: t('own.table.type'),
                issuedAt: t('own.table.issuedAt'),
                expiresAt: t('own.table.expiresAt'),
                notes: t('own.table.notes'),
                noNotes: t('own.table.noNotes'),
                statusHeader: t('own.table.statusHeader'),
                status: {
                  ok: t('own.table.status.ok'),
                  expiring: t('own.table.status.expiring'),
                  expired: t('own.table.status.expired'),
                },
                pendingBadge: t('own.table.pendingBadge'),
                pendingHint: t('own.table.pendingHint'),
              },
              proposeAction: t('own.proposeAction'),
              form: {
                title: t('own.form.title'),
                issuedAt: t('own.form.issuedAt'),
                expiresAt: t('own.form.expiresAt'),
                notes: t('own.form.notes'),
                submit: t('own.form.submit'),
                cancel: t('own.form.cancel'),
                requiredField: t('own.form.requiredField'),
                invalidRange: t('own.form.invalidRange'),
                conflictError: t('own.form.conflictError'),
                genericError: t('own.form.genericError'),
                success: t('own.form.success'),
              },
            }}
          />
        </section>
      </div>
    </main>
  );
}
