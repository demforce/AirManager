import { Prisma, type AircraftPriceCategory, type FlightType } from '@/generated/prisma/client';
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
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors';
import { getEffectiveInstructorRate, type InstructorRateListItem } from './instructor-rates.service';
import { getEffectiveRate } from './rates.service';
import { evaluateRequirements, throwRequirementsNotMet, type RequirementFailure } from './requirements.service';

/**
 * Flight logging with automatic charges (epic 5, story 5.1; FR-9/FR-14/
 * FR-15) — `FLIGHT_CHARGE` is a REAL debit (negative `amountCents`) and may
 * push the account into the red: a balance that does not cover the cost is
 * one of the requirements the admin is warned about and may derogate (story
 * 19.9, R-19-g — next paragraph), never a hard block. Rate lookups (AD-4) reuse `rates.service.ts#getEffectiveRate`
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
 * **Requirements: one warning, one deroga (story 19.9, CR §4.4, R-19-h)**:
 * after every hard guard and the rates, `resolveFlightInput` asks
 * `requirements.service.ts#evaluateRequirements` for the documents (the
 * person's and the on-board instructor's), the fee, the currency of a solo
 * flight and the balance against the cost, and prepends a grounded aircraft;
 * any failure is ONE 422 `REQUIREMENTS_NOT_MET` listing them all, unless an
 * admin (`requirements.force`) resends the same request with `force: true` —
 * no motivo — which stamps the silent `forcedAt`/`forcedByUserId` (A10). See
 * that function's own doc-comment for the policy.
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
  /** Story 19.9 (A10) — the silent stamp of a deroga: set ONLY when the registration or the edit derogated `REQUIREMENTS_NOT_MET` with `force`, `null` otherwise. API data, never shown in the UI. */
  forcedAt: Date | null;
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
  // `forcedByUserId` deliberately NOT selected (same omission as `Booking`'s
  // own `BOOKING_SELECT`): the DTO only carries "was this derogated".
  forcedAt: true,
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
 * `toStatementItem`). Every admin-only entrypoint in this file
 * (`registerFlight`/`updateFlight`, both gated on `flights.manage`) passes
 * `true` — the actor calling them already holds `flights.manage` by
 * definition (the `authorize` call at the top of each).
 */
function toListItem(flight: SelectedFlight, includeActorEmail: boolean): FlightListItem {
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
  };
}

/**
 * The ORIGINAL flight's identity fields, supplied ONLY by `updateFlight`
 * (review F4, ratifica R-14.4-b) — see `resolveFlightInput`'s own
 * doc-comment for what this exempts. `aircraftPriceCategory` (story 19.3,
 * Q-19.3-b) is the price column the original flight was charged: an edit
 * that keeps the person keeps it. `id`, `isSolo` and `chargeCents` (story
 * 19.9) feed the requirements of an edit: the flight never counts for its own
 * currency, and its current charge (`0 - amountCents` of its `FLIGHT_CHARGE`,
 * `0` on a no-charge flight) is credited back before the balance is compared.
 */
type OriginalFlightIdentity = {
  id: string;
  aircraftId: string;
  personId: string;
  instructorPersonId: string | null;
  flightDate: Date;
  isSolo: boolean;
  aircraftPriceCategory: AircraftPriceCategory;
  chargeCents: number;
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
  /** Story 19.9 (A10) — set ONLY when `force` derogated at least one requirement; `null` on every normal registration/edit, INCLUDING a `force: true` request with nothing to derogate. */
  forceStamp: { forcedAt: Date; forcedByUserId: string } | null;
};

/**
 * The instructor row a flight may name, or `null` when that person does not
 * exist, is archived, or has no active `InstructorProfile` — the three cases
 * `resolveFlightInput` deliberately folds into ONE `INSTRUCTOR_NOT_FOUND`
 * (TD-1 AC 9 / decision 5.1 D1: never reveal whether an unknown id belongs to
 * nobody or to a non-instructor).
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
 * still log as that Roma day). It is also the reference day of every
 * requirement of the flight (story 19.9).
 */
