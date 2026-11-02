import type { Prisma } from '@/generated/prisma/client';
import type { CreateExpiryTypeInput, ListExpiryTypesQuery, UpdateExpiryTypeInput } from '@/lib/schemas/expiry-types';
import { authorize, type Actor } from '@/server/auth/rbac';
import { prisma } from '@/server/db/prisma';
import { ConflictError, NotFoundError, ValidationError } from './errors';

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
  /** RATING / MEDICAL (story 13.1, AC 1, R-13.1-a) / MEMBERSHIP (story 19.7a, R-19-k). */
  kind: 'RATING' | 'MEDICAL' | 'MEMBERSHIP';
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
  kind: true,
  isActive: true,
  blocksBooking: true,
  validityMonths: true,
  createdAt: true,
} as const;

type ExpiryScopeValue = ExpiryTypeListItem['scope'];

/**
 * Story 19.8 (AD-5): every 409 of the catalogue keeps the generic `CONFLICT`
 * code (contract) and says WHICH rule it is in `details.reason` — additive on
 * the single routes, read per row by the Impostazioni composite save.
 */
const NAME_TAKEN_MESSAGE = 'An expiry type with this name already exists.';
const IN_USE_MESSAGE = 'This expiry type is in use — deactivate it instead.';

/**
 * Story 19.7a (D-3, R-19-j): a MEDICAL type has no scope and always counts
 * toward the medical requirement — `scope = ALL` and `blocksBooking = true`
 * are an invariant of the data, kept here on every write. A plain check
 * inside create/update (story 19.8 extracts these into its transactional
 * cores, so the composite PATCH rejects with the same code).
 */
function assertMedicalFields(kind: ExpiryTypeListItem['kind'], scope: ExpiryScopeValue, blocksBooking: boolean): void {
  if (kind === 'MEDICAL' && (scope !== 'ALL' || !blocksBooking)) {
    throw new ValidationError(
      'A medical visit has no scope and always counts toward the medical requirement: scope must be ALL and blocksBooking true.',
      undefined,
      'MEDICAL_TYPE_FIELDS',
    );
  }
}

/**
 * Story 19.7a (D-1, AD-4): the MEMBERSHIP type is a system type, upserted by
 * name by `membership.service.ts` — no PATCH (not even `isActive`) and no
 * DELETE reaches it. Checked right after the 404, before every other rule.
 */
function assertNotMembership(kind: ExpiryTypeListItem['kind']): void {
  if (kind === 'MEMBERSHIP') {
    throw new ConflictError('The membership-fee type is a system type and cannot be edited or deleted.', undefined, 'MEMBERSHIP_TYPE_LOCKED');
  }
}

/**
 * Lists the expiry-type catalogue (AC 1). Read access is `expiries.manage`
 * (admin AND staff — asymmetric with the write side below, Dev Notes): staff
 * will register scadenze from this catalogue in story 6.2 and must see it;
 * a pilot/student/instructor gets nothing here (they will see their OWN
 * scadenze via `self.read` in 6.2/6.4, never this admin/staff catalogue).
 * Default active-only, `includeInactive` for the management view. `kind`
 * (story 13.1, AC 2) is an OPTIONAL filter — omitted, every kind is
 * returned (retro-compatible with every pre-13.1 consumer). Ordered by
 * name; defensively capped at `take: 500` (small, admin-managed catalogue,
 * same choice as `listCashCategories`/`listPackageTypes`).
 */
