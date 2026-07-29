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
    expiryType: { upsert: vi.fn() },
    expiry: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
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

const { prisma } = await import('@/server/db/prisma');
const { chargeMembershipFee } = await import('./membership.service');
const { ForbiddenError, NotFoundError, ValidationError } = await import('./errors');

const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const accountUpsertMock = vi.mocked(prisma.account.upsert);
const accountMovementCreateMock = vi.mocked(prisma.accountMovement.create);
const accountMovementAggregateMock = vi.mocked(prisma.accountMovement.aggregate);
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

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
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
  expiryTypeUpsertMock.mockReset();
  expiryFindUniqueMock.mockReset();
  expiryUpdateMock.mockReset();
  expiryCreateMock.mockReset();
  sentAlertDeleteManyMock.mockReset();
  queryRawMock.mockReset();
  transactionMock.mockReset();

  mockTransaction();
  personFindUnique.mockResolvedValue({ id: 'person_1' });
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
    await expect(chargeMembershipFee(pilotActor(), 'person_1', { amountCents: 5000, override: false })).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('an unknown person answers 404, checked BEFORE the transaction opens', async () => {
    personFindUnique.mockResolvedValue(null);
    await expect(chargeMembershipFee(staffActor(), 'ghost', { amountCents: 5000, override: false })).rejects.toBeInstanceOf(NotFoundError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('debits the account with a NEGATIVE-amount ADJUSTMENT movement (AD-3: negative = addebito)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_1', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(accountMovementCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account_1',
          type: 'ADJUSTMENT',
          amountCents: -5000,
          description: 'Quota associativa 2027',
          actorUserId: 'staff_1',
        }),
      }),
    );
  });

  it('upserts the "Quota associativa" ExpiryType by NAME (ALL scope, non-blocking, 12 months) — update: {} never overwrites an admin edit', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_1', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(expiryTypeUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'Quota associativa' },
        update: {},
        create: { name: 'Quota associativa', scope: 'ALL', blocksBooking: false, validityMonths: 12 },
      }),
    );
  });

  it('FIRST charge (no existing Expiry): creates one, expiresAt = today+12mo, NO SentAlert wipe (nothing to wipe)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const result = await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

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

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

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

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(expiryUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expiresAt: new Date('2028-03-10T00:00:00.000Z') }) }),
    );
  });

  it('a RENEWAL wipes SentAlert for that expiry in the SAME transaction (ratifica 1a — "renewal re-earns its alert cycle")', async () => {
    expiryFindUnique.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2027-09-01T00:00:00.000Z') });
    expiryUpdate.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2028-09-01') });

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(sentAlertDeleteManyMock).toHaveBeenCalledWith({ where: { expiryId: 'expiry_existing' } });
  });

  it('returns the post-commit balance (SUM aggregate, read-your-own-write) and the renewed expiry', async () => {
    expiryFindUnique.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2027-09-01T00:00:00.000Z') });
    expiryUpdate.mockResolvedValue({ id: 'expiry_existing', expiresAt: new Date('2028-09-01T00:00:00.000Z') });
    mockBalances(1_000_000, -12000);

    const result = await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    // Story 14.4 review F7: post-charge balance (-12000) is negative -> in-app alert.
    expect(result).toEqual({ balanceCents: -12000, expiryId: 'expiry_existing', expiresAt: '2028-09-01', balanceAlert: true });
  });

  it('upserts (never re-creates) the Account — a first-time payer with no prior movements is not blocked', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(accountUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personId: 'person_1' }, create: { personId: 'person_1' }, update: {} }),
    );
  });

  it('locks the Account row (FOR UPDATE) before reading the balance (review F3/F7)', async () => {
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});

describe('chargeMembershipFee — insufficient-balance guard (PO decision 2026-07-17, review F3)', () => {
  it('refuses (422 MEMBERSHIP_FEE_INSUFFICIENT_BALANCE) an addebito that would take the balance below zero, no override', async () => {
    mockBalances(4999); // 4999 - 5000 = -1 < 0

    const error = await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as InstanceType<typeof ValidationError>).code).toBe('MEMBERSHIP_FEE_INSUFFICIENT_BALANCE');
    expect(accountMovementCreateMock).not.toHaveBeenCalled();
  });

  it('allows an addebito that lands EXACTLY on zero', async () => {
    mockBalances(5000, 0); // 5000 - 5000 = 0, not below zero
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const result = await chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: false });

    expect(result.balanceCents).toBe(0);
    expect(accountMovementCreateMock).toHaveBeenCalled();
    // Story 14.4 review F7: 5000 -> 0, neither side negative -> no in-app alert.
    expect(result.balanceAlert).toBe(false);
  });

  it('an ADMIN override lets the addebito proceed below zero — this is exactly the case the in-app alert (F7) exists for', async () => {
    mockBalances(0, -5000); // 0 - 5000 = -5000 < 0, but overridden
    expiryFindUnique.mockResolvedValue(null);
    expiryCreate.mockResolvedValue({ id: 'expiry_new', expiresAt: new Date('2028-03-10') });

    const result = await chargeMembershipFee(adminActor(), 'person_1', { amountCents: 5000, override: true });

    expect(result.balanceCents).toBe(-5000);
    expect(accountMovementCreateMock).toHaveBeenCalled();
    expect(result.balanceAlert).toBe(true);
  });

  it('a STAFF override is forbidden (403) — override requires settings.manage, ADMIN-only', async () => {
    mockBalances(0); // 0 - 5000 = -5000 < 0

    await expect(chargeMembershipFee(staffActor(), 'person_1', { amountCents: 5000, override: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(accountMovementCreateMock).not.toHaveBeenCalled();
  });
});
