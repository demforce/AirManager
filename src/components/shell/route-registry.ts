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
  /**
   * Story 15.1 (AC 2, epic 15 R2): priority slot in the <=640px bottom tab
   * bar, used ONLY when the actor sees more than `MOBILE_TAB_COUNT` items —
   * the lowest-numbered slots fill the bar, everything else moves into the
   * "Altro" sheet. Kept here, in the registry, so the mobile nav has the same
   * single source of truth as the sidebar (href/icon/roles).
   *
   * Slots are a GLOBAL priority order, not a per-role one: each actor simply
   * takes the lowest-slotted items among the ones they can see. 1-4 are the
   * template's admin bar; 5-6 are the two self-service pages, which outrank
   * Scadenze/Registro voli for the actors who have them (PO ratification
   * R-15.1-a, 2026-07-30 — see the fill rule in `mobileNavLayout`).
   */
  mobileSlot?: number;
};

const ALL_ROLES: readonly Role[] = ['ADMIN', 'INSTRUCTOR', 'PILOT', 'STUDENT'];
/** Story 14.9: renamed from the old two-role list once its second entry (the never-really-distinct administrative role) was removed. */
const ADMIN_ROLES: readonly Role[] = ['ADMIN'];
/** Story 14.6, AC 1: PILOT/STUDENT's own "Le mie transazioni" — INSTRUCTOR gets its own compensation page (story 14.7); admin already has Contabilità + the scheda persona. */
const SELF_SERVICE_ROLES: readonly Role[] = ['PILOT', 'STUDENT'];
/** Story 14.7, AC 2: INSTRUCTOR's own "I miei compensi" — same rationale as `SELF_SERVICE_ROLES` above, one role only. */
const INSTRUCTOR_ROLES: readonly Role[] = ['INSTRUCTOR'];

/** Group display order (prototype: Operazioni/Anagrafiche/Archivio/Sistema). Labels are resolved by the caller via `t('groups.<id>')` (`messages/*.json`'s `shell.groups.*`) — this module stays i18n-agnostic. */
export const NAV_GROUPS: readonly NavGroupId[] = ['operations', 'directory', 'archive', 'system'];

