import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getMe } from '@/server/services/me.service';
import { visibleNavItems } from './nav-items';
import { SidebarNav } from './sidebar-nav';
import { Topbar } from './topbar';

type DashboardLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * Desktop-like app shell (story 12.2, FR-48): a `layout.tsx` at the
 * `dashboard/` folder covers exactly `/dashboard/**` — Next.js never
 * re-renders it while navigating between its children, which IS the
 * "persistent sidebar/topbar" requirement (AC 1), no client-side trickery
 * needed. `h-dvh` + `overflow-y-auto` on the content column only (AC 2)
 * means sidebar/topbar stay fixed and only the page content scrolls.
 *
 * Actor/me/nav items are fetched ONCE here (AC 5) for the shell's own needs
 * (nav gating, identity, redirect-if-unauthenticated); each page.tsx still
 * does its own `getSessionActor()`/permission checks for ITS OWN gating
 * (AD-5: the UI is never the only guardian) — that's unchanged, this layer
 * is additive.
 */
export default async function DashboardLayout({ children, params }: DashboardLayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return null;
  }

  const me = await getMe(actor);
  const displayName = me.person ? `${me.person.firstName} ${me.person.lastName}` : me.email;

  const t = await getTranslations('DashboardPage');
  const tShell = await getTranslations('DashboardShell');

  const sidebarItems = visibleNavItems(actor).map((item) => ({
    key: item.key,
    href: item.href,
    label: t(`nav.${item.key}`),
  }));

  // Story 12.6 (AC 2/3/4) — the command palette's "Vai a" group reuses the
  // SAME resolved items/gating as the sidebar (identical data, passed
  // plain); "Crea"/"Risultati" reuse the permissions that already gate the
  // equivalent existing buttons/endpoints (see `command-palette.tsx`'s own
  // prop doc-comments for exactly which ones and why).
  const canRegisterFlight = hasPermission(actor, 'flights.manage');
  const canCreatePerson = hasPermission(actor, 'people.read');
  const canSearch = hasPermission(actor, 'people.read') && hasPermission(actor, 'aircraft.manage');

  return (
    <div className="flex h-dvh flex-col bg-canvas sm:flex-row">
      <aside className="shrink-0 border-b border-hairline bg-surface-alt px-3 py-2 sm:h-dvh sm:w-56 sm:border-b-0 sm:border-r sm:px-4 sm:py-8">
        <SidebarNav items={sidebarItems} navHeading={t('navHeading')} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          locale={locale as AppLocale}
          displayName={displayName}
          logoutLabel={t('logout')}
          switchLocaleLabel={tShell('switchTo')}
          navItems={sidebarItems}
          canRegisterFlight={canRegisterFlight}
          canCreatePerson={canCreatePerson}
          canSearch={canSearch}
        />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
