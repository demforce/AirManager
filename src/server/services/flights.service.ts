import { Prisma, type AircraftPriceCategory, type ExpiryScope, type FlightType } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { ListFlightsQuery, RegisterFlightInput } from '@/lib/schemas/flights';
import { APP_TIMEZONE, formatMinutes } from '@/lib/time';
import { dateOnlyInZone, todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import {
  balanceBand,
  bandWorsened,
  getAccountOverview,
  getNegativeBalanceThresholdCents,
  hasNegativeBalanceAlert,
  sendNegativeBalanceAlert,
  type AccountOverview,
} from './accounts.service';
import { outOfServiceDetails } from './aircraft-status';
import { findBlockingExpiredDocuments, type ExpiredDocument } from './bookings.service';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { getEffectiveInstructorRate, type InstructorRateListItem } from './instructor-rates.service';
import { getEffectiveRate } from './rates.service';

/**
 * Flight logging with automatic charges (epic 5, story 5.1; FR-9/FR-14/
 * FR-15) — `FLIGHT_CHARGE` is a REAL debit (negative `amountCents`) and is
 * allowed to push the account into the red (Dev Notes — no
 * insufficient-balance block, the domain expects the pilot to top up
 * afterwards). Rate lookups (AD-4) reuse `rates.service.ts#getEffectiveRate`
 * and `instructor-rates.service.ts#getEffectiveInstructorRate`, both called
 * BEFORE the transaction: rates are rewritable only while their `validFrom`
 * is today or later (story 19.3, R-19-f), so the only row that can change
 * under a flight is TODAY's, and a flight of today registered while the
 * admin rewrites it takes either price — both legitimate at that instant —
 * and freezes it. The
 * negative-balance alert (FR-27) reuses `accounts.service.ts`'s
 * lock-read-compare-send dance (`getNegativeBalanceThresholdCents`,
 * `balanceBand`, `bandWorsened`, `sendNegativeBalanceAlert`) verbatim —
 * nothing here reimplements that logic.
 *
 * **422, not 409, on a stale reference**: an archived aircraft/person here
 * answers 422 (a stable, specific code — AC 3), never a 409. The flight input
 * references MULTIPLE entities (aircraft, person, optionally instructor);
 * the wrong state of any one of them is treated as unprocessable INPUT for
 * this request, not a conflict with the state of a single target resource
 * the caller is directly mutating. The epic's own AC spells out 422 here,
 * so this is intentional, not an oversight.
 *
 * **No more package consumption (story 12.13, ratifica utente 4a)**: the
 * hour-packages feature (epic 5, story 5.2) is retired from UI and API —
 * every flight charges the aircraft component at the full rate on the full
 * duration, always `Math.round(rate * minutes / 60)`, computed the same way
 * as the instructor component (`buildFlightWrite`). The `HourPackage` rows
 * stay purely as historical sales; their per-flight consumption table was
 * dropped by story 19.6 — this service never reads or writes packages.
 *
 * **Edit in place, delete together with the charge (story 19.6, R-19-c —
 * AD-3's `FLIGHT_CHARGE` exception) — `updateFlight`/`deleteFlight`**: a
 * flight's `FLIGHT_CHARGE` lives and dies with it. `updateFlight` rewrites
 * the `Flight` row AND its charge (the SAME movement: new amount, account,
 * description and value date) in one transaction, creating nothing;
 * `deleteFlight` deletes the charge, then the flight. `AccountMovement.flightId`
 * is `@unique` with `ON DELETE RESTRICT`, so the reverse order fails by
 * construction and no movement is ever orphaned. Every OTHER movement stays
 * append-only with storno. A manual rettifica can no longer target a charge
 * (`recordAdjustment` answers 422 since review F1); one recorded before that
 * guard (`reversalOfId`) still makes its flight neither editable nor
 * deletable (409), because deleting the charge would turn that rettifica
 * into a stray credit.
 * Nothing is written on the `Aircraft` row: since story 19.2 (R-19-b) an
 * aircraft's hours are the sum of its flights, so the flight row alone moves
 * them.
 *
 * **No duplicate, no overlap (story 16.2, F3)**: `registerFlight` and
 * `updateFlight` both call `assertNoOverlappingFlight` INSIDE their
 * transaction, right under the `Aircraft` `FOR UPDATE` lock that serializes
 * this guard — 409 `FLIGHT_OVERLAP`, with the conflicting flight's id and
 * instants in `details`, not derogable by `force`. See that function's own
 * doc-comment for the semi-open interval semantics (the bookings' own) and
 * why `updateFlight` must exclude the flight it is editing.
 *
 * **One write builder (story 19.6, AD-4)**: `buildFlightWrite` is the ONLY
 * place that turns a resolved input into the snapshot columns, the total and
 * the charge's description. `registerFlightCore` (create) and `updateFlight`
 * (update in place) both use it, so a registration and an edit of the same
 * data can never diverge — the no-charge flag included.
 *
 * **Deterministic lock ordering — Flight -> Aircraft -> Account (story 19.6,
 * AD-2)**: `registerFlight` locks the `Aircraft` row, then the `Account` row
 * (UNCHANGED since 5.1). `updateFlight`/`deleteFlight` first lock the
 * `Flight` row itself (`SELECT ... FOR UPDATE`), which hands them the
 * flight's CURRENT aircraft rather than one read outside the transaction —
 * an edit can move a flight onto another aircraft, and a concurrent delete
 * would otherwise lock the wrong one — and serializes edit-vs-edit and
 * edit-vs-delete of the same flight (0 rows => 404: a race lost to a delete
 * never surfaces as a 500). Then the `Aircraft` rows involved (the current
 * one and, on an edit, the new one) in ONE `SELECT ... WHERE id IN (...)
 * ORDER BY id FOR UPDATE`, then the `Account` rows (the charge's and, on an
 * edit, the new person's) in the same shape. No path locks an `Aircraft` and
 * THEN a `Flight`: `registerFlight` reads the aircraft's flights in the
 * overlap guard WITHOUT a lock (MVCC: it never waits on them), and bookings
 * (`Booking -> Aircraft -> Person -> InstructorProfile`, story 16.3) never
 * touch `Flight` — so no cycle, hence no deadlock.
 *
 * **Alerts (FR-27)**: deleting a flight only ever gives money back — no
 * balance read, no alert (same reasoning as `accounts.service.ts#recordTopUp`).
 * `registerFlight` and `updateFlight` reuse `recordAdjustment`'s
 * lock-read-compare-send dance; `updateFlight` reads the NEW person's balance
 * under its lock before and after its two writes (read-your-own-writes), so
 * with the person unchanged "before" still holds the old charge: the
 * comparison is between the real balance before and after the edit.
 */

export type FlightBreakdown = {
  aircraftRateCentsPerHour: number;
  /** Story 19.3 (R-19-e) — which of the aircraft rate's two prices `aircraftRateCentsPerHour` is, frozen with it. */
  aircraftPriceCategory: AircraftPriceCategory;
  /** Always on the FULL flight duration (story 12.13: package consumption retired). */
  aircraftAmountCents: number;
  instructorRateCentsPerHour?: number;
  /** Always on the FULL flight duration. */
  instructorAmountCents?: number;
  /** Always COMPUTED (aircraft + instructor, when any) — never a persisted column. */
  totalAmountCents: number;
};

export type FlightListItem = {
  id: string;
  /** Calendar-only date (`YYYY-MM-DD`) — see `toDateOnlyString`. */
  flightDate: string;
  flightType: FlightType;
  /** Story 9.4 — dual/solo distinction, meaningful only when `flightType === 'SCHOOL'`. */
  isSolo: boolean;
  /** Story 19.6 (R-19-d) — "senza addebito": both amounts and the charge are 0. */
  noCharge: boolean;
  /** Story 11.1 — `null` on a historical (pre-11.1) flight only. */
  departureAirfield: string | null;
  arrivalAirfield: string | null;
  takeoffAt: Date | null;
  landingAt: Date | null;
  minutes: number;
  /** Story 11.1 — NOT NULL DEFAULT 1. */
  takeoffs: number;
  /** Story 11.1 — NOT NULL DEFAULT 1 (backfilled from historical NULL). */
  landings: number;
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string };
  /** `null` <=> no instructor on this flight. `personId` (not the profile id — AD-11/consistency with the API's own `instructorPersonId`). */
  instructor: { personId: string; firstName: string; lastName: string } | null;
  breakdown: FlightBreakdown;
  /** Story 5.4 — CONDITIONAL: present only when the caller has `people.read` (ADMIN-only), same pattern as `AccountStatementItem` (3.2). */
  actorEmail?: string;
  createdAt: Date;
  /** Story 14.4, AC 2 — set together, exactly once, ONLY when an admin bypassed a blocking expired document. `null` on every normal flight. */
  forcedAt: Date | null;
  /** Review F2 (ratifica R-14.4-c) — MASKED to `null` for an actor without `flights.manage` (`toListItem`'s own `includeForceReason` param), even when `forcedAt` is set: the motivo can name another person's medical/document, so a pilot/student/instructor reading their OWN registry (`self.read`) sees the "Deroga" fact (`forcedAt`) but never the WHY. Unlike `Booking`'s own DTO (which omits the field entirely), an admin gets the real value — audit trail, not blanket omission. */
  forceReason: string | null;
};

export type FlightListResult = PaginatedResult<FlightListItem>;

export type RegisterFlightResult = {
  flight: FlightListItem;
  account: AccountOverview;
  /**
   * Story 14.4, AC 3 (decision D1); review F7 (ratifica R-14.4-d) — the SAME
   * in-app "saldo in rosso" signal every other debit-creating surface uses
   * (`accounts.service.ts#hasNegativeBalanceAlert`: balance negative BEFORE
   * the charge OR negative AFTER it) — deliberately NOT the same condition as
   * `sendNegativeBalanceAlert` below (still band-gated, UNCHANGED, email
   * only).
   */
  balanceAlert: boolean;
};

