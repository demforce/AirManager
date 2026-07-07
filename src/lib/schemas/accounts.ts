import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { z } from './zod-with-openapi';

/** Mirrors the Prisma `PaymentMethod` enum (story 3.1, AC 2). */
export const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'POS']);

export type PaymentMethodDto = z.infer<typeof paymentMethodSchema>;

/**
 * Mirrors the Prisma `AccountMovementType` enum. `ADJUSTMENT` is story 3.3's
 * motivated correction (AC 1); `PACKAGE_PURCHASE` (story 4.4, AC 1) is the
 * always-`amountCents: 0` row a package sale creates purely so the titolare
 * sees the purchase in their estratto conto (the actual payment is external
 * to the account — see `HourPackage`'s doc-comment).
 */
export const accountMovementTypeSchema = z.enum(['TOP_UP', 'ADJUSTMENT', 'PACKAGE_PURCHASE']);

export type AccountMovementTypeDto = z.infer<typeof accountMovementTypeSchema>;

/**
 * `POST /api/v1/people/{id}/account/top-ups` request body (story 3.1, AC 2).
 * `amountCents` is a SIGNED integer (AD-2) but a top-up is always positive —
 * `.positive()` rejects zero/negative at the boundary, capped at the
 * Postgres INTEGER max so an absurd value fails as a clean 422 instead of a
 * driver overflow (same defense-in-depth as `createAircraftSchema.hourMeterMinutes`,
 * review 2.4 F2). The UI converts euros to cents only at submit time
 * (Dev Notes) — this schema only ever sees the integer cents wire value.
 * `effectiveDate` is a calendar date only (`YYYY-MM-DD`), same
 * `z.iso.date()` pattern as `studentProfileRequestSchema.courseStartDate`
 * (story 2.2) — no time-of-day, TZ-safe round-trip.
 */
export const recordTopUpSchema = z.object({
  amountCents: z.number().int().positive().max(2_147_483_647),
  paymentMethod: paymentMethodSchema,
  effectiveDate: z.iso.date(),
  // Same defense-in-depth length cap as other optional free-text fields
  // (e.g. `setOutOfServiceSchema.reason`, review 2.4/2.5).
  description: z.string().trim().min(1).max(500).nullish(),
});

export type RecordTopUpInput = z.infer<typeof recordTopUpSchema>;

/**
 * One entry of the account ledger, as previewed by the account overview
 * (story 3.1, AC 2/3) — documentation only, mirroring
 * `accounts.service.ts`'s `AccountMovementListItem`. `amountCents` stays
 * signed on the wire (AD-2); the UI formats it (`src/lib/money.ts`) and
 * decides the +/- presentation from the sign, never the type. The full,
 * paginated statement is story 3.2 — this is only a lightweight preview.
 */
export const accountMovementListItemSchema = z.object({
  id: z.string(),
  type: accountMovementTypeSchema,
  amountCents: z.number().int(),
  paymentMethod: paymentMethodSchema.nullable(),
  description: z.string().nullable(),
  effectiveDate: z.iso.date(),
  actorUserId: z.string(),
  createdAt: z.iso.datetime(),
});

export type AccountMovementListItemDto = z.infer<typeof accountMovementListItemSchema>;

/**
 * `GET /api/v1/people/{id}/account` response (story 3.1, AC 1) — and also
 * `recordTopUp`'s return shape, so the UI gets the fresh balance/preview
 * directly from the `POST` response without a second round-trip.
 * `account: null` means the person never activated a pilot/student profile
 * (AC 1) — "Nessun conto attivo" in the UI. `balanceCents` is ALWAYS the
 * `SUM(amountCents)` aggregate (AD-3) — 0 both when there is no account and
 * when the account has no movements yet, never a stored column.
 * `recentMovements` is capped at 5, most-recent-first — a preview only
 * (Dev Notes: the full statement is story 3.2, not built here).
 */
export const accountSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
});

export type AccountDto = z.infer<typeof accountSchema>;

export const accountOverviewSchema = z.object({
  account: accountSchema.nullable(),
  balanceCents: z.number().int(),
  recentMovements: z.array(accountMovementListItemSchema).max(5),
});

export type AccountOverviewDto = z.infer<typeof accountOverviewSchema>;

