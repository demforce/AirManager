'use client';

/**
 * `.topbar` port (story 12.1, AC 4) — 1:1 DOM/classes of
 * `docs/design-reference/airops/src/TopBar.jsx`. Breadcrumb title and
 * active-route detection are pathname-driven (`usePathname`, same registry
 * `Sidebar` uses) since a shared layout has no per-page prop to read the
 * current route from; every string is resolved server-side and passed in
 * (house convention — no `useTranslations` in client components).
 */
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { AvatarColor } from '@/components/ui/avatar';
import { Avatar } from '@/components/ui/avatar';
import { Link, usePathname } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
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
  /** Aria-label/title for the IT/EN switcher (AC 1, house convention: resolved server-side, never `useTranslations` in a client component) — the visible chip text is the target locale's own ISO code (`otherLocale.toUpperCase()`), not a translated string. */
  localeSwitchLabel: string;
  userChip: TopBarUserChip;
  /**
   * Server Action (story 12.12 fix — see `layout.tsx`'s own doc-comment):
   * the ONLY logout control in the app used to live on the legacy home
   * page's own form; that page is gone (story 12.12, AC 6), so the AirOps
   * shell needs its own. A Server Action reference IS a valid Server ->
   * Client Component prop (unlike a plain function).
   */
  logoutAction: () => Promise<void>;
  logoutLabel: string;
};

export function TopBar({
  brandName,
  icao,
  pageTitles,
  fallbackTitle,
  initialTheme,
  themeToggleLabel,
  localeSwitchLabel,
  userChip,
  logoutAction,
  logoutLabel,
}: TopBarProps) {
  const pathname = usePathname();
  const activeItem = findNavItemByPathname(pathname);
  const currentTitle = activeItem ? pageTitles[activeItem.id] : fallbackTitle;

  const locale = useLocale();
  const otherLocale: AppLocale = locale === 'it' ? 'en' : 'it';
  // Story 13.8 fix (review F1): `usePathname()` alone drops the query string
  // (view/date/page/filters — 11 dashboard pages read `searchParams`),
  // silently resetting the user's filters/view on every language switch.
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());

  return (
    <header className="topbar">
      {/* Review 15.10 LOW-3: the "/" between crumbs was classified DECORATION
          in the `--ink-4` census (threshold 3, 3.66/4.14 — it passes as one)
          but nothing made it a decoration: it is rendered text, exposed and
          read out. `aria-hidden` makes the classification TRUE instead of
          moving the glyph to a tone it does not need — the separator carries
          no information a screen reader has to hear between two crumbs. */}
      <div className="crumbs">
        <span>{brandName}</span>
        <span className="sep" aria-hidden="true">
          /
        </span>
        {icao && (
          <>
            <span>{icao}</span>
            <span className="sep" aria-hidden="true">
              /
            </span>
          </>
        )}
        <span className="cur">{currentTitle}</span>
      </div>
      <div className="topbar-spacer" />
      <Link
        href={{ pathname, query }}
        locale={otherLocale}
        className="iconbtn mono"
        title={localeSwitchLabel}
        aria-label={localeSwitchLabel}
        data-testid="locale-switch"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        {otherLocale.toUpperCase()}
      </Link>
      <ThemeToggle initialTheme={initialTheme} label={themeToggleLabel} />
      <div className="user-chip" title={userChip.fullLabel}>
        <Avatar init={userChip.initials} color={userChip.color} />
        <span className="user-chip-name" style={{ fontSize: 12.5, fontWeight: 500 }}>{userChip.displayName}</span>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="btn" data-testid="logout-button">
          {logoutLabel}
        </button>
      </form>
    </header>
  );
}
