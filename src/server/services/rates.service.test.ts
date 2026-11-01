import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAircraftRateSchema } from '@/lib/schemas/aircraft';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => {
  const aircraftRate = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  return {
    prisma: {
      aircraft: {
        findUnique: vi.fn(),
      },
      aircraftRate,
      // The interactive transaction runs its callback on a `tx` that IS the
      // same mocked delegates — enough to assert the write and the read land
      // inside it (`$transaction` called) and nowhere else.
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ aircraftRate })),
    },
  };
});

const { prisma } = await import('@/server/db/prisma');
const { assertRateValidFromNotPast, createAircraftRate, getEffectiveRate, getEffectiveRates, getNextScheduledRates, listAircraftRates } =
  await import('./rates.service');
const { ConflictError, NotFoundError, ValidationError } = await import('./errors');

const aircraftFindUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const rateFindFirstMock = vi.mocked(prisma.aircraftRate.findFirst);
const rateFindManyMock = vi.mocked(prisma.aircraftRate.findMany);
const rateUpsertMock = vi.mocked(prisma.aircraftRate.upsert);
const rateFindUniqueOrThrowMock = vi.mocked(prisma.aircraftRate.findUniqueOrThrow);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as aircraft.service.test.ts).
type Fixture = Record<string, unknown> | null;
const aircraftFindUnique = aircraftFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const rateFindFirst = rateFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const rateFindMany = rateFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const rateUpsert = rateUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const rateFindUniqueOrThrow = rateFindUniqueOrThrowMock as unknown as { mockResolvedValue: (v: Fixture) => void };

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const AIRCRAFT = { id: 'aircraft_1', archivedAt: null };

function rateFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'rate_1',
    aircraftId: 'aircraft_1',
    studentPriceCents: 15300,
    pilotPriceCents: 16000,
    validFrom: new Date('2026-07-07T00:00:00.000Z'),
    actorUserId: 'admin_1',
    actorUser: { email: 'admin@airmanager.local' },
    createdAt: new Date('2026-07-07T08:00:00.000Z'),
    ...overrides,
  };
}

/** A valid two-price body (story 19.3) on `validFrom`. */
function rateInput(validFrom: string, studentPriceCents = 15300, pilotPriceCents = 16000) {
  return { studentPriceCents, pilotPriceCents, validFrom };
}

