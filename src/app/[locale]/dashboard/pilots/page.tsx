import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildExportHref } from '@/lib/export-href';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { redirect } from '@/i18n/navigation';
import { listPilotsPageData } from '@/server/services/people.service';
import { PilotsConsole, type PilotRow } from './pilots-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; includeArchived?: string }>;
};

const PAGE_SIZE = 20;

/**
 * Pilots registry (story 12.6) — AirOps-native rebuild of the legacy
 * `/dashboard/people` list (story 2.1+), which this story deletes.
 * `hasPermission` here only decides whether to *redirect* (AD-5); every
 * service call re-checks its own permission gate (`people.read` for the
 * list, `people.manage`/`finance.manage`/`users.manage` for the row actions
 * — RBAC is INVARIANT, D13: nothing here widens or narrows a permission).
 *
 * The three enrichment columns (saldo/ultimo volo/stato utente, AC 1) come
 * from ONE composite reader, `listPilotsPageData` — see its own doc-comment
 * for the batched-not-N+1 rationale.
 */
export default async function PilotsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam, q, includeArchived: includeArchivedParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'people.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const includeArchived = includeArchivedParam === 'true';

  const result = await listPilotsPageData(actor, { page, pageSize: PAGE_SIZE, q, includeArchived });

  const t = await getTranslations('PilotsPage');
  const tExport = await getTranslations('Export');
  // Reused verbatim (not duplicated): the profile-activation section reuses
  // the SAME upsert/deactivate endpoints and copy as the legacy `[id]`
  // scheda's `ProfilesPanel` (story 2.2) — only the visual shell changes.
  const tProfiles = await getTranslations('PeoplePage');
  // Reused verbatim: the Access section's role checkboxes are the same
  // roles/labels as the (still-alive) `/dashboard/users` page.
  const tUsers = await getTranslations('UsersPage');
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const exportHref = buildExportHref('/api/v1/people', { q, includeArchived: includeArchived ? 'true' : undefined }, locale);

  const items: PilotRow[] = result.items.map((item) => ({
    id: item.id,
    firstName: item.firstName,
    lastName: item.lastName,
    email: item.email,
    phone: item.phone,
    address: item.address,
    fiscalCode: item.fiscalCode,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    profiles: item.profiles,
    balanceCents: item.balanceCents,
    lastFlightDate: item.lastFlightDate,
    user: item.user,
  }));

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { total: result.totalCount, suspended: result.suspendedCount })}</div>
        </div>
      </div>

      <PilotsConsole
        key={JSON.stringify({ page, q: q ?? '', includeArchived })}
        items={items}
        page={page}
        totalPages={totalPages}
        initialQuery={q ?? ''}
        initialIncludeArchived={includeArchived}
        canManagePeople={hasPermission(actor, 'people.manage')}
        canManageFinance={hasPermission(actor, 'finance.manage')}
        canManageUsers={hasPermission(actor, 'users.manage')}
        exportHref={exportHref}
        locale={locale as 'it' | 'en'}
        labels={{
          cardTitle: t('cardTitle'),
          searchPlaceholder: t('searchPlaceholder'),
          includeArchivedLabel: t('includeArchivedLabel'),
          empty: t('empty'),
          newPilot: t('newPilot'),
          exportLabel: tExport('button'),
          exportXls: tExport('button'),
          pagination: { prev: t('pagination.prev'), next: t('pagination.next') },
          table: {
            name: t('table.name'),
            email: t('table.email'),
            balance: t('table.balance'),
            lastFlight: t('table.lastFlight'),
            role: t('table.role'),
            status: t('table.status'),
            actions: t('table.actions'),
            noValue: t('table.noValue'),
          },
          role: { pilot: tProfiles('profilesPanel.pilot.title'), student: tProfiles('profilesPanel.student.title'), instructor: tProfiles('profilesPanel.instructor.title') },
          profileBadge: {
            pilot: tProfiles('profilesPanel.badges.pilot'),
            student: tProfiles('profilesPanel.badges.student'),
            instructor: tProfiles('profilesPanel.badges.instructor'),
          },
          status: { active: t('status.active'), suspended: t('status.suspended'), none: t('status.none') },
          actions: { edit: t('actions.edit'), topUp: t('actions.topUp'), suspend: t('actions.suspend'), reactivate: t('actions.reactivate') },
          topUp: {
            title: t('topUp.title'),
            amount: t('topUp.amount'),
            paymentMethod: t('topUp.paymentMethod'),
            paymentMethods: {
              cash: t('topUp.paymentMethods.cash'),
              bankTransfer: t('topUp.paymentMethods.bankTransfer'),
              pos: t('topUp.paymentMethods.pos'),
            },
            effectiveDate: t('topUp.effectiveDate'),
            description: t('topUp.description'),
            submit: t('topUp.submit'),
            cancel: t('topUp.cancel'),
            invalidAmount: t('topUp.invalidAmount'),
            requiredField: t('topUp.requiredField'),
            genericError: t('topUp.genericError'),
          },
          editor: {
            newTitle: t('editor.newTitle'),
            newSubtitle: t('editor.newSubtitle'),
            closeLabel: t('editor.closeLabel'),
            cancel: t('editor.cancel'),
            submitCreate: t('editor.submitCreate'),
            submitEdit: t('editor.submitEdit'),
            identity: {
              sectionTitle: t('editor.identity.sectionTitle'),
              firstName: t('editor.identity.firstName'),
              lastName: t('editor.identity.lastName'),
              email: t('editor.identity.email'),
              phone: t('editor.identity.phone'),
              address: t('editor.identity.address'),
              fiscalCode: t('editor.identity.fiscalCode'),
            },
            profiles: {
              sectionTitle: t('editor.profiles.sectionTitle'),
              status: {
                active: tProfiles('profilesPanel.status.active'),
                inactive: tProfiles('profilesPanel.status.inactive'),
                notActivated: tProfiles('profilesPanel.status.notActivated'),
              },
              actions: {
                activate: tProfiles('profilesPanel.actions.activate'),
                edit: tProfiles('profilesPanel.actions.edit'),
                reactivate: tProfiles('profilesPanel.actions.reactivate'),
                deactivate: tProfiles('profilesPanel.actions.deactivate'),
                confirmDeactivate: tProfiles('profilesPanel.actions.confirmDeactivate'),
                confirmYes: tProfiles('profilesPanel.actions.confirmYes'),
                confirmCancel: tProfiles('profilesPanel.actions.confirmCancel'),
                cancel: tProfiles('profilesPanel.actions.cancel'),
                save: tProfiles('profilesPanel.actions.save'),
              },
              errors: { requiredField: tProfiles('profilesPanel.errors.requiredField'), generic: tProfiles('profilesPanel.errors.generic') },
              pilot: {
                title: tProfiles('profilesPanel.pilot.title'),
                licenseNumber: tProfiles('profilesPanel.pilot.licenseNumber'),
                licenseType: tProfiles('profilesPanel.pilot.licenseType'),
              },
              student: { title: tProfiles('profilesPanel.student.title'), courseStartDate: tProfiles('profilesPanel.student.courseStartDate') },
              instructor: { title: tProfiles('profilesPanel.instructor.title'), ratings: tProfiles('profilesPanel.instructor.ratings') },
            },
            certifications: {
              sectionTitle: t('editor.certifications.sectionTitle'),
              empty: t('editor.certifications.empty'),
              manageLink: t('editor.certifications.manageLink'),
              status: { ok: t('editor.certifications.status.ok'), expiring: t('editor.certifications.status.expiring'), expired: t('editor.certifications.status.expired') },
            },
            access: {
              sectionTitle: t('editor.access.sectionTitle'),
              noUser: t('editor.access.noUser'),
              email: t('editor.access.email'),
              roles: t('editor.access.roles'),
              roleOptions: {
                ADMIN: tUsers('roles.ADMIN'),
                STAFF: tUsers('roles.STAFF'),
                INSTRUCTOR: tUsers('roles.INSTRUCTOR'),
                PILOT: tUsers('roles.PILOT'),
                STUDENT: tUsers('roles.STUDENT'),
              },
              rolesRequired: t('editor.access.rolesRequired'),
              createSubmit: t('editor.access.createSubmit'),
              userSummary: t('editor.access.userSummary'),
              statusActive: t('editor.access.statusActive'),
              statusPending: t('editor.access.statusPending'),
              resendInvite: t('editor.access.resendInvite'),
              emailConflict: t('editor.access.emailConflict'),
              genericError: t('editor.access.genericError'),
            },
            archive: {
              sectionTitle: t('editor.archive.sectionTitle'),
              archive: t('editor.archive.archive'),
              unarchive: t('editor.archive.unarchive'),
              confirmArchive: t('editor.archive.confirmArchive'),
              confirmUnarchive: t('editor.archive.confirmUnarchive'),
              confirmYes: t('editor.archive.confirmYes'),
              confirmCancel: t('editor.archive.confirmCancel'),
            },
            errors: {
              required: t('editor.errors.required'),
              generic: t('editor.errors.generic'),
              conflictEmail: t('editor.errors.conflictEmail'),
            },
          },
          profile: {
            closeLabel: t('profile.closeLabel'),
            edit: t('profile.edit'),
            kpi: { balance: t('profile.kpi.balance'), lastFlight: t('profile.kpi.lastFlight'), recentFlights: t('profile.kpi.recentFlights') },
            noAccount: t('profile.noAccount'),
            archivedBadge: t('profile.archivedBadge'),
            certifications: {
              sectionTitle: t('profile.certifications.sectionTitle'),
              empty: t('profile.certifications.empty'),
              status: {
                ok: t('editor.certifications.status.ok'),
                expiring: t('editor.certifications.status.expiring'),
                expired: t('editor.certifications.status.expired'),
              },
            },
            recentFlights: {
              sectionTitle: t('profile.recentFlights.sectionTitle'),
              empty: t('profile.recentFlights.empty'),
              viewAll: t('profile.recentFlights.viewAll'),
              statement: t('profile.recentFlights.statement'),
            },
          },
          toast: {
            created: t('toast.created'),
            updated: t('toast.updated'),
            archived: t('toast.archived'),
            unarchived: t('toast.unarchived'),
            topUpRecorded: t('toast.topUpRecorded'),
            suspended: t('toast.suspended'),
            reactivated: t('toast.reactivated'),
            userCreated: t('toast.userCreated'),
            inviteResent: t('toast.inviteResent'),
            genericError: t('toast.genericError'),
            lastAdminError: t('toast.lastAdminError'),
          },
        }}
      />
    </main>
  );
}
