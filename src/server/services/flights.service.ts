import { Prisma, type FlightStatus, type FlightType } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult, type PaginationQuery } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import type { CancelFlightInput, CorrectFlightInput, RegisterFlightInput } from '@/lib/schemas/flights';
import { formatMinutes } from '@/lib/time';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import {
  balanceBand,
  bandWorsened,
  getAccountOverview,
  getNegativeBalanceThresholdCents,
  sendNegativeBalanceAlert,
  type AccountOverview,
} from './accounts.service';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { getEffectiveInstructorRate, type InstructorRateListItem } from './instructor-rates.service';
import { getEffectiveRate } from './rates.service';

/**
 * Flight logging with automatic charges (epic 5, story 5.1; FR-9/FR-14/
 * FR-15) — the model that, unlike `sellPackage`'s always-zero
 * `PACKAGE_PURCHASE`, records a REAL debit: `FLIGHT_CHARGE` is negative and
 * is allowed to push the account into the red (Dev Notes — no
 * insufficient-balance block, the domain expects the pilot to top up
 * afterwards). Rate lookups (AD-4) reuse `rates.service.ts#getEffectiveRate`
 * and `instructor-rates.service.ts#getEffectiveInstructorRate`, both called
 * BEFORE the transaction (append-only tables, no meaningful race). The
 * negative-balance alert (FR-27) reuses `accounts.service.ts`'s
 * lock-read-compare-send dance (`getNegativeBalanceThresholdCents`,
 * `balanceBand`, `bandWorsened`, `sendNegativeBalanceAlert`) verbatim —
 * nothing here reimplements that logic.
 *
 * **422 vs 409 (deliberate divergence from `sellPackage`)**: an archived
 * aircraft/person here answers 422 (a stable, specific code — AC 3), not
 * the 409 `sellPackage` uses for an archived person. The flight input
 * references MULTIPLE entities (aircraft, person, optionally instructor);
 * the wrong state of any one of them is treated as unprocessable INPUT for
 * this request, not a conflict with the state of a single target resource
 * the caller is directly mutating. The epic's own AC spells out 422 here,
 * so this is intentional, not an oversight.
 *
 * **Package consumption (epic 5, story 5.2; FR-13, AD-6)**: an eligible,
 * non-expired, non-exhausted `HourPackage` belonging to the flight's person
 * scales minutes off its residuo BEFORE the aircraft component is charged
 * at full rate — FIFO by purchase date (`effectiveDate asc, createdAt asc,
 * id asc`, the deterministic tie-break lesson from review 3.1 F3), oldest
 * purchase first, spilling into the next eligible package until the
 * flight's minutes are covered or eligible packages run out. Eligibility
 * (all four, checked INSIDE the transaction, Dev Notes): (1) belongs to
 * this flight's person; (2) the package's TYPE is associated with this
 * flight's aircraft (`PackageTypeAircraft` — an aircraft archived AFTER the
 * association stays eligible, story 4.3 review F1); (3) not expired AT THE
 * FLIGHT DATE (`expiresAt == null || expiresAt >= flightDate` — the expiry
 * day itself is still valid, same boundary as `isExpired`, compared against
 * `flightDate` NEVER "today": a backdated flight consumes against the
 * package's validity as of ITS OWN date); (4) already purchased at the
 * flight date (`effectiveDate <= flightDate` — a flight backdated before the
 * sale cannot consume a package that did not exist yet); residuo > 0
 * (always computed, `includedMinutes - SUM(consumptions)`, never a
 * persisted counter). The eligible set and every package's consumed-so-far
 * SUM are read in ONE aggregated query each (never one query per package,
 * Dev Notes: no N+1). Only packages the allocation actually TAKES minutes
 * from get a `PackageConsumption` row (`take > 0`); the aircraft component
 * is then charged pro-rata on the REMAINING (uncovered) minutes only
 * (`Math.round(rate * chargedMinutes / 60)`) — the instructor component, by
 * contrast, is NEVER touched by package consumption: it is always
 * `round(rate * minutes / 60)` on the flight's FULL duration (AD-6: a
 * package covers the aircraft, never the instructor). When packages cover
 * every minute and there is no instructor, the total is 0 — the
 * `FLIGHT_CHARGE` movement is still created (`amountCents: 0`, a
 * conscious analogue of `sellPackage`'s always-zero `PACKAGE_PURCHASE`,
 * Dev Notes), never omitted.
 *
 * **Why the allocation runs INSIDE the transaction, after the `Account`
 * lock**: in 5.1 every amount was computable before opening the
 * transaction (rates are append-only). Story 5.2 breaks that for the
 * aircraft component alone, because it now depends on OTHER packages'
 * residuo, which is concurrent — two flights for the same person racing to
 * consume the same package must not both succeed in taking more than its
 * residuo. `HourPackage` belongs to the same `personId` as the `Account`
 * this function already takes a `FOR UPDATE` lock on (Dev Notes) — so that
 * existing lock is ALSO the serialization point for package consumption:
 * the eligible-package read, the consumed-SUM read and the allocation all
 * happen after that lock is held, and the `PackageConsumption` rows are
 * written in the same transaction as everything else. Rate lookups stay
 * OUTSIDE the transaction as in 5.1 (append-only, no race); only the
 * consumption-dependent aircraft amount moves in.
 *
 * **Backdated flights consume from what is available NOW, never a
 * replay**: the allocation always spends from each package's residuo AS OF
 * the moment this flight is being registered, in purchase order — it never
 * rewrites `PackageConsumption` rows already recorded for other flights
 * just because a flight with an earlier `flightDate` arrives later (Dev
 * Notes: real-world registrations are almost always chronological; this
 * service does not implement a historical re-play).
 *
 * **Storno/correction (epic 5, story 5.3; FR-16) — `cancelFlight`/
 * `correctFlight`**: a flight is NEVER edited in place or physically
 * deleted; "correcting" one is always a STORNO of the original followed by
 * a brand-new registration (AD-3). The storno is a NEW, opposite-signed
 * `AccountMovement` (`FLIGHT_CHARGE_REVERSAL`, `amountCents` = the ORIGINAL
 * `FLIGHT_CHARGE.amountCents` negated, NEVER recalculated — AD-4, same
 * `reversalOfId`-linking pattern as `accounts.service.ts#recordAdjustment`)
 * plus `Flight.status -> CANCELLED` (`cancelledAt`/`cancelReason` set
 * together) plus the aircraft's contaore reduced by the flight's minutes
 * (`Math.max(0, current - minutes)` — the clamp is deliberate: a manual
 * `HourMeterAdjustment` that already lowered the contaore below this
 * flight's minutes must never BLOCK a cancellation, the audit trail already
 * lives in the flight + any rectifications). Package minutes are "restored"
 * WITHOUT writing anything to `PackageConsumption` (append-only forever,
 * see that model's doc-comment): every consumed-so-far aggregate in this
 * file and in `packages.service.ts#listPersonPackages` filters
 * `flight: { status: { not: 'CANCELLED' } }`, so a cancelled flight's
 * consumption simply stops counting the instant its `status` flips —
 * nothing about the `PackageConsumption` rows themselves ever changes.
 *
 * **`registerFlightCore` (the mandatory refactor, Task 2)**: `registerFlight`
 * (story 5.1/5.2) and `correctFlight` (this story) both end in the exact
 * same in-transaction work — package consumption, `Flight.create`, the
 * `FLIGHT_CHARGE` movement, the contaore advance — so that logic lives in
 * ONE place, `registerFlightCore`, which ASSUMES every lock it needs is
 * ALREADY held by its caller and takes none itself. `registerFlight` opens
 * its own transaction, takes the same two locks as before (Aircraft, then
 * Account — UNCHANGED, story 5.1/5.2's tests still pass unmodified), and
 * calls the core once. `correctFlight` does the storno FIRST (inside its own
 * transaction) and calls the SAME core immediately after, so the "new"
 * flight is registered against data the storno has already refunded.
 *
 * **Deterministic lock ordering (Contesto, mandatory) — avoiding deadlocks
 * between concurrent corrections**: `correctFlight` can touch up to TWO
 * `Aircraft` rows (the original flight's, and the corrected one's, if
 * different) and up to TWO `Account` rows (same, for a changed person). To
 * make two concurrent, crossing corrections (`correctFlight(A -> B)` and
 * `correctFlight(B -> A)` at once) provably deadlock-free, ALL the
 * `Aircraft` ids involved are resolved first, then locked in ONE
 * `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE` (never one query per
 * row) — then the SAME shape for `Account` ids. Aircraft locks ALWAYS
 * precede Account locks (the same macro order `registerFlight` already used
 * in 5.1 — verified in its code, preserved here): as long as every writer
 * that can touch more than one row of a table locks ALL of them, in the
 * SAME order, in ONE statement, two transactions can never hold-and-wait on
 * each other in a cycle. `cancelFlight` (exactly one Aircraft, one Account)
 * follows the identical order for consistency, even though — lacking a
 * balance-band alert (see below) — it does not strictly need the Account
 * lock for its own correctness today.
 *
 * **No alert on cancel, alert-after-storno on correct (FR-27)**: cancelling
 * a flight only ever ADDS money back — the balance band can improve or stay
 * put, never worsen (same reasoning as `accounts.service.ts#recordTopUp`'s
 * own "no alert wiring" choice) — so `cancelFlight` reads no pre-movement
 * balance and fires no alert. `correctFlight` CAN worsen the net balance
 * (e.g. more minutes on re-registration), so it reuses the exact same
 * lock-read-compare-send dance as `registerFlight`/`recordAdjustment` — the
 * critical ordering point is that the "saldo-prima" read (inside
 * `registerFlightCore`) happens AFTER the storno write, in the SAME
 * transaction: read-your-own-writes means that SUM already includes the
 * refund, so the "before" balance being compared is the TRUE pre-correction
 * one, not a stale pre-storno one that would over-count the apparent
 * worsening.
 */

