import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstructorRateSchema } from '@/lib/schemas/people';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => {
  const instructorRate = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  return {
    prisma: {
      person: {
        findUnique: vi.fn(),
      },
      instructorRate,
      // Same `tx`-is-the-mocked-delegates shape as rates.service.test.ts.
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ instructorRate })),
    },
  };
});

const { prisma } = await import('@/server/db/prisma');
const { createInstructorRate, getEffectiveInstructorRate, listInstructorRates } = await import('./instructor-rates.service');
const { ConflictError, NotFoundError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const rateFindFirstMock = vi.mocked(prisma.instructorRate.findFirst);
const rateFindManyMock = vi.mocked(prisma.instructorRate.findMany);
const rateUpsertMock = vi.mocked(prisma.instructorRate.upsert);
const rateFindUniqueOrThrowMock = vi.mocked(prisma.instructorRate.findUniqueOrThrow);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as rates.service.test.ts).
type Fixture = Record<string, unknown> | null;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
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

const ACTIVE_INSTRUCTOR_PERSON = { instructorProfile: { id: 'instructor_1', deactivatedAt: null } };
const DEACTIVATED_INSTRUCTOR_PERSON = {
  instructorProfile: { id: 'instructor_1', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') },
};
const NON_INSTRUCTOR_PERSON = { instructorProfile: null };

function rateFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'rate_1',
    instructorProfileId: 'instructor_1',
    priceCentsPerHour: 4500,
    validFrom: new Date('2026-07-07T00:00:00.000Z'),
    actorUserId: 'admin_1',
    actorUser: { email: 'admin@airmanager.local' },
    createdAt: new Date('2026-07-07T08:00:00.000Z'),
    ...overrides,
  };
}