function deriveFlightDate(takeoffAtIso: string): Date {
  return parseDateOnlyUtc(dateOnlyInZone(new Date(takeoffAtIso), APP_TIMEZONE));
}

/**
 * Review F4 (ratifica R-14.4-b) — an edit that changes NEITHER the
 * person, NOR the instructor, NOR the flight date is exempt from the
 * documents and the fee entirely (story 19.9, D-8: both depend only on who
 * and when): same "correcting is not registering anew" principle as
 * R-14.3-a's flightType exemption. `original` is only ever supplied by
 * `updateFlight` (its own recorded identity); a brand-new `registerFlight`
 * call never passes it, so it is always fully checked. Without this, a
 * cycles-only edit of a HISTORICAL flight would warn about a document that
 * expired AFTER the flight was flown, and the deroga would stamp a flight
 * that was never an operational override.
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
 * (consolidated pattern: existence 404 -> state 422 -> domain 422): `force`
 * without `requirements.force` -> 403, before any query; aircraft exists ->
 * 404; person exists -> 404; aircraft archived -> `AIRCRAFT_ARCHIVED`;
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
 * **Requirements (story 19.9, CR §4.4, R-19-g/h/i/j/k) — LAST, after every
 * hard guard and the cost** (D-3: "Procedi comunque" never lands on an error
 * the deroga does not cover and that was already known, and the balance is
 * compared with the very `totalAmountCents` that becomes the charge —
 * `buildFlightWrite`, called once, here). The failures, in this order: the
 * aircraft out of service (`AIRCRAFT_OUT_OF_SERVICE`, built here — story
 * AOG-1a, R-AOG-c: derogable on flights only, and `Aircraft` has no grounding
 * start date, so only the CURRENT state can be seen), then
 * `evaluateRequirements`'s own list. Every day is the flight day. Policy:
 * - documents and fee: the person, and the instructor when ON BOARD — not on
 *   a SCHOOL solo, where the instructor supervises from the ground (R-19-j
 *   "chiunque sia a bordo", Q-19.9-a "istruttore a bordo"; the same reading
 *   as the currency's on-board flights, review 19.7a F2);
 * - currency: only on a SOLO flight (no instructor, or SCHOOL with `isSolo`
 *   — R-19-i, CR §4.5, A5), the person only;
 * - balance: always, except on a no-charge flight (A9).
 * Any failure without `force` is ONE 422 `REQUIREMENTS_NOT_MET`
 * (`details.failures`); with `force` (the 403 above already guarantees
 * `requirements.force`) it stamps `forcedAt`/`forcedByUserId` — never on a
 * `force: true` request that had nothing to derogate.
 *
 * **Edits (`original`, `updateFlight` only — D-8)**: the grounding is not
 * re-checked while the aircraft stays the same (AOG-1a AD-4: a cycles-only
 * edit of a HISTORICAL flight must not depend on TODAY's state); documents
 * and fee are skipped when person, instructor and date are unchanged
 * (`isIdentityUnchanged`, R-14.4-b); the currency is skipped when person and
 * date are unchanged and the original flight was already a solo, and
 * otherwise leaves the flight itself out (`excludeFlightId`); the balance is
 * ALWAYS re-checked (PO, Q-19.9-b), crediting back the flight's current
 * charge when the person is unchanged.
 */
