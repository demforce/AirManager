import { paginatedResponseSchema, paginationQuerySchema } from '@/lib/api/pagination';
import { exportQuerySchema } from './common';
import { z } from './zod-with-openapi';

// --- Categories (story 3.4, Task 1, AC 1) ----------------------------------

/**
 * `POST /api/v1/cash-categories` body — `name` unique (enforced in the
 * service, P2002 → `Conflict`), trimmed, capped at 100 chars: long enough
 * for any real category label, short enough for the same defense-in-depth
 * reason every other free-text field in the domain is capped.
 */
export const createCashCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateCashCategoryInput = z.infer<typeof createCashCategorySchema>;

/** `PATCH /api/v1/cash-categories/{id}` body — rename only (AC 1). */
export const renameCashCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type RenameCashCategoryInput = z.infer<typeof renameCashCategorySchema>;

/**
 * `GET /api/v1/cash-categories` query — `includeInactive` defaults to
 * `false` so the "new movement" category picker only ever sees active
 * categories by default; the admin management page passes `true` to also
 * manage deactivated ones (AC 1). Same `z.preprocess` footgun-avoidance as
 * `listAircraftQuerySchema.includeArchived` — `z.coerce.boolean()` would
 * treat the string `"false"` as truthy.
 */
export const listCashCategoriesQuerySchema = z.object({
  includeInactive: z.preprocess((value) => value === 'true' || value === true, z.boolean()).default(false),
});

export type ListCashCategoriesQuery = z.infer<typeof listCashCategoriesQuerySchema>;

/**
 * One entry of `GET /api/v1/cash-categories` (AC 1). Documentation only,
 * mirroring `cash.service.ts`'s `CashCategoryListItem`. `movementCount` is
 * always present (not just for the admin page) — a single service function
 * backs both the admin management page and the "new movement" picker (Dev
 * Notes) — and drives the admin UI's "cannot delete a category in use"
 * messaging.
 */
export const cashCategoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  movementCount: z.number().int().min(0),
  // Reserved for automatic flows (review 3.4 F1/F2): no manual movements, no delete.
  isSystem: z.boolean(),
});

export type CashCategoryItemDto = z.infer<typeof cashCategoryItemSchema>;

/**
 * `GET /api/v1/cash-categories` response — a plain array, not the AD-8
 * paginated envelope: the category list is expected to stay small (seeded
 * with 8, admin-managed) and every consumer (picker, admin page) renders it
 * in full — same choice as `negativeBalancesResponseSchema` (story 3.3).
 */
export const cashCategoryListResponseSchema = z.array(cashCategoryItemSchema);

export type CashCategoryListResponseDto = z.infer<typeof cashCategoryListResponseSchema>;

// --- Movements (story 3.4, Task 2, AC 2) -----------------------------------

/**
 * `POST /api/v1/cash-movements` body — a manual entrata (positive) or
 * uscita (negative) cash-register entry. `amountCents` is a SIGNED,
 * non-zero integer (AD-2), capped at the Postgres INTEGER max on both ends
 * (same defense-in-depth as `recordAdjustmentSchema`, story 3.3).
 * `effectiveDate` is a calendar date only (`YYYY-MM-DD`), same `z.iso.date()`
 * pattern as `recordTopUpSchema`. `description` follows the domain's
 * ''→null convention (Dev Notes) via `.nullish()`.
 */
export const recordCashMovementSchema = z.object({
  categoryId: z.string().trim().min(1),
  amountCents: z
    .number()
    .int()
    .min(-2_147_483_647)
    .max(2_147_483_647)
    .refine((value) => value !== 0, { message: 'amountCents must not be zero' }),
  effectiveDate: z.iso.date(),
  description: z.string().trim().min(1).max(500).nullish(),
});

export type RecordCashMovementInput = z.infer<typeof recordCashMovementSchema>;

/**
 * `POST /api/v1/cash-movements/{id}/reverse` body (AD-3 storno) — `reason`
 * is mandatory, same cap as every other free-text reason field in the domain.
 */
export const reverseCashMovementSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type ReverseCashMovementInput = z.infer<typeof reverseCashMovementSchema>;

