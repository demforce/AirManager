import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFlightSchema } from '@/lib/schemas/flights';
import type { Actor } from '@/server/auth/rbac';

/**
 * Story 14.4 review F8 — a LIGHTWEIGHT integration test for AC 6's own
 * boundary claim ("valido alla data del volo ma scaduto oggi -> OK, la data
 * conta") that does NOT mock `./bookings.service`: `flights.service.test.ts`
 * mocks `findBlockingExpiredDocuments` at the module boundary (by design —
 * that file only verifies flights.service CALLS it with the right
 * arguments), so nothing there exercises the REAL `toDateOnlyString(expiry.expiresAt)
 * < flightDateOnly` comparison end to end through `registerFlight`. This file
 * lets that function run for REAL and only mocks `prisma.expiry.findMany`
 * (review F8's own instruction) to control the three boundary dates.
 *
 * `./app-settings.service` is mocked (never the REAL `getSchedulingSettings`)
 * purely to dodge its `@/server/crypto/secret-box` import — `bookings.service.ts`
 * imports it at module load time even though `findBlockingExpiredDocuments`
 * itself never calls it (same "mock the chain" lesson as CLAUDE.md's own
 * `@/lib/env` eager-validation note; same pattern `bookings.service.test.ts`
 * already uses for the SAME reason).
 */
vi.mock('@/server/db/prisma', () => ({
  prisma: {
    aircraft: { findUnique: vi.fn(), update: vi.fn() },
    person: { findUnique: vi.fn() },
    account: { upsert: vi.fn() },
    accountMovement: { aggregate: vi.fn(), create: vi.fn() },
    // Story 16.2 — `assertNoOverlappingFlight`'s single read. Without it the
    // guard throws `TypeError: tx.flight.findFirst is not a function`; the
    // `null` default in `beforeEach` keeps every case in this file (all of
    // them about the EXPIRED boundary) unchanged.
    flight: { create: vi.fn(), findFirst: vi.fn() },
    expiryType: { findMany: vi.fn() },
    expiry: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: vi.fn() })),
}));
vi.mock('@/server/adapters/mail/templates', () => ({
  buildNegativeBalanceAlertEmail: vi.fn(async () => ({ subject: 'Alert subject', text: 'Alert text' })),
}));
vi.mock('./app-settings.service', () => ({ getSchedulingSettings: vi.fn() }));

const getAccountOverviewMock = vi.fn();
const getNegativeBalanceThresholdCentsMock = vi.fn();
const sendNegativeBalanceAlertMock = vi.fn();
vi.mock('./accounts.service', async () => {
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

// `./bookings.service` is deliberately NOT mocked — the whole point of this file.

const { prisma } = await import('@/server/db/prisma');
const { registerFlight } = await import('./flights.service');

const aircraftFindUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const aircraftUpdateMock = vi.mocked(prisma.aircraft.update);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const flightCreateMock = vi.mocked(prisma.flight.create);
const flightFindFirstMock = vi.mocked(prisma.flight.findFirst);
const expiryTypeFindManyMock = vi.mocked(prisma.expiryType.findMany);
const expiryFindManyMock = vi.mocked(prisma.expiry.findMany);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

type Fixture = Record<string, unknown> | null;
const aircraftFindUnique = aircraftFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const aircraftUpdate = aircraftUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const accountMovementAggregate = accountMovementAggregateMock as unknown as { mockResolvedValue: (v: { _sum: { amountCents: number | null } }) => void };
const accountMovementCreate = accountMovementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const flightCreate = flightCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryTypeFindMany = expiryTypeFindManyMock as unknown as { mockResolvedValue: (v: Array<{ id: string; name: string }>) => void };
const expiryFindMany = expiryFindManyMock as unknown as {
  mockResolvedValue: (v: Array<{ expiresAt: Date; expiryType: { name: string; blocksBooking: boolean } }>) => void;
};
const queryRaw = queryRawMock as unknown as { mockResolvedValueOnce: (v: unknown[]) => { mockResolvedValueOnce: (v: unknown[]) => void } };
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };

function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])));
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
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
  cancelledAt: null as Date | null,
  cancelReason: null as string | null,
  correctionOfId: null as string | null,
  correctedBy: null as { id: string } | null,
  aircraft: { id: 'aircraft_1', registration: 'I-ABCD' },
  person: { id: 'person_1', firstName: 'Mario', lastName: 'Rossi' },
  instructorProfile: null,
  actorUser: { email: 'staff@airmanager.local' },
};

