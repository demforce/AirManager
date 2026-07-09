import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listPprRequests, type PprRequestListItem } from '@/server/services/ppr.service';
import { PprRegister, type PprRegisterFilters } from './ppr-register';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: string; from?: string; to?: string }>;
};

const REGISTER_PAGE_SIZE = 20;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Mirrors `listPprRequestsQuerySchema`'s status enum (AC 2) — includes `'ALL'`, unlike the queue's own `pprStatusSchema`. */
const REGISTER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'ALL'] as const;
type RegisterStatus = (typeof REGISTER_STATUSES)[number];

/** Hand-edited URL defense: only a well-formed `YYYY-MM-DD` reaches the service (same pattern as `FlightsPage`/`FinancePage`'s `sanitizeDateParam`). */
function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

function sanitizeStatus(value: string | undefined): RegisterStatus | undefined {
  return value && (REGISTER_STATUSES as readonly string[]).includes(value) ? (value as RegisterStatus) : undefined;
}

/**
 * Server-serialized `Date`/`number` fields to the wire DTO shape
 * (`pprRequestItemSchema`) — same rationale as `ppr/page.tsx`'s
 * `toPprRequestDto` (which this mirrors exactly, now also carrying
 * `landingFeeCents`/`closedAt`).
 */
function toPprRequestDto(item: PprRequestListItem): PprRequestItemDto {
  return {
    ...item,
    locale: item.locale as 'it' | 'en',
    eta: item.eta.toISOString(),
    etd: item.etd ? item.etd.toISOString() : null,
    decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
    closedAt: item.closedAt ? item.closedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * PPR register (epic 8, story 8.3, AC 1/2; FR-24) — the filterable
 * complement to `/dashboard/ppr`'s queue: same `ppr.manage` gate, but shows
 * every status (default `APPROVED`, the actionable subset a staff member
 * lands here to close out, DELIBERATELY different from the queue's own
 * `PENDING` default — a page-level UI choice, NOT a change to
 * `listPprRequests`'s own service default, which the 8.2 contract keeps at
 * `PENDING` for any caller that omits `status` entirely, Dev Notes) plus an
 * optional `from`/`to` period bounding `eta`. "Completa"/"Annulla PPR"
 * (`PprRegister`) render only on `APPROVED` rows — every other status is
 * read-only history here (Dev Notes: "la coda 8.2 NON cambia" — approve/
 * reject stay exclusively on the queue page).
 */
export default async function PprRegisterPage({ params, searchParams }: PageProps) {
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

  const status = sanitizeStatus(sp.status) ?? 'APPROVED';
  const from = sanitizeDateParam(sp.from);
  const to = sanitizeDateParam(sp.to);

  const registerQuery = { pageSize: REGISTER_PAGE_SIZE, status, from, to };
  let page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  let result = await listPprRequests(actor, { ...registerQuery, page });
  // Clamp an out-of-range ?page to the last real page (same pattern as `FlightsPage`/`FinancePage`).
  const lastPage = Math.max(1, Math.ceil(result.total / REGISTER_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    result = await listPprRequests(actor, { ...registerQuery, page });
  }
  const totalPages = Math.max(1, Math.ceil(result.total / REGISTER_PAGE_SIZE));

  const filters: PprRegisterFilters = { status, from: from ?? '', to: to ?? '' };
  const filterQuery = {
    ...(status !== 'APPROVED' ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/ppr/register', query: { page: targetPage, ...filterQuery } };
  }

  const t = await getTranslations('PprRegisterPage');

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#787774]">{t('description')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/ppr"
              locale={locale as AppLocale}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('backToQueue')}
            </Link>
            <Link
              href="/dashboard"
              locale={locale as AppLocale}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('backToDashboard')}
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <PprRegister
            // Remounts on every filter/page navigation (same idiom as
            // `FlightsManager`'s own `key`): the parent server component
            // re-queries and passes fresh `initialRequests`, and this `key`
            // forces the client component's own local state to start clean.
            key={JSON.stringify({ page, ...filterQuery })}
            requests={result.items.map(toPprRequestDto)}
            locale={locale as 'it' | 'en'}
            filters={filters}
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
              table: {
                pprNumber: t('table.pprNumber'),
                requester: t('table.requester'),
                aircraft: t('table.aircraft'),
                eta: t('table.eta'),
                status: t('table.status'),
                fee: t('table.fee'),
                actions: t('table.actions'),
                noValue: t('table.noValue'),
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
              feedback: {
                completed: t('feedback.completed'),
                cancelled: t('feedback.cancelled'),
                conflictError: t('feedback.conflictError'),
                genericError: t('feedback.genericError'),
              },
              empty: t('empty'),
            }}
          />

          {totalPages > 1 ? (
            <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-[#787774]" data-testid="ppr-register-pagination">
              <Link
                href={pageHref(page - 1)}
                locale={locale as AppLocale}
                aria-disabled={page <= 1}
                className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                  page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
                }`}
              >
                &larr;
              </Link>
              <span data-testid="ppr-register-pagination-status">
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
                &rarr;
              </Link>
            </nav>
          ) : null}
        </div>
      </div>
    </main>
  );
}
