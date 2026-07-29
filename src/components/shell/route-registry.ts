import type { Role } from '@/generated/prisma/client';

/**
 * AirOps sidebar route registry (story 12.1, AC 4) — one static array
 * mirroring `docs/design-reference/airops/src/Sidebar.jsx`'s groups/items,
 * with an `enabled` flag: this story turns on ONLY the routes that already
 * exist (`overview`, `schedule`, `ppr`, `scadenze`, `settings`). Every other
 * prototype entry stays defined but `enabled: false` — the epic story that
 * builds that page flips its flag (see `docs/superpowers/plans/`, Task 1
 * dev notes). `Sidebar`/`TopBar` both read this single source of truth
 * (rendering + active-route/breadcrumb-title lookup). Story 12.13: every
 * entry is `enabled` and renders in the AirOps visual language directly —
 * the `airopsNative` flag that used to gate `LegacyBackdrop`'s light-vs-bare
 * wrapper was removed along with that component (no legacy page left in the
 * registry to opt out).
 */

export type NavGroupId = 'operations' | 'directory' | 'archive' | 'system';

export type NavItemId =
  | 'overview'
  | 'schedule'
  | 'ppr'
  | 'visiting'
  | 'pilots'
  | 'instructors'
  | 'fleet'
  | 'scadenze'
  | 'logbook'
  | 'myAccount'
  | 'myCompensation'
  | 'billing'
  | 'reports'
  | 'settings';

/** Icon key into `Icon.*` (`src/components/ui/icons.tsx`) — kept as a plain string union, not a `keyof typeof Icon` type import, so this module has no dependency on the (client-only) icon component values. */
export type NavIconKey =
  | 'dashboard'
  | 'calendar'
  | 'doc'
  | 'plane'
  | 'users'
  | 'compass'
  | 'clock'
  | 'book'
  | 'cash'
  | 'chart'
  | 'gear';

export type NavItem = {
  id: NavItemId;
  /** Locale-free path, as expected by next-intl's `Link`/`usePathname` (`src/i18n/navigation.ts`). */
  href: string;
  icon: NavIconKey;
  group: NavGroupId;
  /** Roles that see this item (story 12.1 AC 4's literal "filtro per ruolo" — a coarser, presentation-only list, distinct from `src/server/auth/rbac.ts`'s granular permissions). */
  roles: readonly Role[];
  /** Whether the target route exists yet. A later story flips this to `true` when it ships the page. */
  enabled: boolean;
};

const ALL_ROLES: readonly Role[] = ['ADMIN', 'STAFF', 'INSTRUCTOR', 'PILOT', 'STUDENT'];
const STAFF_ROLES: readonly Role[] = ['ADMIN', 'STAFF'];
/** Story 14.6, AC 1: PILOT/STUDENT's own "Le mie transazioni" — INSTRUCTOR gets its own compensation page (story 14.7); admin/staff already have Contabilità + the scheda persona. */
const SELF_SERVICE_ROLES: readonly Role[] = ['PILOT', 'STUDENT'];
/** Story 14.7, AC 2: INSTRUCTOR's own "I miei compensi" — same rationale as `SELF_SERVICE_ROLES` above, one role only. */
const INSTRUCTOR_ROLES: readonly Role[] = ['INSTRUCTOR'];

/** Group display order (prototype: Operazioni/Anagrafiche/Archivio/Sistema). Labels are resolved by the caller via `t('groups.<id>')` (`messages/*.json`'s `shell.groups.*`) — this module stays i18n-agnostic. */
export const NAV_GROUPS: readonly NavGroupId[] = ['operations', 'directory', 'archive', 'system'];

