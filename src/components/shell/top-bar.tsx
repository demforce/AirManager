'use client';

/**
 * `.topbar` port (story 12.1, AC 4) — 1:1 DOM/classes of
 * `docs/design-reference/airops/src/TopBar.jsx`. Breadcrumb title and
 * active-route detection are pathname-driven (`usePathname`, same registry
 * `Sidebar` uses) since a shared layout has no per-page prop to read the
 * current route from; every string is resolved server-side and passed in
 * (house convention — no `useTranslations` in client components).
 */
import type { AvatarColor } from '@/components/ui/avatar';
import { Avatar } from '@/components/ui/avatar';
import { usePathname } from '@/i18n/navigation';
import { ThemeToggle, type Theme } from './theme-toggle';
import { findNavItemByPathname, type NavItemId } from './route-registry';

export type TopBarUserChip = {
  displayName: string;
  fullLabel: string;
  initials: string;
  color: AvatarColor;
};

export type TopBarProps = {
  brandName: string;
  icao: string;
  pageTitles: Record<NavItemId, string>;
  fallbackTitle: string;
  initialTheme: Theme;
  themeToggleLabel: string;
  userChip: TopBarUserChip;
};

export function TopBar({ brandName, icao, pageTitles, fallbackTitle, initialTheme, themeToggleLabel, userChip }: TopBarProps) {
  const pathname = usePathname();
  const activeItem = findNavItemByPathname(pathname);
  const currentTitle = activeItem ? pageTitles[activeItem.id] : fallbackTitle;

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>{brandName}</span>
        <span className="sep">/</span>
        {icao && (
          <>
            <span>{icao}</span>
            <span className="sep">/</span>
          </>
        )}
        <span className="cur">{currentTitle}</span>
      </div>
      <div className="topbar-spacer" />
      <ThemeToggle initialTheme={initialTheme} label={themeToggleLabel} />
      <div className="user-chip" title={userChip.fullLabel}>
        <Avatar init={userChip.initials} color={userChip.color} />
        <span className="user-chip-name" style={{ fontSize: 12.5, fontWeight: 500 }}>{userChip.displayName}</span>
      </div>
    </header>
  );
}
