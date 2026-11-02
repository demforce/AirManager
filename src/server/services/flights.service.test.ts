import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { listFlightsQuerySchema, registerFlightSchema } from '@/lib/schemas/flights';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    aircraft: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    person: {
      findUnique: vi.fn(),
    },
    account: {
      upsert: vi.fn(),
    },
    accountMovement: {
      aggregate: vi.fn(),
      create: vi.fn(),
      // Story 19.6 — `loadFlightCharge`'s read, `updateFlight`'s rewrite and
      // `deleteFlight`'s removal of the flight's one charge.
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    flight: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      // Story 16.2 — `assertNoOverlappingFlight`'s single read. Defaulted to
      // `null` in `beforeEach` below so every PRE-EXISTING test keeps passing
      // unmodified (same treatment as `expiryType.findMany` in story 14.4):
      // this file mocks prisma entirely, so no two flights ever coexist here.
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

// `vi.importActual` below loads the REAL `accounts.service.ts` (to keep
// `balanceBand`/`bandWorsened`'s actual logic) which in turn imports the
// mail adapter/templates — mock those two so loading it never runs the real
// `smtp-mail-sender.ts`'s env validation (same mocks as `accounts.service.test.ts`).
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: vi.fn() })),
}));
vi.mock('@/server/adapters/mail/templates', () => ({
  buildNegativeBalanceAlertEmail: vi.fn(async () => ({ subject: 'Alert subject', text: 'Alert text' })),
}));

const getAccountOverviewMock = vi.fn();
const getNegativeBalanceThresholdCentsMock = vi.fn();
const sendNegativeBalanceAlertMock = vi.fn();
vi.mock('./accounts.service', async () => {
  // `balanceBand`/`bandWorsened` are pure (no I/O) — keep the REAL
  // implementation so the alert tests exercise the actual band-comparison
  // logic (Dev Notes: this story must reuse it verbatim, never reimplement
  // it) while the DB/email-touching exports are test doubles.
  const actual = await vi.importActual<typeof import('./accounts.service')>('./accounts.service');
  return {
    ...actual,
    getAccountOverview: (...args: unknown[]) => getAccountOverviewMock(...args),
    getNegativeBalanceThresholdCents: (...args: unknown[]) => getNegativeBalanceThresholdCentsMock(...args),
    sendNegativeBalanceAlert: (...args: unknown[]) => sendNegativeBalanceAlertMock(...args),
  };
});

const getEffectiveRateMock = vi.fn();
vi.mock('./rates.service', () => ({
  getEffectiveRate: (...args: unknown[]) => getEffectiveRateMock(...args),
}));

const getEffectiveInstructorRateMock = vi.fn();
vi.mock('./instructor-rates.service', () => ({
  getEffectiveInstructorRate: (...args: unknown[]) => getEffectiveInstructorRateMock(...args),
}));

// Story 19.9 — the requirements are evaluated by `requirements.service.ts`,
// mocked at the module boundary (its own rules: `requirements.service.test.ts`;
// importing it would drag currency/membership/expiries and `@/lib/env` in).
// This file proves the POLICY flights.service asks for — which blocks, for
// whom, on which day — and what it does with the answer. The 422 is the real
// `ValidationError` of the shared contract.
const evaluateRequirementsMock = vi.fn();
vi.mock('./requirements.service', async () => {
  const { ValidationError } = await import('./errors');
  return {
    evaluateRequirements: (...args: unknown[]) => evaluateRequirementsMock(...args),
    throwRequirementsNotMet: (failures: unknown[]) => {
      throw new ValidationError('Requirements not met.', { failures }, 'REQUIREMENTS_NOT_MET');
    },
  };
});

const { prisma } = await import('@/server/db/prisma');
const { listFlights, getFlightTotals, registerFlight, deleteFlight, updateFlight } = await import('./flights.service');
const { ROLE_PERMISSIONS } = await import('@/server/auth/rbac');
const { NotFoundError, ConflictError } = await import('./errors');

const aircraftFindUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const aircraftUpdateMock = vi.mocked(prisma.aircraft.update);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const accountMovementFindUniqueMock = vi.mocked(prisma.accountMovement.findUnique);
const accountMovementUpdateMock = vi.mocked(prisma.accountMovement.update);
const accountMovementDeleteMock = vi.mocked(prisma.accountMovement.delete);
const flightDeleteMock = vi.mocked(prisma.flight.delete);
const flightCreateMock = vi.mocked(prisma.flight.create);
const flightFindUniqueMock = vi.mocked(prisma.flight.findUnique);
const flightFindFirstMock = vi.mocked(prisma.flight.findFirst);
const flightUpdateMock = vi.mocked(prisma.flight.update);
const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const flightCountMock = vi.mocked(prisma.flight.count);
const flightAggregateMock = vi.mocked(prisma.flight.aggregate);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as every other `*.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const aircraftFindUnique = aircraftFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const personFindUnique = personFindUniqueMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockResolvedValueOnce: (v: Fixture) => { mockResolvedValueOnce: (v: Fixture) => void };
};
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementAggregate = accountMovementAggregateMock as unknown as {
  mockResolvedValue: (v: { _sum: { amountCents: number | null } }) => void;
  mockResolvedValueOnce: (v: { _sum: { amountCents: number | null } }) => {
    mockResolvedValueOnce: (v: { _sum: { amountCents: number | null } }) => void;
  };
};
const accountMovementFindUnique = accountMovementFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementCreate = accountMovementCreateMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockRejectedValueOnce: (v: unknown) => { mockResolvedValueOnce: (v: Fixture) => void };
};
const flightCreate = flightCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindUnique = flightFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindFirst = flightFindFirstMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockResolvedValueOnce: (v: Fixture) => { mockResolvedValueOnce: (v: Fixture) => void };
};
const flightUpdate = flightUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindMany = flightFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightCount = flightCountMock as unknown as { mockResolvedValue: (v: number) => void };
const flightAggregate = flightAggregateMock as unknown as {
  mockResolvedValue: (v: {
    _count: { _all: number };
    _sum: { minutes: number | null; takeoffs: number | null; landings: number | null; aircraftAmountCents: number | null; instructorAmountCents: number | null };
  }) => void;
};
const queryRaw = queryRawMock as unknown as {
  mockResolvedValueOnce: (v: unknown[]) => {
    mockResolvedValueOnce: (v: unknown[]) => { mockResolvedValueOnce: (v: unknown[]) => void };
  };
};

/** Same batch/interactive `$transaction` stand-in as `accounts.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(personId: string | null = 'person_1'): Actor {
  return { userId: 'pilot_1', personId, roles: ['PILOT'] };
}

function instructorActor(): Actor {
  return { userId: 'instructor_1', personId: 'person_instructor', roles: ['INSTRUCTOR'] };
}

function studentActor(): Actor {
  return { userId: 'student_1', personId: 'person_2', roles: ['STUDENT'] };
}

// Story AOG-1a (P2): `resolveFlightInput`'s select now READS the aircraft's
// operational state — before this story it selected `{ id, registration,
// archivedAt }` only, which is precisely why a flight on a grounded aircraft
// went through untouched.
const AIRCRAFT = { id: 'aircraft_1', registration: 'I-ABCD', archivedAt: null, status: 'OPERATIONAL' as const, statusReason: null, outOfServiceUntil: null };
/** The same airframe, grounded, with an expected return date on file. */
const AOG_AIRCRAFT = {
  ...AIRCRAFT,
  status: 'OUT_OF_SERVICE' as const,
  statusReason: 'Revisione 100h',
  outOfServiceUntil: new Date(Date.UTC(2031, 4, 12)),
};
const PILOT_PERSON = {
  id: 'person_1',
  firstName: 'Mario',
  lastName: 'Rossi',
  email: 'mario@example.com',
  archivedAt: null,
  pilotProfile: { deactivatedAt: null },
  studentProfile: null,
};
// `firstName`/`lastName`: the instructor's NAME travels to the requirements
// (story 19.9) — every other test using this fixture ignores them.
const INSTRUCTOR_PROFILE_ROW = {
  firstName: 'Anna',
  lastName: 'Bianchi',
  archivedAt: null,
  instructorProfile: { id: 'instr_profile_1', deactivatedAt: null },
};

