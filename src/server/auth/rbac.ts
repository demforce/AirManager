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
  | 'expiries.manage'
  | 'ppr.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'self.read'
  // Epic 12, story 12.7: registering an instructor payout AND setting an
  // instructor's payout rate (the amount PAID to them, distinct from
  // `settings.manage`'s `InstructorRate` — the amount CHARGED to the
  // student). ADMIN-only, deliberately a distinct permission from the wider
  // `finance.manage`: reading the compensation summary/export stays on that
  // wider permission.
  | 'payouts.manage'
  // Story 14.5 (ratifica R3): sees the pilot/instructor NAMES on a booking
  // that isn't the actor's own — everyone still sees aircraft+time (that's
  // `self.read`, unconditional); without this permission, a non-own booking
  // is masked to "Occupato" (`bookings.service.ts#listBookings`/
  // `listCalendarBookings`). Granted to ADMIN/INSTRUCTOR, never
  // PILOT/STUDENT.
  | 'bookings.read.names'
  // Story 14.4 (ratifica R4): forces a flight registration/correction past a
  // BLOCKING expired document (pilot's or instructor's) with a mandatory
  // motivo — `flights.service.ts#resolveFlightInput`'s `FLIGHT_BLOCKED_BY_EXPIRY`
  // bypass. Deliberately a permission distinct from `flights.manage` itself —
  // the gate lives on THIS permission, not on a role literal, so ADMIN being
  // (since story 14.9) the only role holding either is incidental, not the
  // reason the split exists.
  // Story AOG-1a (ratifica R-AOG-c): this permission now covers TWO blocks —
  // the blocking expired document above AND the out-of-service aircraft
  // (`AIRCRAFT_OUT_OF_SERVICE`), with ONE `force` scavalcando both and
  // producing ONE stamp. The name stays `forceExpiry` DELIBERATELY: renaming it
  // would touch UI, i18n and tests without changing a single semantic — the
  // same call story 14.4 F3 made on `ExpiryType.blocksBooking`.
  | 'flights.forceExpiry';

const ALL_PERMISSIONS: Permission[] = [
  'people.read',
  'people.manage',
  'aircraft.manage',
  'finance.manage',
  'flights.manage',
  'bookings.manage.own',
  'bookings.manage.any',
  'expiries.manage',
  'ppr.manage',
  'settings.manage',
  'users.manage',
  'self.read',
  'payouts.manage',
  'bookings.read.names',
  'flights.forceExpiry',
];

/**
 * Roles → permissions (PRD §4.1). The single source of truth for "who can do
 * what" — nothing outside this file (and no external RBAC library) decides
 * that.
 *
 * - `admin`: everything (FR-2 "admin: tutto") — the sole administrative role
 *   (story 14.9 removed `staff`, never a distinct figure in practice).
 * - `instructor`: self-service plus their own bookings (story 12.13: the
 *   diario/assegnazioni scuola were retired — instructors keep the same
 *   permissions as `pilot`, `self.read` + `bookings.manage.own`), PLUS
 *   `bookings.read.names` (story 14.5, ratifica R3: an istruttore sees who
 *   has booked what, unmasked — pilot/student do not).
 * - `pilot`: pure self-service — their own data, bookings, account,
 *   expiries (FR-2 "pilota: i propri dati"). Sees "Occupato" (not the
 *   name) on a booking that isn't their own (story 14.5).
 * - `student`: self-service on their own data/account/expiries — but NOT
 *   `bookings.manage.own` (story 7.1, FR-18 `[ASSUMPTION]`): a school
 *   booking is made by the instructor or staff on the allievo's behalf, an
 *   allievo never books solo. A dual-role pilot+student keeps the
 *   permission via the union with PILOT (`getPermissions`), same as any
 *   other multi-role actor. Same "Occupato" masking as pilot (story 14.5).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  INSTRUCTOR: ['self.read', 'bookings.manage.own', 'bookings.read.names'],
  PILOT: ['self.read', 'bookings.manage.own'],
  // Story 7.1: no `bookings.manage.own` — see the doc-comment above.
  STUDENT: ['self.read'],
};

/**
 * Union of permissions across every role the actor holds (AC 2: a
 * pilot+instructor sees/does the union of both perimeters, never the
 * intersection).
 */
export function getPermissions(actor: Pick<Actor, 'roles'>): ReadonlySet<Permission> {
  const permissions = new Set<Permission>();
  for (const role of actor.roles) {
    // Fail closed: a role value carried by an old JWT but no longer in the
    // map must grant nothing, not crash the guard.
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
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
  return actor.roles.some((role) => (ROLE_PERMISSIONS[role] ?? []).includes(permission));
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
