import { parseDateOnlyUtc } from '@/lib/date-only';
import { currentMonthRange } from '@/lib/period-presets';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { getTreasuryOpeningInternal } from './app-settings.service';
import { getCashReport, type CashReport } from './cash.service';
import { CASH_COST_OR, CASH_NOT_ALREADY_ON_ACCOUNT, getLedgerRevenueCents } from './transactions.service';

/**
 * The three-book calculation service (story Billing-1, AC 5) that replaces
 * `transactions.service.ts#getBillingKpis`'s old "Ricavi = Σ dei positivi,
 * Costi = alias della stessa cifra" definition — see
 * `docs/superpowers/specs/2026-07-26-billing-rework-design.md` §2/§4 for the
 * full rationale. Three independent books, never mixed into one signed
 * column:
 *
 * - **`result`** (risultato economico, for `ref`'s Europe/Rome calendar
 *   month): `revenueCents` reuses `transactions.service.ts#getLedgerRevenueCents`
 *   (ratifica utente 4, "MAI reimplementarle" — the SAME revenue definition
 *   `stats.service.ts` reuses, so the two readers can never drift, F8).
 *   `costCents` is the month's cash OUSCITE (uscite di cassa per
 *   categoria, compensi istruttori included via their AC 4 gemello).
 * - **`treasury`** (dove sono i soldi, a running balance, NOT month-scoped):
 *   `cashCents`/`bankCents` = the configured opening balance (Billing-1, AC
 *   3) plus every matching-method `CashMovement` from `openingDate` onward.
 *   `unattributedCents` is the "secchiello" of movements with no method at
 *   all (the Billing-2 UI's job to let an admin attribute them) —
 *   ALL-TIME, not bounded by `openingDate` (the design's own formula never
 *   qualifies it with one). `unattributedCount` (review F1) is the row COUNT
 *   of that same bucket — the UI gates the secchiello's own link on the
 *   count, not the summed amount, since two unattributed rows of opposite
 *   sign sum to 0 while the secchiello is still non-empty. `availableCents`
 *   = cash + bank − deposits (the pilots' money mixed in with the club's
 *   own).
 * - **`deposits`** (acconti/debito verso i piloti): `totalCents` = Σ of
 *   every POSITIVE account balance (money the club owes back); `exposureCents`
 *   = Σ ABS of every NEGATIVE one (who flew uncovered); `inRedCount` is how
 *   many accounts that is.
 * - **`byCategory`**: a straight pass-through of `cash.service.ts#getCashReport`
 *   for `ref`'s month (AC 5: "riuso... NON reimplementare") — entrate/uscite/
 *   netto per category, the model §2 of the design doc already established.
 *
 * Anti-double-counting (design doc §4/§8, the story's stated main risk): a
 * `CashMovement` whose `accountMovementId` points at a NON-ZERO
 * `AccountMovement` (today, only a `TOP_UP`'s twin) is already valued on the
 * account side — its cash-side euro must never also land in `costCents`/
 * `getLedgerRevenueCents`'s cash component. A twin of a ZERO-amount account
 * movement (today, `PACKAGE_PURCHASE` — see that type's own doc-comment:
 * "the payment is external to the account") carries value ONLY on the cash
 * side, so it is NOT excluded — same generalized predicate
 * `transactions.service.ts`'s own `buildCashWhere` already established for
 * the unified ledger's twin-dedup, reused here rather than reinvented.
 */

export type BillingSummaryResult = { revenueCents: number; costCents: number; netCents: number };
export type BillingSummaryTreasury = { cashCents: number; bankCents: number; unattributedCents: number; unattributedCount: number; availableCents: number };
export type BillingSummaryDeposits = { totalCents: number; exposureCents: number; inRedCount: number };

export type BillingSummary = {
  result: BillingSummaryResult;
  treasury: BillingSummaryTreasury;
  deposits: BillingSummaryDeposits;
  byCategory: CashReport;
};

/**
 * The month's cash uscite (AC 5's `costCents`) — every negative `CashMovement`
 * not already valued on the account side (`CASH_NOT_ALREADY_ON_ACCOUNT`,
 * imported from `transactions.service.ts` rather than duplicated here —
 * review Billing-1 F5), compenso istruttori included via its AC 4 gemello.
 * `CASH_COST_OR` (story Billing-2) is the SAME predicate the ledger's
 * `bookType: 'COST'` filter and per-row classification use — one
 * definition, never a second copy to drift.
 *
 * **Review Billing-1 F3** — mirrors `transactions.service.ts#computeRevenueCents`'s
 * own storno rule: a normal uscita (`reversalOfId == null`, negative) still
 * adds to cost; a storno OF an uscita (`reversalOfId != null`, positive —
 * `reverseCashMovement` always negates the original) is SUMMED alongside it
 * in the SAME aggregate — same month => nets to zero, later month => a
 * negative `costCents` there ("riduzione dei costi nel suo mese"). A storno
 * of an ENTRATA (`reversalOfId != null`, negative) is deliberately EXCLUDED
 * here — it nets revenue instead (`computeRevenueCents`), never costs.
 */
