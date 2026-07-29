import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { accountMovementTypeSchema, accountOverviewSchema, accountOverviewWithAlertSchema, paymentMethodSchema } from './accounts';
import { cashMovementItemSchema } from './cash';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

/**
 * Unified billing ledger (epic 12, story 12.9, AC 1) — `AccountMovement` ∪
 * `CashMovement`, read-only reader. `source` tells the two apart on the
 * wire; every other field is normalized to the SAME shape regardless of
 * origin (`transactions.service.ts`'s `toTransactionRow` helpers).
 */
export const transactionSourceSchema = z.enum(['ACCOUNT', 'CASH']);

export type TransactionSourceDto = z.infer<typeof transactionSourceSchema>;

/**
 * The three-book classification of a single ledger row (story Billing-2,
 * AC 2) — `ricavo`/`costo`/`acconto`/`giroconto` in the UI, derived
 * SERVER-SIDE from the same predicates `billing-summary.service.ts`'s
 * `result`/`deposits` aggregates already use (`transactions.service.ts`'s
 * `ACCOUNT_REVENUE_OR`/`CASH_REVENUE_OR`/`CASH_COST_OR`), so the per-row
 * badge and the riquadri totals can never drift (review Billing-1 F6's
 * lesson, closed at the root by this story instead of left to rot):
 * `REVENUE` (ricavo), `COST` (costo), `DEPOSIT` (acconto — a `TOP_UP`,
 * increases the debito verso i piloti, "non incide sul risultato"),
 * `TRANSFER` (giroconto — a standalone credit `ADJUSTMENT` with no
 * `reversalOfId`: no P&L role either).
 */
export const bookTypeSchema = z.enum(['REVENUE', 'COST', 'DEPOSIT', 'TRANSFER']);

export type BookTypeDto = z.infer<typeof bookTypeSchema>;

/**
 * One ledger row (AC 1; amount convention rewritten story Billing-2, AC 2).
 * `amountCents` is now the RAW, natural direction on BOTH sides — positive =
 * value received (a `TOP_UP` credit, a cash entrata), negative = value given
 * (a `FLIGHT_CHARGE`/`ADJUSTMENT` debit, a cash uscita). The OLD
 * club-centric flip (ratifica utente 1, 2026-07-16: a charge/ricavo was
 * POSITIVE, a payment received was NEGATIVE — `ACCOUNT` rows only) is
 * RETIRED (`transactions.service.ts#toAccountRow`'s `-row.amountCents` is
 * gone): the console no longer shows one signed column at all, splitting
 * into separate Entrate/Uscite columns instead (`amountCents > 0` /
 * `< 0`) — there is nothing left for a club-centric sign to disambiguate.
 * `bookType` is the new, coarse classification (see {@link bookTypeSchema})
 * that replaces the old kind/category badge as both the Tipo column's value
 * and its filter; `kind` survives alongside it (folded into the
 * Descrizione cell) for the granular label (raw `AccountMovementType` or
 * `CashCategory.name`). `reference` is the linked `flightId` (`ACCOUNT`
 * FLIGHT_CHARGE*) or `PprRequest.pprNumber` (`CASH` landing-fee twin),
 * `null` otherwise. `reversal`/`reversed` drive the Stato lineage badge
 * (AC 3): `reversal` = this row IS a storno/rettifica of another; `reversed`
 * = another row already corrects/reverses THIS one. `actionable` = staff may
 * act on this row (Rettifica/Storna, AC 3) — always `false` on a derived row
 * (FLIGHT_CHARGE*, PACKAGE_PURCHASE, an automatic twin) or one already
 * reversed. `method` (story Billing-2, AC 3) now carries the REAL
 * `CashMovement.paymentMethod` on `CASH` rows too (previously hardcoded
 * `null` — pre-dated the field) — `null` there means "non attribuito", the
 * secchiello a `finance.manage` actor can reclassify via
 * `PATCH /api/v1/cash-movements/{id}`.
 */
