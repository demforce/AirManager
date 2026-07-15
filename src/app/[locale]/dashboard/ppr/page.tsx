import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getPprLandingFeeDefaultCents, getPprOperatingInstructions } from '@/server/services/app-settings.service';
import { listPprRequests, type PprRequestListItem } from '@/server/services/ppr.service';
import { ManualPprLaunchButton } from './manual-ppr-launch-button';
import { PprConsole } from './ppr-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; status?: string }>;
};

const QUEUE_PAGE_SIZE = 20;

/** Mirrors `listPprRequestsQuerySchema`'s status enum (AC 2) — includes `'ALL'`, same set the movements page's own filter offers. */
const QUEUE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'ALL'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

/** Hand-edited URL defense (same pattern as `movements/page.tsx#sanitizeStatus`): an invalid `?status` never errors, it silently falls back to the page's own default (`PENDING`, the 8.2 contract, unchanged). */
function sanitizeStatus(value: string | undefined): QueueStatus {
  return value && (QUEUE_STATUSES as readonly string[]).includes(value) ? (value as QueueStatus) : 'PENDING';
}

/**
 * Server-serialized `Date` fields to the wire DTO shape
 * (`pprRequestItemSchema`) — same rationale as the pre-12.4 page's own
 * `toPprRequestDto`. `fromPublicForm` (AC 1/2) is derived HERE, server-side,
 * from `createdByUserId` — the client component never sees the raw user id
 * (Dev Notes: "niente id utente nel DTO").
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
    fromPublicForm: item.createdByUserId === null,
  };
}

/**
 * PPR console (epic 8 stories 8.1/8.2; epic 12 story 12.4, AC 2) — rebuilt
 * in the AirOps visual language as `Ops.jsx#PPRView`: ONE full-width
 * "Richieste in arrivo" card, filterable by status (a real feature ADDED
 * beyond the static prototype, which shows every status in one unfiltered
 * table), Approve/Reject actions rendered ONLY on `PENDING` rows — no
 * "Riapri" (D13: the domain has no reopen-a-decided-PPR path,
 * `PPR_ALREADY_DECIDED`). Gated `ppr.manage` (staff + admin) — the redirect
 * here only hides navigation (AD-5, every service call re-checks its own
 * permission); the operating-instructions/landing-fee editor section is
 * additionally gated `settings.manage`, unchanged from before this story
 * (only reachable now behind the "Regole pubblicate" anchor scroll link,
 * rather than always rendered inline).
 */