export type FlightPackageConsumptionItem = {
  hourPackageId: string;
  typeName: string;
  minutes: number;
};

export type FlightBreakdown = {
  aircraftRateCentsPerHour: number;
  /** The amount ACTUALLY CHARGED (story 5.2): pro-rata on `chargedMinutes`, never on the full flight duration once a package covered part of it. */
  aircraftAmountCents: number;
  instructorRateCentsPerHour?: number;
  /** Always on the FULL flight duration (AD-6: never reduced by package consumption). */
  instructorAmountCents?: number;
  /** Total minutes covered by package consumption (story 5.2) — 0 when no eligible package existed. */
  packageCoveredMinutes: number;
  /** `minutes - packageCoveredMinutes` — what the aircraft component is actually rated on. */
  chargedMinutes: number;
  /** Per-package detail, FIFO (oldest purchase first) — empty when `packageCoveredMinutes === 0`. */
  packageConsumptions: FlightPackageConsumptionItem[];
  /** Always COMPUTED (aircraft + instructor, when any) — never a persisted column. */
  totalAmountCents: number;
};

export type FlightListItem = {
  id: string;
  /** Calendar-only date (`YYYY-MM-DD`) — see `toDateOnlyString`. */
  flightDate: string;
  flightType: FlightType;
  status: FlightStatus;
  minutes: number;
  hourMeterStart: number | null;
  hourMeterEnd: number | null;
  landings: number | null;
  notes: string | null;
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string };
  /** `null` <=> no instructor on this flight. `personId` (not the profile id — AD-11/consistency with the API's own `instructorPersonId`). */
  instructor: { personId: string; firstName: string; lastName: string } | null;
  breakdown: FlightBreakdown;
  /** This list is staff-only (`flights.manage`) — always present, unlike the account statement's conditional `actorEmail`. */
  actorEmail: string;
  createdAt: Date;
  /** Story 5.3 — set together, exactly once, when `status` becomes `CANCELLED`. Both `null` while `REGISTERED`. */
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** Story 5.3 — the ORIGINAL flight this one replaces, when this flight IS a correction. `null` for a plain registration. */
  correctionOfId: string | null;
  /** Story 5.3 — the NEW flight that replaced THIS one, from the inverse `correctedBy` relation. `null` unless this flight was corrected. */
  correctedByFlightId: string | null;
};

export type FlightListResult = PaginatedResult<FlightListItem>;

export type RegisterFlightResult = {
  flight: FlightListItem;
  account: AccountOverview;
};

