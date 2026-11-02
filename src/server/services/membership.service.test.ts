import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';

/**
 * TDD (story 12.11, AC 7; ratifiche utente 1/1a/1b) — written BEFORE
 * `membership.service.ts` exists. `$transaction`'s interactive-callback
 * overload is invoked with the mocked `prisma` itself as `tx` (same stand-in
 * as `accounts.service.test.ts`'s `mockTransaction`).
 */

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: { findUnique: vi.fn() },
    account: { upsert: vi.fn() },
    accountMovement: { create: vi.fn(), aggregate: vi.fn() },
    expiryType: { findFirst: vi.fn(), upsert: vi.fn() },
    expiry: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    sentAlert: { deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// Story 14.4 review F7 — `membership.service.ts` now imports the REAL
// `hasNegativeBalanceAlert` (pure, no I/O) from `./accounts.service`, which
// in turn imports the mail adapter/templates. Mocked here so loading it
// never runs `smtp-mail-sender.ts`'s eager env validation (same lesson/
// pattern as `flights.service.test.ts`, CLAUDE.md).
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: vi.fn() })),
}));
vi.mock('@/server/adapters/mail/templates', () => ({
  buildNegativeBalanceAlertEmail: vi.fn(async () => ({ subject: 'Alert subject', text: 'Alert text' })),
}));
// Story 19.10 (D-11): the insufficient-balance refusal is the shared BALANCE
// rule of `./requirements.service` (REAL here: `balanceFailure` and the 422
// helper are what this file proves), whose own imports reach
// `./app-settings.service` -> `@/lib/env` (eager validation, CLAUDE.md) —
// mocked, never called on this path.
vi.mock('./app-settings.service', () => ({ getCurrencySettings: vi.fn() }));

const { prisma } = await import('@/server/db/prisma');
const { chargeMembershipFee, getMembershipStatus } = await import('./membership.service');
const { ForbiddenError, NotFoundError, ValidationError } = await import('./errors');
const { requirementsNotMetDetailsSchema } = await import('@/lib/schemas/requirements');
const { ROLE_PERMISSIONS } = await import('@/server/auth/rbac');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
const expiryTypeFindFirstMock = vi.mocked(prisma.expiryType.findFirst);
const expiryTypeUpsertMock = vi.mocked(prisma.expiryType.upsert);
const expiryFindUniqueMock = vi.mocked(prisma.expiry.findUnique);
const expiryUpdateMock = vi.mocked(prisma.expiry.update);
const expiryCreateMock = vi.mocked(prisma.expiry.create);
const sentAlertDeleteManyMock = vi.mocked(prisma.sentAlert.deleteMany);
const queryRawMock = vi.mocked(prisma.$queryRaw);
const transactionMock = vi.mocked(prisma.$transaction);

type Fixture = Record<string, unknown>;
const personFindUnique = personFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };
const accountUpsert = accountUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryTypeUpsert = expiryTypeUpsertMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryFindUnique = expiryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };
const expiryUpdate = expiryUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const expiryCreate = expiryCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const queryRaw = queryRawMock as unknown as { mockResolvedValue: (v: unknown[]) => void };

/**
 * `chargeMembershipFee` reads `accountMovement.aggregate` TWICE per call
 * (review F3/F7): once for the pre-charge balance check (under the
 * `FOR UPDATE` lock), once for the post-commit response. `beforeChargeCents`
 * answers the first call, `postCommitCents` every call after (defaults to
 * the same value when the two are irrelevant to a given test).
 */
function mockBalances(beforeChargeCents: number, postCommitCents: number = beforeChargeCents): void {
  accountMovementAggregateMock.mockReset();
  accountMovementAggregateMock.mockResolvedValueOnce({ _sum: { amountCents: beforeChargeCents } } as never);
  accountMovementAggregateMock.mockResolvedValue({ _sum: { amountCents: postCommitCents } } as never);
}

