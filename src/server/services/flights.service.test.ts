import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toDateOnlyString, todayDateOnlyUtc } from '@/lib/date-only';
import { registerFlightSchema, type RegisterFlightInput } from '@/lib/schemas/flights';
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
      findMany: vi.fn(),
      count: vi.fn(),
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
const { listFlights, registerFlight } = await import('./flights.service');
const { NotFoundError } = await import('./errors');

const aircraftFindUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const aircraftUpdateMock = vi.mocked(prisma.aircraft.update);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const flightCreateMock = vi.mocked(prisma.flight.create);
const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const flightCountMock = vi.mocked(prisma.flight.count);
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
const accountMovementCreate = accountMovementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightCreate = flightCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightFindMany = flightFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightCount = flightCountMock as unknown as { mockResolvedValue: (v: number) => void };
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
const INSTRUCTOR_PROFILE_ROW = { instructorProfile: { id: 'instr_profile_1', deactivatedAt: null } };

const ACCOUNT_OVERVIEW = { account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') }, balanceCents: 0, recentMovements: [] };

const CREATED_FLIGHT_ROW = {
  id: 'flight_1',
  flightDate: new Date('2020-01-15T00:00:00.000Z'),
  flightType: 'PRIVATE' as const,
  status: 'REGISTERED' as const,
  minutes: 80,
  hourMeterStart: null,
  hourMeterEnd: null,
  landings: null,
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
  aircraft: { id: 'aircraft_1', registration: 'I-ABCD' },
  person: { id: 'person_1', firstName: 'Mario', lastName: 'Rossi' },
  instructorProfile: null,
  actorUser: { email: 'staff@airmanager.local' },
  packageConsumptions: [] as { hourPackageId: string; minutes: number; hourPackage: { packageType: { name: string } } }[],
};

// Safely in the past no matter when this suite runs (same `PAST_DATE`
// convention as the e2e specs) — `registerFlight`'s `FLIGHT_DATE_IN_FUTURE`
// guard compares against the REAL server clock, so a fixed past date keeps
// every "happy path" test below independent of wall-clock time.
const BASE_INPUT = registerFlightSchema.parse({
  aircraftId: 'aircraft_1',
  personId: 'person_1',
  flightDate: '2020-01-15',
  flightType: 'PRIVATE',
  minutes: 80,
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
    flightFindManyMock.mockReset();
    flightCountMock.mockReset();
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
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightDate: '9999-12-31' });

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
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightDate: toDateOnlyString(todayDateOnlyUtc()) });

      await expect(registerFlight(staffActor(), input)).resolves.toBeDefined();
    });

    it('throws a 422 HOUR_METER_INVALID when hourMeterEnd <= hourMeterStart (service re-verifies the inequality, even though Zod already rejects this shape at the boundary)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      // Bypasses `registerFlightSchema.parse` on purpose (Zod's own
      // superRefine already rejects `end <= start` — this test targets the
      // SERVICE's independent re-verification of the inequality, Dev Notes).
      const input: RegisterFlightInput = {
        aircraftId: 'aircraft_1',
        personId: 'person_1',
        flightDate: '2020-01-15',
        flightType: 'PRIVATE',
        hourMeterStart: 1050,
        hourMeterEnd: 1050,
      };

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('derives minutes as hourMeterEnd - hourMeterStart', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, hourMeterStart: 1000, hourMeterEnd: 1050, minutes: 50 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({
        aircraftId: 'aircraft_1',
        personId: 'person_1',
        flightDate: '2020-01-15',
        flightType: 'PRIVATE',
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

    it('throws a 422 SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR for a SCHOOL flight with no instructor', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL' });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR' });
      expect(transactionMock).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce({ instructorProfile: { id: 'instr_profile_1', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(staffActor(), input)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOT_FOUND' });
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
      const input = registerFlightSchema.parse({ ...BASE_INPUT, minutes: 30 });

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
      const input = registerFlightSchema.parse({ ...BASE_INPUT, minutes: 50, instructorPersonId: 'person_instructor' });

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
            flightType: 'PRIVATE',
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
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightDate: '2020-02-01' });
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

    it('an instructor is allowed (never required) on a PRIVATE flight (e.g. a checkride)', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, instructorRateCentsPerHour: 10000, instructorAmountCents: 13333 });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'PRIVATE', instructorPersonId: 'person_instructor' });

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

    it("exact package (60' residuo on a 60' flight): covered 60, charged 0, aircraft amount 0, movement -(0) with no instructor", async () => {
      hourPackageFindMany.mockResolvedValue([{ id: 'hp_1', includedMinutes: 60, packageType: { name: 'Pacchetto 10 ore' } }]);
      packageConsumptionGroupBy.mockResolvedValue([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, minutes: 60 });
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
      const input = registerFlightSchema.parse({ ...BASE_INPUT, minutes: 70 });
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

  describe('listFlights (AC 1/2 — staff-only paginated registry, story 5.4 owns filters/own-access)', () => {
    it('rejects an actor without flights.manage', async () => {
      await expect(listFlights(pilotActor(), { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      expect(flightFindManyMock).not.toHaveBeenCalled();
    });

    it('orders by flightDate desc, createdAt desc, id desc', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(staffActor(), { page: 1, pageSize: 20 });

      expect(flightFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ flightDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('maps rows through the same DTO shape as registerFlight (breakdown computed, actorEmail present)', async () => {
      flightFindMany.mockResolvedValue([CREATED_FLIGHT_ROW]);
      flightCount.mockResolvedValue(1);

      const result = await listFlights(adminActor(), { page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.items[0]?.actorEmail).toBe('staff@airmanager.local');
      expect(result.items[0]?.breakdown.totalAmountCents).toBe(20000);
    });
  });
});

describe('registerFlightSchema (story 5.1, Task 4, AC 1/2/3; AD-2)', () => {
  const VALID = {
    aircraftId: 'aircraft_1',
    personId: 'person_1',
    flightDate: '2026-07-08',
    flightType: 'PRIVATE' as const,
  };

  it('accepts minutes alone', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80 }).success).toBe(true);
  });

  it('accepts the hourMeterStart/hourMeterEnd pair alone', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 100, hourMeterEnd: 180 }).success).toBe(true);
  });

  it('rejects neither minutes nor the hourMeter pair', () => {
    expect(registerFlightSchema.safeParse({ ...VALID }).success).toBe(false);
  });

  it('rejects BOTH minutes and the hourMeter pair at once', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, hourMeterStart: 100, hourMeterEnd: 180 }).success).toBe(false);
  });

  it('rejects hourMeterStart without hourMeterEnd', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 100 }).success).toBe(false);
  });

  it('rejects hourMeterEnd <= hourMeterStart', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 100, hourMeterEnd: 100 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 100, hourMeterEnd: 90 }).success).toBe(false);
  });

  it('rejects a derived duration over 1440 minutes (24h)', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 0, hourMeterEnd: 1441 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, hourMeterStart: 0, hourMeterEnd: 1440 }).success).toBe(true);
  });

  it('rejects minutes over 1440 or below 1', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 1441 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 0 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 1 }).success).toBe(true);
  });

  it('rejects an invalid flightType', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, flightType: 'JOYRIDE' }).success).toBe(false);
  });

  it('rejects a malformed flightDate', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, flightDate: '08/07/2026' }).success).toBe(false);
  });

  it('accepts an omitted or null instructorPersonId/landings/notes', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80 }).success).toBe(true);
    expect(
      registerFlightSchema.safeParse({ ...VALID, minutes: 80, instructorPersonId: null, landings: null, notes: null }).success,
    ).toBe(true);
  });

  it('rejects a notes string over 1000 chars', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, notes: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('rejects landings outside [0, 500]', () => {
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, landings: -1 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, landings: 501 }).success).toBe(false);
    expect(registerFlightSchema.safeParse({ ...VALID, minutes: 80, landings: 0 }).success).toBe(true);
  });
});