const FLIGHT_SELECT = {
  id: true,
  flightDate: true,
  flightType: true,
  status: true,
  minutes: true,
  hourMeterStart: true,
  hourMeterEnd: true,
  landings: true,
  notes: true,
  aircraftRateCentsPerHour: true,
  aircraftAmountCents: true,
  instructorRateCentsPerHour: true,
  instructorAmountCents: true,
  packageCoveredMinutes: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  correctionOfId: true,
  // The inverse self-relation (story 5.3) — `id` only, just enough to
  // populate `correctedByFlightId` without an extra query.
  correctedBy: { select: { id: true } },
  aircraft: { select: { id: true, registration: true } },
  person: { select: { id: true, firstName: true, lastName: true } },
  instructorProfile: { select: { person: { select: { id: true, firstName: true, lastName: true } } } },
  actorUser: { select: { email: true } },
  // Nested select (no N+1, Dev Notes) — the per-package breakdown detail
  // (AC 1). Deterministic order: creation order mirrors FIFO allocation
  // order, `id` breaks a same-millisecond tie. `select` stays a plain
  // literal (needed as-is, alongside the outer `as const`, for Prisma's
  // payload-shape inference); only `orderBy`'s array literal is cast away
  // from the `readonly` tuple `as const` would otherwise produce — Prisma's
  // generated `...OrderByWithRelationInput[]` is a MUTABLE array type, and
  // an inline `as` cast on just this expression is not re-widened/narrowed
  // by the enclosing `as const`.
  packageConsumptions: {
    select: { hourPackageId: true, minutes: true, hourPackage: { select: { packageType: { select: { name: true } } } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] as Prisma.PackageConsumptionOrderByWithRelationInput[],
  },
} as const;

type SelectedFlight = {
  id: string;
  flightDate: Date;
  flightType: FlightType;
  status: FlightStatus;
  minutes: number;
  hourMeterStart: number | null;
  hourMeterEnd: number | null;
  landings: number | null;
  notes: string | null;
  aircraftRateCentsPerHour: number;
  aircraftAmountCents: number;
  instructorRateCentsPerHour: number | null;
  instructorAmountCents: number | null;
  packageCoveredMinutes: number;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  correctionOfId: string | null;
  correctedBy: { id: string } | null;
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string };
  instructorProfile: { person: { id: string; firstName: string; lastName: string } } | null;
  actorUser: { email: string };
  packageConsumptions: { hourPackageId: string; minutes: number; hourPackage: { packageType: { name: string } } }[];
};

function toListItem(flight: SelectedFlight): FlightListItem {
  const hasInstructor = flight.instructorRateCentsPerHour !== null && flight.instructorAmountCents !== null;
  return {
    id: flight.id,
    flightDate: toDateOnlyString(flight.flightDate),
    flightType: flight.flightType,
    status: flight.status,
    minutes: flight.minutes,
    hourMeterStart: flight.hourMeterStart,
    hourMeterEnd: flight.hourMeterEnd,
    landings: flight.landings,
    notes: flight.notes,
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
      aircraftAmountCents: flight.aircraftAmountCents,
      ...(hasInstructor
        ? {
            instructorRateCentsPerHour: flight.instructorRateCentsPerHour!,
            instructorAmountCents: flight.instructorAmountCents!,
          }
        : {}),
      packageCoveredMinutes: flight.packageCoveredMinutes,
      chargedMinutes: flight.minutes - flight.packageCoveredMinutes,
      packageConsumptions: flight.packageConsumptions.map((consumption) => ({
        hourPackageId: consumption.hourPackageId,
        typeName: consumption.hourPackage.packageType.name,
        minutes: consumption.minutes,
      })),
      totalAmountCents: flight.aircraftAmountCents + (flight.instructorAmountCents ?? 0),
    },
    actorEmail: flight.actorUser.email,
    createdAt: flight.createdAt,
    cancelledAt: flight.cancelledAt,
    cancelReason: flight.cancelReason,
    correctionOfId: flight.correctionOfId,
    correctedByFlightId: flight.correctedBy?.id ?? null,
  };
}

type ResolvedFlightInput = {
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string; email: string | null };
  instructorProfileId: string | null;
  flightDate: Date;
  minutes: number;
  hourMeterStart: number | null;
  hourMeterEnd: number | null;
  aircraftRateCentsPerHour: number;
  instructorRateCentsPerHour: number | null;
  /** Unaffected by package consumption (AD-6) — already rounded on the FULL duration. */
  instructorAmountCents: number | null;
};

/**
 * All of `registerFlight`'s pre-transaction guards and rate lookups (AC 1/2/
 * 3/4), extracted (story 5.3, Task 2) so `correctFlight` can re-run the
 * EXACT same validation on its NEW data ("tutti i 422 di 5.1 si applicano ai
 * DATI NUOVI", Contesto) without a second, drifting copy. Guard order
 * (consolidated pattern: existence 404 -> state 422 -> domain 422): aircraft
 * exists -> 404; person exists -> 404; aircraft archived ->
 * `AIRCRAFT_ARCHIVED`; person archived -> `PERSON_ARCHIVED`; person missing
 * an active pilot/student profile -> `PERSON_NOT_PILOT_OR_STUDENT`;
 * `flightDate` in the future (server-clock UTC "today") ->
 * `FLIGHT_DATE_IN_FUTURE`; minutes resolution (direct, or
 * `hourMeterEnd - hourMeterStart` — the Zod schema's superRefine already
 * covers the structural cases, this re-verifies the inequality, Dev Notes)
 * -> `HOUR_METER_INVALID`; `SCHOOL` without an instructor ->
 * `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`; instructor === pilot/student ->
 * `INSTRUCTOR_SAME_AS_PILOT`; instructor person unknown OR without an
 * active `InstructorProfile` -> `INSTRUCTOR_NOT_FOUND` (deliberately folded
 * into one code — Dev Notes: never reveal whether an unknown id belongs to
 * nobody or to a non-instructor). Then, BEFORE any transaction (rates are
 * append-only, no meaningful race): `getEffectiveRate` -> null ->
 * `NO_AIRCRAFT_RATE`; with an instructor, `getEffectiveInstructorRate` ->
 * null -> `NO_INSTRUCTOR_RATE`. The instructor amount (unaffected by package
 * consumption, AD-6) is rounded here, `Math.round(rate * minutes / 60)` on
 * the FULL duration (AD-2/NFR-5) — the aircraft amount is NOT computed here:
 * it depends on the concurrent package residuo, resolved INSIDE the
 * transaction by `registerFlightCore` (module doc-comment).
 */