/** Same "invoke the callback with `prisma` itself as `tx`" stand-in as `accounts.service.test.ts#mockTransaction`. */
function mockTransaction(): void {
  vi.mocked(transactionMock).mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const FIXED_TODAY = new Date('2027-03-10T12:00:00.000Z'); // an arbitrary "now" the tests advance to via vi.setSystemTime.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TODAY);

  personFindUniqueMock.mockReset();
  accountUpsertMock.mockReset();
  accountMovementCreateMock.mockReset();
  accountMovementAggregateMock.mockReset();
  expiryTypeFindFirstMock.mockReset();
  expiryTypeUpsertMock.mockReset();
  expiryFindUniqueMock.mockReset();
  expiryUpdateMock.mockReset();
  expiryCreateMock.mockReset();
  sentAlertDeleteManyMock.mockReset();
  queryRawMock.mockReset();
  transactionMock.mockReset();

  mockTransaction();
  personFindUnique.mockResolvedValue({ id: 'person_1', firstName: 'Lucia', lastName: 'Verdi' });
  accountUpsert.mockResolvedValue({ id: 'account_1' });
  accountMovementCreateMock.mockResolvedValue({} as never);
  expiryTypeUpsert.mockResolvedValue({ id: 'expirytype_membership' });
  queryRaw.mockResolvedValue([]);
  // Pre-charge balance defaults to a large positive amount (F3's check
  // passes for every test's default 5000-cent charge) — the post-commit
  // balance defaults to -5000, same value the pre-F3 fixture used.
  mockBalances(1_000_000, -5000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('chargeMembershipFee (story 12.11, AC 7)', () => {
  it('is gated finance.manage — a pilot is forbidden, no transaction runs', async () => {
    await expect(chargeMembershipFee(pilotActor(), 'person_1', { amountCents: 5000, force: false })).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('an unknown person answers 404, checked BEFORE the transaction opens', async () => {
    personFindUnique.mockResolvedValue(null);
    await expect(chargeMembershipFee(adminActor(), 'ghost', { amountCents: 5000, force: false })).rejects.toBeInstanceOf(NotFoundError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('debits the account with a NEGATIVE-amount ADJUSTMENT movement (AD-3: negative = addebito)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_1', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(accountMovementCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account_1',
          type: 'ADJUSTMENT',
          amountCents: -5000,
          description: 'Quota associativa 2027',
          actorUserId: 'admin_1',
        }),
      }),
    );
  });

  it('no MEMBERSHIP type yet: upserts "Quota associativa" by NAME (kind MEMBERSHIP, ALL scope, non-blocking, 12 months), realigning a row that already holds the name (review 19.7a F4)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_1', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(expiryTypeFindFirstMock).toHaveBeenCalledWith({ where: { kind: 'MEMBERSHIP' }, select: { id: true } });
    expect(expiryTypeUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'Quota associativa' },
        // A RATING an admin named "Quota associativa" on an unseeded installation becomes the fee, never the other way round.
        update: { kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, isActive: true },
        create: { name: 'Quota associativa', kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, validityMonths: 12 },
      }),
    );
  });

  it('the MEMBERSHIP type exists: found by KIND, never upserted nor modified (review 19.7a F4)', async () => {
    expiryTypeFindFirstMock.mockResolvedValue({ id: 'expirytype_found_by_kind' } as never);
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_1', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(expiryTypeUpsertMock).not.toHaveBeenCalled();
    expect(expiryCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expiryTypeId: 'expirytype_found_by_kind' }) }));
  });

  it('FIRST charge (no existing Expiry): creates one, expiresAt = today+12mo, NO SentAlert wipe (nothing to wipe)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const result = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(expiryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: 'person_1',
          expiryTypeId: 'expirytype_membership',
          expiresAt: new Date('2028-03-10T00:00:00.000Z'),
        }),
      }),
    );
    expect(sentAlertDeleteManyMock).not.toHaveBeenCalled();
    // Story 14.4 review F7: post-charge balance (-5000) is negative -> in-app alert.
    expect(result).toEqual({ balanceCents: -5000, expiryId: 'expiry_new', expiresAt: '2028-03-10', balanceAlert: true });
  });

  it('RENEWAL, current expiry still in the future (early renewal): rolls forward from the CURRENT expiresAt, never from today (ratifica 1b)', async () => {
    // Current expiry is 2027-09-01, well after "today" (2027-03-10) — the new expiry must be 2028-09-01 (current + 12mo), NOT 2028-03-10 (today + 12mo).
    expiryFindUnique.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2027-09-01T00:00:00.000Z') });
    expiryUpdate.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2028-09-01') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(expiryUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'expiry_existing' },
        data: expect.objectContaining({ expiresAt: new Date('2028-09-01T00:00:00.000Z') }),
      }),
    );
  });

  it('RENEWAL, current expiry already LAPSED: rolls forward from TODAY, not the stale past date', async () => {
    expiryFindUnique.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2026-01-01T00:00:00.000Z') });
    expiryUpdate.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(expiryUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expiresAt: new Date('2028-03-10T00:00:00.000Z') }) }),
    );
  });

  it('a RENEWAL wipes SentAlert for that expiry in the SAME transaction (ratifica 1a — "renewal re-earns its alert cycle")', async () => {
    expiryFindUnique.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2027-09-01T00:00:00.000Z') });
    expiryUpdate.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2028-09-01') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { expiryId: 'expiry_existing' } });
  });

  it('returns the post-commit balance (SUM aggregate, read-your-own-write) and the renewed expiry', async () => {
    expiryFindUnique.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2027-09-01T00:00:00.000Z') });
    expiryUpdate.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2028-09-01T00:00:00.000Z') });
    mockBalances(1_000_000, -12000);

    const result = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    // Story 14.4 review F7: post-charge balance (-12000) is negative -> in-app alert.
    expect(result).toEqual({ balanceCents: -12000, expiryId: 'expiry_existing', expiresAt: '2028-09-01', balanceAlert: true });
  });

  it('upserts (never re-creates) the Account — a first-time payer with no prior movements is not blocked', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(accountUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' }, update: {} }),
    );
  });

  it('locks the Account row (FOR UPDATE) before reading the balance (review F3/F7)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});

describe('chargeMembershipFee — insufficient-balance guard and its deroga (PO decision 2026-07-17, review F3; story 19.10, AC 36)', () => {
  function expectChargeWritten(): void {
    expect(accountMovementCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'ADJUSTMENT', amountCents: -5000 }) }));
  }

  it('refuses with the shared 422 REQUIREMENTS_NOT_MET — ONE BALANCE failure (balance before, amount as cost) — and writes nothing, without force', async () => {
    mockBalances(3000);

    const error = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const validation = error as InstanceType<typeof ValidationError>;
    expect(validation.code).toBe('REQUIREMENTS_NOT_MET');
    expect(validation.details).toEqual({ failures: [{ type: 'BALANCE', role: 'person', personName: 'Lucia Verdi', balanceCents: 3000, costCents: 5000 }] });
    expect(requirementsNotMetDetailsSchema.safeParse(validation.details).success).toBe(true);
    expect(accountMovementCreateMock).not.toHaveBeenCalled();
    expect(expiryCreateMock).not.toHaveBeenCalled();
    expect(expiryUpdateMock).not.toHaveBeenCalled();
  });

  it('judges the balance read under the Account lock: lock, then the read, then the decision (D-11)', async () => {
    mockBalances(4999);

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false }).catch(() => undefined);

    expect(queryRawMock.mock.invocationCallOrder[0]!).toBeLessThan(accountMovementAggregateMock.mock.invocationCallOrder[0]!);
  });

  it('allows an addebito that lands EXACTLY on zero (equal = covered, the shared rule)', async () => {
    mockBalances(5000, 0);
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const result = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(result.balanceCents).toBe(0);
    expectChargeWritten();
    // Story 14.4 review F7: 5000 -> 0, neither side negative -> no in-app alert.
    expect(result.balanceAlert).toBe(false);
  });

  it('force from an actor holding finance.manage but NOT requirements.force: 403 BEFORE the person query and the transaction', async () => {
    // No role has finance.manage without requirements.force today (both
    // ADMIN-only): grant it to INSTRUCTOR for this test only (the idiom of
    // `flights.service.test.ts`).
    const saved = ROLE_PERMISSIONS.INSTRUCTOR;
    ROLE_PERMISSIONS.INSTRUCTOR = [...saved, 'finance.manage'];
    const instructor: Actor = { userId: 'instructor_1', personId: 'person_instructor', roles: ['INSTRUCTOR'] };
    try {
      await expect(chargeMembershipFee(instructor, 'person_1', { amountCents: 5000, force: true })).rejects.toBeInstanceOf(ForbiddenError);
      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(transactionMock).not.toHaveBeenCalled();
      // The same actor WITHOUT force reaches the reads: the 403 above is the `force` gate, not `finance.manage`.
      expiryFindUnique.mockResolvedValue(null);
      expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });
      await chargeMembershipFee(instructor, 'person_1', { amountCents: 5000, force: false });
      expect(personFindUniqueMock).toHaveBeenCalledTimes(1);
    } finally {
      ROLE_PERMISSIONS.INSTRUCTOR = saved;
    }
  });

  it('an ADMIN force at balance 0 charges below zero — exactly the case the in-app alert (F7) exists for', async () => {
    mockBalances(0, -5000);
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const result = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: true });

    expect(result.balanceCents).toBe(-5000);
    expectChargeWritten();
    expect(result.balanceAlert).toBe(true);
  });

  it('force with a balance that covers the amount charges exactly as without it', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const forced = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: true });
    const forcedWrites = accountMovementCreateMock.mock.calls.map((call) => call[0]);
    accountMovementCreateMock.mockClear();
    mockBalances(1_000_000, -5000);
    const plain = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(forced).toEqual(plain);
    expect(accountMovementCreateMock.mock.calls.map((call) => call[0])).toEqual(forcedWrites);
  });
});

