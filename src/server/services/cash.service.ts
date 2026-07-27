import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type { CashReportQuery, ListCashCategoriesQuery, ListCashMovementsQuery, ReclassifyCashMovementInput, RecordCashMovementInput } from '@/lib/schemas/cash';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Prisma FK-constraint violation — `CashMovement.categoryId` is `ON DELETE
 * RESTRICT` (story 3.1's migration). This is the concurrency backstop for
 * `deleteCashCategory`'s pre-check: a movement recorded against the category
 * between the count check and the `DELETE` still hits the FK and must read
 * as the same `Conflict`, never a raw 500.
 */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2003';
}

/**
 * Prisma "record not found" on write (story TD-1, AC 1) — the loser of a
 * concurrent double-DELETE race: both requests pass the `findUnique`
 * pre-check (the row still exists at that instant), one wins the `DELETE`,
 * and the other's `DELETE` then hits a row that is already gone. Maps to the
 * SAME 404 the pre-check itself would have produced, never a raw 500.
 */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2025';
}

// --- Categories (Task 1, AC 1) ---------------------------------------------

/**
 * Categories owned by automated flows: "Ricariche" (top-up twin, story 3.1,
 * `accounts.service.ts`'s `TOP_UP_CASH_CATEGORY_NAME`), "Compensi istruttori"
 * (instructor-payout twin, story Billing-1 AC 4,
 * `instructor-compensation.service.ts`'s `INSTRUCTOR_PAYOUT_CASH_CATEGORY_NAME`)
 * and "PPR" (landing-fee twin, `ppr.service.ts`'s `PPR_CASH_CATEGORY_NAME`).
 * Guarded here (review 3.4 F1/F2; review Billing-1 F2 extended the set to
 * the latter two — same exposure, pre-existing): a MANUAL movement in one of
 * these would inflate a cash line no account/payout/PPR request reflects
 * (the exact conto/cassa divergence the storno rules defend against), and
 * DELETING one — legal per AC 1 while unused — would 500 every subsequent
 * automatic movement until the seed is re-run. Deactivation stays allowed:
 * it fails loudly in the respective writer by design (story 3.4 Task 1).
 * `isSystem` (below) is a PURE function of this Set, never a stored column —
 * there is nothing to seed for it.
 */
const SYSTEM_CASH_CATEGORY_NAMES = new Set(['Ricariche', 'Compensi istruttori', 'PPR']);

export type CashCategoryListItem = {
  id: string;
  name: string;
  isActive: boolean;
  movementCount: number;
  /** True for categories reserved to automatic flows (see `SYSTEM_CASH_CATEGORY_NAMES`) — no manual movements, no delete. */
  isSystem: boolean;
};

/**
 * Lists cash categories — used by BOTH the admin management page
 * (`includeInactive: true`) and the "new movement" panel's category picker
 * (active-only, the default). Read access is `finance.manage` for both
 * call sites (Dev Notes: "la lista per il select: finance.manage basta") —
 * `ADMIN` already holds it (the full permission set), so there is no need
 * for a `settings.manage` OR-check here; that stricter permission only
 * gates the CRUD/lifecycle functions below. `movementCount` (`_count`) is
 * always computed, never conditional — the admin-only "cannot delete a
 * category in use" messaging is a UI concern, not a service one.
 */
export async function listCashCategories(actor: Actor, query: ListCashCategoriesQuery): Promise<CashCategoryListItem[]> {
  authorize(actor, 'finance.manage');

  const categories = await prisma.cashCategory.findMany({
    where: query.includeInactive ? undefined : { isActive: true },
    select: { id: true, name: true, isActive: true, _count: { select: { movements: true } } },
    orderBy: { name: 'asc' },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    isActive: category.isActive,
    movementCount: category._count.movements,
    isSystem: SYSTEM_CASH_CATEGORY_NAMES.has(category.name),
  }));
}

/**
 * Creates a cash category (AC 1). `settings.manage` (admin) only — this is
 * finance configuration, deliberately stricter than day-to-day cash
 * operations (`finance.manage`, staff+admin).
 */
