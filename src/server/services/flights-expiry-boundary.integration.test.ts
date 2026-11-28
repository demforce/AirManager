import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerFlightSchema } from '@/lib/schemas/flights';
import type { Actor } from '@/server/auth/rbac';

/**
 * Story 14.4 review F8 — a LIGHTWEIGHT integration test for AC 6's own
 * boundary claim ("valido alla data del volo ma scaduto oggi -> OK, la data
 * conta"). Since story 19.9 the documents are judged by
 * `requirements.service.ts#evaluateRequirements`, which `flights.service.test.ts`
 * mocks at the module boundary (by design — that file verifies the POLICY
 * flights.service asks for): nothing there exercises the REAL
 * `toDateOnlyString(expiry.expiresAt) < flightDay` comparison end to end
 * through `registerFlight`. Here the requirements service and the medical
 * rule (`expiries.service.ts#getMedicalRequirementFailure`) run for REAL;
 * only `prisma` (to control the boundary dates) and the readers this file is
 * not about — fee, currency, their settings — are mocked, the latter two also
 * to dodge `@/lib/env`'s eager validation (CLAUDE.md). The balance is kept
 * covered so the documents are the only possible failure.
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
vi.mock('./app-settings.service', () => ({ getCurrencySettings: vi.fn(async () => ({ minFlights: 1, windowDays: 90 })) }));
vi.mock('./membership.service', () => ({ getMembershipStatus: vi.fn(async () => ({ status: 'valid', expiresAt: '2099-12-31' })) }));
vi.mock('./currency.service', () => ({ getCurrencyStatus: vi.fn(async () => ({ current: true, expiresAt: '2099-12-31', lastFlightDate: '2020-01-01', flightsInWindow: 1 })) }));

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

// `./requirements.service` and `./expiries.service` are deliberately NOT mocked — the whole point of this file.

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
type ExpiryRow = { expiresAt: Date; expiryType: { name: string } };
/** The person's rows by kind — the RATING scan and the medical rule each ask `expiry.findMany` for their own kind. */
function stubExpiries(rows: { RATING?: ExpiryRow[]; MEDICAL?: ExpiryRow[] }): void {
  expiryFindManyMock.mockImplementation((async (args: { where: { expiryType: { kind: 'RATING' | 'MEDICAL' } } }) => rows[args.where.expiryType.kind] ?? []) as never);
}
/** The active types by kind — the MISSING scan asks for RATINGs, the medical rule for MEDICALs. */
function stubTypes(types: { RATING?: Array<{ name: string }>; MEDICAL?: Array<{ name: string }> }): void {
  expiryTypeFindManyMock.mockImplementation((async (args: { where: { kind: 'RATING' | 'MEDICAL' } }) => types[args.where.kind] ?? []) as never);
}
const queryRaw = queryRawMock as unknown as { mockResolvedValueOnce: (v: unknown[]) => { mockResolvedValueOnce: (v: unknown[]) => void } };
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };

function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])));
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

const AIRCRAFT = { id: 'aircraft_1', registration: 'I-ABCD', archivedAt: null, status: 'OPERATIONAL', statusReason: null, outOfServiceUntil: null };
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

describe('flights.service — AC 6 boundary, through the REAL evaluateRequirements (review F8, story 19.9)', () => {
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
    // A covered balance: the documents are the only possible failure.
    accountMovementAggregate.mockResolvedValue({ _sum: { amountCents: 100_000 } });
    accountMovementCreate.mockResolvedValue({ id: 'movement_1' });
    flightCreate.mockResolvedValue(CREATED_FLIGHT_ROW);
    // Story 16.2: no overlapping flight, so the guard is transparent here.
    (flightFindFirstMock as unknown as { mockResolvedValue: (v: null) => void }).mockResolvedValue(null);
    getEffectiveRateMock.mockResolvedValue({ studentPriceCents: 15000, pilotPriceCents: 15000 });
    getAccountOverviewMock.mockResolvedValue({ account: { id: 'account_1', createdAt: new Date('2026-01-01T00:00:00.000Z') }, balanceCents: -20000, recentMovements: [] });
    getNegativeBalanceThresholdCentsMock.mockResolvedValue(-999_999_999);
    queryRaw.mockResolvedValueOnce([{ id: 'aircraft_1' }]).mockResolvedValueOnce([]);
    // No missing rating and no medical requirement unless a case asks for
    // one: every case below exercises the EXPIRED boundary.
    stubTypes({});
    stubExpiries({});
    mockTransaction();
  });

  it('expiresAt === flightDate (2020-01-15) -> still VALID, registers normally (201)', async () => {
    stubExpiries({ RATING: [{ expiresAt: new Date('2020-01-15T00:00:00.000Z'), expiryType: { name: 'Rating bloccante' } }] });

    await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
  });

  it('expiresAt === flightDate - 1 day (2020-01-14) -> 422 REQUIREMENTS_NOT_MET with that one EXPIRY failure', async () => {
    stubExpiries({ RATING: [{ expiresAt: new Date('2020-01-14T00:00:00.000Z'), expiryType: { name: 'Rating bloccante' } }] });

    await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
      code: 'REQUIREMENTS_NOT_MET',
      details: { failures: [{ type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'Rating bloccante', expiresAt: '2020-01-14' }] },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  // Story 19.7a (R-19-j, D-4) through the REAL chain (`evaluateRequirements`
  // -> `getMedicalRequirementFailure`): an expired visit is ONE document.
  it('only an expired medical visit (a day before the flight) -> ONE failure, never doubled', async () => {
    stubTypes({ MEDICAL: [{ name: 'Visita medica classe 2' }, { name: 'Visita medica classe 1' }] });
    stubExpiries({ MEDICAL: [{ expiresAt: new Date('2020-01-14T00:00:00.000Z'), expiryType: { name: 'Visita medica classe 2' } }] });

    await expect(registerFlight(adminActor(), BASE_INPUT)).rejects.toMatchObject({
      code: 'REQUIREMENTS_NOT_MET',
      details: { failures: [{ type: 'EXPIRY', typeName: 'Visita medica classe 2', expiresAt: '2020-01-14', role: 'person' }] },
    });
  });

  it('the visit expiring ON the flight day still covers the pilot (201)', async () => {
    stubTypes({ MEDICAL: [{ name: 'Visita medica classe 2' }] });
    stubExpiries({ MEDICAL: [{ expiresAt: new Date('2020-01-15T00:00:00.000Z'), expiryType: { name: 'Visita medica classe 2' } }] });

    await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
  });

  it('expiresAt is AFTER the flight date but long before today (real clock) -> still VALID — anchored to flightDate, never "today"', async () => {
    // 2020-06-01 is well after the flight (2020-01-15, so valid AT the flight
    // date) yet, by construction, always in the PAST relative to the real
    // server clock this suite runs under — if the comparison ever drifted to
    // "today" instead of `flightDate`, this document would wrongly block.
    stubExpiries({ RATING: [{ expiresAt: new Date('2020-06-01T00:00:00.000Z'), expiryType: { name: 'Rating bloccante' } }] });

    await expect(registerFlight(adminActor(), BASE_INPUT)).resolves.toBeDefined();
  });
});