describe('rates.service (story 4.1 — historicized aircraft rates, AD-4/AD-2; two prices and R-19-f since story 19.3)', () => {
  beforeEach(() => {
    aircraftFindUniqueMock.mockReset();
    rateFindFirstMock.mockReset();
    rateFindManyMock.mockReset();
    rateUpsertMock.mockReset();
    rateFindUniqueOrThrowMock.mockReset();
    transactionMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('authorization (AD-5)', () => {
    it('createAircraftRate rejects a non-admin actor (needs settings.manage)', async () => {
      await expect(createAircraftRate(pilotActor(), 'aircraft_1', rateInput('2026-07-07'))).rejects.toThrow(ForbiddenError);
      expect(aircraftFindUniqueMock).not.toHaveBeenCalled();
    });

    it('listAircraftRates rejects a pilot actor', async () => {
      await expect(listAircraftRates(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
      expect(aircraftFindUniqueMock).not.toHaveBeenCalled();
    });

    it('getEffectiveRate rejects a pilot actor', async () => {
      await expect(getEffectiveRate(pilotActor(), 'aircraft_1', new Date('2026-07-07T00:00:00.000Z'))).rejects.toThrow(
        ForbiddenError,
      );
      expect(rateFindFirstMock).not.toHaveBeenCalled();
    });
  });

  describe('assertRateValidFromNotPast (story 19.3, AC 4 — Europe/Rome "today", A16)', () => {
    it('00:30 in Rome on 2 November (23:30 UTC on the 1st): the 1st is already the past, the 2nd is today', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-01T23:30:00.000Z'));

      expect(() => assertRateValidFromNotPast('2026-11-01')).toThrow(ValidationError);
      try {
        assertRateValidFromNotPast('2026-11-01');
      } catch (error) {
        expect((error as InstanceType<typeof ValidationError>).code).toBe('RATE_VALID_FROM_IN_PAST');
      }
      expect(() => assertRateValidFromNotPast('2026-11-02')).not.toThrow();
    });

    it('today is accepted, a future day too, yesterday is not', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-07T10:00:00.000Z'));

      expect(() => assertRateValidFromNotPast('2026-07-07')).not.toThrow();
      expect(() => assertRateValidFromNotPast('2026-12-01')).not.toThrow();
      expect(() => assertRateValidFromNotPast('2026-07-06')).toThrow(ValidationError);
    });
  });

  describe('createAircraftRate (AC 1/2; story 19.3 AC 4-5)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-07T10:00:00.000Z'));
    });

    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(createAircraftRate(adminActor(), 'missing', rateInput('2026-07-07'))).rejects.toThrow(NotFoundError);
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError for an archived aircraft', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1', archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      await expect(createAircraftRate(adminActor(), 'aircraft_1', rateInput('2026-07-07'))).rejects.toThrow(ConflictError);
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('a past validFrom is a 422 RATE_VALID_FROM_IN_PAST before any write or transaction (AC 4)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);

      await expect(createAircraftRate(adminActor(), 'aircraft_1', rateInput('2026-07-06'))).rejects.toMatchObject({
        code: 'RATE_VALID_FROM_IN_PAST',
      });
      expect(transactionMock).not.toHaveBeenCalled();
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('upserts on (aircraftId, validFrom) with both prices and actorUserId, flat (no nested read), then reads the row inside the same transaction (AC 5)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      rateUpsert.mockResolvedValue({ id: 'rate_1' });
      rateFindUniqueOrThrow.mockResolvedValue(rateFixture());

      const result = await createAircraftRate(adminActor(), 'aircraft_1', rateInput('2026-07-07'));

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(rateUpsertMock).toHaveBeenCalledWith({
        where: { aircraftId_validFrom: { aircraftId: 'aircraft_1', validFrom: new Date('2026-07-07T00:00:00.000Z') } },
        create: {
          aircraftId: 'aircraft_1',
          studentPriceCents: 15300,
          pilotPriceCents: 16000,
          validFrom: new Date('2026-07-07T00:00:00.000Z'),
          actorUserId: 'admin_1',
        },
        // The rewrite path (R-19-f): prices and actor, never `createdAt`.
        update: { studentPriceCents: 15300, pilotPriceCents: 16000, actorUserId: 'admin_1' },
        select: { id: true },
      });
      expect(rateFindUniqueOrThrowMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rate_1' } }));
      expect(result).toMatchObject({ studentPriceCents: 15300, pilotPriceCents: 16000, validFrom: '2026-07-07', actorEmail: 'admin@airmanager.local' });
    });

    it('a second write on the same validFrom is the same upsert — never a 409, never a create (AC 5)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      rateUpsert.mockResolvedValue({ id: 'rate_1' });
      rateFindUniqueOrThrow.mockResolvedValue(rateFixture({ studentPriceCents: 13500, pilotPriceCents: 15000 }));

      const result = await createAircraftRate(adminActor(), 'aircraft_1', rateInput('2026-07-07', 13500, 15000));

      expect(rateUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ update: { studentPriceCents: 13500, pilotPriceCents: 15000, actorUserId: 'admin_1' } }),
      );
      expect(result.studentPriceCents).toBe(13500);
      expect(result.pilotPriceCents).toBe(15000);
    });
  });

  describe('listAircraftRates (AC 1)', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(listAircraftRates(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(rateFindManyMock).not.toHaveBeenCalled();
    });

    it('returns the history ordered by validFrom desc, capped at take: 500', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      rateFindMany.mockResolvedValue([rateFixture()]);

      const result = await listAircraftRates(adminActor(), 'aircraft_1');

      expect(rateFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1' }, orderBy: [{ validFrom: 'desc' }], take: 500 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.validFrom).toBe('2026-07-07');
      expect(result[0]?.studentPriceCents).toBe(15300);
      expect(result[0]?.pilotPriceCents).toBe(16000);
    });
  });

  describe('getEffectiveRate (AD-4 cardinal rule — max validFrom <= onDate)', () => {
    it('picks the maximum validFrom <= onDate out of several candidates', async () => {
      // Fixture: 3 rates for the aircraft — 2026-01-01 (150€), 2026-06-01 (155€), 2026-07-07 (160€).
      // findFirst with orderBy validFrom desc + validFrom <= onDate simulates what Prisma would return.
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-06-01T00:00:00.000Z'), pilotPriceCents: 15500 }));

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2026-06-30T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2026-06-30T00:00:00.000Z') } },
          orderBy: [{ validFrom: 'desc' }],
        }),
      );
      expect(result?.pilotPriceCents).toBe(15500);
    });

    it('includes the exact boundary: D === validFrom is included', async () => {
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-07-07T00:00:00.000Z'), pilotPriceCents: 16000 }));

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2026-07-07T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2026-07-07T00:00:00.000Z') } } }),
      );
      expect(result?.pilotPriceCents).toBe(16000);
    });

    it('one day before validFrom falls back to the previous rate', async () => {
      // D = 2026-07-06, one day before the 160€ rate's validFrom (2026-07-07):
      // the query's `lte` excludes it, so Prisma would return the previous (155€) rate instead.
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-06-01T00:00:00.000Z'), pilotPriceCents: 15500 }));

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2026-07-06T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2026-07-06T00:00:00.000Z') } } }),
      );
      expect(result?.pilotPriceCents).toBe(15500);
    });

    it('returns null when no rate has validFrom <= onDate (aircraft with no rate yet at that date)', async () => {
      rateFindFirst.mockResolvedValue(null);

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2020-01-01T00:00:00.000Z'));

      expect(result).toBeNull();
    });
  });

  describe('getEffectiveRates (story TD-1, AC 4 — batched N+1 fix, parity with getEffectiveRate)', () => {
    it('rejects a pilot actor', async () => {
      await expect(getEffectiveRates(pilotActor(), ['aircraft_1'], new Date('2026-07-07T00:00:00.000Z'))).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('an empty id list short-circuits to an empty Map without querying', async () => {
      const result = await getEffectiveRates(adminActor(), [], new Date('2026-07-07T00:00:00.000Z'));

      expect(result.size).toBe(0);
      expect(rateFindManyMock).not.toHaveBeenCalled();
    });

    it('queries with the exact AD-4 shape: aircraftId in ids, validFrom <= onDate, ordered aircraftId asc/validFrom desc, distinct aircraftId', async () => {
      rateFindMany.mockResolvedValue([]);
      const onDate = new Date('2026-07-07T00:00:00.000Z');

      await getEffectiveRates(adminActor(), ['aircraft_1', 'aircraft_2'], onDate);

      expect(rateFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { aircraftId: { in: ['aircraft_1', 'aircraft_2'] }, validFrom: { lte: onDate } },
          orderBy: [{ aircraftId: 'asc' }, { validFrom: 'desc' }],
          distinct: ['aircraftId'],
        }),
      );
    });

    it('maps a multi-rate-per-aircraft dataset to a Map of the current rate per id (parity with getEffectiveRate)', async () => {
      // `distinct: ['aircraftId']` on `aircraftId asc, validFrom desc` means
      // Prisma would only ever return ONE row per aircraft — the fixture
      // simulates exactly that already-deduplicated shape.
      rateFindMany.mockResolvedValue([
        rateFixture({ aircraftId: 'aircraft_1', validFrom: new Date('2026-06-01T00:00:00.000Z'), pilotPriceCents: 15500 }),
        rateFixture({ aircraftId: 'aircraft_2', validFrom: new Date('2026-01-01T00:00:00.000Z'), pilotPriceCents: 12000 }),
      ]);

      const result = await getEffectiveRates(adminActor(), ['aircraft_1', 'aircraft_2', 'aircraft_3'], new Date('2026-07-07T00:00:00.000Z'));

      expect(result.get('aircraft_1')?.pilotPriceCents).toBe(15500);
      expect(result.get('aircraft_2')?.pilotPriceCents).toBe(12000);
      // No qualifying rate for aircraft_3 -> null in the Map, never a missing key.
      expect(result.has('aircraft_3')).toBe(true);
      expect(result.get('aircraft_3')).toBeNull();
    });

    it('boundary: D === validFrom is included, same as getEffectiveRate', async () => {
      rateFindMany.mockResolvedValue([rateFixture({ aircraftId: 'aircraft_1', validFrom: new Date('2026-07-07T00:00:00.000Z'), pilotPriceCents: 16000 })]);

      const result = await getEffectiveRates(adminActor(), ['aircraft_1'], new Date('2026-07-07T00:00:00.000Z'));

      expect(result.get('aircraft_1')?.pilotPriceCents).toBe(16000);
    });

    it('a lone aircraft with no rate at all maps to null in an otherwise-empty Map', async () => {
      rateFindMany.mockResolvedValue([]);

      const result = await getEffectiveRates(adminActor(), ['aircraft_lonely'], new Date('2026-07-07T00:00:00.000Z'));

      expect(result.size).toBe(1);
      expect(result.get('aircraft_lonely')).toBeNull();
    });
  });

  describe('getNextScheduledRates (story 19.3, Q-19.3-d — the next scheduled rate per aircraft)', () => {
    it('rejects a pilot actor', async () => {
      await expect(getNextScheduledRates(pilotActor(), ['aircraft_1'], new Date('2026-07-07T00:00:00.000Z'))).rejects.toThrow(ForbiddenError);
    });

    it('an empty id list short-circuits without querying', async () => {
      const result = await getNextScheduledRates(adminActor(), [], new Date('2026-07-07T00:00:00.000Z'));
      expect(result.size).toBe(0);
      expect(rateFindManyMock).not.toHaveBeenCalled();
    });

    it('queries validFrom > onDate ordered aircraftId asc/validFrom asc with distinct aircraftId, null for an aircraft with nothing scheduled', async () => {
      const onDate = new Date('2026-07-07T00:00:00.000Z');
      rateFindMany.mockResolvedValue([rateFixture({ aircraftId: 'aircraft_1', validFrom: new Date('2026-12-01T00:00:00.000Z') })]);

      const result = await getNextScheduledRates(adminActor(), ['aircraft_1', 'aircraft_2'], onDate);

      expect(rateFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { aircraftId: { in: ['aircraft_1', 'aircraft_2'] }, validFrom: { gt: onDate } },
          orderBy: [{ aircraftId: 'asc' }, { validFrom: 'asc' }],
          distinct: ['aircraftId'],
        }),
      );
      expect(result.get('aircraft_1')?.validFrom).toBe('2026-12-01');
      expect(result.has('aircraft_2')).toBe(true);
      expect(result.get('aircraft_2')).toBeNull();
    });
  });

  describe('createAircraftRateSchema (AC 1/2, Zod boundary; two mandatory prices since story 19.3, AC 7)', () => {
    it('rejects a zero price on either column', () => {
      expect(createAircraftRateSchema.safeParse(rateInput('2026-07-07', 0, 16000)).success).toBe(false);
      expect(createAircraftRateSchema.safeParse(rateInput('2026-07-07', 15300, 0)).success).toBe(false);
    });

    it('rejects a negative price', () => {
      expect(createAircraftRateSchema.safeParse(rateInput('2026-07-07', -100, 16000)).success).toBe(false);
    });

    it('rejects a price beyond the Postgres INTEGER range', () => {
      expect(createAircraftRateSchema.safeParse(rateInput('2026-07-07', 15300, 2_147_483_648)).success).toBe(false);
    });

    it('rejects a malformed validFrom', () => {
      expect(createAircraftRateSchema.safeParse(rateInput('07/07/2026')).success).toBe(false);
      expect(createAircraftRateSchema.safeParse(rateInput('not-a-date')).success).toBe(false);
    });

    it('accepts two valid positive integer prices and an ISO date', () => {
      expect(createAircraftRateSchema.safeParse(rateInput('2026-07-07')).success).toBe(true);
    });

    it('requires both prices: a body with only the old priceCentsPerHour, or a single price, is rejected', () => {
      expect(createAircraftRateSchema.safeParse({ priceCentsPerHour: 16000, validFrom: '2026-07-07' }).success).toBe(false);
      expect(createAircraftRateSchema.safeParse({ pilotPriceCents: 16000, validFrom: '2026-07-07' }).success).toBe(false);
      expect(createAircraftRateSchema.safeParse({ studentPriceCents: 15300, validFrom: '2026-07-07' }).success).toBe(false);
    });
  });
});
