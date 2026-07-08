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

  it('hides bookings from a student alone (story 7.1: school bookings are made by the instructor/staff)', () => {
    const keys = visibleNavItems(actorWith(['STUDENT'])).map((item) => item.key);
    expect(keys).not.toContain('bookings');
    // Still sees flights/expiries (both hold `self.read`, story 5.4/6.2 — unaffected by this story).
    expect(keys.sort()).toEqual(['expiries', 'flights'].sort());
  });

  it('points the bookings nav item at /dashboard/bookings (story 7.1)', () => {
    const item = visibleNavItems(actorWith(['PILOT'])).find((entry) => entry.key === 'bookings');
    expect(item?.href).toBe('/dashboard/bookings');
  });
});