const FLIGHT_SELECT = {
  id: true,
  flightDate: true,
  flightType: true,
  isSolo: true,
  noCharge: true,
  departureAirfield: true,
  arrivalAirfield: true,
  takeoffAt: true,
  landingAt: true,
  minutes: true,
  takeoffs: true,
  landings: true,
  aircraftRateCentsPerHour: true,
  aircraftPriceCategory: true,
  aircraftAmountCents: true,
  instructorRateCentsPerHour: true,
  instructorAmountCents: true,
  createdAt: true,
  // Story 14.4, AC 2 — `forcedByUserId` deliberately NOT selected (same
  // omission as `Booking`'s own `BOOKING_SELECT`): the DTO only needs
  // "was this forced, and why", not "by whom".
  forcedAt: true,
  forceReason: true,
  aircraft: { select: { id: true, registration: true } },
  person: { select: { id: true, firstName: true, lastName: true } },
  instructorProfile: { select: { person: { select: { id: true, firstName: true, lastName: true } } } },
  actorUser: { select: { email: true } },
} as const;

type SelectedFlight = {
  id: string;
  flightDate: Date;
  flightType: FlightType;
  isSolo: boolean;
  noCharge: boolean;
  departureAirfield: string | null;
  arrivalAirfield: string | null;
  takeoffAt: Date | null;
  landingAt: Date | null;
  minutes: number;
  takeoffs: number;
  landings: number;
  aircraftRateCentsPerHour: number;
  aircraftPriceCategory: AircraftPriceCategory;
  aircraftAmountCents: number;
  instructorRateCentsPerHour: number | null;
  instructorAmountCents: number | null;
  createdAt: Date;
  forcedAt: Date | null;
  forceReason: string | null;
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string };
  instructorProfile: { person: { id: string; firstName: string; lastName: string } } | null;
  actorUser: { email: string };
};

/**
 * Maps a selected row to the wire DTO. `includeActorEmail` is the story 5.4
 * own-access gate (`hasPermission(actor, 'people.read')` at the call site) —
 * a pilot/student reading their own registry never learns who registered the
 * movement (same conditional-field pattern as `accounts.service.ts`'s
 * `toStatementItem`). `includeForceReason` is review F2's own gate
 * (`hasPermission(actor, 'flights.manage')`) — masks `forceReason` to `null`
 * for a non-manage viewer while leaving `forcedAt` visible to everyone with
 * access to the flight (see `FlightListItem.forceReason`'s own doc-comment).
 * Every admin-only entrypoint in this file (`registerFlight`/`updateFlight`,
 * both gated on `flights.manage`) always passes `true` for
 * BOTH — the actor calling them already holds `flights.manage` by
 * definition (the `authorize` call at the top of each).
 */
function toListItem(flight: SelectedFlight, includeActorEmail: boolean, includeForceReason: boolean): FlightListItem {
  const hasInstructor = flight.instructorRateCentsPerHour !== null && flight.instructorAmountCents !== null;
  return {
    id: flight.id,
    flightDate: toDateOnlyString(flight.flightDate),
    flightType: flight.flightType,
    isSolo: flight.isSolo,
    noCharge: flight.noCharge,
    departureAirfield: flight.departureAirfield,
    arrivalAirfield: flight.arrivalAirfield,
    takeoffAt: flight.takeoffAt,
    landingAt: flight.landingAt,
    minutes: flight.minutes,
    takeoffs: flight.takeoffs,
    landings: flight.landings,
    aircraft: flight.aircraft,
    person: flight.person,
    instructor: flight.instructorProfile
      ? {
          personId: flight.instructorProfile.person.id,
          firstName: flight.instructorProfile.person.firstName,
          lastName: flight.instructorProfile.person.lastName,
        }
      : null,
    breakdown: {
      aircraftRateCentsPerHour: flight.aircraftRateCentsPerHour,
      aircraftPriceCategory: flight.aircraftPriceCategory,
      aircraftAmountCents: flight.aircraftAmountCents,
      ...(hasInstructor
        ? {
            instructorRateCentsPerHour: flight.instructorRateCentsPerHour!,
            instructorAmountCents: flight.instructorAmountCents!,
          }
        : {}),
      totalAmountCents: flight.aircraftAmountCents + (flight.instructorAmountCents ?? 0),
    },
    ...(includeActorEmail ? { actorEmail: flight.actorUser.email } : {}),
    createdAt: flight.createdAt,
    forcedAt: flight.forcedAt,
    // Review F2 (ratifica R-14.4-c): `forcedAt` (the "Deroga" fact) stays
    // visible to everyone with access to this flight; the motivo — which can
    // name another person's medical/document — is masked here, not left to
    // every UI call site to remember.
    forceReason: includeForceReason ? flight.forceReason : null,
  };
}

/**
 * One blocking document surfaced in `FLIGHT_BLOCKED_BY_EXPIRY`'s
 * `details.documents` (story 14.4; review F5/F6) — richer than bookings'
 * own `ExpiredDocument` (`{ typeName, expiresAt }`, UNCHANGED there — AC 5):
 * `expiresAt: null` marks an ABSENT document (F5, ratifica R-14.4-a: R4 says
 * "assente O scaduta", not just "scaduta") instead of an expired one, and
 * `role`/`personName` say WHOSE it is (F6 — a SCHOOL flight can block on the
 * person's OR the instructor's document, and "the following documents are
 * expired" alone is not actionable when two different people are involved).
 */
export type FlightBlockingDocument = {
  typeName: string;
  /** `null` <=> no `Expiry` was ever registered for this type (F5). A `YYYY-MM-DD` otherwise — always the FLIGHT-DAY comparison, never "today" (AC 1). */
  expiresAt: string | null;
  role: 'person' | 'instructor';
  personName: string;
};

/**
 * The ORIGINAL flight's identity fields, supplied ONLY by `updateFlight`
 * (review F4, ratifica R-14.4-b) — see `resolveFlightInput`'s own
 * doc-comment for what this exempts. `aircraftPriceCategory` (story 19.3,
 * Q-19.3-b) is the price column the original flight was charged: an edit
 * that keeps the person keeps it.
 */
type OriginalFlightIdentity = {
  aircraftId: string;
  personId: string;
  instructorPersonId: string | null;
  flightDate: Date;
  aircraftPriceCategory: AircraftPriceCategory;
};

type ResolvedFlightInput = {
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string; email: string | null };
  instructorProfileId: string | null;
  departureAirfield: string;
  arrivalAirfield: string;
  takeoffAt: Date;
  landingAt: Date;
  flightDate: Date;
  minutes: number;
  aircraftRateCentsPerHour: number;
  aircraftPriceCategory: AircraftPriceCategory;
  instructorRateCentsPerHour: number | null;
  /** Already rounded on the FULL duration. */
  instructorAmountCents: number | null;
  /** Story 14.4, AC 2 — set ONLY when an admin bypassed a real blocking expired document; `null` on every normal registration/edit, INCLUDING a `force: true` request with nothing to bypass. */
  forceStamp: { forcedAt: Date; forcedByUserId: string; forceReason: string } | null;
};

/**
 * Review F5 (ratifica R-14.4-a) — FLIGHTS-ONLY extension of
 * `findBlockingExpiredDocuments`: a blocking `ExpiryType` APPLICABLE to
 * `personId` (by `scope`, same ALL/PILOTS/STUDENTS/INSTRUCTORS rule
 * `expiries.service.ts#assertScopeCompatible` already uses at registration
 * time — no separate "applicability" notion exists elsewhere in the
 * scadenze domain) with NO `Expiry` row at all is a block, exactly like an
 * expired one (R4: "assente O scaduta" — the pre-fix guard only ever
 * checked "scaduta"). Bookings (story 7.4, AC 5 — semantics frozen by this
 * story) never call this; it runs ALONGSIDE `findBlockingExpiredDocuments`,
 * never folded into it. `applicableProfiles` is the CALLER's own view of the
 * person's role on THIS flight (pilot/student for the person slot,
 * instructor for the instructor slot) — never re-derived from a second
 * profile query.
 */
async function findMissingBlockingDocuments(
  personId: string,
  applicableProfiles: { pilot: boolean; student: boolean; instructor: boolean },
): Promise<Array<{ typeName: string }>> {
  const scopes: ExpiryScope[] = ['ALL'];
  if (applicableProfiles.pilot) scopes.push('PILOTS');
  if (applicableProfiles.student) scopes.push('STUDENTS');
  if (applicableProfiles.instructor) scopes.push('INSTRUCTORS');

  const applicableTypes = await prisma.expiryType.findMany({
    where: { isActive: true, blocksBooking: true, scope: { in: scopes } },
    select: { id: true, name: true },
  });
  if (applicableTypes.length === 0) {
    return [];
  }

  const registered = await prisma.expiry.findMany({
    where: { personId, expiryTypeId: { in: applicableTypes.map((type) => type.id) } },
    select: { expiryTypeId: true },
  });
  const registeredTypeIds = new Set(registered.map((expiry) => expiry.expiryTypeId));

  return applicableTypes.filter((type) => !registeredTypeIds.has(type.id)).map((type) => ({ typeName: type.name }));
}

/**
 * The FULL blocking-document picture for one flight — both scans
 * (`findBlockingExpiredDocuments`, shared verbatim with bookings, and
 * `findMissingBlockingDocuments`, flights-only) over BOTH people
 * (pilot/student and, when there is one, the instructor), tagged
 * `role`/`personName` (review F6).
 *
 * Extracted (story AOG-1a, review MAJOR-1 — PO decision 2026-08-07, option 2)
 * because it now has TWO callers inside `resolveFlightInput`: the
 * `FLIGHT_BLOCKED_BY_EXPIRY` 422 it always fed, AND the
 * `AIRCRAFT_OUT_OF_SERVICE` 422, which used to answer FIRST and therefore let
 * an admin derogate a grounding while never being told which documents that
 * same confirmation would also bypass (measured: 6 unnamed documents scavalcati
 * by a `forceReason` written for the grounding alone). ONE list, ONE shape, so
 * the two 422s can never disagree about what is blocking.
 *
 * The queries stay SEQUENTIAL, exactly as they were inline.
 */
