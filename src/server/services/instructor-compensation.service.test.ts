import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDateOnlyUtc } from '@/lib/date-only';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyInZone } from '@/lib/zoned-time';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

/**
 * TDD (epic 12, story 12.7, AC 2) — written BEFORE
 * `instructor-compensation.service.ts` exists.
 */

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: { findUnique: vi.fn(), findMany: vi.fn() },
    flight: { groupBy: vi.fn(), findMany: vi.fn() },
    instructorPayout: { groupBy: vi.fn(), create: vi.fn() },
    instructorProfile: { update: vi.fn() },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { getCompensationSummary, getInstructorCompensationDetail, recordPayout, setPayoutRate } = await import('./instructor-compensation.service');
const { ConflictError, NotFoundError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const payoutGroupByMock = vi.mocked(prisma.instructorPayout.groupBy);
const payoutCreateMock = vi.mocked(prisma.instructorPayout.create);
const profileUpdateMock = vi.mocked(prisma.instructorProfile.update);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as instructor-rates.service.test.ts/
// school.service.test.ts) — thin, loosely-typed wrappers around each mock.
type Fixture = Record<string, unknown> | null;
type ImplFn = (args: Record<string, unknown>) => Promise<unknown>;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const personFindMany = personFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightGroupBy = flightGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightFindMany = flightFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const payoutGroupBy = payoutGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void; mockImplementation: (fn: ImplFn) => void };
const payoutCreate = payoutCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const profileUpdate = profileUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

/** A single ACTIVE instructor row, as `person.findMany`'s select shape returns it. */
function instructorPersonRow(overrides: Partial<Record<string, unknown>> = {}): Fixture {
  return {
    id: 'person_ines',
    firstName: 'Ines',
    lastName: 'Volpi',
    instructorProfile: { id: 'profile_ines', ratings: 'SEP(land), FI(A)', payoutRateCents: 3000 },
    ...overrides,
  };
}

/** Resolves every `flight.groupBy`/`instructorPayout.groupBy` call to empty (0 minutes/0 paid) — keeps every OTHER test from having to stub all 6 calls. */
function stubZeroAggregates(): void {
  flightGroupBy.mockResolvedValue([]);
  payoutGroupBy.mockResolvedValue([]);
}