/**
 * `GET /api/v1/cash-movements` query — the shared pagination shape (story
 * 1.5) plus the register's own filters (AC 2): `from`/`to` (inclusive, on
 * `effectiveDate`), `categoryId`, and `sign` (`in` = amountCents > 0, `out`
 * = amountCents < 0).
 */
export const listCashMovementsQuerySchema = paginationQuerySchema.extend({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  categoryId: z.string().trim().min(1).optional(),
  sign: z.enum(['in', 'out']).optional(),
  ...exportQuerySchema.shape,
});

export type ListCashMovementsQuery = z.infer<typeof listCashMovementsQuerySchema>;

/**
 * One entry of the cash register (AC 2). Documentation only, mirroring
 * `cash.service.ts`'s `CashMovementListItem`. `reversalOfId`/`hasReversal`
 * are the same storno badge/action-visibility pair as
 * `accountStatementItemSchema` (story 3.3). `isAutomatic` flags the
 * automatic top-up twin (story 3.1, `accountMovementId` set) — the register
 * never offers a "storna" action on these rows (Dev Notes: their correction
 * goes through the account rettifica, story 3.3, never the cash register
 * directly, or conto and cassa would diverge).
 */
export const cashMovementItemSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  amountCents: z.number().int(),
  effectiveDate: z.iso.date(),
  description: z.string().nullable(),
  actorEmail: z.string(),
  createdAt: z.iso.datetime(),
  reversalOfId: z.string().nullable(),
  hasReversal: z.boolean(),
  isAutomatic: z.boolean(),
});

export type CashMovementItemDto = z.infer<typeof cashMovementItemSchema>;

/** `GET /api/v1/cash-movements` response — AD-8 paginated shape. */
export const cashMovementListResponseSchema = paginatedResponseSchema(cashMovementItemSchema);

export type CashMovementListResponseDto = z.infer<typeof cashMovementListResponseSchema>;

// --- Financial report (story 3.5, Task 1/2, AC 1/2) -------------------------

/**
 * `GET /api/v1/cash-report` query — BOTH bounds mandatory (unlike
 * `listCashMovementsQuerySchema`'s optional `from`/`to`): a report always
 * covers an explicit period, there is no "all time" report. Plain
 * `YYYY-MM-DD` string comparison is safe for the `.refine` because
 * `z.iso.date()` guarantees the fixed-width ISO format. Rejects an inverted
 * range with a 422 (Dev Notes: story 3.4 review F4 left this hole open on
 * the register's own `from`/`to` — the report must not repeat it). Period
 * presets (mese/trimestre/anno correnti) are UI-only (`period-presets.ts`)
 * — the service always receives explicit bounds, never calendar logic.
 */
export const cashReportQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, { message: 'from must not be after to', path: ['to'] });

export type CashReportQuery = z.infer<typeof cashReportQuerySchema>;

/**
 * One category row of the report (AC 1). Documentation only, mirroring
 * `cash.service.ts`'s `CashReportCategoryTotal`. `netCents = inCents +
 * outCents` (AD-2, `outCents` already negative) — categories with no
 * movements in the period are never present (excluded upstream).
 */
export const cashReportCategorySchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  inCents: z.number().int(),
  outCents: z.number().int(),
  netCents: z.number().int(),
});

export type CashReportCategoryDto = z.infer<typeof cashReportCategorySchema>;

/**
 * `GET /api/v1/cash-report` response (AC 1/2). `netCents` is the period's
 * saldo (`totalInCents + totalOutCents`); `categories` is ordered by name
 * and excludes categories untouched in the period (`cash.service.ts`'s
 * `getCashReport`). `movementCount` is the total number of ledger rows
 * (across every category) that fall in the period.
 */
export const cashReportResponseSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  totalInCents: z.number().int(),
  totalOutCents: z.number().int(),
  netCents: z.number().int(),
  categories: z.array(cashReportCategorySchema),
  movementCount: z.number().int().min(0),
});

export type CashReportResponseDto = z.infer<typeof cashReportResponseSchema>;
