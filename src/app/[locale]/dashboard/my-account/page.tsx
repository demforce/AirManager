import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getOwnAccountOverview, listOwnAccountMovements } from '@/server/services/accounts.service';
import { AccountSection, type AccountSectionLabels } from '../people/[id]/account-section';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

/** Same statement page size as the staff-facing scheda persona (`people/[id]/page.tsx`'s own, unexported `ACCOUNT_PAGE_SIZE`) — kept as its own local constant rather than a cross-page import: one page size, coincidentally shared, not a contract between the two pages. */
const ACCOUNT_PAGE_SIZE = 20;

/**
 * "Le mie transazioni" (story 14.6, AC 1/2/3) — a dedicated, sidebar-linked
 * self-service estratto conto for PILOT/STUDENT, distinct from the
 * staff-facing scheda persona (`/dashboard/people/[id]`, out of scope per
 * the story's "fuori scope dichiarato"). Reuses the SAME `AccountSection`
 * renderer the scheda persona uses (AC 3: "riuso... mai duplicare la
 * formattazione"), configured pilota-centric: `showActor`/`canManageFinance`
 * are always `false` here (no "registrato da" column, no top-up/rettifica
 * actions — a pilot can never top up their own account,
 * `accounts.service.ts#recordTopUp`'s own doc-comment), and its pagination
 * links point at THIS route via `AccountSection`'s `statementBasePath` override.
 *
 * Privacy/IDOR (AC 2/5): `getOwnAccountOverview`/`listOwnAccountMovements`
 * read `actor.personId` ONLY — this route's URL and query carry no personId
 * at all, so there is nothing for a probe to override; the staff-facing
 * `GET /api/v1/people/{id}/account/movements` (and its existing
 * 403-for-another-id e2e coverage) is completely untouched. Reachable by
 * ANY authenticated actor (`self.read`, granted to every role — same
 * universal-self-access convention as `expiries/page.tsx`'s own-access
 * branch): the sidebar entry is PILOT/STUDENT-only (presentation, AC 1),
 * but an admin/staff/instructor who navigates here directly just sees their
 * OWN (typically empty, since only pilot/student profiles ever create an
 * `Account`) statement — never anyone else's, so there is no privacy
 * concern in leaving the page itself universally reachable. An actor with
 * no linked person at all (AC 5 — e.g. an admin-managed login unlinked from
 * any `Person`) gets the same empty state, never a query.
 */
export default async function MyAccountPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  // Belt-and-braces (AD-5): `self.read` is granted to every role today (same
  // rationale as `me.service.ts#getMe`'s own comment), so this never actually
  // rejects a logged-in user — the call establishes the pattern regardless.
  if (!hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const t = await getTranslations('MyAccountPage');
  const tAccount = await getTranslations('AccountStatementPage');
  const tPilots = await getTranslations('PilotsPage');
  const tExport = await getTranslations('Export');

  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const overview = await getOwnAccountOverview(actor);
  let statement = await listOwnAccountMovements(actor, { page, pageSize: ACCOUNT_PAGE_SIZE });
  // Clamp an out-of-range ?page to the last real page (same guard the scheda persona uses).
  const lastPage = Math.max(1, Math.ceil(statement.total / ACCOUNT_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    statement = await listOwnAccountMovements(actor, { page, pageSize: ACCOUNT_PAGE_SIZE });
  }

  // Both endpoints re-check `self.read` + own-personId themselves (`assertReadAccess`,
  // reused via `listAccountMovements`/`exportAccountMovementsXlsx`/`exportAccountStatementPdf`)
  // — `actor.personId` here is server-resolved from the session, never client input.
  const exportHref = actor.personId ? buildExportHref(`/api/v1/people/${actor.personId}/account/movements`, {}, locale) : undefined;
  const exportPdfHref = actor.personId ? buildPdfExportHref(`/api/v1/people/${actor.personId}/account/pdf`, {}, locale) : undefined;

  const labels: AccountSectionLabels = {
    // Reuses the scheda persona's own card heading ("Estratto conto") rather
    // than repeating the page's `<h1>` ("Le mie transazioni") verbatim on
    // the card right below it — same text the staff-facing page already
    // shows for this exact card.
    heading: tAccount('kicker'),
    balanceLabel: t('balanceLabel'),
    noAccount: t('noAccount'),
    empty: tAccount('table.empty'),
    pagination: { prev: tPilots('pagination.prev'), next: tPilots('pagination.next') },
    table: {
      date: tAccount('table.date'),
      type: tAccount('table.type'),
      description: tAccount('table.description'),
      amount: tAccount('table.amount'),
      // `recordedBy`/`actions` omitted (review 14.6 F6): `showActor` and
      // `canManageFinance` are both false here, so those columns never render.
      noValue: tAccount('table.noValue'),
    },
    movementType: {
      topUp: tAccount('movementType.topUp'),
      adjustment: tAccount('movementType.adjustment'),
      packagePurchase: tAccount('movementType.packagePurchase'),
      flightCharge: tAccount('movementType.flightCharge'),
      flightChargeReversal: tAccount('movementType.flightChargeReversal'),
    },
    // `t.raw`: `{date}` is a literal placeholder the CLIENT fills in (same
    // rationale as the scheda persona's identical usage of these two keys).
    adjustmentBadge: { ofDate: tAccount.raw('adjustmentBadge.ofDate') as string, linked: tAccount('adjustmentBadge.linked') },
    reversalBadge: { ofDate: tAccount.raw('reversalBadge.ofDate') as string, linked: tAccount('reversalBadge.linked') },
    // `topUp`/`adjustments` deliberately omitted: `canManageFinance={false}`
    // below means their toggle buttons never render, so `AccountSection`
    // never needs these labels here (story 14.6 — a pilot cannot top up or
    // adjust their own account).
  };

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub')}</div>
        </div>
      </div>

      <AccountSection
        personId={actor.personId ?? ''}
        locale={locale as AppLocale}
        moneyLocale={displayLocale}
        hasAccount={overview.account !== null}
        balanceCents={overview.balanceCents}
        rows={statement.items}
        page={page}
        totalPages={Math.max(1, Math.ceil(statement.total / ACCOUNT_PAGE_SIZE))}
        showActor={false}
        canManageFinance={false}
        exportHref={exportHref}
        exportPdfHref={exportPdfHref}
        exportLabels={{ label: tExport('button'), xls: tExport('button'), pdf: tExport('buttonPdf') }}
        statementBasePath="/dashboard/my-account"
        labels={labels}
      />
    </main>
  );
}
