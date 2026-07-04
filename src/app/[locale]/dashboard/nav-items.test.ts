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

  it('shows only self-service items for a pilot', () => {
    const keys = visibleNavItems(actorWith(['PILOT'])).map((item) => item.key);
    expect(keys).toEqual(['bookings']);
  });

  it('shows the union of items for a multi-role pilot+instructor actor', () => {
    const keys = visibleNavItems(actorWith(['PILOT', 'INSTRUCTOR'])).map((item) => item.key);
    expect(keys.sort()).toEqual(['bookings', 'school'].sort());
  });

  it('hides settings and users-only areas from staff', () => {
    const keys = visibleNavItems(actorWith(['STAFF'])).map((item) => item.key);
    expect(keys).not.toContain('settings');
  });
});