export const NAV_ITEMS: readonly NavItem[] = [
  // Story 12.12: the home ships in the AirOps visual language directly, replacing the legacy widget-grid dashboard.
  { id: 'overview', href: '/dashboard', icon: 'dashboard', group: 'operations', roles: ALL_ROLES, enabled: true },
  { id: 'schedule', href: '/dashboard/bookings', icon: 'calendar', group: 'operations', roles: ALL_ROLES, enabled: true },
  { id: 'ppr', href: '/dashboard/ppr', icon: 'doc', group: 'operations', roles: STAFF_ROLES, enabled: true },
  { id: 'visiting', href: '/dashboard/movements', icon: 'plane', group: 'operations', roles: STAFF_ROLES, enabled: true },
  // Story 12.6: the pilots registry ships in the AirOps visual language directly.
  { id: 'pilots', href: '/dashboard/pilots', icon: 'users', group: 'directory', roles: STAFF_ROLES, enabled: true },
  // Story 12.7: the instructors compensation page ships in the AirOps visual language directly.
  { id: 'instructors', href: '/dashboard/instructors', icon: 'compass', group: 'directory', roles: STAFF_ROLES, enabled: true },
  // Story 12.5: the fleet page ships in the AirOps visual language directly.
  // Story 13.8 (AC 2): 'plane' — same small-aircraft glyph as `visiting`
  // (Movimenti) above, per the user's "aereo piccolo per entrambe" item.
  // The dedicated `fleet` icon/NavIconKey entry was removed as an orphan
  // (story 13.11, AC 2).
  { id: 'fleet', href: '/dashboard/fleet', icon: 'plane', group: 'directory', roles: STAFF_ROLES, enabled: true },
  // Story 12.11: the scadenze registry ships in the AirOps visual language
  // directly. Story 12.12 fix: widened to ALL_ROLES — the legacy home's own
  // in-page nav (permission-based, `nav-items.ts`, removed in story 12.13)
  // always gave a self-access PILOT/STUDENT a link to their OWN scadenze
  // (`self.read`, `expiries/page.tsx`'s own-access face); once that nav
  // disappeared with the widget-grid home, the Sidebar became the only nav
  // that can offer it.
  { id: 'scadenze', href: '/dashboard/expiries', icon: 'clock', group: 'directory', roles: ALL_ROLES, enabled: true },
  // Story 12.8: the logbook ships in the AirOps visual language directly, replacing the legacy `/dashboard/flights`.
  { id: 'logbook', href: '/dashboard/logbook', icon: 'book', group: 'archive', roles: ALL_ROLES, enabled: true },
  // Story 14.6: dedicated self-service estratto conto — own balance + own movements only (never a staff view).
  { id: 'myAccount', href: '/dashboard/my-account', icon: 'cash', group: 'archive', roles: SELF_SERVICE_ROLES, enabled: true },
  // Story 14.7: dedicated self-service compensation page — own accrual + own payout history only (never the staff roster). This ROLE filter is coarse/presentation-only like every other entry (module doc comment); AC 4's stronger "active profile, not role" requirement is enforced by `dashboard/layout.tsx` filtering this ONE item out for an INSTRUCTOR-role actor whose own profile is deactivated (14.6 F2's lesson: never point a nav item where the destination would then have nothing to show).
  { id: 'myCompensation', href: '/dashboard/my-compensation', icon: 'cash', group: 'archive', roles: INSTRUCTOR_ROLES, enabled: true },
  // Story 12.9: the billing (Contabilità) page ships in the AirOps visual language directly, replacing the legacy `/dashboard/finance`.
  { id: 'billing', href: '/dashboard/billing', icon: 'cash', group: 'archive', roles: STAFF_ROLES, enabled: true },
  { id: 'reports', href: '/dashboard/reports', icon: 'chart', group: 'archive', roles: STAFF_ROLES, enabled: true },
  // ADMIN-only: matches `settings.manage` in rbac.ts (review 12.1 F2 — nav must never
  // point where the page guard bounces; D13: the domain contract wins over the prototype).
  // Story 12.11: ships in the AirOps visual language directly.
  { id: 'settings', href: '/dashboard/settings', icon: 'gear', group: 'system', roles: ['ADMIN'], enabled: true },
];

/**
 * Items an actor with `roles` may see: enabled routes only, filtered by the
 * per-item role list (union: any role held is enough).
 */
export function visibleNavItems(roles: readonly Role[]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.enabled && item.roles.some((role) => roles.includes(role)));
}

/** Exact-match lookup (no prefix matching — a route not in the registry, e.g. a detail route like `/dashboard/people/[id]`, falls back to the generic breadcrumb title, never borrows `/dashboard`'s "Panoramica"). */
export function findNavItemByPathname(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => item.href === pathname) ?? null;
}