export const NAV_ITEMS: readonly NavItem[] = [
  // Story 12.12: the home ships in the AirOps visual language directly, replacing the legacy widget-grid dashboard.
  // Story 15.1: `mobileSlot` 1-4 = the template's own admin tab bar
  // (Panoramica / Pianificazione / PPR / Aeromobili, `AirOps Mobile.dc.html`
  // line 606), the 5th slot being the "Altro" sheet trigger.
  { id: 'overview', href: '/dashboard', icon: 'dashboard', group: 'operations', roles: ALL_ROLES, enabled: true, mobileSlot: 1 },
  { id: 'schedule', href: '/dashboard/bookings', icon: 'calendar', group: 'operations', roles: ALL_ROLES, enabled: true, mobileSlot: 2 },
  { id: 'ppr', href: '/dashboard/ppr', icon: 'doc', group: 'operations', roles: ADMIN_ROLES, enabled: true, mobileSlot: 3 },
  { id: 'visiting', href: '/dashboard/movements', icon: 'plane', group: 'operations', roles: ADMIN_ROLES, enabled: true },
  // Story 12.6: the pilots registry ships in the AirOps visual language directly.
  { id: 'pilots', href: '/dashboard/pilots', icon: 'users', group: 'directory', roles: ADMIN_ROLES, enabled: true },
  // Story 12.7: the instructors compensation page ships in the AirOps visual language directly.
  { id: 'instructors', href: '/dashboard/instructors', icon: 'compass', group: 'directory', roles: ADMIN_ROLES, enabled: true },
  // Story 12.5: the fleet page ships in the AirOps visual language directly.
  // Story 13.8 (AC 2): 'plane' — same small-aircraft glyph as `visiting`
  // (Movimenti) above, per the user's "aereo piccolo per entrambe" item.
  // The dedicated `fleet` icon/NavIconKey entry was removed as an orphan
  // (story 13.11, AC 2).
  { id: 'fleet', href: '/dashboard/fleet', icon: 'plane', group: 'directory', roles: ADMIN_ROLES, enabled: true, mobileSlot: 4 },
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
  // Story 15.1 (R-15.1-a): slot 5 — for an actor who sees more than 5 items
  // and is NOT an admin (an instructor who also flies as a pilot), the two
  // self-service pages take the bar ahead of Scadenze/Registro voli.
  { id: 'myAccount', href: '/dashboard/my-account', icon: 'cash', group: 'archive', roles: SELF_SERVICE_ROLES, enabled: true, mobileSlot: 5 },
  // Story 14.7: dedicated self-service compensation page — own accrual + own payout history only (never the staff roster). This ROLE filter is coarse/presentation-only like every other entry (module doc comment); AC 4's stronger "active profile, not role" requirement is enforced by `dashboard/layout.tsx` filtering this ONE item out for an INSTRUCTOR-role actor whose own profile is deactivated (14.6 F2's lesson: never point a nav item where the destination would then have nothing to show).
  { id: 'myCompensation', href: '/dashboard/my-compensation', icon: 'cash', group: 'archive', roles: INSTRUCTOR_ROLES, enabled: true, mobileSlot: 6 },
  // Story 12.9: the billing (Contabilità) page ships in the AirOps visual language directly, replacing the legacy `/dashboard/finance`.
  { id: 'billing', href: '/dashboard/billing', icon: 'cash', group: 'archive', roles: ADMIN_ROLES, enabled: true },
  { id: 'reports', href: '/dashboard/reports', icon: 'chart', group: 'archive', roles: ADMIN_ROLES, enabled: true },
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

/** Bottom tab bar capacity at <=640px (story 15.1, epic 15 R2): the template's own 5 columns, and the "3-5 tabs, extras behind More" mobile guideline. */
export const MOBILE_TAB_COUNT = 5;

/**
 * Splits the items an actor can see (the SAME already-filtered array the
 * sidebar gets — `dashboard/layout.tsx` also drops `myCompensation` for an
 * instructor whose own profile is deactivated, story 14.7 AC 4) into the
 * bottom tab bar and the "Altro" sheet (story 15.1, AC 2 / epic 15 R2):
 *
 * - `<= MOBILE_TAB_COUNT` items → all of them are tabs, no "Altro" (today:
 *   INSTRUCTOR, PILOT, STUDENT);
 * - more than that → the `mobileSlot` items, lowest slot first, fill the
 *   first `MOBILE_TAB_COUNT - 1` columns (the last column is the "Altro"
 *   trigger, rendered by `MobileNav`) and everything else goes to `more`, in
 *   registry order (= the sidebar's group order).
 *
 * Review 15.1 F1: the bar must never come out SHORT. Slots are global, so an
 * actor can see more than `MOBILE_TAB_COUNT` items while few of them carry a
 * slot — measured before the fix: an instructor who also flies as a pilot
 * (6 visible items, only `overview`/`schedule` slotted back then) got a
 * 2-tab bar with four sections buried behind "Altro" and two columns wasted.
 * Slots 5-6 fix that actor (R-15.1-a); the fill below closes the CLASS, since
 * role lists keep widening story by story (12.12 opened `scadenze` to every
 * role) and the next widening must not silently shorten the bar again.
 */
export function mobileNavLayout(items: readonly NavItem[]): { tabs: NavItem[]; more: NavItem[] } {
  if (items.length <= MOBILE_TAB_COUNT) return { tabs: [...items], more: [] };
  const capacity = MOBILE_TAB_COUNT - 1;
  const tabs = items
    .filter((item) => item.mobileSlot !== undefined)
    .sort((a, b) => a.mobileSlot! - b.mobileSlot!)
    .slice(0, capacity);
  // Fewer slotted items than columns ⇒ every slotted one is already in, so
  // this only ever appends UNSLOTTED items, in registry order (the same order
  // `more` uses below).
  for (const item of items) {
    if (tabs.length === capacity) break;
    if (!tabs.includes(item)) tabs.push(item);
  }
  return { tabs, more: items.filter((item) => !tabs.includes(item)) };
}

/** Exact-match lookup (no prefix matching — a route not in the registry, e.g. a detail route like `/dashboard/people/[id]`, falls back to the generic breadcrumb title, never borrows `/dashboard`'s "Panoramica"). */
export function findNavItemByPathname(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => item.href === pathname) ?? null;
}