export async function createCashCategory(actor: Actor, input: { name: string }): Promise<CashCategoryListItem> {
  authorize(actor, 'settings.manage');

  try {
    const category = await prisma.cashCategory.create({
      data: { name: input.name },
      select: { id: true, name: true, isActive: true },
    });
    return { ...category, movementCount: 0, isSystem: SYSTEM_CASH_CATEGORY_NAMES.has(category.name) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A cash category with this name already exists.');
    }
    throw error;
  }
}

/** Renames a cash category (AC 1). `settings.manage` only — same unique-name conflict as `createCashCategory`. */
export async function renameCashCategory(actor: Actor, id: string, input: { name: string }): Promise<CashCategoryListItem> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.cashCategory.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!existing) {
    throw new NotFoundError('Cash category not found.');
  }
  if (SYSTEM_CASH_CATEGORY_NAMES.has(existing.name)) {
    // Same class as the delete guard (review 3.4 F2): automatic flows
    // resolve system categories BY NAME — renaming "Ricariche" would break
    // every subsequent top-up as surely as deleting it.
    throw new ConflictError('This is a system category required by automatic movements — it cannot be renamed.');
  }

  try {
    const category = await prisma.cashCategory.update({
      where: { id },
      data: { name: input.name },
      select: { id: true, name: true, isActive: true, _count: { select: { movements: true } } },
    });
    return {
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      movementCount: category._count.movements,
      isSystem: SYSTEM_CASH_CATEGORY_NAMES.has(category.name),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A cash category with this name already exists.');
    }
    throw error;
  }
}

/**
 * Deactivates a cash category (AC 1) — soft only, same rationale as
 * `deactivateProfile` (story 2.2): a deactivated category disappears from
 * new-movement pickers (`listCashCategories`'s default) but every historical
 * `CashMovement` referencing it stays intact and readable. Atomic guarded
 * UPDATE (review 2.2 F1 pattern): the WHERE also requires `isActive: true`
 * so two concurrent deactivations can't both "win" the check-then-write race
 * — the loser matches zero rows and gets the same `ConflictError` as
 * deactivating an already-inactive category.
 */
export async function deactivateCashCategory(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.cashCategory.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Cash category not found.');
  }

  const { count } = await prisma.cashCategory.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
  if (count === 0) {
    throw new ConflictError('Cash category is already inactive.');
  }
}

/** Reactivates a previously deactivated cash category (AC 1). `settings.manage` only — mirrors `deactivateCashCategory`'s atomic guard. */
export async function reactivateCashCategory(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.cashCategory.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Cash category not found.');
  }

  const { count } = await prisma.cashCategory.updateMany({ where: { id, isActive: false }, data: { isActive: true } });
  if (count === 0) {
    throw new ConflictError('Cash category is already active.');
  }
}

/**
 * Deletes a cash category — ONLY when it has never been used (AC 1): a
 * category with `CashMovement` rows must be deactivated instead, never
 * deleted. The `movements` count pre-check gives a clear, actionable 409
 * message; the FK `RESTRICT` already on `CashMovement.categoryId` (story
 * 3.1's migration) is a backstop for the race where a movement is recorded
 * against this very category between the count check and the `DELETE`
 * (`P2003` → the same `ConflictError`, never a raw 500).
 */
export async function deleteCashCategory(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.cashCategory.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { movements: true } } },
  });
  if (!existing) {
    throw new NotFoundError('Cash category not found.');
  }
  if (SYSTEM_CASH_CATEGORY_NAMES.has(existing.name)) {
    // Review 3.4 F2: deleting an (unused) system category would break every
    // subsequent automatic movement — recordTopUp 500s until re-seeded.
    throw new ConflictError('This is a system category required by automatic movements — it cannot be deleted.');
  }
  if (existing._count.movements > 0) {
    throw new ConflictError('This category has recorded movements — deactivate it instead of deleting it.');
  }

  try {
    await prisma.cashCategory.delete({ where: { id } });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError('This category has recorded movements — deactivate it instead of deleting it.');
    }
    if (isRecordNotFound(error)) {
      // Concurrent double-DELETE race (TD-1, AC 1): the other request won.
      throw new NotFoundError('Cash category not found.');
    }
    throw error;
  }
}

