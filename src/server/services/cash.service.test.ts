import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cashReportQuerySchema, recordCashMovementSchema, reverseCashMovementSchema } from '@/lib/schemas/cash';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    cashCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    cashMovement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  createCashCategory,
  deactivateCashCategory,
  deleteCashCategory,
  getCashReport,
  listCashCategories,
  listCashMovements,
  reactivateCashCategory,
  recordCashMovement,
  renameCashCategory,
  reverseCashMovement,
} = await import('./cash.service');
const { ConflictError, NotFoundError } = await import('./errors');

const categoryFindManyMock = vi.mocked(prisma.cashCategory.findMany);
const categoryFindUniqueMock = vi.mocked(prisma.cashCategory.findUnique);
const categoryCreateMock = vi.mocked(prisma.cashCategory.create);
const categoryUpdateMock = vi.mocked(prisma.cashCategory.update);
const categoryUpdateManyMock = vi.mocked(prisma.cashCategory.updateMany);
const categoryDeleteMock = vi.mocked(prisma.cashCategory.delete);
const movementCreateMock = vi.mocked(prisma.cashMovement.create);
const movementFindUniqueMock = vi.mocked(prisma.cashMovement.findUnique);
const movementFindManyMock = vi.mocked(prisma.cashMovement.findMany);
const movementCountMock = vi.mocked(prisma.cashMovement.count);
const transactionMock = vi.mocked(prisma.$transaction);
const queryRawMock = vi.mocked(prisma.$queryRaw);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as accounts.service.test.ts).
type Fixture = Record<string, unknown> | null;
const categoryFindMany = categoryFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const categoryFindUnique = categoryFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const categoryCreate = categoryCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const categoryUpdate = categoryUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const categoryUpdateMany = categoryUpdateManyMock as unknown as { mockResolvedValue: (v: { count: number }) => void };
const categoryDelete = categoryDeleteMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const movementCreate = movementCreateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const movementFindUnique = movementFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const movementFindMany = movementFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const movementCount = movementCountMock as unknown as { mockResolvedValue: (v: number) => void };

/** Same batch/interactive `$transaction` stand-in as `accounts.service.test.ts`. */
const transaction = transactionMock as unknown as { mockImplementation: (fn: (arg: unknown) => unknown) => void };
function mockTransaction(): void {
  transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
}

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

/** A Prisma error shape with a `.code`, same helper style as other `*.service.test.ts` files. */
function prismaError(code: string): unknown {
  return { code };
}

