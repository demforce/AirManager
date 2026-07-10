import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateTime } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { signOut } from '@/server/auth/auth';
import { getSessionActor } from '@/server/auth/session';
import { listPersonExpiries } from '@/server/services/expiries.service';
import { getMe } from '@/server/services/me.service';
import { listPprRequests } from '@/server/services/ppr.service';
import { ExpiryStatusBadge } from './expiries/expiry-status-badge';
import { visibleNavItems } from './nav-items';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Protected placeholder landing page (Task 3). Real role-based dashboard
 * areas (persone, velivoli, voli, ...) arrive with the corresponding
 * epics — this page only proves the login → session → logout loop (AC 1).
 *
 * `src/proxy.ts` already blocks unauthenticated requests before they reach
 * this route, but Auth.js's own guidance is not to rely on middleware
 * exclusively — the session is re-checked here, close to the data fetch.
 */
export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  // AD-1: pages read through services, never Prisma directly.
  const me = await getMe(actor);
  const displayName = me.person
    ? `${me.person.firstName} ${me.person.lastName}`
    : me.email;

  const t = await getTranslations('DashboardPage');
  const navItems = visibleNavItems(actor);

  /**
   * Story 2.3, Task 2: a self-service actor (pilot/student/instructor —
   * `self.read` but no `people.read`) has no "Persone" nav item to reach
   * their own scheda through, so this dashboard (which already loads `me`)
   * is the most coherent place to link it directly. Staff/admin reach any
   * scheda via the "Persone" list instead (nav item above), so this tile is
   * deliberately omitted for them.
   */
  const ownPersonHref =
    me.person && !hasPermission(actor, 'people.read') ? `/dashboard/people/${me.person.id}` : null;

  /**
   * Story 3.2, Task 2: the "Il mio conto" tile sits alongside "La mia
   * scheda" for the same self-service actor — staff/admin reach any
   * account's statement via the "Persone" list + scheda persona instead
   * (the "Estratto conto" link on `AccountPanel`), so this tile is
   * deliberately omitted for them too.
   */
  const ownAccountHref = ownPersonHref ? `${ownPersonHref}/account` : null;

  /**
   * Story 9.2 (FR-33): "Il mio diario" — the allievo's read-only entry point
   * into their own training diary. Same asymmetric-tile rule as
   * `ownPersonHref`/`ownAccountHref` above, gated on `me.person.hasActiveStudentProfile`
   * (the minimal flag `getMe` now exposes, Dev Notes) rather than on
   * `people.read`/`school.manage.*`: it targets whoever HAS a student
   * profile, regardless of role (e.g. a pilot+student dual role also sees
   * it) — the nav "Scuola" entry stays gated `school.manage.own` (the
   * istruttore's index page), unrelated to this tile.
   */
  const ownDiaryHref = me.person?.hasActiveStudentProfile ? `/dashboard/school/${me.person.id}` : null;

  /**
   * Story 6.4, Task 4 (Contesto): "Le mie scadenze" home widget — same
   * asymmetric-tile rule as `ownPersonHref`/`ownAccountHref` above: staff
   * has the real `/dashboard/expiries` dashboard, so this widget is
   * deliberately omitted for any actor holding `expiries.manage`, even one
   * also linked to a `Person`. `listPersonExpiries` is reused AS-IS (no new
   * service) — its own-access guard (`self.read` + matching `personId`)
   * is satisfied here by construction, since every role holds `self.read`
   * (`rbac.ts`) and `me.person.id` is this actor's own person by
   * definition. The section itself only renders below when non-empty (a
   * clean home for someone with no scadenze registered yet).
   */
  const canManageExpiries = hasPermission(actor, 'expiries.manage');
  const myExpiries = me.person && !canManageExpiries ? await listPersonExpiries(actor, me.person.id) : [];
  const tExpiries = await getTranslations('ExpiriesPage');
  const expiryStatusLabels: Record<ExpiryStatusDto, string> = {
    ok: tExpiries('own.table.status.ok'),
    expiring: tExpiries('own.table.status.expiring'),
    expired: tExpiries('own.table.status.expired'),
  };

  /**
   * Story 8.2, Task 6 (AC 2; FR-41): "PPR in attesa" home widget for staff.
   * INVERSE gate from `myExpiries` above (Contesto): this section renders
   * even when the queue is EMPTY — the zero count is itself information for
   * staff ("PPR in attesa" is a fixed panel of the role, not a
   * conditionally-hidden tile) — so the widget is gated purely on
   * `ppr.manage`, never on `pendingPprRequests.length`.
   */
  const canManagePpr = hasPermission(actor, 'ppr.manage');
  const pendingPprRequests = canManagePpr ? await listPprRequests(actor, { status: 'PENDING', page: 1, pageSize: 5 }) : null;

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: `/${locale}/login` });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 sm:px-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
            {t('kicker')}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('logout')}
            </button>
          </form>
        </div>

        <h1 className="mt-6 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
          {t('welcome', { name: displayName })}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-[1.6] text-[#787774]">{t('subtitle')}</p>

        <nav className="mt-10" aria-label={t('navHeading')}>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">{t('navHeading')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            {ownPersonHref ? (
              <Link
                href={ownPersonHref}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('myProfile')}
              </Link>
            ) : null}
            {ownAccountHref ? (
              <Link
                href={ownAccountHref}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('myAccount')}
              </Link>
            ) : null}
            {ownDiaryHref ? (
              <Link
                href={ownDiaryHref}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('myDiary')}
              </Link>
            ) : null}
          </div>
        </nav>

        {myExpiries.length > 0 ? (
          <section className="mt-10" data-testid="my-expiries-widget">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">{t('myExpiries.heading')}</p>
              <Link href="/dashboard/expiries" className="text-sm font-medium text-[#2F3437] underline-offset-4 hover:underline">
                {t('myExpiries.link')}
              </Link>
            </div>
            <div className="mt-4 divide-y divide-[#EAEAEA] rounded-[8px] border border-[#EAEAEA] bg-white">
              {myExpiries.map((expiry) => (
                <div
                  key={expiry.id}
                  data-testid="my-expiries-widget-row"
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[#111111]">{expiry.typeName}</p>
                    <p className="text-xs text-[#787774]">{expiry.expiresAt}</p>
                  </div>
                  <ExpiryStatusBadge
                    status={expiry.status}
                    label={expiryStatusLabels[expiry.status]}
                    data-testid="my-expiries-widget-badge"
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {canManagePpr && pendingPprRequests ? (
          <section className="mt-10" data-testid="ppr-pending-widget">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
                {t('pprPendingWidget.heading')} &middot; {t('pprPendingWidget.count', { count: pendingPprRequests.total })}
              </p>
              <Link href="/dashboard/ppr" className="text-sm font-medium text-[#2F3437] underline-offset-4 hover:underline">
                {t('pprPendingWidget.link')}
              </Link>
            </div>
            {pendingPprRequests.items.length === 0 ? (
              <p className="mt-4 text-sm text-[#787774]" data-testid="ppr-pending-widget-empty">
                {t('pprPendingWidget.empty')}
              </p>
            ) : (
              <div className="mt-4 divide-y divide-[#EAEAEA] rounded-[8px] border border-[#EAEAEA] bg-white">
                {pendingPprRequests.items.map((request) => (
                  <div
                    key={request.id}
                    data-testid="ppr-pending-widget-row"
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#111111]">
                        {request.firstName} {request.lastName} &middot; {request.aircraftRegistration}
                      </p>
                      <p className="text-xs text-[#787774]">{formatDateTime(request.eta, locale as 'it' | 'en')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