async function resolveFlightInput(actor: Actor, input: RegisterFlightInput): Promise<ResolvedFlightInput> {
  const aircraft = await prisma.aircraft.findUnique({
    where: { id: input.aircraftId },
    select: { id: true, registration: true, archivedAt: true },
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

  if (aircraft.archivedAt !== null) {
    throw new ValidationError('Cannot register a flight on an archived aircraft.', undefined, 'AIRCRAFT_ARCHIVED');
  }
  if (person.archivedAt !== null) {
    throw new ValidationError('Cannot register a flight for an archived person.', undefined, 'PERSON_ARCHIVED');
  }

  const hasActivePilotOrStudent =
    (person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null) ||
    (person.studentProfile !== null && person.studentProfile.deactivatedAt === null);
  if (!hasActivePilotOrStudent) {
    throw new ValidationError(
      'Person must have an active pilot or student profile to be logged on a flight.',
      undefined,
      'PERSON_NOT_PILOT_OR_STUDENT',
    );
  }

  const flightDate = parseDateOnlyUtc(input.flightDate);
  if (flightDate.getTime() > todayDateOnlyUtc().getTime()) {
    throw new ValidationError('Flight date cannot be in the future.', undefined, 'FLIGHT_DATE_IN_FUTURE');
  }

  let minutes: number;
  let hourMeterStart: number | null = null;
  let hourMeterEnd: number | null = null;
  if (input.minutes !== undefined) {
    minutes = input.minutes;
  } else {
    // The Zod superRefine already guarantees both are present and structurally
    // sound (>= 0) here — this re-verifies the actual inequality (Dev Notes).
    hourMeterStart = input.hourMeterStart!;
    hourMeterEnd = input.hourMeterEnd!;
    if (hourMeterEnd <= hourMeterStart) {
      throw new ValidationError('hourMeterEnd must be strictly after hourMeterStart.', undefined, 'HOUR_METER_INVALID');
    }
    minutes = hourMeterEnd - hourMeterStart;
  }

  if (input.flightType === 'SCHOOL' && !input.instructorPersonId) {
    throw new ValidationError('A SCHOOL flight requires an instructor.', undefined, 'SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR');
  }

  const instructorPersonId = input.instructorPersonId ?? null;
  let instructorProfileId: string | null = null;
  if (instructorPersonId) {
    if (instructorPersonId === input.personId) {
      throw new ValidationError('The instructor cannot be the same person as the pilot/student.', undefined, 'INSTRUCTOR_SAME_AS_PILOT');
    }

    const instructorPerson = await prisma.person.findUnique({
      where: { id: instructorPersonId },
      select: { instructorProfile: { select: { id: true, deactivatedAt: true } } },
    });
    const instructorProfile = instructorPerson?.instructorProfile ?? null;
    if (!instructorProfile || instructorProfile.deactivatedAt !== null) {
      throw new ValidationError('Instructor has no active instructor profile.', undefined, 'INSTRUCTOR_NOT_FOUND');
    }
    instructorProfileId = instructorProfile.id;
  }

  // Rate lookups BEFORE any transaction (Dev Notes: append-only tables, no
  // meaningful race) — AD-4, the effective rate at `flightDate`.
  const aircraftRate = await getEffectiveRate(actor, input.aircraftId, flightDate);
  if (!aircraftRate) {
    throw new ValidationError('No aircraft rate is in effect on the flight date.', undefined, 'NO_AIRCRAFT_RATE');
  }

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
    flightDate,
    minutes,
    hourMeterStart,
    hourMeterEnd,
    aircraftRateCentsPerHour: aircraftRate.priceCentsPerHour,
    instructorRateCentsPerHour: instructorRate?.priceCentsPerHour ?? null,
    instructorAmountCents,
  };
}

type RegisterFlightCoreInput = {
  actorUserId: string;
  aircraftId: string;
  aircraftRegistration: string;
  /**
   * The aircraft's `hourMeterMinutes` value THIS FUNCTION should increment
   * from — the caller already holds the `FOR UPDATE` lock and supplies the
   * current value; `correctFlight` passes the ALREADY-DECREMENTED value when
   * the correction keeps the same aircraft as the flight it storno'd, so the
   * net effect is exactly `current - oldMinutes + newMinutes` (never a stale
   * pre-storno read).
   */
  aircraftHourMeterMinutes: number;
  accountId: string;
  personId: string;
  instructorProfileId: string | null;
  flightDate: Date;
  /** `YYYY-MM-DD`, exactly `input.flightDate` — for the auto-generated movement description. */
  flightDateDisplay: string;
  flightType: FlightType;
  minutes: number;
  hourMeterStart: number | null;
  hourMeterEnd: number | null;
  landings: number | null;
  notes: string | null;
  aircraftRateCentsPerHour: number;
  instructorRateCentsPerHour: number | null;
  instructorAmountCents: number | null;
  /** `Flight.correctionOfId` (story 5.3) — the ORIGINAL flight this one replaces, or `null` for a plain `registerFlight` call. */
  correctionOfId: string | null;
};

type RegisterFlightCoreResult = {
  flight: SelectedFlight;
  balanceBeforeCents: number;
  balanceAfterCents: number;
};

/**
 * The shared in-transaction core of a flight registration (story 5.1/5.2),
 * extracted (story 5.3, Task 2 — the mandatory refactor) so `registerFlight`
 * (a brand-new flight, its own transaction) and `correctFlight` (a storno
 * immediately followed by a brand-new flight, SAME transaction) run ONE
 * implementation of the consumption/charge/contaore logic instead of two
 * copies that could drift. ASSUMES every lock its own writes need is
 * ALREADY held by the caller (the `Aircraft` row behind `aircraftId`, the
 * `Account` row behind `accountId`) — it takes none of its own; that is
 * exactly what lets `correctFlight` slot its own multi-row locking in front
 * of this same function (module doc-comment).
 *
 * 1. Reads the pre-movement balance (`SUM(AccountMovement.amountCents)`,
 *    AD-3) — this doubles as `correctFlight`'s "saldo-prima" (Contesto): when
 *    called AFTER that function's storno write in the SAME transaction, this
 *    SUM already reflects the refund (read-your-own-writes), so the balance
 *    it returns is the TRUE pre-correction one.
 * 2. Package consumption (story 5.2, AD-6): candidate packages for
 *    `personId`/`aircraftId` at `flightDate`, FIFO order, each package's
 *    consumed-so-far SUM filtered to non-cancelled flights (story 5.3 —
 *    module doc-comment) — greedy allocation exactly as 5.2 shipped it.
 * 3. Writes, in order: `Flight.create` (full AD-4 snapshot, including
 *    `packageCoveredMinutes` and `correctionOfId`), one `PackageConsumption`
 *    row per package actually touched (`take > 0`), the `FLIGHT_CHARGE`
 *    `AccountMovement` (`amountCents: -(total)`, possibly 0 — never omitted
 *    — linked via `flightId`), `Aircraft.hourMeterMinutes` advanced by
 *    `minutes` from the CALLER-SUPPLIED current value (never re-read here —
 *    Dev Notes: that value already reflects any earlier write to the SAME
 *    row within this transaction).
 */
async function registerFlightCore(tx: Prisma.TransactionClient, params: RegisterFlightCoreInput): Promise<RegisterFlightCoreResult> {
  const aggregate = await tx.accountMovement.aggregate({
    where: { accountId: params.accountId },
    _sum: { amountCents: true },
  });
  const balanceBeforeCents = aggregate._sum.amountCents ?? 0;

  // Package consumption (story 5.2, AD-6) — candidate packages, in FIFO
  // order (`effectiveDate asc, createdAt asc, id asc`, Dev Notes' tie-break).
  const candidatePackages = await tx.hourPackage.findMany({
    where: {
      personId: params.personId,
      effectiveDate: { lte: params.flightDate },
      OR: [{ expiresAt: null }, { expiresAt: { gte: params.flightDate } }],
      packageType: { eligibleAircraft: { some: { aircraftId: params.aircraftId } } },
    },
    select: { id: true, includedMinutes: true, packageType: { select: { name: true } } },
    orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });

  // ONE aggregated query for every candidate's consumed-so-far SUM (Dev
  // Notes: never one query per package — `groupBy`, not a loop).
  // `flight: { status: { not: 'CANCELLED' } }` (story 5.3): a cancelled
  // flight's `PackageConsumption` rows are never touched (append-only
  // forever) — they simply stop counting here, which is exactly what
  // "restores" the minutes after a storno, including inside THIS SAME
  // transaction when `correctFlight` just cancelled the original flight
  // moments ago.
  const consumedRows =
    candidatePackages.length > 0
      ? await tx.packageConsumption.groupBy({
          by: ['hourPackageId'],
          where: { hourPackageId: { in: candidatePackages.map((pkg) => pkg.id) }, flight: { status: { not: 'CANCELLED' } } },
          _sum: { minutes: true },
        })
      : [];
  const consumedByPackageId = new Map(consumedRows.map((row) => [row.hourPackageId, row._sum.minutes ?? 0]));

  // Greedy FIFO allocation: spend from the oldest eligible, non-exhausted
  // package first, spilling into the next only once the current one is
  // exhausted, until this flight's minutes are covered or eligible
  // packages run out. A package with `residualMinutes <= 0` (exhausted, or
  // — defensively — over-consumed) is skipped entirely, never touched.
  let uncoveredMinutes = params.minutes;
  const allocations: { hourPackageId: string; typeName: string; minutes: number }[] = [];
  for (const pkg of candidatePackages) {
    if (uncoveredMinutes <= 0) break;
    const residualMinutes = pkg.includedMinutes - (consumedByPackageId.get(pkg.id) ?? 0);
    if (residualMinutes <= 0) continue;
    const take = Math.min(residualMinutes, uncoveredMinutes);
    allocations.push({ hourPackageId: pkg.id, typeName: pkg.packageType.name, minutes: take });
    uncoveredMinutes -= take;
  }
  const packageCoveredMinutes = params.minutes - uncoveredMinutes;
  const chargedMinutes = params.minutes - packageCoveredMinutes;

  // Pro-rata (AC 1, PRD FR-13): the aircraft component is rated ONLY on
  // the minutes the packages left uncovered — never a percentage discount
  // applied to the full-duration amount. The instructor amount (computed by
  // `resolveFlightInput`) is NEVER touched by this (AD-6).
  const aircraftAmountCents = Math.round((params.aircraftRateCentsPerHour * chargedMinutes) / 60);
  const totalAmountCents = aircraftAmountCents + (params.instructorAmountCents ?? 0);

  // Appends "(H:MM da pacchetto)" only when a package covered part of the
  // flight — the base description stays byte-identical to 5.1 otherwise.
  const description =
    `Volo ${params.aircraftRegistration} ${params.flightDateDisplay} — ${formatMinutes(params.minutes)}` +
    (packageCoveredMinutes > 0 ? ` (${formatMinutes(packageCoveredMinutes)} da pacchetto)` : '');

  const created = await tx.flight.create({
    data: {
      aircraftId: params.aircraftId,
      personId: params.personId,
      instructorProfileId: params.instructorProfileId,
      flightDate: params.flightDate,
      flightType: params.flightType,
      minutes: params.minutes,
      hourMeterStart: params.hourMeterStart,
      hourMeterEnd: params.hourMeterEnd,
      landings: params.landings,
      notes: params.notes,
      aircraftRateCentsPerHour: params.aircraftRateCentsPerHour,
      aircraftAmountCents,
      instructorRateCentsPerHour: params.instructorRateCentsPerHour,
      instructorAmountCents: params.instructorAmountCents,
      packageCoveredMinutes,
      correctionOfId: params.correctionOfId,
      actorUserId: params.actorUserId,
    },
    select: FLIGHT_SELECT,
  });

  // One `PackageConsumption` row per package the allocation actually took
  // minutes from (`take > 0` guaranteed by construction above) — a single
  // `createMany`, not a loop of individual `create`s.
  if (allocations.length > 0) {
    await tx.packageConsumption.createMany({
      data: allocations.map((allocation) => ({
        flightId: created.id,
        hourPackageId: allocation.hourPackageId,
        minutes: allocation.minutes,
      })),
    });
  }

  await tx.accountMovement.create({
    data: {
      accountId: params.accountId,
      type: 'FLIGHT_CHARGE',
      // `0 - totalAmountCents`, NOT unary `-totalAmountCents`: when
      // packages cover every minute and there is no instructor,
      // `totalAmountCents` is exactly 0 (Dev Notes: the movement is still
      // created, never omitted) — unary negation of `0` produces `-0`,
      // which is a distinct (if numerically equal) value that a strict
      // `Object.is`-based comparison downstream could trip on.
      amountCents: 0 - totalAmountCents,
      description,
      effectiveDate: params.flightDate,
      actorUserId: params.actorUserId,
      flightId: created.id,
    },
  });

  // Contaore ALWAYS advances by `minutes` (+=) from the CALLER-SUPPLIED
  // current value (never a SET to `hourMeterEnd`, never re-read here — Dev
  // Notes/module doc-comment: out-of-order registrations, a prior manual
  // adjustment, or (story 5.3) this SAME transaction's own storno decrement
  // would make a fresh, blind SET destructive).
  await tx.aircraft.update({
    where: { id: params.aircraftId },
    data: { hourMeterMinutes: params.aircraftHourMeterMinutes + params.minutes },
  });

  // `created.packageConsumptions` came back empty from `FLIGHT_SELECT`
  // above (the rows did not exist yet at that `SELECT`'s time — they were
  // just inserted). Patch in the in-memory `allocations` we already
  // computed rather than re-querying: same data, no extra round-trip.
  const flightWithConsumptions: SelectedFlight = {
    ...created,
    packageConsumptions: allocations.map((allocation) => ({
      hourPackageId: allocation.hourPackageId,
      minutes: allocation.minutes,
      hourPackage: { packageType: { name: allocation.typeName } },
    })),
  };

  return { flight: flightWithConsumptions, balanceBeforeCents, balanceAfterCents: balanceBeforeCents - totalAmountCents };
}

/** Prisma unique-constraint violation (same pattern as `accounts.service.ts`/`cash.service.ts`). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Registers a flight and its automatic charge in one shot (AC 1/2/3/4).
 * `flights.manage` (STAFF/ADMIN, FR-14) — every read this function performs
 * through `getEffectiveRate`/`getEffectiveInstructorRate`/
 * `getAccountOverview` re-checks its own coarser permission
 * (`aircraft.manage`/`people.read`), which every actor holding
 * `flights.manage` today also holds (same guard-free-re-read caveat as
 * `sellPackage`'s doc-comment — revisit if that ever decouples).
 *
 * Guards and rate lookups: `resolveFlightInput` (story 5.3's extraction —
 * unchanged behavior/error codes from 5.1/5.2).
 *
 * ONE `prisma.$transaction`: `FOR UPDATE` locks on the `Aircraft` row (same
 * raw-query pattern as `aircraft.service.ts#adjustHourMeter`) and, after the
 * `Account` get-or-create upsert, on the `Account` row (same pattern as
 * `recordAdjustment`) so the pre-movement balance never races a concurrent
 * top-up/adjustment/flight on the same account — and, since story 5.2, ALSO
 * serializes package consumption for this person (module doc-comment). This
 * lock shape is UNCHANGED from 5.1/5.2 (story 5.3, Task 2: no contract
 * change) — only the in-transaction WORK after it now lives in the shared
 * `registerFlightCore` (module doc-comment).
 *
 * Returns the created flight plus the refreshed account overview (same
 * shape/caveat as `sellPackage`'s return). POST-commit (never inside the
 * transaction, Dev Notes): compares the balance band before/after and fires
 * `sendNegativeBalanceAlert` (fire-and-forget) exactly when it worsened —
 * identical rule to `recordAdjustment`'s AC 2/3.
 */
export async function registerFlight(actor: Actor, input: RegisterFlightInput): Promise<RegisterFlightResult> {
  authorize(actor, 'flights.manage');

  const resolved = await resolveFlightInput(actor, input);

  // Threshold read BEFORE the transaction (same pattern as `recordAdjustment`).
  const thresholdCents = await getNegativeBalanceThresholdCents();

  const {
    flight: createdFlight,
    balanceBeforeCents,
    balanceAfterCents,
  } = await prisma.$transaction(async (tx) => {
    // Row lock (FOR UPDATE): same raw-query pattern as `adjustHourMeter` —
    // serializes concurrent flights/adjustments touching this aircraft's
    // contaore.
    const lockedAircraft = await tx.$queryRaw<Array<{ hourMeterMinutes: number }>>`
      SELECT "hourMeterMinutes" FROM "Aircraft" WHERE "id" = ${resolved.aircraft.id} FOR UPDATE`;
    const existingAircraft = lockedAircraft[0];
    if (!existingAircraft) {
      throw new NotFoundError('Aircraft not found.');
    }

    const account = await tx.account.upsert({
      where: { personId: resolved.person.id },
      create: { personId: resolved.person.id },
      update: {},
      select: { id: true },
    });

    // Row lock (FOR UPDATE), same pattern as `recordAdjustment`: the upsert
    // above cannot itself be locked ahead of time, so the lock is taken
    // right after it — serializes concurrent top-ups/adjustments/flights on
    // THIS account so the "balance before" read never races.
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;

    return registerFlightCore(tx, {
      actorUserId: actor.userId,
      aircraftId: resolved.aircraft.id,
      aircraftRegistration: resolved.aircraft.registration,
      aircraftHourMeterMinutes: existingAircraft.hourMeterMinutes,
      accountId: account.id,
      personId: resolved.person.id,
      instructorProfileId: resolved.instructorProfileId,
      flightDate: resolved.flightDate,
      flightDateDisplay: input.flightDate,
      flightType: input.flightType,
      minutes: resolved.minutes,
      hourMeterStart: resolved.hourMeterStart,
      hourMeterEnd: resolved.hourMeterEnd,
      landings: input.landings ?? null,
      notes: input.notes ?? null,
      aircraftRateCentsPerHour: resolved.aircraftRateCentsPerHour,
      instructorRateCentsPerHour: resolved.instructorRateCentsPerHour,
      instructorAmountCents: resolved.instructorAmountCents,
      correctionOfId: null,
    });
  });

  // Guard-free re-read, same rationale as `sellPackage`/`recordTopUp`.
  const account = await getAccountOverview(actor, resolved.person.id);

  const bandBefore = balanceBand(balanceBeforeCents, thresholdCents);
  const bandAfter = balanceBand(balanceAfterCents, thresholdCents);
  if (bandWorsened(bandBefore, bandAfter)) {
    // Fire-and-forget, AFTER commit (Dev Notes) — same pattern as
    // `recordAdjustment`; the email quotes the post-commit balance.
    void sendNegativeBalanceAlert(
      resolved.person.id,
      { firstName: resolved.person.firstName, lastName: resolved.person.lastName, email: resolved.person.email },
      account.balanceCents,
    );
  }

  return { flight: toListItem(createdFlight), account };
}

/** The `FLIGHT_CHARGE` movement a `REGISTERED` flight must always have — loaded so `cancelFlight`/`correctFlight` can reverse it. */
type OriginalChargeMovement = { id: string; amountCents: number; accountId: string };

/**
 * Loads a flight plus its `FLIGHT_CHARGE` movement for `cancelFlight`/
 * `correctFlight` — 404 when the flight does not exist, `ConflictError` when
 * it is already `CANCELLED` (AC 3: the pre-check half of the pre-check +
 * P2002-backstop pattern; the backstop itself lives at the write site,
 * where a concurrent double-cancel/-correct can still race past this read).
 */
async function loadRegisteredFlightForReversal(flightId: string): Promise<{
  id: string;
  aircraftId: string;
  personId: string;
  minutes: number;
  flightDate: Date;
  aircraft: { registration: string };
  originalMovement: OriginalChargeMovement;
}> {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      id: true,
      status: true,
      aircraftId: true,
      personId: true,
      minutes: true,
      flightDate: true,
      aircraft: { select: { registration: true } },
      movements: { where: { type: 'FLIGHT_CHARGE' }, select: { id: true, amountCents: true, accountId: true } },
    },
  });
  if (!flight) {
    throw new NotFoundError('Flight not found.');
  }
  if (flight.status === 'CANCELLED') {
    throw new ConflictError('Flight is already cancelled.');
  }

  const originalMovement = flight.movements[0];
  if (!originalMovement) {
    // Cannot happen (`registerFlight`/`registerFlightCore` always create the
    // `FLIGHT_CHARGE` movement in the SAME transaction as the `Flight`
    // itself, AC 2) — a defensive guard against a silent, orphaned storno
    // rather than a generic Prisma error deep in the transaction below.
    throw new Error(`Flight ${flightId} has no FLIGHT_CHARGE movement to reverse.`);
  }

  return {
    id: flight.id,
    aircraftId: flight.aircraftId,
    personId: flight.personId,
    minutes: flight.minutes,
    flightDate: flight.flightDate,
    aircraft: flight.aircraft,
    originalMovement,
  };
}