export default async function PprConsolePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam, status: statusParam } = await searchParams;
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

  const canEditInstructions = hasPermission(actor, 'settings.manage');
  const status = sanitizeStatus(statusParam);

  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const results = await Promise.all([
    listPprRequests(actor, { status, page, pageSize: QUEUE_PAGE_SIZE }),
    // Card-head summary counts (AC 2, matches `Ops.jsx#PPRView`'s own "N in
    // attesa · N approvate · N rifiutate" sub-line) — independent of the
    // active status filter, so 3 cheap dedicated counts rather than reusing
    // the (possibly differently-filtered) main query's own total.
    listPprRequests(actor, { status: 'PENDING', page: 1, pageSize: 1 }),
    listPprRequests(actor, { status: 'APPROVED', page: 1, pageSize: 1 }),
    listPprRequests(actor, { status: 'REJECTED', page: 1, pageSize: 1 }),
    canEditInstructions ? getPprOperatingInstructions(actor) : Promise.resolve(null),
    canEditInstructions ? getPprLandingFeeDefaultCents(actor) : Promise.resolve(null),
  ]);
  let queueResult = results[0];
  const pendingCount = results[1].total;
  const approvedCount = results[2].total;
  const rejectedCount = results[3].total;
  const instructions = results[4];
  const landingFeeDefaultCents = results[5];
  // Clamp an out-of-range ?page to the last real page (same pattern as `FinancePage`/`FlightsPage`).
  const lastPage = Math.max(1, Math.ceil(queueResult.total / QUEUE_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    queueResult = await listPprRequests(actor, { status, page, pageSize: QUEUE_PAGE_SIZE });
  }
  const totalPages = Math.max(1, Math.ceil(queueResult.total / QUEUE_PAGE_SIZE));

  const t = await getTranslations('PprQueuePage');
  const displayLocale = locale as 'it' | 'en';

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/ppr' as const, query: { page: targetPage, ...(status !== 'PENDING' ? { status } : {}) } };
  }

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { pending: pendingCount, approved: approvedCount, rejected: rejectedCount })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn" href={`/${locale}/ppr`} target="_blank" rel="noopener noreferrer" data-testid="ppr-public-form-link">
            {t('header.publicForm')}
          </a>
          {canEditInstructions ? (
            <a className="btn" href="#ppr-instructions">
              {t('header.rules')}
            </a>
          ) : null}
          <ManualPprLaunchButton
            locale={locale as AppLocale}
            buttonLabel={t('header.manual')}
            successToast={t.raw('toast.manualCreated') as string}
            labels={{
              title: t('manualForm.title'),
              subtitle: t('manualForm.subtitle'),
              firstName: t('manualForm.firstName'),
              lastName: t('manualForm.lastName'),
              email: t('manualForm.email'),
              phone: t('manualForm.phone'),
              aircraftRegistration: t('manualForm.aircraftRegistration'),
              aircraftType: t('manualForm.aircraftType'),
              origin: t('manualForm.origin'),
              destination: t('manualForm.destination'),
              eta: t('manualForm.eta'),
              etd: t('manualForm.etd'),
              personsOnBoard: t('manualForm.personsOnBoard'),
              notes: t('manualForm.notes'),
              submit: t('manualForm.submit'),
              cancel: t('manualForm.cancel'),
              requiredField: t('manualForm.requiredField'),
              invalidEmail: t('manualForm.invalidEmail'),
              invalidRange: t('manualForm.invalidRange'),
              invalidPersons: t('manualForm.invalidPersons'),
              contactRequired: t('manualForm.contactRequired'),
              errors: {
                ETA_IN_PAST: t('manualForm.errors.ETA_IN_PAST'),
                ETD_NOT_AFTER_ETA: t('manualForm.errors.ETD_NOT_AFTER_ETA'),
                generic: t('manualForm.errors.generic'),
              },
            }}
          />
        </div>
      </div>

      <PprConsole
        // Remounts on every filter/page navigation (same idiom as
        // `movements/page.tsx#MovementsTable`'s own `key`): the parent
        // server component re-queries and passes fresh `requests`, and this
        // `key` forces the client component's own local state (which row's
        // reject mini-modal is open) to start clean rather than bleed
        // across different status/page views.
        key={JSON.stringify({ page, status })}
        requests={queueResult.items.map(toPprRequestDto)}
        locale={displayLocale}
        status={status}
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
          },
          card: { title: t('card.title'), subTemplate: t.raw('card.subTemplate') as string },
          table: {
            aircraft: t('table.aircraft'),
            requester: t('table.requester'),
            schedule: t('table.schedule'),
            persons: t('table.persons'),
            status: t('table.status'),
            actions: t('table.actions'),
          },
          badge: { fromPublicForm: t('badge.fromPublicForm') },
          actions: { approve: t('actions.approve'), reject: t('actions.reject') },
          rejectModal: {
            title: t('rejectModal.title'),
            subtitle: t('rejectModal.subtitle'),
            reasonPlaceholder: t('rejectModal.reasonPlaceholder'),
            reasonRequired: t('rejectModal.reasonRequired'),
            submit: t('rejectModal.submit'),
            cancel: t('rejectModal.cancel'),
          },
          toast: {
            approved: t.raw('toast.approved') as string,
            rejected: t('toast.rejected'),
            conflictError: t('toast.conflictError'),
            genericError: t('toast.genericError'),
          },
          empty: t('empty'),
        }}
        instructionsEditor={
          canEditInstructions && instructions && landingFeeDefaultCents !== null
            ? {
                initial: instructions,
                labels: {
                  heading: t('instructions.heading'),
                  description: t('instructions.description'),
                  it: t('instructions.it'),
                  en: t('instructions.en'),
                  save: t('instructions.save'),
                  saved: t('instructions.saved'),
                  error: t('instructions.error'),
                },
                landingFee: {
                  initialCents: landingFeeDefaultCents,
                  labels: {
                    heading: t('landingFee.heading'),
                    description: t('landingFee.description'),
                    amountLabel: t('landingFee.amountLabel'),
                    invalidAmount: t('landingFee.invalidAmount'),
                    save: t('landingFee.save'),
                    saved: t('landingFee.saved'),
                    error: t('landingFee.error'),
                  },
                },
              }
            : null
        }
      />

      {totalPages > 1 ? (
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }} data-testid="ppr-queue-pagination">
          <Link href={pageHref(page - 1)} locale={locale as AppLocale} aria-disabled={page <= 1} className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>
            &larr;
          </Link>
          <span className="mono" data-testid="ppr-queue-pagination-status">
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
