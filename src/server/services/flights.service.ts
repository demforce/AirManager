import type { FlightStatus, FlightType } from '@/generated/prisma/client';
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
 */

export type FlightBreakdown = {
  aircraftRateCentsPerHour: number;
  aircraftAmountCents: number;
  instructorRateCentsPerHour?: number;
  instructorAmountCents?: number;
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
  createdAt: true,
  aircraft: { select: { id: true, registration: true } },
  person: { select: { id: true, firstName: true, lastName: true } },
  instructorProfile: { select: { person: { select: { id: true, firstName: true, lastName: true } } } },
  actorUser: { select: { email: true } },
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
  createdAt: Date;
  aircraft: { id: string; registration: string };
  person: { id: string; firstName: string; lastName: string };
  instructorProfile: { person: { id: string; firstName: string; lastName: string } } | null;
  actorUser: { email: string };
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
 * null -> `NO_INSTRUCTOR_RATE`. Amounts are rounded SEPARATELY (aircraft and
 * instructor each `Math.round(rate * minutes / 60)`, AD-2/NFR-5) and the
 * total is the SUM of the two already-rounded amounts, never a round of the
 * sum.
 *
 * ONE `prisma.$transaction`: `FOR UPDATE` locks on the `Aircraft` row (same
 * raw-query pattern as `aircraft.service.ts#adjustHourMeter`) and, after the
 * `Account` get-or-create upsert, on the `Account` row (same pattern as
 * `recordAdjustment`) so the pre-movement balance never races a concurrent
 * top-up/adjustment/flight on the same account. Writes, in order: `Flight`
 * (full AD-4 snapshot), the `FLIGHT_CHARGE` `AccountMovement`
 * (`amountCents: -(total)`, linked via `flightId`, auto-generated
 * description), `Aircraft.hourMeterMinutes += minutes` (never a `SET` to
 * `hourMeterEnd` — Dev Notes: out-of-order registrations/prior manual
 * adjustments would make that destructive). No `HourMeterAdjustment` row is
 * created (Dev Notes: that table is reserved for motivated manual
 * rectifications; this flight IS the audit trail of the advance).
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

  // Separate rounding (Dev Notes/NFR-5): each component rounds on its own,
  // the total is the SUM of the two already-rounded amounts.
  const aircraftAmountCents = Math.round((aircraftRate.priceCentsPerHour * minutes) / 60);
  const instructorAmountCents = instructorRate ? Math.round((instructorRate.priceCentsPerHour * minutes) / 60) : null;
  const totalAmountCents = aircraftAmountCents + (instructorAmountCents ?? 0);

  // Threshold read BEFORE the transaction (same pattern as `recordAdjustment`).
  const thresholdCents = await getNegativeBalanceThresholdCents();

  const description = `Volo ${aircraft.registration} ${input.flightDate} — ${formatMinutes(minutes)}`;

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
        actorUserId: actor.userId,
      },
      select: FLIGHT_SELECT,
    });

    await tx.accountMovement.create({
      data: {
        accountId: account.id,
        type: 'FLIGHT_CHARGE',
        amountCents: -totalAmountCents,
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

    return { flight: created, balanceBeforeCents, balanceAfterCents: balanceBeforeCents - totalAmountCents };
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