async function scanBlockingDocuments(
  person: { id: string; name: string; hasActivePilot: boolean; hasActiveStudent: boolean },
  instructor: { personId: string; name: string } | null,
  flightDateOnly: string,
): Promise<FlightBlockingDocument[]> {
  const personExpired = (await findBlockingExpiredDocuments(person.id, flightDateOnly)).blockingDocuments;
  const personMissing = await findMissingBlockingDocuments(person.id, {
    pilot: person.hasActivePilot,
    student: person.hasActiveStudent,
    instructor: false,
  });
  const instructorExpired = instructor === null ? [] : (await findBlockingExpiredDocuments(instructor.personId, flightDateOnly)).blockingDocuments;
  const instructorMissing =
    instructor === null ? [] : await findMissingBlockingDocuments(instructor.personId, { pilot: false, student: false, instructor: true });

  return [
    ...personExpired.map((document) => ({ typeName: document.typeName, expiresAt: document.expiresAt, role: 'person' as const, personName: person.name })),
    ...personMissing.map((document) => ({ typeName: document.typeName, expiresAt: null, role: 'person' as const, personName: person.name })),
    ...instructorExpired.map((document) => ({ typeName: document.typeName, expiresAt: document.expiresAt, role: 'instructor' as const, personName: instructor!.name })),
    ...instructorMissing.map((document) => ({ typeName: document.typeName, expiresAt: null, role: 'instructor' as const, personName: instructor!.name })),
  ];
}

/**
 * The instructor row a flight may name, or `null` when that person does not
 * exist, is archived, or has no active `InstructorProfile` — the three cases
 * `resolveFlightInput` deliberately folds into ONE `INSTRUCTOR_NOT_FOUND`
 * (TD-1 AC 9 / decision 5.1 D1: never reveal whether an unknown id belongs to
 * nobody or to a non-instructor).
 *
 * Extracted with `scanBlockingDocuments` above (review MAJOR-1): the
 * out-of-service guard fires BEFORE the instructor is resolved, and reporting
 * the instructor's blocking documents there means resolving them there too —
 * with the SAME predicate, never a second one that could drift. That guard
 * does not THROW on an invalid instructor (the flight is already refused for
 * the grounding, and `INSTRUCTOR_NOT_FOUND` is what the caller gets once the
 * grounding is derogated): it simply reports no instructor document.
 */
async function findActiveInstructor(personId: string): Promise<{ personId: string; profileId: string; name: string } | null> {
  const instructorPerson = await prisma.person.findUnique({
    where: { id: personId },
    select: { firstName: true, lastName: true, archivedAt: true, instructorProfile: { select: { id: true, deactivatedAt: true } } },
  });
  const instructorProfile = instructorPerson?.instructorProfile ?? null;
  if (!instructorPerson || instructorPerson.archivedAt !== null || !instructorProfile || instructorProfile.deactivatedAt !== null) {
    return null;
  }
  return { personId, profileId: instructorProfile.id, name: `${instructorPerson.firstName} ${instructorPerson.lastName}` };
}

/**
 * The Europe/Rome CALENDAR day a flight is logged under (Dev Notes: "il giorno
 * ROMA, non UTC" — a 00:30 Roma takeoff is 22:30Z the day before, and must
 * still log as that Roma day). Derived in ONE place because two guards date
 * themselves on it: the expiry scan and (review MAJOR-1) the out-of-service
 * guard's own copy of that scan.
 */
function deriveFlightDate(takeoffAtIso: string): Date {
  return parseDateOnlyUtc(dateOnlyInZone(new Date(takeoffAtIso), APP_TIMEZONE));
}

/**
 * Review F4 (ratifica R-14.4-b) — an edit that changes NEITHER the
 * person, NOR the instructor, NOR the flight date is exempt from the expiry
 * guard entirely: same "correcting is not registering anew" principle as
 * R-14.3-a's flightType exemption. `original` is only ever supplied by
 * `updateFlight` (its own recorded identity); a brand-new `registerFlight`
 * call never passes it, so it is always fully checked. Without this, a
 * cycles-only edit of a HISTORICAL flight becomes a permanent
 * dead end (422, no legitimate bypass) the moment a document expires AFTER the
 * flight was flown, and forces the ADMIN force-override path to stamp a fake
 * "Deroga" on a flight that was never an operational override.
 *
 * A predicate (not an inline expression) since review MAJOR-1: the
 * out-of-service guard's document scan must honour the SAME exemption as the
 * expiry guard's, or the two 422s would report different lists.
 */
function isIdentityUnchanged(
  original: OriginalFlightIdentity | undefined,
  input: RegisterFlightInput,
  instructorPersonId: string | null,
  flightDate: Date,
): boolean {
  return (
    original !== undefined &&
    original.personId === input.personId &&
    original.instructorPersonId === instructorPersonId &&
    original.flightDate.getTime() === flightDate.getTime()
  );
}

/**
 * All of `registerFlight`'s pre-transaction guards and rate lookups (AC 1/2/
 * 3/4), extracted (story 5.3, Task 2) so `updateFlight` can re-run the
 * EXACT same validation on its NEW data ("tutti i 422 di 5.1 si applicano ai
 * DATI NUOVI", Contesto) without a second, drifting copy. Guard order
 * (consolidated pattern: existence 404 -> state 422 -> domain 422): aircraft
 * exists -> 404; person exists -> 404; aircraft archived ->
 * `AIRCRAFT_ARCHIVED`; aircraft out of service -> `AIRCRAFT_OUT_OF_SERVICE`
 * (story AOG-1a, P2 — `details: { reason, outOfServiceUntil }`, the SAME shape
 * the three booking guards carry, PLUS `documents` when the very same request
 * is also blocked by an expired/missing document (review MAJOR-1: one `force`
 * bypasses both, so both must be on screen before it is given); bypassable by
 * the admin `force` below, see the guard's own comment for its perimeter and
 * for why it cannot be dated);
 * person archived -> `PERSON_ARCHIVED`; person missing
 * an active pilot/student profile -> `PERSON_NOT_PILOT_OR_STUDENT`; person
 * has an active STUDENT profile and NO active pilot profile, on anything but
 * a `SCHOOL` flight AND not already the flight's OWN recorded type (story
 * 14.3, AC 1; review F3 + ratifica R-14.3-a: correcting a historical flight
 * while KEEPING its type is always allowed — the ban is on REGISTERING a new
 * non-SCHOOL flight, or on CHANGING an edit's type away from what is on
 * file, for a student-only person, never on leaving it untouched) ->
 * `STUDENT_FLIGHT_MUST_BE_SCHOOL`;
 * `takeoffAt`/`landingAt` resolution (story 11.1, AC 2/3 — the ONLY source
 * of `minutes`/`flightDate` now) -> `FLIGHT_TIMES_INVALID` if
 * `landingAt <= takeoffAt` or the derived duration exceeds 1440 minutes;
 * the derived `flightDate` (the Europe/Rome CALENDAR day of `takeoffAt`,
 * Dev Notes: "il giorno ROMA, non UTC") in the future ("today" is ALSO the
 * Europe/Rome calendar day now, story 16.1 — comparing a Roma date against a
 * UTC "today" rejected a flight that had already landed in the 00:00-02:00
 * Roma window) -> `FLIGHT_DATE_IN_FUTURE` (unchanged code/check, now applied to
 * the derived date);
 * `SCHOOL` without an instructor -> `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`;
 * instructor === pilot/student -> `INSTRUCTOR_SAME_AS_PILOT`; instructor
 * person unknown OR without an active `InstructorProfile` ->
 * `INSTRUCTOR_NOT_FOUND` (deliberately folded into one code — Dev Notes:
 * never reveal whether an unknown id belongs to nobody or to a
 * non-instructor). Then, BEFORE any transaction (see the module doc-comment
 * for why that read is safe): `getEffectiveRate` -> null -> `NO_AIRCRAFT_RATE`; with
 * an instructor, `getEffectiveInstructorRate` -> null ->
 * `NO_INSTRUCTOR_RATE`. The aircraft price is the column of the person's
 * PROFILE (story 19.3, R-19-e): student-only -> `studentPriceCents`,
 * otherwise -> `pilotPriceCents` — a pilot on a `SCHOOL` flight pays the
 * pilot price, and a person with both profiles active (legacy data, D-4) is a
 * pilot, the same reading `STUDENT_FLIGHT_MUST_BE_SCHOOL` makes. An edit
 * that keeps the person keeps the ORIGINAL category (Q-19.3-b, same
 * "correcting is not registering anew" principle as below), at the rate in
 * effect at the new `flightDate`. The instructor amount is rounded here,
 * `Math.round(rate * minutes / 60)` on the FULL duration (AD-2/NFR-5) — the
 * aircraft amount is computed the SAME way, but inside `buildFlightWrite`
 * (module doc-comment), which also zeroes both on a no-charge flight. The
 * rates are looked up on a no-charge flight too (story 19.6, Q-19.6-a = B):
 * frozen on the row as information, never charged.
 *
 * **Blocking-expiry guard-rail (story 14.4, AC 1/2; ratifica R4) — since story
 * AOG-1a the SAME `force` also covers the out-of-service block above
 * (ratifica R-AOG-c: one confirmation, one stamp, for both)**: `force`
 * without `flights.forceExpiry` (ADMIN-only — the gate lives on this
 * PERMISSION, not a role literal) is a 403, checked FIRST, before any query —
 * same "force-403 before any further query" ordering as `bookings.service.ts#createBooking`'s
 * AC 2. Once the instructor (if any) is resolved, BOTH the pilot/student's
 * AND the instructor's REGISTERED expiries are scanned against `flightDate`
 * (not "today") via the SAME shared core the booking expiry-block already
 * established (`bookings.service.ts#findBlockingExpiredDocuments`, reused
 * verbatim — never reimplemented) PLUS (review F5, ratifica R-14.4-a) every
 * blocking type APPLICABLE to that person with NO `Expiry` at all
 * (`findMissingBlockingDocuments`, FLIGHTS-ONLY — never folded into the
 * shared helper, AC 5's booking semantics stay frozen); any blocking
 * document across EITHER person is a 422 `FLIGHT_BLOCKED_BY_EXPIRY`
 * (`details.documents` lists every one, tagged `role`/`personName` — review
 * F6) unless `force` bypasses it, which stamps `forcedAt`/`forcedByUserId`/
 * `forceReason` on the eventual `Flight` row (same "scavalcato un blocco, non
 * spuntata una checkbox" convention as `Booking.forcedAt`) — `null` on every
 * normal flight, INCLUDING a `force: true` request with nothing to bypass.
 *
 * **Unchanged-identity edit exemption (review F4, ratifica
 * R-14.4-b)**: when `original` is supplied (`updateFlight` only) and the
 * NEW `personId`/`instructorPersonId`/`flightDate` are IDENTICAL to the
 * flight's own recorded ones, the ENTIRE expiry guard above is skipped — a
 * cycles/times-only edit of a historical flight is never
 * blocked (nor does it need a "Deroga" stamp) by a document that expired, or
 * was only ever required, AFTER the flight was flown. Same
 * "correcting-is-not-registering-anew" principle as `originalFlightType`'s
 * own exemption above; changing ANY of those three fields drops back to the
 * full check.
 */
