import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import type { ExpiryItemDto, ExpiryWindowDto } from '@/lib/schemas/expiries';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getMembershipFeeCents } from '@/server/services/app-settings.service';
import { getExpiryTierCounts, listAllExpiries, listPersonExpiries, type ExpiryListItem } from '@/server/services/expiries.service';
import { listExpiryTypes } from '@/server/services/expiry-types.service';
import { listPeople } from '@/server/services/people.service';
import { MyExpiries } from './my-expiries';
import { ScadenzeConsole, type ScadenzeFilters } from './scadenze-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    window?: string;
    expiryTypeId?: string;
    personQuery?: string;
  }>;
};

const REGISTRY_PAGE_SIZE = 20;
const OPTIONS_PAGE_SIZE = 100;
const WINDOWS: readonly ExpiryWindowDto[] = ['60', '30', '7', 'expired'];

function sanitizeWindow(value: string | undefined): ExpiryWindowDto | 'all' {
  return value && (WINDOWS as readonly string[]).includes(value) ? (value as ExpiryWindowDto) : value === 'all' ? 'all' : '60';
}

/** Same server-DTO-to-wire-DTO conversion as the pre-12.11 page (`pendingProposal.createdAt` Date -> ISO string) — `MyExpiries` receives its data as a plain server-component prop, but the DTO's own schema expects the wire shape. */
function toExpiryDto(item: ExpiryListItem): ExpiryItemDto {
  return {
    ...item,
    pendingProposal: item.pendingProposal ? { ...item.pendingProposal, createdAt: item.pendingProposal.createdAt.toISOString() } : null,
  };
}

/**
 * Scadenze (epic 6/7, epic 12 story 12.11) — AirOps-native, port of
 * `docs/design-reference/airops/src/ScadenzeView.jsx`. Two faces (Contesto,
 * unchanged since story 6.2): `expiries.manage` (staff/admin) gets the full
 * registry; everyone else (own-access, `self.read`) gets "Le mie scadenze".
 * Story 12.13 (ratifica utente 4b) retired the titolare-facing
 * propose/staff-decide queue this page used to also render.
 */