// --- Movements (Task 2, AC 2) -----------------------------------------------

export type CashMovementListItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  amountCents: number;
  /** `YYYY-MM-DD` — same date-only wire convention as `AccountStatementItem.effectiveDate`. */
  effectiveDate: string;
  description: string | null;
  actorEmail: string;
  createdAt: Date;
  /** Story 3.4, AD-3: set on a storno row, pointing at the movement it reverses — drives the "storno di ..." badge. */
  reversalOfId: string | null;
  /** True when this movement already has a linked storno (`@unique` — at most one) — hides the row's "Storna" action. */
  hasReversal: boolean;
  /** True for the automatic top-up twin (story 3.1, `accountMovementId` set) — the register never offers "Storna" on these (Dev Notes). */
  isAutomatic: boolean;
};

export type CashMovementListResult = PaginatedResult<CashMovementListItem>;

const CASH_MOVEMENT_SELECT = {
  id: true,
  categoryId: true,
  category: { select: { name: true } },
  amountCents: true,
  effectiveDate: true,
  description: true,
  actorUser: { select: { email: true } },
  createdAt: true,
  reversalOfId: true,
  reversal: { select: { id: true } },
  accountMovementId: true,
} as const;

type SelectedCashMovement = {
  id: string;
  categoryId: string;
  category: { name: string };
  amountCents: number;
  effectiveDate: Date;
  description: string | null;
  actorUser: { email: string };
  createdAt: Date;
  reversalOfId: string | null;
  reversal: { id: string } | null;
  accountMovementId: string | null;
};

/** `@db.Date` round-trips as a UTC-midnight `Date` — same formatting helper as `accounts.service.ts#toDateOnlyString`. */
function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `@db.Date` calendar-only "today" (server clock, UTC) — same helper as `accounts.service.ts#todayDateOnlyUtc`. */
function todayDateOnlyUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toMovementListItem(movement: SelectedCashMovement): CashMovementListItem {
  return {
    id: movement.id,
    categoryId: movement.categoryId,
    categoryName: movement.category.name,
    amountCents: movement.amountCents,
    effectiveDate: toDateOnlyString(movement.effectiveDate),
    description: movement.description,
    actorEmail: movement.actorUser.email,
    createdAt: movement.createdAt,
    reversalOfId: movement.reversalOfId,
    hasReversal: movement.reversal !== null,
    isAutomatic: movement.accountMovementId !== null,
  };
}

/**
 * Records a manual cash-register entry — an entrata (positive) or uscita
 * (negative), append-only (AD-3: no update/delete API). This is NOT how the
 * automatic top-up twin is created (that stays `recordTopUp`'s job, story
 * 3.1, linked via `accountMovementId`) — this function always leaves
 * `accountMovementId`/`reversalOfId` `null`. `finance.manage` (staff+admin)
 * — day-to-day cash operation, deliberately less restrictive than category
 * CRUD (`settings.manage`). The category must exist AND be active — same
 * `isActive` guard, and the same rationale, as `recordTopUp`'s lookup (Dev
 * Notes: a deactivated category must not silently accept new movements,
 * automatic or manual).
 */
export async function recordCashMovement(actor: Actor, input: RecordCashMovementInput): Promise<CashMovementListItem> {
  authorize(actor, 'finance.manage');

  const category = await prisma.cashCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, name: true, isActive: true },
  });
  if (!category) {
    throw new NotFoundError('Cash category not found.');
  }
  if (!category.isActive) {
    throw new ConflictError('This cash category is inactive — reactivate it before recording new movements.');
  }
  if (SYSTEM_CASH_CATEGORY_NAMES.has(category.name)) {
    // Review 3.4 F1: a manual entry in a system category would inflate a
    // cash line no account movement reflects (conto/cassa divergence) —
    // those lines are written exclusively by their automatic flow.
    throw new ConflictError('This category is reserved for automatic movements — record manual entries in another category.');
  }

  const movement = await prisma.cashMovement.create({
    data: {
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
      description: input.description ?? null,
      effectiveDate: new Date(input.effectiveDate),
      actorUserId: actor.userId,
    },
    select: CASH_MOVEMENT_SELECT,
  });

  return toMovementListItem(movement);
}