async function resolveFlightInput(
  actor: Actor,
  input: RegisterFlightInput,
  originalFlightType?: FlightType,
  original?: OriginalFlightIdentity,
): Promise<ResolvedFlightInput> {
  // Story 14.4, AC 2 (ratifica R4): checked FIRST, before any query — same
  // ordering as `createBooking`'s own force-403 (this function's doc-comment).
  // Review 14.9 F4: guard on a DISTINCT permission (`flights.forceExpiry`,
  // not `flights.manage`) — since 14.9, no role holds `flights.manage`
  // without also holding `flights.forceExpiry` (both ADMIN-only), so this
  // branch is structurally unreachable today. Kept for a future role that
  // might hold `flights.manage` without `flights.forceExpiry` (story 14.4's
  // original design intent), deliberately without a test of its own — AC 2
  // of this story sanctions exactly this kind of now-unreachable guard.
  if (input.force && !hasPermission(actor, 'flights.forceExpiry')) {
    throw new ForbiddenError('Only an admin can force a flight blocked by an expired document.');
  }

  const aircraft = await prisma.aircraft.findUnique({
    where: { id: input.aircraftId },
    // Story AOG-1a (P2): `status`/`statusReason`/`outOfServiceUntil` join the
    // select — before this story the flight path never even READ the aircraft's
    // operational state (measured: a flight on a grounded aircraft passed every
    // state guard).
    select: { id: true, registration: true, archivedAt: true, status: true, statusReason: true, outOfServiceUntil: true },
  });
  if (!aircraft) {
    throw new NotFoundError('Aircraft not found.');
  }

  const person = await prisma.person.findUnique({
    where: { id: input.personId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      archivedAt: true,
      pilotProfile: { select: { deactivatedAt: true } },
      studentProfile: { select: { deactivatedAt: true } },
    },
  });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  // Pure derivations off the row just loaded — hoisted above the guards below
  // (review MAJOR-1) because the out-of-service guard's document scan needs the
  // person's own view of themselves on this flight. No guard moved with them.
  const hasActivePilot = person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null;
  const hasActiveStudent = person.studentProfile !== null && person.studentProfile.deactivatedAt === null;
  const personDisplayName = `${person.firstName} ${person.lastName}`;

  if (aircraft.archivedAt !== null) {
    throw new ValidationError('Cannot register a flight on an archived aircraft.', undefined, 'AIRCRAFT_ARCHIVED');
  }

  // Story AOG-1a, P2 (ratifica R-AOG-c) — the guard that did not exist. Placed
  // HERE, immediately after `AIRCRAFT_ARCHIVED`, so the documented order
  // (existence 404 -> state 422 -> domain 422) is preserved: a grounded
  // aircraft is rejected BEFORE `FLIGHT_DATE_IN_FUTURE`, which is exactly what
  // makes the story's own runtime probe discriminant.
  //
  // Perimeter (AD-4): `registerFlight` always (`original` undefined); an
  // edit that MOVES the flight onto a different aircraft (that aircraft
  // is a new registration for it); NEVER an edit that keeps the same
  // aircraft — same "correcting is not registering anew" principle as
  // R-14.4-b/R-14.3-a, because blocking a cycles-only edit of a
  // HISTORICAL flight just because its aircraft is grounded TODAY is a
  // permanent dead end. `deleteFlight` never comes through here at all.
  //
  // AD-5, declared: `Aircraft` has NO grounding START date (`updatedAt` changes
  // on every write to the row), so this guard can only see
  // the CURRENT state, never "was it grounded on the flight date". That is
  // precisely why the deroga below exists — the aircraft that comes back with
  // a hard landing is grounded immediately, and the flight that caused it must
  // still be loggable.
  //
  // Review MAJOR-1 (PO decision 2026-08-07, option 2): this 422 also carries
  // `details.documents` — the SAME list, in the SAME shape,
  // `FLIGHT_BLOCKED_BY_EXPIRY` carries. Until this fix the guard answered
  // BEFORE the document scan, so an admin who confirmed "deroga pensata solo
  // per il fermo" also scavalcava, in silence, every blocking document of that
  // flight (measured: 6 of them, none ever named) — and the ONE `force`
  // ratified by R-AOG-c made that a single, undifferentiated stamp. The
  // promise written a few screens below ("never partial — the admin sees the
  // whole picture before deciding to override") is true again on THIS path
  // too. The key is OMITTED when nothing is blocking, so a grounding with no
  // document behind it answers with exactly the shape (and the exactly
  // byte-identical UI sentence) it answered with before.
  // Cost: the scan is CALLED from two places but RUNS at most once per
  // request — this branch throws, so the call below is never reached.
  const aircraftUnchanged = original !== undefined && original.aircraftId === input.aircraftId;
  const outOfServiceBlock = aircraft.status === 'OUT_OF_SERVICE' && !aircraftUnchanged;
  if (outOfServiceBlock && !input.force) {
    const groundedFlightDate = deriveFlightDate(input.takeoffAt);
    // `=== input.personId` is the `INSTRUCTOR_SAME_AS_PILOT` input the guard
    // below rejects: there is no instructor slot to scan for it, and reporting
    // the same person twice under two roles would be noise, not information.
    const groundedInstructorPersonId = input.instructorPersonId === input.personId ? null : (input.instructorPersonId ?? null);
    const groundedInstructor = groundedInstructorPersonId === null ? null : await findActiveInstructor(groundedInstructorPersonId);
    const documents = isIdentityUnchanged(original, input, groundedInstructorPersonId, groundedFlightDate)
      ? []
      : await scanBlockingDocuments(
          { id: person.id, name: personDisplayName, hasActivePilot, hasActiveStudent },
          groundedInstructor,
          toDateOnlyString(groundedFlightDate),
        );
    throw new ValidationError(
      `Aircraft is out of service: ${aircraft.statusReason}.`,
      documents.length === 0 ? outOfServiceDetails(aircraft) : { ...outOfServiceDetails(aircraft), documents },
      'AIRCRAFT_OUT_OF_SERVICE',
    );
  }

  if (person.archivedAt !== null) {
    throw new ValidationError('Cannot register a flight for an archived person.', undefined, 'PERSON_ARCHIVED');
  }

  if (!hasActivePilot && !hasActiveStudent) {
    throw new ValidationError(
      'Person must have an active pilot or student profile to be logged on a flight.',
      undefined,
      'PERSON_NOT_PILOT_OR_STUDENT',
    );
  }

  // Story 14.3 (AC 1, ratifica R1): a person with an active STUDENT profile
  // and NO active pilot profile may only log SCHOOL flights — the rule is on
  // the ACTIVE PROFILE (never the role), so a student who ALSO holds an
  // active pilot profile (both active — took the license) is unrestricted,
  // same as a plain pilot. Review F3 (ratifica R-14.3-a): `originalFlightType`
  // is only ever set by `updateFlight` (the flight's OWN recorded type,
  // never re-derived from the person's CURRENT profile) — an edit that
  // keeps that exact type is exempt from this guard, because the person's
  // profile status may have changed (e.g. lost/deactivated a license) SINCE
  // the flight was flown, and the historical record must stay correctable
  // without ever being silently reclassified. `registerFlight` never passes
  // this argument, so a brand-new non-SCHOOL flight for a student-only
  // person is rejected exactly as before.
  if (hasActiveStudent && !hasActivePilot && input.flightType !== 'SCHOOL' && input.flightType !== originalFlightType) {
    throw new ValidationError(
      'A person with only an active student profile can only log SCHOOL flights.',
      undefined,
      'STUDENT_FLIGHT_MUST_BE_SCHOOL',
    );
  }

  // Story 11.1 (AC 2/3): `takeoffAt`/`landingAt` are the SOURCE of both
  // `minutes` and `flightDate` — never independent inputs anymore.
  const takeoffAt = new Date(input.takeoffAt);
  const landingAt = new Date(input.landingAt);
  // Story 16.2 (F14/AD-7): the LOWER bound of the duration lives here, where
  // the upper bound below already lives — ONE rule ("`landingAt` must be at
  // least a full minute after `takeoffAt`, and the duration must not exceed
  // 1440 minutes"), ONE code on the wire, ONE i18n message the form already
  // maps. Before this story a 20-second interval passed and was ROUNDED UP
  // to a 1-minute flight by a `Math.max(1, …)` below; that clamp is gone
  // (orphaned by this guard: a >= 60 000 ms interval can never round to 0).
  if (landingAt.getTime() - takeoffAt.getTime() < 60_000) {
    throw new ValidationError('landingAt must be at least one minute after takeoffAt.', undefined, 'FLIGHT_TIMES_INVALID');
  }
  const minutes = Math.round((landingAt.getTime() - takeoffAt.getTime()) / 60_000);
  if (minutes > 1440) {
    throw new ValidationError('Flight duration must not exceed 1440 minutes (24h).', undefined, 'FLIGHT_TIMES_INVALID');
  }

  // The Europe/Rome CALENDAR day the flight is logged under — derived by
  // `deriveFlightDate` (its own doc-comment), the single derivation shared
  // with the out-of-service guard above.
  const flightDate = deriveFlightDate(input.takeoffAt);
  if (flightDate.getTime() > todayDateOnlyUtcInZone(APP_TIMEZONE).getTime()) {
    throw new ValidationError('Flight date cannot be in the future.', undefined, 'FLIGHT_DATE_IN_FUTURE');
  }

  if (input.flightType === 'SCHOOL' && !input.instructorPersonId) {
    throw new ValidationError('A SCHOOL flight requires an instructor.', undefined, 'SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR');
  }

  // Story 9.4: the dual/solo distinction only makes sense on a SCHOOL
  // flight — a solo carries (and bills) the instructor exactly like dual,
  // it only flips who is PIC (derived, never stored).
  if (input.isSolo && input.flightType !== 'SCHOOL') {
    throw new ValidationError('isSolo is only valid on a SCHOOL flight.', undefined, 'SOLO_REQUIRES_SCHOOL');
  }

  const instructorPersonId = input.instructorPersonId ?? null;
  let instructorProfileId: string | null = null;
  // Review F6 — the instructor's display name, needed ONLY to label a
  // blocking document as theirs (below); `null` whenever there is no
  // instructor on this flight.
  let instructorName: string | null = null;
  if (instructorPersonId) {
    if (instructorPersonId === input.personId) {
      throw new ValidationError('The instructor cannot be the same person as the pilot/student.', undefined, 'INSTRUCTOR_SAME_AS_PILOT');
    }

    // TD-1, AC 9: an archived Person with an otherwise-active
    // InstructorProfile is treated EXACTLY like a missing/deactivated
    // profile — same folded `INSTRUCTOR_NOT_FOUND` code (anti-enumeration,
    // decision 5.1 D1), never a distinct message that would reveal the
    // person exists but is archived. The three cases collapse inside
    // `findActiveInstructor` (shared with the out-of-service guard above).
    const instructor = await findActiveInstructor(instructorPersonId);
    if (!instructor) {
      throw new ValidationError('Instructor has no active instructor profile.', undefined, 'INSTRUCTOR_NOT_FOUND');
    }
    instructorProfileId = instructor.profileId;
    instructorName = instructor.name;
  }

  // Review F4 (ratifica R-14.4-b) — the unchanged-identity exemption, in
  // `isIdentityUnchanged`'s own doc-comment (shared with the out-of-service
  // guard above so the two 422s never disagree on what they exempt).
  const identityUnchanged = isIdentityUnchanged(original, input, instructorPersonId, flightDate);

  // Story 14.4, AC 1/2 (ratifica R4) — see this function's own doc-comment.
  // Both the pilot/student AND, when present, the instructor are scanned;
  // every blocking document across EITHER is reported together (never
  // partial — the admin sees the whole picture before deciding to override,
  // on THIS path and — since review MAJOR-1 — on the out-of-service one too).
  // Review F5 (ratifica R-14.4-a): R4 says "assente O scaduta" — a blocking
  // type APPLICABLE to the person with NO `Expiry` at all
  // (`findMissingBlockingDocuments`) blocks exactly like an expired one,
  // alongside (never inside) the expired-document scan
  // (`findBlockingExpiredDocuments`, shared verbatim with bookings — AC 5,
  // that surface's own semantics stay frozen).
  const blockingDocuments: FlightBlockingDocument[] = identityUnchanged
    ? []
    : await scanBlockingDocuments(
        { id: input.personId, name: personDisplayName, hasActivePilot, hasActiveStudent },
        instructorPersonId === null ? null : { personId: instructorPersonId, name: instructorName! },
        toDateOnlyString(flightDate),
      );

  // Story AOG-1a, AC 10 (ratifica R-AOG-c): ONE `force` covers BOTH blocks.
  // `outOfServiceBlock` can only still be true here if `input.force` was set
  // (the guard above threw otherwise), so an admin who confirms once scavalca
  // the grounding AND every blocking document, and gets exactly ONE stamp.
  // The "scavalcato un blocco, non spuntata una checkbox" convention is
  // unchanged: `force: true` with nothing to bypass still stamps nothing.
  let forceStamp: ResolvedFlightInput['forceStamp'] = null;
  if (blockingDocuments.length > 0 || outOfServiceBlock) {
    if (input.force) {
      // The force-403 guard at the top of this function already guarantees
      // `flights.forceExpiry` here, and the schema's own refine guarantees
      // `forceReason` is a non-empty string whenever `force` is `true` — the
      // `!` is safe (same reasoning as `createBooking`'s own force-stamp).
      forceStamp = { forcedAt: new Date(), forcedByUserId: actor.userId, forceReason: input.forceReason! };
    } else {
      throw new ValidationError(
        `Cannot register this flight: the following documents are missing or expired: ${blockingDocuments.map((document) => document.typeName).join(', ')}.`,
        { documents: blockingDocuments },
        'FLIGHT_BLOCKED_BY_EXPIRY',
      );
    }
  }

  // Rate lookups BEFORE any transaction (module doc-comment) — AD-4, the
  // effective rate at `flightDate`.
  const aircraftRate = await getEffectiveRate(actor, input.aircraftId, flightDate);
  if (!aircraftRate) {
    throw new ValidationError('No aircraft rate is in effect on the flight date.', undefined, 'NO_AIRCRAFT_RATE');
  }
  // Story 19.3 (R-19-e, Q-19.3-b) — this function's own doc-comment.
  const aircraftPriceCategory: AircraftPriceCategory =
    original !== undefined && original.personId === input.personId ? original.aircraftPriceCategory : hasActivePilot ? 'PILOT' : 'STUDENT';
  const aircraftRateCentsPerHour = aircraftPriceCategory === 'PILOT' ? aircraftRate.pilotPriceCents : aircraftRate.studentPriceCents;

  let instructorRate: InstructorRateListItem | null = null;
  if (instructorPersonId) {
    instructorRate = await getEffectiveInstructorRate(actor, instructorPersonId, flightDate);
    if (!instructorRate) {
      throw new ValidationError('No instructor rate is in effect on the flight date.', undefined, 'NO_INSTRUCTOR_RATE');
    }
  }

  const instructorAmountCents = instructorRate ? Math.round((instructorRate.priceCentsPerHour * minutes) / 60) : null;

  return {
    aircraft: { id: aircraft.id, registration: aircraft.registration },
    person: { id: person.id, firstName: person.firstName, lastName: person.lastName, email: person.email },
    instructorProfileId,
    departureAirfield: input.departureAirfield,
    arrivalAirfield: input.arrivalAirfield,
    takeoffAt,
    landingAt,
    flightDate,
    minutes,
    aircraftRateCentsPerHour,
    aircraftPriceCategory,
    instructorRateCentsPerHour: instructorRate?.priceCentsPerHour ?? null,
    instructorAmountCents,
    forceStamp,
  };
}