describe('cash.service (story 3.4 — cash-register categories and manual movements, AD-3)', () => {
  beforeEach(() => {
    categoryFindManyMock.mockReset();
    categoryFindUniqueMock.mockReset();
    categoryCreateMock.mockReset();
    categoryUpdateMock.mockReset();
    categoryUpdateManyMock.mockReset();
    categoryDeleteMock.mockReset();
    movementCreateMock.mockReset();
    movementFindUniqueMock.mockReset();
    movementFindManyMock.mockReset();
    movementCountMock.mockReset();
    transactionMock.mockReset();
    queryRawMock.mockReset();
    mockTransaction();
  });

  describe('listCashCategories (Task 1, AC 1)', () => {
    it('rejects a pilot (finance.manage required)', async () => {
      await expect(listCashCategories(pilotActor(), { includeInactive: false })).rejects.toThrow(ForbiddenError);
      expect(categoryFindManyMock).not.toHaveBeenCalled();
    });

    it('a staff actor (finance.manage) can list — active only by default', async () => {
      categoryFindMany.mockResolvedValue([{ id: 'cat_1', name: 'Carburante', isActive: true, _count: { movements: 3 } }]);

      const result = await listCashCategories(staffActor(), { includeInactive: false });

      expect(categoryFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      );
      expect(result).toEqual([{ id: 'cat_1', name: 'Carburante', isActive: true, movementCount: 3, isSystem: false }]);
    });

    it('includeInactive: true also lists deactivated categories (admin management page)', async () => {
      categoryFindMany.mockResolvedValue([
        { id: 'cat_1', name: 'Carburante', isActive: true, _count: { movements: 3 } },
        { id: 'cat_2', name: 'Obsoleta', isActive: false, _count: { movements: 0 } },
      ]);

      const result = await listCashCategories(staffActor(), { includeInactive: true });

      expect(categoryFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ id: 'cat_2', name: 'Obsoleta', isActive: false, movementCount: 0, isSystem: false });
    });
  });

  describe('createCashCategory (Task 1, AC 1 — settings.manage only)', () => {
    it('rejects a staff actor (finance.manage is not enough — settings.manage required)', async () => {
      await expect(createCashCategory(staffActor(), { name: 'Nuova' })).rejects.toThrow(ForbiddenError);
      expect(categoryCreateMock).not.toHaveBeenCalled();
    });

    it('an admin (settings.manage) creates a category', async () => {
      categoryCreate.mockResolvedValue({ id: 'cat_new', name: 'Nuova', isActive: true });

      const result = await createCashCategory(adminActor(), { name: 'Nuova' });

      expect(categoryCreateMock).toHaveBeenCalledWith({ data: { name: 'Nuova' }, select: { id: true, name: true, isActive: true } });
      expect(result).toEqual({ id: 'cat_new', name: 'Nuova', isActive: true, movementCount: 0, isSystem: false });
    });

    it('maps a duplicate name (P2002) to ConflictError', async () => {
      categoryCreate.mockRejectedValue(prismaError('P2002'));

      await expect(createCashCategory(adminActor(), { name: 'Carburante' })).rejects.toThrow(ConflictError);
    });
  });

  describe('renameCashCategory (Task 1, AC 1)', () => {
    it('rejects a staff actor (settings.manage required)', async () => {
      await expect(renameCashCategory(staffActor(), 'cat_1', { name: 'Nuovo nome' })).rejects.toThrow(ForbiddenError);
      expect(categoryFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown category', async () => {
      categoryFindUnique.mockResolvedValue(null);

      await expect(renameCashCategory(adminActor(), 'missing', { name: 'X' })).rejects.toThrow(NotFoundError);
      expect(categoryUpdateMock).not.toHaveBeenCalled();
    });

    it('a system category ("Ricariche") is never renameable — top-ups resolve it by name (review 3.4 F2)', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_sys', name: 'Ricariche' });

      await expect(renameCashCategory(adminActor(), 'cat_sys', { name: 'Altro nome' })).rejects.toThrow(ConflictError);
      expect(categoryUpdateMock).not.toHaveBeenCalled();
    });

    it('renames the category', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1' });
      categoryUpdate.mockResolvedValue({ id: 'cat_1', name: 'Rinominata', isActive: true, _count: { movements: 2 } });

      const result = await renameCashCategory(adminActor(), 'cat_1', { name: 'Rinominata' });

      expect(categoryUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cat_1' }, data: { name: 'Rinominata' } }),
      );
      expect(result).toEqual({ id: 'cat_1', name: 'Rinominata', isActive: true, movementCount: 2, isSystem: false });
    });

    it('maps a duplicate name (P2002) to ConflictError', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1' });
      categoryUpdate.mockRejectedValue(prismaError('P2002'));

      await expect(renameCashCategory(adminActor(), 'cat_1', { name: 'Carburante' })).rejects.toThrow(ConflictError);
    });
  });

  describe('deactivateCashCategory / reactivateCashCategory (Task 1, AC 1 — atomic guard, review 2.2 F1 pattern)', () => {
    it('rejects a staff actor (settings.manage required)', async () => {
      await expect(deactivateCashCategory(staffActor(), 'cat_1')).rejects.toThrow(ForbiddenError);
      await expect(reactivateCashCategory(staffActor(), 'cat_1')).rejects.toThrow(ForbiddenError);
    });

    it('deactivateCashCategory: NotFoundError for an unknown category', async () => {
      categoryFindUnique.mockResolvedValue(null);

      await expect(deactivateCashCategory(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(categoryUpdateManyMock).not.toHaveBeenCalled();
    });

    it('deactivateCashCategory: guarded UPDATE — count 0 (already inactive) → ConflictError', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1' });
      categoryUpdateMany.mockResolvedValue({ count: 0 });

      await expect(deactivateCashCategory(adminActor(), 'cat_1')).rejects.toThrow(ConflictError);
      expect(categoryUpdateManyMock).toHaveBeenCalledWith({ where: { id: 'cat_1', isActive: true }, data: { isActive: false } });
    });

    it('deactivateCashCategory: succeeds when active', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1' });
      categoryUpdateMany.mockResolvedValue({ count: 1 });

      await expect(deactivateCashCategory(adminActor(), 'cat_1')).resolves.toBeUndefined();
    });

    it('reactivateCashCategory: guarded UPDATE — count 0 (already active) → ConflictError', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1' });
      categoryUpdateMany.mockResolvedValue({ count: 0 });

      await expect(reactivateCashCategory(adminActor(), 'cat_1')).rejects.toThrow(ConflictError);
      expect(categoryUpdateManyMock).toHaveBeenCalledWith({ where: { id: 'cat_1', isActive: false }, data: { isActive: true } });
    });

    it('reactivateCashCategory: succeeds when inactive', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1' });
      categoryUpdateMany.mockResolvedValue({ count: 1 });

      await expect(reactivateCashCategory(adminActor(), 'cat_1')).resolves.toBeUndefined();
    });
  });

  describe('deleteCashCategory (Task 1, AC 1 — delete only if unused, FK RESTRICT backstop)', () => {
    it('rejects a staff actor (settings.manage required)', async () => {
      await expect(deleteCashCategory(staffActor(), 'cat_1')).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError for an unknown category', async () => {
      categoryFindUnique.mockResolvedValue(null);

      await expect(deleteCashCategory(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(categoryDeleteMock).not.toHaveBeenCalled();
    });

    it('a category with movements → ConflictError (deactivate instead), DELETE never attempted', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', _count: { movements: 5 } });

      await expect(deleteCashCategory(adminActor(), 'cat_1')).rejects.toThrow(ConflictError);
      expect(categoryDeleteMock).not.toHaveBeenCalled();
    });

    it('an unused category is deleted', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', _count: { movements: 0 } });
      categoryDelete.mockResolvedValue({ id: 'cat_1' });

      await expect(deleteCashCategory(adminActor(), 'cat_1')).resolves.toBeUndefined();
      expect(categoryDeleteMock).toHaveBeenCalledWith({ where: { id: 'cat_1' } });
    });

    it('a concurrent race (P2003 FK RESTRICT) is mapped to ConflictError, not a raw 500', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', _count: { movements: 0 } });
      categoryDelete.mockRejectedValue(prismaError('P2003'));

      await expect(deleteCashCategory(adminActor(), 'cat_1')).rejects.toThrow(ConflictError);
    });

    it('a concurrent double-DELETE race (P2025 — the loser of the race) is mapped to NotFoundError, not a raw 500 (TD-1, AC 1)', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', _count: { movements: 0 } });
      categoryDelete.mockRejectedValue(prismaError('P2025'));

      await expect(deleteCashCategory(adminActor(), 'cat_1')).rejects.toThrow(NotFoundError);
    });

    it('a system category ("Ricariche") is never deletable, even when unused (review 3.4 F2)', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_sys', name: 'Ricariche', _count: { movements: 0 } });

      await expect(deleteCashCategory(adminActor(), 'cat_sys')).rejects.toThrow(ConflictError);
      expect(categoryDeleteMock).not.toHaveBeenCalled();
    });
  });

  describe('recordCashMovement (Task 2, AC 2)', () => {
    it('rejects a pilot (finance.manage required)', async () => {
      await expect(
        recordCashMovement(pilotActor(), { categoryId: 'cat_1', amountCents: 5000, effectiveDate: '2026-07-01', description: null }),
      ).rejects.toThrow(ForbiddenError);
      expect(categoryFindUniqueMock).not.toHaveBeenCalled();
    });

    it('rejects a manual movement in a system category ("Ricariche") — review 3.4 F1', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_sys', name: 'Ricariche', isActive: true });

      await expect(
        recordCashMovement(staffActor(), { categoryId: 'cat_sys', amountCents: 5000, effectiveDate: '2026-07-01', description: null }),
      ).rejects.toThrow(ConflictError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown category', async () => {
      categoryFindUnique.mockResolvedValue(null);

      await expect(
        recordCashMovement(staffActor(), { categoryId: 'missing', amountCents: 5000, effectiveDate: '2026-07-01', description: null }),
      ).rejects.toThrow(NotFoundError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError for an inactive category (Dev Notes: no new movements, manual or automatic)', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', isActive: false });

      await expect(
        recordCashMovement(staffActor(), { categoryId: 'cat_1', amountCents: 5000, effectiveDate: '2026-07-01', description: null }),
      ).rejects.toThrow(ConflictError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('records an entrata (positive) with the actor and normalizes a null description', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', isActive: true });
      movementCreate.mockResolvedValue({
        id: 'move_1',
        categoryId: 'cat_1',
        category: { name: 'PPR' },
        amountCents: 5000,
        effectiveDate: new Date('2026-07-01T00:00:00.000Z'),
        description: null,
        actorUser: { email: 'staff@airmanager.local' },
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        reversalOfId: null,
        reversal: null,
        accountMovementId: null,
      });

      const result = await recordCashMovement(staffActor(), {
        categoryId: 'cat_1',
        amountCents: 5000,
        effectiveDate: '2026-07-01',
        description: null,
      });

      expect(movementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat_1',
            amountCents: 5000,
            description: null,
            effectiveDate: new Date('2026-07-01'),
            actorUserId: 'staff_1',
          }),
        }),
      );
      expect(result).toEqual({
        id: 'move_1',
        categoryId: 'cat_1',
        categoryName: 'PPR',
        amountCents: 5000,
        effectiveDate: '2026-07-01',
        description: null,
        actorEmail: 'staff@airmanager.local',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        reversalOfId: null,
        hasReversal: false,
        isAutomatic: false,
      });
    });

    it('records a uscita (negative amount) as-is (signed, AD-2)', async () => {
      categoryFindUnique.mockResolvedValue({ id: 'cat_1', isActive: true });
      movementCreate.mockResolvedValue({
        id: 'move_2',
        categoryId: 'cat_1',
        category: { name: 'Carburante' },
        amountCents: -3000,
        effectiveDate: new Date('2026-07-01T00:00:00.000Z'),
        description: 'Rifornimento',
        actorUser: { email: 'staff@airmanager.local' },
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        reversalOfId: null,
        reversal: null,
        accountMovementId: null,
      });

      const result = await recordCashMovement(staffActor(), {
        categoryId: 'cat_1',
        amountCents: -3000,
        effectiveDate: '2026-07-01',
        description: 'Rifornimento',
      });

      expect(result.amountCents).toBe(-3000);
    });
  });

  describe('reverseCashMovement (Task 2, AC 2 — AD-3 storno)', () => {
    it('rejects a pilot (finance.manage required)', async () => {
      await expect(reverseCashMovement(pilotActor(), 'move_1', 'Errore')).rejects.toThrow(ForbiddenError);
      expect(movementFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown movement', async () => {
      movementFindUnique.mockResolvedValue(null);

      await expect(reverseCashMovement(staffActor(), 'missing', 'Errore')).rejects.toThrow(NotFoundError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('rejects reversing the automatic top-up twin (accountMovementId set) — correct via the account rettifica instead', async () => {
      movementFindUnique.mockResolvedValue({
        id: 'move_1',
        categoryId: 'cat_ricariche',
        amountCents: 10000,
        reversalOfId: null,
        accountMovementId: 'account_movement_1',
        reversal: null,
      });

      await expect(reverseCashMovement(staffActor(), 'move_1', 'Errore')).rejects.toThrow(ConflictError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('rejects reversing a movement that is itself already a reversal (no storno of a storno)', async () => {
      movementFindUnique.mockResolvedValue({
        id: 'move_reversal',
        categoryId: 'cat_1',
        amountCents: -5000,
        reversalOfId: 'move_original',
        accountMovementId: null,
        reversal: null,
      });

      await expect(reverseCashMovement(staffActor(), 'move_reversal', 'Errore')).rejects.toThrow(ConflictError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('rejects a movement that already has a linked reversal (pre-check, @unique)', async () => {
      movementFindUnique.mockResolvedValue({
        id: 'move_1',
        categoryId: 'cat_1',
        amountCents: 5000,
        reversalOfId: null,
        accountMovementId: null,
        reversal: { id: 'move_existing_reversal' },
      });

      await expect(reverseCashMovement(staffActor(), 'move_1', 'Errore')).rejects.toThrow(ConflictError);
      expect(movementCreateMock).not.toHaveBeenCalled();
    });

    it('creates the opposite-signed reversal, same category, linked via reversalOfId, dated today', async () => {
      movementFindUnique.mockResolvedValue({
        id: 'move_1',
        categoryId: 'cat_1',
        amountCents: 5000,
        reversalOfId: null,
        accountMovementId: null,
        reversal: null,
      });
      movementCreate.mockResolvedValue({
        id: 'move_reversal',
        categoryId: 'cat_1',
        category: { name: 'PPR' },
        amountCents: -5000,
        effectiveDate: new Date(),
        description: 'Importo errato',
        actorUser: { email: 'staff@airmanager.local' },
        createdAt: new Date(),
        reversalOfId: 'move_1',
        reversal: null,
        accountMovementId: null,
      });

      const result = await reverseCashMovement(staffActor(), 'move_1', 'Importo errato');

      expect(movementCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat_1',
            amountCents: -5000,
            description: 'Importo errato',
            actorUserId: 'staff_1',
            reversalOfId: 'move_1',
          }),
        }),
      );
      expect(result.reversalOfId).toBe('move_1');
      expect(result.amountCents).toBe(-5000);
    });

    it('reverses an inactive category’s movement too (storno corrects existing history even after deactivation)', async () => {
      movementFindUnique.mockResolvedValue({
        id: 'move_1',
        categoryId: 'cat_inactive',
        amountCents: 2000,
        reversalOfId: null,
        accountMovementId: null,
        reversal: null,
      });
      movementCreate.mockResolvedValue({
        id: 'move_reversal',
        categoryId: 'cat_inactive',
        category: { name: 'Obsoleta' },
        amountCents: -2000,
        effectiveDate: new Date(),
        description: 'Storno',
        actorUser: { email: 'staff@airmanager.local' },
        createdAt: new Date(),
        reversalOfId: 'move_1',
        reversal: null,
        accountMovementId: null,
      });

      await reverseCashMovement(staffActor(), 'move_1', 'Storno');

      expect(movementCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ categoryId: 'cat_inactive' }) }));
    });

    it('maps a concurrent double-reversal race (P2002) to ConflictError', async () => {
      movementFindUnique.mockResolvedValue({
        id: 'move_1',
        categoryId: 'cat_1',
        amountCents: 5000,
        reversalOfId: null,
        accountMovementId: null,
        reversal: null,
      });
      movementCreate.mockRejectedValue(prismaError('P2002'));

      await expect(reverseCashMovement(staffActor(), 'move_1', 'Errore')).rejects.toThrow(ConflictError);
    });
  });

  describe('listCashMovements (Task 2, AC 2 — filters + effectiveDate-desc ordering)', () => {
    const baseRow = {
      id: 'move_1',
      categoryId: 'cat_1',
      category: { name: 'PPR' },
      amountCents: 5000,
      effectiveDate: new Date('2026-07-01T00:00:00.000Z'),
      description: null,
      actorUser: { email: 'staff@airmanager.local' },
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      reversalOfId: null,
      reversal: null,
      accountMovementId: null,
    };

    it('rejects a pilot (finance.manage required)', async () => {
      await expect(listCashMovements(pilotActor(), { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      expect(movementFindManyMock).not.toHaveBeenCalled();
    });

    it('orders by effectiveDate desc, then createdAt desc, then id desc (deliberately NOT createdAt-first, unlike the account statement)', async () => {
      movementFindMany.mockResolvedValue([baseRow]);
      movementCount.mockResolvedValue(1);

      await listCashMovements(staffActor(), { page: 1, pageSize: 20 });

      expect(movementFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] }),
      );
    });

    it('applies inclusive from/to on effectiveDate', async () => {
      movementFindMany.mockResolvedValue([baseRow]);
      movementCount.mockResolvedValue(1);

      await listCashMovements(staffActor(), { page: 1, pageSize: 20, from: '2026-07-01', to: '2026-07-31' });

      expect(movementFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            effectiveDate: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
          }),
        }),
      );
    });

    it('filters by categoryId', async () => {
      movementFindMany.mockResolvedValue([baseRow]);
      movementCount.mockResolvedValue(1);

      await listCashMovements(staffActor(), { page: 1, pageSize: 20, categoryId: 'cat_1' });

      expect(movementFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat_1' }) }));
    });

    it('filters by sign: in → amountCents > 0', async () => {
      movementFindMany.mockResolvedValue([baseRow]);
      movementCount.mockResolvedValue(1);

      await listCashMovements(staffActor(), { page: 1, pageSize: 20, sign: 'in' });

      expect(movementFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ amountCents: { gt: 0 } }) }));
    });

    it('filters by sign: out → amountCents < 0', async () => {
      movementFindMany.mockResolvedValue([baseRow]);
      movementCount.mockResolvedValue(1);

      await listCashMovements(staffActor(), { page: 1, pageSize: 20, sign: 'out' });

      expect(movementFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ amountCents: { lt: 0 } }) }));
    });

    it('maps rows to CashMovementListItem, including the automatic-twin and storno badge flags', async () => {
      movementFindMany.mockResolvedValue([
        { ...baseRow, id: 'move_auto', accountMovementId: 'acct_move_1' },
        { ...baseRow, id: 'move_reversed', reversal: { id: 'move_storno' } },
        { ...baseRow, id: 'move_storno', reversalOfId: 'move_reversed', amountCents: -5000 },
      ]);
      movementCount.mockResolvedValue(3);

      const result = await listCashMovements(staffActor(), { page: 1, pageSize: 20 });

      expect(result.items[0]).toMatchObject({ id: 'move_auto', isAutomatic: true });
      expect(result.items[1]).toMatchObject({ id: 'move_reversed', hasReversal: true });
      expect(result.items[2]).toMatchObject({ id: 'move_storno', reversalOfId: 'move_reversed' });
      expect(result.total).toBe(3);
    });
  });

  describe('getCashReport (story 3.5, Task 1, AC 1/2)', () => {
    it('rejects a pilot (finance.manage required)', async () => {
      await expect(getCashReport(pilotActor(), { from: '2026-07-01', to: '2026-07-31' })).rejects.toThrow(ForbiddenError);
      expect(queryRawMock).not.toHaveBeenCalled();
    });

    it('mixed in/out across multiple categories: per-category and overall totals are correct', async () => {
      queryRawMock.mockResolvedValue([
        { categoryId: 'cat_ppr', categoryName: 'PPR', movementCount: 2, inCents: 10000, outCents: -2000 },
        { categoryId: 'cat_fuel', categoryName: 'Carburante', movementCount: 1, inCents: 0, outCents: -3000 },
      ]);

      const result = await getCashReport(staffActor(), { from: '2026-07-01', to: '2026-07-31' });

      expect(result.categories).toEqual([
        { categoryId: 'cat_ppr', categoryName: 'PPR', inCents: 10000, outCents: -2000, netCents: 8000 },
        { categoryId: 'cat_fuel', categoryName: 'Carburante', inCents: 0, outCents: -3000, netCents: -3000 },
      ]);
      expect(result.totalInCents).toBe(10000);
      expect(result.totalOutCents).toBe(-5000);
      expect(result.netCents).toBe(5000);
      expect(result.movementCount).toBe(3);
      expect(result.from).toBe('2026-07-01');
      expect(result.to).toBe('2026-07-31');
    });

    it('AC 2 invariant: sum of movements === netCents === sum of per-category netCents (fixture includes a storno pair that cancels)', async () => {
      // A 50,00 € entrata and its exact storno (-50,00 €), both inside the
      // period — story 3.4's AD-3: they cancel in the category's totals.
      // Combined with an unrelated +20,00 €/-5,00 € pair in another category.
      queryRawMock.mockResolvedValue([
        { categoryId: 'cat_a', categoryName: 'Categoria A', movementCount: 2, inCents: 5000, outCents: -5000 },
        { categoryId: 'cat_b', categoryName: 'Categoria B', movementCount: 2, inCents: 2000, outCents: -500 },
      ]);

      const result = await getCashReport(staffActor(), { from: '2026-07-01', to: '2026-07-31' });

      const sumOfCategoryNet = result.categories.reduce((sum, category) => sum + category.netCents, 0);
      expect(result.netCents).toBe(sumOfCategoryNet);
      expect(result.netCents).toBe(result.totalInCents + result.totalOutCents);
      expect(result.netCents).toBe(1500); // (5000 - 5000) + (2000 - 500)
      expect(result.categories[0]).toMatchObject({ netCents: 0 }); // the storno pair cancels
    });

    it('empty period: no rows → all totals zero and an empty categories array', async () => {
      queryRawMock.mockResolvedValue([]);

      const result = await getCashReport(staffActor(), { from: '2026-08-01', to: '2026-08-31' });

      expect(result).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
        totalInCents: 0,
        totalOutCents: 0,
        netCents: 0,
        categories: [],
        movementCount: 0,
      });
    });
  });

  describe('schemas (Task 2, AC 2 — Zod-level validation)', () => {
    it('recordCashMovementSchema rejects a zero amount', () => {
      const result = recordCashMovementSchema.safeParse({
        categoryId: 'cat_1',
        amountCents: 0,
        effectiveDate: '2026-07-01',
      });
      expect(result.success).toBe(false);
    });

    it('recordCashMovementSchema accepts a signed non-zero amount within range', () => {
      const result = recordCashMovementSchema.safeParse({
        categoryId: 'cat_1',
        amountCents: -1500,
        effectiveDate: '2026-07-01',
        description: null,
      });
      expect(result.success).toBe(true);
    });

    it('recordCashMovementSchema rejects amounts beyond the Postgres INTEGER range', () => {
      const result = recordCashMovementSchema.safeParse({
        categoryId: 'cat_1',
        amountCents: 3_000_000_000,
        effectiveDate: '2026-07-01',
      });
      expect(result.success).toBe(false);
    });

    it('reverseCashMovementSchema requires a non-empty reason', () => {
      expect(reverseCashMovementSchema.safeParse({ reason: '' }).success).toBe(false);
      expect(reverseCashMovementSchema.safeParse({ reason: 'Motivo valido' }).success).toBe(true);
    });

    it('cashReportQuerySchema accepts a well-formed, non-inverted range', () => {
      const result = cashReportQuerySchema.safeParse({ from: '2026-07-01', to: '2026-07-31' });
      expect(result.success).toBe(true);
    });

    it('cashReportQuerySchema accepts a single-day range (from === to)', () => {
      expect(cashReportQuerySchema.safeParse({ from: '2026-07-01', to: '2026-07-01' }).success).toBe(true);
    });

    it('cashReportQuerySchema rejects an inverted range (from > to) — story 3.5 must reject where 3.4 review F4 left it open', () => {
      const result = cashReportQuerySchema.safeParse({ from: '2026-07-31', to: '2026-07-01' });
      expect(result.success).toBe(false);
    });

    it('cashReportQuerySchema rejects missing or malformed dates', () => {
      expect(cashReportQuerySchema.safeParse({ from: '2026-07-01' }).success).toBe(false);
      expect(cashReportQuerySchema.safeParse({ from: '2026-07-01', to: 'not-a-date' }).success).toBe(false);
      expect(cashReportQuerySchema.safeParse({}).success).toBe(false);
    });
  });
});
