import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Role } from '@/generated/prisma/client';
import type { AvatarColor } from '@/components/ui/avatar';
import { ToastProvider } from '@/components/ui/toast';
import { MobileNav, type MobileNavItemView } from '@/components/shell/mobile-nav';
import { MobileTopBar } from '@/components/shell/mobile-top-bar';
import { Sidebar, type FlightCategory, type SidebarMetar } from '@/components/shell/sidebar';
import { NAV_GROUPS, mobileNavLayout, visibleNavItems, type NavItem, type NavItemId, NAV_ITEMS } from '@/components/shell/route-registry';
import type { Theme } from '@/components/shell/theme-toggle';
import { TopBar } from '@/components/shell/top-bar';
import { redirect } from '@/i18n/navigation';
import { signOut } from '@/server/auth/auth';
import { getSessionActor } from '@/server/auth/session';
import { getAirfieldBranding, getAirfieldIcao, getMetarStation } from '@/server/services/app-settings.service';
import { getOwnInstructorProfileId } from '@/server/services/bookings.service';
import { getMe } from '@/server/services/me.service';
import { getMetar, type MetarCategory } from '@/server/services/metar.service';

const METAR_CATEGORY_TO_FLIGHT_CATEGORY: Record<MetarCategory, FlightCategory> = { VFR: 'vfr', MVFR: 'mvfr', IFR: 'ifr' };

/** `"WIND 290@08"` / `"VIS 10KM"` / `"QNH 1017"` — 1:1 of `Sidebar.jsx:57-72`'s mono row, built here (server) so the client `Sidebar` stays a dumb renderer. */
function formatWeatherRow(metar: NonNullable<Awaited<ReturnType<typeof getMetar>>>): { windLabel: string; visLabel: string; qnhLabel: string } {
  return {
    windLabel: `WIND ${String(metar.windDir).padStart(3, '0')}@${String(metar.windKt).padStart(2, '0')}`,
    visLabel: `VIS ${Math.round(metar.visM / 1000)}KM`,
    qnhLabel: `QNH ${Math.round(metar.qnh)}`,
  };
}

const THEME_COOKIE = 'am-theme';

