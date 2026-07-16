import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import {
  cancelFlightSchema,
  correctFlightSchema,
  listFlightsQuerySchema,
  registerFlightSchema,
  type RegisterFlightInput,
} from '@/lib/schemas/flights';
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
    },
    flight: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    hourPackage: {
      findMany: vi.fn(),
    },
    packageConsumption: {
      groupBy: vi.fn(),
      createMany: vi.fn(),
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

const { prisma } = await import('@/server/db/prisma');
const { listFlights, getFlightTotals, registerFlight, cancelFlight, correctFlight } = await import('./flights.service');
const { NotFoundError, ConflictError } = await import('./errors');

const aircraftFindUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const aircraftUpdateMock = vi.mocked(prisma.aircraft.update);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const flightCreateMock = vi.mocked(prisma.flight.create);
const flightFindUniqueMock = vi.mocked(prisma.flight.findUnique);
const flightUpdateMock = vi.mocked(prisma.flight.update);
const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const flightCountMock = vi.mocked(prisma.flight.count);
const flightAggregateMock = vi.mocked(prisma.flight.aggregate);
const hourPackageFindManyMock = vi.mocked(prisma.hourPackage.findMany);
const packageConsumptionGroupByMock = vi.mocked(prisma.packageConsumption.groupBy);
const packageConsumptionCreateManyMock = vi.mocked(prisma.packageConsumption.createMany);
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
};
const accountMovementCreate = accountMovementCreateMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockRejectedValueOnce: (v: unknown) => { mockResolvedValueOnce: (v: Fixture) => void };
};
const flightCreate = flightCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindUnique = flightFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightUpdate = flightUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindMany = flightFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightCount = flightCountMock as unknown as { mockResolvedValue: (v: number) => void };
const flightAggregate = flightAggregateMock as unknown as {
  mockResolvedValue: (v: {
    _count: { _all: number };
    _sum: { minutes: number | null; takeoffs: number | null; landings: number | null; aircraftAmountCents: number | null; instructorAmountCents: number | null };
  }) => void;
};
const hourPackageFindMany = hourPackageFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const packageConsumptionGroupBy = packageConsumptionGroupByMock as unknown as {
  mockResolvedValue: (v: { hourPackageId: string; _sum: { minutes: number | null } }[]) => void;
};
const queryRaw = queryRawMock as unknown as {
  mockResolvedValueOnce: (v: unknown[]) => { mockResolvedValueOnce: (v: unknown[]) => void };
};

