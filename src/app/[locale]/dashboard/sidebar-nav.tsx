'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/components/ui/cn';

export type SidebarNavItem = {
  key: string;
  href: string;
  label: string;
};

type SidebarNavProps = {
  items: SidebarNavItem[];
  navHeading: string;
};

/**
 * The sidebar IS the navigation landmark now (story 12.2, AC 4 — DESIGN.md
 * "Sidebar Surface"): `<nav aria-label>` = the same i18n `navHeading` string
 * the old home-page tile grid used, so `getByRole('navigation', { name:
 * 'Aree operative' })` (rbac.spec.ts and friends) keeps resolving here
 * unchanged. Items/labels are resolved server-side (`visibleNavItems` +
 * `t('nav.*')` in `layout.tsx`) and passed in as plain data — this
 * component only owns the active-item state, which needs the client-side
 * `usePathname()` (AC 1).
 *
 * Responsive (AC 8, "soluzione minima", no dedicated mobile cantiere): a
 * SINGLE `<nav>` — never duplicated in the DOM — that lays out as a
 * horizontally scrollable strip below `sm:` and a vertical list at `sm:`
 * and up, so the nav stays reachable at a ~390px viewport without any
 * toggle/JS state.
 */
export function SidebarNav({ items, navHeading }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={navHeading} className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-nested px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-ink text-surface-alt' : 'text-ink hover:bg-hairline/60',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
