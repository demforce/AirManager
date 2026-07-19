import type { CreateExpiryTypeInput, ListExpiryTypesQuery, UpdateExpiryTypeInput } from '@/lib/schemas/expiry-types';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError } from './errors';

/** Prisma unique-constraint violation (same pattern as every other service). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Prisma FK-constraint violation. No FK references `ExpiryType` yet (story
 * 6.1) — this is the forward-looking backstop for story 6.2's
 * `Expiry.expiryTypeId` (`ON DELETE RESTRICT`): a scadenza recorded against
 * this very type between the pre-check (added in 6.2) and the `DELETE` must
 * still read as the same `Conflict`, never a raw 500 (same rationale as
 * `cash.service.ts#isForeignKeyViolation`).
 */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2003';
}

/**
 * Prisma "record not found" on write (story TD-1, AC 1) — the loser of a
 * concurrent double-DELETE race: both requests pass the `findUnique`
 * pre-check (the row still exists at that instant), one wins the `DELETE`,
 * and the other's `DELETE` then hits a row that is already gone. Maps to the
 * SAME 404 the pre-check itself would have produced, never a raw 500 (this
 * was the exact gap 6.1's review deferred as D1, for parity with
 * `cash.service.ts` — now hardened uniformly).
 */
function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2025';
}

export type ExpiryTypeListItem = {
  id: string;
  name: string;
  scope: 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL';
  isActive: boolean;
  /** Whether an expired `Expiry` of this type blocks a new booking (epic 7, story 7.4; FR-21). */
  blocksBooking: boolean;
  /** Validity window in months (story 12.11, ratifica utente 2) — `null`/`0` = no expiry. */
  validityMonths: number | null;
  createdAt: Date;
};

const EXPIRY_TYPE_SELECT = {
  id: true,
  name: true,
  scope: true,
  isActive: true,
  blocksBooking: true,
  validityMonths: true,
  createdAt: true,
} as const;

/**
 * Lists the expiry-type catalogue (AC 1). Read access is `expiries.manage`
 * (admin AND staff — asymmetric with the write side below, Dev Notes): staff
 * will register scadenze from this catalogue in story 6.2 and must see it;
 * a pilot/student/instructor gets nothing here (they will see their OWN
 * scadenze via `self.read` in 6.2/6.4, never this admin/staff catalogue).
 * Default active-only, `includeInactive` for the management view. Ordered by
 * name; defensively capped at `take: 500` (small, admin-managed catalogue,
 * same choice as `listCashCategories`/`listPackageTypes`).
 */
export async function listExpiryTypes(actor: Actor, query: ListExpiryTypesQuery): Promise<ExpiryTypeListItem[]> {
  authorize(actor, 'expiries.manage');

  return prisma.expiryType.findMany({
    where: query.includeInactive ? undefined : { isActive: true },
    select: EXPIRY_TYPE_SELECT,
    orderBy: { name: 'asc' },
    take: 500,
  });
}

/**
 * Creates an expiry type (AC 1/2). `settings.manage` (admin) only — catalogue
 * configuration, deliberately stricter than the `expiries.manage` read above
 * (same split as `createCashCategory`/`createPackageType`). Name uniqueness:
 * `trim()` + pre-check `findFirst` + `try/catch` `P2002` backstop (the
 * check-then-write race, same pattern as every other catalogue create).
 */
export async function createExpiryType(actor: Actor, input: CreateExpiryTypeInput): Promise<ExpiryTypeListItem> {
  authorize(actor, 'settings.manage');

  const name = input.name.trim();

  const existing = await prisma.expiryType.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    throw new ConflictError('An expiry type with this name already exists.');
  }

  try {
    return await prisma.expiryType.create({
      data: { name, scope: input.scope, blocksBooking: input.blocksBooking, validityMonths: input.validityMonths },
      select: EXPIRY_TYPE_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An expiry type with this name already exists.');
    }
    throw error;
  }
}

/**
 * Partially updates an expiry type (AC 1/2). `settings.manage` only. Every
 * field is optional; `isActive` toggling is a plain field on this same PATCH
 * — there is no dedicated deactivate/reactivate endpoint (follows
 * `updatePackageType`'s pattern, NOT `deactivateCashCategory`'s, per Dev
 * Notes). 404 on an unknown id BEFORE any other check (never leaks whether a
 * name collision exists on a resource the actor cannot even address).
 * Editing a type already in use is deliberately LEGAL (see `ExpiryType`
 * doc-comment: a registered `Expiry`, story 6.2, references this row by id
 * and never snapshots the name) — there is no "in use" guard here, only the
 * 404/409 shape checks below.
 */
export async function updateExpiryType(actor: Actor, id: string, input: UpdateExpiryTypeInput): Promise<ExpiryTypeListItem> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.expiryType.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new NotFoundError('Expiry type not found.');
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined) {
    const duplicate = await prisma.expiryType.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
    if (duplicate) {
      throw new ConflictError('An expiry type with this name already exists.');
    }
  }

  try {
    return await prisma.expiryType.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.blocksBooking !== undefined ? { blocksBooking: input.blocksBooking } : {}),
        ...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths } : {}),
      },
      select: EXPIRY_TYPE_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An expiry type with this name already exists.');
    }
    throw error;
  }
}

/**
 * Deletes an expiry type — ONLY when it has never been used (AC 2).
 * `settings.manage` only. Story 6.2 completes the contract this story's
 * doc-comment promised: `Expiry.expiryTypeId` now exists with `ON DELETE
 * RESTRICT`, so this adds the explicit `_count` pre-check (409 with a clear
 * "in use" message) BEFORE the delete — the `P2003` catch remains as the
 * concurrency backstop (a scadenza registered against this very type
 * between the pre-check and the `DELETE` still reads as the same
 * `Conflict`, never a raw 500).
 */
export async function deleteExpiryType(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'settings.manage');

  const existing = await prisma.expiryType.findUnique({
    where: { id },
    select: { id: true, _count: { select: { expiries: true } } },
  });
  if (!existing) {
    throw new NotFoundError('Expiry type not found.');
  }
  if (existing._count.expiries > 0) {
    throw new ConflictError('This expiry type is in use — deactivate it instead.');
  }

  try {
    await prisma.expiryType.delete({ where: { id } });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError('This expiry type is in use — deactivate it instead.');
    }
    if (isRecordNotFound(error)) {
      // Concurrent double-DELETE race (TD-1, AC 1): the other request won.
      throw new NotFoundError('Expiry type not found.');
    }
    throw error;
  }
}