/**
 * Cancels (storno) a registered flight (epic 5, story 5.3; AC 1/3/4; FR-16).
 * `flights.manage` only. Guards: flight exists -> 404; already `CANCELLED`
 * -> `ConflictError` (`loadRegisteredFlightForReversal`, pre-check half of
 * the pre-check + P2002-backstop pattern — AD-8). Cancelling is ALWAYS
 * lecito (Contesto) — never re-validates the person/aircraft's CURRENT
 * archived state (a cancellation gives money back, it never needs the
 * target to still be "valid"; contrast `correctFlight`, which re-registers
 * and so DOES re-validate everything).
 *
 * ONE `prisma.$transaction`, same macro lock order as `registerFlight`
 * (Aircraft, then Account — module doc-comment): lock the flight's
 * `Aircraft` row, then its `Account` row (already guaranteed to exist — the
 * original `FLIGHT_CHARGE` could not have been created otherwise, so no
 * upsert is needed here, unlike `registerFlight`'s get-or-create). Writes:
 * `Flight.update` (`status: 'CANCELLED'`, `cancelledAt`, `cancelReason`),
 * the `FLIGHT_CHARGE_REVERSAL` `AccountMovement` (`amountCents` = the
 * ORIGINAL movement's negated, NEVER recalculated — AD-4 — linked via
 * `reversalOfId`/`flightId`, `effectiveDate` = today UTC date-only, NOT the
 * flight's own date — Contesto: a storno values as of when it happens, same
 * convention as `recordAdjustment`) with a P2002 catch on `reversalOfId`
 * (the backstop half, for a concurrent double-cancel that raced past the
 * pre-check), and `Aircraft.hourMeterMinutes = max(0, current - minutes)`
 * (clamped — module doc-comment: a prior manual rectification undershooting
 * this flight's minutes must never BLOCK the cancellation).
 *
 * NO balance-band alert (Contesto/module doc-comment): a storno only ever
 * improves or holds the band, same reasoning as `recordTopUp`.
 */