// Most-privileged-first — decides which role's label/avatar color the user
// chip shows for a multi-role actor (e.g. pilot+instructor sees "Istruttore").
const ROLE_PRIORITY: readonly Role[] = ['ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

const AVATAR_COLOR_BY_ROLE: Record<Role, AvatarColor> = {
  ADMIN: 'amber',
  INSTRUCTOR: '',
  PILOT: 'green',
  STUDENT: 'violet',
};

function primaryRole(roles: readonly Role[]): Role {
  // `roles` always holds at least one valid Role (session invariant) — the
  // fallback only satisfies TypeScript's control-flow analysis.
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? 'STUDENT';
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

/**
 * AirOps dashboard shell (story 12.1, AC 4) — replaces the ad-hoc
 * per-page "back to dashboard" chrome (no shared layout existed before
 * this story; every dashboard page rendered standalone) with the
 * real `Sidebar`/`TopBar`. Legacy pages are left untouched (no story 12.1
 * scope) and simply render as `{children}` inside `.main` — they keep
 * their own `<main>`/containers/auth-guard exactly as before, just nested
 * one level deeper.
 */
export default async function DashboardLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return null;
  }

  const [me, branding, icao, theme, metarStation, ownInstructorProfileId] = await Promise.all([
    getMe(actor),
    getAirfieldBranding(),
    getAirfieldIcao(),
    (async (): Promise<Theme> => ((await cookies()).get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light'))(),
    getMetarStation(),
    // Story 14.7, AC 4: only queried for an INSTRUCTOR-role actor (`getOwnInstructorProfileId`'s
    // own gate is `self.read`, granted to every role, so this would otherwise run one extra query
    // per page load for every non-instructor actor too) — decides whether the "I miei compensi" nav
    // item follows the actor's ACTIVE profile, not just the role (14.6 F2's lesson).
    actor.roles.includes('INSTRUCTOR') ? getOwnInstructorProfileId(actor) : Promise.resolve(null),
  ]);
  // Story 12.11, AC 5: depends on `metarStation` above, so it cannot join the `Promise.all` batch.
  const metarData = await getMetar(metarStation);

  const t = await getTranslations('shell');

  // Card hidden when null/unconfigured (story 12.1's existing `metar &&` guard in `Sidebar` — unchanged).
  const metar: SidebarMetar | undefined = metarData
    ? {
        weatherTitleLabel: t('weather.title'),
        station: metarStation,
        tempC: Math.round(metarData.tempC),
        category: METAR_CATEGORY_TO_FLIGHT_CATEGORY[metarData.category],
        categoryLabel: metarData.category,
        raw: metarData.raw,
        ...formatWeatherRow(metarData),
      }
    : undefined;

  // Story 14.7, AC 4: `visibleNavItems` is a pure per-role filter (module doc
  // comment) — the ONE item that also needs the actor's ACTIVE profile
  // (`myCompensation`) is filtered out here, surgically, rather than
  // widening the registry's contract for every item.
  const rawItems = visibleNavItems(actor.roles).filter((item) => item.id !== 'myCompensation' || ownInstructorProfileId !== null);
  const groups = NAV_GROUPS.map((groupId) => ({
    id: groupId,
    label: t(`groups.${groupId}`),
    items: rawItems
      .filter((item) => item.group === groupId)
      .map((item) => ({ id: item.id, href: item.href, icon: item.icon, label: t(`nav.${item.id}`) })),
  })).filter((group) => group.items.length > 0);

  // Story 15.1 (AC 2): the mobile tab bar is fed by the SAME `rawItems` the
  // sidebar groups above are built from — including the `myCompensation`
  // filter right above, which a second `visibleNavItems` call here would have
  // silently dropped (14.6 F2's lesson).
  const toMobileItem = (item: NavItem): MobileNavItemView => ({ id: item.id, href: item.href, icon: item.icon, label: t(`nav.${item.id}`) });
  const mobileLayout = mobileNavLayout(rawItems);

  // Review 14.6 F1: titles come from the FULL registry, not just the items
  // VISIBLE to this role — `TopBar` resolves the active item against the whole
  // registry, so a role-restricted route that is still SERVED (my-account, for
  // an admin) would otherwise render an empty breadcrumb instead of falling
  // back. Closes the class of bug, not just today's instance.
  const pageTitles = Object.fromEntries(NAV_ITEMS.map((item) => [item.id, t(`pageTitle.${item.id}`)])) as Record<NavItemId, string>;

  const displayName = me.person ? `${me.person.firstName} ${me.person.lastName}` : me.email;
  const role = primaryRole(actor.roles);
  const roleLabel = t(`roles.${role}`);
  // Story 15.1: one object for both bars (`TopBar` >640px, `MobileTopBar` below) — they must never show a different identity.
  const userChip = {
    displayName,
    fullLabel: `${displayName} · ${roleLabel}`,
    initials: initialsFor(displayName),
    color: AVATAR_COLOR_BY_ROLE[role],
  };

  /**
   * Story 12.12 fix (Dev Notes): the ONLY logout control in the app used to
   * live on the legacy home page's own `<form action={logoutAction}>` —
   * that page is gone (AC 6), so the AirOps shell (TopBar, every page)
   * needs its own, same pattern as before.
   */
  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: `/${locale}/login` });
  }

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar groups={groups} brandName="AirManager" brandSub={icao ? `${branding.name} · ${icao}` : branding.name} metar={metar} navLabel={t('navLabel')} />
        <div className="main">
          <TopBar
            brandName="AirManager"
            icao={icao}
            pageTitles={pageTitles}
            fallbackTitle={t('breadcrumb.fallback')}
            initialTheme={theme}
            themeToggleLabel={t('themeToggle.label')}
            localeSwitchLabel={t('localeSwitch.label')}
            userChip={userChip}
            logoutAction={logoutAction}
            logoutLabel={t('logout')}
          />
          <MobileTopBar
            brandName="AirManager"
            icao={icao}
            pageTitles={pageTitles}
            fallbackTitle={t('breadcrumb.fallback')}
            initialTheme={theme}
            themeToggleLabel={t('themeToggle.label')}
            localeSwitchLabel={t('localeSwitch.label')}
            userChip={userChip}
            roleLabel={roleLabel}
            profileLabel={t('mobile.profile')}
            logoutAction={logoutAction}
            logoutLabel={t('logout')}
          />
          {children}
          <MobileNav
            tabs={mobileLayout.tabs.map(toMobileItem)}
            more={mobileLayout.more.map(toMobileItem)}
            navLabel={t('navLabel')}
            moreLabel={t('mobile.more')}
            moreSheetLabel={t('mobile.moreSheet')}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