export const transactionRowSchema = z.object({
  id: z.string(),
  source: transactionSourceSchema,
  date: z.iso.date(),
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  kind: z.string(),
  bookType: bookTypeSchema,
  description: z.string().nullable(),
  amountCents: z.number().int(),
  method: paymentMethodSchema.nullable(),
  reference: z.string().nullable(),
  reversal: z.boolean(),
  reversed: z.boolean(),
  actionable: z.boolean(),
});

export type TransactionRowDto = z.infer<typeof transactionRowSchema>;

/**
 * Club-perspective Entrate/Uscite split (story Billing-2, PO ratifica
 * 2026-07-27, review F7 — SUPERSEDES the mock in
 * `docs/superpowers/specs/2026-07-26-billing-rework-design.md` §5). ONE
 * shared rule for both renderers of a `TransactionRowDto` — the console
 * table (`billing-console.tsx`) and the xlsx export
 * (`exports.service.ts#exportTransactionsXlsx`) — never two independent
 * copies of the split.
 *
 * `CASH` rows are already club-centric natively (an entrata di cassa was
 * always DB-positive) — returned as-is. `ACCOUNT` rows carry the
 * pilot-account-centric raw direction (a credit to the pilot's balance is
 * positive, `amountCents`'s own doc-comment above) — for a `REVENUE`-booked
 * row (`FLIGHT_CHARGE`/`FLIGHT_CHARGE_REVERSAL`/a revenue `ADJUSTMENT`) that
 * is the OPPOSITE of the club's own book (a debit against the pilot IS the
 * club's ricavo — addebito volo -> Entrate; its storno -> Uscite), so it is
 * negated — the SAME negation `transactions.service.ts#computeRevenueCents`
 * already applies when summing the identical `ACCOUNT_REVENUE_OR` rows into
 * `result.revenueCents`. A `DEPOSIT`/`TRANSFER` row (ricarica, sua
 * rettifica, giroconto) is NOT negated: its raw sign already matches the
 * club's own ledger direction (a ricarica is cash IN — Entrate; a rettifica
 * riducendo l'acconto is cash OUT — Uscite), the SAME raw balances
 * `billing-summary.service.ts#computeDeposits` sums with no negation either.
 */
export function ledgerClubAmountCents(row: Pick<TransactionRowDto, 'source' | 'bookType' | 'amountCents'>): number {
  if (row.source === 'CASH') return row.amountCents;
  return row.bookType === 'REVENUE' ? -row.amountCents : row.amountCents;
}

/** `GET /api/v1/transactions` response — AD-8 paginated shape. */
export const transactionListResponseSchema = paginatedResponseSchema(transactionRowSchema);

export type TransactionListResponseDto = z.infer<typeof transactionListResponseSchema>;

/**
 * `GET /api/v1/transactions` query (AC 1). `from`/`to` filter inclusively on
 * `effectiveDate` (same convention as `listCashMovementsQuerySchema`).
 * `movementType` (the 5 `AccountMovementType` values) and `categoryId` (a
 * cash category) are MUTUALLY EXCLUSIVE — a request naming both is a 422
 * (the `.refine` below); both stay available for API/programmatic
 * consumers, but the console's own "Tipo" filter (story Billing-2) now uses
 * `bookType` instead (the coarse ricavo/costo/acconto/giroconto
 * classification, {@link bookTypeSchema}) — the two families are
 * independent and may combine. `direction` filters on the RAW db sign
 * (`ACCOUNT`: `charge` = a debit, DB-negative; `CASH`: `charge` = an
 * entrata, DB-positive — unaffected by AC 2's amount-convention rewrite,
 * since it was always applied to the pre-normalization column).
 * `unattributed` (story Billing-2, AC 3) narrows to the "secchiello": `CASH`
 * rows with no `paymentMethod` at all — `ACCOUNT` rows are skipped entirely
 * when set (an addebito/rettifica is not a treasury-attribution concern).
 * `personQuery` (story 13.5, AC 1) is a SEPARATE, free-text narrowing
 * filter — a case-insensitive substring match on the linked person's
 * `firstName`/`lastName` (the billing console's free-text pilot filter,
 * replacing its old `SearchCombobox` picker) — AND-combined with every
 * other filter, `personId` included.
 */
