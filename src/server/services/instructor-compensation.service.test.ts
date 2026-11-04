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
    // `findUnique` (story 14.7): `getOwnInstructorProfileId` (`bookings.service.ts`,
    // reused here — see `getOwnCompensationOverview`) reads it via the SAME
    // mocked `prisma` module (vitest's module registry is per-test-file).
    instructorPayout: { groupBy: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    instructorProfile: { update: vi.fn(), findUnique: vi.fn() },
    cashCategory: { findUnique: vi.fn() },
    cashMovement: { create: vi.fn() },
    $transaction: vi.fn(),
    // The payout's row lock (review 16.5 I-1, `assertStillOwedUnderLock`).
    $queryRaw: vi.fn(),
  },
}));

// Review F1: `getOwnInstructorProfileId` is imported from `bookings.service.ts`,
// which imports `@/server/adapters/mail` (for its own notification flow) ->
// `smtp-mail-sender.ts` -> `@/lib/env`'s EAGER Zod validation. Same mock as
// `bookings.service.test.ts:45-47` — without it, this file only passes in a
// shell with `.env` exported (the env vars happen to already be set), never in
// a clean shell (the class closed for `billing-summary` by commit `3c6add9`).
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: vi.fn() })),
}));

// Same chain, one hop further: `bookings.service.ts` also imports
// `./app-settings.service` (its own scheduling-window check), which imports
// `@/server/crypto/secret-box` -> `@/lib/env` too. Same sibling-service mock
// convention as `bookings.service.test.ts` — this test never exercises the
// scheduling window, so a bare stub is enough.
vi.mock('./app-settings.service', () => ({ getSchedulingSettings: vi.fn() }));

const { prisma } = await import('@/server/db/prisma');
const {
  getCompensationSummary,
  getInstructorCompensationDetail,
  getOwnCompensationOverview,
  getOwnCompensationSummary,
  recordPayout,
  setPayoutRate,
} = await import('./instructor-compensation.service');
const { ConflictError, NotFoundError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const flightGroupByMock = vi.mocked(prisma.flight.groupBy);
const flightFindManyMock = vi.mocked(prisma.flight.findMany);
const payoutGroupByMock = vi.mocked(prisma.instructorPayout.groupBy);
const payoutCreateMock = vi.mocked(prisma.instructorPayout.create);
const payoutFindManyMock = vi.mocked(prisma.instructorPayout.findMany);
const profileUpdateMock = vi.mocked(prisma.instructorProfile.update);
const profileFindUniqueMock = vi.mocked(prisma.instructorProfile.findUnique);
const cashCategoryFindUniqueMock = vi.mocked(prisma.cashCategory.findUnique);
const cashMovementCreateMock = vi.mocked(prisma.cashMovement.create);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as instructor-rates.service.test.ts)
// — thin, loosely-typed wrappers around each mock.
type Fixture = Record<string, unknown> | null;
type ImplFn = (args: Record<string, unknown>) => Promise<unknown>;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const personFindMany = personFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightGroupBy = flightGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const flightFindMany = flightFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const payoutGroupBy = payoutGroupByMock as unknown as { mockResolvedValue: (v: Fixture[]) => void; mockImplementation: (fn: ImplFn) => void };
const payoutCreate = payoutCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const payoutFindMany = payoutFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const profileUpdate = profileUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const profileFindUnique = profileFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const cashCategoryFindUnique = cashCategoryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const cashMovementCreate = cashMovementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };

/** Same "`$transaction(fn)` invoked with the mocked `prisma` itself as `tx`" stand-in as `accounts.service.test.ts#mockTransaction`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])));
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
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
    instructorProfile: { id: 'profile_ines', payoutRateCents: 3000 },
    ...overrides,
  };
}

/** One instructor of the roster with the two flags the services filter on (story 16.5) — `stubRoster` answers each `person.findMany` with the ones its `where` selects. */
type RosterPerson = {
  id: string;
  firstName: string;
  lastName: string;
  archivedAt: Date | null;
  instructorProfile: { id: string; payoutRateCents: number | null; deactivatedAt: Date | null };
};

function rosterPerson(id: string, overrides: { archivedAt?: Date | null; deactivatedAt?: Date | null; payoutRateCents?: number | null } = {}): RosterPerson {
  return {
    id: `person_${id}`,
    firstName: id,
    lastName: 'Rossi',
    archivedAt: overrides.archivedAt ?? null,
    instructorProfile: { id: `profile_${id}`, payoutRateCents: overrides.payoutRateCents === undefined ? 3000 : overrides.payoutRateCents, deactivatedAt: overrides.deactivatedAt ?? null },
  };
}

