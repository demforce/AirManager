import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getPprLandingFeeDefaultCents, getPprOperatingInstructions } from '@/server/services/app-settings.service';
import { listPprRequests, type PprRequestListItem } from '@/server/services/ppr.service';
import { PprQueue } from './ppr-queue';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

const QUEUE_PAGE_SIZE = 20;

/**
 * Server-serialized `Date` fields converted to the ISO-string wire DTO shape
 * (`pprRequestItemSchema`) — same rationale as `expiries/page.tsx`'s
 * `toProposalDto`/`toExpiryDto`: props cross the server/client boundary
 * faithfully as `Date`, but the client component's OWN mutation responses
 * (fetch) only ever see ISO strings, so both are normalized to one shape
 * here rather than juggling two.
 */
function toPprRequestDto(item: PprRequestListItem): PprRequestItemDto {
  return {
    ...item,
    // `locale` is a plain string at the Prisma layer (schema.prisma's
    // doc-comment on `PprRequest.locale`) — always `'it'|'en'` in practice
    // (Zod-validated at write time, story 8.1); narrowed here the same way
    // `createPprRequest` narrows `input.locale as AppLocale` for the email.
    locale: item.locale as 'it' | 'en',
    eta: item.eta.toISOString(),
    etd: item.etd ? item.etd.toISOString() : null,
    decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
    closedAt: item.closedAt ? item.closedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Staff PPR approval queue (epic 8, story 8.2, AC 1/2; FR-23). Gated
 * `ppr.manage` (staff + admin) — the redirect here only hides navigation
 * (AD-5, every service call re-checks its own permission); the
 * operating-instructions EDITOR section is additionally gated
 * `settings.manage` (admin-only, Contesto: "SCOPO CONTROLLATO", NOT a
 * general `/settings` page) — `canEditInstructions` decides whether this
 * page even fetches the instructions at all, same "the page itself decides
 * what each role sees" split as `ExpiryTypesPage`'s `canManage`.
 */
export default async function PprQueuePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
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

  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const results = await Promise.all([
    listPprRequests(actor, { status: 'PENDING', page, pageSize: QUEUE_PAGE_SIZE }),
    canEditInstructions ? getPprOperatingInstructions(actor) : Promise.resolve(null),
    // Story 8.3, AC 1: the SAME settings section (gated `settings.manage`,
    // same as the instructions editor) also gains the default landing fee.
    canEditInstructions ? getPprLandingFeeDefaultCents(actor) : Promise.resolve(null),
  ]);
  let queueResult = results[0];
  const instructions = results[1];
  const landingFeeDefaultCents = results[2];
  // Clamp an out-of-range ?page to the last real page (same pattern as `FinancePage`/`FlightsPage`).
  const lastPage = Math.max(1, Math.ceil(queueResult.total / QUEUE_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    queueResult = await listPprRequests(actor, { status: 'PENDING', page, pageSize: QUEUE_PAGE_SIZE });
  }
  const totalPages = Math.max(1, Math.ceil(queueResult.total / QUEUE_PAGE_SIZE));

  const t = await getTranslations('PprQueuePage');
  const displayLocale = locale as 'it' | 'en';

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
              href="/dashboard/ppr/register"
              locale={locale as AppLocale}
              className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {t('registerLink')}
            </Link>
            <Link
              href="/dashboard"
              locale={locale as AppLocale}
              className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
            >
              {t('backToDashboard')}
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <PprQueue
            requests={queueResult.items.map(toPprRequestDto)}
            locale={displayLocale}
            labels={{
              table: {
                requester: t('table.requester'),
                aircraft: t('table.aircraft'),
                route: t('table.route'),
                eta: t('table.eta'),
                persons: t('table.persons'),
                actions: t('table.actions'),
              },
              detail: {
                show: t('detail.show'),
                hide: t('detail.hide'),
                email: t('detail.email'),
                phone: t('detail.phone'),
                etd: t('detail.etd'),
                noEtd: t('detail.noEtd'),
                notes: t('detail.notes'),
                noNotes: t('detail.noNotes'),
                locale: t('detail.locale'),
                localeIt: t('detail.localeIt'),
                localeEn: t('detail.localeEn'),
              },
              actions: {
                approve: t('actions.approve'),
                reject: t('actions.reject'),
                confirmApprove: t('actions.confirmApprove'),
                confirmYes: t('actions.confirmYes'),
                confirmCancel: t('actions.confirmCancel'),
                reasonLabel: t('actions.reasonLabel'),
                reasonRequired: t('actions.reasonRequired'),
                submitReject: t('actions.submitReject'),
                cancelReject: t('actions.cancelReject'),
              },
              feedback: {
                // `t.raw` (NOT `t`): leaves `{pprNumber}` unresolved for the
                // client to `.replace()` once the API responds with the
                // real number (pattern `finance/page.tsx`'s `reversalOfDate`).
                approved: t.raw('feedback.approved') as string,
                rejected: t('feedback.rejected'),
                conflictError: t('feedback.conflictError'),
                genericError: t('feedback.genericError'),
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
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-mid-gray" data-testid="ppr-queue-pagination">
            <Link
              href={{ pathname: '/dashboard/ppr', query: { page: page - 1 } }}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
              }`}
            >
              &larr;
            </Link>
            <span data-testid="ppr-queue-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={{ pathname: '/dashboard/ppr', query: { page: page + 1 } }}
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
      </div>
    </main>
  );
}