describe('instructor-rates.service (story 4.2 — historicized instructor rates, AD-4/AD-2, twin of 4.1)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
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
    it('createInstructorRate rejects a non-admin actor (needs settings.manage)', async () => {
      await expect(
        createInstructorRate(pilotActor(), 'person_1', { priceCentsPerHour: 4500, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('listInstructorRates rejects a pilot actor (needs people.read)', async () => {
      await expect(listInstructorRates(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('getEffectiveInstructorRate rejects a pilot actor', async () => {
      await expect(
        getEffectiveInstructorRate(pilotActor(), 'person_1', new Date('2026-07-07T00:00:00.000Z')),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('createInstructorRate (AC 1/2; story 19.3 AC 4-5)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-07T10:00:00.000Z'));
    });

    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(
        createInstructorRate(adminActor(), 'missing', { priceCentsPerHour: 4500, validFrom: '2026-07-07' }),
      ).rejects.toThrow(NotFoundError);
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the person has no instructor profile', async () => {
      personFindUnique.mockResolvedValue(NON_INSTRUCTOR_PERSON);
      await expect(
        createInstructorRate(adminActor(), 'person_1', { priceCentsPerHour: 4500, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ConflictError);
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the instructor profile is deactivated', async () => {
      personFindUnique.mockResolvedValue(DEACTIVATED_INSTRUCTOR_PERSON);
      await expect(
        createInstructorRate(adminActor(), 'person_1', { priceCentsPerHour: 4500, validFrom: '2026-07-07' }),
      ).rejects.toThrow(ConflictError);
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('a past validFrom is a 422 RATE_VALID_FROM_IN_PAST before any write or transaction (AC 4)', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);

      await expect(
        createInstructorRate(adminActor(), 'person_1', { priceCentsPerHour: 4500, validFrom: '2026-07-06' }),
      ).rejects.toMatchObject({ code: 'RATE_VALID_FROM_IN_PAST' });
      expect(transactionMock).not.toHaveBeenCalled();
      expect(rateUpsertMock).not.toHaveBeenCalled();
    });

    it('Europe/Rome "today": at 00:30 in Rome on 2 November (23:30 UTC on the 1st) the 1st is refused, the 2nd accepted (AC 4)', async () => {
      vi.setSystemTime(new Date('2026-11-01T23:30:00.000Z'));
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      rateUpsert.mockResolvedValue({ id: 'rate_1' });
      rateFindUniqueOrThrow.mockResolvedValue(rateFixture({ validFrom: new Date('2026-11-02T00:00:00.000Z') }));

      await expect(
        createInstructorRate(adminActor(), 'person_1', { priceCentsPerHour: 4500, validFrom: '2026-11-01' }),
      ).rejects.toMatchObject({ code: 'RATE_VALID_FROM_IN_PAST' });
      await expect(createInstructorRate(adminActor(), 'person_1', { priceCentsPerHour: 4500, validFrom: '2026-11-02' })).resolves.toMatchObject({
        validFrom: '2026-11-02',
      });
    });

    it('upserts on (instructorProfileId, validFrom) flat, then reads the row inside the same transaction — a rewrite is the same call, never a 409 (AC 5)', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      rateUpsert.mockResolvedValue({ id: 'rate_1' });
      rateFindUniqueOrThrow.mockResolvedValue(rateFixture());

      const result = await createInstructorRate(adminActor(), 'person_1', {
        priceCentsPerHour: 4500,
        validFrom: '2026-07-07',
      });

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(rateUpsertMock).toHaveBeenCalledWith({
        where: { instructorProfileId_validFrom: { instructorProfileId: 'instructor_1', validFrom: new Date('2026-07-07T00:00:00.000Z') } },
        create: {
          instructorProfileId: 'instructor_1',
          priceCentsPerHour: 4500,
          validFrom: new Date('2026-07-07T00:00:00.000Z'),
          actorUserId: 'admin_1',
        },
        update: { priceCentsPerHour: 4500, actorUserId: 'admin_1' },
        select: { id: true },
      });
      expect(rateFindUniqueOrThrowMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rate_1' } }));
      expect(result.priceCentsPerHour).toBe(4500);
      expect(result.validFrom).toBe('2026-07-07');
      expect(result.actorEmail).toBe('admin@airmanager.local');
    });
  });

  describe('listInstructorRates (AC 1)', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(listInstructorRates(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(rateFindManyMock).not.toHaveBeenCalled();
    });

    it('returns an empty array (not a 404) for a person without an instructor profile', async () => {
      personFindUnique.mockResolvedValue(NON_INSTRUCTOR_PERSON);
      const result = await listInstructorRates(adminActor(), 'person_1');
      expect(result).toEqual([]);
      expect(rateFindManyMock).not.toHaveBeenCalled();
    });

    it('returns the history ordered by validFrom desc, capped at take: 500', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      rateFindMany.mockResolvedValue([rateFixture()]);

      const result = await listInstructorRates(adminActor(), 'person_1');

      expect(rateFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { instructorProfileId: 'instructor_1' }, orderBy: [{ validFrom: 'desc' }], take: 500 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.validFrom).toBe('2026-07-07');
    });
  });

  describe('getEffectiveInstructorRate (AD-4 cardinal rule — max validFrom <= onDate)', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(
        getEffectiveInstructorRate(adminActor(), 'missing', new Date('2026-07-07T00:00:00.000Z')),
      ).rejects.toThrow(NotFoundError);
      expect(rateFindFirstMock).not.toHaveBeenCalled();
    });

    it('returns null (no query) for a person without an instructor profile', async () => {
      personFindUnique.mockResolvedValue(NON_INSTRUCTOR_PERSON);
      const result = await getEffectiveInstructorRate(adminActor(), 'person_1', new Date('2026-07-07T00:00:00.000Z'));
      expect(result).toBeNull();
      expect(rateFindFirstMock).not.toHaveBeenCalled();
    });

    it('picks the maximum validFrom <= onDate out of several candidates', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      // Fixture: 3 rates for the instructor — 2026-01-01 (40€), 2026-06-01 (42,50€), 2026-07-07 (45€).
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-06-01T00:00:00.000Z'), priceCentsPerHour: 4250 }));

      const result = await getEffectiveInstructorRate(adminActor(), 'person_1', new Date('2026-06-30T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { instructorProfileId: 'instructor_1', validFrom: { lte: new Date('2026-06-30T00:00:00.000Z') } },
          orderBy: [{ validFrom: 'desc' }],
        }),
      );
      expect(result?.priceCentsPerHour).toBe(4250);
    });

    it('includes the exact boundary: D === validFrom is included', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-07-07T00:00:00.000Z'), priceCentsPerHour: 4500 }));

      const result = await getEffectiveInstructorRate(adminActor(), 'person_1', new Date('2026-07-07T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { instructorProfileId: 'instructor_1', validFrom: { lte: new Date('2026-07-07T00:00:00.000Z') } } }),
      );
      expect(result?.priceCentsPerHour).toBe(4500);
    });

    it('one day before validFrom falls back to the previous rate', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      // D = 2026-07-06, one day before the 45€ rate's validFrom (2026-07-07):
      // the query's `lte` excludes it, so Prisma would return the previous (42,50€) rate instead.
      rateFindFirst.mockResolvedValue(rateFixture({ validFrom: new Date('2026-06-01T00:00:00.000Z'), priceCentsPerHour: 4250 }));

      const result = await getEffectiveInstructorRate(adminActor(), 'person_1', new Date('2026-07-06T00:00:00.000Z'));

      expect(rateFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { instructorProfileId: 'instructor_1', validFrom: { lte: new Date('2026-07-06T00:00:00.000Z') } } }),
      );
      expect(result?.priceCentsPerHour).toBe(4250);
    });

    it('returns null when no rate has validFrom <= onDate (instructor with no rate yet at that date)', async () => {
      personFindUnique.mockResolvedValue(ACTIVE_INSTRUCTOR_PERSON);
      rateFindFirst.mockResolvedValue(null);

      const result = await getEffectiveInstructorRate(adminActor(), 'person_1', new Date('2020-01-01T00:00:00.000Z'));

      expect(result).toBeNull();
    });
  });

  describe('createInstructorRateSchema (AC 1/2, Zod boundary)', () => {
    it('rejects a zero price', () => {
      expect(createInstructorRateSchema.safeParse({ priceCentsPerHour: 0, validFrom: '2026-07-07' }).success).toBe(false);
    });

    it('rejects a negative price', () => {
      expect(createInstructorRateSchema.safeParse({ priceCentsPerHour: -100, validFrom: '2026-07-07' }).success).toBe(false);
    });

    it('rejects a price beyond the Postgres INTEGER range', () => {
      expect(
        createInstructorRateSchema.safeParse({ priceCentsPerHour: 2_147_483_648, validFrom: '2026-07-07' }).success,
      ).toBe(false);
    });

    it('rejects a malformed validFrom', () => {
      expect(createInstructorRateSchema.safeParse({ priceCentsPerHour: 4500, validFrom: '07/07/2026' }).success).toBe(false);
      expect(createInstructorRateSchema.safeParse({ priceCentsPerHour: 4500, validFrom: 'not-a-date' }).success).toBe(false);
    });

    it('accepts a valid positive integer price and ISO date', () => {
      expect(createInstructorRateSchema.safeParse({ priceCentsPerHour: 4500, validFrom: '2026-07-07' }).success).toBe(true);
    });
  });
});
