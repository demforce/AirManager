'use client';

/**
 * Bottom tab bar + "Altro" sheet (story 15.1, epic 15 R1/R2) — the <=640px
 * counterpart of `Sidebar`, ported from the `AirOps Mobile` template's own
 * nav (fixed bar, 19px icon + 9.5px label + accent dot, sheet with a 2-column
 * grid of the remaining sections).
 *
 * Switch: CSS only (`airops.css`, `@media (max-width: 640px)`) — this tree is
 * `display: none` above 640px and the `Sidebar` is `display: none` below it,
 * so exactly ONE of the two is in the accessibility tree at any width and the
 * `navigation` landmark named "Aree operative" stays unique (lesson 103-F1).
 * No `matchMedia`, no user-agent sniffing, no parallel routes.
 *
 * Items come from `dashboard/layout.tsx` already filtered and translated (the
 * same array the `Sidebar` gets, `myCompensation` gate included) and already
 * split by `mobileNavLayout` — the registry stays the single source of truth
 * for href/icon/roles/slot.
 *
 * TESTID CONVENTION for the whole mobile epic (story 15.1, AC 7 — fixed here,
 * followed by 15.2+):
 * - the DESKTOP tree keeps its existing testids unchanged;
 * - a mobile surface that DUPLICATES a desktop one takes the desktop name
 *   plus a `-mobile` suffix (`logout-button-mobile`, `locale-switch-mobile`),
 *   so Playwright strict mode never sees two matches for one name;
 * - a surface that exists ONLY on mobile takes a plain new name prefixed
 *   `mobile-` (`mobile-tab-bar`, `mobile-tab-<navItemId>`, `mobile-more-sheet`,
 *   `mobile-more-<navItemId>`, `mobile-profile-menu`).
 */
import { useCallback, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { MobileSheet } from '@/components/ui/mobile-sheet';
import { Link, usePathname } from '@/i18n/navigation';
import type { NavIconKey, NavItemId } from './route-registry';

export type MobileNavItemView = {
  id: NavItemId;
  href: string;
  icon: NavIconKey;
  label: string;
};

export type MobileNavProps = {
  /** Tab bar entries, in slot order (`mobileNavLayout`). */
  tabs: MobileNavItemView[];
  /** Entries behind the "Altro" tab — empty for a role that sees <= 5 items, in which case no "Altro" tab is rendered at all. */
  more: MobileNavItemView[];
  /** Accessible name of the nav landmark — the SAME "Aree operative" the `Sidebar` uses (only one of the two is ever in the tree). */
  navLabel: string;
  /** "Altro" tab label. */
  moreLabel: string;
  /** Sheet section label ("Altre sezioni"), also the sheet's accessible name. */
  moreSheetLabel: string;
};

export function MobileNav({ tabs, more, navLabel, moreLabel, moreSheetLabel }: MobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  // Exact match, same semantics as `Sidebar` (a detail route outside the
  // registry lights up no tab). The "Altro" tab is active while the current
  // route is one of the sections it hides.
  const moreActive = more.some((item) => item.href === pathname);

  return (
    <>
      <nav className="mobile-tabbar" aria-label={navLabel} data-testid="mobile-tab-bar">
        {tabs.map((item) => {
          const active = pathname === item.href;
          const ItemIcon = Icon[item.icon];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`mobile-tab ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              data-testid={`mobile-tab-${item.id}`}
            >
              <ItemIcon />
              <span className="mobile-tab-label">{item.label}</span>
              <span className="mobile-tab-dot" />
            </Link>
          );
        })}
        {more.length > 0 && (
          <button
            type="button"
            className={`mobile-tab ${moreActive ? 'active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-testid="mobile-tab-more"
            onClick={() => setMoreOpen(true)}
          >
            <Icon.grid />
            <span className="mobile-tab-label">{moreLabel}</span>
            <span className="mobile-tab-dot" />
          </button>
        )}
      </nav>

      <MobileSheet open={moreOpen} onClose={closeMore} label={moreSheetLabel} testId="mobile-more-sheet">
        <div className="mobile-sheet-label">{moreSheetLabel}</div>
        <div className="mobile-sheet-grid">
          {more.map((item) => {
            const active = pathname === item.href;
            const ItemIcon = Icon[item.icon];
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`mobile-sheet-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={closeMore}
                data-testid={`mobile-more-${item.id}`}
              >
                <ItemIcon />
                {item.label}
              </Link>
            );
          })}
        </div>
      </MobileSheet>
    </>
  );
}
