import { cookies } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Role } from '@/generated/prisma/client';
import type { AvatarColor } from '@/components/ui/avatar';
import { ToastProvider } from '@/components/ui/toast';
import { Sidebar, type FlightCategory, type SidebarMetar } from '@/components/shell/sidebar';
import { NAV_GROUPS, visibleNavItems, type NavItemId } from '@/components/shell/route-registry';
import type { Theme } from '@/components/shell/theme-toggle';
import { TopBar } from '@/components/shell/top-bar';
import { redirect } from '@/i18n/navigation';
import { signOut } from '@/server/auth/auth';
import { getSessionActor } from '@/server/auth/session';
import { getAirfieldBranding, getAirfieldIcao, getMetarStation } from '@/server/services/app-settings.service';
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
const ROLE_PRIORITY: readonly Role[] = ['ADMIN', 'STAFF', 'INSTRUCTOR', 'PILOT', 'STUDENT'];

const AVATAR_COLOR_BY_ROLE: Record<Role, AvatarColor> = {
  ADMIN: 'amber',
  STAFF: 'amber',
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

  const [me, branding, icao, theme, metarStation] = await Promise.all([
    getMe(actor),
    getAirfieldBranding(),
    getAirfieldIcao(),
    (async (): Promise<Theme> => ((await cookies()).get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light'))(),
    getMetarStation(),
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

  const rawItems = visibleNavItems(actor.roles);
  const groups = NAV_GROUPS.map((groupId) => ({
    id: groupId,
    label: t(`groups.${groupId}`),
    items: rawItems
      .filter((item) => item.group === groupId)
      .map((item) => ({ id: item.id, href: item.href, icon: item.icon, label: t(`nav.${item.id}`) })),
  })).filter((group) => group.items.length > 0);

  const pageTitles = Object.fromEntries(rawItems.map((item) => [item.id, t(`pageTitle.${item.id}`)])) as Record<NavItemId, string>;

  const displayName = me.person ? `${me.person.firstName} ${me.person.lastName}` : me.email;
  const role = primaryRole(actor.roles);
  const roleLabel = t(`roles.${role}`);

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
            userChip={{
              displayName,
              fullLabel: `${displayName} · ${roleLabel}`,
              initials: initialsFor(displayName),
              color: AVATAR_COLOR_BY_ROLE[role],
            }}
            logoutAction={logoutAction}
            logoutLabel={t('logout')}
          />
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
