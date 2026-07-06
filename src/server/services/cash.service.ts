import { paginate, paginationOffset, type PaginatedResult } from '@/lib/api/pagination';
import type { ListCashCategoriesQuery, ListCashMovementsQuery, RecordCashMovementInput } from '@/lib/schemas/cash';
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

// --- Categories (Task 1, AC 1) ---------------------------------------------

/**
 * Categories owned by automated flows — currently only "Ricariche", the
 * top-up twin's category (story 3.1, `accounts.service.ts`'s
 * `TOP_UP_CASH_CATEGORY_NAME`). Guarded here (review 3.4 F1/F2): a MANUAL
 * movement in one of these would inflate a cash line no account reflects
 * (the exact conto/cassa divergence the storno rules defend against), and
 * DELETING one — legal per AC 1 while unused — would 500 every subsequent
 * top-up until the seed is re-run. Deactivation stays allowed: it fails
 * loudly in `recordTopUp` by design (story 3.4 Task 1).
 */
const SYSTEM_CASH_CATEGORY_NAMES = new Set(['Ricariche']);

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
 *  - it is the automatic twin of a top-up (`accountMovementId != null`) —
 *    correcting those goes through the account rettifica (story 3.3) only,
 *    never the cash register directly (Dev Notes: otherwise conto and
 *    cassa diverge).
 * `effectiveDate` is always today (server clock, UTC calendar date) — same
 * choice as `recordAdjustment` (story 3.3): a storno is dated when it is
 * recorded, never backdated to the original's date.
 */
export async function reverseCashMovement(actor: Actor, id: string, reason: string): Promise<CashMovementListItem> {
  authorize(actor, 'finance.manage');

  const original = await prisma.cashMovement.findUnique({
    where: { id },
    select: {
      id: true,
      categoryId: true,
      amountCents: true,
      reversalOfId: true,
      accountMovementId: true,
      reversal: { select: { id: true } },
    },
  });
  if (!original) {
    throw new NotFoundError('Cash movement not found.');
  }
  if (original.accountMovementId !== null) {
    throw new ConflictError('This is an automatic top-up movement — correct it via the account rettifica, not the cash register.');
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

  const [items, total] = await prisma.$transaction([
    prisma.cashMovement.findMany({
      select: CASH_MOVEMENT_SELECT,
      where,
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      ...paginationOffset(query),
    }),
    prisma.cashMovement.count({ where }),
  ]);

  return paginate(items.map(toMovementListItem), total, query);
}
