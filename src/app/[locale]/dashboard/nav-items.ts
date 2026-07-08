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
 *
 * `ppr` has no dedicated permission yet: the initial permission set (Task 2)
 * doesn't include one, since the PPR domain itself doesn't exist until epic
 * 8. It is gated on `bookings.manage.any` as the closest existing proxy for
 * "staff/admin operational work" — revisit once epic 8 introduces a
 * `ppr.manage` permission.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  // Story 2.1: the first real (non-placeholder) People sub-page.
  { key: 'people', href: '/dashboard/people', permissions: ['people.read'] },
  // Story 2.4: repointed the same way people was in 2.1.
  { key: 'aircraft', href: '/dashboard/aircraft', permissions: ['aircraft.manage'] },
  // Story 5.1: repointed the same way people/aircraft/finance were in
  // 2.1/2.4/3.3. Story 5.4 (FR-17): reopened to every role via `self.read` —
  // the page itself (own-access registry vs full staff manager) and the
  // service (`flights.service.ts#listFlights`) decide what each role sees.
  { key: 'flights', href: '/dashboard/flights', permissions: ['flights.manage', 'self.read'] },
  // Story 7.1: repointed the same way people/aircraft/finance/flights/
  // expiries were in 2.1/2.4/3.3/5.4/6.2. Permissions unchanged for now —
  // `bookings.manage.own` was removed from STUDENT in `rbac.ts` (school
  // bookings are made by the instructor/staff), so an allievo alone no
  // longer sees this item; the extension to every authenticated role
  // (FR-19, calendar view) arrives in story 7.2.
  { key: 'bookings', href: '/dashboard/bookings', permissions: ['bookings.manage.own', 'bookings.manage.any'] },
  // Story 3.3: repointed the same way people/aircraft were in 2.1/2.4.
  { key: 'finance', href: '/dashboard/finance', permissions: ['finance.manage'] },
  { key: 'school', href: '/school', permissions: ['school.manage.own'] },
  // Story 6.1: repointed the same way people/aircraft/finance/flights were
  // in 2.1/2.4/3.3/5.4. Story 6.2 (FR-36): reopened to every role via
  // `self.read` — same pattern as `flights` in 5.4: the page itself (staff
  // proposal queue vs "Le mie scadenze" own-access view) and the service
  // decide what each role sees.
  { key: 'expiries', href: '/dashboard/expiries', permissions: ['expiries.manage', 'self.read'] },
  { key: 'ppr', href: '/ppr-queue', permissions: ['bookings.manage.any'] },
  // Story 1.4: the first real (non-placeholder) dashboard sub-page.
  { key: 'users', href: '/dashboard/users', permissions: ['users.manage'] },
  { key: 'settings', href: '/settings', permissions: ['settings.manage'] },
];

/**
 * Union filtering (AC 2): an item is visible if the actor has ANY of its
 * permissions — a multi-role actor (e.g. pilot+instructor) therefore sees
 * the union of what each role would see alone, never the intersection.
 */
export function visibleNavItems(actor: Pick<Actor, 'roles'>): NavItem[] {
  return NAV_ITEMS.filter((item) => item.permissions.some((permission) => hasPermission(actor, permission)));
}