/**
 * The ONE overlap predicate of the flight registry (story 16.2, P1; AD-1/
 * AD-2) — two call sites (`registerFlight`, `updateFlight`), never two
 * implementations. Until this story the registry had NO second line of
 * defence at all: request idempotency (TD-2) is opt-in on a header, so a
 * double click or a reload after a timeout registered the SAME flight twice,
 * charged it twice and counted its minutes twice in the aircraft's hours.
 *
 * ASSUMES the caller already holds the `FOR UPDATE` lock on
 * `params.aircraftId` and calls this INSIDE that transaction: that lock is
 * what serializes two concurrent
 * registrations on the same airframe, so the read below can never miss a
 * flight that a racing transaction is about to commit. This is exactly where
 * `createBooking`/`approveBooking` put their own three overlap predicates
 * (`bookings.service.ts`), and putting it in `resolveFlightInput` (which runs
 * BEFORE the transaction) would reopen the TOCTOU window those closed.
 *
 * Interval semantics are the bookings' semantics, deliberately: `[takeoffAt,
 * landingAt)` is SEMI-OPEN, so two flights that merely TOUCH (a landing at
 * 10:00 and the next takeoff at 10:00) do NOT overlap — one runway instant,
 * not a conflict. An app with two different interval rules would itself be
 * the defect. Every existing flight occupies its interval: a deleted flight
 * no longer exists, so it frees the slot by construction (story 19.6).
 * `excludeFlightId` is load-bearing for `updateFlight`, not decorative: the
 * edited flight is still on its own slot, so every conservative edit
 * (cycles, airfields) would answer 409 without it.
 *
 * `orderBy takeoffAt asc` makes the flight NAMED in `details` deterministic
 * when several overlap — an e2e assertion on a non-deterministic id would be
 * flaky by construction.
 *
 * KNOWN, DECLARED limit: historical flights (pre-story 11.1) may have
 * `takeoffAt`/`landingAt` NULL. A `NULL` satisfies neither `lt` nor `gt`, so
 * such a row neither conflicts nor can be conflicted with. That is correct
 * rather than unfortunate — before 11.1 the instants did not exist, so the
 * overlap was not even expressible — and it is unreachable through the API
 * (both instants are mandatory since 11.1).
 *
 * NOT derogable by `force`/`forceReason` (ratifica del piano 16-18), unlike
 * `FLIGHT_BLOCKED_BY_EXPIRY`/`AIRCRAFT_OUT_OF_SERVICE`: there is no dead end
 * to escape (lezione 14.6 F2) because the 409 NAMES the conflicting flight,
 * and the way out is to delete or edit THAT one — an action the app
 * already offers on every row of the registry.
 *
 * Error ordering, for the record: `resolveFlightInput` runs before the
 * transaction, so all of its 404s and 422s (archived aircraft, grounded
 * aircraft, person, documents, rates, times) PRECEDE this 409 — a request
 * that is both overlapping and on an archived aircraft answers
 * `AIRCRAFT_ARCHIVED`. Same hierarchy as `createBooking`: existence 404 ->
 * state/domain 422 -> conflict 409.
 */
async function assertNoOverlappingFlight(
  tx: Prisma.TransactionClient,
  params: { aircraftId: string; takeoffAt: Date; landingAt: Date; excludeFlightId: string | null },
): Promise<void> {
  const conflict = await tx.flight.findFirst({
    where: {
      aircraftId: params.aircraftId,
      takeoffAt: { lt: params.landingAt },
      landingAt: { gt: params.takeoffAt },
      ...(params.excludeFlightId === null ? {} : { id: { not: params.excludeFlightId } }),
    },
    orderBy: { takeoffAt: 'asc' },
    select: { id: true, takeoffAt: true, landingAt: true },
  });
  if (!conflict) {
    return;
  }
  throw new ConflictError(
    `Aircraft already has a registered flight overlapping [${params.takeoffAt.toISOString()}, ${params.landingAt.toISOString()}).`,
    {
      flightId: conflict.id,
      // ISO 8601 UTC by hand, never a `Date` left for `NextResponse.json` to
      // serialize (same discipline as `aircraft-status.ts#outOfServiceDetails`):
      // this API is also consumed by the future Flutter app, so the wire
      // format is written down, not inferred. Non-null by construction — the
      // `lt`/`gt` clauses above cannot match a NULL instant.
      takeoffAt: conflict.takeoffAt!.toISOString(),
      landingAt: conflict.landingAt!.toISOString(),
    },
    'FLIGHT_OVERLAP',
  );
}

