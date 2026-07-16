import type { Actor, Permission } from '@/server/auth/rbac';
import { hasPermission } from '@/server/auth/rbac';

export type NavItemKey =
  | 'people'
  | 'aircraft'
  | 'flights'
  | 'bookings'
  | 'finance'
  | 'school'
  | 'expiries'
  | 'ppr'
  | 'users'
  | 'settings';

export type NavItem = {
  key: NavItemKey;
  href: string;
  permissions: readonly Permission[];
};

/**
 * Placeholder dashboard navigation (Story 1.3, Task 3). Each entry becomes a
 * real section in a later epic (see the architecture spine's Capability →
 * Architecture Map) — for now the links only exist to prove role-based
 * filtering end-to-end (AC 2).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  // Story 2.1: the first real (non-placeholder) People sub-page. Story
  // 12.6: the legacy `/dashboard/people` list is gone — repointed at the new
  // AirOps Piloti page (same rationale as `aircraft` below: this entry still
  // has a consumer, `dashboard/page.tsx`'s own overview grid).
  { key: 'people', href: '/dashboard/pilots', permissions: ['people.read'] },
  // Story 2.4: repointed the same way people was in 2.1. Story 12.5: the
  // legacy `/dashboard/aircraft` page is gone — repointed at the new AirOps
  // fleet page (this entry still has a consumer, `dashboard/page.tsx`'s own
  // overview grid, so `nav-items.ts` itself stays; full removal is 12.13).
  { key: 'aircraft', href: '/dashboard/fleet', permissions: ['aircraft.manage'] },
  // Story 5.1: repointed the same way people/aircraft/finance were in
  // 2.1/2.4/3.3. Story 5.4 (FR-17): reopened to every role via `self.read` —
  // the page itself (own-access registry vs full staff manager) and the
  // service (`flights.service.ts#listFlights`) decide what each role sees.
  // Story 12.8: the legacy `/dashboard/flights` page is gone — repointed at
  // the new AirOps logbook (this entry still has a consumer,
  // `dashboard/page.tsx`'s own overview grid, so `nav-items.ts` itself stays;
  // full removal is 12.13).
  { key: 'flights', href: '/dashboard/logbook', permissions: ['flights.manage', 'self.read'] },
  // Story 7.1: repointed the same way people/aircraft/finance/flights/
  // expiries were in 2.1/2.4/3.3/5.4/6.2. Story 7.2 (FR-19): reopened to
  // every role via `self.read` — same pattern as `flights`/`expiries` in
  // 5.4/6.2: the page itself (calendar + own-access list vs the
  // `bookings.manage.*`-gated creation form) and the service decide what
  // each role sees. An allievo alone therefore sees this item again (it
  // shows the calendar/list, never the form).
  { key: 'bookings', href: '/dashboard/bookings', permissions: ['bookings.manage.own', 'bookings.manage.any', 'self.read'] },
  // Story 3.3: repointed the same way people/aircraft were in 2.1/2.4. Story
  // 12.9: the legacy `/dashboard/finance` page is gone — repointed at the
  // new AirOps billing page (this entry still has a consumer,
  // `dashboard/page.tsx`'s own overview grid, so `nav-items.ts` itself stays;
  // full removal is 12.13).
  { key: 'finance', href: '/dashboard/billing', permissions: ['finance.manage'] },
  // Story 9.1: repointed at the real "I miei allievi" page (the old '/school'
  // placeholder was never implemented) — the INSTRUCTOR's own-students view.
  // Story 9.3 (FR-34): the SAME page grows a "Riepiloghi" face for the
  // gestore (student/instructor hour summaries) — `school.manage.any` joins
  // the permission set, so staff/admin now see "Scuola" too.
  { key: 'school', href: '/dashboard/school', permissions: ['school.manage.own', 'school.manage.any'] },
  // Story 6.1: repointed the same way people/aircraft/finance/flights were
  // in 2.1/2.4/3.3/5.4. Story 6.2 (FR-36): reopened to every role via
  // `self.read` — same pattern as `flights` in 5.4: the page itself (staff
  // proposal queue vs "Le mie scadenze" own-access view) and the service
  // decide what each role sees.
  { key: 'expiries', href: '/dashboard/expiries', permissions: ['expiries.manage', 'self.read'] },
  // Story 8.2 (FR-23): the real staff PPR approval queue — `ppr.manage`
  // (staff + admin only, `rbac.ts`).
  { key: 'ppr', href: '/dashboard/ppr', permissions: ['ppr.manage'] },
  // Story 1.4: the first real (non-placeholder) dashboard sub-page.
  { key: 'users', href: '/dashboard/users', permissions: ['users.manage'] },
  // Story 10.2 (AC 1): the real settings page (airfield PDF branding) —
  // the old `/settings` placeholder (story 1.3) was never implemented.
  { key: 'settings', href: '/dashboard/settings', permissions: ['settings.manage'] },
];

/**
 * Union filtering (AC 2): an item is visible if the actor has ANY of its
 * permissions — a multi-role actor (e.g. pilot+instructor) therefore sees
 * the union of what each role would see alone, never the intersection.
 */
export function visibleNavItems(actor: Pick<Actor, 'roles'>): NavItem[] {
  return NAV_ITEMS.filter((item) => item.permissions.some((permission) => hasPermission(actor, permission)));
}
