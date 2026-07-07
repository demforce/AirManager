import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAircraftRateSchema } from '@/lib/schemas/aircraft';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    aircraft: {
      findUnique: vi.fn(),
    },
    aircraftRate: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { createAircraftRate, getEffectiveRate, listAircraftRates } = await import('./rates.service');
const { ConflictError, NotFoundError } = await import('./errors');

const aircraftFindUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const rateFindFirstMock = vi.mocked(prisma.aircraftRate.findFirst);
const rateFindManyMock = vi.mocked(prisma.aircraftRate.findMany);
const rateCreateMock = vi.mocked(prisma.aircraftRate.create);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as aircraft.service.test.ts).
type Fixture = Record<string, unknown> | null;
const aircraftFindUnique = aircraftFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const rateFindFirst = rateFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const rateFindMany = rateFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const rateCreate = rateCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const AIRCRAFT = { id: 'aircraft_1', archivedAt: null };

function rateFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'rate_1',
    aircraftId: 'aircraft_1',
    priceCentsPerHour: 16000,
    validFrom: new Date('2026-07-07T00:00:00.000Z'),
    actorUserId: 'admin_1',
    actorUser: { email: 'admin@airmanager.local' },
    createdAt: new Date('2026-07-07T08:00:00.000Z'),
    ...overrides,
  };
}

describe('rates.service (story 4.1 — historicized aircraft rates, AD-4/AD-2)', () => {
  beforeEach(() => {
    aircraftFindUniqueMock.mockReset();
    rateFindFirstMock.mockReset();
    rateFindManyMock.mockReset();
    rateCreateMock.mockReset();
  });

  describe('authorization (AD-5)', () => {
    it('createAircraftRate rejects a staff actor (needs settings.manage, not aircraft.manage)', async () => {
      await expect(
        createAircraftRate(staffActor(), 'aircraft_1', { priceCentsPerHour: 16000, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ForbiddenError);
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

  describe('createAircraftRate (AC 1/2)', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(
        createAircraftRate(adminActor(), 'missing', { priceCentsPerHour: 16000, validFrom: '2026-07-07' }),
      ).rejects.toThrow(NotFoundError);
      expect(rateCreateMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError for an archived aircraft', async () => {
      aircraftFindUnique.mockResolvedValue({ id: 'aircraft_1', archivedAt: new Date('2026-01-01T00:00:00.000Z') });
      await expect(
        createAircraftRate(adminActor(), 'aircraft_1', { priceCentsPerHour: 16000, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ConflictError);
      expect(rateCreateMock).not.toHaveBeenCalled();
    });

    it('creates the rate with actorUserId = actor.userId and a UTC-midnight validFrom', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      rateFindFirst.mockResolvedValue(null); // pre-check: no existing conflict
      rateCreate.mockResolvedValue(rateFixture());

      const result = await createAircraftRate(adminActor(), 'aircraft_1', {
        priceCentsPerHour: 16000,
        validFrom: '2026-07-07',
      });

      expect(rateCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            aircraftId: 'aircraft_1',
            priceCentsPerHour: 16000,
            validFrom: new Date('2026-07-07T00:00:00.000Z'),
            actorUserId: 'admin_1',
          },
        }),
      );
      expect(result.priceCentsPerHour).toBe(16000);
      expect(result.validFrom).toBe('2026-07-07');
      expect(result.actorEmail).toBe('admin@airmanager.local');
    });

    it('throws ConflictError when the pre-check finds an existing rate for the same validFrom (AC 2)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      rateFindFirst.mockResolvedValue({ id: 'existing_rate' });

      await expect(
        createAircraftRate(adminActor(), 'aircraft_1', { priceCentsPerHour: 16000, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ConflictError);
      expect(rateCreateMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError (concurrency backstop, AC 2)', async () => {
      aircraftFindUnique.mockResolvedValue(AIRCRAFT);
      rateFindFirst.mockResolvedValue(null);
      rateCreateMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(
        createAircraftRate(adminActor(), 'aircraft_1', { priceCentsPerHour: 16000, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ConflictError);
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

      const result = await listAircraftRates(staffActor(), 'aircraft_1');

      expect(rateFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1' }, orderBy: [{ validFrom: 'desc' }], take: 500 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.validFrom).toBe('2026-07-07');
    });
  });

  describe('getEffectiveRate (AD-4 cardinal rule — max validFrom <= onDate)', () => {
    it('picks the maximum validFrom <= onDate out of several candidates', async () => {
      // Fixture: 3 rates for the aircraft — 2026-01-01 (150€), 2026-06-01 (155€), 2026-07-07 (160€).
      // findFirst with orderBy validFrom desc + validFrom <= onDate simulates what Prisma would return.
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-06-01T00:00:00.000Z'), priceCentsPerHour: 15500 }));

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2026-06-30T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2026-06-30T00:00:00.000Z') } },
          orderBy: [{ validFrom: 'desc' }],
        }),
      );
      expect(result?.priceCentsPerHour).toBe(15500);
    });

    it('includes the exact boundary: D === validFrom is included', async () => {
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-07-07T00:00:00.000Z'), priceCentsPerHour: 16000 }));

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2026-07-07T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2026-07-07T00:00:00.000Z') } } }),
      );
      expect(result?.priceCentsPerHour).toBe(16000);
    });

    it('one day before validFrom falls back to the previous rate', async () => {
      // D = 2026-07-06, one day before the 160€ rate's validFrom (2026-07-07):
      // the query's `lte` excludes it, so Prisma would return the previous (155€) rate instead.
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-06-01T00:00:00.000Z'), priceCentsPerHour: 15500 }));

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2026-07-06T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { aircraftId: 'aircraft_1', validFrom: { lte: new Date('2026-07-06T00:00:00.000Z') } } }),
      );
      expect(result?.priceCentsPerHour).toBe(15500);
    });

    it('returns null when no rate has validFrom <= onDate (aircraft with no rate yet at that date)', async () => {
      rateFindFirst.mockResolvedValue(null);

      const result = await getEffectiveRate(adminActor(), 'aircraft_1', new Date('2020-01-01T00:00:00.000Z'));

      expect(result).toBeNull();
    });
  });

  describe('createAircraftRateSchema (AC 1/2, Zod boundary)', () => {
    it('rejects a zero price', () => {
      expect(createAircraftRateSchema.safeParse({ priceCentsPerHour: 0, validFrom: '2026-07-07' }).success).toBe(false);
    });

    it('rejects a negative price', () => {
      expect(createAircraftRateSchema.safeParse({ priceCentsPerHour: -100, validFrom: '2026-07-07' }).success).toBe(false);
    });

    it('rejects a price beyond the Postgres INTEGER range', () => {
      expect(
        createAircraftRateSchema.safeParse({ priceCentsPerHour: 2_147_483_648, validFrom: '2026-07-07' }).success,
      ).toBe(false);
    });

    it('rejects a malformed validFrom', () => {
      expect(createAircraftRateSchema.safeParse({ priceCentsPerHour: 16000, validFrom: '07/07/2026' }).success).toBe(false);
      expect(createAircraftRateSchema.safeParse({ priceCentsPerHour: 16000, validFrom: 'not-a-date' }).success).toBe(false);
    });

    it('accepts a valid positive integer price and ISO date', () => {
      expect(createAircraftRateSchema.safeParse({ priceCentsPerHour: 16000, validFrom: '2026-07-07' }).success).toBe(true);
    });
  });
});
