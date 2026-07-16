import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { accountMovementTypeSchema, accountOverviewSchema, paymentMethodSchema } from './accounts';
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
 * One ledger row (AC 1). `amountCents` is CLUB-CENTRIC (ratifica utente 1,
 * 2026-07-16): a charge/ricavo is POSITIVE, a payment received is NEGATIVE —
 * the OPPOSITE sign convention of the raw `AccountMovement.amountCents`
 * column for `ACCOUNT` rows (flipped in the service), while `CASH` rows
 * already match it as-is (entrata > 0). `kind` is either the raw
 * `AccountMovementType` (`ACCOUNT` rows) or the `CashCategory.name`
 * (`CASH` rows) — same free-text badge label either way. `reference` is the
 * linked `flightId` (`ACCOUNT` FLIGHT_CHARGE*) or `PprRequest.pprNumber`
 * (`CASH` landing-fee twin), `null` otherwise. `reversal`/`reversed` drive
 * the Stato lineage badge (AC 3): `reversal` = this row IS a storno/rettifica
 * of another; `reversed` = another row already corrects/reverses THIS one.
 * `actionable` = staff may act on this row (Rettifica/Storna, AC 3) — always
 * `false` on a derived row (FLIGHT_CHARGE*, PACKAGE_PURCHASE, an automatic
 * twin) or one already reversed.
 */
export const transactionRowSchema = z.object({
  id: z.string(),
  source: transactionSourceSchema,
  date: z.iso.date(),
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  kind: z.string(),
  description: z.string().nullable(),
  amountCents: z.number().int(),
  method: paymentMethodSchema.nullable(),
  reference: z.string().nullable(),
  reversal: z.boolean(),
  reversed: z.boolean(),
  actionable: z.boolean(),
});

export type TransactionRowDto = z.infer<typeof transactionRowSchema>;

/** `GET /api/v1/transactions` response — AD-8 paginated shape. */
export const transactionListResponseSchema = paginatedResponseSchema(transactionRowSchema);

export type TransactionListResponseDto = z.infer<typeof transactionListResponseSchema>;

/**
 * `GET /api/v1/transactions` query (AC 1). `from`/`to` filter inclusively on
 * `effectiveDate` (same convention as `listCashMovementsQuerySchema`).
 * `movementType` (the 5 `AccountMovementType` values) and `categoryId` (a
 * cash category) are MUTUALLY EXCLUSIVE — a request naming both is a 422
 * (the `.refine` below), same "narrow to one source's own vocabulary" rule
 * the Tipo filter's two optgroups present in the UI. `direction` filters on
 * the NORMALIZED (club-centric) sign: `charge` = positive, `payment` =
 * negative.
 */
export const listTransactionsQuerySchema = paginationQuerySchema
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    personId: z.string().trim().min(1).optional(),
    movementType: accountMovementTypeSchema.optional(),
    categoryId: z.string().trim().min(1).optional(),
    direction: z.enum(['charge', 'payment']).optional(),
    ...exportQuerySchema.shape,
  })
  .refine((value) => !(value.movementType && value.categoryId), {
    message: 'movementType and categoryId are mutually exclusive.',
    path: ['categoryId'],
  });

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

/**
 * `getBillingKpis` result (AC 1/2, ratifica utente 2) — TRUE server-side
 * aggregates over the WHOLE ledger for the CURRENT Europe/Rome calendar
 * month, independent of any table filter (lezione 12.8: never a per-page
 * sum). `revenueCents` and `chargesCents` are, BY THE RATIFIED DEFINITION,
 * the SAME sum (Σ positive normalized amounts of the month) — two KPI tiles
 * surfacing one figure with different sub-labels/deltas (revenue: % vs
 * previous month, no count; addebiti: a count, no delta) — not a bug.
 * `netCents = chargesCents - paymentsCents`. `revenueByKind` feeds the
 * "Ricavi per categoria" card, one entry per DISTINCT `kind` with a positive
 * sum this month.
 */
export const billingKpisSchema = z.object({
  revenueCents: z.number().int(),
  prevMonthRevenueCents: z.number().int(),
  chargesCents: z.number().int(),
  chargesCount: z.number().int().min(0),
  paymentsCents: z.number().int(),
  paymentsCount: z.number().int().min(0),
  netCents: z.number().int(),
  revenueByKind: z.array(z.object({ kind: z.string(), amountCents: z.number().int() })),
});

export type BillingKpisDto = z.infer<typeof billingKpisSchema>;

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
  z.object({ kind: z.literal('ADJUSTMENT'), account: accountOverviewSchema }),
  z.object({ kind: z.literal('CASH'), cashMovement: cashMovementItemSchema }),
]);

export type RecordTransactionResponseDto = z.infer<typeof recordTransactionResponseSchema>;