/**
 * Reverses (storna) a manual cash movement (AD-3, AC 2) — an independent
 * NEW `CashMovement` with the OPPOSITE signed amount, the SAME category
 * (even if it was meanwhile deactivated: the storno corrects existing
 * history, it is not a new operational entry), linked via `reversalOfId`
 * (`@unique` on the model — at most one storno per movement). Three things
 * make a movement NOT reversible here:
 *  - it is itself already a storno (`reversalOfId != null`) — reversing a
 *    reversal would make the register unreadable (Dev Notes: "uno storno
 *    NON è stornabile a sua volta");
 *  - it already has a linked storno (`hasReversal`) — pre-checked here and
 *    backstopped by the `@unique` constraint (`P2002` race → the same
 *    `ConflictError`);
 *  - it is the automatic twin of an account movement (`accountMovementId !=
 *    null` — a top-up, story 3.1, OR a package purchase, story 4.4: both
 *    create a linked `CashMovement`) — correcting those goes through the
 *    account rettifica (story 3.3) only, never the cash register directly
 *    (Dev Notes: otherwise conto and cassa diverge).
 * `effectiveDate` is always today (server clock, UTC calendar date) — same
 * choice as `recordAdjustment` (story 3.3): a storno is dated when it is
 * recorded, never backdated to the original's date. `paymentMethod` is
 * INHERITED from the original (review Billing-1 F1) — the treasury balance
 * it affects is the original's own cash/bank pot.
 */
export async function reverseCashMovement(actor: Actor, id: string, reason: string): Promise<CashMovementListItem> {
  authorize(actor, 'finance.manage');

  const original = await prisma.cashMovement.findUnique({
    where: { id },
    select: {
      id: true,
      categoryId: true,
      amountCents: true,
      paymentMethod: true,
      reversalOfId: true,
      accountMovementId: true,
      reversal: { select: { id: true } },
    },
  });
  if (!original) {
    throw new NotFoundError('Cash movement not found.');
  }
  if (original.accountMovementId !== null) {
    // Generalized wording (TD-1, AC 6): this guard already covered EVERY
    // automatic twin (top-up AND package-purchase, both set
    // `accountMovementId`) — the message used to say "top-up" specifically,
    // which was misleading for the other case.
    throw new ConflictError(
      'This movement is the automatic twin of an account movement — correct it via the account rettifica, not the cash register.',
    );
  }
  if (original.reversalOfId !== null) {
    throw new ConflictError('A reversal cannot itself be reversed.');
  }
  if (original.reversal) {
    throw new ConflictError('This movement has already been reversed.');
  }

  try {
    const reversal = await prisma.cashMovement.create({
      data: {
        categoryId: original.categoryId,
        amountCents: -original.amountCents,
        // Review Billing-1 F1: inherits the ORIGINAL's payment method — a
        // storno moves the SAME cash/bank pot the original entrata/uscita
        // did, so leaving it `null` used to make `unattributedCents` go
        // negative (the storno landed in the "no method at all" bucket
        // while the treasury running balance never subtracted it back out).
        paymentMethod: original.paymentMethod,
        description: reason,
        effectiveDate: todayDateOnlyUtc(),
        actorUserId: actor.userId,
        reversalOfId: original.id,
      },
      select: CASH_MOVEMENT_SELECT,
    });
    return toMovementListItem(reversal);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('This movement has already been reversed.');
    }
    throw error;
  }
}