const ACCOUNT_OVERVIEW = { account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') }, balanceCents: 0, recentMovements: [] };

const CREATED_FLIGHT_ROW = {
  id: 'flight_1',
  flightDate: new Date('2020-01-15T00:00:00.000Z'),
  flightType: 'TOURISM' as const,
  isSolo: false,
  noCharge: false,
  departureAirfield: 'Base Airfield',
  arrivalAirfield: 'Base Airfield',
  takeoffAt: new Date('2020-01-15T10:00:00.000Z'),
  landingAt: new Date('2020-01-15T11:20:00.000Z'),
  minutes: 80,
  takeoffs: 1,
  landings: 1,
  aircraftRateCentsPerHour: 15000,
  aircraftPriceCategory: 'PILOT' as const,
  aircraftAmountCents: 20000,
  instructorRateCentsPerHour: null,
  instructorAmountCents: null,
  createdAt: new Date('2020-01-15T10:00:00.000Z'),
  aircraft: { id: 'aircraft_1', registration: 'I-ABCD' },
  person: { id: 'person_1', firstName: 'Mario', lastName: 'Rossi' },
  instructorProfile: null,
  actorUser: { email: 'staff@airmanager.local' },
};

// Story 19.6 — `updateFlight`'s pre-read of the flight being edited: the
// identity its exemptions key on (type R-14.3-a, person/instructor/date
// R-14.4-b, aircraft AOG-1a, price category Q-19.3-b) and, since story 19.9,
// `isSolo` and the current charge (currency and balance of an edit).
const ORIGINAL_FLIGHT_ROW = {
  aircraftId: 'aircraft_1',
  personId: 'person_1',
  flightDate: new Date('2020-01-15T00:00:00.000Z'),
  flightType: 'TOURISM' as const,
  isSolo: false,
  aircraftPriceCategory: 'PILOT' as const,
  instructorProfile: null as { personId: string } | null,
  charge: { amountCents: -20000 } as { amountCents: number } | null,
  updatedAt: new Date('2020-01-15T12:00:00.000Z'),
};

/** `updateFlight`'s `Flight` lock row when nothing changed since the pre-read (review 19.6 F3: same `updatedAt`). */
const LOCKED_FLIGHT = { aircraftId: 'aircraft_1', updatedAt: ORIGINAL_FLIGHT_ROW.updatedAt };

/** The flight's one `FLIGHT_CHARGE` (`loadFlightCharge`'s shape) — no manual adjustment points at it. */
const CHARGE_ROW = { id: 'movement_orig', accountId: 'account_1', reversal: null as { id: string } | null };

/**
 * Composes `takeoffAt`/`landingAt` ISO instants (story 11.1) that derive
 * EXACTLY `minutes` on the given `dateOnly` (UTC calendar day) — `10:00Z`
 * is comfortably clear of the Europe/Rome midnight boundary in both CET
 * (+1h) and CEST (+2h), so the derived Roma-zone `flightDate` always equals
 * `dateOnly` unless a test deliberately picks a boundary-crossing time.
 */
function buildTimes(dateOnly: string, minutes: number, takeoffTimeUtc = '10:00'): { takeoffAt: string; landingAt: string } {
  const takeoffAt = `${dateOnly}T${takeoffTimeUtc}:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString();
  return { takeoffAt, landingAt };
}

// Safely in the past no matter when this suite runs (same `PAST_DATE`
// convention as the e2e specs) — `registerFlight`'s `FLIGHT_DATE_IN_FUTURE`
// guard compares against the REAL server clock, so a fixed past date keeps
// every "happy path" test below independent of wall-clock time.
const BASE_INPUT = registerFlightSchema.parse({
  aircraftId: 'aircraft_1',
  personId: 'person_1',
  departureAirfield: 'Base Airfield',
  arrivalAirfield: 'Base Airfield',
  flightType: 'TOURISM',
  ...buildTimes('2020-01-15', 80),
});

describe('flights.service (story 5.1 — flight logging with automatic charges, FR-9/FR-14/FR-15)', () => {
  beforeEach(() => {
    aircraftFindUniqueMock.mockReset();
    aircraftUpdateMock.mockReset();
    personFindUniqueMock.mockReset();
    accountUpsertMock.mockReset();
    accountMovementAggregateMock.mockReset();
    accountMovementCreateMock.mockReset();
    accountMovementFindUniqueMock.mockReset();
    accountMovementUpdateMock.mockReset();
    accountMovementDeleteMock.mockReset();
    flightDeleteMock.mockReset();
    flightCreateMock.mockReset();
    flightFindUniqueMock.mockReset();
    flightFindFirstMock.mockReset();
    flightUpdateMock.mockReset();
    flightFindManyMock.mockReset();
    flightCountMock.mockReset();
    flightAggregateMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    getAccountOverviewMock.mockReset();
    getNegativeBalanceThresholdCentsMock.mockReset();
    sendNegativeBalanceAlertMock.mockReset();
    getEffectiveRateMock.mockReset();
    getEffectiveInstructorRateMock.mockReset();
    evaluateRequirementsMock.mockReset();

    getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    getNegativeBalanceThresholdCentsMock.mockResolvedValue(-20000);
    getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
    // Story 19.9 default: every requirement met — the tests that do not care
    // about them keep passing unmodified; the dedicated describe blocks
    // below override it per test.
    evaluateRequirementsMock.mockResolvedValue([]);
    // Story 16.2 default: no overlapping flight — every PRE-EXISTING test in
    // this file keeps passing unmodified; the dedicated describe block below
    // overrides it per test.
    flightFindFirst.mockResolvedValue(null);
    mockTransaction();
  });

  describe('registerFlight — authorization (AD-5, FR-14)', () => {
    it.each([
      ['a pilot', pilotActor()],
      ['an instructor', instructorActor()],
      ['a student', studentActor()],
    ])('rejects %s (flights.manage required), before touching the DB', async (_label, actor) => {
      await expect(registerFlight(actor, BASE_INPUT)).rejects.toThrow(ForbiddenError);
      expect(aircraftFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  describe('registerFlight — guards (Dev Notes order: existence 404 -> state 422 -> domain 422)', () => {
    it('throws NotFoundError for an unknown aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toThrow(NotFoundError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown person', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(null);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 AIRCRAFT_ARCHIVED for an archived aircraft', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AIRCRAFT, archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // --- story AOG-1a (ratifica R-AOG-c), story 19.9 (D-2/D-3) ------------------
    // A grounded aircraft is no longer a 422 of its own on a flight: it is the
    // FIRST failure of `REQUIREMENTS_NOT_MET`, evaluated AFTER every hard guard.

    it('an aircraft that is BOTH archived and grounded answers AIRCRAFT_ARCHIVED — state before requirements', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('a grounded aircraft for an archived person answers PERSON_ARCHIVED — the hard guard first (AC 7)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, archivedAt: new Date('2026-01-01T00:00:00.000Z') });

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_ARCHIVED' });
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('a FUTURE-dated flight on a grounded aircraft answers FLIGHT_DATE_IN_FUTURE — «Procedi comunque» never lands on an error it cannot cover (AC 7, D-3)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const future = new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes(future, 60) });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_DATE_IN_FUTURE' });
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('throws a 422 PERSON_ARCHIVED for an archived person', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, archivedAt: new Date('2026-01-01T00:00:00.000Z') });

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 PERSON_NOT_PILOT_OR_STUDENT when neither profile is active', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, pilotProfile: null, studentProfile: null });

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_NOT_PILOT_OR_STUDENT' });
    });

    it('throws a 422 PERSON_NOT_PILOT_OR_STUDENT when the only profile is DEACTIVATED', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({
        ...PILOT_PERSON,
        pilotProfile: { deactivatedAt: new Date('2026-01-01T00:00:00.000Z') },
        studentProfile: null,
      });

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_NOT_PILOT_OR_STUDENT' });
    });

    // Story 14.3 (AC 1/5, ratifica R1): a person with only an active STUDENT
    // profile (no active pilot profile) may only log SCHOOL flights — this
    // used to be accepted as a plain TOURISM flight (pre-14.3 test), now a
    // dedicated 422.
    it('throws a 422 STUDENT_FLIGHT_MUST_BE_SCHOOL for a person with only an active STUDENT profile on a non-SCHOOL flight', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({
        ...PILOT_PERSON,
        pilotProfile: null,
        studentProfile: { deactivatedAt: null },
      });

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'STUDENT_FLIGHT_MUST_BE_SCHOOL' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('accepts a person with only an active STUDENT profile on a SCHOOL flight WITH an instructor', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique
        .mockResolvedValueOnce({ ...PILOT_PERSON, pilotProfile: null, studentProfile: { deactivatedAt: null } })
        .mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL' });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
    });

    it('accepts a TOURISM flight for a person with BOTH an active pilot AND an active student profile (double profile, unrestricted)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({
        ...PILOT_PERSON,
        pilotProfile: { deactivatedAt: null },
        studentProfile: { deactivatedAt: null },
      });
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);

      await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
      // Story 19.3 (D-4/D-5): both profiles active (legacy data) reads as a pilot.
      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aircraftPriceCategory: 'PILOT' }) }));
    });

    // Ratifica R-14.3-b (PO, 2026-07-29): "un pilota deve poter essere
    // abilitato a un volo SCUOLA (es. riprese volo per la currency, rinnovo
    // SEP)". The STUDENT_FLIGHT_MUST_BE_SCHOOL guard only constrains a
    // person with an active STUDENT profile and NO active pilot profile — a
    // plain pilot (active pilot profile, no active student profile, PILOT_PERSON's
    // own shape) logging a SCHOOL flight with an instructor is untouched by
    // this story. Mechanically already covered by the instructor-required
    // tests further below; this test documents the domain scenario
    // explicitly, as ratified.
    it('accepts a PILOT (no active student profile) on a SCHOOL flight WITH an instructor — currency/SEP renewal, ratifica R-14.3-b', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL' });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
    });

    it('throws a 422 FLIGHT_DATE_IN_FUTURE for a flight date after today (Europe/Rome calendar, story 16.1)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      // Always in the future, regardless of when this suite runs.
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('9999-12-31', 80) });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_DATE_IN_FUTURE' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("accepts today's date (the boundary itself is valid, not just strictly-past dates)", async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes(toDateOnlyString(todayDateOnlyUtcInZone(APP_TIMEZONE)), 80) });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
    });

    // Story 16.1, AC 2 — discriminant: the FLIGHT_DATE_IN_FUTURE guard used
    // to compare the Roma-calendar `flightDate` against a UTC "today", so a
    // flight that had already landed inside the 00:00-02:00 Roma window was
    // rejected as "in the future" (ops-audit F1). These two reproduce the
    // exact clock/instants the audit measured, in both DST regimes.
    describe('the 00:00-02:00 Rome window (Europe/Rome "today", story 16.1 AC 2)', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it('accepts a flight that took off 00:10 Rome and landed 00:20 Rome, registered at 01:00 Rome (CEST, summer)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T23:00:00.000Z')); // 01:00 CEST, 15 Jul — registration instant
        aircraftFindUnique.mockResolvedValue(AIRCRAFT);
        personFindUnique.mockResolvedValue(PILOT_PERSON);
        accountUpsert.mockResolvedValue({ id: 'account_1' });
        accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
        accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
        flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
        queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
        const input = registerFlightSchema.parse({
          ...BASE_INPUT,
          takeoffAt: '2026-07-14T22:10:00.000Z', // 00:10 Rome, 15 Jul
          landingAt: '2026-07-14T22:20:00.000Z', // 00:20 Rome, 15 Jul
        });

        await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
      });

      it('accepts a flight that took off 00:05 Rome and landed 00:20 Rome, registered at 00:30 Rome (CET, winter)', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-14T23:30:00.000Z')); // 00:30 CET, 15 Jan — registration instant
        aircraftFindUnique.mockResolvedValue(AIRCRAFT);
        personFindUnique.mockResolvedValue(PILOT_PERSON);
        accountUpsert.mockResolvedValue({ id: 'account_1' });
        accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
        accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
        flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
        queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
        const input = registerFlightSchema.parse({
          ...BASE_INPUT,
          takeoffAt: '2026-01-14T23:05:00.000Z', // 00:05 Rome, 15 Jan
          landingAt: '2026-01-14T23:20:00.000Z', // 00:20 Rome, 15 Jan
        });

        await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
      });
    });

    it('throws a 422 FLIGHT_TIMES_INVALID when landingAt <= takeoffAt', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        takeoffAt: '2020-01-15T10:00:00.000Z',
        landingAt: '2020-01-15T10:00:00.000Z',
      });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_TIMES_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // Story 16.2 (F14, AC 17) — the audit's probe 17: 09:00:00Z -> 09:00:20Z
    // used to be ACCEPTED and stored as a 1-minute flight, because a
    // `Math.max(1, …)` rounded the derived 0 up. The lower bound of the
    // duration now lives next to the upper one, with the same code.
    it('throws a 422 FLIGHT_TIMES_INVALID for a sub-minute duration (20s), instead of rounding it up to 1 minute (story 16.2, F14)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        takeoffAt: '2020-01-15T09:00:00.000Z',
        landingAt: '2020-01-15T09:00:20.000Z',
      });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_TIMES_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('accepts a duration of exactly one minute (the new lower boundary itself is valid) and derives minutes = 1', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 1 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        takeoffAt: '2020-01-15T09:00:00.000Z',
        landingAt: '2020-01-15T09:01:00.000Z',
      });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ minutes: 1 }) }));
    });

    it('throws a 422 FLIGHT_TIMES_INVALID when the derived duration exceeds 1440 minutes (24h)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 1441) });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_TIMES_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('accepts a derived duration of exactly 1440 minutes (the boundary itself is valid)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 1440 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 1440) });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
    });

    it('derives minutes as round((landingAt - takeoffAt) / 60000)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 50 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 50) });

      await registerFlight(adminActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ minutes: 50 }) }));
    });

    it('derives flightDate as the Europe/Rome calendar day of takeoffAt, not the UTC day (a 00:30 Roma takeoff is 23:30Z the day before)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 40 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      // 2020-01-15T23:30Z is 2020-01-16T00:30 in Europe/Rome (CET, +1h in January).
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        takeoffAt: '2020-01-15T23:30:00.000Z',
        landingAt: '2020-01-16T00:10:00.000Z',
      });

      await registerFlight(adminActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ flightDate: new Date('2020-01-16'), minutes: 40 }) }),
      );
    });

    it('throws a 422 SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR for a SCHOOL flight with no instructor', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // Story 14.3 (AC 4/5): the instructor requirement is unchanged by this
    // story — it does NOT look at `isSolo`, so a SOLO SCHOOL flight with no
    // instructor rejects with the SAME pre-existing code as a dual one.
    it('throws a 422 SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR for a SOLO SCHOOL flight with no instructor (AC 4 invariant)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: true });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // Story 9.4 (AC 1): isSolo is only meaningful on a SCHOOL flight.
    it('throws a 422 SOLO_REQUIRES_SCHOOL when isSolo=true on a non-SCHOOL flight', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'TOURISM', isSolo: true });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'SOLO_REQUIRES_SCHOOL' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('accepts isSolo=true on a SCHOOL flight WITH an instructor (the student is PIC, but the instructor is still required)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL', isSolo: true });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: true, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isSolo: true }) }));
    });

    it('throws a 422 INSTRUCTOR_SAME_AS_PILOT when instructorPersonId === personId', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_1' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_SAME_AS_PILOT' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 INSTRUCTOR_NOT_FOUND when the instructor person is unknown', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(null);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 INSTRUCTOR_NOT_FOUND when the instructor profile is DEACTIVATED', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique
        .mockResolvedValueOnce(PILOT_PERSON)
        .mockResolvedValueOnce({
          archivedAt: null,
          instructorProfile: { id: 'instr_profile_1', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') },
        });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
    });

    it('throws a 422 INSTRUCTOR_NOT_FOUND (folded, anti-enumeration) when the instructor Person is ARCHIVED, even with an active InstructorProfile (TD-1, AC 9)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique
        .mockResolvedValueOnce(PILOT_PERSON)
        .mockResolvedValueOnce({
          archivedAt: new Date('2026-01-01T00:00:00.000Z'),
          instructorProfile: { id: 'instr_profile_1', deactivatedAt: null },
        });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 NO_AIRCRAFT_RATE when the aircraft has no rate in effect', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue(null);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'NO_AIRCRAFT_RATE' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 NO_INSTRUCTOR_RATE when the instructor has no rate in effect', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue(null);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'NO_INSTRUCTOR_RATE' });
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  describe('registerFlight — cost calculation (AD-2/NFR-5)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    it('80 minutes at 150 €/h (15000 cents/h) -> 20000 cents (the PRD-testable case)', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });

      await registerFlight(adminActor(), BASE_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 20000 }) }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountCents: -20000 }) }),
      );
    });

    it('30 minutes at 333 cents/h -> Math.round(166.5) = 167 (half-up)', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 333, pilotPriceCents: 333 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 30) });

      await registerFlight(adminActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 167 }) }),
      );
    });

    it('separate rounding: sum of two independently rounded amounts, NOT a round of the combined rate', async () => {
      // 50' @ 100 c/h -> 83.33 -> 83; 50' @ 101 c/h -> 84.166 -> 84; sum = 167.
      // A naive round((100+101)*50/60) would give round(167.5) = 168 instead.
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 100, pilotPriceCents: 100 });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 101 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 50), instructorPersonId: 'person_instructor' });

      await registerFlight(adminActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ aircraftAmountCents: 83, instructorAmountCents: 84 }),
        }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountCents: -167 }) }),
      );
    });
  });

  // Story 19.3 (R-19-e, AC 9): the aircraft price is the column of the
  // flying person's PROFILE, frozen on the flight with the category.
  describe('registerFlight — price from the profile (story 19.3, AC 9)', () => {
    const STUDENT_PERSON = { ...PILOT_PERSON, pilotProfile: null, studentProfile: { deactivatedAt: null } };
    const SCHOOL_INPUT = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 60), flightType: 'SCHOOL', instructorPersonId: 'person_instructor' });

    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 10000, pilotPriceCents: 15000 });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 4000 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    function createdData(): Record<string, unknown> {
      return (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    }

    it('a student-only person on a SCHOOL flight pays the STUDENT price', async () => {
      personFindUnique.mockResolvedValueOnce(STUDENT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);

      await registerFlight(adminActor(), SCHOOL_INPUT);

      expect(createdData()).toMatchObject({ aircraftRateCentsPerHour: 10000, aircraftPriceCategory: 'STUDENT', aircraftAmountCents: 10000 });
    });

    it('a pilot on a TOURISM flight pays the PILOT price', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 60) });

      await registerFlight(adminActor(), input);

      expect(createdData()).toMatchObject({ aircraftRateCentsPerHour: 15000, aircraftPriceCategory: 'PILOT', aircraftAmountCents: 15000 });
    });

    it('a pilot on a SCHOOL flight with an instructor still pays the PILOT price (R-19-e to the letter)', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);

      await registerFlight(adminActor(), SCHOOL_INPUT);

      expect(createdData()).toMatchObject({ aircraftRateCentsPerHour: 15000, aircraftPriceCategory: 'PILOT', aircraftAmountCents: 15000 });
    });

    it('both profiles active (legacy data, D-4) reads as a pilot', async () => {
      personFindUnique
        .mockResolvedValueOnce({ ...PILOT_PERSON, studentProfile: { deactivatedAt: null } })
        .mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);

      await registerFlight(adminActor(), SCHOOL_INPUT);

      expect(createdData()).toMatchObject({ aircraftRateCentsPerHour: 15000, aircraftPriceCategory: 'PILOT' });
    });

    it('the DTO carries the frozen category in the breakdown', async () => {
      personFindUnique.mockResolvedValueOnce(STUDENT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, aircraftRateCentsPerHour: 10000, aircraftPriceCategory: 'STUDENT' });

      const result = await registerFlight(adminActor(), SCHOOL_INPUT);

      expect(result.flight.breakdown.aircraftPriceCategory).toBe('STUDENT');
      expect(result.flight.breakdown.aircraftRateCentsPerHour).toBe(10000);
    });
  });

  describe('registerFlight — the transaction (AC 1/2: Flight + movement(-total))', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    it('creates the Flight snapshot and the FLIGHT_CHARGE movement linked via flightId inside one transaction — and never writes the Aircraft row (story 19.2)', async () => {
      await registerFlight(adminActor(), BASE_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aircraftId: 'aircraft_1',
            personId: 'person_1',
            instructorProfileId: null,
            flightType: 'TOURISM',
            minutes: 80,
            aircraftRateCentsPerHour: 15000,
            aircraftAmountCents: 20000,
            instructorRateCentsPerHour: null,
            instructorAmountCents: null,
            actorUserId: 'admin_1',
          }),
        }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'account_1',
            type: 'FLIGHT_CHARGE',
            amountCents: -20000,
            flightId: 'flight_1',
            effectiveDate: new Date('2020-01-15'),
            actorUserId: 'admin_1',
          }),
        }),
      );
      expect(aircraftUpdateMock).not.toHaveBeenCalled();
    });

    it('locks the Aircraft row (FOR UPDATE) inside the transaction', async () => {
      await registerFlight(adminActor(), BASE_INPUT);

      expect(queryRawMock).toHaveBeenCalledTimes(2);
      const [firstStrings] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray];
      expect(firstStrings.join('?')).toContain('FOR UPDATE');
      expect(firstStrings.join('?')).toContain('Aircraft');
    });

    it('locks the Account row (FOR UPDATE) inside the transaction (recordAdjustment pattern)', async () => {
      await registerFlight(adminActor(), BASE_INPUT);

      const [secondStrings] = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray];
      expect(secondStrings.join('?')).toContain('FOR UPDATE');
      expect(secondStrings.join('?')).toContain('Account');
    });

    it('returns the flight DTO (with breakdown) plus the refreshed account overview', async () => {
      const result = await registerFlight(adminActor(), BASE_INPUT);

      expect(result.flight.id).toBe('flight_1');
      expect(result.flight.breakdown).toEqual({
        aircraftRateCentsPerHour: 15000,
        aircraftPriceCategory: 'PILOT',
        aircraftAmountCents: 20000,
        totalAmountCents: 20000,
      });
      expect(result.account).toEqual(ACCOUNT_OVERVIEW);
      expect(getAccountOverviewMock).toHaveBeenCalledWith(adminActor(), 'person_1');
    });

    it('effectiveDate on the movement equals the flight date', async () => {
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-02-01', 80) });
      await registerFlight(adminActor(), input);

      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveDate: new Date('2020-02-01') }) }),
      );
    });
  });

  describe('registerFlight — H3 fix (docs/security/owasp-audit-2026-07-22.md): the flight already committed by the time the post-commit account re-read runs', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    it('does NOT throw when the post-commit `getAccountOverview` re-read fails — degrades to the balance already computed inside the transaction', async () => {
      getAccountOverviewMock.mockRejectedValueOnce(new Error('transient read failure'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await registerFlight(adminActor(), BASE_INPUT);

      // The flight + charge write already happened — exactly once — before
      // the failing read.
      expect(flightCreateMock).toHaveBeenCalledTimes(1);
      expect(accountMovementCreateMock).toHaveBeenCalledTimes(1);
      // Degraded but correct: the balance the transaction itself computed
      // (0 - 20000 = -20000 for this 80-min/15000-cents-per-hour flight),
      // never a throw that would have freed the caller's Idempotency-Key
      // (`apiRoute`'s AC 4) and let a retry double-register the flight.
      expect(result.account).toEqual({
        account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        balanceCents: -20000,
        recentMovements: [],
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('registerFlight: post-commit account overview read failed', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('registerFlight — with an instructor (AC 1/2)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    it('adds the instructor charge to the total and snapshots instructor* fields (non-null)', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({
        ...CREATED_FLIGHT_ROW,
        instructorRateCentsPerHour: 10000,
        instructorAmountCents: 13333,
        instructorProfile: { person: { id: 'person_instructor', firstName: 'Luca', lastName: 'Verdi' } },
      });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      const result = await registerFlight(adminActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            instructorProfileId: 'instr_profile_1',
            instructorRateCentsPerHour: 10000,
            instructorAmountCents: 13333,
          }),
        }),
      );
      // aircraft 20000 + instructor 13333 = 33333.
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountCents: -33333 }) }),
      );
      expect(result.flight.instructor).toEqual({ personId: 'person_instructor', firstName: 'Luca', lastName: 'Verdi' });
      expect(result.flight.breakdown.instructorRateCentsPerHour).toBe(10000);
      expect(result.flight.breakdown.instructorAmountCents).toBe(13333);
      expect(result.flight.breakdown.totalAmountCents).toBe(33333);
    });

    it('a SCHOOL flight with an instructor succeeds (instructor mandatory, not merely allowed)', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL', instructorRateCentsPerHour: 10000, instructorAmountCents: 13333 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
    });

    // Story 9.4 (AC 1): "stesso importo istruttore su DC e solista a parità di
    // durata/tariffa" — isSolo is metadata only, never a monetary branch.
    it('charges the SAME aircraft/instructor amounts for a dual and a solo SCHOOL flight at the same rate/duration', async () => {
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });

      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL', isSolo: false });
      const dualInput = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: false, instructorPersonId: 'person_instructor' });
      await registerFlight(adminActor(), dualInput);

      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL', isSolo: true });
      const soloInput = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: true, instructorPersonId: 'person_instructor' });
      await registerFlight(adminActor(), soloInput);

      expect(flightCreateMock).toHaveBeenCalledTimes(2);
      const dualData = (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      const soloData = (flightCreateMock.mock.calls[1]?.[0] as { data: Record<string, unknown> }).data;
      expect(dualData['isSolo']).toBe(false);
      expect(soloData['isSolo']).toBe(true);
      expect(dualData['instructorAmountCents']).toBe(soloData['instructorAmountCents']);
      expect(dualData['aircraftAmountCents']).toBe(soloData['aircraftAmountCents']);
    });

    it('an instructor is allowed (never required) on a TOURISM flight (e.g. a checkride)', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, instructorRateCentsPerHour: 10000, instructorAmountCents: 13333 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'TOURISM', instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
    });
  });

  describe('registerFlight — without an instructor', () => {
    it('instructor* snapshot fields are null and the DTO has instructor: null', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);

      const result = await registerFlight(adminActor(), BASE_INPUT);

      expect(getEffectiveInstructorRateMock).not.toHaveBeenCalled();
      expect(result.flight.instructor).toBeNull();
      expect(result.flight.breakdown.instructorRateCentsPerHour).toBeUndefined();
      expect(result.flight.breakdown.instructorAmountCents).toBeUndefined();
    });
  });

  describe('registerFlight — negative-balance band alert (FR-27, reuses accounts.service verbatim)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    // Note: no microtask-flush wait is needed here — unlike
    // `accounts.service.test.ts` (which exercises the REAL
    // `sendNegativeBalanceAlert`, an async function with its own internal
    // `await`s), this suite mocks `sendNegativeBalanceAlert` itself: the
    // `void sendNegativeBalanceAlertMock(...)` call inside `registerFlight`
    // happens synchronously, before its returned promise resolves.

    it('ok -> negative (a 20000-cent charge crossing zero) sends the alert, post-commit, AND flags the in-app operator signal (story 14.4, AC 3)', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 5000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: -15000 });

      const result = await registerFlight(adminActor(), BASE_INPUT);

      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledTimes(1);
      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledWith(
        'person_1',
        expect.objectContaining({ firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com' }),
        -15000,
      );
      // Story 14.4, AC 3 (decision D1) — review F7 (ratifica R-14.4-d): the
      // email above stays gated on the band-worsening transition (UNCHANGED);
      // `balanceAlert` uses the WIDER `hasNegativeBalanceAlert` condition
      // (before<0 OR after<0) — the two coincide on THIS crossing-zero case,
      // but not in general (see the dedicated F7 test below).
      expect(result.balanceAlert).toBe(true);
    });

    it('does NOT send when the band is unchanged (already comfortably positive before and after), and balanceAlert stays false', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 1_000_000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: 980_000 });

      const result = await registerFlight(adminActor(), BASE_INPUT);

      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
      expect(result.balanceAlert).toBe(false);
    });

    // Review F7 (ratifica R-14.4-d) — the exact gap the review found: a
    // charge on an account ALREADY deep in the red, staying in the SAME band
    // (belowThreshold -> belowThreshold, so `bandWorsened` is false and the
    // email stays silent, correctly, D1 unchanged) must still flag the
    // in-app operator signal — the operator staring at the result needs to
    // see red regardless of whether the EMAIL'S band transition fired.
    it('flags balanceAlert even when the band does NOT worsen, as long as the balance is negative before OR after (email stays silent)', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: -100_000 } }); // already belowThreshold (< -20000)
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: -120_000 }); // still belowThreshold after the 20000-cent charge

      const result = await registerFlight(adminActor(), BASE_INPUT);

      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
      expect(result.balanceAlert).toBe(true);
    });
  });

  describe('registerFlight — requirements (story 19.9, CR §4.4; AC 7-10, 12)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    const EXPIRED = { type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating bloccante', expiresAt: '2020-01-14' } as const;
    const LOW_BALANCE = { type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: 0, costCents: 20000 } as const;

    function askedFor(): Record<string, unknown> {
      return evaluateRequirementsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    }

    function createdData(): Record<string, unknown> {
      return (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    }

    it('ONE 422 REQUIREMENTS_NOT_MET carrying the whole list, and the transaction never opens (AC 7)', async () => {
      evaluateRequirementsMock.mockResolvedValue([EXPIRED, LOW_BALANCE]);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'REQUIREMENTS_NOT_MET', details: { failures: [EXPIRED, LOW_BALANCE] } });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('a failing requirement on a flight with no aircraft rate answers NO_AIRCRAFT_RATE — the requirements come after the rates (AC 7, D-3)', async () => {
      evaluateRequirementsMock.mockResolvedValue([EXPIRED]);
      getEffectiveRateMock.mockResolvedValue(null);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'NO_AIRCRAFT_RATE' });
      expect(evaluateRequirementsMock).not.toHaveBeenCalled();
    });

    it('a registration asks for everything, all on the flight day, the cost being the very total the FLIGHT_CHARGE debits (AC 8, D-6)', async () => {
      await registerFlight(adminActor(), BASE_INPUT);

      expect(askedFor()).toEqual({
        expiryDateOnly: '2020-01-15',
        membershipDateOnly: '2020-01-15',
        person: { id: 'person_1', name: 'Mario Rossi', hasActivePilot: true, hasActiveStudent: false, hasActiveInstructor: false },
        instructor: null,
        documents: true,
        currency: { dateOnly: '2020-01-15', excludeFlightId: null },
        balance: { costCents: 20000, creditCents: 0 },
      });
      const charge = (accountMovementCreateMock.mock.calls[0]?.[0] as { data: { amountCents: number } }).data;
      expect(charge.amountCents).toBe(-20000);
    });

    it('a 00:30 Rome takeoff (23:30Z the day before) is judged on that Rome day (AC 8)', async () => {
      await registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-14', 60, '23:30') }));

      expect(askedFor()).toMatchObject({ expiryDateOnly: '2020-01-15', membershipDateOnly: '2020-01-15', currency: { dateOnly: '2020-01-15' } });
    });

    it('a SCHOOL solo is a solo flight — currency asked — and its instructor is NOT on board: no documents nor fee of theirs (R-19-i/R-19-j «a bordo»)', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);

      await registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: true, instructorPersonId: 'person_instructor' }));

      expect(askedFor()).toMatchObject({ instructor: null, currency: { dateOnly: '2020-01-15', excludeFlightId: null } });
    });

    it.each([
      ['a SCHOOL dual flight', { flightType: 'SCHOOL' }],
      ['a TOURISM flight with an instructor (A5, e.g. a checkride)', { flightType: 'TOURISM' }],
    ])('%s: no currency, and the instructor on board is checked by name', async (_label, overrides) => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);

      await registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, ...overrides, instructorPersonId: 'person_instructor' }));

      expect(askedFor()).toMatchObject({ instructor: { personId: 'person_instructor', name: 'Anna Bianchi' }, currency: null, documents: true });
    });

    it('a no-charge flight skips the balance: balance null (AC 12, A9)', async () => {
      await registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, noCharge: true }));

      expect(askedFor()).toMatchObject({ balance: null });
    });

    it('a grounded aircraft is the FIRST failure, before the evaluated ones, with registration, reason and return date (AC 9)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      evaluateRequirementsMock.mockResolvedValue([EXPIRED]);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        code: 'REQUIREMENTS_NOT_MET',
        details: { failures: [{ type: 'AIRCRAFT_OUT_OF_SERVICE', registration: 'I-ABCD', reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' }, EXPIRED] },
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('a grounding with no expected return date carries outOfServiceUntil: null, and one whose date is PAST still counts (only status decides)', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, outOfServiceUntil: null });
      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        details: { failures: [{ type: 'AIRCRAFT_OUT_OF_SERVICE', registration: 'I-ABCD', reason: 'Revisione 100h', outOfServiceUntil: null }] },
      });

      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, outOfServiceUntil: new Date(Date.UTC(2020, 0, 1)) });
      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        details: { failures: [{ type: 'AIRCRAFT_OUT_OF_SERVICE', outOfServiceUntil: '2020-01-01' }] },
      });
    });

    it('an admin derogating (failures + force) registers the flight with the silent stamp — no motivo anywhere (AC 10, A10)', async () => {
      evaluateRequirementsMock.mockResolvedValue([EXPIRED]);

      await expect(registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, force: true }))).resolves.toBeDefined();

      expect(createdData()).toMatchObject({ forcedByUserId: 'admin_1', forcedAt: expect.any(Date) });
      expect(createdData()).not.toHaveProperty('forceReason');
    });

    it('ONE force covers a grounded aircraft AND a failing requirement together, leaving ONE stamp (R-AOG-c)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      evaluateRequirementsMock.mockResolvedValue([EXPIRED]);

      await registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, force: true }));

      expect(flightCreateMock).toHaveBeenCalledTimes(1);
      expect(createdData()).toMatchObject({ forcedByUserId: 'admin_1', forcedAt: expect.any(Date) });
    });

    it('force: true with NOTHING to derogate registers normally and stamps NOTHING ("scavalcato un requisito", not "spuntata una checkbox")', async () => {
      await registerFlight(adminActor(), registerFlightSchema.parse({ ...BASE_INPUT, force: true }));

      expect(createdData()).not.toHaveProperty('forcedAt');
      expect(createdData()).not.toHaveProperty('forcedByUserId');
    });

    it('force by an actor holding flights.manage but NOT requirements.force is a 403 BEFORE any query — aircraft never read, requirements never asked (AC 10, P5)', async () => {
      // No role has flights.manage without requirements.force today (both
      // ADMIN-only): grant it to INSTRUCTOR for this test only.
      const saved = ROLE_PERMISSIONS.INSTRUCTOR;
      ROLE_PERMISSIONS.INSTRUCTOR = [...saved, 'flights.manage'];
      try {
        await expect(registerFlight(instructorActor(), registerFlightSchema.parse({ ...BASE_INPUT, force: true }))).rejects.toThrow(ForbiddenError);
        // The same actor WITHOUT force reaches the reads: the 403 above is the `force` gate, not `flights.manage`.
        await registerFlight(instructorActor(), BASE_INPUT);
      } finally {
        ROLE_PERMISSIONS.INSTRUCTOR = saved;
      }
      expect(aircraftFindUniqueMock).toHaveBeenCalledTimes(1);
      expect(evaluateRequirementsMock).toHaveBeenCalledTimes(1);
    });

    it('a stale forceReason key in the body is stripped by the schema, never a 422 (AD-4)', () => {
      const parsed = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'vecchio client' });

      expect(parsed).not.toHaveProperty('forceReason');
      expect(parsed.force).toBe(true);
    });
  });

  describe('deleteFlight (story 19.6, P2 — R-19-c; AD-2/AD-3; AC 4/5/7/8)', () => {
    /**
     * A transaction client DISTINCT from the global `prisma` mock: the two
     * deletes must run on the `tx` (AC 7), never on a client outside the
     * transaction — with `mockTransaction`'s `tx === prisma` that would be
     * unobservable.
     */
    function txStub(lockedFlight: Array<{ aircraftId: string }> = [{ aircraftId: 'aircraft_1' }], charge: Fixture = CHARGE_ROW) {
      const tx = {
        $queryRaw: vi.fn(async (...args: [TemplateStringsArray, ...unknown[]]) => (args[0].join('?').includes('"Flight"') ? lockedFlight : [])),
        accountMovement: { findUnique: vi.fn(async () => charge), delete: vi.fn(async () => ({})) },
        flight: { delete: vi.fn(async () => ({})) },
      };
      transaction.mockImplementation((fn: unknown) => (fn as (client: unknown) => unknown)(tx));
      return tx;
    }

    it('rejects a non-admin actor with 403 BEFORE any query: no transaction, no lock (AC 4)', async () => {
      await expect(deleteFlight(pilotActor(), 'flight_orig')).rejects.toThrow(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('locks Flight -> Aircraft -> Account, each FOR UPDATE, in that order (AC 8)', async () => {
      const tx = txStub();

      await deleteFlight(adminActor(), 'flight_orig');

      const sql = tx.$queryRaw.mock.calls.map(([strings]) => (strings as TemplateStringsArray).join('?'));
      expect(sql).toHaveLength(3);
      expect(sql[0]).toMatch(/FROM "Flight" WHERE "id" = \? FOR UPDATE/);
      expect(sql[1]).toMatch(/FROM "Aircraft" WHERE "id" = \? FOR UPDATE/);
      expect(sql[2]).toMatch(/FROM "Account" WHERE "id" = \? FOR UPDATE/);
      // The Aircraft locked is the one the Flight lock RETURNED, the Account
      // the one the charge lives on — never values read outside the transaction.
      expect(tx.$queryRaw.mock.calls[1]?.[1]).toBe('aircraft_1');
      expect(tx.$queryRaw.mock.calls[2]?.[1]).toBe('account_1');
    });

    // Review F1: `recordAdjustment` shares ONLY the Account lock with this
    // path — the rettifica check must read after it, or a rettifica committed
    // in between is missed and survives the delete as a stray credit.
    it('reads the charge under the Flight lock, then checks for a manual rettifica AFTER the Account lock (review F1)', async () => {
      const tx = txStub();

      await deleteFlight(adminActor(), 'flight_orig');

      expect(tx.accountMovement.findUnique).toHaveBeenCalledTimes(2);
      expect(tx.accountMovement.findUnique.mock.invocationCallOrder[0]!).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[2]!);
      expect(tx.$queryRaw.mock.invocationCallOrder[2]!).toBeLessThan(tx.accountMovement.findUnique.mock.invocationCallOrder[1]!);
      expect(tx.accountMovement.findUnique.mock.invocationCallOrder[1]!).toBeLessThan(tx.accountMovement.delete.mock.invocationCallOrder[0]!);
    });

    it('deletes the charge BEFORE the flight, both on the tx — the RESTRICT FK makes the reverse order fail by design (AC 7)', async () => {
      const tx = txStub();

      await expect(deleteFlight(adminActor(), 'flight_orig')).resolves.toBeUndefined();

      expect(tx.accountMovement.delete).toHaveBeenCalledWith({ where: { id: 'movement_orig' } });
      expect(tx.flight.delete).toHaveBeenCalledWith({ where: { id: 'flight_orig' } });
      expect(tx.accountMovement.delete.mock.invocationCallOrder[0]!).toBeLessThan(tx.flight.delete.mock.invocationCallOrder[0]!);
      expect(accountMovementDeleteMock).not.toHaveBeenCalled();
      expect(flightDeleteMock).not.toHaveBeenCalled();
    });

    it('a Flight lock with 0 rows (unknown, already deleted, or deleted concurrently) answers 404 and writes nothing (AC 4, AC 8)', async () => {
      const tx = txStub([]);

      await expect(deleteFlight(adminActor(), 'flight_orig')).rejects.toThrow(NotFoundError);
      await expect(deleteFlight(adminActor(), 'flight_orig')).rejects.toThrow('Flight not found.');
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(tx.accountMovement.delete).not.toHaveBeenCalled();
      expect(tx.flight.delete).not.toHaveBeenCalled();
    });

    it("409 with today's message when a manual adjustment points at the charge — nothing deleted (D-8, AC 4)", async () => {
      const tx = txStub(undefined, { ...CHARGE_ROW, reversal: { id: 'adj_1' } });

      await expect(deleteFlight(adminActor(), 'flight_orig')).rejects.toThrow(ConflictError);
      await expect(deleteFlight(adminActor(), 'flight_orig')).rejects.toThrow(/already been reversed by a manual adjustment/);
      expect(tx.accountMovement.delete).not.toHaveBeenCalled();
      expect(tx.flight.delete).not.toHaveBeenCalled();
    });

    it('a flight without its charge is a broken invariant: a plain Error, never a half-done delete', async () => {
      const tx = txStub(undefined, null);

      await expect(deleteFlight(adminActor(), 'flight_orig')).rejects.toThrow('Flight flight_orig has no FLIGHT_CHARGE movement.');
      expect(tx.accountMovement.delete).not.toHaveBeenCalled();
      expect(tx.flight.delete).not.toHaveBeenCalled();
    });

    it('is always allowed: no re-validation of person, aircraft (archived, grounded) or date — the resolver is never reached (AC 5)', async () => {
      txStub();
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);

      await expect(deleteFlight(adminActor(), 'flight_orig')).resolves.toBeUndefined();
      expect(aircraftFindUniqueMock).not.toHaveBeenCalled();
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(getEffectiveRateMock).not.toHaveBeenCalled();
    });

    it('reads no balance and sends no alert: deleting a flight only ever gives money back', async () => {
      txStub();

      await deleteFlight(adminActor(), 'flight_orig');

      expect(getNegativeBalanceThresholdCentsMock).not.toHaveBeenCalled();
      expect(accountMovementAggregateMock).not.toHaveBeenCalled();
      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
      expect(aircraftUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe('updateFlight (story 19.6, P3 — R-19-c; AD-2/AD-4; AC 9-15)', () => {
    const UPDATE_INPUT = registerFlightSchema.parse({
      aircraftId: 'aircraft_1',
      personId: 'person_1',
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: 'TOURISM',
      ...buildTimes('2020-01-15', 30),
    });
    const UPDATED_ROW = { ...CREATED_FLIGHT_ROW, id: 'flight_orig', minutes: 30, aircraftAmountCents: 7500 };

    beforeEach(() => {
      flightFindUnique.mockResolvedValue(ORIGINAL_FLIGHT_ROW);
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
      getNegativeBalanceThresholdCentsMock.mockResolvedValue(-20000);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementFindUnique.mockResolvedValue(CHARGE_ROW);
      flightUpdate.mockResolvedValue(UPDATED_ROW);
      queryRaw.mockResolvedValueOnce([LOCKED_FLIGHT]).mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    });

    function updatedFlightData(): Record<string, unknown> {
      return (flightUpdateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    }

    function rawSql(): string[] {
      return queryRawMock.mock.calls.map(([strings]) => (strings as unknown as TemplateStringsArray).join('?'));
    }

    it('rejects a non-admin actor (flights.manage required), before touching the DB', async () => {
      await expect(updateFlight(pilotActor(), 'flight_orig', UPDATE_INPUT)).rejects.toThrow(ForbiddenError);
      expect(flightFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown flight (pre-read), transaction never opens', async () => {
      flightFindUnique.mockResolvedValue(null);

      await expect(updateFlight(adminActor(), 'nope', UPDATE_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // AC 9 — the heart of P3: the SAME rows, nothing created.
    it('rewrites the SAME flight and the SAME charge, creates nothing, and answers with the same id (AC 9)', async () => {
      const result = await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      expect(flightCreateMock).not.toHaveBeenCalled();
      expect(accountMovementCreateMock).not.toHaveBeenCalled();
      expect(flightUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'flight_orig' } }));
      expect(accountMovementUpdateMock).toHaveBeenCalledWith({
        where: { id: 'movement_orig' },
        data: { accountId: 'account_1', amountCents: -7500, description: 'Volo I-ABCD 2020-01-15 — 0:30', effectiveDate: new Date('2020-01-15T00:00:00.000Z') },
      });
      expect(result.flight.id).toBe('flight_orig');
      expect(getAccountOverviewMock).toHaveBeenCalledWith(adminActor(), 'person_1');
    });

    it('writes every input and snapshot column on the flight, noCharge and category included — no actor change, no force stamp (AC 9, D-13)', async () => {
      await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      expect(updatedFlightData()).toEqual({
        aircraftId: 'aircraft_1',
        personId: 'person_1',
        instructorProfileId: null,
        departureAirfield: 'Base Airfield',
        arrivalAirfield: 'Base Airfield',
        takeoffAt: new Date('2020-01-15T10:00:00.000Z'),
        landingAt: new Date('2020-01-15T10:30:00.000Z'),
        flightDate: new Date('2020-01-15T00:00:00.000Z'),
        flightType: 'TOURISM',
        isSolo: false,
        noCharge: false,
        minutes: 30,
        takeoffs: 1,
        landings: 1,
        aircraftRateCentsPerHour: 15000,
        aircraftPriceCategory: 'PILOT',
        aircraftAmountCents: 7500,
        instructorRateCentsPerHour: null,
        instructorAmountCents: null,
      });
      expect(aircraftUpdateMock).not.toHaveBeenCalled();
    });

    // AC 13 — AD-2: the order that makes edit-vs-delete and edit-vs-edit safe.
    it('locks Flight -> Aircraft IN (...) ORDER BY id -> Account IN (...) ORDER BY id, all FOR UPDATE (AC 13)', async () => {
      await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      const sql = rawSql();
      expect(sql).toHaveLength(3);
      expect(sql[0]).toMatch(/FROM "Flight" WHERE "id" = \? FOR UPDATE/);
      expect(sql[1]).toMatch(/FROM "Aircraft" WHERE "id" IN \(\?\) ORDER BY "id" FOR UPDATE/);
      expect(sql[2]).toMatch(/FROM "Account" WHERE "id" IN \(\?\) ORDER BY "id" FOR UPDATE/);
    });

    it('ONE transaction, in order: locks -> overlap guard -> charge read -> account upsert -> Account lock -> rettifica check -> saldo-prima -> flight.update -> charge update -> saldo-dopo', async () => {
      await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      const order = (mock: { mock: { invocationCallOrder: number[] } }, index = 0) => mock.mock.invocationCallOrder[index]!;
      expect(order(queryRawMock, 1)).toBeLessThan(order(flightFindFirstMock));
      expect(order(flightFindFirstMock)).toBeLessThan(order(accountMovementFindUniqueMock));
      expect(order(accountMovementFindUniqueMock)).toBeLessThan(order(accountUpsertMock));
      expect(order(accountUpsertMock)).toBeLessThan(order(queryRawMock, 2));
      // Review F1: the rettifica check reads AFTER the Account lock, the one lock `recordAdjustment` shares.
      expect(order(queryRawMock, 2)).toBeLessThan(order(accountMovementFindUniqueMock, 1));
      expect(order(accountMovementFindUniqueMock, 1)).toBeLessThan(order(accountMovementAggregateMock, 0));
      expect(order(accountMovementAggregateMock, 0)).toBeLessThan(order(flightUpdateMock));
      expect(order(flightUpdateMock)).toBeLessThan(order(accountMovementUpdateMock));
      expect(order(accountMovementUpdateMock)).toBeLessThan(order(accountMovementAggregateMock, 1));
    });

    it('a concurrent delete (Flight lock with 0 rows) answers 404 and writes nothing — never a P2025/500 from the update (AC 13)', async () => {
      queryRawMock.mockReset();
      queryRaw.mockResolvedValueOnce([]);

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).rejects.toThrow('Flight not found.');
      expect(flightFindFirstMock).not.toHaveBeenCalled();
      expect(flightUpdateMock).not.toHaveBeenCalled();
      expect(accountMovementUpdateMock).not.toHaveBeenCalled();
    });

    // Review F3: the exemptions (AOG same aircraft, R-14.4-b, Q-19.3-b) are
    // decided on the pre-read; a concurrent edit committed before this lock
    // was granted changed that identity — never write on top of it.
    it('409 FLIGHT_MODIFIED_CONCURRENTLY when the flight changed between the pre-read and the Flight lock — no further lock, nothing written (review F3)', async () => {
      queryRawMock.mockReset();
      queryRaw.mockResolvedValueOnce([{ aircraftId: 'aircraft_2', updatedAt: new Date('2020-01-15T12:00:00.001Z') }]);

      const attempt = updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      await expect(attempt).rejects.toThrow(ConflictError);
      await expect(attempt).rejects.toMatchObject({ code: 'FLIGHT_MODIFIED_CONCURRENTLY' });
      expect(queryRawMock).toHaveBeenCalledTimes(1);
      expect(flightUpdateMock).not.toHaveBeenCalled();
      expect(accountMovementUpdateMock).not.toHaveBeenCalled();
    });

    it('an aircraft gone under the lock answers 404 and writes nothing (AC 13)', async () => {
      queryRawMock.mockReset();
      queryRaw.mockResolvedValueOnce([LOCKED_FLIGHT]).mockResolvedValueOnce([]);

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).rejects.toThrow('Aircraft not found.');
      expect(flightUpdateMock).not.toHaveBeenCalled();
      expect(accountMovementUpdateMock).not.toHaveBeenCalled();
    });

    it("409 with today's message when a manual adjustment points at the charge — nothing written (D-8)", async () => {
      accountMovementFindUnique.mockResolvedValue({ ...CHARGE_ROW, reversal: { id: 'adj_1' } });

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).rejects.toThrow(/already been reversed by a manual adjustment/);
      expect(flightUpdateMock).not.toHaveBeenCalled();
      expect(accountMovementUpdateMock).not.toHaveBeenCalled();
    });

    // AC 12 — a change of person moves the SAME movement to the new account.
    it('a change of person moves the SAME charge to the new account and locks both accounts in ONE IN (...) query (AC 12)', async () => {
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, id: 'person_2' });
      accountUpsert.mockResolvedValue({ id: 'account_2' });
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, personId: 'person_2' });

      await updateFlight(adminActor(), 'flight_orig', input);

      const accountLock = queryRawMock.mock.calls[2] as unknown as [TemplateStringsArray, ...unknown[]];
      expect(accountLock[0].join('?')).toMatch(/"Account" WHERE "id" IN \(\?\) ORDER BY "id" FOR UPDATE/);
      expect(JSON.stringify(accountLock.slice(1))).toContain('account_1');
      expect(JSON.stringify(accountLock.slice(1))).toContain('account_2');
      expect(accountMovementUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'movement_orig' }, data: expect.objectContaining({ accountId: 'account_2' }) }));
      // Before/after are read on the NEW account (AC 14).
      expect(accountMovementAggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: 'account_2' } }));
      expect(getAccountOverviewMock).toHaveBeenCalledWith(adminActor(), 'person_2');
    });

    it('a move onto another aircraft locks BOTH aircraft in ONE IN (...) ORDER BY id query (AC 13)', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AIRCRAFT, id: 'aircraft_2', registration: 'I-WXYZ' });
      queryRawMock.mockReset();
      queryRaw
        .mockResolvedValueOnce([LOCKED_FLIGHT])
        .mockResolvedValueOnce([{ id: 'aircraft_1' }, { id: 'aircraft_2' }])
        .mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, aircraftId: 'aircraft_2' });

      await updateFlight(adminActor(), 'flight_orig', input);

      const aircraftLock = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray, ...unknown[]];
      expect(aircraftLock[0].join('?')).toMatch(/"Aircraft" WHERE "id" IN \(\?\) ORDER BY "id" FOR UPDATE/);
      expect(JSON.stringify(aircraftLock.slice(1))).toContain('aircraft_1');
      expect(JSON.stringify(aircraftLock.slice(1))).toContain('aircraft_2');
    });

    // AC 14 — the alert compares the real balance before and after the edit.
    it('sends the email when more minutes push the new balance band past the threshold, and flags balanceAlert (AC 14)', async () => {
      accountMovementAggregate.mockResolvedValueOnce({ _sum: { amountCents: 5000 } }).mockResolvedValueOnce({ _sum: { amountCents: -45000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: -45000 });
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, ...buildTimes('2020-01-15', 200) });

      const result = await updateFlight(adminActor(), 'flight_orig', input);

      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledTimes(1);
      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledWith('person_1', expect.objectContaining({ firstName: 'Mario', lastName: 'Rossi' }), -45000);
      expect(result.balanceAlert).toBe(true);
    });

    it('sends nothing when the edit leaves the amount (hence the band) unchanged (AC 14)', async () => {
      accountMovementAggregate.mockResolvedValueOnce({ _sum: { amountCents: -7500 } }).mockResolvedValueOnce({ _sum: { amountCents: -7500 } });

      const result = await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
      // `hasNegativeBalanceAlert`: already red before => the in-app signal stays on, exactly like a registration.
      expect(result.balanceAlert).toBe(true);
    });

    // AC 15 — D-7 (A10): the force stamp is the minimum of audit.
    it('an edit that derogates nothing passes NO forced* field to flight.update — the stamp already on the row stays (AC 10, D-7)', async () => {
      await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

      const data = updatedFlightData();
      expect(data).not.toHaveProperty('forcedAt');
      expect(data).not.toHaveProperty('forcedByUserId');
    });

    it('an edit that derogates (failures + force) rewrites the stamp on the SAME flight row (AC 10, D-7)', async () => {
      evaluateRequirementsMock.mockResolvedValue([{ type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: 0, costCents: 7500 }]);

      await expect(updateFlight(adminActor(), 'flight_orig', registerFlightSchema.parse({ ...UPDATE_INPUT, force: true }))).resolves.toBeDefined();

      expect(updatedFlightData()).toMatchObject({ forcedByUserId: 'admin_1', forcedAt: expect.any(Date) });
    });

    it('a failing requirement on an edit is the same 422, nothing written', async () => {
      evaluateRequirementsMock.mockResolvedValue([{ type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: 0, costCents: 7500 }]);

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).rejects.toMatchObject({ code: 'REQUIREMENTS_NOT_MET' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('422 AIRCRAFT_ARCHIVED when the edited data targets an archived aircraft — re-validates the NEW data, transaction never opens', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_2', registration: 'I-ARCH', archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, aircraftId: 'aircraft_2' });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // --- story AOG-1a, AD-4 (AC 9 of story 19.9): the grounding on an edit ----

    it('an edit that MOVES the flight onto a grounded aircraft lists it as the first failure', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, id: 'aircraft_2', registration: 'I-AOGX' });
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, aircraftId: 'aircraft_2' });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).rejects.toMatchObject({
        code: 'REQUIREMENTS_NOT_MET',
        details: { failures: [{ type: 'AIRCRAFT_OUT_OF_SERVICE', registration: 'I-AOGX', reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' }] },
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('an edit that KEEPS the same aircraft is NOT warned, even though that aircraft is grounded TODAY', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).resolves.toBeDefined();
      expect(updatedFlightData()).not.toHaveProperty('forcedAt');
    });

    it('an ADMIN can derogate an edit that moves the flight onto a grounded aircraft — stamped', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, id: 'aircraft_2', registration: 'I-AOGX' });
      queryRawMock.mockReset();
      queryRaw
        .mockResolvedValueOnce([LOCKED_FLIGHT])
        .mockResolvedValueOnce([{ id: 'aircraft_1' }, { id: 'aircraft_2' }])
        .mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, aircraftId: 'aircraft_2', force: true });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).resolves.toBeDefined();
      expect(updatedFlightData()).toMatchObject({ forcedByUserId: 'admin_1', forcedAt: expect.any(Date) });
    });

    // --- story 19.9, D-8 (AC 11): the policy of an edit -----------------------

    describe('requirements of an edit (story 19.9, D-8, Q-19.9-b)', () => {
      function askedFor(): Record<string, unknown> {
        return evaluateRequirementsMock.mock.calls[0]?.[0] as Record<string, unknown>;
      }

      it('(a) same person, instructor and date: documents and fee skipped (R-14.4-b)', async () => {
        await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

        expect(askedFor()).toMatchObject({ documents: false });
      });

      it.each([
        ['the date', { ...buildTimes('2020-02-20', 30) }],
        ['the person', { personId: 'person_2' }],
      ])('(a) changing %s brings documents and fee back', async (_label, overrides) => {
        await updateFlight(adminActor(), 'flight_orig', registerFlightSchema.parse({ ...UPDATE_INPUT, ...overrides }));

        expect(askedFor()).toMatchObject({ documents: true });
      });

      it('(a) adding an instructor brings documents and fee back — the instructor checked by name', async () => {
        personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
        getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });

        await updateFlight(adminActor(), 'flight_orig', registerFlightSchema.parse({ ...UPDATE_INPUT, instructorPersonId: 'person_instructor' }));

        expect(askedFor()).toMatchObject({ documents: true, instructor: { personId: 'person_instructor', name: 'Anna Bianchi' }, currency: null });
      });

      it('(b) an original solo kept solo, same person and date: currency skipped', async () => {
        await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

        expect(askedFor()).toMatchObject({ currency: null });
      });

      it('(b) an original DUAL made solo: currency asked, without the flight itself', async () => {
        flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, flightType: 'SCHOOL', instructorProfile: { personId: 'person_instructor' } });
        personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
        getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });

        await updateFlight(
          adminActor(),
          'flight_orig',
          registerFlightSchema.parse({ ...UPDATE_INPUT, flightType: 'SCHOOL', isSolo: true, instructorPersonId: 'person_instructor' }),
        );

        expect(askedFor()).toMatchObject({ currency: { dateOnly: '2020-01-15', excludeFlightId: 'flight_orig' }, instructor: null });
      });

      it('(b) a solo moved to another date: currency asked on the NEW date, without the flight itself', async () => {
        await updateFlight(adminActor(), 'flight_orig', registerFlightSchema.parse({ ...UPDATE_INPUT, ...buildTimes('2020-01-10', 30) }));

        expect(askedFor()).toMatchObject({ currency: { dateOnly: '2020-01-10', excludeFlightId: 'flight_orig' } });
      });

      it('(c) [Q-19.9-b = SEMPRE] same person: balance ALWAYS asked, crediting the current charge back — even when the edit lowers the cost', async () => {
        // The original charge is 20000; the edit (30 minutes) costs 7500.
        await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

        expect(askedFor()).toMatchObject({ balance: { costCents: 7500, creditCents: 20000 } });
      });

      it('(c) a no-charge original credits 0 back', async () => {
        flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, charge: { amountCents: 0 } });

        await updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT);

        expect(askedFor()).toMatchObject({ balance: { costCents: 7500, creditCents: 0 } });
      });

      it('(c) another person: nothing credited (the charge moves to their account)', async () => {
        await updateFlight(adminActor(), 'flight_orig', registerFlightSchema.parse({ ...UPDATE_INPUT, personId: 'person_2' }));

        expect(askedFor()).toMatchObject({ balance: { costCents: 7500, creditCents: 0 } });
      });

      it('(c) a no-charge edit skips the balance', async () => {
        await updateFlight(adminActor(), 'flight_orig', registerFlightSchema.parse({ ...UPDATE_INPUT, noCharge: true }));

        expect(askedFor()).toMatchObject({ balance: null });
      });
    });

    // Story 19.3 (Q-19.3-b), ported: editing is not registering anew — an
    // edit that keeps the person keeps the price column the flight was charged.
    describe('price category on an edit (story 19.3, Q-19.3-b)', () => {
      const STUDENT_ORIGINAL = {
        ...ORIGINAL_FLIGHT_ROW,
        flightType: 'SCHOOL' as const,
        aircraftPriceCategory: 'STUDENT' as const,
        instructorProfile: { personId: 'person_instructor' },
      };
      const SCHOOL_EDIT = registerFlightSchema.parse({ ...UPDATE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_instructor' });

      beforeEach(() => {
        flightFindUnique.mockResolvedValue(STUDENT_ORIGINAL);
        getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 10000, pilotPriceCents: 15000 });
        getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 4000 });
      });

      it('same person, now a pilot: the edited flight stays STUDENT at the student price of the flight-date rate', async () => {
        personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);

        await updateFlight(adminActor(), 'flight_orig', SCHOOL_EDIT);

        expect(getEffectiveRateMock).toHaveBeenCalledWith(expect.anything(), 'aircraft_1', new Date('2020-01-15T00:00:00.000Z'));
        expect(updatedFlightData()).toMatchObject({ aircraftPriceCategory: 'STUDENT', aircraftRateCentsPerHour: 10000, aircraftAmountCents: 5000 });
      });

      it("an edit that CHANGES the person to a pilot takes the new person's profile: PILOT", async () => {
        personFindUnique.mockResolvedValueOnce({ ...PILOT_PERSON, id: 'person_2' }).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
        const input = registerFlightSchema.parse({ ...SCHOOL_EDIT, personId: 'person_2' });

        await updateFlight(adminActor(), 'flight_orig', input);

        expect(updatedFlightData()).toMatchObject({ aircraftPriceCategory: 'PILOT', aircraftRateCentsPerHour: 15000, aircraftAmountCents: 7500 });
      });
    });

    // Review F3 (ratifica R-14.3-a), ported.
    it("an edit that keeps the flight's OWN recorded flightType is allowed for a person who is student-only today (R-14.3-a)", async () => {
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, pilotProfile: null, studentProfile: { deactivatedAt: null } });

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).resolves.toBeDefined();
    });

    it('422 STUDENT_FLIGHT_MUST_BE_SCHOOL when an edit CHANGES the flightType to a non-SCHOOL type for a person who is student-only today', async () => {
      flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, flightType: 'SCHOOL' });
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, pilotProfile: null, studentProfile: { deactivatedAt: null } });

      await expect(updateFlight(adminActor(), 'flight_orig', UPDATE_INPUT)).rejects.toMatchObject({ code: 'STUDENT_FLIGHT_MUST_BE_SCHOOL' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // AC 20 — turning the flag on or off on an edit.
    it('an edit that turns noCharge ON brings the SAME charge to 0 (AC 20)', async () => {
      const input = registerFlightSchema.parse({ ...UPDATE_INPUT, noCharge: true });

      await updateFlight(adminActor(), 'flight_orig', input);

      expect(updatedFlightData()).toMatchObject({ noCharge: true, aircraftRateCentsPerHour: 15000, aircraftAmountCents: 0 });
      const movementData = (accountMovementUpdateMock.mock.calls[0]?.[0] as { data: { amountCents: number; description: string } }).data;
      expect(Object.is(movementData.amountCents, 0)).toBe(true);
      expect(movementData.description).toBe('Volo senza addebito I-ABCD 2020-01-15 — 0:30');
    });
  });

  describe('senza addebito — noCharge (story 19.6, P1 — R-19-d; Q-19.6-a = B; AC 18/19)', () => {
    const SCHOOL_NO_CHARGE = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_instructor', noCharge: true });

    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 4000 });
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, noCharge: true, aircraftAmountCents: 0, instructorRateCentsPerHour: 4000, instructorAmountCents: 0 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    function createdData(): Record<string, unknown> {
      return (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    }

    function chargeData(): { amountCents: number; description: string } {
      return (accountMovementCreateMock.mock.calls[0]?.[0] as { data: { amountCents: number; description: string } }).data;
    }

    it('the rates are STILL looked up and frozen as information; both amounts are 0, the instructor amount 0 and not null (Q-19.6-a = B)', async () => {
      await registerFlight(adminActor(), SCHOOL_NO_CHARGE);

      expect(getEffectiveRateMock).toHaveBeenCalledTimes(1);
      expect(getEffectiveInstructorRateMock).toHaveBeenCalledTimes(1);
      expect(createdData()).toMatchObject({
        noCharge: true,
        aircraftRateCentsPerHour: 15000,
        aircraftPriceCategory: 'PILOT',
        aircraftAmountCents: 0,
        instructorRateCentsPerHour: 4000,
        instructorAmountCents: 0,
      });
    });

    it('the FLIGHT_CHARGE always exists and is a POSITIVE zero, with the no-charge wording at the head of its description', async () => {
      await registerFlight(adminActor(), SCHOOL_NO_CHARGE);

      expect(accountMovementCreateMock).toHaveBeenCalledTimes(1);
      expect(Object.is(chargeData().amountCents, 0)).toBe(true);
      expect(chargeData().description).toBe('Volo senza addebito I-ABCD 2020-01-15 — 1:20');
    });

    it('a normal flight keeps its description byte-identical (`Volo …`)', async () => {
      personFindUniqueMock.mockReset();
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await registerFlight(adminActor(), BASE_INPUT);

      expect(createdData()).toMatchObject({ noCharge: false, aircraftAmountCents: 20000 });
      expect(chargeData()).toMatchObject({ amountCents: -20000, description: 'Volo I-ABCD 2020-01-15 — 1:20' });
    });

    it('without an aircraft rate the no-charge flight is refused exactly like any flight: 422 NO_AIRCRAFT_RATE (Q-19.6-a = B)', async () => {
      getEffectiveRateMock.mockResolvedValue(null);

      await expect(registerFlight(adminActor(), SCHOOL_NO_CHARGE)).rejects.toMatchObject({ code: 'NO_AIRCRAFT_RATE' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('the response DTO carries noCharge and a 0 breakdown with the frozen rates', async () => {
      const result = await registerFlight(adminActor(), SCHOOL_NO_CHARGE);

      expect(result.flight.noCharge).toBe(true);
      expect(result.flight.breakdown).toMatchObject({ aircraftRateCentsPerHour: 15000, aircraftAmountCents: 0, instructorAmountCents: 0, totalAmountCents: 0 });
    });
  });

  // ==========================================================================
  // Story 16.2 (ops-audit F3/F13) — no duplicate, no overlap, and no minute
  // lost in silence.
  // ==========================================================================

  /** The `where` shape `assertNoOverlappingFlight` passes to `flight.findFirst` — read back by the stand-in below AND asserted verbatim by AC 4/AC 6. */
  type OverlapWhere = {
    aircraftId?: string;
    takeoffAt?: Record<string, Date>;
    landingAt?: Record<string, Date>;
    id?: { not?: string };
  };
  type StoredFlight = { id: string; aircraftId: string; takeoffAt: Date; landingAt: Date };

  /**
   * Evaluates ONE comparison clause the way Postgres would, INTERPRETING the
   * operator the guard actually used. This is what makes the two
   * touching-boundary units real: they do not compare with a hardcoded
   * `<`/`>` of their own, so swapping the guard to `lte`/`gte` turns them
   * red instead of leaving them green.
   */
  function matchesInstant(value: Date, clause: Record<string, Date> | undefined): boolean {
    if (clause === undefined) return true;
    return Object.entries(clause).every(([operator, bound]) => {
      switch (operator) {
        case 'lt':
          return value.getTime() < bound.getTime();
        case 'lte':
          return value.getTime() <= bound.getTime();
        case 'gt':
          return value.getTime() > bound.getTime();
        case 'gte':
          return value.getTime() >= bound.getTime();
        default:
          throw new Error(`Unexpected operator "${operator}" in the overlap where clause`);
      }
    });
  }

  /**
   * An in-memory stand-in for `prisma.flight.findFirst` under the overlap
   * guard's own `where` (this file mocks prisma entirely — there is no DB
   * where two flights could coexist). Every clause is honoured ONLY when the
   * guard actually passes it, which is exactly what makes the discriminances
   * of §4.3 bite: drop `id: { not }` and a conservative edit conflicts with
   * itself. `orderBy takeoffAt asc` is reproduced too (AC 5).
   */
  function findFirstOverlapping(where: OverlapWhere, rows: StoredFlight[]): StoredFlight | null {
    const matching = rows
      .filter((row) => {
        if (where.aircraftId !== undefined && row.aircraftId !== where.aircraftId) return false;
        if (where.id?.not !== undefined && row.id === where.id.not) return false;
        return matchesInstant(row.takeoffAt, where.takeoffAt) && matchesInstant(row.landingAt, where.landingAt);
      })
      .sort((left, right) => left.takeoffAt.getTime() - right.takeoffAt.getTime());
    return matching[0] ?? null;
  }

  /** Prisma's overloaded delegate types reject a plain `mockImplementation` — same cast escape hatch as the `mockResolvedValue` wrappers at the top of this file. */
  function asImpl<A extends unknown[]>(mock: unknown): { mockImplementation: (fn: (...args: A) => unknown) => void } {
    return mock as { mockImplementation: (fn: (...args: A) => unknown) => void };
  }

  /** Wires `flight.findFirst` to {@link findFirstOverlapping} over `rows`, and returns the recorded `where` of the LAST call. */
  function stubOverlapStore(rows: StoredFlight[]): { lastWhere: () => OverlapWhere } {
    asImpl<[{ where: OverlapWhere }]>(flightFindFirstMock).mockImplementation((args) =>
      Promise.resolve(findFirstOverlapping(args.where, rows)),
    );
    return {
      lastWhere: () => {
        const calls = flightFindFirstMock.mock.calls as unknown as Array<[{ where: OverlapWhere }]>;
        return calls[calls.length - 1]![0].where;
      },
    };
  }

  const EXISTING_09_10: StoredFlight = {
    id: 'flight_existing',
    aircraftId: 'aircraft_1',
    takeoffAt: new Date('2020-01-15T09:00:00.000Z'),
    landingAt: new Date('2020-01-15T10:00:00.000Z'),
  };

  /** `{ takeoffAt, landingAt }` for a window given as two `HH:MM` UTC clock times on 2020-01-15 — reads like the case it describes, unlike `buildTimes`'s minute count. */
  function window(takeoffTimeUtc: string, landingTimeUtc: string): { takeoffAt: string; landingAt: string } {
    return { takeoffAt: `2020-01-15T${takeoffTimeUtc}:00.000Z`, landingAt: `2020-01-15T${landingTimeUtc}:00.000Z` };
  }

  describe('registerFlight — the overlap guard (story 16.2, P1/P2; ops-audit F3)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    });

    // U1 — the audit's probe 14.
    it('U1: a PARTIALLY overlapping flight (09:30->10:30 over 09:00->10:00) is a 409 FLIGHT_OVERLAP — nothing written at all', async () => {
      stubOverlapStore([EXISTING_09_10]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:30', '10:30') });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_OVERLAP' });
      expect(flightCreateMock).not.toHaveBeenCalled();
      expect(accountMovementCreateMock).not.toHaveBeenCalled();
      expect(aircraftUpdateMock).not.toHaveBeenCalled();
    });

    // U2 — the duplicate is just a TOTAL overlap: one guard covers both.
    it('U2: a byte-identical interval (the duplicate) is the same 409 FLIGHT_OVERLAP', async () => {
      stubOverlapStore([EXISTING_09_10]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:00', '10:00') });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_OVERLAP' });
      expect(flightCreateMock).not.toHaveBeenCalled();
    });

    // U6 — the details on the wire (see also `handler.test.ts`, which pins
    // the pass-through the API layer used to drop).
    it('U6: the 409 carries details { flightId, takeoffAt, landingAt } with the instants as ISO 8601 UTC STRINGS, not Dates', async () => {
      stubOverlapStore([EXISTING_09_10]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:30', '10:30') });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({
        code: 'FLIGHT_OVERLAP',
        details: {
          flightId: 'flight_existing',
          takeoffAt: '2020-01-15T09:00:00.000Z',
          landingAt: '2020-01-15T10:00:00.000Z',
        },
      });
    });

    // U3/U4 — the SEMI-OPEN interval, the bookings' own semantics ([I-1]).
    it('U3: takeoffAt of the new flight EQUAL to landingAt of the existing one (10:00->11:00) is accepted — touching is not overlapping', async () => {
      stubOverlapStore([EXISTING_09_10]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('10:00', '11:00') });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledTimes(1);
    });

    it('U4: landingAt of the new flight EQUAL to takeoffAt of the existing one (08:00->09:00) is accepted too', async () => {
      stubOverlapStore([EXISTING_09_10]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('08:00', '09:00') });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledTimes(1);
    });

    // AC 5 — among several conflicts, the NAMED one is deterministic.
    it('AC 5: with two conflicting flights, the 409 names the one with the EARLIEST takeoffAt (explicit orderBy)', async () => {
      const store = stubOverlapStore([
        { ...EXISTING_09_10, id: 'flight_later', takeoffAt: new Date('2020-01-15T09:45:00.000Z'), landingAt: new Date('2020-01-15T10:15:00.000Z') },
        EXISTING_09_10,
      ]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:30', '10:30') });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ details: { flightId: 'flight_existing' } });
      expect(store.lastWhere()).toBeDefined();
      expect(flightFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { takeoffAt: 'asc' } }));
    });

    // AC 4 (second half) / AC 6 — the SHAPE of the predicate. A historical
    // flight with NULL instants (pre-story 11.1) is not producible through
    // the API, so the property is verified here, on the `where`: no clause
    // can match a NULL, and `select` asks for exactly the three fields the
    // `details` needs (no `FLIGHT_SELECT`, no join, no mask).
    it('AC 4/AC 6: the where has aircraftId + the two instant comparisons and NOTHING that could catch a NULL instant — no status clause (story 19.6: every existing flight occupies its slot); no id filter on a plain registration', async () => {
      const store = stubOverlapStore([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:30', '10:30') });

      await registerFlight(adminActor(), input);

      expect(store.lastWhere()).toEqual({
        aircraftId: 'aircraft_1',
        takeoffAt: { lt: new Date('2020-01-15T10:30:00.000Z') },
        landingAt: { gt: new Date('2020-01-15T09:30:00.000Z') },
      });
      expect(flightFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, takeoffAt: true, landingAt: true } }),
      );
    });

    // AC 6 — the guard runs INSIDE the transaction, AFTER the aircraft lock
    // and BEFORE every write (the account get-or-create included).
    it('AC 6: the guard reads AFTER the Aircraft FOR UPDATE lock and BEFORE the account upsert and any write', async () => {
      stubOverlapStore([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:30', '10:30') });

      await registerFlight(adminActor(), input);

      const lockOrder = queryRawMock.mock.invocationCallOrder[0]!;
      const guardOrder = flightFindFirstMock.mock.invocationCallOrder[0]!;
      expect(lockOrder).toBeLessThan(guardOrder);
      expect(guardOrder).toBeLessThan(accountUpsertMock.mock.invocationCallOrder[0]!);
      expect(guardOrder).toBeLessThan(flightCreateMock.mock.invocationCallOrder[0]!);
    });

    // U7 / AC 11 — `force` does NOT derogate this 409 (ratifica del piano
    // 16-18), unlike the requirements of REQUIREMENTS_NOT_MET (story 19.9).
    it('U7: force: true on an overlapping request is STILL a 409 — no flight row, so no forcedAt either', async () => {
      stubOverlapStore([EXISTING_09_10]);
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        ...window('09:30', '10:30'),
        force: true,
      });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_OVERLAP' });
      expect(flightCreateMock).not.toHaveBeenCalled();
    });

    // The audit's own probes 13a/13b/14, with the expectation ROVESCIATA.
    // Before story 16.2 these two calls produced TWO flights and TWO charges
    // of -15000 for 60 minutes flown.
    it('P2/P6 (probe 13a/13b): the SAME request twice WITHOUT an Idempotency-Key -> 201 then 409, one flight, one charge', async () => {
      const registered: StoredFlight[] = [];

      queryRawMock.mockReset();
      asImpl<[TemplateStringsArray]>(queryRawMock).mockImplementation((strings) =>
        Promise.resolve(strings.join('?').includes('Aircraft') ? [{ id: 'aircraft_1' }] : []),
      );
      asImpl<[{ where: OverlapWhere }]>(flightFindFirstMock).mockImplementation((args) =>
        Promise.resolve(findFirstOverlapping(args.where, registered)),
      );
      asImpl<[{ data: { takeoffAt: Date; landingAt: Date } }]>(flightCreateMock).mockImplementation((args) => {
        const id = `flight_${registered.length + 1}`;
        registered.push({ id, aircraftId: 'aircraft_1', takeoffAt: args.data.takeoffAt, landingAt: args.data.landingAt });
        return Promise.resolve({ ...CREATED_FLIGHT_ROW, id, minutes: 60, aircraftAmountCents: 15000 });
      });

      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:00', '10:00') });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_OVERLAP' });
      expect(flightCreateMock).toHaveBeenCalledTimes(1);
      expect(accountMovementCreateMock).toHaveBeenCalledTimes(1);

      // …and the audit's probe 14 on top of the same store: a PARTIAL
      // overlap on the same aircraft is refused too.
      const overlapping = registerFlightSchema.parse({ ...BASE_INPUT, ...window('09:30', '10:30') });
      await expect(registerFlight(adminActor(), overlapping)).rejects.toMatchObject({ code: 'FLIGHT_OVERLAP' });
      expect(flightCreateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateFlight — the overlap guard (story 16.2, P3; story 19.6, AC 11)', () => {
    const EDIT_BASE = {
      aircraftId: 'aircraft_1',
      personId: 'person_1',
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: 'TOURISM' as const,
    };
    /** The flight being edited, on its own slot (`updateFlight`'s pre-read returns `ORIGINAL_FLIGHT_ROW`, id `flight_orig`). */
    const ORIGINAL_IN_STORE: StoredFlight = {
      id: 'flight_orig',
      aircraftId: 'aircraft_1',
      takeoffAt: new Date('2020-01-15T09:00:00.000Z'),
      landingAt: new Date('2020-01-15T10:00:00.000Z'),
    };

    beforeEach(() => {
      flightFindUnique.mockResolvedValue(ORIGINAL_FLIGHT_ROW);
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getNegativeBalanceThresholdCentsMock.mockResolvedValue(-20000);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementFindUnique.mockResolvedValue(CHARGE_ROW);
      flightUpdate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_orig' });
      queryRaw.mockResolvedValueOnce([LOCKED_FLIGHT]).mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
      getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    });

    // U8 — the clause that carries this whole call site: the edited flight is
    // still on its own slot, so every conservative edit would be a 409
    // without `id: { not }`.
    it('U8: an edit that KEEPS its own slot (same aircraft, same instants, changed landings) is accepted — the flight is excluded by id', async () => {
      const store = stubOverlapStore([ORIGINAL_IN_STORE]);
      const input = registerFlightSchema.parse({ ...EDIT_BASE, ...window('09:00', '10:00'), landings: 2 });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).resolves.toBeDefined();
      expect(store.lastWhere()).toMatchObject({ id: { not: 'flight_orig' } });
      expect(flightUpdateMock).toHaveBeenCalledTimes(1);
    });

    it('U9a: an edit that MOVES the flight onto a slot occupied by ANOTHER flight on the SAME aircraft is a 409 naming it — flight and charge untouched (AC 11)', async () => {
      stubOverlapStore([
        ORIGINAL_IN_STORE,
        { ...EXISTING_09_10, id: 'flight_other', takeoffAt: new Date('2020-01-15T14:00:00.000Z'), landingAt: new Date('2020-01-15T15:00:00.000Z') },
      ]);
      const input = registerFlightSchema.parse({ ...EDIT_BASE, ...window('14:30', '15:30') });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).rejects.toMatchObject({
        code: 'FLIGHT_OVERLAP',
        details: { flightId: 'flight_other' },
      });
      expect(flightUpdateMock).not.toHaveBeenCalled();
      expect(accountMovementUpdateMock).not.toHaveBeenCalled();
      expect(accountMovementCreateMock).not.toHaveBeenCalled();
    });

    it('U9b: an edit that moves the flight onto ANOTHER aircraft is checked on THAT aircraft (resolved, never the current one)', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AIRCRAFT, id: 'aircraft_2', registration: 'I-ZZZZ' });
      queryRawMock.mockReset();
      queryRaw
        .mockResolvedValueOnce([LOCKED_FLIGHT])
        .mockResolvedValueOnce([{ id: 'aircraft_1' }, { id: 'aircraft_2' }])
        .mockResolvedValueOnce([]);
      const store = stubOverlapStore([
        ORIGINAL_IN_STORE,
        { id: 'flight_on_two', aircraftId: 'aircraft_2', takeoffAt: new Date('2020-01-15T09:00:00.000Z'), landingAt: new Date('2020-01-15T10:00:00.000Z') },
      ]);
      const input = registerFlightSchema.parse({ ...EDIT_BASE, aircraftId: 'aircraft_2', ...window('09:30', '10:30') });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).rejects.toMatchObject({
        code: 'FLIGHT_OVERLAP',
        details: { flightId: 'flight_on_two' },
      });
      expect(store.lastWhere()).toMatchObject({ aircraftId: 'aircraft_2' });
      expect(flightUpdateMock).not.toHaveBeenCalled();
    });

    it('U9b (mirror): the same move onto a FREE slot on the other aircraft succeeds — the guard interrogates aircraft_2 and finds nothing', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AIRCRAFT, id: 'aircraft_2', registration: 'I-ZZZZ' });
      queryRawMock.mockReset();
      queryRaw
        .mockResolvedValueOnce([LOCKED_FLIGHT])
        .mockResolvedValueOnce([{ id: 'aircraft_1' }, { id: 'aircraft_2' }])
        .mockResolvedValueOnce([]);
      const store = stubOverlapStore([ORIGINAL_IN_STORE]);
      const input = registerFlightSchema.parse({ ...EDIT_BASE, aircraftId: 'aircraft_2', ...window('09:30', '10:30') });

      await expect(updateFlight(adminActor(), 'flight_orig', input)).resolves.toBeDefined();
      expect(store.lastWhere()).toMatchObject({ aircraftId: 'aircraft_2', id: { not: 'flight_orig' } });
    });
  });

  describe('listFlights (story 5.1 AC 1/2, story 5.4 AC 1/2/3/4 — own-access + filters)', () => {
    function noRoleActor(): Actor {
      return { userId: 'nobody_1', personId: null, roles: [] };
    }

    function baseQuery(overrides: Partial<Parameters<typeof listFlights>[1]> = {}) {
      return listFlightsQuerySchema.parse({ page: 1, pageSize: 20, ...overrides });
    }

    it('rejects an actor with neither flights.manage nor self.read', async () => {
      await expect(listFlights(noRoleActor(), baseQuery())).rejects.toThrow(ForbiddenError);
      expect(flightFindManyMock).not.toHaveBeenCalled();
    });

    it('orders by flightDate desc, createdAt desc, id desc (staff)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(adminActor(), baseQuery());

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ flightDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('maps rows through the same DTO shape as registerFlight (breakdown computed, actorEmail present for staff)', async () => {
      flightFindMany.mockResolvedValue([CREATED_FLIGHT_ROW]);
      flightCount.mockResolvedValue(1);

      const result = await listFlights(adminActor(), baseQuery());

      expect(result.total).toBe(1);
      expect(result.items[0]?.actorEmail).toBe('staff@airmanager.local');
      expect(result.items[0]?.breakdown.totalAmountCents).toBe(20000);
    });

    // Story 19.9 (A10, D-10): the silent stamp stays API data; the motivo is gone from the select and the DTO.
    it('the DTO carries forcedAt and no forceReason, and the select no longer reads one', async () => {
      flightFindMany.mockResolvedValue([{ ...CREATED_FLIGHT_ROW, forcedAt: new Date('2026-01-01T00:00:00.000Z') }]);
      flightCount.mockResolvedValue(1);

      const result = await listFlights(adminActor(), baseQuery());
      expect(result.items[0]?.forcedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
      expect(result.items[0]).not.toHaveProperty('forceReason');
      expect((flightFindManyMock.mock.calls[0]?.[0] as { select: Record<string, unknown> }).select).not.toHaveProperty('forceReason');
    });

    it('staff: builds the where clause from combined filters (period gte/lte date-only, aircraftId, personId, flightType) — no status clause (story 19.6)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(
        adminActor(),
        baseQuery({ dateFrom: '2026-01-01', dateTo: '2026-01-31', aircraftId: 'aircraft_9', personId: 'person_9', flightType: 'SCHOOL' }),
      );

      const expectedWhere = {
        flightDate: { gte: parseDateOnlyUtc('2026-01-01'), lte: parseDateOnlyUtc('2026-01-31') },
        aircraftId: 'aircraft_9',
        personId: 'person_9',
        flightType: 'SCHOOL',
      };
      expect(flightFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
      expect(flightCountMock).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('staff: no OR own-access scope in the where clause (sees every flight)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(adminActor(), baseQuery());

      const [callArgs] = flightFindManyMock.mock.calls.at(-1)!;
      expect((callArgs as { where: object }).where).not.toHaveProperty('OR');
    });

    it('pilot (self.read only): forces the where to OR own/instructor scope', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(pilotActor('person_1'), baseQuery());

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ personId: 'person_1' }, { instructorProfile: { personId: 'person_1' } }] },
        }),
      );
    });

    it('instructor: the OR scope includes the instructorProfile leg with their own personId', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(instructorActor(), baseQuery());

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ personId: 'person_instructor' }, { instructorProfile: { personId: 'person_instructor' } }] },
        }),
      );
    });

    it('non-staff filtering by someone else\'s personId -> Forbidden, no query issued (AC 4)', async () => {
      await expect(listFlights(pilotActor('person_1'), baseQuery({ personId: 'person_someone_else' }))).rejects.toThrow(
        ForbiddenError,
      );
      expect(flightFindManyMock).not.toHaveBeenCalled();
    });

    it('non-staff filtering by their OWN personId is redundant but allowed', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(pilotActor('person_1'), baseQuery({ personId: 'person_1' }));

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ personId: 'person_1' }, { instructorProfile: { personId: 'person_1' } }],
            personId: 'person_1',
          },
        }),
      );
    });

    // Story 9.3, AC 4 — `instructorPersonId` gets the exact same guard shape
    // as `personId` above (the "Le mie ore scuola" drill-down).
    it('staff: instructorPersonId is a plain exact-match filter via the instructorProfile relation', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(adminActor(), baseQuery({ instructorPersonId: 'person_instructor_9' }));

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instructorProfile: { personId: 'person_instructor_9' } },
        }),
      );
    });

    it('non-staff filtering by someone else\'s instructorPersonId -> Forbidden, no query issued (AC 4)', async () => {
      await expect(
        listFlights(instructorActor(), baseQuery({ instructorPersonId: 'person_someone_else' })),
      ).rejects.toThrow(ForbiddenError);
      expect(flightFindManyMock).not.toHaveBeenCalled();
    });

    it('non-staff filtering by their OWN instructorPersonId is allowed (the school-summary drill-down)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(instructorActor(), baseQuery({ instructorPersonId: 'person_instructor' }));

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ personId: 'person_instructor' }, { instructorProfile: { personId: 'person_instructor' } }],
            instructorProfile: { personId: 'person_instructor' },
          },
        }),
      );
    });

    it('non-staff with no linked person (personId null) gets an empty page, no query at all', async () => {
      const result = await listFlights(pilotActor(null), baseQuery());

      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
      expect(flightFindManyMock).not.toHaveBeenCalled();
      expect(flightCountMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('actorEmail is absent for a non-staff (own-access) actor', async () => {
      flightFindMany.mockResolvedValue([CREATED_FLIGHT_ROW]);
      flightCount.mockResolvedValue(1);

      const result = await listFlights(pilotActor('person_1'), baseQuery());

      expect(result.items[0]?.actorEmail).toBeUndefined();
    });
  });

  describe('getFlightTotals (review fix 12.8, MAJOR — TRUE totals over the whole filtered set)', () => {
    function noRoleActor(): Actor {
      return { userId: 'nobody_1', personId: null, roles: [] };
    }

    function baseQuery(overrides: Partial<Parameters<typeof getFlightTotals>[1]> = {}) {
      return listFlightsQuerySchema.parse({ page: 1, pageSize: 20, ...overrides });
    }

    const AGGREGATE_FIXTURE = {
      _count: { _all: 25 },
      _sum: { minutes: 3000, takeoffs: 25, landings: 25, aircraftAmountCents: 500000, instructorAmountCents: 100000 },
    };

    it('rejects an actor with neither flights.manage nor self.read, no query issued', async () => {
      await expect(getFlightTotals(noRoleActor(), baseQuery())).rejects.toThrow(ForbiddenError);
      expect(flightAggregateMock).not.toHaveBeenCalled();
    });

    it('sums aircraft + instructor amounts into revenueCents, defaulting null sums to 0', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      const result = await getFlightTotals(adminActor(), baseQuery());

      expect(result).toEqual({ count: 25, minutes: 3000, takeoffs: 25, landings: 25, revenueCents: 600000 });
    });

    it('defaults every _sum field to 0 when the aggregate returns null (no matching rows)', async () => {
      flightAggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { minutes: null, takeoffs: null, landings: null, aircraftAmountCents: null, instructorAmountCents: null },
      });

      const result = await getFlightTotals(adminActor(), baseQuery());

      expect(result).toEqual({ count: 0, minutes: 0, takeoffs: 0, landings: 0, revenueCents: 0 });
    });

    it('forces no status at all (story 19.6): a stale ?status= is stripped by the schema and the WHERE is empty for an unfiltered admin', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(adminActor(), listFlightsQuerySchema.parse({ page: 1, pageSize: 20, status: 'CANCELLED' }));

      expect(flightAggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('a window holding only a no-charge flight counts it with 0 revenue (story 19.6, AC 22: snapshot amounts at 0, no reader change)', async () => {
      flightAggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { minutes: 45, takeoffs: 6, landings: 6, aircraftAmountCents: 0, instructorAmountCents: 0 },
      });

      const result = await getFlightTotals(adminActor(), baseQuery({ aircraftId: 'aircraft_9' }));

      expect(result).toEqual({ count: 1, minutes: 45, takeoffs: 6, landings: 6, revenueCents: 0 });
    });

    it('forwards the filter args (dateFrom/dateTo/aircraftId/flightType) into the WHERE, and nothing else', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(
        adminActor(),
        baseQuery({ dateFrom: '2026-01-01', dateTo: '2026-01-31', aircraftId: 'aircraft_9', flightType: 'SCHOOL' }),
      );

      expect(flightAggregateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            flightDate: { gte: parseDateOnlyUtc('2026-01-01'), lte: parseDateOnlyUtc('2026-01-31') },
            aircraftId: 'aircraft_9',
            flightType: 'SCHOOL',
          },
        }),
      );
    });

    // SECURITY-CRITICAL: a pilot must NEVER see cross-person totals.
    it('pilot (non-staff): scopes the WHERE to own/instructor flights only (OR own-access), same as listFlights', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(pilotActor('person_1'), baseQuery());

      expect(flightAggregateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ personId: 'person_1' }, { instructorProfile: { personId: 'person_1' } }],
          },
        }),
      );
    });

    it('pilot (non-staff) filtering by someone else\'s personId -> Forbidden, no aggregate query issued', async () => {
      await expect(getFlightTotals(pilotActor('person_1'), baseQuery({ personId: 'person_someone_else' }))).rejects.toThrow(
        ForbiddenError,
      );
      expect(flightAggregateMock).not.toHaveBeenCalled();
    });

    it('non-staff filtering by someone else\'s instructorPersonId -> Forbidden, no aggregate query issued', async () => {
      await expect(
        getFlightTotals(instructorActor(), baseQuery({ instructorPersonId: 'person_someone_else' })),
      ).rejects.toThrow(ForbiddenError);
      expect(flightAggregateMock).not.toHaveBeenCalled();
    });

    it('non-staff with no linked person (personId null) gets zero totals, no query at all', async () => {
      const result = await getFlightTotals(pilotActor(null), baseQuery());

      expect(result).toEqual({ count: 0, minutes: 0, takeoffs: 0, landings: 0, revenueCents: 0 });
      expect(flightAggregateMock).not.toHaveBeenCalled();
    });
  });
});

describe('registerFlightSchema (story 11.1, AC 1/2/3 — logbook fields, no more minutes/flightDate input)', () => {
  const VALID = {
    aircraftId: 'aircraft_1',
    personId: 'person_1',
    departureAirfield: 'Base Airfield',
    arrivalAirfield: 'Base Airfield',
    takeoffAt: '2026-07-08T10:00:00.000Z',
    landingAt: '2026-07-08T11:20:00.000Z',
    flightType: 'TOURISM' as const,
  };

  it('accepts a fully valid registration body', () => {
    expect(registerFlightSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects an empty departureAirfield or arrivalAirfield', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, departureAirfield: '' }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, arrivalAirfield: '   ' }).success).toBe(false);
  });

  it('rejects a departureAirfield/arrivalAirfield over 120 chars', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, departureAirfield: 'x'.repeat(121) }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, departureAirfield: 'x'.repeat(120) }).success).toBe(true);
  });

  it('rejects a missing or malformed takeoffAt/landingAt (not z.iso.datetime())', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffAt: undefined }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffAt: '2026-07-08' }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, landingAt: 'not-a-date' }).success).toBe(false);
  });

  it('no longer accepts flightDate or minutes as input (dropped, story 11.1) — an extra flightDate/minutes key is simply ignored', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, flightDate: '2026-07-08', minutes: 80 }).success).toBe(true);
    const parsed = registerFlightSchema.parse({ ...VALID, flightDate: '2026-07-08', minutes: 80 });
    expect(parsed).not.toHaveProperty('flightDate');
    expect(parsed).not.toHaveProperty('minutes');
  });

  it('drops a removed hourMeterStart/hourMeterEnd/notes key instead of rejecting it (story 19.2: a stale client gets a 201, never a 422)', () => {
    const parsed = registerFlightSchema.parse({ ...VALID, hourMeterStart: 100, hourMeterEnd: 160, notes: 'Nota' });
    expect(parsed).not.toHaveProperty('hourMeterStart');
    expect(parsed).not.toHaveProperty('hourMeterEnd');
    expect(parsed).not.toHaveProperty('notes');
  });

  it('noCharge defaults to false (POST and PUT: an omitted flag on a full replacement turns it OFF) and accepts true (story 19.6, AC 18)', () => {
    expect(registerFlightSchema.parse(VALID).noCharge).toBe(false);
    expect(registerFlightSchema.parse({ ...VALID, noCharge: true }).noCharge).toBe(true);
    expect(registerFlightSchema.safeParse({ ...VALID, noCharge: 'yes' }).success).toBe(false);
  });

  it('drops a stale reason key (the retired /correct body) instead of rejecting it (story 19.6, D-1)', () => {
    expect(registerFlightSchema.parse({ ...VALID, reason: 'Errore' })).not.toHaveProperty('reason');
  });

  it('rejects an invalid flightType', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, flightType: 'JOYRIDE' }).success).toBe(false);
  });

  it('accepts an omitted or null instructorPersonId; omitted takeoffs/landings', () => {
    expect(registerFlightSchema.safeParse(VALID).success).toBe(true);
    expect(registerFlightSchema.safeParse({ ...VALID, instructorPersonId: null }).success).toBe(true);
  });

  // Story 16.2 (F14, AC 16) — the `0` case is INVERTED, not deleted: as
  // written before this story it was the standing PROOF that the wrong bound
  // (`min(0)`) was intentional, against a Prisma doc-comment that has always
  // declared "every flight has at least one of each". The bound is now
  // `[1, 500]`, and this is where that is pinned.
  it('rejects takeoffs/landings outside [1, 500] — a 0 included (story 16.2, F14)', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, landings: -1 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, landings: 501 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, landings: 0 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: -1 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: 501 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: 0 }).success).toBe(false);
  });

  // U17 — the still-VALID edges, so tightening the lower bound cannot have
  // quietly moved the upper one or broken the "omitted is fine" contract
  // (the DB default is 1).
  it('still accepts takeoffs/landings at 1 and 500, and both omitted (story 16.2 non-regression)', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: 1, landings: 1 }).success).toBe(true);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: 500, landings: 500 }).success).toBe(true);
    expect(registerFlightSchema.safeParse(VALID).success).toBe(true);
  });
});

describe('listFlightsQuerySchema (story 5.4, Task 1 — all six filters optional/AND-combinable)', () => {
  it('accepts bare pagination with no filters at all', () => {
    expect(listFlightsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts every filter combined', () => {
    const result = listFlightsQuerySchema.safeParse({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      aircraftId: 'aircraft_1',
      personId: 'person_1',
      instructorPersonId: 'person_2',
      flightType: 'SCHOOL',
    });
    expect(result.success).toBe(true);
  });

  it('rejects dateFrom after dateTo (422 VALIDATION_ERROR, no custom code needed)', () => {
    const result = listFlightsQuerySchema.safeParse({ dateFrom: '2026-02-01', dateTo: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('accepts dateFrom === dateTo (a single-day window)', () => {
    expect(listFlightsQuerySchema.safeParse({ dateFrom: '2026-01-15', dateTo: '2026-01-15' }).success).toBe(true);
  });

  it('accepts dateFrom or dateTo alone (an open-ended window)', () => {
    expect(listFlightsQuerySchema.safeParse({ dateFrom: '2026-01-01' }).success).toBe(true);
    expect(listFlightsQuerySchema.safeParse({ dateTo: '2026-01-31' }).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(listFlightsQuerySchema.safeParse({ dateFrom: '01/01/2026' }).success).toBe(false);
  });

  it('rejects an invalid flightType', () => {
    expect(listFlightsQuerySchema.safeParse({ flightType: 'JOYRIDE' }).success).toBe(false);
  });

  it('strips a stale status key instead of rejecting it: no 422, the key never reaches the service (story 19.6, AC 25)', () => {
    const parsed = listFlightsQuerySchema.parse({ status: 'CANCELLED' });
    expect(parsed).not.toHaveProperty('status');
  });
});