/** Same batch/interactive `$transaction` stand-in as `accounts.service.test.ts`/`packages.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
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

const AIRCRAFT = { id: 'aircraft_1', registration: 'I-ABCD', archivedAt: null };
const PILOT_PERSON = {
  id: 'person_1',
  firstName: 'Mario',
  lastName: 'Rossi',
  email: 'mario@example.com',
  archivedAt: null,
  pilotProfile: { deactivatedAt: null },
  studentProfile: null,
};
const INSTRUCTOR_PROFILE_ROW = { archivedAt: null, instructorProfile: { id: 'instr_profile_1', deactivatedAt: null } };

const ACCOUNT_OVERVIEW = { account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') }, balanceCents: 0, recentMovements: [] };

const CREATED_FLIGHT_ROW = {
  id: 'flight_1',
  flightDate: new Date('2020-01-15T00:00:00.000Z'),
  flightType: 'TOURISM' as const,
  isSolo: false,
  status: 'REGISTERED' as const,
  departureAirfield: 'Base Airfield',
  arrivalAirfield: 'Base Airfield',
  takeoffAt: new Date('2020-01-15T10:00:00.000Z'),
  landingAt: new Date('2020-01-15T11:20:00.000Z'),
  minutes: 80,
  takeoffs: 1,
  hourMeterStart: null,
  hourMeterEnd: null,
  landings: 1,
  notes: null,
  aircraftRateCentsPerHour: 15000,
  aircraftAmountCents: 20000,
  instructorRateCentsPerHour: null,
  instructorAmountCents: null,
  // Story 5.2: no package consumption in the 5.1-inherited fixture (the
  // pre-5.2 regression case) — `packageConsumptions` here would be
  // overwritten by the service's own allocations anyway (Dev Notes), but is
  // shaped realistically for tests that inspect the raw fixture directly.
  packageCoveredMinutes: 0,
  createdAt: new Date('2020-01-15T10:00:00.000Z'),
  // Story 5.3: a plain `registerFlight`-created row is never cancelled and
  // never itself a correction.
  cancelledAt: null as Date | null,
  cancelReason: null as string | null,
  correctionOfId: null as string | null,
  correctedBy: null as { id: string } | null,
  aircraft: { id: 'aircraft_1', registration: 'I-ABCD' },
  person: { id: 'person_1', firstName: 'Mario', lastName: 'Rossi' },
  instructorProfile: null,
  actorUser: { email: 'staff@airmanager.local' },
  packageConsumptions: [] as { hourPackageId: string; minutes: number; hourPackage: { packageType: { name: string } } }[],
};

// Story 5.3 — a previously registered flight, still REGISTERED, with its
// FLIGHT_CHARGE movement (`loadRegisteredFlightForReversal`'s shape).
const ORIGINAL_FLIGHT_ROW = {
  id: 'flight_orig',
  status: 'REGISTERED' as const,
  aircraftId: 'aircraft_1',
  personId: 'person_1',
  minutes: 80,
  flightDate: new Date('2020-01-15T00:00:00.000Z'),
  aircraft: { registration: 'I-ABCD' },
  movements: [{ id: 'movement_orig', amountCents: -20000, accountId: 'account_1', reversal: null }],
};

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
    flightCreateMock.mockReset();
    flightFindUniqueMock.mockReset();
    flightUpdateMock.mockReset();
    flightFindManyMock.mockReset();
    flightCountMock.mockReset();
    flightAggregateMock.mockReset();
    hourPackageFindManyMock.mockReset();
    packageConsumptionGroupByMock.mockReset();
    packageConsumptionCreateManyMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    getAccountOverviewMock.mockReset();
    getNegativeBalanceThresholdCentsMock.mockReset();
    sendNegativeBalanceAlertMock.mockReset();
    getEffectiveRateMock.mockReset();
    getEffectiveInstructorRateMock.mockReset();

    getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    getNegativeBalanceThresholdCentsMock.mockResolvedValue(-20000);
    getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
    // Default: no eligible packages (story 5.2's "5.1 regression" path —
    // most tests in this suite are not about consumption at all).
    hourPackageFindMany.mockResolvedValue([]);
    packageConsumptionGroupBy.mockResolvedValue([]);
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

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toThrow(NotFoundError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown person', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(null);

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 AIRCRAFT_ARCHIVED for an archived aircraft', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AIRCRAFT, archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 PERSON_ARCHIVED for an archived person', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, archivedAt: new Date('2026-01-01T00:00:00.000Z') });

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 PERSON_NOT_PILOT_OR_STUDENT when neither profile is active', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, pilotProfile: null, studentProfile: null });

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_NOT_PILOT_OR_STUDENT' });
    });

    it('throws a 422 PERSON_NOT_PILOT_OR_STUDENT when the only profile is DEACTIVATED', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({
        ...PILOT_PERSON,
        pilotProfile: { deactivatedAt: new Date('2026-01-01T00:00:00.000Z') },
        studentProfile: null,
      });

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'PERSON_NOT_PILOT_OR_STUDENT' });
    });

    it('accepts a person with an active STUDENT profile (no pilot profile at all)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue({
        ...PILOT_PERSON,
        pilotProfile: null,
        studentProfile: { deactivatedAt: null },
      });
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);

      await expect(registerFlight(staffActor(), BASE_INPUT)).resolves.toBeDefined();
    });

    it('throws a 422 FLIGHT_DATE_IN_FUTURE for a flight date after today (server UTC clock)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      // Always in the future, regardless of when this suite runs.
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('9999-12-31', 80) });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_DATE_IN_FUTURE' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("accepts today's date (the boundary itself is valid, not just strictly-past dates)", async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes(toDateOnlyString(todayDateOnlyUtc()), 80) });

      await expect(registerFlight(staffActor(), input)).resolves.toBeDefined();
    });

    it('throws a 422 FLIGHT_TIMES_INVALID when landingAt <= takeoffAt', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        takeoffAt: '2020-01-15T10:00:00.000Z',
        landingAt: '2020-01-15T10:00:00.000Z',
      });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_TIMES_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 FLIGHT_TIMES_INVALID when the derived duration exceeds 1440 minutes (24h)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 1441) });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'FLIGHT_TIMES_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('accepts a derived duration of exactly 1440 minutes (the boundary itself is valid)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 1440 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 1440) });

      await expect(registerFlight(staffActor(), input)).resolves.toBeDefined();
    });

    it('derives minutes as round((landingAt - takeoffAt) / 60000), never from hourMeterStart/hourMeterEnd', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, hourMeterStart: 1000, hourMeterEnd: 1050, minutes: 50 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        ...buildTimes('2020-01-15', 50),
        hourMeterStart: 1000,
        hourMeterEnd: 1050,
      });

      await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ minutes: 50, hourMeterStart: 1000, hourMeterEnd: 1050 }),
        }),
      );
      expect(aircraftUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { hourMeterMinutes: 550 } }),
      );
    });

    it('a legitimate hourMeterStart/hourMeterEnd pair whose OWN difference diverges from minutes is accepted as-is (engine time vs block time, story 11.1)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, hourMeterStart: 1000, hourMeterEnd: 1200, minutes: 80 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      // 80' from takeoffAt/landingAt, but a 200-unit hourMeter reading — no cross-validation anymore.
      const input = registerFlightSchema.parse({ ...BASE_INPUT, hourMeterStart: 1000, hourMeterEnd: 1200 });

      await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ minutes: 80, hourMeterStart: 1000, hourMeterEnd: 1200 }) }),
      );
      // The aircraft's own hour meter advances by MINUTES, never by the hourMeter reading's own delta.
      expect(aircraftUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { hourMeterMinutes: 580 } }));
    });

    it('throws a 422 HOUR_METER_INVALID when only hourMeterStart is given (incomplete pair)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, hourMeterStart: 1000 });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 HOUR_METER_INVALID when only hourMeterEnd is given (incomplete pair)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, hourMeterEnd: 1050 });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 HOUR_METER_INVALID when hourMeterEnd <= hourMeterStart', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input: RegisterFlightInput = { ...BASE_INPUT, hourMeterStart: 1050, hourMeterEnd: 1050 };

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('derives flightDate as the Europe/Rome calendar day of takeoffAt, not the UTC day (a 00:30 Roma takeoff is 23:30Z the day before)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 40 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      // 2020-01-15T23:30Z is 2020-01-16T00:30 in Europe/Rome (CET, +1h in January).
      const input = registerFlightSchema.parse({
        ...BASE_INPUT,
        takeoffAt: '2020-01-15T23:30:00.000Z',
        landingAt: '2020-01-16T00:10:00.000Z',
      });

      await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ flightDate: new Date('2020-01-16'), minutes: 40 }) }),
      );
    });

    it('throws a 422 SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR for a SCHOOL flight with no instructor', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL' });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // Story 9.4 (AC 1): isSolo is only meaningful on a SCHOOL flight.
    it('throws a 422 SOLO_REQUIRES_SCHOOL when isSolo=true on a non-SCHOOL flight', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'TOURISM', isSolo: true });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'SOLO_REQUIRES_SCHOOL' });
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: true, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(staffActor(), input)).resolves.toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isSolo: true }) }));
    });

    it('throws a 422 INSTRUCTOR_SAME_AS_PILOT when instructorPersonId === personId', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_1' });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_SAME_AS_PILOT' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 INSTRUCTOR_NOT_FOUND when the instructor person is unknown', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(null);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
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

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
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

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 NO_AIRCRAFT_RATE when the aircraft has no rate in effect', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue(null);

      await expect(registerFlight(staffActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'NO_AIRCRAFT_RATE' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 NO_INSTRUCTOR_RATE when the instructor has no rate in effect', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue(null);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'NO_INSTRUCTOR_RATE' });
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    it('80 minutes at 150 €/h (15000 cents/h) -> 20000 cents (the PRD-testable case)', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });

      await registerFlight(staffActor(), BASE_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 20000 }) }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountCents: -20000 }) }),
      );
    });

    it('30 minutes at 333 cents/h -> Math.round(166.5) = 167 (half-up)', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 333 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 30) });

      await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 167 }) }),
      );
    });

    it('separate rounding: sum of two independently rounded amounts, NOT a round of the combined rate', async () => {
      // 50' @ 100 c/h -> 83.33 -> 83; 50' @ 101 c/h -> 84.166 -> 84; sum = 167.
      // A naive round((100+101)*50/60) would give round(167.5) = 168 instead.
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 100 });
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 101 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 50), instructorPersonId: 'person_instructor' });

      await registerFlight(staffActor(), input);

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

  describe('registerFlight — the transaction (AC 1/2: Flight + movement(-total) + contaore advanced)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    it('creates the Flight snapshot, the FLIGHT_CHARGE movement linked via flightId, and advances the aircraft hour meter — all inside one transaction', async () => {
      await registerFlight(staffActor(), BASE_INPUT);

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
            actorUserId: 'staff_1',
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
            actorUserId: 'staff_1',
          }),
        }),
      );
      expect(aircraftUpdateMock).toHaveBeenCalledWith({
        where: { id: 'aircraft_1' },
        data: { hourMeterMinutes: 580 },
      });
    });

    it('locks the Aircraft row (FOR UPDATE) inside the transaction', async () => {
      await registerFlight(staffActor(), BASE_INPUT);

      expect(queryRawMock).toHaveBeenCalledTimes(2);
      const [firstStrings] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray];
      expect(firstStrings.join('?')).toContain('FOR UPDATE');
      expect(firstStrings.join('?')).toContain('Aircraft');
    });

    it('locks the Account row (FOR UPDATE) inside the transaction (recordAdjustment pattern)', async () => {
      await registerFlight(staffActor(), BASE_INPUT);

      const [secondStrings] = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray];
      expect(secondStrings.join('?')).toContain('FOR UPDATE');
      expect(secondStrings.join('?')).toContain('Account');
    });

    it('returns the flight DTO (with breakdown) plus the refreshed account overview', async () => {
      const result = await registerFlight(staffActor(), BASE_INPUT);

      expect(result.flight.id).toBe('flight_1');
      expect(result.flight.breakdown).toEqual({
        aircraftRateCentsPerHour: 15000,
        aircraftAmountCents: 20000,
        packageCoveredMinutes: 0,
        chargedMinutes: 80,
        packageConsumptions: [],
        totalAmountCents: 20000,
      });
      expect(result.account).toEqual(ACCOUNT_OVERVIEW);
      expect(getAccountOverviewMock).toHaveBeenCalledWith(staffActor(), 'person_1');
    });

    it('effectiveDate on the movement equals the flight date', async () => {
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-02-01', 80) });
      await registerFlight(staffActor(), input);

      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveDate: new Date('2020-02-01') }) }),
      );
    });
  });

  describe('registerFlight — with an instructor (AC 1/2)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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

      const result = await registerFlight(staffActor(), input);

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

      await expect(registerFlight(staffActor(), input)).resolves.toBeDefined();
    });

    // Story 9.4 (AC 1): "stesso importo istruttore su DC e solista a parità di
    // durata/tariffa" — isSolo is metadata only, never a monetary branch.
    it('charges the SAME aircraft/instructor amounts for a dual and a solo SCHOOL flight at the same rate/duration', async () => {
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });

      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL', isSolo: false });
      const dualInput = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: false, instructorPersonId: 'person_instructor' });
      await registerFlight(staffActor(), dualInput);

      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, flightType: 'SCHOOL', isSolo: true });
      const soloInput = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', isSolo: true, instructorPersonId: 'person_instructor' });
      await registerFlight(staffActor(), soloInput);

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

      await expect(registerFlight(staffActor(), input)).resolves.toBeDefined();
    });
  });

  describe('registerFlight — without an instructor', () => {
    it('instructor* snapshot fields are null and the DTO has instructor: null', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);

      const result = await registerFlight(staffActor(), BASE_INPUT);

      expect(getEffectiveInstructorRateMock).not.toHaveBeenCalled();
      expect(result.flight.instructor).toBeNull();
      expect(result.flight.breakdown.instructorRateCentsPerHour).toBeUndefined();
      expect(result.flight.breakdown.instructorAmountCents).toBeUndefined();
    });
  });

  describe('registerFlight — package consumption (story 5.2, AD-6, FR-13)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    it('queries eligible packages INSIDE the transaction with the AD-6 eligibility filter (personId, effectiveDate <= flightDate, expiresAt null-or->=flightDate, type associated with this aircraft) in FIFO order', async () => {
      hourPackageFindMany.mockResolvedValue([]);
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);

      await registerFlight(staffActor(), BASE_INPUT);

      expect(hourPackageFindManyMock).toHaveBeenCalledWith({
        where: {
          personId: 'person_1',
          effectiveDate: { lte: new Date('2020-01-15') },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date('2020-01-15') } }],
          packageType: { eligibleAircraft: { some: { aircraftId: 'aircraft_1' } } },
        },
        select: { id: true, includedMinutes: true, packageType: { select: { name: true } } },
        orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    it('story 5.3: the consumed-so-far groupBy filters out cancelled flights (`flight: { status: { not: "CANCELLED" } }`) — this is what "restores" minutes after a storno', async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 60, packageType: { name: 'Pacchetto 10 ore' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);

      await registerFlight(staffActor(), BASE_INPUT);

      expect(packageConsumptionGroupByMock).toHaveBeenCalledWith({
        by: ['hourPackageId'],
        where: { hourPackageId: { in: ['hp_1'] }, flight: { status: { not: 'CANCELLED' } } },
        _sum: { minutes: true },
      });
    });

    it("exact package (60' residuo on a 60' flight): covered 60, charged 0, aircraft amount 0, movement -(0) with no instructor", async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 60, packageType: { name: 'Pacchetto 10 ore' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 60) });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 60, aircraftAmountCents: 0, packageCoveredMinutes: 60 });

      const result = await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 0, packageCoveredMinutes: 60 }) }),
      );
      expect(packageConsumptionCreateManyMock).toHaveBeenCalledWith({
        data: [{ flightId: 'flight_1', hourPackageId: 'hp_1', minutes: 60 }],
      });
      expect(accountMovementCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 0 }) }));
      expect(result.flight.breakdown.packageCoveredMinutes).toBe(60);
      expect(result.flight.breakdown.chargedMinutes).toBe(0);
      expect(result.flight.breakdown.packageConsumptions).toEqual([{ hourPackageId: 'hp_1', typeName: 'Pacchetto 10 ore', minutes: 60 }]);
    });

    it("excess (70' flight, 60' package residuo): covered 60, charged 10, pro-rata aircraft amount round(rate*10/60)", async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 60, packageType: { name: 'Pacchetto 10 ore' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 70) });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 70, aircraftAmountCents: 2500, packageCoveredMinutes: 60 });

      await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 2500, packageCoveredMinutes: 60 }) }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountCents: -2500, description: expect.stringContaining('(1:00 da pacchetto)') }),
        }),
      );
    });

    it("multi-package FIFO (60'+30' residuo, volo 80'): 60 dal più vecchio, 20 dal secondo, due righe consumo", async () => {
      hourPackageFindMany.mockResolvedValue([
        { id: 'hp_old', includedMinutes: 60, packageType: { name: 'Pacchetto Vecchio' } },
        { id: 'hp_new', includedMinutes: 30, packageType: { name: 'Pacchetto Nuovo' } },
      ]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, minutes: 80, aircraftAmountCents: 0, packageCoveredMinutes: 80 });

      const result = await registerFlight(staffActor(), BASE_INPUT);

      expect(packageConsumptionCreateManyMock).toHaveBeenCalledWith({
        data: [
          { flightId: 'flight_1', hourPackageId: 'hp_old', minutes: 60 },
          { flightId: 'flight_1', hourPackageId: 'hp_new', minutes: 20 },
        ],
      });
      expect(result.flight.breakdown.packageConsumptions).toEqual([
        { hourPackageId: 'hp_old', typeName: 'Pacchetto Vecchio', minutes: 60 },
        { hourPackageId: 'hp_new', typeName: 'Pacchetto Nuovo', minutes: 20 },
      ]);
    });

    it('exhausted package (residuo 0, fully consumed already): skipped entirely, full rate charged, no PackageConsumption row', async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 60, packageType: { name: 'Pacchetto 10 ore' } }]);
      packageConsumptionGroupBy.mockResolvedValue([{ hourPackageId: 'hp_1', _sum: { minutes: 60 } }]);
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW); // aircraftAmountCents 20000 (full rate), packageCoveredMinutes 0

      const result = await registerFlight(staffActor(), BASE_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 20000, packageCoveredMinutes: 0 }) }),
      );
      expect(packageConsumptionCreateManyMock).not.toHaveBeenCalled();
      expect(result.flight.breakdown.packageConsumptions).toEqual([]);
    });

    it('purchased AFTER the flight date (effectiveDate > flightDate): filtered out at the query level, never eligible', async () => {
      // The DB-side `effectiveDate: { lte: flightDate }` filter is exactly
      // what excludes this case (asserted above) — from the service's
      // perspective, an ineligible purchase never appears in the candidate
      // list it receives, same as any other ineligible package.
      hourPackageFindMany.mockResolvedValue([]);
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);

      await registerFlight(staffActor(), BASE_INPUT);

      expect(packageConsumptionCreateManyMock).not.toHaveBeenCalled();
    });

    it('aircraft/type not eligible (no candidate found): full rate charged, residuo untouched', async () => {
      hourPackageFindMany.mockResolvedValue([]);
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);

      await registerFlight(staffActor(), BASE_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aircraftAmountCents: 20000, packageCoveredMinutes: 0 }) }),
      );
      expect(packageConsumptionCreateManyMock).not.toHaveBeenCalled();
    });

    it('total coverage with no instructor: the FLIGHT_CHARGE movement is still created, with amountCents 0 (never omitted)', async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 80, packageType: { name: 'Pacchetto Full' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, aircraftAmountCents: 0, packageCoveredMinutes: 80 });

      await registerFlight(staffActor(), BASE_INPUT);

      expect(accountMovementCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 0 }) }));
    });

    it('the instructor charge is NEVER reduced by package consumption (AD-6): full aircraft coverage + full instructor charge', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 80, packageType: { name: 'Pacchetto Full' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });
      flightCreate.mockResolvedValue({
        ...CREATED_FLIGHT_ROW,
        aircraftAmountCents: 0,
        packageCoveredMinutes: 80,
        instructorRateCentsPerHour: 10000,
        instructorAmountCents: 13333,
      });

      const result = await registerFlight(staffActor(), input);

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ instructorAmountCents: 13333, aircraftAmountCents: 0 }) }),
      );
      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amountCents: -13333 }) }),
      );
      expect(result.flight.breakdown.totalAmountCents).toBe(13333);
    });

    it('appends "(H:MM da pacchetto)" to the movement description only when coverage is non-zero (5.1 regression: byte-identical description otherwise)', async () => {
      hourPackageFindMany.mockResolvedValue([]);
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);

      await registerFlight(staffActor(), BASE_INPUT);

      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ description: 'Volo I-ABCD 2020-01-15 — 1:20' }) }),
      );
    });
  });

  describe('registerFlight — negative-balance band alert (FR-27, reuses accounts.service verbatim)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    // Note: no microtask-flush wait is needed here — unlike
    // `accounts.service.test.ts` (which exercises the REAL
    // `sendNegativeBalanceAlert`, an async function with its own internal
    // `await`s), this suite mocks `sendNegativeBalanceAlert` itself: the
    // `void sendNegativeBalanceAlertMock(...)` call inside `registerFlight`
    // happens synchronously, before its returned promise resolves.

    it('ok -> negative (a 20000-cent charge crossing zero) sends the alert, post-commit', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 5000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: -15000 });

      await registerFlight(staffActor(), BASE_INPUT);

      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledTimes(1);
      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledWith(
        'person_1',
        expect.objectContaining({ firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com' }),
        -15000,
      );
    });

    it('does NOT send when the band is unchanged (already comfortably positive before and after)', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 1_000_000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: 980_000 });

      await registerFlight(staffActor(), BASE_INPUT);

      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
    });
  });

  describe('cancelFlight (story 5.3, AC 1/3/4)', () => {
    const CANCEL_INPUT = cancelFlightSchema.parse({ reason: 'Errore inserimento' });

    beforeEach(() => {
      flightFindUnique.mockResolvedValue(ORIGINAL_FLIGHT_ROW);
      accountMovementCreate.mockResolvedValue({ id: 'movement_reversal' });
      flightUpdate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_orig', status: 'CANCELLED' });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    });

    it('rejects a non-staff actor (flights.manage required), before touching the DB', async () => {
      await expect(cancelFlight(pilotActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(ForbiddenError);
      expect(flightFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown flight', async () => {
      flightFindUnique.mockResolvedValue(null);

      await expect(cancelFlight(staffActor(), 'nope', CANCEL_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError (409) when the flight is already CANCELLED', async () => {
      flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, status: 'CANCELLED' });

      await expect(cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(ConflictError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("throws ConflictError naming the manual adjustment when the charge's reversal slot is already taken on a still-REGISTERED flight (review 5.3 M1)", async () => {
      flightFindUnique.mockResolvedValue({
        ...ORIGINAL_FLIGHT_ROW,
        movements: [{ id: 'movement_orig', amountCents: -20000, accountId: 'account_1', reversal: { id: 'adj_1' } }],
      });

      await expect(cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(
        /already been reversed by a manual adjustment/,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('P2002 on reversalOfId (concurrent double-cancel) surfaces as ConflictError (backstop for the pre-check)', async () => {
      accountMovementCreate.mockRejectedValueOnce({ code: 'P2002' });

      await expect(cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(ConflictError);
    });

    it('creates the FLIGHT_CHARGE_REVERSAL movement: +|original amount|, reversalOfId, flightId, description with the reason', async () => {
      await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(accountMovementCreateMock).toHaveBeenCalledWith({
        data: {
          accountId: 'account_1',
          type: 'FLIGHT_CHARGE_REVERSAL',
          amountCents: 20000,
          reversalOfId: 'movement_orig',
          flightId: 'flight_orig',
          effectiveDate: todayDateOnlyUtc(),
          description: 'Storno volo I-ABCD 2020-01-15 — Errore inserimento',
          actorUserId: 'staff_1',
        },
      });
    });

    it('sets status CANCELLED, cancelledAt and cancelReason on the flight', async () => {
      await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(flightUpdateMock).toHaveBeenCalledWith({
        where: { id: 'flight_orig' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelReason: 'Errore inserimento' },
        select: expect.anything(),
      });
    });

    it('reduces the aircraft hour meter by the flight minutes', async () => {
      await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(aircraftUpdateMock).toHaveBeenCalledWith({
        where: { id: 'aircraft_1' },
        data: { hourMeterMinutes: 420 }, // 500 - 80
      });
    });

    it('clamps the aircraft hour meter at 0 (deliberate, Contesto) when a prior rectification already undershot it', async () => {
      queryRawMock.mockReset();
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 50 }]).mockResolvedValueOnce([]); // 50 - 80 would be negative

      await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(aircraftUpdateMock).toHaveBeenCalledWith({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 0 } });
    });

    it('sends NO negative-balance alert (a storno only ever adds money back)', async () => {
      await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(getNegativeBalanceThresholdCentsMock).not.toHaveBeenCalled();
      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
    });

    it('returns the updated flight DTO plus the refreshed account overview', async () => {
      const result = await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(result.flight.status).toBe('CANCELLED');
      expect(result.account).toEqual(ACCOUNT_OVERVIEW);
      expect(getAccountOverviewMock).toHaveBeenCalledWith(staffActor(), 'person_1');
    });

    it('locks the Aircraft row then the Account row (FOR UPDATE, same macro order as registerFlight)', async () => {
      await cancelFlight(staffActor(), 'flight_orig', CANCEL_INPUT);

      expect(queryRawMock).toHaveBeenCalledTimes(2);
      const [firstStrings] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray];
      expect(firstStrings.join('?')).toContain('FOR UPDATE');
      expect(firstStrings.join('?')).toContain('Aircraft');
      const [secondStrings] = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray];
      expect(secondStrings.join('?')).toContain('FOR UPDATE');
      expect(secondStrings.join('?')).toContain('Account');
    });
  });

  describe('correctFlight (story 5.3, AC 2/3/4)', () => {
    const CORRECT_INPUT = correctFlightSchema.parse({
      aircraftId: 'aircraft_1',
      personId: 'person_1',
      departureAirfield: 'Base Airfield',
      arrivalAirfield: 'Base Airfield',
      flightType: 'TOURISM',
      ...buildTimes('2020-01-15', 30),
      reason: 'Errore minuti',
    });

    beforeEach(() => {
      flightFindUnique.mockResolvedValue(ORIGINAL_FLIGHT_ROW);
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      getNegativeBalanceThresholdCentsMock.mockResolvedValue(-20000);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_x' });
      flightUpdate.mockResolvedValue({});
      hourPackageFindMany.mockResolvedValue([]);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_new', correctionOfId: 'flight_orig', minutes: 30, aircraftAmountCents: 7500 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1', hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    });

    it('rejects a non-staff actor (flights.manage required), before touching the DB', async () => {
      await expect(correctFlight(pilotActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(ForbiddenError);
      expect(flightFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown flight', async () => {
      flightFindUnique.mockResolvedValue(null);

      await expect(correctFlight(staffActor(), 'nope', CORRECT_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError (409) when the flight is already CANCELLED', async () => {
      flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, status: 'CANCELLED' });

      await expect(correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(ConflictError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("throws ConflictError naming the manual adjustment when the charge's reversal slot is already taken on a still-REGISTERED flight (review 5.3 M1)", async () => {
      flightFindUnique.mockResolvedValue({
        ...ORIGINAL_FLIGHT_ROW,
        movements: [{ id: 'movement_orig', amountCents: -20000, accountId: 'account_1', reversal: { id: 'adj_1' } }],
      });

      await expect(correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(
        /already been reversed by a manual adjustment/,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('422 AIRCRAFT_ARCHIVED when the corrected data targets an archived aircraft — re-validates the NEW data from scratch, transaction never opens', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_2', registration: 'I-ARCH', archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, aircraftId: 'aircraft_2' });

      await expect(correctFlight(staffActor(), 'flight_orig', input)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('P2002 on reversalOfId (concurrent double-cancel/-correct) surfaces as ConflictError (backstop for the pre-check)', async () => {
      accountMovementCreate.mockRejectedValueOnce({ code: 'P2002' });

      await expect(correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(ConflictError);
    });

    it('ONE transaction, in order: lock -> storno (status + REVERSAL movement) -> saldo-prima -> nuova registrazione', async () => {
      await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      // Lock (both queryRaw calls) before the storno write.
      expect(queryRawMock.mock.invocationCallOrder[1]).toBeLessThan(flightUpdateMock.mock.invocationCallOrder[0]);
      // Storno: status update, then the REVERSAL movement (first accountMovement.create call).
      expect(flightUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(accountMovementCreateMock.mock.invocationCallOrder[0]);
      expect(accountMovementCreateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ type: 'FLIGHT_CHARGE_REVERSAL' }) }));
      // Saldo-prima (registerFlightCore's own aggregate) happens AFTER the storno's movement.
      expect(accountMovementCreateMock.mock.invocationCallOrder[0]).toBeLessThan(accountMovementAggregateMock.mock.invocationCallOrder[0]);
      // Nuova registrazione (Flight.create) happens AFTER the saldo-prima read.
      expect(accountMovementAggregateMock.mock.invocationCallOrder[0]).toBeLessThan(flightCreateMock.mock.invocationCallOrder[0]);
      // The second accountMovement.create call is the new FLIGHT_CHARGE.
      expect(accountMovementCreateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ type: 'FLIGHT_CHARGE' }) }));
    });

    it('sets Flight.correctionOfId on the new flight to the ORIGINAL flight id', async () => {
      await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ correctionOfId: 'flight_orig' }) }));
    });

    it("storno's reversal movement carries the ORIGINAL amount and links to the original flight/movement", async () => {
      await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      expect(accountMovementCreateMock).toHaveBeenNthCalledWith(1, {
        data: {
          accountId: 'account_1',
          type: 'FLIGHT_CHARGE_REVERSAL',
          amountCents: 20000,
          reversalOfId: 'movement_orig',
          flightId: 'flight_orig',
          effectiveDate: todayDateOnlyUtc(),
          description: 'Storno volo I-ABCD 2020-01-15 — Errore minuti',
          actorUserId: 'staff_1',
        },
      });
    });

    it('the ORIGINAL flight is stornoed (status CANCELLED + cancelledAt/cancelReason) and its aircraft hour meter reduced', async () => {
      await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      expect(flightUpdateMock).toHaveBeenCalledWith({
        where: { id: 'flight_orig' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelReason: 'Errore minuti' },
      });
      expect(aircraftUpdateMock).toHaveBeenCalledWith({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 420 } }); // 500 - 80
    });

    it("registerFlightCore's own consumed-so-far groupBy filters out CANCELLED flights INSIDE the same correction transaction (this is what lets restored minutes be reused immediately)", async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 60, packageType: { name: 'Pacchetto' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_new', correctionOfId: 'flight_orig', minutes: 30, aircraftAmountCents: 0 });

      await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      expect(packageConsumptionGroupByMock).toHaveBeenCalledWith({
        by: ['hourPackageId'],
        where: { hourPackageId: { in: ['hp_1'] }, flight: { status: { not: 'CANCELLED' } } },
        _sum: { minutes: true },
      });
    });

    it('fires the negative-balance alert when the (post-storno) balance band worsens', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 5000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: -15000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_new', correctionOfId: 'flight_orig', minutes: 200, aircraftAmountCents: 50000 });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, ...buildTimes('2020-01-15', 200) });

      await correctFlight(staffActor(), 'flight_orig', input);

      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledTimes(1);
      expect(sendNegativeBalanceAlertMock).toHaveBeenCalledWith(
        'person_1',
        expect.objectContaining({ firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com' }),
        -15000,
      );
    });

    it('does NOT send when the band is unchanged', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 1_000_000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: 980_000 });

      await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
    });

    it('returns the NEW flight DTO plus the corrected data\'s account overview', async () => {
      const result = await correctFlight(staffActor(), 'flight_orig', CORRECT_INPUT);

      expect(result.flight.id).toBe('flight_new');
      expect(result.flight.correctionOfId).toBe('flight_orig');
      expect(getAccountOverviewMock).toHaveBeenCalledWith(staffActor(), 'person_1');
    });

    it('locks ALL involved Aircraft ids in ONE IN (...) ORDER BY id query, then ALL involved Account ids the same way (deterministic order, Aircraft before Account)', async () => {
      const secondAircraft = { id: 'aircraft_2', registration: 'I-WXYZ', archivedAt: null };
      aircraftFindUnique.mockResolvedValue(secondAircraft);
      queryRawMock.mockReset();
      queryRaw
        .mockResolvedValueOnce([
          { id: 'aircraft_1', hourMeterMinutes: 500 },
          { id: 'aircraft_2', hourMeterMinutes: 100 },
        ])
        .mockResolvedValueOnce([]);
      accountUpsert.mockResolvedValue({ id: 'account_2' });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, aircraftId: 'aircraft_2', personId: 'person_2' });
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, id: 'person_2' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_new', correctionOfId: 'flight_orig', aircraft: secondAircraft });

      await correctFlight(staffActor(), 'flight_orig', input);

      expect(queryRawMock).toHaveBeenCalledTimes(2);
      const [aircraftStrings] = queryRawMock.mock.calls[0] as unknown as [TemplateStringsArray];
      expect(aircraftStrings.join('?')).toContain('FOR UPDATE');
      expect(aircraftStrings.join('?')).toContain('Aircraft');
      expect(aircraftStrings.join('?')).toContain('IN');
      expect(aircraftStrings.join('?')).toContain('ORDER BY');
      const [accountStrings] = queryRawMock.mock.calls[1] as unknown as [TemplateStringsArray];
      expect(accountStrings.join('?')).toContain('FOR UPDATE');
      expect(accountStrings.join('?')).toContain('Account');
      expect(accountStrings.join('?')).toContain('IN');
      expect(accountStrings.join('?')).toContain('ORDER BY');
      // Aircraft lock strictly before Account lock (module doc-comment's macro order).
      expect(queryRawMock.mock.invocationCallOrder[0]).toBeLessThan(queryRawMock.mock.invocationCallOrder[1]);
      // Both aircraft rows resolved to a hour-meter value (Map keyed by id) — the NEW aircraft's is used for the core's increment (100 + 30 minutes).
      expect(aircraftUpdateMock).toHaveBeenCalledWith({ where: { id: 'aircraft_2' }, data: { hourMeterMinutes: 130 } });
      expect(aircraftUpdateMock).toHaveBeenCalledWith({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 420 } });
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

      await listFlights(staffActor(), baseQuery());

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

    it('staff: builds the where clause from combined filters (period gte/lte date-only, aircraftId, personId, flightType, status)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(
        staffActor(),
        baseQuery({ dateFrom: '2026-01-01', dateTo: '2026-01-31', aircraftId: 'aircraft_9', personId: 'person_9', flightType: 'SCHOOL', status: 'REGISTERED' }),
      );

      const expectedWhere = {
        flightDate: { gte: parseDateOnlyUtc('2026-01-01'), lte: parseDateOnlyUtc('2026-01-31') },
        aircraftId: 'aircraft_9',
        personId: 'person_9',
        flightType: 'SCHOOL',
        status: 'REGISTERED',
      };
      expect(flightFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
      expect(flightCountMock).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('staff: no OR own-access scope in the where clause (sees every flight)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(staffActor(), baseQuery());

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

      await listFlights(staffActor(), baseQuery({ instructorPersonId: 'person_instructor_9' }));

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

      const result = await getFlightTotals(staffActor(), baseQuery());

      expect(result).toEqual({ count: 25, minutes: 3000, takeoffs: 25, landings: 25, revenueCents: 600000 });
    });

    it('defaults every _sum field to 0 when the aggregate returns null (no matching rows)', async () => {
      flightAggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { minutes: null, takeoffs: null, landings: null, aircraftAmountCents: null, instructorAmountCents: null },
      });

      const result = await getFlightTotals(staffActor(), baseQuery());

      expect(result).toEqual({ count: 0, minutes: 0, takeoffs: 0, landings: 0, revenueCents: 0 });
    });

    it('forces status: REGISTERED in the WHERE even when the query filters status: CANCELLED', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(staffActor(), baseQuery({ status: 'CANCELLED' }));

      expect(flightAggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'REGISTERED' }) }));
    });

    it('forces status: REGISTERED even with no status filter at all (query.status undefined)', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(staffActor(), baseQuery());

      expect(flightAggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'REGISTERED' } }));
    });

    it('forwards the filter args (dateFrom/dateTo/aircraftId/flightType) into the WHERE, alongside the forced status', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(
        staffActor(),
        baseQuery({ dateFrom: '2026-01-01', dateTo: '2026-01-31', aircraftId: 'aircraft_9', flightType: 'SCHOOL' }),
      );

      expect(flightAggregateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            flightDate: { gte: parseDateOnlyUtc('2026-01-01'), lte: parseDateOnlyUtc('2026-01-31') },
            aircraftId: 'aircraft_9',
            flightType: 'SCHOOL',
            status: 'REGISTERED',
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
            status: 'REGISTERED',
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

  it('accepts an optional hourMeterStart/hourMeterEnd pair, with NO schema-level cross-field check anymore (moved to the service)', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 100, hourMeterEnd: 90 }).success).toBe(true);
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 100 }).success).toBe(true);
  });

  it('rejects an invalid flightType', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, flightType: 'JOYRIDE' }).success).toBe(false);
  });

  it('accepts an omitted or null instructorPersonId/notes; omitted takeoffs/landings', () => {
    expect(registerFlightSchema.safeParse(VALID).success).toBe(true);
    expect(registerFlightSchema.safeParse({ ...VALID, instructorPersonId: null, notes: null }).success).toBe(true);
  });

  it('rejects a notes string over 1000 chars', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, notes: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('rejects takeoffs/landings outside [0, 500]', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, landings: -1 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, landings: 501 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, landings: 0 }).success).toBe(true);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: -1 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, takeoffs: 501 }).success).toBe(false);
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
      status: 'CANCELLED',
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

  it('rejects an invalid status', () => {
    expect(listFlightsQuerySchema.safeParse({ status: 'DELETED' }).success).toBe(false);
  });
});