export default async function ExpiriesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
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
  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';

  if (canManage) {
    const canTriggerReminders = hasPermission(actor, 'settings.manage');
    const canChargeMembershipFee = hasPermission(actor, 'finance.manage');

    const window = sanitizeWindow(sp.window);
    const expiryTypeId = sp.expiryTypeId || undefined;
    const personQuery = sp.personQuery || undefined;

    // Sequential (not `Promise.all`): `listPeople` runs its own interactive
    // `$transaction` internally — same "never concurrent with another
    // `$transaction`-based read" constraint as the billing/fleet/logbook pages.
    const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, profile: 'pilot-or-student', includeArchived: false });
    const personOptions = peopleResult.items.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));

    const allTypes = await listExpiryTypes(actor, { includeInactive: false });
    const typeOptions = allTypes.map((type) => ({ id: type.id, name: type.name }));

    const tierCounts = await getExpiryTierCounts(actor);
    const membershipFeeCents = await getMembershipFeeCents(actor);

    const registryQuery = {
      ...(window !== 'all' ? { window } : {}),
      expiryTypeId,
      personQuery,
      pageSize: REGISTRY_PAGE_SIZE,
    };
    let page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
    let registryResult = await listAllExpiries(actor, { ...registryQuery, page });
    const registryLastPage = Math.max(1, Math.ceil(registryResult.total / REGISTRY_PAGE_SIZE));
    if (page > registryLastPage) {
      page = registryLastPage;
      registryResult = await listAllExpiries(actor, { ...registryQuery, page });
    }
    const registryTotalPages = Math.max(1, Math.ceil(registryResult.total / REGISTRY_PAGE_SIZE));

    const exportFilterQuery = { expiryTypeId, scope: undefined, status: undefined };
    const exportHref = buildExportHref('/api/v1/expiries', exportFilterQuery, locale);
    const exportPdfHref = buildPdfExportHref('/api/v1/expiries/pdf', exportFilterQuery, locale);

    const filters: ScadenzeFilters = { window, expiryTypeId: expiryTypeId ?? '', personQuery: personQuery ?? '' };

    return (
      <main className="page">
        <div className="page-head">
          <div className="page-title-block">
            <h1>{t('title')}</h1>
            <div className="sub">{t('sub', { count: tierCounts.expired + tierCounts.within7 + tierCounts.within30 + tierCounts.within60 })}</div>
          </div>
        </div>

        <ScadenzeConsole
          items={registryResult.items}
          page={page}
          totalPages={registryTotalPages}
          totalShown={registryResult.total}
          tierCounts={tierCounts}
          filters={filters}
          typeOptions={typeOptions}
          personOptions={personOptions}
          canTriggerReminders={canTriggerReminders}
          canChargeMembershipFee={canChargeMembershipFee}
          membershipFeeCents={membershipFeeCents}
          exportHref={exportHref}
          exportPdfHref={exportPdfHref}
          locale={displayLocale}
          labels={{
            cardTitle: t('registry.cardTitle'),
            // `t.raw` (not `t`): `{count}` is interpolated CLIENT-SIDE
            // (`scadenze-console.tsx`'s own `.replace(...)`, the shown count
            // changes with client-only filters) — `t()` would try to
            // interpolate immediately server-side and throw `FORMATTING_ERROR`.
            shown: t.raw('registry.shown') as string,
            segmented: {
              win60: t('registry.segmented.win60'),
              win30: t('registry.segmented.win30'),
              win7: t('registry.segmented.win7'),
              expired: t('registry.segmented.expired'),
              all: t('registry.segmented.all'),
            },
            filters: {
              allTypes: t('registry.filters.allTypes'),
              allPilots: t('registry.filters.allPilots'),
              pilot: t('registry.filters.pilot'),
              personSearchPlaceholder: t('registry.filters.personSearchPlaceholder'),
              reset: t('registry.filters.reset'),
            },
            table: {
              pilot: t('registry.table.pilot'),
              type: t('registry.table.type'),
              certificate: t('registry.table.certificate'),
              expiresAt: t('registry.table.expiresAt'),
              daysLeft: t('registry.table.daysLeft'),
              status: t('registry.table.status'),
              empty: t('registry.table.empty'),
            },
            statCards: {
              expired: t('registry.statCards.expired'),
              expiredNote: t('registry.statCards.expiredNote'),
              within7: t('registry.statCards.within7'),
              within7Note: t('registry.statCards.within7Note'),
              within30: t('registry.statCards.within30'),
              within30Note: t('registry.statCards.within30Note'),
              within60: t('registry.statCards.within60'),
              within60Note: t('registry.statCards.within60Note'),
            },
            status: {
              expired: t('registry.status.expired'),
              within7: t('registry.status.within7'),
              within30: t('registry.status.within30'),
              within60: t('registry.status.within60'),
              ok: t('registry.status.ok'),
            },
            daysAgoSuffix: t('registry.daysAgoSuffix'),
            daysSuffix: t('registry.daysSuffix'),
            exportMenu: { label: t('registry.exportMenu.label'), xlsLabel: t('registry.exportMenu.xlsLabel'), pdfLabel: t('registry.exportMenu.pdfLabel') },
            // `sent`: `t.raw` — `{holders}`/`{digests}` interpolated CLIENT-SIDE (same rationale as `shown` above).
            reminders: { button: t('registry.reminders.button'), sent: t.raw('registry.reminders.sent') as string, error: t('registry.reminders.error') },
            membershipFee: {
              button: t('registry.membershipFee.button'),
              disabledHint: t('registry.membershipFee.disabledHint'),
              modalTitle: t('registry.membershipFee.modalTitle'),
              pilot: t('registry.membershipFee.pilot'),
              amount: t('registry.membershipFee.amount'),
              amountHint: t('registry.membershipFee.amountHint'),
              submit: t('registry.membershipFee.submit'),
              cancel: t('registry.membershipFee.cancel'),
              requiredPilot: t('registry.membershipFee.requiredPilot'),
              invalidAmount: t('registry.membershipFee.invalidAmount'),
              // `t.raw`: `{balance}`/`{expires}` interpolated CLIENT-SIDE (same rationale as `shown` above).
              success: t.raw('registry.membershipFee.success') as string,
              genericError: t('registry.membershipFee.genericError'),
              // `t.raw`: `{balance}`/`{amount}` interpolated CLIENT-SIDE, same reason as `success` above.
              insufficientBalance: t.raw('registry.membershipFee.insufficientBalance') as string,
              overrideCheckbox: t('registry.membershipFee.overrideCheckbox'),
            },
            pagination: { prev: '←', next: '→' },
          }}
        />
      </main>
    );
  }

  // Own-access — "Le mie scadenze" (AC 2). An actor with no linked
  // `personId` has nothing of their own: an empty page, never a query
  // (same rule as `listFlights`'s own-access branch, story 5.4).
  const myExpiries = actor.personId !== null ? await listPersonExpiries(actor, actor.personId) : [];

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('titleOwn')}</h1>
          <div className="sub">{t('descriptionOwn')}</div>
        </div>
      </div>

      <MyExpiries
        expiries={myExpiries.map(toExpiryDto)}
        labels={{
          empty: t('own.empty'),
          table: {
            type: t('own.table.type'),
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
          },
        }}
      />
    </main>
  );
}