export async function cancelFlight(actor: Actor, flightId: string, input: CancelFlightInput): Promise<RegisterFlightResult> {
  authorize(actor, 'flights.manage');

  const flight = await loadRegisteredFlightForReversal(flightId);
  const reason = input.reason;

  const updated = await prisma.$transaction(async (tx) => {
    const lockedAircraft = await tx.$queryRaw<Array<{ hourMeterMinutes: number }>>`
      SELECT "hourMeterMinutes" FROM "Aircraft" WHERE "id" = ${flight.aircraftId} FOR UPDATE`;
    const existingAircraft = lockedAircraft[0];
    if (!existingAircraft) {
      throw new NotFoundError('Aircraft not found.');
    }

    // Same macro lock order as `registerFlight` (Aircraft, then Account) —
    // even without a balance read/alert here, keeping the SAME order is what
    // keeps a concurrent `correctFlight` touching the same aircraft/account
    // from ever deadlocking against this transaction (module doc-comment).
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${flight.originalMovement.accountId} FOR UPDATE`;

    const updatedFlight = await tx.flight.update({
      where: { id: flight.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      select: FLIGHT_SELECT,
    });

    try {
      await tx.accountMovement.create({
        data: {
          accountId: flight.originalMovement.accountId,
          type: 'FLIGHT_CHARGE_REVERSAL',
          // `0 - amountCents`, not unary negation (same -0 lesson as
          // `registerFlightCore`): a fully-package-covered original charge
          // can itself be exactly 0.
          amountCents: 0 - flight.originalMovement.amountCents,
          reversalOfId: flight.originalMovement.id,
          flightId: flight.id,
          effectiveDate: todayDateOnlyUtc(),
          description: `Storno volo ${flight.aircraft.registration} ${toDateOnlyString(flight.flightDate)} — ${reason}`,
          actorUserId: actor.userId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Concurrent-race backstop (TOCTOU) for the pre-check in
        // `loadRegisteredFlightForReversal`: two concurrent cancellations of
        // the SAME flight.
        throw new ConflictError('Flight is already cancelled.');
      }
      throw error;
    }

    await tx.aircraft.update({
      where: { id: flight.aircraftId },
      data: { hourMeterMinutes: Math.max(0, existingAircraft.hourMeterMinutes - flight.minutes) },
    });

    return updatedFlight;
  });

  const account = await getAccountOverview(actor, flight.personId);

  return { flight: toListItem(updated), account };
}

/**
 * Corrects a registered flight (epic 5, story 5.3; AC 2/3/4; FR-16): storno
 * of the original + a brand-new registration, in ONE transaction, forever
 * linked via `Flight.correctionOfId`. `flights.manage` only. Guards: flight
 * exists -> 404; already `CANCELLED` -> `ConflictError`
 * (`loadRegisteredFlightForReversal`); the NEW data goes through the FULL
 * `resolveFlightInput` guard/rate-lookup set (Contesto: "tutti i 422 di 5.1
 * si applicano ai DATI NUOVI" — a correction IS a new registration,
 * re-validated from scratch, unlike cancellation which is always lecito).
 * If ANY of that re-validation fails, the ENTIRE transaction (storno
 * included) never even opens — no orphaned storno from a failed correction
 * (Contesto).
 *
 * Transaction order (Contesto, mandatory): lock -> storno (movimento +
 * status + contaore giù) -> saldo-prima -> nuova registrazione (via
 * `registerFlightCore`) -> alert post-commit if the band worsened.
 *
 * **Deterministic lock ordering** (module doc-comment): resolves EVERY
 * `Aircraft` id involved (the original flight's, and the corrected one's, if
 * different) and locks them in ONE `SELECT ... WHERE id IN (...) ORDER BY id
 * FOR UPDATE` — never one query per row — then the SAME shape for the
 * `Account` ids (the original flight's account, already known from its
 * `FLIGHT_CHARGE` movement, and the corrected data's account, get-or-create
 * upserted first since a brand-new person may have none yet). Aircraft locks
 * ALWAYS precede Account locks, same macro order as `registerFlight`. This
 * makes two concurrent, crossing corrections provably deadlock-free.
 *
 * The storno write is IDENTICAL in shape to `cancelFlight`'s (status +
 * cancelledAt/cancelReason + `FLIGHT_CHARGE_REVERSAL` with its P2002
 * backstop + the contaore clamp) — but on the ORIGINAL aircraft, which may
 * differ from the corrected data's aircraft. `registerFlightCore` is then
 * called with `correctionOfId` set to the original flight's id; its OWN
 * internal "saldo-prima" read (the first thing it does) happens AFTER this
 * storno write, in the SAME transaction — read-your-own-writes means that
 * SUM already includes the refund, so the post-commit band comparison is
 * against the TRUE pre-correction balance (module doc-comment).
 */
export async function correctFlight(actor: Actor, flightId: string, input: CorrectFlightInput): Promise<RegisterFlightResult> {
  authorize(actor, 'flights.manage');

  const originalFlight = await loadRegisteredFlightForReversal(flightId);
  const reason = input.reason;

  const resolved = await resolveFlightInput(actor, input);
  const thresholdCents = await getNegativeBalanceThresholdCents();

  const {
    flight: createdFlight,
    balanceBeforeCents,
    balanceAfterCents,
  } = await prisma.$transaction(async (tx) => {
    // ALL Aircraft ids first, ONE query, ORDER BY id FOR UPDATE (module
    // doc-comment) — a 1-element set (the common case: same aircraft,
    // corrected minutes/date/etc.) uses the identical query shape.
    const aircraftIds = Array.from(new Set([originalFlight.aircraftId, resolved.aircraft.id]));
    const lockedAircraftRows = await tx.$queryRaw<Array<{ id: string; hourMeterMinutes: number }>>`
      SELECT "id", "hourMeterMinutes" FROM "Aircraft" WHERE "id" IN (${Prisma.join(aircraftIds)}) ORDER BY "id" FOR UPDATE`;
    const hourMeterById = new Map(lockedAircraftRows.map((row) => [row.id, row.hourMeterMinutes]));
    if (!hourMeterById.has(originalFlight.aircraftId) || !hourMeterById.has(resolved.aircraft.id)) {
      throw new NotFoundError('Aircraft not found.');
    }

    // Get-or-create the NEW person's account BEFORE locking (same
    // upsert-then-lock constraint as `registerFlight`) — the ORIGINAL
    // flight's account is already known (its own `FLIGHT_CHARGE` movement).
    const newAccount = await tx.account.upsert({
      where: { personId: resolved.person.id },
      create: { personId: resolved.person.id },
      update: {},
      select: { id: true },
    });
    const accountIds = Array.from(new Set([originalFlight.originalMovement.accountId, newAccount.id]));
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" IN (${Prisma.join(accountIds)}) ORDER BY "id" FOR UPDATE`;

    // Storno completo del volo originale — identical write shape to
    // `cancelFlight` (Contesto order: lock -> storno -> saldo-prima -> nuova
    // registrazione).
    await tx.flight.update({
      where: { id: originalFlight.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
    try {
      await tx.accountMovement.create({
        data: {
          accountId: originalFlight.originalMovement.accountId,
          type: 'FLIGHT_CHARGE_REVERSAL',
          amountCents: 0 - originalFlight.originalMovement.amountCents,
          reversalOfId: originalFlight.originalMovement.id,
          flightId: originalFlight.id,
          effectiveDate: todayDateOnlyUtc(),
          description: `Storno volo ${originalFlight.aircraft.registration} ${toDateOnlyString(originalFlight.flightDate)} — ${reason}`,
          actorUserId: actor.userId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Flight is already cancelled.');
      }
      throw error;
    }

    const originalAircraftMeter = hourMeterById.get(originalFlight.aircraftId)!;
    const originalAircraftNewMeter = Math.max(0, originalAircraftMeter - originalFlight.minutes);
    await tx.aircraft.update({ where: { id: originalFlight.aircraftId }, data: { hourMeterMinutes: originalAircraftNewMeter } });
    // Reflect the storno's decrement so `registerFlightCore` below
    // increments from the POST-storno value — matters ONLY when the
    // correction keeps the SAME aircraft (module doc-comment:
    // `registerFlightCore` never re-reads the row itself).
    hourMeterById.set(originalFlight.aircraftId, originalAircraftNewMeter);

    return registerFlightCore(tx, {
      actorUserId: actor.userId,
      aircraftId: resolved.aircraft.id,
      aircraftRegistration: resolved.aircraft.registration,
      aircraftHourMeterMinutes: hourMeterById.get(resolved.aircraft.id)!,
      accountId: newAccount.id,
      personId: resolved.person.id,
      instructorProfileId: resolved.instructorProfileId,
      flightDate: resolved.flightDate,
      flightDateDisplay: input.flightDate,
      flightType: input.flightType,
      minutes: resolved.minutes,
      hourMeterStart: resolved.hourMeterStart,
      hourMeterEnd: resolved.hourMeterEnd,
      landings: input.landings ?? null,
      notes: input.notes ?? null,
      aircraftRateCentsPerHour: resolved.aircraftRateCentsPerHour,
      instructorRateCentsPerHour: resolved.instructorRateCentsPerHour,
      instructorAmountCents: resolved.instructorAmountCents,
      correctionOfId: originalFlight.id,
    });
  });

  const account = await getAccountOverview(actor, resolved.person.id);

  const bandBefore = balanceBand(balanceBeforeCents, thresholdCents);
  const bandAfter = balanceBand(balanceAfterCents, thresholdCents);
  if (bandWorsened(bandBefore, bandAfter)) {
    void sendNegativeBalanceAlert(
      resolved.person.id,
      { firstName: resolved.person.firstName, lastName: resolved.person.lastName, email: resolved.person.email },
      account.balanceCents,
    );
  }

  return { flight: toListItem(createdFlight), account };
}

/**
 * Lists registered flights, most recent first (AC 1/2). `flights.manage`
 * only today — story 5.4 extends this to own-access plus filters (Dev
 * Notes); this story keeps it a plain staff-only paginated list, same
 * pattern as `listAccountMovements`.
 */
export async function listFlights(actor: Actor, query: PaginationQuery): Promise<FlightListResult> {
  authorize(actor, 'flights.manage');

  const [items, total] = await prisma.$transaction([
    prisma.flight.findMany({
      select: FLIGHT_SELECT,
      // `id` tie-break: same-millisecond rows must not make the page order
      // non-deterministic (same pattern as `buildOverview`/`listAccountMovements`).
      orderBy: [{ flightDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...paginationOffset(query),
    }),
    prisma.flight.count(),
  ]);

  return paginate(items.map(toListItem), total, query);
}
