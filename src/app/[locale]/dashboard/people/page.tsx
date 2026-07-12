import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref } from '@/lib/export-href';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listPeople } from '@/server/services/people.service';
import { PeopleManager } from './people-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; includeArchived?: string }>;
};

const PAGE_SIZE = 20;

/**
 * Staff/admin People CRUD (story 2.1, AC 1/2/3 — `people.read`/`people.manage`).
 * `hasPermission` here only decides whether to *redirect*; `listPeople` calls
 * `authorize()` again (AD-5: the UI is never the only guardian).
 */
export default async function PeoplePage({ params, searchParams }: PageProps) {
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

  const peopleResult = await listPeople(actor, { page, pageSize: PAGE_SIZE, q, includeArchived });

  const t = await getTranslations('PeoplePage');
  const tExport = await getTranslations('Export');
  const totalPages = Math.max(1, Math.ceil(peopleResult.total / PAGE_SIZE));

  // Story 10.1 (AC 5): the SAME filters the list above was fetched with — a
  // server-driven view, so `searchParams` (not a client-side state snapshot)
  // is the live filter state (Dev Notes).
  const exportHref = buildExportHref('/api/v1/people', { q, includeArchived: includeArchived ? 'true' : undefined }, locale);

  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/people',
      query: { page: targetPage, ...(q ? { q } : {}), ...(includeArchived ? { includeArchived: 'true' } : {}) },
    };
  }

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
        </div>

        <div className="mt-10">
          <PeopleManager
            people={peopleResult.items.map((person) => ({
              id: person.id,
              firstName: person.firstName,
              lastName: person.lastName,
              email: person.email,
              phone: person.phone,
              address: person.address,
              fiscalCode: person.fiscalCode,
              archivedAt: person.archivedAt ? person.archivedAt.toISOString() : null,
              profiles: person.profiles,
            }))}
            initialQuery={q ?? ''}
            initialIncludeArchived={includeArchived}
            exportHref={exportHref}
            exportLabel={tExport('button')}
            labels={{
              newPerson: t('newPerson'),
              searchPlaceholder: t('searchPlaceholder'),
              includeArchivedLabel: t('includeArchivedLabel'),
              table: {
                name: t('table.name'),
                email: t('table.email'),
                phone: t('table.phone'),
                status: t('table.status'),
                profiles: t('table.profiles'),
                actions: t('table.actions'),
                noValue: t('table.noValue'),
                empty: t('table.empty'),
              },
              status: {
                active: t('status.active'),
                archived: t('status.archived'),
              },
              actions: {
                edit: t('actions.edit'),
                archive: t('actions.archive'),
                unarchive: t('actions.unarchive'),
                confirmArchive: t('actions.confirmArchive'),
                confirmUnarchive: t('actions.confirmUnarchive'),
                confirmYes: t('actions.confirmYes'),
                confirmCancel: t('actions.confirmCancel'),
                profiles: t('actions.profiles'),
              },
              profilesPanel: {
                heading: t('profilesPanel.heading'),
                close: t('profilesPanel.close'),
                loadError: t('profilesPanel.loadError'),
                badges: {
                  pilot: t('profilesPanel.badges.pilot'),
                  student: t('profilesPanel.badges.student'),
                  instructor: t('profilesPanel.badges.instructor'),
                },
                status: {
                  active: t('profilesPanel.status.active'),
                  inactive: t('profilesPanel.status.inactive'),
                  notActivated: t('profilesPanel.status.notActivated'),
                },
                actions: {
                  activate: t('profilesPanel.actions.activate'),
                  edit: t('profilesPanel.actions.edit'),
                  reactivate: t('profilesPanel.actions.reactivate'),
                  deactivate: t('profilesPanel.actions.deactivate'),
                  confirmDeactivate: t('profilesPanel.actions.confirmDeactivate'),
                  confirmYes: t('profilesPanel.actions.confirmYes'),
                  confirmCancel: t('profilesPanel.actions.confirmCancel'),
                  cancel: t('profilesPanel.actions.cancel'),
                  save: t('profilesPanel.actions.save'),
                },
                errors: {
                  requiredField: t('profilesPanel.errors.requiredField'),
                  generic: t('profilesPanel.errors.generic'),
                },
                pilot: {
                  title: t('profilesPanel.pilot.title'),
                  licenseNumber: t('profilesPanel.pilot.licenseNumber'),
                  licenseType: t('profilesPanel.pilot.licenseType'),
                },
                student: {
                  title: t('profilesPanel.student.title'),
                  courseStartDate: t('profilesPanel.student.courseStartDate'),
                },
                instructor: {
                  title: t('profilesPanel.instructor.title'),
                  ratings: t('profilesPanel.instructor.ratings'),
                },
              },
              form: {
                createTitle: t('form.createTitle'),
                editTitle: t('form.editTitle'),
                firstName: t('form.firstName'),
                lastName: t('form.lastName'),
                email: t('form.email'),
                phone: t('form.phone'),
                address: t('form.address'),
                fiscalCode: t('form.fiscalCode'),
                submitCreate: t('form.submitCreate'),
                submitEdit: t('form.submitEdit'),
                cancel: t('form.cancel'),
                requiredField: t('form.requiredField'),
                genericError: t('form.genericError'),
                conflictError: t('form.conflictError'),
                role: t('form.role'),
                roleNone: t('form.roleNone'),
                profileError: t('form.profileError'),
                completeProfile: t('form.completeProfile'),
              },
              feedback: {
                created: t('feedback.created'),
                updated: t('feedback.updated'),
                archived: t('feedback.archived'),
                unarchived: t('feedback.unarchived'),
              },
            }}
          />
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-mid-gray">
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
              }`}
            >
              ←
            </Link>
            <span>
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
              }`}
            >
              →
            </Link>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