/** Evaluates the Prisma `where` shapes the two roster queries use (equality, `null`, `{ not: null }`, `{ isNot: null }`, `OR`, a nested relation) — so a test measures the FILTER, never a fixture picked by hand. */
function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Array<Record<string, unknown>>).some((branch) => matchesWhere(row, branch));
    const value = row[key];
    if (condition === null) return value === null;
    if (typeof condition === 'object' && !(condition instanceof Date)) {
      const operator = condition as Record<string, unknown>;
      if ('isNot' in operator) return operator['isNot'] === null && value !== null && value !== undefined;
      if ('not' in operator) return operator['not'] === null && value !== null && value !== undefined;
      return value !== null && typeof value === 'object' && matchesWhere(value as Record<string, unknown>, operator);
    }
    return value === condition;
  });
}

function stubRoster(people: RosterPerson[]): void {
  personFindManyMock.mockImplementation((async (args: { where: Record<string, unknown> }) =>
    people
      .filter((person) => matchesWhere(person as unknown as Record<string, unknown>, args.where))
      .map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        instructorProfile: { id: person.instructorProfile.id, payoutRateCents: person.instructorProfile.payoutRateCents },
      }))) as never);
}

/** Per-profile SCHOOL flight sums (`_sum.minutes`/`_sum.instructorPayoutCents`) and payout sums, the SAME for every variant (mtd/ytd/total) — each fixture says how much the flights FROZE, the reader never recomputes it. */
function stubAggregates(flights: Record<string, { minutes: number; accruedCents: number }>, paid: Record<string, number> = {}): void {
  flightGroupBy.mockResolvedValue(
    Object.entries(flights).map(([instructorProfileId, sums]) => ({ instructorProfileId, _sum: { minutes: sums.minutes, instructorPayoutCents: sums.accruedCents } })),
  );
  payoutGroupBy.mockResolvedValue(Object.entries(paid).map(([instructorProfileId, amountCents]) => ({ instructorProfileId, _sum: { amountCents } })));
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
    payoutFindManyMock.mockReset();
    profileUpdateMock.mockReset();
    profileFindUniqueMock.mockReset();
    cashCategoryFindUniqueMock.mockReset();
    cashMovementCreateMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    mockTransaction();
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

    it('recordPayout rejects a non-admin actor (needs payouts.manage, ADMIN-only)', async () => {
      await expect(
        recordPayout(pilotActor(), {
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

    it('setPayoutRate rejects a non-admin actor (needs payouts.manage, ADMIN-only)', async () => {
      await expect(setPayoutRate(pilotActor(), 'person_ines', 3000)).rejects.toThrow(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
    });
  });

  describe('getOwnCompensationSummary (story 12.12, AC 5; ratifica utente 2 — own-scoped, no new permission)', () => {
    it('rejects an unauthenticated-shaped actor without self.read (defensive — every real Role has self.read)', async () => {
      await expect(getOwnCompensationSummary({ userId: 'u1', personId: 'person_ines', roles: [] })).rejects.toThrow(ForbiddenError);
      expect(personFindManyMock).not.toHaveBeenCalled();
    });

    it('returns null for an actor with no linked person — never queries', async () => {
      const result = await getOwnCompensationSummary({ userId: 'u1', personId: null, roles: ['INSTRUCTOR'] });
      expect(result).toBeNull();
      expect(personFindManyMock).not.toHaveBeenCalled();
    });

    it('returns null when the actor\'s own person has no active InstructorProfile (never fabricates data)', async () => {
      personFindMany.mockResolvedValue([]);

      const result = await getOwnCompensationSummary({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).toBeNull();
    });

    it('returns the own payoutRateCents/mtdMinutes/owedMtdCents, scoped to the actor\'s own personId only — the ACTIVE platea alone (story 16.5, AD-9)', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow()]); // rate 3000 c/h
      stubAggregates({ profile_ines: { minutes: 130, accruedCents: 6500 } }, { profile_ines: 2000 });

      const result = await getOwnCompensationSummary({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).toEqual({ payoutRateCents: 3000, mtdMinutes: 130, owedMtdCents: 4500 });
      expect(personFindManyMock).toHaveBeenCalledTimes(1); // never the no-longer-active twin
      const [args] = personFindManyMock.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(args.where).toEqual({ archivedAt: null, instructorProfile: { deactivatedAt: null }, id: 'person_ines' });
    });

    // Story 16.5 changes this contract (R-16-k): a flight whose instructor had
    // no payout rate froze 0, so the owed of an instructor without a rate is a
    // NUMBER — 0 with no flights at all — never the `null` ("unknown") it was
    // when the owed was recomputed from today's rate.
    it('a null payoutRateCents (no rate set yet) yields owedMtdCents 0, a number like every other owed (R-16-k)', async () => {
      personFindMany.mockResolvedValue([instructorPersonRow({ instructorProfile: { id: 'profile_ines', payoutRateCents: null } })]);
      stubZeroAggregates();

      const result = await getOwnCompensationSummary({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).toEqual({ payoutRateCents: null, mtdMinutes: 0, owedMtdCents: 0 });
    });
  });

  describe('getOwnCompensationOverview (story 14.7, AC 2/3/6 — self-service, no personId/instructorProfileId parameter)', () => {
    it('rejects an actor without self.read (defensive — every real Role has self.read)', async () => {
      await expect(getOwnCompensationOverview({ userId: 'u1', personId: 'person_ines', roles: [] })).rejects.toThrow(ForbiddenError);
      expect(profileFindUniqueMock).not.toHaveBeenCalled();
    });

    it('returns null for an actor with no linked person — never queries the profile or the payouts', async () => {
      const result = await getOwnCompensationOverview({ userId: 'u1', personId: null, roles: ['INSTRUCTOR'] });
      expect(result).toBeNull();
      expect(profileFindUniqueMock).not.toHaveBeenCalled();
      expect(payoutFindManyMock).not.toHaveBeenCalled();
    });

    it("returns null when the actor's own InstructorProfile is DEACTIVATED (AC 4 — never fabricates data)", async () => {
      profileFindUnique.mockResolvedValue({ id: 'profile_ines', deactivatedAt: new Date('2026-01-01') });

      const result = await getOwnCompensationOverview({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).toBeNull();
      expect(payoutFindManyMock).not.toHaveBeenCalled();
    });

    it('returns null when the actor has no InstructorProfile at all', async () => {
      profileFindUnique.mockResolvedValue(null);

      const result = await getOwnCompensationOverview({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).toBeNull();
      expect(payoutFindManyMock).not.toHaveBeenCalled();
    });

    it("resolves the actor's OWN active profile (getOwnInstructorProfileId) and returns accrual (gross + net) + payout history, scoped to that profile only", async () => {
      // ONE `instructorProfile.findUnique` fixture serves BOTH callers within
      // `getOwnCompensationOverview`: `getOwnInstructorProfileId` (needs
      // `id`/`deactivatedAt`) and `resolveInstructorRowByProfileId` (review
      // F5/F7 — needs `payoutRateCents`/`person`, and deliberately does NOT
      // check `Person.archivedAt`).
      profileFindUnique.mockResolvedValue({
        id: 'profile_ines',
        deactivatedAt: null,
        payoutRateCents: 3000,
        person: { id: 'person_ines', firstName: 'Ines', lastName: 'Volpi' },
      });
      // The month's flights froze 5200 c: they were flown at 24,00 €/h, before
      // the rate became 30,00 €/h — 130 min at TODAY's rate would be 6500.
      stubAggregates({ profile_ines: { minutes: 130, accruedCents: 5200 } }, { profile_ines: 2000 });
      payoutFindMany.mockResolvedValue([
        {
          id: 'payout_1',
          amountCents: 2000,
          periodStart: parseDateOnlyUtc('2026-07-01'),
          periodEnd: parseDateOnlyUtc('2026-07-15'),
          method: 'CASH',
          createdAt: new Date('2026-07-16T10:00:00.000Z'),
        },
      ]);

      const result = await getOwnCompensationOverview({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).toEqual({
        payoutRateCents: 3000,
        mtdMinutes: 130,
        mtdGrossCents: 5200, // story 16.5 (U16): the sum the flights froze — review F4's gross, never minutes x today's rate
        mtdOwedCents: 3200, // gross - 2000 already paid: the two KPIs reconcile
        totalOwedCents: 3200,
        payouts: [
          {
            id: 'payout_1',
            amountCents: 2000,
            periodStart: '2026-07-01',
            periodEnd: '2026-07-15',
            method: 'CASH',
            createdAt: new Date('2026-07-16T10:00:00.000Z'),
          },
        ],
      });

      // The payout query is scoped to the profile `getOwnInstructorProfileId`
      // resolved from the ACTOR — never a client-supplied id (AC 3).
      const [payoutArgs] = payoutFindManyMock.mock.calls[0] as [{ where: { instructorProfileId?: string } }];
      expect(payoutArgs.where.instructorProfileId).toBe('profile_ines');
    });

    it('resolves directly from the instructor profile, never through listActiveInstructors (review F5/F7 — an ARCHIVED person with an active profile still gets their own history, no archivedAt filter to disagree with the sidebar)', async () => {
      profileFindUnique.mockResolvedValue({
        id: 'profile_ines',
        deactivatedAt: null,
        payoutRateCents: 3000,
        person: { id: 'person_ines', firstName: 'Ines', lastName: 'Volpi' },
      });
      stubZeroAggregates();
      payoutFindMany.mockResolvedValue([]);

      const result = await getOwnCompensationOverview({ userId: 'u1', personId: 'person_ines', roles: ['INSTRUCTOR'] });

      expect(result).not.toBeNull();
      // `listActiveInstructors` (the `Person.archivedAt`-filtering path used by
      // the staff-facing reads) is never reached from this function.
      expect(personFindManyMock).not.toHaveBeenCalled();
    });

    it('never accepts a second (personId/instructorProfileId) argument — there is no parameter to pass one through', () => {
      expect(getOwnCompensationOverview).toHaveLength(1);
    });
  });

  describe('getCompensationSummary — minutes/owed computation (AC 2; story 16.5, the snapshot)', () => {
    it('returns 0 hours and an owed of 0 for an instructor with no flights and no payout rate (story 16.5, AC 11 — nothing accrued, nothing owed)', async () => {
      stubRoster([rosterPerson('ines', { payoutRateCents: null })]);
      stubZeroAggregates();

      const [row] = await getCompensationSummary(adminActor());

      expect(row?.payoutRateCents).toBeNull();
      expect(row?.totalMinutes).toBe(0);
      expect(row?.owedMtdCents).toBe(0);
      expect(row?.owedYtdCents).toBe(0);
      expect(row?.owedTotalCents).toBe(0);
      expect(row?.isActive).toBe(true);
    });

    it('computes owed = the sum the SCHOOL flights froze (instructorPayoutCents) minus the payouts already made, for every variant (story 16.5, AC 8)', async () => {
      stubRoster([rosterPerson('ines')]);
      stubAggregates({ profile_ines: { minutes: 130, accruedCents: 6500 } }, { profile_ines: 2000 });

      const [row] = await getCompensationSummary(adminActor());

      expect(row?.totalMinutes).toBe(130);
      expect(row?.owedMtdCents).toBe(4500);
      expect(row?.owedYtdCents).toBe(4500);
      expect(row?.owedTotalCents).toBe(4500);
    });

    // Ledger audit MAJOR-1, the discriminating case of story 16.5 (AC 9, U9):
    // before the snapshot the reader computed round(minutes/60 x TODAY's rate),
    // so one rate change rewrote the owed of hours already paid — +500,00 € here.
    it('100 h paid in full at 20,00 €/h: the owed stays 0 whatever the payout rate is TODAY (AC 9 — the past is never rewritten)', async () => {
      stubAggregates({ profile_ines: { minutes: 6000, accruedCents: 200_000 } }, { profile_ines: 200_000 });

      for (const payoutRateCents of [2000, 2500, 1800, null]) {
        stubRoster([rosterPerson('ines', { payoutRateCents })]);
        const [row] = await getCompensationSummary(adminActor());
        expect(row?.owedTotalCents, `rate ${payoutRateCents}`).toBe(0);
      }
    });

    it('sums what the flights froze, never re-rounding on the aggregate (story 16.5, AD-3): two 25-min flights at 45,01 €/h froze 1875 c each, owed 3750 — not round(50/60 x 4501) = 3751', async () => {
      stubRoster([rosterPerson('ines', { payoutRateCents: 4501 })]);
      stubAggregates({ profile_ines: { minutes: 50, accruedCents: 3750 } });

      const [row] = await getCompensationSummary(adminActor());

      expect(row?.owedTotalCents).toBe(3750);
    });

    it('defaults minutes and owed to 0 for an instructor absent from the groupBy result (no SCHOOL flights this variant)', async () => {
      stubRoster([rosterPerson('ines')]);
      stubZeroAggregates();

      const [row] = await getCompensationSummary(adminActor());

      expect(row?.mtdMinutes).toBe(0);
      expect(row?.owedMtdCents).toBe(0);
    });

    it('queries flights scoped to SCHOOL with no status clause (story 19.6: no-charge flights count too), summing minutes AND the snapshot in the same groupBy, batched (never N+1) across both platee: 3 flight + 3 payout queries (story 16.5, U14/U15)', async () => {
      stubRoster([rosterPerson('ines'), rosterPerson('luca'), rosterPerson('olga', { archivedAt: new Date('2026-01-01T00:00:00.000Z') })]);
      stubZeroAggregates();

      await getCompensationSummary(adminActor());

      expect(flightGroupByMock).toHaveBeenCalledTimes(3);
      expect(payoutGroupByMock).toHaveBeenCalledTimes(3);
      for (const call of flightGroupByMock.mock.calls) {
        const args = call[0] as { by: string[]; where: Record<string, unknown>; _sum: Record<string, unknown> };
        expect(args.by).toEqual(['instructorProfileId']);
        expect(args.where['flightType']).toBe('SCHOOL');
        expect(args.where).not.toHaveProperty('status');
        expect(args.where['instructorProfileId']).toEqual({ in: ['profile_ines', 'profile_luca', 'profile_olga'] });
        expect(args._sum).toEqual({ minutes: true, instructorPayoutCents: true });
      }
    });
  });

  // Ledger audit MAJOR-2 (story 16.5, P4 — AC 13, U12/U13): the instructor who
  // left was in NO summary, so the money owed to them was invisible.
  describe('getCompensationSummary — the instructors no longer active (story 16.5, P4)', () => {
    const LEFT = new Date('2026-03-01T00:00:00.000Z');

    it('lists the active instructors, then those no longer active whose all-time owed is not zero, each flagged; one whose owed is zero is left out', async () => {
      stubRoster([
        rosterPerson('ines'),
        rosterPerson('olga', { archivedAt: LEFT, deactivatedAt: LEFT }),
        rosterPerson('piero', { deactivatedAt: LEFT }),
        rosterPerson('sara', { archivedAt: LEFT }),
        rosterPerson('ugo', { archivedAt: LEFT, deactivatedAt: LEFT }),
      ]);
      stubAggregates(
        {
          profile_ines: { minutes: 60, accruedCents: 3000 },
          profile_olga: { minutes: 2000, accruedCents: 100_000 },
          profile_piero: { minutes: 60, accruedCents: 3000 },
          profile_ugo: { minutes: 120, accruedCents: 6000 },
        },
        // Piero was paid exactly what he accrued, Sara more than she accrued (no flights at all).
        { profile_piero: 3000, profile_sara: 5000 },
      );

      const summary = await getCompensationSummary(adminActor());

      expect(summary.map((row) => [row.personId, row.isActive, row.owedTotalCents])).toEqual([
        ['person_ines', true, 3000],
        ['person_olga', false, 100_000],
        ['person_sara', false, -5000],
        ['person_ugo', false, 6000],
      ]);
    });

    it('an active instructor stays listed with an owed of 0 (only the no-longer-active ones are filtered)', async () => {
      stubRoster([rosterPerson('ines')]);
      stubZeroAggregates();

      expect(await getCompensationSummary(adminActor())).toHaveLength(1);
    });

    it('reads the no-longer-active platea with ONE query: an instructor profile, and the person archived OR the profile deactivated', async () => {
      stubRoster([]);
      stubZeroAggregates();

      await getCompensationSummary(adminActor());

      const wheres = personFindManyMock.mock.calls.map((call) => (call[0] as { where: Record<string, unknown> }).where);
      expect(wheres).toEqual([
        { archivedAt: null, instructorProfile: { deactivatedAt: null } },
        { instructorProfile: { isNot: null }, OR: [{ archivedAt: { not: null } }, { instructorProfile: { deactivatedAt: { not: null } } }] },
      ]);
      expect(flightGroupByMock).not.toHaveBeenCalled(); // nobody at all -> no aggregate query
    });
  });

  describe('getCompensationSummary — mtd/ytd/total Rome-day boundaries (PR #17 lesson)', () => {
    it('at 2026-12-31T23:30:00Z (already 2027-01-01 in Rome, CET/UTC+1) mtd/ytd bounds use the ROME date, not the UTC one', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-31T23:30:00.000Z'));

      stubRoster([rosterPerson('ines')]);
      stubZeroAggregates();

      await getCompensationSummary(adminActor());

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

      stubRoster([rosterPerson('ines')]);
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

      const [row] = await getCompensationSummary(adminActor());

      expect(row?.owedMtdCents).toBe(0 - 3000);
      expect(row?.owedTotalCents).toBe(0 - 5000);
      expect(row?.isActive).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('getInstructorCompensationDetail (AC 3, AC 7)', () => {
    it('404s on an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(getInstructorCompensationDetail(adminActor(), 'unknown')).rejects.toThrow(NotFoundError);
    });

    it('404s on a person with no active instructor profile', async () => {
      personFindUnique.mockResolvedValue({ id: 'person_x', firstName: 'X', lastName: 'Y', instructorProfile: null });
      await expect(getInstructorCompensationDetail(adminActor(), 'person_x')).rejects.toThrow(NotFoundError);
    });

    it('still 404s on a DEACTIVATED profile, even one the summary lists as no longer active with an owed (story 16.5, Q-16.5-c: that row offers Paga only)', async () => {
      personFindUnique.mockResolvedValue({
        id: 'person_olga',
        firstName: 'Olga',
        lastName: 'Rossi',
        archivedAt: null,
        instructorProfile: { id: 'profile_olga', payoutRateCents: 3000, deactivatedAt: new Date('2026-03-01T00:00:00.000Z') },
      });
      await expect(getInstructorCompensationDetail(adminActor(), 'person_olga')).rejects.toThrow(NotFoundError);
      expect(flightGroupByMock).not.toHaveBeenCalled();
    });

    it('404s on an ARCHIVED person too, even with the profile still active — the summary flags that row isActive: false (review 16.5 F1)', async () => {
      personFindUnique.mockResolvedValue({
        id: 'person_olga',
        firstName: 'Olga',
        lastName: 'Rossi',
        archivedAt: new Date('2026-03-01T00:00:00.000Z'),
        instructorProfile: { id: 'profile_olga', payoutRateCents: 4500, deactivatedAt: null },
      });
      await expect(getInstructorCompensationDetail(adminActor(), 'person_olga')).rejects.toThrow(NotFoundError);
      expect(flightGroupByMock).not.toHaveBeenCalled();
    });

    it('returns recentFlights (max 5, SCHOOL, non-cancelled) and DISTINCT recentStudents derived from them', async () => {
      personFindUnique.mockResolvedValue({
        id: 'person_ines',
        firstName: 'Ines',
        lastName: 'Volpi',
        archivedAt: null,
        instructorProfile: { id: 'profile_ines', payoutRateCents: 3000, deactivatedAt: null },
      });
      flightGroupBy.mockResolvedValue([]);
      payoutGroupBy.mockResolvedValue([]);
      flightFindMany.mockResolvedValue([
        { id: 'flight_1', flightDate: new Date('2026-07-10T00:00:00.000Z'), minutes: 60, personId: 'student_a', person: { firstName: 'Anna', lastName: 'Allieva' } },
        { id: 'flight_2', flightDate: new Date('2026-07-09T00:00:00.000Z'), minutes: 45, personId: 'student_a', person: { firstName: 'Anna', lastName: 'Allieva' } },
        { id: 'flight_3', flightDate: new Date('2026-07-08T00:00:00.000Z'), minutes: 30, personId: 'student_b', person: { firstName: 'Bruno', lastName: 'Barone' } },
      ]);

      const detail = await getInstructorCompensationDetail(adminActor(), 'person_ines');

      expect(detail.isActive).toBe(true);
      expect(detail.recentFlights).toHaveLength(3);
      expect(detail.recentStudents).toEqual([
        { personId: 'student_a', firstName: 'Anna', lastName: 'Allieva' },
        { personId: 'student_b', firstName: 'Bruno', lastName: 'Barone' },
      ]);
      const findManyArgs = flightFindManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown>; take: number };
      expect(findManyArgs.where['instructorProfileId']).toBe('profile_ines');
      expect(findManyArgs.where['flightType']).toBe('SCHOOL');
      expect(findManyArgs.where).not.toHaveProperty('status');
      expect(findManyArgs.take).toBe(5);
    });
  });

  describe('recordPayout (AC 2, AC 5; story Billing-1, AC 4 — cash movement gemello)', () => {
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

    it('409s when the person has no instructor profile at all (never activated) — the plain CONFLICT, no owed read', async () => {
      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: null });
      await expect(recordPayout(adminActor(), validInput)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(flightGroupByMock).not.toHaveBeenCalled();
      expect(payoutCreateMock).not.toHaveBeenCalled();
    });

    // Story 16.5 (R-16-i): an instructor no longer active can still be paid
    // the work they did — the way out of the summary's "non più attivi" card.
    describe('an instructor no longer active (story 16.5, R-16-i)', () => {
      const LEFT = new Date('2026-03-01T00:00:00.000Z');

      beforeEach(() => {
        cashCategoryFindUnique.mockResolvedValue({ id: 'cat_compensi' });
        payoutCreate.mockResolvedValue({
          id: 'payout_1',
          instructorProfileId: 'profile_ines',
          amountCents: 20_000,
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-02-28T00:00:00.000Z'),
          method: 'BANK_TRANSFER',
          notes: null,
          actorUserId: 'admin_1',
          createdAt: new Date('2026-03-02T08:00:00.000Z'),
        });
        cashMovementCreate.mockResolvedValue({ id: 'cm_1' });
      });

      const payout = { ...validInput, amountCents: 20_000, periodStart: '2026-01-01', periodEnd: '2026-02-28', method: 'BANK_TRANSFER' as const };

      it('1 000,00 € owed to a deactivated instructor -> a 200,00 € payout is recorded, and the summary then shows 800,00 € still owed', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: LEFT } });
        stubAggregates({ profile_ines: { minutes: 2000, accruedCents: 100_000 } });

        await expect(recordPayout(adminActor(), payout)).resolves.toMatchObject({ id: 'payout_1', amountCents: 20_000 });
        // The owed read is the all-time one: no date bound on either sum.
        for (const call of [...flightGroupByMock.mock.calls, ...payoutGroupByMock.mock.calls]) {
          const where = (call[0] as { where: Record<string, unknown> }).where;
          expect(where).not.toHaveProperty('flightDate');
          expect(where).not.toHaveProperty('periodEnd');
          expect(where['instructorProfileId']).toEqual({ in: ['profile_ines'] });
        }
        expect(transactionMock).toHaveBeenCalledTimes(1);

        stubRoster([rosterPerson('ines', { deactivatedAt: LEFT })]);
        stubAggregates({ profile_ines: { minutes: 2000, accruedCents: 100_000 } }, { profile_ines: 20_000 });
        const [row] = await getCompensationSummary(adminActor());
        expect(row).toMatchObject({ personId: 'person_ines', isActive: false, owedTotalCents: 80_000 });
      });

      it('an ARCHIVED person counts as no longer active too, whatever the profile says (the summary\'s own rule)', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: LEFT, instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
        stubAggregates({ profile_ines: { minutes: 120, accruedCents: 6000 } }, { profile_ines: 6000 });

        await expect(recordPayout(adminActor(), payout)).rejects.toMatchObject({ code: 'INSTRUCTOR_NOTHING_OWED' });
      });

      it('409 INSTRUCTOR_NOTHING_OWED when the owed is zero or negative — nothing is written', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: LEFT } });

        for (const [accrued, paid] of [
          [0, 0],
          [6000, 6000],
          [6000, 9000],
        ] as const) {
          stubAggregates({ profile_ines: { minutes: 120, accruedCents: accrued } }, { profile_ines: paid });
          const error = await recordPayout(adminActor(), payout).catch((caught: unknown) => caught);
          expect(error, `accrued ${accrued}, paid ${paid}`).toBeInstanceOf(ConflictError);
          expect(error).toMatchObject({ code: 'INSTRUCTOR_NOTHING_OWED' });
        }
        expect(payoutCreateMock).not.toHaveBeenCalled();
        expect(cashMovementCreateMock).not.toHaveBeenCalled();
      });

      it('no cap on the amount: 1 500,00 € may be paid against 1 000,00 € owed (R-16-i asks owed > 0 only)', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: LEFT } });
        stubAggregates({ profile_ines: { minutes: 2000, accruedCents: 100_000 } });

        await expect(recordPayout(adminActor(), { ...payout, amountCents: 150_000 })).resolves.toBeDefined();
      });

      it('an ACTIVE instructor is paid as before — no owed read at all, so an advance (owed 0) is still allowed', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: null } });

        await expect(recordPayout(adminActor(), payout)).resolves.toBeDefined();
        expect(flightGroupByMock).not.toHaveBeenCalled();
        expect(payoutGroupByMock).not.toHaveBeenCalled();
        expect(queryRawMock).not.toHaveBeenCalled();
      });

      // Review 16.5 I-1 (PO 2026-11-04: concurrent payouts are BLOCKED).
      it('decides the owed under the InstructorProfile row lock: the lock is the transaction\'s first statement, and both sums are read AFTER it on tx, never on the global client (review 19.10 F2)', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: LEFT } });
        stubAggregates({ profile_ines: { minutes: 2000, accruedCents: 100_000 } });
        const calls: string[] = [];
        const tx = {
          $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
            calls.push(`lock ${strings.join('?')} ${values.join(',')}`);
            return [];
          }),
          flight: { groupBy: vi.fn(async (...args: unknown[]) => (calls.push('flights'), flightGroupByMock(...(args as [never])))) },
          instructorPayout: {
            groupBy: vi.fn(async (...args: unknown[]) => (calls.push('payouts'), payoutGroupByMock(...(args as [never])))),
            create: vi.fn(async (...args: unknown[]) => (calls.push('create'), payoutCreateMock(...(args as [never])))),
          },
          cashMovement: { create: vi.fn(async () => (calls.push('movement'), { id: 'cm_1' })) },
        };
        transaction.mockImplementation((fn: unknown) => (fn as (client: unknown) => unknown)(tx));

        await expect(recordPayout(adminActor(), payout)).resolves.toMatchObject({ id: 'payout_1' });

        expect(calls).toEqual(['lock SELECT "id" FROM "InstructorProfile" WHERE "id" = ? FOR NO KEY UPDATE profile_ines', 'flights', 'payouts', 'create', 'movement']);
        // Called through `tx` only: the stand-ins above delegate to these, so each count is the tx's.
        expect(flightGroupByMock).toHaveBeenCalledTimes(1);
        expect(payoutGroupByMock).toHaveBeenCalledTimes(1);
        expect(queryRawMock).not.toHaveBeenCalled();
      });

      it('two concurrent payouts of the whole owed: the first is recorded, the second waits for its commit and answers 409 INSTRUCTOR_NOTHING_OWED (review 16.5 I-1 — before the fix both passed and the money went out twice)', async () => {
        personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: LEFT } });
        cashCategoryFindUnique.mockResolvedValue({ id: 'cat_compensi' });
        // A one-instructor database under READ COMMITTED: a read sees the
        // payouts COMMITTED so far, and the row lock is held until the end of
        // the transaction that took it.
        let committedCents = 0;
        let lockHeld: Promise<void> | null = null;
        const readFlights = async () => [{ instructorProfileId: 'profile_ines', _sum: { minutes: 600, instructorPayoutCents: 100_000 } }];
        const readPayouts = async () => [{ instructorProfileId: 'profile_ines', _sum: { amountCents: committedCents } }];
        flightGroupByMock.mockImplementation(readFlights as never);
        payoutGroupByMock.mockImplementation(readPayouts as never);
        transaction.mockImplementation(async (fn: unknown) => {
          let release = (): void => {};
          let pendingCents = 0;
          const tx = {
            $queryRaw: async () => {
              while (lockHeld) await lockHeld;
              lockHeld = new Promise<void>((resolve) => {
                release = () => {
                  lockHeld = null;
                  resolve();
                };
              });
              return [];
            },
            flight: { groupBy: readFlights },
            instructorPayout: {
              groupBy: readPayouts,
              create: async ({ data }: { data: Record<string, unknown> }) => {
                pendingCents += data['amountCents'] as number;
                return { id: `payout_${pendingCents}`, createdAt: new Date(), ...data };
              },
            },
            cashMovement: { create: async () => ({ id: 'cm' }) },
          };
          try {
            const result = await (fn as (client: unknown) => Promise<unknown>)(tx);
            committedCents += pendingCents;
            return result;
          } finally {
            release();
          }
        });

        const whole = { ...payout, amountCents: 100_000 };
        const [first, second] = await Promise.allSettled([recordPayout(adminActor(), whole), recordPayout(adminActor(), whole)]);

        expect(first.status).toBe('fulfilled');
        expect(second.status).toBe('rejected');
        expect((second as PromiseRejectedResult).reason).toMatchObject({ code: 'INSTRUCTOR_NOTHING_OWED' });
        expect(committedCents).toBe(100_000);
      });
    });

    it('throws an explicit error when the "Compensi istruttori" cash category is missing (never silently create it) — resolved BEFORE the transaction', async () => {
      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      cashCategoryFindUnique.mockResolvedValue(null);

      await expect(recordPayout(adminActor(), validInput)).rejects.toThrow(/Compensi istruttori/);
      expect(cashCategoryFindUniqueMock).toHaveBeenCalledWith({ where: { name: 'Compensi istruttori', isActive: true }, select: { id: true } });
      expect(transactionMock).not.toHaveBeenCalled();
      expect(payoutCreateMock).not.toHaveBeenCalled();
    });

    it('creates the payout row AND its cash movement gemello (negative uscita, same method, linked via instructorPayoutId) inside ONE transaction', async () => {
      // Review LOW-2: recordPayout is one of AD-2's 7 "today" call-sites — assert
      // the Rome VALUE under a fake clock, not just the Date shape, so a
      // regression to the UTC calendar would be caught here.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z')); // 00:30 Rome (CEST), 2026-09-01
      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      cashCategoryFindUnique.mockResolvedValue({ id: 'cat_compensi' });
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
      cashMovementCreate.mockResolvedValue({ id: 'cm_1' });

      const result = await recordPayout(adminActor(), validInput);

      expect(result.id).toBe('payout_1');
      expect(result.periodStart).toBe('2026-07-01');
      expect(result.periodEnd).toBe('2026-07-15');
      expect(transactionMock).toHaveBeenCalledTimes(1);

      const createArgs = payoutCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(createArgs.data['instructorProfileId']).toBe('profile_ines');
      expect(createArgs.data['actorUserId']).toBe('admin_1');
      expect(createArgs.data['amountCents']).toBe(5000);

      const movementArgs = cashMovementCreateMock.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(movementArgs.data['categoryId']).toBe('cat_compensi');
      expect(movementArgs.data['amountCents']).toBe(-5000); // a cost/uscita, negated from the payout's positive amount
      expect(movementArgs.data['paymentMethod']).toBe('CASH'); // input.method
      expect(movementArgs.data['instructorPayoutId']).toBe('payout_1');
      expect(movementArgs.data['actorUserId']).toBe('admin_1');
      expect(movementArgs.data['effectiveDate']).toEqual(parseDateOnlyUtc('2026-09-01'));
      expect(movementArgs.data['description']).toBe('Compenso istruttore 2026-07-01 – 2026-07-15'); // story 19.12b, AD-5

      vi.useRealTimers();
    });
  });

  describe('setPayoutRate (AC 2, AC 6)', () => {
    it('404s on an unknown person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(setPayoutRate(adminActor(), 'unknown', 3000)).rejects.toThrow(NotFoundError);
    });

    it('409s when the person has no active instructor profile — unlike a payout, never for one no longer active (story 16.5)', async () => {
      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: null });
      await expect(setPayoutRate(adminActor(), 'person_x', 3000)).rejects.toThrow(ConflictError);

      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } });
      await expect(setPayoutRate(adminActor(), 'person_ines', 3000)).rejects.toThrow(ConflictError);
      expect(profileUpdateMock).not.toHaveBeenCalled();
    });

    it('409s on an ARCHIVED person too, even with the profile still active — like a deactivated profile (review 16.5 F1)', async () => {
      personFindUnique.mockResolvedValue({ archivedAt: new Date('2026-03-01T00:00:00.000Z'), instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      await expect(setPayoutRate(adminActor(), 'person_ines', 3000)).rejects.toThrow(ConflictError);
      expect(profileUpdateMock).not.toHaveBeenCalled();
    });

    it('sets a positive rate', async () => {
      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      profileUpdate.mockResolvedValue({ payoutRateCents: 3500 });

      const result = await setPayoutRate(adminActor(), 'person_ines', 3500);

      expect(result.payoutRateCents).toBe(3500);
      const updateArgs = profileUpdateMock.mock.calls[0]?.[0] as { where: { id: string }; data: { payoutRateCents: number | null } };
      expect(updateArgs.where.id).toBe('profile_ines');
      expect(updateArgs.data.payoutRateCents).toBe(3500);
    });

    it('clears the rate back to null', async () => {
      personFindUnique.mockResolvedValue({ archivedAt: null, instructorProfile: { id: 'profile_ines', deactivatedAt: null } });
      profileUpdate.mockResolvedValue({ payoutRateCents: null });

      const result = await setPayoutRate(adminActor(), 'person_ines', null);

      expect(result.payoutRateCents).toBeNull();
    });
  });
});
