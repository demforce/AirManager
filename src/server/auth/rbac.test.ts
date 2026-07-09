import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@/server/services/errors';
import { authorize, getPermissions, hasPermission, type Actor } from './rbac';

function actorWith(roles: Actor['roles']): Actor {
  return { userId: 'user_1', personId: 'person_1', roles };
}

describe('rbac permission matrix (Story 1.3 AC 1, 2, 3)', () => {
  const ALL_PERMISSIONS_UNDER_TEST = [
    'people.read',
    'people.manage',
    'aircraft.manage',
    'finance.manage',
    'flights.manage',
    'bookings.manage.own',
    'bookings.manage.any',
    'school.manage.own',
    'school.manage.any',
    'expiries.manage',
    'expiries.propose.own',
    'ppr.manage',
    'settings.manage',
    'users.manage',
    'self.read',
  ] as const;

  it('grants admin every permission in the catalogue', () => {
    const admin = actorWith(['ADMIN']);

    for (const permission of ALL_PERMISSIONS_UNDER_TEST) {
      expect(hasPermission(admin, permission)).toBe(true);
    }
    expect(() => authorize(admin, 'users.manage')).not.toThrow();
    expect(() => authorize(admin, 'settings.manage')).not.toThrow();
  });

  it('lets staff read/manage operational data but never manage users or settings (admin-only)', () => {
    const staff = actorWith(['STAFF']);

    expect(hasPermission(staff, 'people.read')).toBe(true);
    expect(hasPermission(staff, 'people.manage')).toBe(true);
    expect(hasPermission(staff, 'aircraft.manage')).toBe(true);
    expect(hasPermission(staff, 'finance.manage')).toBe(true);
    expect(hasPermission(staff, 'flights.manage')).toBe(true);
    expect(hasPermission(staff, 'bookings.manage.any')).toBe(true);
    // Story 9.1 (FR-32): staff manages ANY student's instructor assignments.
    expect(hasPermission(staff, 'school.manage.any')).toBe(true);
    expect(hasPermission(staff, 'school.manage.own')).toBe(false);
    expect(hasPermission(staff, 'expiries.manage')).toBe(true);

    // Story 6.2: staff edits scadenze directly (`expiries.manage`) — it
    // deliberately does NOT hold the titolare-facing propose permission.
    expect(hasPermission(staff, 'expiries.propose.own')).toBe(false);

    // Story 8.2 (FR-23): staff decides the PPR approval queue.
    expect(hasPermission(staff, 'ppr.manage')).toBe(true);

    expect(hasPermission(staff, 'users.manage')).toBe(false);
    expect(hasPermission(staff, 'settings.manage')).toBe(false);
    expect(() => authorize(staff, 'users.manage')).toThrow(ForbiddenError);
    expect(() => authorize(staff, 'settings.manage')).toThrow(ForbiddenError);
  });

  it('scopes a pilot to self-service and their own bookings only — no access to other people’s data', () => {
    const pilot = actorWith(['PILOT']);

    expect(hasPermission(pilot, 'self.read')).toBe(true);
    expect(hasPermission(pilot, 'bookings.manage.own')).toBe(true);
    // Story 6.2 (FR-36): a pilot proposes updates to their OWN scadenze.
    expect(hasPermission(pilot, 'expiries.propose.own')).toBe(true);

    expect(hasPermission(pilot, 'people.read')).toBe(false);
    expect(hasPermission(pilot, 'bookings.manage.any')).toBe(false);
    expect(hasPermission(pilot, 'finance.manage')).toBe(false);
    // Story 8.2: PPR decisions are staff/admin-only.
    expect(hasPermission(pilot, 'ppr.manage')).toBe(false);
    expect(() => authorize(pilot, 'people.read')).toThrow(ForbiddenError);
    expect(() => authorize(pilot, 'ppr.manage')).toThrow(ForbiddenError);
  });

  it('unions permissions for a multi-role actor (pilot+instructor) instead of intersecting them (AC 2)', () => {
    const pilotInstructor = actorWith(['PILOT', 'INSTRUCTOR']);

    // From the PILOT role:
    expect(hasPermission(pilotInstructor, 'self.read')).toBe(true);
    expect(hasPermission(pilotInstructor, 'bookings.manage.own')).toBe(true);
    // From the INSTRUCTOR role:
    expect(hasPermission(pilotInstructor, 'school.manage.own')).toBe(true);
    // Still nothing granted by neither role:
    expect(hasPermission(pilotInstructor, 'people.read')).toBe(false);
    expect(hasPermission(pilotInstructor, 'users.manage')).toBe(false);

    const permissions = getPermissions(pilotInstructor);
    expect(permissions).toEqual(
      new Set(['self.read', 'bookings.manage.own', 'school.manage.own', 'expiries.propose.own']),
    );
  });

  it('scopes a student to self-service only — NO bookings.manage.own (story 7.1: school bookings are made by the instructor/staff)', () => {
    const student = actorWith(['STUDENT']);

    expect(hasPermission(student, 'self.read')).toBe(true);
    expect(hasPermission(student, 'expiries.propose.own')).toBe(true);

    expect(hasPermission(student, 'bookings.manage.own')).toBe(false);
    expect(hasPermission(student, 'bookings.manage.any')).toBe(false);
    // Story 8.2: PPR decisions are staff/admin-only.
    expect(hasPermission(student, 'ppr.manage')).toBe(false);
    expect(() => authorize(student, 'bookings.manage.own')).toThrow(ForbiddenError);
  });

  it('a dual-role pilot+student actor keeps bookings.manage.own via the PILOT union (AC 2 of story 1.3)', () => {
    const pilotStudent = actorWith(['PILOT', 'STUDENT']);

    expect(hasPermission(pilotStudent, 'bookings.manage.own')).toBe(true);
  });

  it('authorize() throws ForbiddenError (never a generic Error) when the permission is missing', () => {
    const student = actorWith(['STUDENT']);

    expect(() => authorize(student, 'people.manage')).toThrow(ForbiddenError);
    try {
      authorize(student, 'people.manage');
      expect.unreachable('authorize() should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe('FORBIDDEN');
    }
  });

  it('authorize() does not throw when the actor has the permission', () => {
    const staff = actorWith(['STAFF']);
    expect(() => authorize(staff, 'flights.manage')).not.toThrow();
  });
});
