import type { FlightStatus, FlightType, Prisma } from '@/generated/prisma/client';
import { paginate, paginationOffset, type PaginatedResult, type PaginationQuery } from '@/lib/api/pagination';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import type { RegisterFlightInput } from '@/lib/schemas/flights';
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
import { NotFoundError, ValidationError } from './errors';
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
  };
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
 * Guard order (consolidated pattern: existence 404 -> state 422 -> domain
 * 422): aircraft exists -> 404; person exists -> 404; aircraft archived ->
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
 * nobody or to a non-instructor). Then, BEFORE the transaction (rates are
 * append-only, no meaningful race): `getEffectiveRate` -> null ->
 * `NO_AIRCRAFT_RATE`; with an instructor, `getEffectiveInstructorRate` ->
 * null -> `NO_INSTRUCTOR_RATE`. The instructor amount (unaffected by package
 * consumption, AD-6) is rounded here, `Math.round(rate * minutes / 60)` on
 * the FULL duration (AD-2/NFR-5) — the aircraft amount moves INSIDE the
 * transaction (story 5.2, see the module doc-comment) because it now
 * depends on the concurrent package residuo; the two are still summed
 * as already-independently-rounded amounts, never a round of the sum.
 *
 * ONE `prisma.$transaction`: `FOR UPDATE` locks on the `Aircraft` row (same
 * raw-query pattern as `aircraft.service.ts#adjustHourMeter`) and, after the
 * `Account` get-or-create upsert, on the `Account` row (same pattern as
 * `recordAdjustment`) so the pre-movement balance never races a concurrent
 * top-up/adjustment/flight on the same account — and, since story 5.2, ALSO
 * serializes package consumption for this person (module doc-comment).
 * After that lock: read the eligible packages (FIFO order) plus their
 * consumed-so-far SUMs (two aggregated queries, no N+1) and greedily
 * allocate this flight's minutes across them; the aircraft component is
 * then rounded on the uncovered remainder. Writes, in order: `Flight` (full
 * AD-4 snapshot, including `packageCoveredMinutes`), one `PackageConsumption`
 * row per package actually touched (`take > 0`), the `FLIGHT_CHARGE`
 * `AccountMovement` (`amountCents: -(total)`, possibly 0 — Dev Notes: never
 * omitted — linked via `flightId`, auto-generated description that appends
 * "(H:MM da pacchetto)" when coverage is non-zero),
 * `Aircraft.hourMeterMinutes += minutes` (never a `SET` to `hourMeterEnd` —
 * Dev Notes: out-of-order registrations/prior manual adjustments would make
 * that destructive). No `HourMeterAdjustment` row is created (Dev Notes:
 * that table is reserved for motivated manual rectifications; this flight
 * IS the audit trail of the advance).
 *
 * Returns the created flight plus the refreshed account overview (same
 * shape/caveat as `sellPackage`'s return). POST-commit (never inside the
 * transaction, Dev Notes): compares the balance band before/after and fires
 * `sendNegativeBalanceAlert` (fire-and-forget) exactly when it worsened —
 * identical rule to `recordAdjustment`'s AC 2/3.
 */
