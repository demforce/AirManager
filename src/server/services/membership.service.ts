import { addMonthsClampUtc, toDateOnlyString } from '@/lib/date-only';
import { MEMBERSHIP_FEE_TYPE_NAME } from '@/lib/expiry-scope';
import type { ChargeMembershipFeeInput } from '@/lib/schemas/membership';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { authorize, hasPermission, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { hasNegativeBalanceAlert } from './accounts.service';
import { ForbiddenError, NotFoundError } from './errors';
import { balanceFailure, throwRequirementsNotMet } from './requirements.service';

/** The fee type is the one `ExpiryTypeKind.MEMBERSHIP` row (story 19.7a, D-1): found by that kind, like every reader; `MEMBERSHIP_FEE_TYPE_NAME` (`@/lib/expiry-scope`) is only the key it is created (or realigned) under when absent, and the seeds' key. Validity: fixed 12 months from the payment (R-19-k), not configurable. */
const MEMBERSHIP_FEE_VALIDITY_MONTHS = 12;

export type ChargeMembershipFeeResult = {
  balanceCents: number;
  expiryId: string;
  expiresAt: string;
  /**
   * Story 14.4 review F7 (ratifica R-14.4-d) — same in-app "saldo in rosso"
   * signal as every other debit-creating surface
   * (`accounts.service.ts#hasNegativeBalanceAlert`). This writer already
   * REFUSES a charge that would take the balance below zero unless an ADMIN
   * derogates it with `force` (this file's own doc-comment), so in practice
   * this is only ever `true` on a derogated charge — never the email (this
   * surface sends none, UNCHANGED).
   */
  balanceAlert: boolean;
};

/**
 * "Quota associativa" (story 12.11, AC 7; ratifiche utente 1/1a/1b) — an
 * addebito + renewal in ONE gesture, ALL THREE writes in a SINGLE
 * `prisma.$transaction`: (i) an `ADJUSTMENT` account movement (negative
 * `amountCents` = addebito, AD-3), (ii) the "Quota associativa" `ExpiryType`,
 * found by kind `MEMBERSHIP` (review 19.7a F4) and only when absent upserted
 * by NAME (created on first use — `ALL` scope, non-blocking, 12-month
 * validity; a row already holding the name, e.g. a RATING an admin created
 * on an unseeded installation, is realigned to the fee exactly like the
 * 19.7a migration's step 3 — so the charge never lands on a rating, and the
 * name's uniqueness keeps the fee to ONE row), and
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
 * today. There used to be an `issuedAt` stamped as today alongside it
 * (the payment date) — story 13.1's review (R6, PO ratifica 2026-07-23)
 * dropped `Expiry.issuedAt` from the domain entirely (see that model's
 * Prisma doc-comment).
 *
 * **`SentAlert` wipe (ratifica 1a)**: same "a renewal re-earns its alert
 * cycle" rule as `updateExpiry` (the unique `[expiryId, threshold]`
 * constraint would otherwise permanently block next year's reminders) —
 * run in the SAME transaction, skipped on a first-ever charge (no `Expiry`
 * row existed yet, so no `SentAlert` could either).
 *
 * Gated `finance.manage` (ADMIN-only) — a day-to-day operational action, not
 * `settings.manage` (reserved for changing the DEFAULT fee amount itself,
 * `setMembershipFeeCents`).
 *
 * **Insufficient-balance guard (PO decision 2026-07-17, review F3; the one
 * warning-and-deroga pattern since story 19.10, CR §4.4/§4.6)**: an addebito
 * the balance does not cover — `balance < amount`, so landing EXACTLY on zero
 * is allowed — is refused with the 422 `REQUIREMENTS_NOT_MET` of flights and
 * bookings, ONE `BALANCE` failure (`requirements.service.ts#balanceFailure`:
 * the balance before the charge, the amount as the cost), unless `input.force`
 * is set — which requires `requirements.force` (ADMIN-only), checked BEFORE
 * any query, the single gate of every deroga; no motivo. The balance is read
 * with a `SELECT ... FOR UPDATE` lock on the `Account` row (same pattern as
 * `recordAdjustment`, `accounts.service.ts`, review 2.5 F1) and judged on
 * THAT read, inside the transaction — never by `evaluateRequirements`, which
 * would read it before the lock (review 19.9 F2's race) — so two concurrent
 * addebiti can never both read the same pre-charge balance; this also closes
 * review F7 (stale balance in the response): the final balance returned is
 * read under the SAME lock. The 422 rolls back and, for the mandatory
 * `Idempotency-Key`, frees the key: the resend with `force` is a new attempt.
 */
export async function chargeMembershipFee(actor: Actor, personId: string, input: ChargeMembershipFeeInput): Promise<ChargeMembershipFeeResult> {
  authorize(actor, 'finance.manage');
  // Story 19.10 (P8): before ANY query, like every other deroga.
  if (input.force && !hasPermission(actor, 'requirements.force')) {
    throw new ForbiddenError('Only an admin can derogate the balance of a membership fee charge.');
  }

  const person = await prisma.person.findUnique({ where: { id: personId }, select: { id: true, firstName: true, lastName: true } });
  if (!person) {
    throw new NotFoundError('Person not found.');
  }

  const today = todayDateOnlyUtcInZone(APP_TIMEZONE);
  const paymentYear = today.getUTCFullYear();

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.upsert({ where: { personId }, create: { personId }, update: {}, select: { id: true } });

    // Row lock (FOR UPDATE, same pattern as `recordAdjustment` in
    // `accounts.service.ts`, review 2.5 F1) — serializes concurrent
    // addebiti on THIS account so the balance check below, and the final
    // balance returned at the end of this transaction, never race a
    // concurrent write (review F3/F7).
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;

    const balanceBeforeCents = (await tx.accountMovement.aggregate({ where: { accountId: account.id }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;

    // PO decision (2026-07-17, review F3; story 19.10, D-11): an addebito the
    // balance does not cover is refused — the shared BALANCE rule, on the
    // balance read under the lock — unless an ADMIN derogates it.
    const shortfall = balanceFailure(`${person.firstName} ${person.lastName}`, balanceBeforeCents, input.amountCents);
    if (shortfall !== null && !input.force) {
      throwRequirementsNotMet([shortfall]);
    }

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

    const expiryType =
      (await tx.expiryType.findFirst({ where: { kind: 'MEMBERSHIP' }, select: { id: true } })) ??
      (await tx.expiryType.upsert({
        where: { name: MEMBERSHIP_FEE_TYPE_NAME },
        update: { kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, isActive: true },
        create: { name: MEMBERSHIP_FEE_TYPE_NAME, kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, validityMonths: MEMBERSHIP_FEE_VALIDITY_MONTHS },
        select: { id: true },
      }));

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
        data: { expiresAt: addMonthsClampUtc(base, MEMBERSHIP_FEE_VALIDITY_MONTHS), actorUserId: actor.userId },
        select: { id: true, expiresAt: true },
      });
    } else {
      expiry = await tx.expiry.create({
        data: {
          personId,
          expiryTypeId: expiryType.id,
          expiresAt: addMonthsClampUtc(today, MEMBERSHIP_FEE_VALIDITY_MONTHS),
          actorUserId: actor.userId,
        },
        select: { id: true, expiresAt: true },
      });
    }

    const aggregate = await tx.accountMovement.aggregate({ where: { accountId: account.id }, _sum: { amountCents: true } });
    const balanceAfterCents = aggregate._sum.amountCents ?? 0;

    return { balanceCents: balanceAfterCents, expiryId: expiry.id, expiresAt: expiry.expiresAt, balanceAlert: hasNegativeBalanceAlert(balanceBeforeCents, balanceAfterCents) };
  });

  return {
    balanceCents: result.balanceCents,
    balanceAlert: result.balanceAlert,
    expiryId: result.expiryId,
    expiresAt: toDateOnlyString(result.expiresAt),
  };
}

export type MembershipStatus = { status: 'valid' | 'expired' | 'missing'; expiresAt: string | null };

/**
 * The membership fee of ONE person at `dateOnly` (`YYYY-MM-DD`) — story
 * 19.7a (R-19-k, P6): their `Expiry` of kind `MEMBERSHIP`, `valid` while
 * `expiresAt ≥ dateOnly` (the expiry day itself still counts), `expired`
 * after it, `missing` when the person never paid. A plain status, no warning
 * nor deroga (those are stories 19.9/19.10, which consume this). No actor,
 * like `expiries.service.ts#getMedicalRequirementFailure`.
 */
export async function getMembershipStatus(personId: string, dateOnly: string): Promise<MembershipStatus> {
  const expiry = await prisma.expiry.findFirst({ where: { personId, expiryType: { kind: 'MEMBERSHIP' } }, select: { expiresAt: true } });
  if (!expiry) {
    return { status: 'missing', expiresAt: null };
  }
  const expiresAt = toDateOnlyString(expiry.expiresAt);
  return { status: expiresAt >= dateOnly ? 'valid' : 'expired', expiresAt };
}