/**
 * `GET /api/v1/people/{id}/account/movements` query (story 3.2) — the shared
 * pagination shape (story 1.5), same reuse as `listHourMeterAdjustmentsQuerySchema`.
 */
export const listAccountMovementsQuerySchema = paginationQuerySchema;

export type ListAccountMovementsQuery = z.infer<typeof listAccountMovementsQuerySchema>;

/**
 * One entry of the full, paginated account statement (story 3.2, AC 1/2).
 * Documentation only, mirroring `accounts.service.ts`'s `AccountStatementItem`.
 * `actorEmail` is present ONLY when the caller has `people.read` (AC 2's
 * operational detail for staff) — absent for a titolare reading their own
 * statement, same conditional-field pattern as the service's own guard.
 */
export const accountStatementItemSchema = z.object({
  id: z.string(),
  type: accountMovementTypeSchema,
  amountCents: z.number().int(),
  effectiveDate: z.iso.date(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  actorEmail: z.string().optional(),
  /**
   * Story 3.3, AC 1: set only on an `ADJUSTMENT` row that is linked to the
   * original movement it corrects — the UI badges these rows "rettifica di
   * ...". `null` for a standalone adjustment (never linked) and for every
   * non-`ADJUSTMENT` row.
   */
  reversalOfId: z.string().nullable(),
  /**
   * True when this movement already has an `ADJUSTMENT` linked to it via
   * `reversalOfId` (`@unique` — at most one). Drives whether the estratto
   * conto's "Rettifica questo movimento" row action is shown (Dev Notes: a
   * second adjustment on the same original is a 409, not silently allowed).
   */
  hasReversal: z.boolean(),
});

export type AccountStatementItemDto = z.infer<typeof accountStatementItemSchema>;

/** `GET /api/v1/people/{id}/account/movements` response — AD-8 paginated shape. */
export const accountStatementResponseSchema = paginatedResponseSchema(accountStatementItemSchema);

export type AccountStatementResponseDto = z.infer<typeof accountStatementResponseSchema>;

/**
 * `POST /api/v1/people/{id}/account/adjustments` request body (story 3.3,
 * AC 1). `amountCents` is a SIGNED, non-zero integer (AD-2) — a rettifica can
 * correct the balance in either direction — capped at the Postgres INTEGER
 * max on both ends (same defense-in-depth as `recordTopUpSchema`). `reason`
 * is mandatory (AC 1: "motivo obbligatorio"), capped at 500 chars like every
 * other free-text field in the domain. `originalMovementId`, when present,
 * links this adjustment to the movement it corrects (`reversalOfId`) — the
 * service enforces same-account ownership and the at-most-one-reversal rule
 * (never a Zod-level concern).
 */
export const recordAdjustmentSchema = z.object({
  amountCents: z
    .number()
    .int()
    .min(-2_147_483_647)
    .max(2_147_483_647)
    .refine((value) => value !== 0, { message: 'amountCents must not be zero' }),
  reason: z.string().trim().min(1).max(500),
  originalMovementId: z.string().nullish(),
});

export type RecordAdjustmentInput = z.infer<typeof recordAdjustmentSchema>;

/**
 * One entry of `GET /api/v1/accounts/negative-balances` (story 3.3, AC 2):
 * the staff-facing "saldi negativi" list. `balanceCents` is always the same
 * `SUM(AccountMovement.amountCents)` computation as everywhere else (AD-3) —
 * never a stored column. `lastMovementAt` is `null` only in the
 * (theoretical) case of an account whose every movement was concurrently
 * removed — cannot happen today (AD-3: append-only, nothing is ever
 * deleted), kept nullable defensively rather than asserted non-null.
 */
export const negativeBalanceItemSchema = z.object({
  personId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  balanceCents: z.number().int(),
  lastMovementAt: z.iso.datetime().nullable(),
});

export type NegativeBalanceItemDto = z.infer<typeof negativeBalanceItemSchema>;

/**
 * `GET /api/v1/accounts/negative-balances` response — a plain array, not the
 * AD-8 paginated envelope: the list is expected to stay small (Dev Notes) and
 * the UI (dashboard finance landing) always renders it in full, most-negative
 * first.
 */
export const negativeBalancesResponseSchema = z.array(negativeBalanceItemSchema);

export type NegativeBalancesResponseDto = z.infer<typeof negativeBalancesResponseSchema>;