async function computeCostCents(from: string, to: string): Promise<number> {
  const aggregate = await prisma.cashMovement.aggregate({
    where: {
      effectiveDate: { gte: parseDateOnlyUtc(from), lte: parseDateOnlyUtc(to) },
      OR: CASH_COST_OR,
      ...CASH_NOT_ALREADY_ON_ACCOUNT,
    },
    _sum: { amountCents: true },
  });
  return -(aggregate._sum.amountCents ?? 0);
}

type TreasuryTotals = { cashCents: number; bankCents: number; unattributedCents: number; unattributedCount: number };

/** The running cash/bank balances plus the unattributed bucket (AC 5's `treasury`, minus `availableCents` — computed by the caller once `deposits` is known too). Review F1: `unattributedCount` is a plain row COUNT over the SAME `paymentMethod: null` scope as the sum — added to the same `Promise.all`, never a second round-trip. */
async function computeTreasuryTotals(): Promise<TreasuryTotals> {
  const opening = await getTreasuryOpeningInternal();
  const openingDateFilter = opening.openingDate ? { gte: parseDateOnlyUtc(opening.openingDate) } : undefined;

  const [cashAgg, bankAgg, unattributedAgg, unattributedCount] = await Promise.all([
    prisma.cashMovement.aggregate({
      where: { paymentMethod: 'CASH', ...(openingDateFilter ? { effectiveDate: openingDateFilter } : {}) },
      _sum: { amountCents: true },
    }),
    prisma.cashMovement.aggregate({
      where: { paymentMethod: { in: ['BANK_TRANSFER', 'POS'] }, ...(openingDateFilter ? { effectiveDate: openingDateFilter } : {}) },
      _sum: { amountCents: true },
    }),
    // ALL-TIME, deliberately unbounded by `openingDate` (module doc-comment) — a movement with no method at all is not part of any running balance to begin with.
    prisma.cashMovement.aggregate({
      where: { paymentMethod: null },
      _sum: { amountCents: true },
    }),
    prisma.cashMovement.count({ where: { paymentMethod: null } }),
  ]);

  return {
    cashCents: opening.openingCashCents + (cashAgg._sum.amountCents ?? 0),
    bankCents: opening.openingBankCents + (bankAgg._sum.amountCents ?? 0),
    unattributedCents: unattributedAgg._sum.amountCents ?? 0,
    unattributedCount,
  };
}

/** Acconti (AC 5's `deposits`) — every `Account`'s balance (Σ `AccountMovement.amountCents`, AD-3), split into the positive ("debito verso i piloti") and negative ("esposizione") buckets. One `groupBy`, never N+1 (same aggregation shape as `accounts.service.ts#listNegativeBalances`, extended here to also keep the positive side instead of filtering it out). */
async function computeDeposits(): Promise<BillingSummaryDeposits> {
  const grouped = await prisma.accountMovement.groupBy({
    by: ['accountId'],
    _sum: { amountCents: true },
  });

  let totalCents = 0;
  let exposureCents = 0;
  let inRedCount = 0;
  for (const group of grouped) {
    const balance = group._sum.amountCents ?? 0;
    if (balance > 0) {
      totalCents += balance;
    } else if (balance < 0) {
      exposureCents += -balance;
      inRedCount += 1;
    }
  }

  return { totalCents, exposureCents, inRedCount };
}

/**
 * The three-book summary for `ref`'s Europe/Rome calendar month (default:
 * now) — see the module doc-comment for the full breakdown. `finance.manage`
 * (STAFF+ADMIN), same permission `stats.service.ts`/`getCashReport` already
 * require (review F8: `getBillingKpis`, retired by this story, is no longer
 * a real consumer to cite here).
 */
export async function getBillingSummary(actor: Actor, ref: Date = new Date()): Promise<BillingSummary> {
  authorize(actor, 'finance.manage');

  const month = currentMonthRange(ref);

  const [revenueCents, costCents, treasuryTotals, deposits, byCategory] = await Promise.all([
    getLedgerRevenueCents(actor, month.from, month.to),
    computeCostCents(month.from, month.to),
    computeTreasuryTotals(),
    computeDeposits(),
    getCashReport(actor, { from: month.from, to: month.to }),
  ]);

  return {
    result: { revenueCents, costCents, netCents: revenueCents - costCents },
    treasury: { ...treasuryTotals, availableCents: treasuryTotals.cashCents + treasuryTotals.bankCents - deposits.totalCents },
    deposits,
    byCategory,
  };
}
