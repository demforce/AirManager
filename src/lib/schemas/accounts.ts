import { z } from './zod-with-openapi';

/** Mirrors the Prisma `PaymentMethod` enum (story 3.1, AC 2). */
export const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'POS']);

export type PaymentMethodDto = z.infer<typeof paymentMethodSchema>;

/** Mirrors the Prisma `AccountMovementType` enum. Only `TOP_UP` is populated today (Dev Notes). */
export const accountMovementTypeSchema = z.enum(['TOP_UP']);

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