// Story 16.1, AC 4/AC 5 — a describe of its own that moves the clock to a
// Rome midnight boundary and restores it (the outer `afterEach` already
// calls `vi.useRealTimers()`), leaving `FIXED_TODAY` (line 89, deliberately
// far from any boundary) untouched for every other test in this file.
describe('chargeMembershipFee — Europe/Rome "today" at a midnight boundary (story 16.1)', () => {
  it('AC 4: at 00:30 Rome on the 1st (CEST), the ADJUSTMENT is dated on the NEW (Roma) month', async () => {
    vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z')); // 00:30 CEST, 1 Sep in Rome
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2027-09-01') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(accountMovementCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('AC 5: at 00:30 Rome on 1 Jan 2027 (CET), the fee is "Quota associativa 2027" (not 2026), dated 2027-01-01, expiring 2028-01-01', async () => {
    vi.setSystemTime(new Date('2026-12-31T23:30:00.000Z')); // 00:30 CET, 1 Jan 2027 in Rome
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-01-01') });

    await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, force: false });

    expect(accountMovementCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'Quota associativa 2027',
          effectiveDate: new Date('2027-01-01T00:00:00.000Z'),
        }),
      }),
    );
    expect(expiryCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expiresAt: new Date('2028-01-01T00:00:00.000Z') }),
      }),
    );
  });
});

