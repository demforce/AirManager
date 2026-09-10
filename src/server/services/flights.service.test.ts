import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import {
  cancelFlightSchema,
  correctFlightSchema,
  listFlightsQuerySchema,
  registerFlightSchema,
  type RegisterFlightInput,
} from '@/lib/schemas/flights';
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
    },
    flight: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    // Review F5 (ratifica R-14.4-a) — `findMissingBlockingDocuments`'s own
    // direct queries (never routed through the mocked `bookings.service`
    // below, module doc-comment on that function): `expiryType.findMany`
    // (the applicable blocksBooking catalogue) and `expiry.findMany` (which
    // of those the person already has registered).
    expiryType: {
      findMany: vi.fn(),
    },
    expiry: {
      findMany: vi.fn(),
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

// Story 14.4 (AC 1) — `flights.service.ts` reuses `bookings.service.ts`'s
// `findBlockingExpiredDocuments` verbatim (never reimplements the scan).
// Mocked at the module boundary, same rationale as `rates.service`/
// `instructor-rates.service` above: `bookings.service.ts` itself has its own
// dedicated test suite for the ACTUAL date-comparison logic
// (`bookings.service.test.ts`) — this file only needs to verify flights.service
// CALLS it correctly (which person(s), which date) and handles its result.
const findBlockingExpiredDocumentsMock = vi.fn();
vi.mock('./bookings.service', () => ({
  findBlockingExpiredDocuments: (...args: unknown[]) => findBlockingExpiredDocumentsMock(...args),
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
const expiryTypeFindManyMock = vi.mocked(prisma.expiryType.findMany);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
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
const queryRaw = queryRawMock as unknown as {
  mockResolvedValueOnce: (v: unknown[]) => { mockResolvedValueOnce: (v: unknown[]) => void };
};
const expiryTypeFindMany = expiryTypeFindManyMock as unknown as {
  mockResolvedValue: (v: Array<{ id: string; name: string }>) => void;
  mockResolvedValueOnce: (v: Array<{ id: string; name: string }>) => { mockResolvedValueOnce: (v: Array<{ id: string; name: string }>) => void };
};
const expiryFindMany = expiryFindManyMock as unknown as { mockResolvedValue: (v: Array<{ expiryTypeId: string }>) => void };

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
// Review F6 — `firstName`/`lastName` added (previously absent) so a test can
// assert the instructor's NAME on a blocked document (`FlightBlockingDocument.personName`)
// without it silently rendering "undefined undefined"; every PRE-EXISTING
// test using this fixture ignores these two fields, so adding them is safe.
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
  // Story 14.3 review F3 — the flight's OWN recorded type, needed so
  // `correctFlight` can exempt a correction that keeps it unchanged.
  flightType: 'TOURISM' as const,
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
    expiryTypeFindManyMock.mockReset();
    expiryFindManyMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    getAccountOverviewMock.mockReset();
    getNegativeBalanceThresholdCentsMock.mockReset();
    sendNegativeBalanceAlertMock.mockReset();
    getEffectiveRateMock.mockReset();
    getEffectiveInstructorRateMock.mockReset();
    findBlockingExpiredDocumentsMock.mockReset();

    getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    getNegativeBalanceThresholdCentsMock.mockResolvedValue(-20000);
    getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
    // Story 14.4 default: no blocking document — every PRE-EXISTING test in
    // this file (none of which cares about this guard) keeps passing
    // unmodified; the dedicated describe block below overrides this per test.
    findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });
    // Review F5 default: no APPLICABLE blocksBooking type at all -> nothing
    // ever reported missing (`findMissingBlockingDocuments` short-circuits on
    // `applicableTypes.length === 0`, so `expiry.findMany`'s own default here
    // is never even reached by most tests) — same "every pre-existing test
    // keeps passing unmodified" rationale as the mock above.
    expiryTypeFindMany.mockResolvedValue([]);
    expiryFindMany.mockResolvedValue([]);
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

    // --- story AOG-1a, P2 (ratifica R-AOG-c): the out-of-service guard -------
    // Before this story `registerFlight` on a grounded aircraft succeeded: the
    // select did not even read `status` (measured at runtime — the only thing
    // that stopped such a flight was its DATE).

    it('throws a 422 AIRCRAFT_OUT_OF_SERVICE for a grounded aircraft, with reason and date in details (AC 8)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        code: 'AIRCRAFT_OUT_OF_SERVICE',
        // The SAME `details` shape the three booking guards carry — one domain
        // error, one contract (AD-3).
        details: { reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' },
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('carries outOfServiceUntil: null when the grounding has no expected return date (invariant [b])', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, outOfServiceUntil: null });
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        code: 'AIRCRAFT_OUT_OF_SERVICE',
        details: { reason: 'Revisione 100h', outOfServiceUntil: null },
      });
    });

    it('a grounding whose outOfServiceUntil is in the PAST still blocks — invariant [a] (AC 2)', async () => {
      // The date never returns the aircraft to service by itself: only `status`
      // decides, and the guard reads nothing else.
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, outOfServiceUntil: new Date(Date.UTC(2020, 0, 1)) });
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        code: 'AIRCRAFT_OUT_OF_SERVICE',
        details: { reason: 'Revisione 100h', outOfServiceUntil: '2020-01-01' },
      });
    });

    it('an aircraft that is BOTH archived and grounded answers AIRCRAFT_ARCHIVED — state before domain (AC 9)', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      personFindUnique.mockResolvedValue(PILOT_PERSON);

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
    });

    it('the grounding is checked BEFORE the flight date — a FUTURE-dated flight on a grounded aircraft answers AIRCRAFT_OUT_OF_SERVICE (AC 8, the story probe)', async () => {
      // This IS the story's own runtime probe, as a unit test: pre-fix the
      // service answered `FLIGHT_DATE_IN_FUTURE` (measured), because no
      // out-of-service guard existed anywhere on this path.
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const future = new Date(Date.now() + 400 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes(future, 60) });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'AIRCRAFT_OUT_OF_SERVICE' });
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);

      await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
        queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
        queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, ...buildTimes('2020-01-15', 1440) });

      await expect(registerFlight(adminActor(), input)).resolves.toBeDefined();
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

      await registerFlight(adminActor(), input);

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

      await registerFlight(adminActor(), input);

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

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 HOUR_METER_INVALID when only hourMeterEnd is given (incomplete pair)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, hourMeterEnd: 1050 });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws a 422 HOUR_METER_INVALID when hourMeterEnd <= hourMeterStart', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      const input: RegisterFlightInput = { ...BASE_INPUT, hourMeterStart: 1050, hourMeterEnd: 1050 };

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({ code: 'HOUR_METER_INVALID' });
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    it('80 minutes at 150 €/h (15000 cents/h) -> 20000 cents (the PRD-testable case)', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });

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
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 333 });
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
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 100 });
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
      expect(aircraftUpdateMock).toHaveBeenCalledWith({
        where: { id: 'aircraft_1' },
        data: { hourMeterMinutes: 580 },
      });
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
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    it('does NOT throw when the post-commit `getAccountOverview` re-read fails — degrades to the balance already computed inside the transaction', async () => {
      getAccountOverviewMock.mockRejectedValueOnce(new Error('transient read failure'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await registerFlight(adminActor(), BASE_INPUT);

      // The flight + charge + hour-meter write already happened — exactly
      // once — before the failing read.
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
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
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
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);

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

  describe('registerFlight — blocking expiry guard-rail (story 14.4, AC 1/2/6; ratifica R4)', () => {
    beforeEach(() => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      accountUpsert.mockResolvedValue({ id: 'account_1' });
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
      accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
      getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
      flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    });

    it('a blocking document expired at the FLIGHT DATE (not "today") -> 422 FLIGHT_BLOCKED_BY_EXPIRY, transaction never opens', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({
        blockingDocuments: [{ typeName: 'Visita medica classe 2', expiresAt: '2019-12-31' }],
        warnings: [],
      });

      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        code: 'FLIGHT_BLOCKED_BY_EXPIRY',
        details: { documents: [{ typeName: 'Visita medica classe 2', expiresAt: '2019-12-31' }] },
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // AC 6: "valido alla data del volo ma scaduto oggi -> OK (la data conta)".
    // The date-comparison arithmetic itself lives in, and is tested by,
    // `bookings.service.test.ts` (the shared helper is mocked here, module
    // doc-comment) — this asserts the CALLER side of that contract: flights.service
    // asks the helper about `flightDate` (2020-01-15, `BASE_INPUT`'s own date),
    // never "today" (the real server clock, wildly different in a test run).
    it('is anchored to the FLIGHT DATE, never "today" — succeeds when the shared helper reports nothing blocking for that date', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });

      await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();

      expect(findBlockingExpiredDocumentsMock).toHaveBeenCalledWith('person_1', '2020-01-15');
    });

    it('an instructor with a blocking document (pilot clear) -> 422 FLIGHT_BLOCKED_BY_EXPIRY, naming the instructor\'s document', async () => {
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
      findBlockingExpiredDocumentsMock
        .mockResolvedValueOnce({ blockingDocuments: [], warnings: [] }) // pilot: clear
        .mockResolvedValueOnce({ blockingDocuments: [{ typeName: 'Visita medica classe 1', expiresAt: '2019-06-01' }], warnings: [] }); // instructor: blocked
      const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({
        code: 'FLIGHT_BLOCKED_BY_EXPIRY',
        details: { documents: [{ typeName: 'Visita medica classe 1', expiresAt: '2019-06-01' }] },
      });
      expect(findBlockingExpiredDocumentsMock).toHaveBeenCalledWith('person_1', '2020-01-15');
      expect(findBlockingExpiredDocumentsMock).toHaveBeenCalledWith('person_instructor', '2020-01-15');
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('an ADMIN forcing past a real block succeeds and stamps forcedAt/forcedByUserId/forceReason on the Flight row', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({
        blockingDocuments: [{ typeName: 'Visita medica classe 2', expiresAt: '2019-12-31' }],
        warnings: [],
      });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'Autorizzato dal direttore per volo urgente' });

      const result = await registerFlight(adminActor(), input);

      expect(result).toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            forcedByUserId: 'admin_1',
            forceReason: 'Autorizzato dal direttore per volo urgente',
            forcedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('force: true from an ADMIN with NOTHING to bypass registers normally and stamps NOTHING (Dev Notes: "scavalcato un blocco", not "spuntata una checkbox")', async () => {
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'Non necessario ma fornito' });

      await registerFlight(adminActor(), input);

      const data = (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data['forcedAt']).toBeUndefined();
      expect(data['forcedByUserId']).toBeUndefined();
      expect(data['forceReason']).toBeUndefined();
    });

    // Schema-level guard (both exported schemas — `registerFlightSchema` is a
    // `.refine()`d `ZodEffects`, `correctFlightSchema` is built off the SAME
    // shared `registerFlightFields` base via `.extend().refine()` — see
    // `flights.ts`'s own doc-comments for why the two can't just chain):
    // `forceReason` is required UNCONDITIONALLY whenever `force` is `true`,
    // same convention as `createBookingSchema`.
    it('registerFlightSchema/correctFlightSchema both reject force: true without a forceReason', () => {
      expect(() => registerFlightSchema.parse({ ...BASE_INPUT, force: true })).toThrow();
      expect(() =>
        correctFlightSchema.parse({ ...BASE_INPUT, force: true, reason: 'Motivo correzione' }),
      ).toThrow();
    });

    // --- story AOG-1a, AC 10 (ratifica R-AOG-c): ONE force, TWO blocks -------

    it('force without flights.forceExpiry is a 403, BEFORE any query — the grounded aircraft is never even read (AC 10a)', async () => {
      // `pilotActor` holds neither `flights.manage` nor `flights.forceExpiry`;
      // the ordering guarantee is what this asserts (no query ran at all).
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      const input = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'Provo comunque' });

      await expect(registerFlight(pilotActor(), input)).rejects.toThrow(ForbiddenError);
      expect(aircraftFindUniqueMock).not.toHaveBeenCalled();
    });

    it('an ADMIN derogating a grounded aircraft registers the flight and stamps the override (AC 10c)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'Volo che ha causato il fermo' });

      const result = await registerFlight(adminActor(), input);

      expect(result).toBeDefined();
      // AD-5's dead end (the flight that CAUSED the grounding) has a way out,
      // and it leaves a trace: the registro's "Deroga" badge reads this stamp.
      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ forcedByUserId: 'admin_1', forceReason: 'Volo che ha causato il fermo', forcedAt: expect.any(Date) }),
        }),
      );
    });

    it('ONE force covers a grounded aircraft AND a blocking document together, leaving exactly ONE stamp (AC 10d)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({
        blockingDocuments: [{ typeName: 'Visita medica classe 2', expiresAt: '2019-12-31' }],
        warnings: [],
      });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'Autorizzato dal direttore' });

      await registerFlight(adminActor(), input);

      const data = (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data['forceReason']).toBe('Autorizzato dal direttore');
      // ONE `Flight` row, therefore ONE stamp — there is no second override
      // record, and the operator confirmed once.
      expect(flightCreateMock).toHaveBeenCalledTimes(1);
    });

    it('WITHOUT force, a grounded aircraft AND a blocking document answers the STATE error first — and NAMES the document it would also bypass (AC 9 + review MAJOR-1)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({
        blockingDocuments: [{ typeName: 'Visita medica classe 2', expiresAt: '2019-12-31' }],
        warnings: [],
      });
      // A MISSING blocking document too (review F5's own class), so the 422
      // proves it reports BOTH scans, not just the expired one.
      expiryTypeFindMany.mockResolvedValue([{ id: 'type_licenza', name: 'Licenza' }]);
      expiryFindMany.mockResolvedValue([]);

      // Documented order: existence 404 -> state 422 -> domain 422. The
      // aircraft's state is checked next to `AIRCRAFT_ARCHIVED`, well before
      // the expiry scan runs — but since review MAJOR-1 the scan runs FOR it,
      // because the ONE `force` (R-AOG-c) that lifts the grounding lifts these
      // documents too: the admin must read them before writing the reason.
      await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
        code: 'AIRCRAFT_OUT_OF_SERVICE',
        details: {
          reason: 'Revisione 100h',
          outOfServiceUntil: '2031-05-12',
          documents: [
            { typeName: 'Visita medica classe 2', expiresAt: '2019-12-31', role: 'person', personName: 'Mario Rossi' },
            { typeName: 'Licenza', expiresAt: null, role: 'person', personName: 'Mario Rossi' },
          ],
        },
      });
    });

    it('a grounded flight whose "instructor" IS the pilot reports no instructor document — that slot is the input the guard below rejects (review MAJOR-1)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      // A person who holds BOTH profiles: without the same-as-pilot check the
      // scan would list their instructor-scoped documents as a second, phantom
      // person on the very same flight.
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, instructorProfile: { id: 'instr_profile_1', deactivatedAt: null } });
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [{ typeName: 'Visita medica classe 2', expiresAt: '2019-12-31' }], warnings: [] });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_1' });

      const error = (await registerFlight(adminActor(), input).catch((caught: unknown) => caught)) as { code: string; details: { documents: unknown[] } };
      expect(error.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
      expect(error.details.documents).toEqual([
        { typeName: 'Visita medica classe 2', expiresAt: '2019-12-31', role: 'person', personName: 'Mario Rossi' },
      ]);
    });

    it('a grounding with NOTHING else blocking carries NO documents key at all — the pre-MAJOR-1 shape, unchanged (review MAJOR-1)', async () => {
      // The complement of the test above, and the guarantee that the sentence
      // the operator reads for a plain grounding is byte-identical to the one
      // this app has always shown: an empty list is never reported as one.
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });

      const error = (await registerFlight(adminActor(), BASE_INPUT).catch((caught: unknown) => caught)) as { code: string; details: Record<string, unknown> };
      expect(error.code).toBe('AIRCRAFT_OUT_OF_SERVICE');
      expect(error.details).toEqual({ reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' });
      expect('documents' in error.details).toBe(false);
    });

    it('the instructor of a grounded flight is scanned too — the out-of-service 422 is never PARTIAL (review MAJOR-1)', async () => {
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      // Person lookup first, instructor lookup second — the SAME order
      // `resolveFlightInput` uses on its own (unblocked) path.
      personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
      findBlockingExpiredDocumentsMock.mockImplementation((personId: string) =>
        Promise.resolve({
          blockingDocuments: personId === 'person_instructor' ? [{ typeName: 'Visita medica classe 1', expiresAt: '2019-11-30' }] : [],
          warnings: [],
        }),
      );
      const input = registerFlightSchema.parse({ ...BASE_INPUT, flightType: 'SCHOOL', instructorPersonId: 'person_instructor' });

      await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({
        code: 'AIRCRAFT_OUT_OF_SERVICE',
        details: {
          documents: [{ typeName: 'Visita medica classe 1', expiresAt: '2019-11-30', role: 'instructor', personName: 'Anna Bianchi' }],
        },
      });
    });

    it('force: true on an OPERATIONAL aircraft with nothing to bypass still stamps NOTHING (AC 10e)', async () => {
      // The grounding guard must not turn `force` into "spuntata una
      // checkbox": with no block of EITHER kind the stamp stays absent.
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      personFindUnique.mockResolvedValue(PILOT_PERSON);
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });
      const input = registerFlightSchema.parse({ ...BASE_INPUT, force: true, forceReason: 'Non necessario ma fornito' });

      await registerFlight(adminActor(), input);

      const data = (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data['forcedAt']).toBeUndefined();
      expect(data['forcedByUserId']).toBeUndefined();
      expect(data['forceReason']).toBeUndefined();
    });

    // Review F5 (ratifica R-14.4-a, verbatim): "un pilota/istruttore per cui
    // NON esiste alcuna Expiry per un ExpiryType bloccante a lui applicabile
    // ⇒ 422 FLIGHT_BLOCKED_BY_EXPIRY" — a SEPARATE predicate from the expired
    // scan above (`findMissingBlockingDocuments`, never folded into the
    // mocked `findBlockingExpiredDocuments`). Review F6: the reported
    // document is tagged with WHOSE it is (`role`/`personName`), and a MISSING
    // one carries `expiresAt: null` (distinguishing "mancante" from "scaduto").
    describe('review F5/F6 — missing (never-registered) blocking document, tagged by role/personName', () => {
      it('a person with an APPLICABLE blocksBooking type but no Expiry row at all -> 422, tagged MISSING (expiresAt: null)', async () => {
        personFindUnique.mockResolvedValue(PILOT_PERSON);
        expiryTypeFindMany.mockResolvedValue([{ id: 'type_licenza', name: 'Licenza' }]);
        expiryFindMany.mockResolvedValue([]);

        await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
          code: 'FLIGHT_BLOCKED_BY_EXPIRY',
          details: { documents: [{ typeName: 'Licenza', expiresAt: null, role: 'person', personName: 'Mario Rossi' }] },
        });
        expect(transactionMock).not.toHaveBeenCalled();
        // The applicability scan asked about THIS person's own active
        // profiles (`hasActivePilot`/`hasActiveStudent`), never re-derived.
        expect(expiryTypeFindManyMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ blocksBooking: true, scope: { in: ['ALL', 'PILOTS'] } }) }),
        );
      });

      it('a person who HAS registered the applicable type is never reported missing, even with nothing expired', async () => {
        personFindUnique.mockResolvedValue(PILOT_PERSON);
        expiryTypeFindMany.mockResolvedValue([{ id: 'type_licenza', name: 'Licenza' }]);
        expiryFindMany.mockResolvedValue([{ expiryTypeId: 'type_licenza' }]);

        await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
      });

      it('no applicable blocksBooking type at all -> never even reads the registered Expiry rows (short-circuits)', async () => {
        personFindUnique.mockResolvedValue(PILOT_PERSON);
        expiryTypeFindMany.mockResolvedValue([]);

        await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
        expect(expiryFindManyMock).not.toHaveBeenCalled();
      });

      it('an instructor with an applicable type but no Expiry row -> 422, tagged MISSING with role "instructor" and the INSTRUCTOR\'S OWN name', async () => {
        personFindUnique.mockResolvedValueOnce(PILOT_PERSON).mockResolvedValueOnce(INSTRUCTOR_PROFILE_ROW);
        getEffectiveInstructorRateMock.mockResolvedValue({ priceCentsPerHour: 10000 });
        // Only the INSTRUCTOR scan (second call, scope INSTRUCTORS) reports
        // anything — the pilot's own (first call, scope PILOTS) is clear.
        expiryTypeFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'type_medica1', name: 'Visita medica classe 1' }]);
        expiryFindMany.mockResolvedValue([]);
        const input = registerFlightSchema.parse({ ...BASE_INPUT, instructorPersonId: 'person_instructor' });

        await expect(registerFlight(adminActor(), input)).rejects.toMatchObject({
          code: 'FLIGHT_BLOCKED_BY_EXPIRY',
          details: { documents: [{ typeName: 'Visita medica classe 1', expiresAt: null, role: 'instructor', personName: 'Anna Bianchi' }] },
        });
      });
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

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects a non-staff actor (flights.manage required), before touching the DB', async () => {
      await expect(cancelFlight(pilotActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(ForbiddenError);
      expect(flightFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown flight', async () => {
      flightFindUnique.mockResolvedValue(null);

      await expect(cancelFlight(adminActor(), 'nope', CANCEL_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError (409) when the flight is already CANCELLED', async () => {
      flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, status: 'CANCELLED' });

      await expect(cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(ConflictError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('story AOG-1a, AC 9: a storno is NEVER blocked by the aircraft being out of service', async () => {
      // `cancelFlight` does not go through `resolveFlightInput` at all — this
      // pins the fourth row of AD-4's table so a future refactor that routes
      // the storno through the shared resolver trips here.
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);

      await expect(cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT)).resolves.toBeDefined();
    });

    it("throws ConflictError naming the manual adjustment when the charge's reversal slot is already taken on a still-REGISTERED flight (review 5.3 M1)", async () => {
      flightFindUnique.mockResolvedValue({
        ...ORIGINAL_FLIGHT_ROW,
        movements: [{ id: 'movement_orig', amountCents: -20000, accountId: 'account_1', reversal: { id: 'adj_1' } }],
      });

      await expect(cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(
        /already been reversed by a manual adjustment/,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('P2002 on reversalOfId (concurrent double-cancel) surfaces as ConflictError (backstop for the pre-check)', async () => {
      accountMovementCreate.mockRejectedValueOnce({ code: 'P2002' });

      await expect(cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT)).rejects.toThrow(ConflictError);
    });

    // Story 14.4, AC 3 — module doc-comment: a storno only ever improves or
    // holds the balance band, so there is never a worsening signal here.
    it('balanceAlert is always false (a storno never worsens the band)', async () => {
      const result = await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(result.balanceAlert).toBe(false);
    });

    it('creates the FLIGHT_CHARGE_REVERSAL movement: +|original amount|, reversalOfId, flightId, description with the reason', async () => {
      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(accountMovementCreateMock).toHaveBeenCalledWith({
        data: {
          accountId: 'account_1',
          type: 'FLIGHT_CHARGE_REVERSAL',
          amountCents: 20000,
          reversalOfId: 'movement_orig',
          flightId: 'flight_orig',
          effectiveDate: todayDateOnlyUtcInZone(APP_TIMEZONE),
          description: 'Storno volo I-ABCD 2020-01-15 — Errore inserimento',
          actorUserId: 'admin_1',
        },
      });
    });

    // Story 16.1, AC 4 — discriminant: this writer used to date the storno on
    // the UTC calendar day, one day BEHIND the Roma day the ledger's month
    // aggregates (`currentMonthRange`) delimit on (ledger-audit MAJOR-3).
    it('story 16.1, AC 4: at 00:30 Rome on the 1st (CEST), the reversal is dated on the NEW (Roma) month', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z')); // 00:30 CEST, 1 Sep in Rome

      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(accountMovementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ effectiveDate: parseDateOnlyUtc('2026-09-01') }) }),
      );
    });

    it('sets status CANCELLED, cancelledAt and cancelReason on the flight', async () => {
      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(flightUpdateMock).toHaveBeenCalledWith({
        where: { id: 'flight_orig' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelReason: 'Errore inserimento' },
        select: expect.anything(),
      });
    });

    it('reduces the aircraft hour meter by the flight minutes', async () => {
      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(aircraftUpdateMock).toHaveBeenCalledWith({
        where: { id: 'aircraft_1' },
        data: { hourMeterMinutes: 420 }, // 500 - 80
      });
    });

    it('clamps the aircraft hour meter at 0 (deliberate, Contesto) when a prior rectification already undershot it', async () => {
      queryRawMock.mockReset();
      queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 50 }]).mockResolvedValueOnce([]); // 50 - 80 would be negative

      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(aircraftUpdateMock).toHaveBeenCalledWith({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 0 } });
    });

    it('sends NO negative-balance alert (a storno only ever adds money back)', async () => {
      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(getNegativeBalanceThresholdCentsMock).not.toHaveBeenCalled();
      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
    });

    it('returns the updated flight DTO plus the refreshed account overview', async () => {
      const result = await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

      expect(result.flight.status).toBe('CANCELLED');
      expect(result.account).toEqual(ACCOUNT_OVERVIEW);
      expect(getAccountOverviewMock).toHaveBeenCalledWith(adminActor(), 'person_1');
    });

    it('locks the Aircraft row then the Account row (FOR UPDATE, same macro order as registerFlight)', async () => {
      await cancelFlight(adminActor(), 'flight_orig', CANCEL_INPUT);

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
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_new', correctionOfId: 'flight_orig', minutes: 30, aircraftAmountCents: 7500 });
      queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1', hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
      getAccountOverviewMock.mockResolvedValue(ACCOUNT_OVERVIEW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects a non-staff actor (flights.manage required), before touching the DB', async () => {
      await expect(correctFlight(pilotActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(ForbiddenError);
      expect(flightFindUniqueMock).not.toHaveBeenCalled();
    });

    // Story 14.4 (AC 1) — "tutti i 422 di 5.1 si applicano ai DATI NUOVI"
    // (`resolveFlightInput`'s own doc-comment) extends to the blocking-expiry
    // guard: a correction that changes person/instructor/flight date
    // re-validates the NEW identity from scratch, exactly like
    // `registerFlight`. Review F4 (ratifica R-14.4-b) carves out the OPPOSITE
    // case — a correction that changes NONE of the three is exempt entirely
    // (dedicated describe block below) — so these two tests deliberately
    // change the flight DATE (`CORRECT_INPUT_NEW_DATE`, same person) to stay
    // on the "identity changed" side of that line.
    const CORRECT_INPUT_NEW_DATE = correctFlightSchema.parse({ ...CORRECT_INPUT, ...buildTimes('2020-02-20', 30) });

    it('422 FLIGHT_BLOCKED_BY_EXPIRY when the corrected (NEW) data targets a person with a blocking expired document', async () => {
      findBlockingExpiredDocumentsMock.mockResolvedValue({
        blockingDocuments: [{ typeName: 'Licenza', expiresAt: '2019-12-31' }],
        warnings: [],
      });

      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT_NEW_DATE)).rejects.toMatchObject({ code: 'FLIGHT_BLOCKED_BY_EXPIRY' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('an ADMIN forcing a correction past a real block succeeds and stamps forcedAt/forcedByUserId/forceReason on the NEW flight row', async () => {
      findBlockingExpiredDocumentsMock.mockResolvedValue({
        blockingDocuments: [{ typeName: 'Licenza', expiresAt: '2019-12-31' }],
        warnings: [],
      });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT_NEW_DATE, force: true, forceReason: 'Autorizzato dal direttore' });

      const result = await correctFlight(adminActor(), 'flight_orig', input);

      expect(result).toBeDefined();
      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ forcedByUserId: 'admin_1', forceReason: 'Autorizzato dal direttore', forcedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws NotFoundError for an unknown flight', async () => {
      flightFindUnique.mockResolvedValue(null);

      await expect(correctFlight(adminActor(), 'nope', CORRECT_INPUT)).rejects.toThrow(NotFoundError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError (409) when the flight is already CANCELLED', async () => {
      flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, status: 'CANCELLED' });

      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(ConflictError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it("throws ConflictError naming the manual adjustment when the charge's reversal slot is already taken on a still-REGISTERED flight (review 5.3 M1)", async () => {
      flightFindUnique.mockResolvedValue({
        ...ORIGINAL_FLIGHT_ROW,
        movements: [{ id: 'movement_orig', amountCents: -20000, accountId: 'account_1', reversal: { id: 'adj_1' } }],
      });

      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(
        /already been reversed by a manual adjustment/,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('422 AIRCRAFT_ARCHIVED when the corrected data targets an archived aircraft — re-validates the NEW data from scratch, transaction never opens', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_2', registration: 'I-ARCH', archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, aircraftId: 'aircraft_2' });

      await expect(correctFlight(adminActor(), 'flight_orig', input)).rejects.toMatchObject({ code: 'AIRCRAFT_ARCHIVED' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    // --- story AOG-1a, AD-4/AC 9: the correction perimeter -------------------
    // Two of the four rows of AD-4's table live here. The line is the AIRCRAFT:
    // moving a flight ONTO a grounded airframe is a registration on it;
    // correcting a flight that STAYS on its own airframe is not.

    it('422 AIRCRAFT_OUT_OF_SERVICE when the correction MOVES the flight onto a grounded aircraft (AC 9)', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, id: 'aircraft_2', registration: 'I-AOGX' });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, aircraftId: 'aircraft_2' });

      await expect(correctFlight(adminActor(), 'flight_orig', input)).rejects.toMatchObject({
        code: 'AIRCRAFT_OUT_OF_SERVICE',
        details: { reason: 'Revisione 100h', outOfServiceUntil: '2031-05-12' },
      });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('a correction that KEEPS the same aircraft is NOT blocked, even though that aircraft is grounded TODAY (AC 9 — the dead end R-14.4-b already closed once)', async () => {
      // `ORIGINAL_FLIGHT_ROW.aircraftId === 'aircraft_1'` and the correction
      // keeps it: fixing the minutes/notes of a HISTORICAL flight must not
      // become impossible the day its airframe goes into maintenance.
      aircraftFindUnique.mockResolvedValue(AOG_AIRCRAFT);
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });

      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).resolves.toBeDefined();
      // ...and it is not an override either: no "Deroga" stamp on a correction
      // that never scavalcò anything.
      const data = (flightCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
      expect(data['forcedAt']).toBeUndefined();
    });

    it('an ADMIN can derogate a correction that moves the flight onto a grounded aircraft (AC 10)', async () => {
      aircraftFindUnique.mockResolvedValue({ ...AOG_AIRCRAFT, id: 'aircraft_2', registration: 'I-AOGX' });
      findBlockingExpiredDocumentsMock.mockResolvedValue({ blockingDocuments: [], warnings: [] });
      // The shared `beforeEach` already queued a ONE-aircraft lock row; this
      // correction locks TWO airframes (original + destination), so the queue
      // is rebuilt rather than appended to.
      queryRawMock.mockReset();
      queryRaw
        .mockResolvedValueOnce([
          { id: 'aircraft_1', hourMeterMinutes: 500 },
          { id: 'aircraft_2', hourMeterMinutes: 100 },
        ])
        .mockResolvedValueOnce([]);
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, aircraftId: 'aircraft_2', force: true, forceReason: 'Velivolo corretto a posteriori' });

      await expect(correctFlight(adminActor(), 'flight_orig', input)).resolves.toBeDefined();

      expect(flightCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ forcedByUserId: 'admin_1', forceReason: 'Velivolo corretto a posteriori', forcedAt: expect.any(Date) }),
        }),
      );
    });

    // Review F3 (ratifica R-14.3-a): correcting a flight while KEEPING its
    // OWN recorded type is ALWAYS allowed, even for a person who is
    // student-only TODAY (the profile may have changed SINCE the flight was
    // flown) — this is exactly what lets a notes/times-only correction go
    // through without ever rewriting the flight's type. `ORIGINAL_FLIGHT_ROW`
    // and `CORRECT_INPUT` both carry `flightType: 'TOURISM'` — unchanged.
    it("a correction that keeps the flight's OWN recorded flightType is allowed for a person who is student-only today (R-14.3-a: correcting is not registering anew)", async () => {
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, pilotProfile: null, studentProfile: { deactivatedAt: null } });

      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).resolves.toBeDefined();
    });

    // Review F3 (ratifica R-14.3-a): the exemption above is narrow — it
    // protects an UNCHANGED type only. A correction that CHANGES the type
    // away from what is on file (here: the original flight was SCHOOL, the
    // correction asks for TOURISM) for a student-only person is rejected
    // exactly like a brand-new registration would be.
    it('422 STUDENT_FLIGHT_MUST_BE_SCHOOL when a correction CHANGES the flightType to a non-SCHOOL type for a person who is student-only today', async () => {
      flightFindUnique.mockResolvedValue({ ...ORIGINAL_FLIGHT_ROW, flightType: 'SCHOOL' });
      personFindUnique.mockResolvedValue({ ...PILOT_PERSON, pilotProfile: null, studentProfile: { deactivatedAt: null } });

      // CORRECT_INPUT.flightType is 'TOURISM' — a change from the original SCHOOL.
      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).rejects.toMatchObject({ code: 'STUDENT_FLIGHT_MUST_BE_SCHOOL' });
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('P2002 on reversalOfId (concurrent double-cancel/-correct) surfaces as ConflictError (backstop for the pre-check)', async () => {
      accountMovementCreate.mockRejectedValueOnce({ code: 'P2002' });

      await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).rejects.toThrow(ConflictError);
    });

    it('ONE transaction, in order: lock -> storno (status + REVERSAL movement) -> saldo-prima -> nuova registrazione', async () => {
      await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

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
      await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

      expect(flightCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ correctionOfId: 'flight_orig' }) }));
    });

    it("storno's reversal movement carries the ORIGINAL amount and links to the original flight/movement", async () => {
      await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

      expect(accountMovementCreateMock).toHaveBeenNthCalledWith(1, {
        data: {
          accountId: 'account_1',
          type: 'FLIGHT_CHARGE_REVERSAL',
          amountCents: 20000,
          reversalOfId: 'movement_orig',
          flightId: 'flight_orig',
          effectiveDate: todayDateOnlyUtcInZone(APP_TIMEZONE),
          description: 'Storno volo I-ABCD 2020-01-15 — Errore minuti',
          actorUserId: 'admin_1',
        },
      });
    });

    // Story 16.1, AC 4 — discriminant, same reasoning as the cancelFlight
    // twin above: this writer used to date the storno of the ORIGINAL flight
    // on the UTC calendar day.
    it('story 16.1, AC 4: at 00:30 Rome on the 1st (CEST), the reversal is dated on the NEW (Roma) month', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z')); // 00:30 CEST, 1 Sep in Rome

      await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

      expect(accountMovementCreateMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: expect.objectContaining({ effectiveDate: parseDateOnlyUtc('2026-09-01') }) }),
      );
    });

    it('the ORIGINAL flight is stornoed (status CANCELLED + cancelledAt/cancelReason) and its aircraft hour meter reduced', async () => {
      await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

      expect(flightUpdateMock).toHaveBeenCalledWith({
        where: { id: 'flight_orig' },
        data: { status: 'CANCELLED', cancelledAt: expect.any(Date), cancelReason: 'Errore minuti' },
      });
      expect(aircraftUpdateMock).toHaveBeenCalledWith({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 420 } }); // 500 - 80
    });

    it('fires the negative-balance alert when the (post-storno) balance band worsens', async () => {
      accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 5000 } });
      getAccountOverviewMock.mockResolvedValue({ ...ACCOUNT_OVERVIEW, balanceCents: -15000 });
      flightCreate.mockResolvedValue({ ...CREATED_FLIGHT_ROW, id: 'flight_new', correctionOfId: 'flight_orig', minutes: 200, aircraftAmountCents: 50000 });
      const input = correctFlightSchema.parse({ ...CORRECT_INPUT, ...buildTimes('2020-01-15', 200) });

      await correctFlight(adminActor(), 'flight_orig', input);

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

      await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

      expect(sendNegativeBalanceAlertMock).not.toHaveBeenCalled();
    });

    it('returns the NEW flight DTO plus the corrected data\'s account overview', async () => {
      const result = await correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT);

      expect(result.flight.id).toBe('flight_new');
      expect(result.flight.correctionOfId).toBe('flight_orig');
      expect(getAccountOverviewMock).toHaveBeenCalledWith(adminActor(), 'person_1');
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

      await correctFlight(adminActor(), 'flight_orig', input);

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

    // Review F4 (ratifica R-14.4-b): a correction that changes NEITHER
    // person, NOR instructor, NOR flight date is exempt from the expiry
    // guard ENTIRELY — a notes/hour-meter-only correction of a historical
    // flight must never dead-end on a document that only expired (or was
    // only ever required) AFTER the flight was flown.
    describe('review F4 — unchanged-identity correction exemption', () => {
      it('a notes-only correction (same person, no instructor, same flight date) skips the guard entirely, even with a real blocking document', async () => {
        // If the guard ran, THIS would 422 — proving the skip, not a
        // coincidentally-clear fixture.
        findBlockingExpiredDocumentsMock.mockResolvedValue({
          blockingDocuments: [{ typeName: 'Licenza', expiresAt: '2019-12-31' }],
          warnings: [],
        });
        expiryTypeFindMany.mockResolvedValue([{ id: 'type_licenza', name: 'Licenza' }]);
        expiryFindMany.mockResolvedValue([]);

        await expect(correctFlight(adminActor(), 'flight_orig', CORRECT_INPUT)).resolves.toBeDefined();

        expect(findBlockingExpiredDocumentsMock).not.toHaveBeenCalled();
        expect(expiryTypeFindManyMock).not.toHaveBeenCalled();
      });
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

    // Review F2 (ratifica R-14.4-c): `forceReason` can name another
    // person's medical/document — masked to `null` for anyone WITHOUT
    // `flights.manage`, even on their OWN flight (`self.read`); `forcedAt`
    // (the "Deroga" FACT) stays visible to everyone with access to the row.
    it('review F2: a self-access actor sees forcedAt but NEVER forceReason on their own flight — a flights.manage actor sees both', async () => {
      const forcedFlight = { ...CREATED_FLIGHT_ROW, forcedAt: new Date('2026-01-01T00:00:00.000Z'), forceReason: 'Motivo riservato' };
      flightFindMany.mockResolvedValue([forcedFlight]);
      flightCount.mockResolvedValue(1);

      const selfResult = await listFlights(pilotActor(), baseQuery());
      expect(selfResult.items[0]?.forcedAt).not.toBeNull();
      expect(selfResult.items[0]?.forceReason).toBeNull();

      const manageResult = await listFlights(adminActor(), baseQuery());
      expect(manageResult.items[0]?.forcedAt).not.toBeNull();
      expect(manageResult.items[0]?.forceReason).toBe('Motivo riservato');
    });

    it('staff: builds the where clause from combined filters (period gte/lte date-only, aircraftId, personId, flightType, status)', async () => {
      flightFindMany.mockResolvedValue([]);
      flightCount.mockResolvedValue(0);

      await listFlights(
        adminActor(),
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

    it('forces status: REGISTERED in the WHERE even when the query filters status: CANCELLED', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(adminActor(), baseQuery({ status: 'CANCELLED' }));

      expect(flightAggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'REGISTERED' }) }));
    });

    it('forces status: REGISTERED even with no status filter at all (query.status undefined)', async () => {
      flightAggregate.mockResolvedValue(AGGREGATE_FIXTURE);

      await getFlightTotals(adminActor(), baseQuery());

      expect(flightAggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'REGISTERED' } }));
    });

    it('forwards the filter args (dateFrom/dateTo/aircraftId/flightType) into the WHERE, alongside the forced status', async () => {
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