export async function registerFlight(actor: Actor, input: RegisterFlightInput): Promise<RegisterFlightResult> {
  authorize(actor, 'flights.manage');

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

  // Rate lookups BEFORE the transaction (Dev Notes: append-only tables, no
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

  // Instructor amount is UNAFFECTED by package consumption (AD-6) — rounds
  // here, on the full duration, same as 5.1. The aircraft amount cannot be
  // computed yet: it depends on the concurrent package residuo, read INSIDE
  // the transaction (module doc-comment) after the Account lock.
  const instructorAmountCents = instructorRate ? Math.round((instructorRate.priceCentsPerHour * minutes) / 60) : null;

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
      SELECT "hourMeterMinutes" FROM "Aircraft" WHERE "id" = ${input.aircraftId} FOR UPDATE`;
    const existingAircraft = lockedAircraft[0];
    if (!existingAircraft) {
      throw new NotFoundError('Aircraft not found.');
    }

    const account = await tx.account.upsert({
      where: { personId: input.personId },
      create: { personId: input.personId },
      update: {},
      select: { id: true },
    });

    // Row lock (FOR UPDATE), same pattern as `recordAdjustment`: the upsert
    // above cannot itself be locked ahead of time, so the lock is taken
    // right after it — serializes concurrent top-ups/adjustments/flights on
    // THIS account so the "balance before" read never races.
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;

    const aggregate = await tx.accountMovement.aggregate({
      where: { accountId: account.id },
      _sum: { amountCents: true },
    });
    const balanceBeforeCents = aggregate._sum.amountCents ?? 0;

    // Package consumption (story 5.2, AD-6) — candidate packages, in FIFO
    // order (`effectiveDate asc, createdAt asc, id asc`, Dev Notes'
    // deterministic tie-break). Read AFTER the Account lock above: that lock
    // (module doc-comment) is the serialization point for concurrent
    // consumption of this SAME person's packages.
    const candidatePackages = await tx.hourPackage.findMany({
      where: {
        personId: input.personId,
        effectiveDate: { lte: flightDate },
        OR: [{ expiresAt: null }, { expiresAt: { gte: flightDate } }],
        packageType: { eligibleAircraft: { some: { aircraftId: input.aircraftId } } },
      },
      select: { id: true, includedMinutes: true, packageType: { select: { name: true } } },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    // ONE aggregated query for every candidate's consumed-so-far SUM (Dev
    // Notes: never one query per package — `groupBy`, not a loop).
    const consumedRows =
      candidatePackages.length > 0
        ? await tx.packageConsumption.groupBy({
            by: ['hourPackageId'],
            where: { hourPackageId: { in: candidatePackages.map((pkg) => pkg.id) } },
            _sum: { minutes: true },
          })
        : [];
    const consumedByPackageId = new Map(consumedRows.map((row) => [row.hourPackageId, row._sum.minutes ?? 0]));

    // Greedy FIFO allocation: spend from the oldest eligible, non-exhausted
    // package first, spilling into the next only once the current one is
    // exhausted, until this flight's minutes are covered or eligible
    // packages run out. A package with `residualMinutes <= 0` (exhausted, or
    // — defensively — over-consumed) is skipped entirely, never touched.
    let uncoveredMinutes = minutes;
    const allocations: { hourPackageId: string; typeName: string; minutes: number }[] = [];
    for (const pkg of candidatePackages) {
      if (uncoveredMinutes <= 0) break;
      const residualMinutes = pkg.includedMinutes - (consumedByPackageId.get(pkg.id) ?? 0);
      if (residualMinutes <= 0) continue;
      const take = Math.min(residualMinutes, uncoveredMinutes);
      allocations.push({ hourPackageId: pkg.id, typeName: pkg.packageType.name, minutes: take });
      uncoveredMinutes -= take;
    }
    const packageCoveredMinutes = minutes - uncoveredMinutes;
    const chargedMinutes = minutes - packageCoveredMinutes;

    // Pro-rata (AC 1, PRD FR-13): the aircraft component is rated ONLY on
    // the minutes the packages left uncovered — never a percentage discount
    // applied to the full-duration amount. The instructor amount
    // (`instructorAmountCents`, computed before the transaction) is NEVER
    // touched by this (AD-6).
    const aircraftAmountCents = Math.round((aircraftRate.priceCentsPerHour * chargedMinutes) / 60);
    const totalAmountCents = aircraftAmountCents + (instructorAmountCents ?? 0);

    // Appends "(H:MM da pacchetto)" only when a package covered part of the
    // flight — the base description stays byte-identical to 5.1 otherwise.
    const description =
      `Volo ${aircraft.registration} ${input.flightDate} — ${formatMinutes(minutes)}` +
      (packageCoveredMinutes > 0 ? ` (${formatMinutes(packageCoveredMinutes)} da pacchetto)` : '');

    const created = await tx.flight.create({
      data: {
        aircraftId: input.aircraftId,
        personId: input.personId,
        instructorProfileId,
        flightDate,
        flightType: input.flightType,
        minutes,
        hourMeterStart,
        hourMeterEnd,
        landings: input.landings ?? null,
        notes: input.notes ?? null,
        aircraftRateCentsPerHour: aircraftRate.priceCentsPerHour,
        aircraftAmountCents,
        instructorRateCentsPerHour: instructorRate?.priceCentsPerHour ?? null,
        instructorAmountCents,
        packageCoveredMinutes,
        actorUserId: actor.userId,
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
        accountId: account.id,
        type: 'FLIGHT_CHARGE',
        // `0 - totalAmountCents`, NOT unary `-totalAmountCents`: when
        // packages cover every minute and there is no instructor,
        // `totalAmountCents` is exactly 0 (Dev Notes: the movement is still
        // created, never omitted) — unary negation of `0` produces `-0`,
        // which is a distinct (if numerically equal) value that a strict
        // `Object.is`-based comparison downstream could trip on.
        amountCents: 0 - totalAmountCents,
        description,
        effectiveDate: flightDate,
        actorUserId: actor.userId,
        flightId: created.id,
      },
    });

    // Contaore ALWAYS advances by `minutes` (+=), never a SET to
    // `hourMeterEnd` (Dev Notes: out-of-order registrations/prior manual
    // adjustments would make that destructive).
    await tx.aircraft.update({
      where: { id: input.aircraftId },
      data: { hourMeterMinutes: existingAircraft.hourMeterMinutes + minutes },
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
  });

  // Guard-free re-read, same rationale as `sellPackage`/`recordTopUp`.
  const account = await getAccountOverview(actor, input.personId);

  const bandBefore = balanceBand(balanceBeforeCents, thresholdCents);
  const bandAfter = balanceBand(balanceAfterCents, thresholdCents);
  if (bandWorsened(bandBefore, bandAfter)) {
    // Fire-and-forget, AFTER commit (Dev Notes) — same pattern as
    // `recordAdjustment`; the email quotes the post-commit balance.
    void sendNegativeBalanceAlert(input.personId, { firstName: person.firstName, lastName: person.lastName, email: person.email }, account.balanceCents);
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
