import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAvailablePersons, listUsers } from '@/server/services/users.service';
import { UsersManager } from './users-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;

/**
 * Admin-only user management (AC 1, 2 — `users.manage`, story 1.4's first
 * real dashboard sub-page). `hasPermission` here only decides whether to
 * *redirect*; `listUsers`/`listAvailablePersons` call `authorize()` again
 * (AD-5: the UI is never the only guardian).
 */
export default async function UsersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'users.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);

  const [usersResult, persons] = await Promise.all([
    listUsers(actor, { page, pageSize: PAGE_SIZE }),
    listAvailablePersons(actor),
  ]);

  const t = await getTranslations('UsersPage');
  const totalPages = Math.max(1, Math.ceil(usersResult.total / PAGE_SIZE));

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
          <UsersManager
            users={usersResult.items.map((user) => ({
              id: user.id,
              email: user.email,
              roles: user.roles,
              isActive: user.isActive,
              locale: user.locale,
              passwordSet: user.passwordSet,
              person: user.person,
            }))}
            persons={persons}
            labels={{
              newUser: t('newUser'),
              table: {
                email: t('table.email'),
                roles: t('table.roles'),
                status: t('table.status'),
                person: t('table.person'),
                locale: t('table.locale'),
                actions: t('table.actions'),
                noPerson: t('table.noPerson'),
                empty: t('table.empty'),
              },
              status: {
                active: t('status.active'),
                inactive: t('status.inactive'),
                pending: t('status.pending'),
              },
              roles: {
                ADMIN: t('roles.ADMIN'),
                STAFF: t('roles.STAFF'),
                INSTRUCTOR: t('roles.INSTRUCTOR'),
                PILOT: t('roles.PILOT'),
                STUDENT: t('roles.STUDENT'),
              },
              locales: {
                it: t('locales.it'),
                en: t('locales.en'),
              },
              actions: {
                edit: t('actions.edit'),
                deactivate: t('actions.deactivate'),
                activate: t('actions.activate'),
                resendInvite: t('actions.resendInvite'),
              },
              form: {
                createTitle: t('form.createTitle'),
                editTitle: t('form.editTitle'),
                email: t('form.email'),
                roles: t('form.roles'),
                locale: t('form.locale'),
                person: t('form.person'),
                personNone: t('form.personNone'),
                isActive: t('form.isActive'),
                submitCreate: t('form.submitCreate'),
                submitEdit: t('form.submitEdit'),
                cancel: t('form.cancel'),
                rolesRequired: t('form.rolesRequired'),
                genericError: t('form.genericError'),
                emailConflict: t('form.emailConflict'),
              },
              feedback: {
                created: t('feedback.created'),
                updated: t('feedback.updated'),
                inviteResent: t('feedback.inviteResent'),
              },
            }}
          />
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-mid-gray">
            <Link
              href={{ pathname: '/dashboard/users', query: { page: page - 1 } }}
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
              href={{ pathname: '/dashboard/users', query: { page: page + 1 } }}
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
