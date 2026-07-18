'use client';

/**
 * `.sidebar` port (story 12.1, AC 4) — 1:1 DOM/classes of
 * `docs/design-reference/airops/src/Sidebar.jsx`, converted to real
 * `<Link>`s with `aria-current`. Nav items/labels/groups are resolved
 * server-side (`dashboard/layout.tsx`, house convention: client components
 * receive translated strings as props, never call `useTranslations`
 * themselves) — this component only owns active-route detection
 * (`usePathname`) and rendering.
 */
import { Icon } from '@/components/ui/icons';
import { Link, usePathname } from '@/i18n/navigation';
import type { NavGroupId, NavIconKey, NavItemId } from './route-registry';

export type SidebarNavItemView = {
  id: NavItemId;
  href: string;
  icon: NavIconKey;
  label: string;
};

export type SidebarNavGroupView = {
  id: NavGroupId;
  label: string;
  items: SidebarNavItemView[];
};

export type FlightCategory = 'vfr' | 'mvfr' | 'ifr';

/** Weather card data (story 12.1, AC 4: rendered ONLY when this prop is passed — no caller provides it yet, METAR wiring arrives in a later story). */
export type SidebarMetar = {
  weatherTitleLabel: string;
  station: string;
  tempC: number;
  category: FlightCategory;
  categoryLabel: string;
  raw: string;
  windLabel: string;
  visLabel: string;
  qnhLabel: string;
};

export type SidebarProps = {
  groups: SidebarNavGroupView[];
  brandName: string;
  brandSub: string;
  /** Optional per-item badge count text (story 12.1, AC 4: wired by later stories — always absent this story). */
  badges?: Partial<Record<NavItemId, string>>;
  metar?: SidebarMetar;
  /**
   * Accessible name for the nav landmark (story 12.12 AC 7): the legacy
   * home's own in-page "Aree operative" `<nav>` disappeared with the
   * widget-grid dashboard it lived on — this is now the ONE nav landmark
   * e2e specs scope role-based link assertions to (lesson 103-F1). `role`
   * is set explicitly (an `<aside>` defaults to `complementary`) rather
   * than restructuring the DOM into a nested `<nav>`.
   */
  navLabel: string;
};

export function Sidebar({ groups, brandName, brandSub, badges, metar, navLabel }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sidebar" role="navigation" aria-label={navLabel}>
      <div className="brand">
        <div className="brand-mark">
          <Icon.logo />
        </div>
        <div>
          <div className="brand-name">{brandName}</div>
          <div className="brand-sub">{brandSub}</div>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.id} className="nav-group">
          <div className="nav-label">{group.label}</div>
          {group.items.map((item) => {
            const active = pathname === item.href;
            const badge = badges?.[item.id];
            const ItemIcon = Icon[item.icon];
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`nav-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <ItemIcon />
                <span className="label-txt">{item.label}</span>
                {badge && <span className="badge">{badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}

      {metar && (
        <div className="weather-card">
          <div className="row">
            <span className="weather-title">{metar.weatherTitleLabel}</span>
            <span className="weather-station">{metar.station}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 28, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {metar.tempC}
              <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 500 }}>°C</span>
            </div>
            <div className="weather-flight">
              <span className={`flight-dot ${metar.category}`} />
              {metar.categoryLabel}
            </div>
          </div>
          <div className="weather-metar">{metar.raw}</div>
          <div className="row" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
            <span>{metar.windLabel}</span>
            <span>{metar.visLabel}</span>
            <span>{metar.qnhLabel}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