// Story 19.7a (AC 10, R-19-k): the fee's status for the checks of 19.9/19.10.
describe('getMembershipStatus (story 19.7a)', () => {
  const expiryFindFirstMock = vi.mocked(prisma.expiry.findFirst);
  const expiryFindFirst = expiryFindFirstMock as unknown as { mockResolvedValue: (v: Fixture | null) => void };

  beforeEach(() => {
    expiryFindFirstMock.mockReset();
  });

  it('reads the MEMBERSHIP row of THIS person only — a row of another type never counts', async () => {
    expiryFindFirst.mockResolvedValue(null);

    await getMembershipStatus('person_1', '2026-06-15');

    expect(expiryFindFirstMock).toHaveBeenCalledWith({ where: { personId: 'person_1', expiryType: { kind: 'MEMBERSHIP' } }, select: { expiresAt: true } });
  });

  it('expiresAt === dateOnly -> valid (the expiry day itself still counts)', async () => {
    expiryFindFirst.mockResolvedValue({ expiresAt: new Date('2026-06-15T00:00:00.000Z') });

    await expect(getMembershipStatus('person_1', '2026-06-15')).resolves.toEqual({ status: 'valid', expiresAt: '2026-06-15' });
  });

  it('expired the day before -> expired', async () => {
    expiryFindFirst.mockResolvedValue({ expiresAt: new Date('2026-06-14T00:00:00.000Z') });

    await expect(getMembershipStatus('person_1', '2026-06-15')).resolves.toEqual({ status: 'expired', expiresAt: '2026-06-14' });
  });

  it('never paid -> missing', async () => {
    expiryFindFirst.mockResolvedValue(null);

    await expect(getMembershipStatus('person_1', '2026-06-15')).resolves.toEqual({ status: 'missing', expiresAt: null });
  });
});