/**
 * What `buildFlightWrite` produces: the `Flight` columns a registration and
 * an edit both write (everything but `actorUserId`, creation-only, and the
 * force stamp — `updateFlight` writes it only when the edit itself derogates,
 * D-7), the total the charge debits, and the charge's description.
 */
type FlightWrite = {
  flightData: {
    aircraftId: string;
    personId: string;
    instructorProfileId: string | null;
    departureAirfield: string;
    arrivalAirfield: string;
    takeoffAt: Date;
    landingAt: Date;
    flightDate: Date;
    flightType: FlightType;
    isSolo: boolean;
    noCharge: boolean;
    minutes: number;
    takeoffs: number;
    landings: number;
    aircraftRateCentsPerHour: number;
    aircraftPriceCategory: AircraftPriceCategory;
    aircraftAmountCents: number;
    instructorRateCentsPerHour: number | null;
    instructorAmountCents: number | null;
  };
  totalAmountCents: number;
  description: string;
};

/**
 * The ONE place that turns a resolved input into the flight's snapshot
 * columns, its total and its charge's description (story 19.6, AD-4) — used
 * by `registerFlightCore` and `updateFlight`, so a registration and an edit
 * of the same data can never diverge. Pure: no I/O.
 *
 * Full duration, full rate (story 12.13: package consumption retired). On a
 * `noCharge` flight (R-19-d) both amounts are `0` while the rates stay frozen
 * as information (Q-19.6-a = B); the instructor amount is `0`, never `null`,
 * because `null` is what says "no instructor on this flight" (`toListItem`).
 * The description starts with the no-charge wording so it survives the
 * statement card's end-truncation on a phone; a normal flight's is unchanged.
 */
function buildFlightWrite(resolved: ResolvedFlightInput, input: RegisterFlightInput): FlightWrite {
  const aircraftAmountCents = input.noCharge ? 0 : Math.round((resolved.aircraftRateCentsPerHour * resolved.minutes) / 60);
  const instructorAmountCents = resolved.instructorAmountCents === null ? null : input.noCharge ? 0 : resolved.instructorAmountCents;
  const label = input.noCharge ? 'Volo senza addebito' : 'Volo';
  return {
    flightData: {
      aircraftId: resolved.aircraft.id,
      personId: resolved.person.id,
      instructorProfileId: resolved.instructorProfileId,
      departureAirfield: resolved.departureAirfield,
      arrivalAirfield: resolved.arrivalAirfield,
      takeoffAt: resolved.takeoffAt,
      landingAt: resolved.landingAt,
      flightDate: resolved.flightDate,
      flightType: input.flightType,
      isSolo: input.isSolo,
      noCharge: input.noCharge,
      minutes: resolved.minutes,
      takeoffs: input.takeoffs ?? 1,
      landings: input.landings ?? 1,
      aircraftRateCentsPerHour: resolved.aircraftRateCentsPerHour,
      aircraftPriceCategory: resolved.aircraftPriceCategory,
      aircraftAmountCents,
      instructorRateCentsPerHour: resolved.instructorRateCentsPerHour,
      instructorAmountCents,
    },
    totalAmountCents: aircraftAmountCents + (instructorAmountCents ?? 0),
    description: `${label} ${resolved.aircraft.registration} ${toDateOnlyString(resolved.flightDate)} — ${formatMinutes(resolved.minutes)}`,
  };
}

/** `SUM(AccountMovement.amountCents)` of one account (AD-3: the balance is never a stored value). */
async function readBalanceCents(tx: Prisma.TransactionClient, accountId: string): Promise<number> {
  const aggregate = await tx.accountMovement.aggregate({
    where: { accountId },
    _sum: { amountCents: true },
  });
  return aggregate._sum.amountCents ?? 0;
}

type RegisterFlightCoreResult = {
  flight: SelectedFlight;
  balanceBeforeCents: number;
  balanceAfterCents: number;
};

/**
 * The in-transaction work of a flight registration (story 5.1). ASSUMES
 * every lock its writes need is ALREADY held by the caller (the `Aircraft`
 * row behind the flight, the `Account` row behind `accountId`) — it takes
 * none of its own.
 *
 * 1. Reads the pre-movement balance (`readBalanceCents`, AD-3).
 * 2. Writes, in order: `Flight.create` (the `buildFlightWrite` snapshot, plus
 *    the actor and the force stamp), the `FLIGHT_CHARGE` `AccountMovement`
 *    (`amountCents: -(total)`, linked via `flightId` — always created, `0` on
 *    a no-charge flight: one charge per flight, AD-7). Nothing is written on
 *    the `Aircraft` row (story 19.2: its hours are the sum of its flights).
 */
async function registerFlightCore(
  tx: Prisma.TransactionClient,
  params: {
    actorUserId: string;
    accountId: string;
    write: FlightWrite;
    /** Story 14.4, AC 2 — `resolveFlightInput`'s own force-stamp, spread onto `Flight.create`'s data verbatim (`null` on every normal flight). */
    forceStamp: ResolvedFlightInput['forceStamp'];
  },
): Promise<RegisterFlightCoreResult> {
  const balanceBeforeCents = await readBalanceCents(tx, params.accountId);

  const created = await tx.flight.create({
    data: {
      ...params.write.flightData,
      actorUserId: params.actorUserId,
      // Story 14.4, AC 2: stamped ONLY when a real block was bypassed
      // (`forceStamp`) — otherwise every field stays `null`, same convention
      // as `createBooking`'s own `forceStamp` spread.
      ...(params.forceStamp ?? {}),
    },
    select: FLIGHT_SELECT,
  });

  await tx.accountMovement.create({
    data: {
      accountId: params.accountId,
      type: 'FLIGHT_CHARGE',
      // `0 - totalAmountCents`, NOT unary `-totalAmountCents`: unary negation
      // of `0` (a no-charge flight, story 19.6) produces `-0`, a distinct (if
      // numerically equal) value that a strict `Object.is`-based comparison
      // downstream (e.g. `toBe`) could trip on.
      amountCents: 0 - params.write.totalAmountCents,
      description: params.write.description,
      effectiveDate: params.write.flightData.flightDate,
      actorUserId: params.actorUserId,
      flightId: created.id,
    },
  });

  return { flight: created, balanceBeforeCents, balanceAfterCents: balanceBeforeCents - params.write.totalAmountCents };
}

/**
 * Registers a flight and its automatic charge in one shot (AC 1/2/3/4).
 * `flights.manage` (ADMIN-only, FR-14) — every read this function performs
 * through `getEffectiveRate`/`getEffectiveInstructorRate`/
 * `getAccountOverview` re-checks its own coarser permission
 * (`aircraft.manage`/`people.read`), which every actor holding
 * `flights.manage` today also holds (same guard-free-re-read caveat as
 * `recordAdjustment`'s doc-comment — revisit if that ever decouples).
 *
 * Guards and rate lookups: `resolveFlightInput` (story 5.3's extraction —
 * unchanged behavior/error codes from 5.1); the columns, total and charge
 * description: `buildFlightWrite` (story 19.6, shared with `updateFlight`).
 *
 * ONE `prisma.$transaction`: `FOR UPDATE` locks on the `Aircraft` row (raw
 * SQL — Prisma has no select-for-update) and, after the
 * `Account` get-or-create upsert, on the `Account` row (same pattern as
 * `recordAdjustment`) so the pre-movement balance never races a concurrent
 * top-up/adjustment/flight on the same account. This lock shape is
 * UNCHANGED from 5.1 — the in-transaction WORK after it lives in
 * `registerFlightCore`. Story 16.2 adds ONE read under that same aircraft
 * lock, before any write: `assertNoOverlappingFlight` (409 `FLIGHT_OVERLAP`).
 *
 * Returns the created flight plus the refreshed account overview. POST-commit
 * (never inside the transaction, Dev Notes): compares the balance band
 * before/after and fires `sendNegativeBalanceAlert` (fire-and-forget) exactly
 * when it worsened — identical rule to `recordAdjustment`'s AC 2/3.
 */
export async function registerFlight(actor: Actor, input: RegisterFlightInput): Promise<RegisterFlightResult> {
  authorize(actor, 'flights.manage');

  const resolved = await resolveFlightInput(actor, input);
  const write = buildFlightWrite(resolved, input);

  // Threshold read BEFORE the transaction (same pattern as `recordAdjustment`).
  const thresholdCents = await getNegativeBalanceThresholdCents();

  const {
    flight: createdFlight,
    balanceBeforeCents,
    balanceAfterCents,
    accountId,
    accountCreatedAt,
  } = await prisma.$transaction(async (tx) => {
    // Row lock (FOR UPDATE) — serializes concurrent registrations on this
    // aircraft, so the `FLIGHT_OVERLAP` read below never misses a racing
    // flight (story 16.2), and opens the `Aircraft -> Account` lock order.
    const lockedAircraft = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Aircraft" WHERE "id" = ${resolved.aircraft.id} FOR UPDATE`;
    if (lockedAircraft.length === 0) {
      throw new NotFoundError('Aircraft not found.');
    }

    // Story 16.2 (P1/P2): 409 `FLIGHT_OVERLAP` under the lock just taken —
    // placed BEFORE the account get-or-create below so a rejected
    // registration never even reaches it (economy, not correctness: the
    // upsert would roll back anyway).
    await assertNoOverlappingFlight(tx, {
      aircraftId: resolved.aircraft.id,
      takeoffAt: resolved.takeoffAt,
      landingAt: resolved.landingAt,
      excludeFlightId: null,
    });

    // `createdAt` selected too (H3 fix, below): the fallback account
    // overview built if the post-commit re-read fails needs it.
    const account = await tx.account.upsert({
      where: { personId: resolved.person.id },
      create: { personId: resolved.person.id },
      update: {},
      select: { id: true, createdAt: true },
    });

    // Row lock (FOR UPDATE), same pattern as `recordAdjustment`: the upsert
    // above cannot itself be locked ahead of time, so the lock is taken
    // right after it — serializes concurrent top-ups/adjustments/flights on
    // THIS account so the "balance before" read never races.
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;

    const core = await registerFlightCore(tx, {
      actorUserId: actor.userId,
      accountId: account.id,
      write,
      forceStamp: resolved.forceStamp,
    });
    return { ...core, accountId: account.id, accountCreatedAt: account.createdAt };
  });

  // Guard-free re-read, same rationale as `recordTopUp`. H3 fix
  // (docs/security/owasp-audit-2026-07-22.md): the flight above already
  // committed, so a failure in this read must never propagate out of this
  // function — it would free the caller's Idempotency-Key (`apiRoute`'s AC
  // 4) and let a retry double-register the flight. On failure, degrade to
  // the balance already computed inside the (committed) transaction instead
  // of throwing.
  let account: AccountOverview;
  try {
    account = await getAccountOverview(actor, resolved.person.id);
  } catch (error) {
    console.error('registerFlight: post-commit account overview read failed', error);
    account = { account: { id: accountId, createdAt: accountCreatedAt }, balanceCents: balanceAfterCents, recentMovements: [] };
  }

  const bandBefore = balanceBand(balanceBeforeCents, thresholdCents);
  const bandAfter = balanceBand(balanceAfterCents, thresholdCents);
  if (bandWorsened(bandBefore, bandAfter)) {
    // Fire-and-forget, AFTER commit (Dev Notes) — same pattern as
    // `recordAdjustment`; the email quotes the post-commit balance. Band-gated
    // and UNCHANGED by review F7 (ratifica R-14.4-d) — only the IN-APP signal
    // below gets the new "already red OR ends up red" condition.
    void sendNegativeBalanceAlert(
      resolved.person.id,
      { firstName: resolved.person.firstName, lastName: resolved.person.lastName, email: resolved.person.email },
      account.balanceCents,
    );
  }
  // Review F7: deliberately NOT `bandWorsened` (see `RegisterFlightResult.balanceAlert`'s own doc-comment).
  const balanceAlert = hasNegativeBalanceAlert(balanceBeforeCents, balanceAfterCents);

  // `true, true`: registerFlight/updateFlight are both
  // admin-only (`flights.manage`, story 5.4's own-access branch never
  // reaches here) — `actorEmail`/`forceReason` are always shown to the admin
  // actor who just acted.
  return { flight: toListItem(createdFlight, true, true), account, balanceAlert };
}

