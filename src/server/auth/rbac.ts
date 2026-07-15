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
  | 'school.manage.any'
  | 'school.notes.manage.any'
  | 'expiries.manage'
  | 'expiries.propose.own'
  | 'ppr.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'self.read'
  // Epic 12, story 12.7: registering an instructor payout AND setting an
  // instructor's payout rate (the amount PAID to them, distinct from
  // `settings.manage`'s `InstructorRate` — the amount CHARGED to the
  // student). ADMIN-only, deliberately never granted to STAFF: reading the
  // compensation summary/export stays on the wider `finance.manage`.
  | 'payouts.manage';

const ALL_PERMISSIONS: Permission[] = [
  'people.read',
  'people.manage',
  'aircraft.manage',
  'finance.manage',
  'flights.manage',
  'bookings.manage.own',
  'bookings.manage.any',
  'school.manage.own',
  'school.manage.any',
  'school.notes.manage.any',
  'expiries.manage',
  'expiries.propose.own',
  'ppr.manage',
  'settings.manage',
  'users.manage',
  'self.read',
  'payouts.manage',
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
 * - `pilot`: pure self-service — their own data, bookings, account,
 *   expiries (FR-2 "pilota: i propri dati").
 * - `student`: self-service on their own data/account/expiries — but NOT
 *   `bookings.manage.own` (story 7.1, FR-18 `[ASSUMPTION]`): a school
 *   booking is made by the instructor or staff on the allievo's behalf, an
 *   allievo never books solo. A dual-role pilot+student keeps the
 *   permission via the union with PILOT (`getPermissions`), same as any
 *   other multi-role actor.
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
    // Story 9.1 (FR-32): staff assigns/removes a student's instructor(s)
    // from the scheda persona — the "any" counterpart to the instructor's
    // own `school.manage.own` (their own students' view at `/dashboard/school`).
    'school.manage.any',
    // Story 9.2 (FR-33): deliberately NO `school.notes.manage.any` here — an
    // admin's override to edit ANY training note past its 7-day window is
    // reserved to ADMIN alone (via `ALL_PERMISSIONS` above), never staff,
    // per the story's literal AC 3 ("solo l'autore o l'admin").
    'expiries.manage',
    // Story 8.2 (FR-23): staff approves/rejects PPR requests — the queue at
    // `/dashboard/ppr` and the operating-instructions GET (edit stays
    // `settings.manage`, admin-only). ADMIN inherits it via `ALL_PERMISSIONS`
    // above; instructor/pilot/student never hold it.
    'ppr.manage',
    'self.read',
  ],
  // `expiries.propose.own` (story 6.2, FR-36): the titolare proposes a
  // renewal of their OWN scadenza, staff validates it — staff deliberately
  // does NOT hold this permission (it edits directly via `expiries.manage`
  // instead, never through the proposal queue).
  INSTRUCTOR: ['self.read', 'bookings.manage.own', 'school.manage.own', 'expiries.propose.own'],
  PILOT: ['self.read', 'bookings.manage.own', 'expiries.propose.own'],
  // Story 7.1: no `bookings.manage.own` — see the doc-comment above.
  STUDENT: ['self.read', 'expiries.propose.own'],
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