/**
 * Reclassifies an UNATTRIBUTED historical cash movement (story Billing-2,
 * AC 3) — assigns a `paymentMethod` to a movement backfilled/recorded as
 * `null` (pre-Billing-1 manual entries, or a PPR landing fee recorded
 * without one, D2). `finance.manage` (staff+admin) — same day-to-day gate as
 * `recordCashMovement`/`reverseCashMovement`, not the stricter
 * `settings.manage` category CRUD uses. Deliberately scoped to movements
 * CURRENTLY unattributed (`paymentMethod === null`): every automatic twin
 * (top-up, package purchase) already inherits a non-null method at creation
 * time (Billing-1, AC 1/2) and a storno always inherits its original's
 * (Billing-1 review F1) — so in practice only the secchiello's own rows can
 * ever reach this guard successfully. Bulk reclassification is out of
 * scope (Dev Notes) — one movement at a time, by design.
 */
export async function reclassifyCashMovement(actor: Actor, id: string, input: ReclassifyCashMovementInput): Promise<CashMovementListItem> {
  authorize(actor, 'finance.manage');

  const existing = await prisma.cashMovement.findUnique({ where: { id }, select: { id: true, paymentMethod: true } });
  if (!existing) {
    throw new NotFoundError('Cash movement not found.');
  }
  if (existing.paymentMethod !== null) {
    throw new ConflictError('This movement already has a payment method — reclassification is only for unattributed movements.');
  }

  const movement = await prisma.cashMovement.update({
    where: { id },
    data: { paymentMethod: input.paymentMethod },
    select: CASH_MOVEMENT_SELECT,
  });
  return toMovementListItem(movement);
}

/**
 * Lists the cash register, paginated (AC 2) — ordered by `effectiveDate`
 * (data valuta), NOT `createdAt` (registrazione): a deliberately DIFFERENT
 * choice than the account statement (story 3.2, which orders by
 * `createdAt`) — the cash register is consulted per periodo contabile
 * (accounting period), where a movement dated the 3rd must sort with the
 * 3rd regardless of when it was keyed in. `createdAt`/`id` remain the
 * tie-break for same-day rows (same pattern as every other list in the
 * domain). `from`/`to` filter INCLUSIVELY on `effectiveDate` (both are
 * `@db.Date` UTC-midnight values, so a plain `gte`/`lte` on the parsed date
 * is exact, no timezone drift). `sign` filters directly on the amount's
 * sign (`amountCents > 0` / `< 0` — zero never occurs, the record schema
 * rejects it).
 */