async function resolveFlightInput(
  actor: Actor,
  input: RegisterFlightInput,
  originalFlightType?: FlightType,
  original?: OriginalFlightIdentity,
): Promise<{ resolved: ResolvedFlightInput; write: FlightWrite }> {
  // Checked FIRST, before any query — same ordering as `createBooking`'s own
  // force-403 (this function's doc-comment). Review 14.9 F4: guard on a
  // DISTINCT permission (`requirements.force`, story 19.9 — not
  // `flights.manage`) — no role holds `flights.manage` without also holding
  // `requirements.force` (both ADMIN-only), so this branch is structurally
  // unreachable today. Kept for a future role that might hold
  // `flights.manage` without `requirements.force`, proved by a unit test that
  // stubs the permission.
  if (input.force && !hasPermission(actor, 'requirements.force')) {
    throw new ForbiddenError('Only an admin can derogate the requirements of a flight.');
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

  // Pure derivations off the row just loaded — the guards below, the price
  // category and the requirements read them.
  const hasActivePilot = person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null;
  const hasActiveStudent = person.studentProfile !== null && person.studentProfile.deactivatedAt === null;
  const personDisplayName = `${person.firstName} ${person.lastName}`;

  if (aircraft.archivedAt !== null) {
    throw new ValidationError('Cannot register a flight on an archived aircraft.', undefined, 'AIRCRAFT_ARCHIVED');
  }

  // Story AOG-1a (ratifica R-AOG-c, AD-4): a grounded aircraft is one of the
  // derogable requirements, evaluated with the others at the end (story 19.9,
  // D-2/D-3) — never on an edit that keeps the same aircraft.
  const aircraftUnchanged = original !== undefined && original.aircraftId === input.aircraftId;
  const outOfServiceBlock = aircraft.status === 'OUT_OF_SERVICE' && !aircraftUnchanged;

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

  // The Europe/Rome CALENDAR day the flight is logged under — `deriveFlightDate`.
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
  // The instructor's display name, needed ONLY to label a requirement as
  // theirs (below); `null` whenever there is no instructor on this flight.
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
    // `findActiveInstructor`.
    const instructor = await findActiveInstructor(instructorPersonId);
    if (!instructor) {
      throw new ValidationError('Instructor has no active instructor profile.', undefined, 'INSTRUCTOR_NOT_FOUND');
    }
    instructorProfileId = instructor.profileId;
    instructorName = instructor.name;
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

  const resolved = {
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
  };
  // The ONE call of the write builder: its total is the cost the balance is
  // compared with AND the charge the caller writes (story 19.9, D-6).
  const write = buildFlightWrite(resolved, input);

  // Requirements (story 19.9) — the policy is in this function's own doc-comment.
  const flightDay = toDateOnlyString(flightDate);
  const solo = instructorPersonId === null || (input.flightType === 'SCHOOL' && input.isSolo);
  const samePerson = original !== undefined && original.personId === input.personId;
  const sameDate = original !== undefined && original.flightDate.getTime() === flightDate.getTime();
  const originalSolo = original !== undefined && (original.instructorPersonId === null || (originalFlightType === 'SCHOOL' && original.isSolo));
  const outOfService: RequirementFailure[] = outOfServiceBlock
    ? [{ type: 'AIRCRAFT_OUT_OF_SERVICE', registration: aircraft.registration, ...outOfServiceDetails(aircraft) }]
    : [];
  const failures: RequirementFailure[] = [
    ...outOfService,
    ...(await evaluateRequirements({
      expiryDateOnly: flightDay,
      membershipDateOnly: flightDay,
      person: { id: person.id, name: personDisplayName, hasActivePilot, hasActiveStudent, hasActiveInstructor: false },
      instructor: solo ? null : { personId: instructorPersonId!, name: instructorName! },
      documents: !isIdentityUnchanged(original, input, instructorPersonId, flightDate),
      currency: solo && !(samePerson && sameDate && originalSolo) ? { dateOnly: flightDay, excludeFlightId: original?.id ?? null } : null,
      balance: input.noCharge ? null : { costCents: write.totalAmountCents, creditCents: samePerson ? original.chargeCents : 0 },
    })),
  ];
  if (failures.length > 0 && !input.force) {
    throwRequirementsNotMet(failures);
  }
  // "Scavalcato un requisito, non spuntata una checkbox": no stamp when there
  // was nothing to derogate.
  const forceStamp = failures.length > 0 ? { forcedAt: new Date(), forcedByUserId: actor.userId } : null;

  return { resolved: { ...resolved, forceStamp }, write };
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
 * NOT derogable by `force` (ratifica del piano 16-18), unlike the
 * requirements of `REQUIREMENTS_NOT_MET` (story 19.9): there is no dead end
 * to escape (lezione 14.6 F2) because the 409 NAMES the conflicting flight,
 * and the way out is to delete or edit THAT one — an action the app
 * already offers on every row of the registry.
 *
 * Error ordering, for the record: `resolveFlightInput` runs before the
 * transaction, so all of its 404s and 422s (archived aircraft, person,
 * times, rates, then `REQUIREMENTS_NOT_MET`) PRECEDE this 409 — a request
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
 * columns, its total and its charge's description (story 19.6, AD-4) —
 * called once per request by `resolveFlightInput` (story 19.9: its total is
 * also the cost the balance requirement compares), whose result
 * `registerFlightCore` and `updateFlight` write, so a registration and an
 * edit of the same data can never diverge. Pure: no I/O.
 *
 * Full duration, full rate (story 12.13: package consumption retired). On a
 * `noCharge` flight (R-19-d) both amounts are `0` while the rates stay frozen
 * as information (Q-19.6-a = B); the instructor amount is `0`, never `null`,
 * because `null` is what says "no instructor on this flight" (`toListItem`).
 * The description starts with the no-charge wording so it survives the
 * statement card's end-truncation on a phone; a normal flight's is unchanged.
 */
function buildFlightWrite(resolved: Omit<ResolvedFlightInput, 'forceStamp'>, input: RegisterFlightInput): FlightWrite {
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
    /** `resolveFlightInput`'s own force-stamp, spread onto `Flight.create`'s data verbatim (`null` on every normal flight). */
    forceStamp: ResolvedFlightInput['forceStamp'];
  },
): Promise<RegisterFlightCoreResult> {
  const balanceBeforeCents = await readBalanceCents(tx, params.accountId);

  const created = await tx.flight.create({
    data: {
      ...params.write.flightData,
      actorUserId: params.actorUserId,
      // Stamped ONLY when a requirement was derogated (`forceStamp`) —
      // otherwise both fields stay `null`, same convention as
      // `createBooking`'s own `forceStamp` spread.
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
 * Guards, rate lookups and requirements: `resolveFlightInput` (story 5.3's
 * extraction); the columns, total and charge description: its
 * `buildFlightWrite` result (story 19.6, shared with `updateFlight`).
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

  const { resolved, write } = await resolveFlightInput(actor, input);

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

  // `true`: registerFlight/updateFlight are both admin-only (`flights.manage`,
  // story 5.4's own-access branch never reaches here) — `actorEmail` is always
  // shown to the admin actor who just acted.
  return { flight: toListItem(createdFlight, true), account, balanceAlert };
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
 * price category with the person unchanged (Q-19.3-b); the requirements
 * leave the flight out of its own currency and credit its current charge
 * back (story 19.9). `buildFlightWrite` produces the columns, total and
 * description exactly as a registration.
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
 * an edit that derogates nothing keeps a stamp already on the row (A10, D-7).
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
      isSolo: true,
      aircraftPriceCategory: true,
      instructorProfile: { select: { personId: true } },
      charge: { select: { amountCents: true } },
      updatedAt: true,
    },
  });
  if (!original) {
    throw new NotFoundError('Flight not found.');
  }

  const { resolved, write } = await resolveFlightInput(actor, input, original.flightType, {
    id: flightId,
    aircraftId: original.aircraftId,
    personId: original.personId,
    instructorPersonId: original.instructorProfile?.personId ?? null,
    flightDate: original.flightDate,
    isSolo: original.isSolo,
    aircraftPriceCategory: original.aircraftPriceCategory,
    // A missing charge is a broken invariant `loadFlightCharge` refuses under the lock.
    chargeCents: 0 - (original.charge?.amountCents ?? 0),
  });
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

  return { flight: toListItem(flight, true), account, balanceAlert };
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
    items.map((item) => toListItem(item, includeActorEmail)),
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
