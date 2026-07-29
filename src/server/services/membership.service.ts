import { addMonthsClampUtc, todayDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { MEMBERSHIP_FEE_TYPE_NAME } from '@/lib/expiry-scope';
import type { ChargeMembershipFeeInput } from '@/lib/schemas/membership';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { hasNegativeBalanceAlert } from './accounts.service';
import { NotFoundError, ValidationError } from './errors';

/** Upserted by NAME (not seeded via migration, Contesto) — also added to `prisma/seed.ts` so a fresh install's catalogue already lists it. `MEMBERSHIP_FEE_TYPE_NAME` lives in `@/lib/expiry-scope` (single source of truth, story 13.2 F3) so the create-form/inline-editor chip pickers can exclude it by the SAME name without importing this server-only service. */
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
   * `override`s it (this file's own doc-comment), so in practice this is
   * only ever `true` on an overridden charge — never the email (this surface
   * sends none, UNCHANGED).
   */
  balanceAlert: boolean;
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
 * Gated `finance.manage` (STAFF+ADMIN) — a day-to-day staff action, not
 * `settings.manage` (reserved for changing the DEFAULT fee amount itself,
 * `setMembershipFeeCents`).
 *
 * **Insufficient-balance guard (PO decision 2026-07-17, review F3)**: an
 * addebito that would take the balance BELOW zero is refused (`422
 * MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`) unless `input.override` is set,
 * which requires `settings.manage` (ADMIN-only — a STAFF actor passing
 * `override: true` gets a plain 403, same proxy-permission pattern as the
 * "Invia promemoria" trigger, ratifica utente 4). Landing EXACTLY on zero is
 * allowed. The balance is read with a `SELECT ... FOR UPDATE` lock on the
 * `Account` row (same pattern as `recordAdjustment`, `accounts.service.ts`,
 * review 2.5 F1) so two concurrent addebiti can never both read the same
 * pre-charge balance — this also closes review F7 (stale balance in the
 * response): the final balance returned is read under the SAME lock.
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

    // Row lock (FOR UPDATE, same pattern as `recordAdjustment` in
    // `accounts.service.ts`, review 2.5 F1) — serializes concurrent
    // addebiti on THIS account so the balance check below, and the final
    // balance returned at the end of this transaction, never race a
    // concurrent write (review F3/F7).
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;

    const balanceBeforeCents = (await tx.accountMovement.aggregate({ where: { accountId: account.id }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;

    // PO decision (2026-07-17, review F3): refuse an addebito that would
    // take the balance below zero, unless an ADMIN explicitly overrides it.
    // Landing EXACTLY on zero is allowed.
    if (balanceBeforeCents - input.amountCents < 0) {
      if (input.override) {
        authorize(actor, 'settings.manage');
      } else {
        throw new ValidationError(
          `Charging ${input.amountCents} cents would take the balance below zero (current balance: ${balanceBeforeCents} cents).`,
          { balanceCents: balanceBeforeCents, amountCents: input.amountCents },
          'MEMBERSHIP_FEE_INSUFFICIENT_BALANCE',
        );
      }
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