/**
 * The flight's `FLIGHT_CHARGE` — exactly one per flight (`flightId @unique`,
 * AD-7), read under the caller's `Flight` lock, which also keeps its
 * `accountId` stable (only `updateFlight`, under that same lock, moves it).
 * Absent => a broken invariant (`registerFlightCore` creates it in the same
 * transaction as the flight): thrown as a plain `Error`, never a half-done
 * delete or edit.
 */
async function loadFlightCharge(tx: Prisma.TransactionClient, flightId: string): Promise<{ id: string; accountId: string }> {
  const charge = await tx.accountMovement.findUnique({
    where: { flightId },
    select: { id: true, accountId: true },
  });
  if (!charge) {
    throw new Error(`Flight ${flightId} has no FLIGHT_CHARGE movement.`);
  }
  return { id: charge.id, accountId: charge.accountId };
}

/**
 * D-8: a charge a manual rettifica points at (`reversalOfId`, story 3.3) =>
 * 409, unchanged since review 5.3 M1 — deleting or rewriting it would leave
 * the rettifica as a stray credit or debit on the account. Since review 19.6
 * F1 `accounts.service.ts#recordAdjustment` refuses a `FLIGHT_CHARGE`
 * original (422), so only a rettifica recorded before that guard can match:
 * this stays as the defence for those legacy rows. The caller must already
 * hold the charge's `Account` lock — the one lock `recordAdjustment` shares
 * with this path — so nothing committed before it can be missed.
 */
async function assertChargeNotAdjusted(tx: Prisma.TransactionClient, chargeId: string): Promise<void> {
  const charge = await tx.accountMovement.findUnique({
    where: { id: chargeId },
    select: { reversal: { select: { id: true } } },
  });
  if (charge?.reversal) {
    throw new ConflictError("This flight's charge has already been reversed by a manual adjustment.");
  }
}

/**
 * Deletes a flight together with its charge (story 19.6, P2 — R-19-c; AD-3).
 * `flights.manage` only, checked before any query. Always allowed, like the
 * cancellation it replaces: no re-validation of an archived person/aircraft,
 * a grounded aircraft or the date — deleting gives money back, it never
 * needs its targets to still be "valid".
 *
 * ONE `prisma.$transaction`, lock order Flight -> Aircraft -> Account (module
 * doc-comment): the `Flight` row `FOR UPDATE` (0 rows => 404 — a second
 * delete, or a concurrent one that won), its CURRENT `Aircraft` row (kept for
 * the macro order with `updateFlight`), the charge (`loadFlightCharge`), the
 * charge's `Account` row, then the D-8 check (`assertChargeNotAdjusted`: 409
 * when a manual rettifica points at it). Then the charge is deleted BEFORE
 * the flight: with `AccountMovement.flightId`
 * `ON DELETE RESTRICT` the opposite order fails, by design. A `TrainingNote`
 * linked to the flight keeps its row, its `flightId` going `NULL` (`ON DELETE
 * SET NULL`). No balance read, no alert: the balance can only go up.
 */
export async function deleteFlight(actor: Actor, flightId: string): Promise<void> {
  authorize(actor, 'flights.manage');

  await prisma.$transaction(async (tx) => {
    const lockedFlight = await tx.$queryRaw<Array<{ aircraftId: string }>>`
      SELECT "aircraftId" FROM "Flight" WHERE "id" = ${flightId} FOR UPDATE`;
    if (lockedFlight.length === 0) {
      throw new NotFoundError('Flight not found.');
    }
    await tx.$queryRaw`SELECT "id" FROM "Aircraft" WHERE "id" = ${lockedFlight[0]!.aircraftId} FOR UPDATE`;

    const charge = await loadFlightCharge(tx, flightId);
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${charge.accountId} FOR UPDATE`;
    await assertChargeNotAdjusted(tx, charge.id);

    await tx.accountMovement.delete({ where: { id: charge.id } });
    await tx.flight.delete({ where: { id: flightId } });
  });
}

/**
 * Edits a flight in place (story 19.6, P3 — R-19-c; AD-4): the SAME `Flight`
 * row and the SAME `FLIGHT_CHARGE` movement are rewritten, nothing is created.
 * `flights.manage` only. The new data goes through the FULL
 * `resolveFlightInput` guard/rate-lookup set — every 404/422 of a
 * registration applies — with the exemptions keyed on the flight's own
 * recorded identity (read here, outside the transaction, 404 if missing):
 * type (R-14.3-a), person/instructor/date (R-14.4-b), aircraft (AOG-1a) and
 * price category with the person unchanged (Q-19.3-b). `buildFlightWrite`
 * produces the columns, total and description exactly as a registration.
 *
 * ONE `prisma.$transaction`, lock order Flight -> Aircraft -> Account (module
 * doc-comment): the `Flight` row `FOR UPDATE` (0 rows => 404: deleted in the
 * meantime — never a P2025/500 from the update below; a different
 * `updatedAt` than the pre-read's => 409 `FLIGHT_MODIFIED_CONCURRENTLY`,
 * review F3: the exemptions above were decided on an identity a concurrent
 * edit has since rewritten); the current and new `Aircraft` rows in one
 * ordered query (404 if one is gone); the overlap guard on the NEW aircraft,
 * excluding this flight; the charge (`loadFlightCharge`); the new person's
 * account get-or-create, then the charge's and the new person's `Account`
 * rows in one ordered query; the D-8 check (`assertChargeNotAdjusted`, 409
 * with a manual rettifica); the new account's balance; `Flight.update`;
 * `AccountMovement.update` of the existing charge (account, amount,
 * description, value date = the new `flightDate`); the new account's
 * balance, re-read. `actorUserId` on both rows stays whoever registered the
 * flight (D-13). The force stamp is written only when THIS edit derogates —
 * an edit that bypasses nothing keeps a stamp already on the row (A10, D-7).
 *
 * POST-commit: the account overview of the new person, the band-gated email
 * when the band worsened, `balanceAlert` = `hasNegativeBalanceAlert(before,
 * after)` — the same rule as `registerFlight`.
 */
export async function updateFlight(actor: Actor, flightId: string, input: RegisterFlightInput): Promise<RegisterFlightResult> {
  authorize(actor, 'flights.manage');

  const original = await prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      aircraftId: true,
      personId: true,
      flightDate: true,
      flightType: true,
      aircraftPriceCategory: true,
      instructorProfile: { select: { personId: true } },
      updatedAt: true,
    },
  });
  if (!original) {
    throw new NotFoundError('Flight not found.');
  }

  const resolved = await resolveFlightInput(actor, input, original.flightType, {
    aircraftId: original.aircraftId,
    personId: original.personId,
    instructorPersonId: original.instructorProfile?.personId ?? null,
    flightDate: original.flightDate,
    aircraftPriceCategory: original.aircraftPriceCategory,
  });
  const write = buildFlightWrite(resolved, input);
  const thresholdCents = await getNegativeBalanceThresholdCents();

  const { flight, balanceBeforeCents, balanceAfterCents } = await prisma.$transaction(async (tx) => {
    const lockedFlight = await tx.$queryRaw<Array<{ aircraftId: string; updatedAt: Date }>>`
      SELECT "aircraftId", "updatedAt" FROM "Flight" WHERE "id" = ${flightId} FOR UPDATE`;
    if (lockedFlight.length === 0) {
      throw new NotFoundError('Flight not found.');
    }
    // Review F3: `updateFlight` is the only writer of a Flight row after its
    // creation (under this same lock), and every write bumps `updatedAt`.
    if (lockedFlight[0]!.updatedAt.getTime() !== original.updatedAt.getTime()) {
      throw new ConflictError('The flight was modified concurrently: reload it and retry.', undefined, 'FLIGHT_MODIFIED_CONCURRENTLY');
    }

    const aircraftIds = Array.from(new Set([lockedFlight[0]!.aircraftId, resolved.aircraft.id]));
    const lockedAircraft = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Aircraft" WHERE "id" IN (${Prisma.join(aircraftIds)}) ORDER BY "id" FOR UPDATE`;
    if (lockedAircraft.length !== aircraftIds.length) {
      throw new NotFoundError('Aircraft not found.');
    }

    await assertNoOverlappingFlight(tx, {
      aircraftId: resolved.aircraft.id,
      takeoffAt: resolved.takeoffAt,
      landingAt: resolved.landingAt,
      excludeFlightId: flightId,
    });

    const charge = await loadFlightCharge(tx, flightId);

    // Get-or-create the NEW person's account BEFORE locking (same
    // upsert-then-lock constraint as `registerFlight`).
    const account = await tx.account.upsert({
      where: { personId: resolved.person.id },
      create: { personId: resolved.person.id },
      update: {},
      select: { id: true },
    });
    const accountIds = Array.from(new Set([charge.accountId, account.id]));
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" IN (${Prisma.join(accountIds)}) ORDER BY "id" FOR UPDATE`;
    await assertChargeNotAdjusted(tx, charge.id);

    const before = await readBalanceCents(tx, account.id);

    const updated = await tx.flight.update({
      where: { id: flightId },
      data: { ...write.flightData, ...(resolved.forceStamp ?? {}) },
      select: FLIGHT_SELECT,
    });
    await tx.accountMovement.update({
      where: { id: charge.id },
      data: {
        accountId: account.id,
        // `0 - total`, never unary negation (`registerFlightCore`'s -0 lesson).
        amountCents: 0 - write.totalAmountCents,
        description: write.description,
        effectiveDate: write.flightData.flightDate,
      },
    });

    return { flight: updated, balanceBeforeCents: before, balanceAfterCents: await readBalanceCents(tx, account.id) };
  });

  const account = await getAccountOverview(actor, resolved.person.id);

  // Band-gated email, UNCHANGED rule (`registerFlight`); the in-app signal
  // uses the wider condition (review F7, ratifica R-14.4-d).
  if (bandWorsened(balanceBand(balanceBeforeCents, thresholdCents), balanceBand(balanceAfterCents, thresholdCents))) {
    void sendNegativeBalanceAlert(
      resolved.person.id,
      { firstName: resolved.person.firstName, lastName: resolved.person.lastName, email: resolved.person.email },
      account.balanceCents,
    );
  }
  const balanceAlert = hasNegativeBalanceAlert(balanceBeforeCents, balanceAfterCents);

  return { flight: toListItem(flight, true, true), account, balanceAlert };
}

