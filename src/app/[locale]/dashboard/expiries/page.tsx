import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { ExpiryItemDto, ExpiryProposalItemDto } from '@/lib/schemas/expiries';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listExpiryProposals, listPersonExpiries, type ExpiryListItem, type ExpiryProposalListItem } from '@/server/services/expiries.service';
import { listExpiryTypes } from '@/server/services/expiry-types.service';
import { MyExpiries } from './my-expiries';
import { ProposalsQueue } from './proposals-queue';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

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
 * The Scadenze landing (epic 6, stories 6.1/6.2) — two faces of the SAME
 * page, decided by `expiries.manage` (same dual-face pattern as
 * `FlightsPage`, story 5.4):
 *
 * - **Staff/admin** (`canManage`): unchanged catalogue link/stat from 6.1,
 *   PLUS the new "Coda proposte" section above it — the FIFO queue of
 *   PENDING `ExpiryUpdateProposal`s (AC 2), paginated (`?page=`) once past
 *   `PROPOSALS_PAGE_SIZE`.
 * - **Everyone else** (own-access, `self.read` — every role holds it):
 *   "Le mie scadenze" — the actor's own scadenze (status badges, same
 *   colors as the scheda persona's `ExpiriesPanel`) with a "Proponi
 *   aggiornamento" action per row (AC 2).
 *
 * Gate: `expiries.manage` OR `self.read` (redirect to `/dashboard`
 * otherwise — defense in depth only, AD-5: both services re-authorize).
 * Doc-comment (Dev Notes): story 6.4 replaces the staff section with the
 * real by-urgency dashboard; nothing from 6.4 is built here.
 */
export default async function ExpiriesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
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
    const activeTypes = await listExpiryTypes(actor, { includeInactive: false });

    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
    const proposalsResult = await listExpiryProposals(actor, { status: 'PENDING', page, pageSize: PROPOSALS_PAGE_SIZE });
    const totalPages = Math.max(1, Math.ceil(proposalsResult.total / PROPOSALS_PAGE_SIZE));

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
              {canManageSettings ? (
                <Link
                  href="/dashboard/expiries/types"
                  locale={locale as AppLocale}
                  className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                >
                  {t('manageTypes')}
                </Link>
              ) : null}
              <Link
                href="/dashboard"
                locale={locale as AppLocale}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('backToDashboard')}
              </Link>
            </div>
          </div>

          <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
            <h2 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
              {t('queue.heading')}
            </h2>
            <p className="mt-1 text-sm text-[#787774]">{t('queue.description')}</p>

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
              <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-[#787774]">
                <Link
                  href={{ pathname: '/dashboard/expiries', query: { page: page - 1 } }}
                  locale={locale as AppLocale}
                  aria-disabled={page <= 1}
                  className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                    page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
                  }`}
                >
                  &larr;
                </Link>
                <span>
                  {page} / {totalPages}
                </span>
                <Link
                  href={{ pathname: '/dashboard/expiries', query: { page: page + 1 } }}
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
          </section>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{t('stat.label')}</p>
              <p className="mt-3 font-[family-name:var(--font-serif)] text-4xl font-medium text-[#111111]">{activeTypes.length}</p>
              <p className="mt-1 text-sm text-[#787774]">{t('stat.hint')}</p>
            </div>

            <div className="rounded-[12px] border border-[#EAEAEA] bg-[#F7F6F3] p-6 sm:col-span-2">
              <p className="text-sm font-medium text-[#111111]">{t('placeholder.heading')}</p>
              <p className="mt-2 max-w-lg text-sm leading-[1.6] text-[#787774]">{t('placeholder.body')}</p>
            </div>
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
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
              {t('titleOwn')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#787774]">{t('descriptionOwn')}</p>
          </div>
          <Link
            href="/dashboard"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
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