export async function listExpiryTypes(actor: Actor, query: ListExpiryTypesQuery): Promise<ExpiryTypeListItem[]> {
  authorize(actor, 'expiries.manage');

  // `undefined` (never `{}`) when neither filter applies — same "no WHERE at
  // all" shape the pre-13.1 code produced for `includeInactive: true`.
  const filters: { isActive?: true; kind?: ListExpiryTypesQuery['kind'] } = {};
  if (!query.includeInactive) filters.isActive = true;
  if (query.kind) filters.kind = query.kind;
  const where = Object.keys(filters).length > 0 ? filters : undefined;

  return prisma.expiryType.findMany({
    where,
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
 *
 * Story 19.7a (AD-7): `scope`/`blocksBooking` are resolved by `kind` — a
 * MEDICAL type takes `ALL`/`true` when they are omitted and is a 422
 * `MEDICAL_TYPE_FIELDS` when they are explicit and different; a RATING takes
 * `ALL`/`false` when they are omitted. `kind: MEMBERSHIP` never reaches this
 * function (Zod's `expiryTypeKindInputSchema`).
 */
export async function createExpiryType(actor: Actor, input: CreateExpiryTypeInput): Promise<ExpiryTypeListItem> {
  authorize(actor, 'settings.manage');

  return createExpiryTypeCore(prisma, input);
}

/** The rules of {@link createExpiryType} on the caller's client, no `authorize` (story 19.8, AD-3). */
export async function createExpiryTypeCore(tx: Prisma.TransactionClient, input: CreateExpiryTypeInput): Promise<ExpiryTypeListItem> {
  const scope = input.scope ?? 'ALL';
  const blocksBooking = input.blocksBooking ?? input.kind === 'MEDICAL';
  assertMedicalFields(input.kind, scope, blocksBooking);

  const name = input.name.trim();

  const existing = await tx.expiryType.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    throw new ConflictError(NAME_TAKEN_MESSAGE, { reason: 'NAME_TAKEN' });
  }

  try {
    return await tx.expiryType.create({
      data: { name, scope, kind: input.kind, blocksBooking, validityMonths: input.validityMonths },
      select: EXPIRY_TYPE_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(NAME_TAKEN_MESSAGE, { reason: 'NAME_TAKEN' });
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
 * 404/409 shape checks below. `kind` (story 13.1 review F3) is patchable
 * like every other field — a type misclassified by the backfill migration's
 * name match is recoverable here instead of only by delete + re-create.
 *
 * Story 19.7a (AD-7), in this order after the 404: the MEMBERSHIP type is a
 * 409 `MEMBERSHIP_TYPE_LOCKED`; then the RESULTING state (the row merged
 * with the patch) of a MEDICAL type must keep `ALL`/`true`, else 422
 * `MEDICAL_TYPE_FIELDS` — which also covers a RATING moved to MEDICAL
 * without fixing its scope/flag. The row is read under a `FOR UPDATE` lock,
 * in the transaction that writes it (review 19.7a F3): two PATCHes legal one
 * at a time — `{ kind: MEDICAL }` and `{ scope: PILOTS }` — used to both pass
 * against the same stale read and leave a MEDICAL/PILOTS row; now the second
 * one validates against the first one's committed result.
 */
export async function updateExpiryType(actor: Actor, id: string, input: UpdateExpiryTypeInput): Promise<ExpiryTypeListItem> {
  authorize(actor, 'settings.manage');

  return prisma.$transaction((tx) => updateExpiryTypeCore(tx, id, input));
}

/** The rules of {@link updateExpiryType} on the caller's TRANSACTION (the row lock needs one), no `authorize` (story 19.8, AD-3). */
export async function updateExpiryTypeCore(tx: Prisma.TransactionClient, id: string, input: UpdateExpiryTypeInput): Promise<ExpiryTypeListItem> {
  await tx.$queryRaw`SELECT "id" FROM "ExpiryType" WHERE "id" = ${id} FOR UPDATE`;
  const existing = await tx.expiryType.findUnique({ where: { id }, select: { id: true, kind: true, scope: true, blocksBooking: true } });
  if (!existing) {
    throw new NotFoundError('Expiry type not found.');
  }
  assertNotMembership(existing.kind);
  assertMedicalFields(input.kind ?? existing.kind, input.scope ?? existing.scope, input.blocksBooking ?? existing.blocksBooking);

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined) {
    const duplicate = await tx.expiryType.findFirst({ where: { name, NOT: { id } }, select: { id: true } });
    if (duplicate) {
      throw new ConflictError(NAME_TAKEN_MESSAGE, { reason: 'NAME_TAKEN' });
    }
  }

  try {
    return await tx.expiryType.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.blocksBooking !== undefined ? { blocksBooking: input.blocksBooking } : {}),
        ...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths } : {}),
      },
      select: EXPIRY_TYPE_SELECT,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(NAME_TAKEN_MESSAGE, { reason: 'NAME_TAKEN' });
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
 * `Conflict`, never a raw 500). The MEMBERSHIP type (story 19.7a) is a 409
 * `MEMBERSHIP_TYPE_LOCKED` before the "in use" check.
 */
export async function deleteExpiryType(actor: Actor, id: string): Promise<void> {
  authorize(actor, 'settings.manage');

  await deleteExpiryTypeCore(prisma, id, { missingOk: false });
}

/**
 * The rules of {@link deleteExpiryType} on the caller's client, no
 * `authorize` (story 19.8, AD-3). `missingOk`: the composite save treats a
 * type that is already gone as done (a no-op), the single route keeps its 404.
 */
export async function deleteExpiryTypeCore(tx: Prisma.TransactionClient, id: string, options: { missingOk: boolean }): Promise<void> {
  const existing = await tx.expiryType.findUnique({
    where: { id },
    select: { id: true, kind: true, _count: { select: { expiries: true } } },
  });
  if (!existing) {
    if (options.missingOk) return;
    throw new NotFoundError('Expiry type not found.');
  }
  assertNotMembership(existing.kind);
  if (existing._count.expiries > 0) {
    throw new ConflictError(IN_USE_MESSAGE, { reason: 'IN_USE' });
  }

  try {
    await tx.expiryType.delete({ where: { id } });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ConflictError(IN_USE_MESSAGE, { reason: 'IN_USE' });
    }
    if (isRecordNotFound(error)) {
      // Concurrent double-DELETE race (TD-1, AC 1): the other request won.
      if (options.missingOk) return;
      throw new NotFoundError('Expiry type not found.');
    }
    throw error;
  }
}
