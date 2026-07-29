'use client';

/**
 * Compact <=640px top bar + profile menu (story 15.1, AC 4/5 — epic 15 R5),
 * ported from the `AirOps Mobile` template's own header: square brand mark,
 * page title with a mono `brand · ICAO` sub-row, theme toggle, round avatar
 * button. Same CSS-only switch as `MobileNav` (`display: none` above 640px,
 * where the desktop `TopBar` is the visible one).
 *
 * Deliberately NOT ported from the template (epic 15, accepted assumptions):
 * the topbar clock and the "Accedi come" role switcher are prototype
 * artifacts. The avatar button opens the profile menu instead — the ONE
 * place, on mobile, where logout and the IT/EN switch live (R5).
 *
 * Strings arrive translated from `dashboard/layout.tsx` (house convention:
 * no `useTranslations` in client components); the page title uses the very
 * same `findNavItemByPathname` + `pageTitles` + fallback lookup as the
 * desktop `TopBar`, so the two never disagree.
 */
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icons';
import { Link, usePathname } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { MobileSheet } from './mobile-sheet';
import { findNavItemByPathname, type NavItemId } from './route-registry';
import { ThemeToggle, type Theme } from './theme-toggle';
import type { TopBarUserChip } from './top-bar';

export type MobileTopBarProps = {
  brandName: string;
  icao: string;
  pageTitles: Record<NavItemId, string>;
  fallbackTitle: string;
  initialTheme: Theme;
  themeToggleLabel: string;
  /** Aria-label/title of the IT/EN switch — same string the desktop `TopBar` uses; the visible chip is the target locale's own ISO code. */
  localeSwitchLabel: string;
  userChip: TopBarUserChip;
  /** Primary role of the actor, already translated (`shell.roles.*`) — the profile menu's identity sub-row. */
  roleLabel: string;
  /** Accessible name of the avatar button and of the profile sheet. */
  profileLabel: string;
  /** Same Server Action the desktop `TopBar` submits (passed down from the layout). */
  logoutAction: () => Promise<void>;
  logoutLabel: string;
};

export function MobileTopBar({
  brandName,
  icao,
  pageTitles,
  fallbackTitle,
  initialTheme,
  themeToggleLabel,
  localeSwitchLabel,
  userChip,
  roleLabel,
  profileLabel,
  logoutAction,
  logoutLabel,
}: MobileTopBarProps) {
  const pathname = usePathname();
  const activeItem = findNavItemByPathname(pathname);
  const currentTitle = activeItem ? pageTitles[activeItem.id] : fallbackTitle;

  const locale = useLocale();
  const otherLocale: AppLocale = locale === 'it' ? 'en' : 'it';
  // Story 13.8 fix (review F1), same reason as the desktop `TopBar`: dropping
  // the query string would silently reset the user's view/date/filters on
  // every language switch.
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());

  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  return (
    <>
      <header className="mobile-topbar" data-testid="mobile-topbar">
        <div className="brand-mark">
          <Icon.logo />
        </div>
        <div className="mobile-topbar-titles">
          <div className="mobile-topbar-title">{currentTitle}</div>
          <div className="mobile-topbar-sub">{icao ? `${brandName} · ${icao}` : brandName}</div>
        </div>
        <ThemeToggle initialTheme={initialTheme} label={themeToggleLabel} />
        <button
          type="button"
          className="mobile-avatar-btn"
          aria-haspopup="dialog"
          aria-expanded={profileOpen}
          aria-label={profileLabel}
          data-testid="mobile-profile-button"
          onClick={() => setProfileOpen(true)}
        >
          <Avatar init={userChip.initials} color={userChip.color} />
        </button>
      </header>

      <MobileSheet open={profileOpen} onClose={closeProfile} label={profileLabel} testId="mobile-profile-menu">
        <div className="mobile-profile-id">
          <Avatar init={userChip.initials} color={userChip.color} />
          <div style={{ minWidth: 0 }}>
            <div className="mobile-profile-name">{userChip.displayName}</div>
            <div className="mobile-profile-role">{roleLabel}</div>
          </div>
        </div>
        <div className="mobile-sheet-rows">
          <Link
            href={{ pathname, query }}
            locale={otherLocale}
            className="mobile-sheet-row"
            title={localeSwitchLabel}
            onClick={closeProfile}
            data-testid="locale-switch-mobile"
          >
            {localeSwitchLabel}
            <span className="mono">{otherLocale.toUpperCase()}</span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="mobile-sheet-row" data-testid="logout-button-mobile">
              {logoutLabel}
            </button>
          </form>
        </div>
      </MobileSheet>
    </>
  );
}
