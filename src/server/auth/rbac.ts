import type { Role } from '@/generated/prisma/client';
import { ForbiddenError } from '@/server/services/errors';
import type { SessionActor } from './session';

/**
 * The principal every service function receives (AD-5). A structural subset
 * of `SessionActor` (`getSessionActor()`'s return type) — only the fields
 * RBAC and "own resource" filtering need. Services keep using `personId` for
 * the "own" filtering that this flat permission map deliberately does not
 * encode (see module doc below).
 */
export type Actor = Pick<SessionActor, 'userId' | 'personId' | 'roles'>;

/**
 * Flat permission catalogue. Kept intentionally coarse and resource-agnostic:
 * "own vs any" scoping (e.g. a pilot's own bookings vs staff managing anyone's)
 * is expressed with a second permission (`*.manage.own` / `*.manage.any`)
 * rather than a resource parameter — the actual "is this record mine?" check
 * happens inside each service using `actor.personId`, never here.
 *
 * This is the initial set (story 1.3) covering the roles/perimeters fixed by
 * PRD §4.1; later epics are expected to grow it, not restructure it.
 */
export type Permission =
  | 'people.read'
  | 'people.manage'
  | 'aircraft.manage'
  | 'finance.manage'
  | 'flights.manage'
  | 'bookings.manage.own'
  | 'bookings.manage.any'
  | 'school.manage.own'
  | 'expiries.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'self.read';

const ALL_PERMISSIONS: Permission[] = [
  'people.read',
  'people.manage',
  'aircraft.manage',
  'finance.manage',
  'flights.manage',
  'bookings.manage.own',
  'bookings.manage.any',
  'school.manage.own',
  'expiries.manage',
  'settings.manage',
  'users.manage',
  'self.read',
];

/**
 * Roles → permissions (PRD §4.1). The single source of truth for "who can do
 * what" — nothing outside this file (and no external RBAC library) decides
 * that.
 *
 * - `admin`: everything (FR-2 "admin: tutto").
 * - `staff`: operational management + finance, but never user/settings
 *   administration (FR-3 reserves user management to admin).
 * - `instructor`: self-service plus their own students/school notes and
 *   their own bookings (FR-2 "istruttore: propri allievi").
 * - `pilot`/`student`: pure self-service — their own data, bookings, account,
 *   expiries (FR-2 "pilota/allievo: i propri dati").
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  STAFF: [
    'people.read',
    'people.manage',
    'aircraft.manage',
    'finance.manage',
    'flights.manage',
    'bookings.manage.any',
    'expiries.manage',
    'self.read',
  ],
  INSTRUCTOR: ['self.read', 'bookings.manage.own', 'school.manage.own'],
  PILOT: ['self.read', 'bookings.manage.own'],
  STUDENT: ['self.read', 'bookings.manage.own'],
};

/**
 * Union of permissions across every role the actor holds (AC 2: a
 * pilot+instructor sees/does the union of both perimeters, never the
 * intersection).
 */
export function getPermissions(actor: Pick<Actor, 'roles'>): ReadonlySet<Permission> {
  const permissions = new Set<Permission>();
  for (const role of actor.roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }
  return permissions;
}

/**
 * Pure predicate for the UI (AD-5: "middleware e UI nascondono la
 * navigazione ma non sono mai l'unico guardiano"). Never throws — used to
 * decide what to render, not to protect data.
 */
export function hasPermission(actor: Pick<Actor, 'roles'>, permission: Permission): boolean {
  return actor.roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

/**
 * The actual guard (AD-5: "ogni funzione di service ... chiama
 * authorize(actor, permission, resource?) ... prima di agire"). Throws
 * `ForbiddenError` (→ HTTP 403) when the actor lacks the permission.
 *
 * Resource-level "own" checks are NOT done here — a service authorizes the
 * coarse permission first, then separately filters/compares against
 * `actor.personId` for the specific record it is about to touch.
 */
export function authorize(actor: Pick<Actor, 'roles'>, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    throw new ForbiddenError(`Actor lacks required permission: ${permission}`);
  }
}
