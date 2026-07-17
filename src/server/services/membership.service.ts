import { addMonthsClampUtc, todayDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import type { ChargeMembershipFeeInput } from '@/lib/schemas/membership';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { NotFoundError } from './errors';

/** Upserted by NAME (not seeded via migration, Contesto) — also added to `prisma/seed.ts` so a fresh install's catalogue already lists it. */
const MEMBERSHIP_FEE_TYPE_NAME = 'Quota associativa';
const MEMBERSHIP_FEE_VALIDITY_MONTHS = 12;

export type ChargeMembershipFeeResult = {
  balanceCents: number;
  expiryId: string;
  expiresAt: string;
  issuedAt: string;
};

/**
 * "Quota associativa" (story 12.11, AC 7; ratifiche utente 1/1a/1b) — an
 * addebito + renewal in ONE gesture, ALL THREE writes in a SINGLE
 * `prisma.$transaction`: (i) an `ADJUSTMENT` account movement (negative
 * `amountCents` = addebito, AD-3), (ii) an upsert-by-NAME of the "Quota
 * associativa" `ExpiryType` (created on first use — `ALL` scope,
 * non-blocking, 12-month validity — `update: {}` never overwrites an
 * admin's own edit, same pattern as `prisma/seed.ts#seedExpiryTypes`), and
 * (iii) a create-or-renew of the person's "Quota associativa" `Expiry`
 * (the type's `@@unique([personId, expiryTypeId])` guarantees at most one).
 *
 * **Deliberately NOT a composition of `accounts.service.ts#recordAdjustment`
 * + `expiries.service.ts#updateExpiry`**: both of those open their OWN
 * `prisma.$transaction` (and `recordAdjustment` requires a PRE-EXISTING
 * `Account`, which a first-time payer may not have) — calling them as two
 * separate commits would leave a "charged but not renewed" window on a
 * partial failure, AND would let an idempotency-key retry after a
 * mid-flight crash double-charge (the route's `Idempotency-Key` only
 * replays a FULLY COMPLETED response). One atomic transaction closes both
 * gaps. This is the one place in this story `recordAdjustment` is NOT
 * reused despite AC 7's "via writer esistente" phrasing — same ADJUSTMENT
 * movement shape (DB sign negative = addebito), just written inline.
 *
 * **Rolling renewal (ratifica 1b)**: `expiresAt = max(today, current
 * expiresAt) + 12 months` — an early renewal EXTENDS from the current
 * expiry (never shortens it to `today + 12`), a lapsed one restarts from
 * today. `issuedAt` is always stamped as today (the payment date).
 *
 * **`SentAlert` wipe (ratifica 1a)**: same "a renewal re-earns its alert
 * cycle" rule as `updateExpiry` (the unique `[expiryId, threshold]`
 * constraint would otherwise permanently block next year's reminders) —
 * run in the SAME transaction, skipped on a first-ever charge (no `Expiry`
 * row existed yet, so no `SentAlert` could either).
 *
 * Gated `finance.manage` (STAFF+ADMIN) — a day-to-day staff action, not
 * `settings.manage` (reserved for changing the DEFAULT fee amount itself,
 * `setMembershipFeeCents`).
 */
export async function chargeMembershipFee(actor: Actor, personId: string, input: ChargeMembershipFeeInput): Promise<ChargeMembershipFeeResult> {
  authorize(actor, 'finance.manage');

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const today = todayDateOnlyUtc();
  const paymentYear = today.getUTCFullYear();

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.upsert({ where: { personId }, create: { personId }, update: {}, select: { id: true } });

    await tx.accountMovement.create({
      data: {
        accountId: account.id,
        type: 'ADJUSTMENT',
        amountCents: -input.amountCents,
        description: `Quota associativa ${paymentYear}`,
        effectiveDate: today,
        actorUserId: actor.userId,
      },
    });

    const expiryType = await tx.expiryType.upsert({
      where: { name: MEMBERSHIP_FEE_TYPE_NAME },
      update: {},
      create: { name: MEMBERSHIP_FEE_TYPE_NAME, scope: 'ALL', blocksBooking: false, validityMonths: MEMBERSHIP_FEE_VALIDITY_MONTHS },
      select: { id: true },
    });

    const existingExpiry = await tx.expiry.findUnique({
      where: { personId_expiryTypeId: { personId, expiryTypeId: expiryType.id } },
      select: { id: true, expiresAt: true },
    });

    let expiry: { id: string; expiresAt: Date };
    if (existingExpiry) {
      const base = existingExpiry.expiresAt.getTime() > today.getTime() ? existingExpiry.expiresAt : today;
      await tx.sentAlert.deleteMany({ where: { expiryId: existingExpiry.id } });
      expiry = await tx.expiry.update({
        where: { id: existingExpiry.id },
        data: { expiresAt: addMonthsClampUtc(base, MEMBERSHIP_FEE_VALIDITY_MONTHS), issuedAt: today, actorUserId: actor.userId },
        select: { id: true, expiresAt: true },
      });
    } else {
      expiry = await tx.expiry.create({
        data: {
          personId,
          expiryTypeId: expiryType.id,
          issuedAt: today,
          expiresAt: addMonthsClampUtc(today, MEMBERSHIP_FEE_VALIDITY_MONTHS),
          actorUserId: actor.userId,
        },
        select: { id: true, expiresAt: true },
      });
    }

    const aggregate = await tx.accountMovement.aggregate({ where: { accountId: account.id }, _sum: { amountCents: true } });

    return { balanceCents: aggregate._sum.amountCents ?? 0, expiryId: expiry.id, expiresAt: expiry.expiresAt };
  });

  return {
    balanceCents: result.balanceCents,
    expiryId: result.expiryId,
    expiresAt: toDateOnlyString(result.expiresAt),
    issuedAt: toDateOnlyString(today),
  };
}
