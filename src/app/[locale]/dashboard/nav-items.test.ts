import { describe, expect, it } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { visibleNavItems } from './nav-items';

function actorWith(roles: Actor['roles']): Actor {
  return { userId: 'user_1', personId: 'person_1', roles };
}

describe('visibleNavItems (Story 1.3 AC 2 — dashboard navigation by role)', () => {
  it('shows every nav item for an admin', () => {
    const keys = visibleNavItems(actorWith(['ADMIN'])).map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'people',
        'aircraft',
        'flights',
        'bookings',
        'finance',
        'school',
        'expiries',
        'ppr',
        'settings',
      ]),
    );
  });

  it('shows only self-service items for a pilot (story 5.4: flights joins bookings, FR-17; story 6.2: expiries joins too, FR-36)', () => {
    const keys = visibleNavItems(actorWith(['PILOT'])).map((item) => item.key);
    expect(keys.sort()).toEqual(['bookings', 'expiries', 'flights'].sort());
  });

  it('shows the union of items for a multi-role pilot+instructor actor', () => {
    const keys = visibleNavItems(actorWith(['PILOT', 'INSTRUCTOR'])).map((item) => item.key);
    expect(keys.sort()).toEqual(['bookings', 'expiries', 'flights', 'school'].sort());
  });

  it('hides settings and users-only areas from staff', () => {
    const keys = visibleNavItems(actorWith(['STAFF'])).map((item) => item.key);
    expect(keys).not.toContain('settings');
  });

  it('shows the ppr item to staff (story 8.2: ppr.manage) but not to pilot/student', () => {
    expect(visibleNavItems(actorWith(['STAFF'])).map((item) => item.key)).toContain('ppr');
    expect(visibleNavItems(actorWith(['PILOT'])).map((item) => item.key)).not.toContain('ppr');
    expect(visibleNavItems(actorWith(['STUDENT'])).map((item) => item.key)).not.toContain('ppr');
  });

  it('points the ppr nav item at /dashboard/ppr (story 8.2 — the old /ppr-queue placeholder is gone)', () => {
    const item = visibleNavItems(actorWith(['ADMIN'])).find((entry) => entry.key === 'ppr');
    expect(item?.href).toBe('/dashboard/ppr');
  });

  // CONTRACT CHANGE (story 7.2, FR-19): `bookings` gained `self.read`
  // (calendar view for every authenticated role) — a student alone now
  // SEES the item again, same pattern as story 6.2 did for 6.1's nav test
  // when `expiries` gained `self.read`. The 7.1 assertion this replaces
  // ("hides bookings from a student alone") only ever reflected 7.1's own
  // interim state before the calendar view existed.
  it('shows bookings to a student alone (story 7.2: calendar view is FR-19, every authenticated role)', () => {
    const keys = visibleNavItems(actorWith(['STUDENT'])).map((item) => item.key);
    expect(keys.sort()).toEqual(['bookings', 'expiries', 'flights'].sort());
  });

  it('points the bookings nav item at /dashboard/bookings (story 7.1)', () => {
    const item = visibleNavItems(actorWith(['PILOT'])).find((entry) => entry.key === 'bookings');
    expect(item?.href).toBe('/dashboard/bookings');
  });

  it('points the school nav item at /dashboard/school (story 9.1 — the old /school placeholder is gone)', () => {
    const item = visibleNavItems(actorWith(['INSTRUCTOR'])).find((entry) => entry.key === 'school');
    expect(item?.href).toBe('/dashboard/school');
  });
});