/**
 * Shared RBAC guard for `listFlights`/`getFlightTotals` (review fix 12.8,
 * MAJOR — extracted so the two can't drift on who is allowed to see what).
 * Returns `canManage`. Throws `ForbiddenError` for an actor with neither
 * `flights.manage` nor `self.read` (via `authorize`), or for a non-admin
 * actor filtering by someone else's `personId`/`instructorPersonId` (AC 4,
 * story 9.3) — exactly `listFlights`'s own guard order, unchanged.
 */
function authorizeFlightsQuery(actor: Actor, query: ListFlightsQuery): boolean {
  const canManage = hasPermission(actor, 'flights.manage');
  if (!canManage) {
    authorize(actor, 'self.read');
  }

  // AC 4 — checked before any query, an admin is exempt (may filter by any
  // personId).
  if (!canManage && query.personId && query.personId !== actor.personId) {
    throw new ForbiddenError('Actor may only filter their own flights.');
  }

  // Story 9.3, AC 4 — same guard shape as `personId` above.
  if (!canManage && query.instructorPersonId && query.instructorPersonId !== actor.personId) {
    throw new ForbiddenError('Actor may only filter flights by their own instructorPersonId.');
  }

  return canManage;
}

/**
 * Shared WHERE-builder for `listFlights`/`getFlightTotals` (review fix 12.8,
 * MAJOR — extracted so the two can't drift on scope/filters). Mirrors
 * `listFlights`'s own WHERE verbatim: own-access `OR` scoping when
 * `!canManage`, plus every optional filter (AND-combined).
 */
function buildFlightsWhere(actor: Actor, query: ListFlightsQuery, canManage: boolean): Prisma.FlightWhereInput {
  return {
    ...(canManage ? {} : { OR: [{ personId: actor.personId! }, { instructorProfile: { personId: actor.personId! } }] }),
    ...(query.dateFrom || query.dateTo
      ? {
          flightDate: {
            ...(query.dateFrom ? { gte: parseDateOnlyUtc(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnlyUtc(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.aircraftId ? { aircraftId: query.aircraftId } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
    ...(query.personQuery
      ? { person: { OR: [{ firstName: { contains: query.personQuery, mode: 'insensitive' } }, { lastName: { contains: query.personQuery, mode: 'insensitive' } }] } }
      : {}),
    ...(query.instructorPersonId ? { instructorProfile: { personId: query.instructorPersonId } } : {}),
    ...(query.flightType ? { flightType: query.flightType } : {}),
  };
}

/**
 * Lists flights, most recent first (story 5.1 AC 1/2; story 5.4 AC 1/2/3/4 —
 * the own-access + filters extension promised since 5.1). Two branches,
 * decided ONCE at the top (never trusted from the UI, AD-5):
 *
 * - `flights.manage` (ADMIN-only): sees EVERY flight, every filter is a
 *   free exact-match/range constraint, `actorEmail` is always included
 *   (`people.read` — every `flights.manage` role also holds it today, same
 *   coarser-permission caveat as `registerFlight`'s doc-comment).
 * - Otherwise, `self.read` (AC 1/2): the `where` is FORCED to
 *   `OR: [{ personId: actor.personId }, { instructorProfile: { personId:
 *   actor.personId } }]` — the titolare of the flight OR the instructor on
 *   board (the second leg alone already covers an instructor who ALSO flew
 *   as the flight's own person via the first leg). `actorEmail` is omitted
 *   (Contesto: a titolare never learns who registered the movement).
 *
 * `personId`/`instructorPersonId` filter guard (AC 4, Contesto; story 9.3
 * extends the SAME guard to `instructorPersonId`): for a non-admin actor,
 * providing anyone else's id is a 403 — checked BEFORE any query, never
 * silently ignored or narrowed (never enumerate/filter another person's data
 * via a filter). Providing exactly the actor's own id is redundant but
 * harmless — this is exactly how the logbook's own-instructor "Le mie ore"
 * drill-down reaches the registry as a non-admin instructor.
 *
 * `actor.personId === null` with only `self.read` (AC 1, Contesto): nothing
 * is "theirs" — an EMPTY page, without ever touching `Flight`, not a 403
 * (the registry exists, it is simply empty for an account with no linked
 * anagrafica).
 *
 * Filters (all optional, AND-combined): `dateFrom`/`dateTo` bound
 * `flightDate` via `parseDateOnlyUtc` (`@db.Date`, review 3.5 F1's lesson —
 * NEVER a raw timestamp comparison); `aircraftId`/`personId`/`flightType`
 * are plain exact matches; `instructorPersonId` (story 9.3, AC 4)
 * matches via the `instructorProfile` relation. Order/pagination unchanged
 * from 5.1 (`flightDate desc, createdAt desc, id desc`; `paginate`/
 * `paginationOffset`).
 */
export async function listFlights(actor: Actor, query: ListFlightsQuery): Promise<FlightListResult> {
  const canManage = authorizeFlightsQuery(actor, query);

  // AC 1/Contesto — an own-access actor with no linked person has nothing of
  // their own: an empty page, never a query.
  if (!canManage && actor.personId === null) {
    return paginate([], 0, query);
  }

  const where = buildFlightsWhere(actor, query, canManage);

  const includeActorEmail = hasPermission(actor, 'people.read');
  // Review F2 (ratifica R-14.4-c): `forceReason` visible ONLY to `flights.manage` —
  // `canManage` is exactly that permission (`authorizeFlightsQuery` above).
  const includeForceReason = canManage;

  // Interactive transaction (story TD-1, AC 3) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.flight.findMany({
      select: FLIGHT_SELECT,
      where,
      // `id` tie-break: same-millisecond rows must not make the page order
      // non-deterministic (same pattern as `buildOverview`/`listAccountMovements`).
      orderBy: [{ flightDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...paginationOffset(query),
    });
    const total = await tx.flight.count({ where });
    return [items, total] as const;
  });

  return paginate(
    items.map((item) => toListItem(item, includeActorEmail, includeForceReason)),
    total,
    query,
  );
}

export type FlightTotals = {
  count: number;
  minutes: number;
  takeoffs: number;
  landings: number;
  revenueCents: number;
};

const ZERO_FLIGHT_TOTALS: FlightTotals = { count: 0, minutes: 0, takeoffs: 0, landings: 0, revenueCents: 0 };

/**
 * TRUE totals over the WHOLE filtered set (review fix 12.8, MAJOR, user-
 * ratified): the logbook's KPI row/Totali row/header count previously summed
 * only the CURRENT PAGE's `listFlights` result (<=20 flights), which is
 * misleading once any filter narrows the set (e.g. a month filter on page 1
 * showed page 1's totals, not the month's). Shares `listFlights`'s exact
 * RBAC (`authorizeFlightsQuery`) and WHERE (`buildFlightsWhere`) so a
 * non-admin actor's totals can NEVER exceed their own scope — every flight
 * in the filter counts (story 19.6: no cancelled flight exists anymore; a
 * no-charge flight counts with its 0 amounts). ONE `prisma.flight.aggregate`
 * — no page-by-page summing, no N+1.
 */
export async function getFlightTotals(actor: Actor, query: ListFlightsQuery): Promise<FlightTotals> {
  const canManage = authorizeFlightsQuery(actor, query);

  // Mirrors listFlights' empty-page short-circuit (AC 1/Contesto) — nothing
  // is "theirs", so zero totals without ever touching Flight.
  if (!canManage && actor.personId === null) {
    return ZERO_FLIGHT_TOTALS;
  }

  const where = buildFlightsWhere(actor, query, canManage);

  const aggregate = await prisma.flight.aggregate({
    where,
    _count: { _all: true },
    _sum: { minutes: true, takeoffs: true, landings: true, aircraftAmountCents: true, instructorAmountCents: true },
  });

  return {
    count: aggregate._count._all,
    minutes: aggregate._sum.minutes ?? 0,
    takeoffs: aggregate._sum.takeoffs ?? 0,
    landings: aggregate._sum.landings ?? 0,
    // Same total the DTO computes (`toListItem`'s `totalAmountCents`):
    // aircraft + instructor (when any).
    revenueCents: (aggregate._sum.aircraftAmountCents ?? 0) + (aggregate._sum.instructorAmountCents ?? 0),
  };
}