function buildTimes(dateOnly: string, minutes: number): { takeoffAt: string; landingAt: string } {
  const takeoffAt = `${dateOnly}T10:00:00.000Z`;
  const landingAt = new Date(new Date(takeoffAt).getTime() + minutes * 60_000).toISOString();
  return { takeoffAt, landingAt };
}

// The flight itself is dated 2020-01-15 (safely in the past regardless of
// when this suite runs) — a fixed FLIGHT DATE far from the real server
// clock is exactly what lets case 3 below prove the comparison is anchored
// to it, never to "today".
const BASE_INPUT = registerFlightSchema.parse({
  aircraftId: 'aircraft_1',
  personId: 'person_1',
  departureAirfield: 'Base Airfield',
  arrivalAirfield: 'Base Airfield',
  flightType: 'TOURISM',
  ...buildTimes('2020-01-15', 80),
});

describe('flights.service — AC 6 boundary, through the REAL findBlockingExpiredDocuments (review F8)', () => {
  beforeEach(() => {
    aircraftFindUniqueMock.mockReset();
    aircraftUpdateMock.mockReset();
    personFindUniqueMock.mockReset();
    accountUpsertMock.mockReset();
    accountMovementAggregateMock.mockReset();
    accountMovementCreateMock.mockReset();
    flightCreateMock.mockReset();
    flightFindFirstMock.mockReset();
    expiryTypeFindManyMock.mockReset();
    expiryFindManyMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    getAccountOverviewMock.mockReset();
    getNegativeBalanceThresholdCentsMock.mockReset();
    sendNegativeBalanceAlertMock.mockReset();
    getEffectiveRateMock.mockReset();
    getEffectiveInstructorRateMock.mockReset();

    aircraftFindUnique.mockResolvedValue(AIRCRAFT);
    aircraftUpdate.mockResolvedValue({ id: 'aircraft_1' });
    personFindUnique.mockResolvedValue(PILOT_PERSON);
    accountUpsert.mockResolvedValue({ id: 'account_1' });
    accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 0 } });
    accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
    flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
    // Story 16.2: no overlapping flight, so the guard is transparent here.
    (flightFindFirstMock as unknown as { mockResolvedValue: (v: null) => void }).mockResolvedValue(null);
    getEffectiveRateMock.mockResolvedValue({ priceCentsPerHour: 15000 });
    getAccountOverviewMock.mockResolvedValue({ account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') }, balanceCents: -20000, recentMovements: [] });
    getNegativeBalanceThresholdCentsMock.mockResolvedValue(-999_999_999);
    queryRaw.mockResolvedValueOnce([{ hourMeterMinutes: 500 }]).mockResolvedValueOnce([]);
    // Review F5's own predicate is orthogonal to this file's concern (the
    // EXPIRED boundary) — disabled here so every case below exercises ONLY
    // `findBlockingExpiredDocuments`'s real date math.
    expiryTypeFindMany.mockResolvedValue([]);
    mockTransaction();
  });

  it('expiresAt === flightDate (2020-01-15) -> still VALID, registers normally (201)', async () => {
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2020-01-15T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);

    await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
  });

  it('expiresAt === flightDate - 1 day (2020-01-14) -> 422 FLIGHT_BLOCKED_BY_EXPIRY', async () => {
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2020-01-14T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);

    await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
      code: 'FLIGHT_BLOCKED_BY_EXPIRY',
      details: { documents: [{ typeName: 'Licenza', expiresAt: '2020-01-14' }] },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('expiresAt is AFTER the flight date but long before today (real clock) -> still VALID — anchored to flightDate, never "today"', async () => {
    // 2020-06-01 is well after the flight (2020-01-15, so valid AT the flight
    // date) yet, by construction, always in the PAST relative to the real
    // server clock this suite runs under — if the comparison ever drifted to
    // "today" instead of `flightDate`, this document would wrongly block.
    expiryFindMany.mockResolvedValue([{ expiresAt: new Date('2020-06-01T00:00:00.000Z'), expiryType: { name: 'Licenza', blocksBooking: true } }]);

    await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
  });
});