export async function listCashMovements(actor: Actor, query: ListCashMovementsQuery): Promise<CashMovementListResult> {
  authorize(actor, 'finance.manage');

  const where = {
    ...(query.from || query.to
      ? {
          effectiveDate: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.sign === 'in' ? { amountCents: { gt: 0 } } : query.sign === 'out' ? { amountCents: { lt: 0 } } : {}),
  };

  // Interactive transaction (story TD-1, AC 3) — see
  // `people.service.ts#listPeople`'s doc-comment for the batch-vs-interactive
  // `pg` DeprecationWarning rationale.
  const [items, total] = await prisma.$transaction(async (tx) => {
    const items = await tx.cashMovement.findMany({
      select: CASH_MOVEMENT_SELECT,
      where,
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...paginationOffset(query),
    });
    const total = await tx.cashMovement.count({ where });
    return [items, total] as const;
  });

  return paginate(items.map(toMovementListItem), total, query);
}

// --- Financial report (story 3.5, Task 1, AC 1/2) --------------------------

export type CashReportCategoryTotal = {
  categoryId: string;
  categoryName: string;
  inCents: number;
  outCents: number;
  netCents: number;
};

export type CashReport = {
  from: string;
  to: string;
  totalInCents: number;
  totalOutCents: number;
  netCents: number;
  categories: CashReportCategoryTotal[];
  movementCount: number;
};

/** Raw shape of one row of the per-category aggregation query below. */
type RawCashReportCategoryRow = {
  categoryId: string;
  categoryName: string;
  movementCount: number;
  inCents: number;
  outCents: number;
};

/**
 * Period financial report (story 3.5, AC 1/2) — a read-only aggregation
 * over the cash ledger, NO new model/migration/write path. `from`/`to` are
 * inclusive on `effectiveDate`, same TZ-exact filter as `listCashMovements`
 * (both are `@db.Date`, so a plain `gte`/`lte` on the parsed date is exact —
 * story 3.4). Period presets (mese/trimestre/anno correnti) are UI-only
 * (`period-presets.ts`); this function only ever sees explicit bounds.
 *
 * Aggregation approach — ONE raw SQL query with conditional `SUM(CASE WHEN
 * ...)`, chosen over two separate Prisma `groupBy` calls (one filtered
 * `amountCents > 0`, one `< 0`): `groupBy` alone cannot join in the
 * category name, so two `groupBy`s would still need a follow-up category
 * lookup and a JS-side merge by `categoryId` — the raw query does the join,
 * the conditional sums AND the per-category movement count in a single
 * round trip. The template is parameterized (tagged template — the dates
 * are bound values, never string-interpolated into the SQL text), so there
 * is no injection risk. The `from`/`to` bounds are bound as TEXT and cast
 * `::date` in SQL (NOT as JS `Date` objects): `effectiveDate` is a Postgres
 * `date`, and a JS `Date` binds as `timestamptz`, so a `date >= timestamptz`
 * comparison would promote the column to the SESSION timezone and silently
 * drop rows dated exactly on `from` under any non-UTC session — a pure
 * `date >= date` comparison is timezone-independent and exactly inclusive,
 * matching how Prisma's typed `listCashMovements` filter behaves. Categories
 * with NO movements in the period are excluded "for free": the `JOIN` +
 * `WHERE` combination simply never produces a row for them (AC 1) — no
 * separate "has movements" check needed. Ordered by category NAME ascending (same convention as
 * `listCashCategories`), not by `netCents` — a stable, predictable order to
 * read top to bottom, not a "biggest number first" ranking.
 *
 * AD-3 + AC 2 invariant: `totalInCents`/`totalOutCents`/`movementCount` are
 * derived by summing the per-category rows in JS, NEVER a second,
 * independently-queried "total" — so `netCents === sum(categories[].netCents)`
 * holds BY CONSTRUCTION (both figures come from the very same
 * Postgres-computed per-category sums, there is nothing left to drift out
 * of sync). A storno pair fully inside the period cancels out in its
 * category's sums exactly as it does in the register (story 3.4, AD-3) —
 * this is correct accounting behavior, not a bug to "fix".
 */
export async function getCashReport(actor: Actor, query: CashReportQuery): Promise<CashReport> {
  authorize(actor, 'finance.manage');

  const rows = await prisma.$queryRaw<RawCashReportCategoryRow[]>`
    SELECT
      c.id AS "categoryId",
      c.name AS "categoryName",
      COUNT(cm.id)::int AS "movementCount",
      COALESCE(SUM(CASE WHEN cm."amountCents" > 0 THEN cm."amountCents" ELSE 0 END), 0)::int AS "inCents",
      COALESCE(SUM(CASE WHEN cm."amountCents" < 0 THEN cm."amountCents" ELSE 0 END), 0)::int AS "outCents"
    FROM "CashCategory" c
    JOIN "CashMovement" cm ON cm."categoryId" = c.id
    WHERE cm."effectiveDate" >= ${query.from}::date AND cm."effectiveDate" <= ${query.to}::date
    GROUP BY c.id, c.name
    ORDER BY c.name ASC
  `;

  const categories: CashReportCategoryTotal[] = rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    inCents: row.inCents,
    outCents: row.outCents,
    netCents: row.inCents + row.outCents,
  }));

  const totalInCents = categories.reduce((sum, category) => sum + category.inCents, 0);
  const totalOutCents = categories.reduce((sum, category) => sum + category.outCents, 0);
  const movementCount = rows.reduce((sum, row) => sum + row.movementCount, 0);

  return {
    from: query.from,
    to: query.to,
    totalInCents,
    totalOutCents,
    netCents: totalInCents + totalOutCents,
    categories,
    movementCount,
  };
}