describe('instructor-compensation.service (story 12.7)', () => {
  beforeEach(() => {
    personFindUniqueMock.mockReset();
    personFindManyMock.mockReset();
    flightGroupByMock.mockReset();
    flightFindManyMock.mockReset();
    payoutGroupByMock.mockReset();
    payoutCreateMock.mockReset();
    profileUpdateMock.mockReset();
    vi.useRealTimers();
  });

  describe('authorization (AD-5)', () => {
    it('getCompensationSummary rejects an actor without finance.manage', async () => {
      await expect(getCompensationSummary(pilotActor())).rejects.toThrow(ForbiddenError);
      expect(personFindManyMock).not.toHaveBeenCalled();
    });

    it('getInstructorCompensationDetail rejects an actor without finance.manage', async () => {
      await expect(getInstructorCompensationDetail(pilotActor(), 'person_ines')).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('recordPayout rejects a staff actor (needs payouts.manage, ADMIN-only)', async () => {
      await expect(
        recordPayout(staffActor(), {
          instructorPersonId: 'person_ines',
          amountCents: 10000,
          periodStart: '2026-07-01',
          periodEnd: '2026-07-15',
          method: 'CASH',
          notes: null,
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });

    it('setPayoutRate rejects a staff actor (needs payouts.manage, ADMIN-only)', async () => {
      await expect(setPayoutRate(staffActor(), 'person_ines', 3000)).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('getCompensationSummary — minutes/owed computation (AC 2)', () => {
    it('returns 0 hours and null owed for an instructor with no flights and no payout rate', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow({ instructorProfile: { id: 'profile_ines', ratings: 'SEP(land)', payoutRateCents: null } })]);
      stubZeroAggregates();

      const [row] = await getCompensationSummary(staffActor());

      expect(row?.payoutRateCents).toBeNull();
      expect(row?.totalMinutes).toBe(0);
      expect(row?.owedMtdCents).toBeNull();
      expect(row?.owedYtdCents).toBeNull();
      expect(row?.owedTotalCents).toBeNull();
    });

    it('computes owed = round(minutes/60 * rate) minus payouts already made, for the TOTAL variant', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow()]); // rate 3000 c/h
      flightGroupBy.mockResolvedValue([{ instructorProfileId: 'profile_ines', _sum: { minutes: 130 } }]); // same for every call (mtd/ytd/total) in this fixture
      payoutGroupBy.mockResolvedValue([{ instructorProfileId: 'profile_ines', _sum: { amountCents: 2000 } }]);

      const [row] = await getCompensationSummary(staffActor());

      // 130 min / 60 * 3000 = 6500.0 (round -> 6500) - 2000 already paid = 4500
      expect(row?.totalMinutes).toBe(130);
      expect(row?.owedTotalCents).toBe(4500);
    });

    it('rounds a fractional gross amount (Math.round, not truncation)', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow({ instructorProfile: { id: 'profile_ines', ratings: 'SEP(land)', payoutRateCents: 4501 } })]);
      // 25 minutes / 60 * 4501 = 1875.4166... -> rounds to 1875
      flightGroupBy.mockResolvedValue([{ instructorProfileId: 'profile_ines', _sum: { minutes: 25 } }]);
      payoutGroupBy.mockResolvedValue([]);

      const [row] = await getCompensationSummary(staffActor());

      expect(row?.owedTotalCents).toBe(1875);
    });

    it('defaults minutes to 0 for an instructor absent from the groupBy result (no SCHOOL flights this variant)', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow()]);
      flightGroupBy.mockResolvedValue([]);
      payoutGroupBy.mockResolvedValue([]);

      const [row] = await getCompensationSummary(staffActor());

      expect(row?.mtdMinutes).toBe(0);
      expect(row?.owedMtdCents).toBe(0);
    });

    it('queries flights scoped to SCHOOL, non-CANCELLED, batched (never N+1) across the whole instructor platea', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow()]);
      stubZeroAggregates();

      await getCompensationSummary(staffActor());

      for (const call of flightGroupByMock.mock.calls) {
        const args = call[0] as { by: string[]; where: Record<string, unknown> };
        expect(args.by).toEqual(['instructorProfileId']);
        expect(args.where['flightType']).toBe('SCHOOL');
        expect(args.where['status']).toEqual({ not: 'CANCELLED' });
        expect(args.where['instructorProfileId']).toEqual({ in: ['profile_ines'] });
      }
    });
  });

  describe('getCompensationSummary — mtd/ytd/total Rome-day boundaries (PR #17 lesson)', () => {
    it('at 2026-12-31T23:30:00Z (already 2027-01-01 in Rome, CET/UTC+1) mtd/ytd bounds use the ROME date, not the UTC one', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-31T23:30:00.000Z'));

      personFindMany.mockResolvedValue([instructorPersonRow()]);
      stubZeroAggregates();

      await getCompensationSummary(staffActor());

      const today = todayDateOnlyInZone(APP_TIMEZONE);
      expect(today).toBe('2027-01-01');

      const flightRanges = flightGroupByMock.mock.calls.map((call) => (call[0] as { where: { flightDate?: { gte: Date; lte: Date } } }).where.flightDate);
      // mtd and ytd both bound by the ROME "today" (2027-01-01, month/year just rolled over); total has no date filter at all.
      const boundToRomeToday = flightRanges.filter((range) => range?.gte.getTime() === parseDateOnlyUtc('2027-01-01').getTime() && range.lte.getTime() === parseDateOnlyUtc('2027-01-01').getTime());
      expect(boundToRomeToday).toHaveLength(2); // mtd + ytd
      expect(flightRanges.some((range) => range === undefined)).toBe(true); // total

      vi.useRealTimers();
    });

    it('attributes a payout to the mtd variant ONLY when its periodEnd falls within the current Rome month, by periodEnd (never createdAt)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-22T22:30:00.000Z')); // 2026-07-23 00:30 Rome (CEST, UTC+2)

      personFindMany.mockResolvedValue([instructorPersonRow()]);
      flightGroupBy.mockResolvedValue([]);
      payoutGroupBy.mockImplementation(async (args) => {
        const where = (args as { where: { periodEnd?: { gte: Date; lte: Date } } }).where;
        if (!where.periodEnd) {
          // total variant: unbounded, sums BOTH payouts.
          return [{ instructorProfileId: 'profile_ines', _sum: { amountCents: 5000 } }];
        }
        const monthStart = parseDateOnlyUtc('2026-07-01').getTime();
        if (where.periodEnd.gte.getTime() === monthStart) {
          // mtd: only the payout whose periodEnd is inside July.
          return [{ instructorProfileId: 'profile_ines', _sum: { amountCents: 3000 } }];
        }
        // ytd (yearStart..today): not asserted by this test.
        return [];
      });

      const [row] = await getCompensationSummary(staffActor());

      expect(row?.owedMtdCents).toBe(0 - 3000);
      expect(row?.owedTotalCents).toBe(0 - 5000);

      vi.useRealTimers();
    });
  });

  describe('getInstructorCompensationDetail (AC 3, AC 7)', () => {
    it('404s on an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(getInstructorCompensationDetail(staffActor(), 'unknown')).rejects.toThrow(NotFoundError);
    });

    it('404s on a person with no active instructor profile', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_x', firstName: 'X', lastName: 'Y', instructorProfile: null });
      await expect(getInstructorCompensationDetail(staffActor(), 'person_x')).rejects.toThrow(NotFoundError);
    });

    it('returns recentFlights (max 5, SCHOOL, non-cancelled) and DISTINCT recentStudents derived from them', async () => {
      personFindUnique.mockResolvedValue({
        id: 'person_ines',
        firstName: 'Ines',
        lastName: 'Volpi',
        instructorProfile: { id: 'profile_ines', ratings: 'SEP(land)', payoutRateCents: 3000, deactivatedAt: null },
      });
      flightGroupBy.mockResolvedValue([]);
      payoutGroupBy.mockResolvedValue([]);
      flightFindMany.mockResolvedValue([
        { id: 'flight_1', flightDate: new Date('2026-07-10T00:00:00.000Z'), minutes: 60, personId: 'student_a', person: { firstName: 'Anna', lastName: 'Allieva' } },
        { id: 'flight_2', flightDate: new Date('2026-07-09T00:00:00.000Z'), minutes: 45, personId: 'student_a', person: { firstName: 'Anna', lastName: 'Allieva' } },
        { id: 'flight_3', flightDate: new Date('2026-07-08T00:00:00.000Z'), minutes: 30, personId: 'student_b', person: { firstName: 'Bruno', lastName: 'Barone' } },
      ]);

      const detail = await getInstructorCompensationDetail(staffActor(), 'person_ines');

      expect(detail.recentFlights).toHaveLength(3);
      expect(detail.recentStudents).toEqual([
        { personId: 'student_a', firstName: 'Anna', lastName: 'Allieva' },
        { personId: 'student_b', firstName: 'Bruno', lastName: 'Barone' },
      ]);
      const findManyArgs = flightFindManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown>; take: number };
      expect(findManyArgs.where['instructorProfileId']).toBe('profile_ines');
      expect(findManyArgs.where['flightType']).toBe('SCHOOL');
      expect(findManyArgs.where['status']).toEqual({ not: 'CANCELLED' });
      expect(findManyArgs.take).toBe(5);
    });
  });

  describe('recordPayout (AC 2, AC 5)', () => {
    const validInput = {
      instructorPersonId: 'person_ines',
      amountCents: 5000,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-15',
      method: 'CASH' as const,
      notes: null,
    };

    it('404s on an unknown instructor person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(recordPayout(adminActor(), validInput)).rejects.toThrow(NotFoundError);
      expect(payoutCreateMock).not.toHaveBeenCalled();
    });

    it('409s when the person has no active instructor profile (never activated, or deactivated)', async () => {
      personFindUnique.mockResolvedValue({ instructorProfile: null });
      await expect(recordPayout(adminActor(), validInput)).rejects.toThrow(ConflictError);

      personFindUnique.mockResolvedValue({ instructorProfile: { id: 'profile_ines', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } });
      await expect(recordPayout(adminActor(), validInput)).rejects.toThrow(ConflictError);
      expect(payoutCreateMock).not.toHaveBeenCalled();
    });

    it('creates the payout row against the resolved instructorProfileId, actor as actorUserId', async () => {
      personFindUnique.mockResolvedValue({ instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      payoutCreate.mockResolvedValue({
        id: 'payout_1',
        instructorProfileId: 'profile_ines',
        amountCents: 5000,
        periodStart: new Date('2026-07-01T00:00:00.000Z'),
        periodEnd: new Date('2026-07-15T00:00:00.000Z'),
        method: 'CASH',
        notes: null,
        actorUserId: 'admin_1',
        createdAt: new Date('2026-07-15T08:00:00.000Z'),
      });

      const result = await recordPayout(adminActor(), validInput);

      expect(result.id).toBe('payout_1');
      expect(result.periodStart).toBe('2026-07-01');
      expect(result.periodEnd).toBe('2026-07-15');
      const createArgs = payoutCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(createArgs.data['instructorProfileId']).toBe('profile_ines');
      expect(createArgs.data['actorUserId']).toBe('admin_1');
      expect(createArgs.data['amountCents']).toBe(5000);
    });
  });

  describe('setPayoutRate (AC 2, AC 6)', () => {
    it('404s on an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(setPayoutRate(adminActor(), 'unknown', 3000)).rejects.toThrow(NotFoundError);
    });

    it('409s when the person has no active instructor profile', async () => {
      personFindUnique.mockResolvedValue({ instructorProfile: null });
      await expect(setPayoutRate(adminActor(), 'person_x', 3000)).rejects.toThrow(ConflictError);
      expect(profileUpdateMock).not.toHaveBeenCalled();
    });

    it('sets a positive rate', async () => {
      personFindUnique.mockResolvedValue({ instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      profileUpdate.mockResolvedValue({ payoutRateCents: 3500 });

      const result = await setPayoutRate(adminActor(), 'person_ines', 3500);

      expect(result.payoutRateCents).toBe(3500);
      const updateArgs = profileUpdateMock.mock.calls[0]?.[0] as { where: { id: string }; data: { payoutRateCents: number | null } };
      expect(updateArgs.where.id).toBe('profile_ines');
      expect(updateArgs.data.payoutRateCents).toBe(3500);
    });

    it('clears the rate back to null', async () => {
      personFindUnique.mockResolvedValue({ instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      profileUpdate.mockResolvedValue({ payoutRateCents: null });

      const result = await setPayoutRate(adminActor(), 'person_ines', null);

      expect(result.payoutRateCents).toBeNull();
    });
  });
});