export const listTransactionsQuerySchema = paginationQuerySchema
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    personId: z.string().trim().min(1).optional(),
    personQuery: z.string().trim().min(1).optional(),
    movementType: accountMovementTypeSchema.optional(),
    categoryId: z.string().trim().min(1).optional(),
    bookType: bookTypeSchema.optional(),
    // Review Billing-2 F10: only ever coerces a recognized value — a stray
    // `unattributed=1`/`yes`/anything else used to silently fall through to
    // `false` (the old `value === 'true' || value === true` predicate never
    // rejects); it now falls through UNCHANGED to `z.boolean()`, which fails
    // loudly (422) on anything that isn't a real boolean.
    unattributed: z
      .preprocess((value) => {
        if (value === 'true' || value === '1' || value === true) return true;
        if (value === 'false' || value === '0' || value === false) return false;
        return value;
      }, z.boolean())
      .optional(),
    direction: z.enum(['charge', 'payment']).optional(),
    ...exportQuerySchema.shape,
  })
  .refine((value) => !(value.movementType && value.categoryId), {
    message: 'movementType and categoryId are mutually exclusive.',
    path: ['categoryId'],
  });

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

// --- "Nuova transazione" (AC 4) ---------------------------------------------

/**
 * `POST /api/v1/transactions` body (AC 4) — a discriminated union over the
 * SlideOver's 3 branches (D13: real domain fields, not the prototype's 6
 * labels), each delegating to an EXISTING writer
 * (`recordTopUp`/`recordAdjustment`/`recordCashMovement` — untouched, still
 * reachable on their own routes too). `ADJUSTMENT`'s `amountCents` is
 * POSITIVE on the wire (the form's "importo addebito") — the service negates
 * it before calling `recordAdjustment`, matching that model's DB sign
 * convention for a charge (same convention `FLIGHT_CHARGE` already uses).
 */
export const recordTransactionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('TOP_UP'),
    personId: z.string().trim().min(1),
    amountCents: z.number().int().positive().max(2_147_483_647),
    paymentMethod: paymentMethodSchema,
    effectiveDate: z.iso.date(),
    description: z.string().trim().min(1).max(500).nullish(),
  }),
  z.object({
    kind: z.literal('ADJUSTMENT'),
    personId: z.string().trim().min(1),
    amountCents: z.number().int().positive().max(2_147_483_647),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    kind: z.literal('CASH'),
    categoryId: z.string().trim().min(1),
    direction: z.enum(['in', 'out']),
    amountCents: z.number().int().positive().max(2_147_483_647),
    paymentMethod: paymentMethodSchema,
    effectiveDate: z.iso.date(),
    description: z.string().trim().min(1).max(500).nullish(),
  }),
]);

export type RecordTransactionInput = z.infer<typeof recordTransactionSchema>;

/**
 * `POST /api/v1/transactions` response (AC 4) — the fresh state the
 * delegated writer already returns: the account overview (with balance) for
 * the two account-side branches, or the created cash movement for the third.
 * The SlideOver's success feedback reads `account.balanceCents` when present
 * (Dev Notes: "saldo aggiornato della persona").
 */
export const recordTransactionResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('TOP_UP'), account: accountOverviewSchema }),
  // Story 14.4 review F7 — `balanceAlert` (ratifica R-14.4-d): this branch is
  // a real debit ("Addebito conto"), see `accountOverviewWithAlertSchema`'s
  // own doc-comment.
  z.object({ kind: z.literal('ADJUSTMENT'), account: accountOverviewWithAlertSchema }),
  z.object({ kind: z.literal('CASH'), cashMovement: cashMovementItemSchema }),
]);

export type RecordTransactionResponseDto = z.infer<typeof recordTransactionResponseSchema>;
