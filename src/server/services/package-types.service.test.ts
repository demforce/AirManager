import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPackageTypeSchema,
  listPackageTypesQuerySchema,
  updatePackageTypeSchema,
} from '@/lib/schemas/package-types';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    packageType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    packageTypeAircraft: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    aircraft: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { createPackageType, deletePackageType, listPackageTypes, updatePackageType } = await import('./package-types.service');
const { ConflictError, NotFoundError } = await import('./errors');

const packageTypeFindManyMock = vi.mocked(prisma.packageType.findMany);
const packageTypeFindFirstMock = vi.mocked(prisma.packageType.findFirst);
const packageTypeFindUniqueMock = vi.mocked(prisma.packageType.findUnique);
const packageTypeFindUniqueOrThrowMock = vi.mocked(prisma.packageType.findUniqueOrThrow);
const packageTypeCreateMock = vi.mocked(prisma.packageType.create);
const packageTypeUpdateMock = vi.mocked(prisma.packageType.update);
const packageTypeDeleteMock = vi.mocked(prisma.packageType.delete);
const joinFindManyMock = vi.mocked(prisma.packageTypeAircraft.findMany);
const joinCreateManyMock = vi.mocked(prisma.packageTypeAircraft.createMany);
const joinDeleteManyMock = vi.mocked(prisma.packageTypeAircraft.deleteMany);
const aircraftFindManyMock = vi.mocked(prisma.aircraft.findMany);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as `cash.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const packageTypeFindMany = packageTypeFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const packageTypeFindFirst = packageTypeFindFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const packageTypeFindUnique = packageTypeFindUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const packageTypeFindUniqueOrThrow = packageTypeFindUniqueOrThrowMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const packageTypeCreate = packageTypeCreateMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockRejectedValue: (v: unknown) => void;
};
const packageTypeUpdate = packageTypeUpdateMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const packageTypeDelete = packageTypeDeleteMock as unknown as {
  mockResolvedValue: (v: Fixture) => void;
  mockRejectedValue: (v: unknown) => void;
};
const aircraftFindMany = aircraftFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const joinFindMany = joinFindManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };

/** Same batch/interactive `$transaction` stand-in as `cash.service.test.ts`. */
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

function activeAircraft(id: string): Record<string, unknown> {
  return { id, archivedAt: null };
}

function withEligible(packageType: Record<string, unknown>, aircraft: Array<{ id: string; registration: string }>): Record<string, unknown> {
  return { ...packageType, eligibleAircraft: aircraft.map((a) => ({ aircraft: a })) };
}

describe('package-types.service (story 4.3 — package-type listino, AD-2/AD-4)', () => {
  beforeEach(() => {
    packageTypeFindManyMock.mockReset();
    packageTypeFindFirstMock.mockReset();
    packageTypeFindUniqueMock.mockReset();
    packageTypeFindUniqueOrThrowMock.mockReset();
    packageTypeCreateMock.mockReset();
    packageTypeUpdateMock.mockReset();
    packageTypeDeleteMock.mockReset();
    joinFindManyMock.mockReset();
    joinFindMany.mockResolvedValue([]);
    joinCreateManyMock.mockReset();
    joinDeleteManyMock.mockReset();
    aircraftFindManyMock.mockReset();
    transactionMock.mockReset();
    mockTransaction();
  });

  describe('listPackageTypes (Task 2, AC 1)', () => {
    it('rejects a pilot (finance.manage required)', async () => {
      const query = listPackageTypesQuerySchema.parse({});
      await expect(listPackageTypes(pilotActor(), query)).rejects.toThrow(ForbiddenError);
      expect(packageTypeFindManyMock).not.toHaveBeenCalled();
    });

    it('a staff actor (finance.manage) can list — active only by default', async () => {
      packageTypeFindMany.mockResolvedValue([
        withEligible(
          { id: 'pt_1', name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 140000, validityMonths: 12, isActive: true, createdAt: new Date('2026-01-01') },
          [{ id: 'ac_2', registration: 'I-BBBB' }, { id: 'ac_1', registration: 'I-AAAA' }],
        ),
      ]);

      const result = await listPackageTypes(staffActor(), listPackageTypesQuerySchema.parse({}));

      expect(packageTypeFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      );
      // Eligible aircraft are sorted by registration, regardless of join-row order.
      expect(result).toEqual([
        {
          id: 'pt_1',
          name: 'Pacchetto 10 ore',
          includedMinutes: 600,
          priceCents: 140000,
          validityMonths: 12,
          isActive: true,
          eligibleAircraft: [
            { id: 'ac_1', registration: 'I-AAAA' },
            { id: 'ac_2', registration: 'I-BBBB' },
          ],
          createdAt: new Date('2026-01-01'),
        },
      ]);
    });

    it('includeInactive: true also lists deactivated types (admin management page)', async () => {
      packageTypeFindMany.mockResolvedValue([]);

      await listPackageTypes(staffActor(), listPackageTypesQuerySchema.parse({ includeInactive: 'true' }));

      expect(packageTypeFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    });
  });

  describe('createPackageType (Task 2, AC 1 — settings.manage only)', () => {
    it('rejects a staff actor (finance.manage is not enough — settings.manage required)', async () => {
      const input = createPackageTypeSchema.parse({ name: 'Nuovo', includedMinutes: 600, priceCents: 140000 });
      await expect(createPackageType(staffActor(), input)).rejects.toThrow(ForbiddenError);
      expect(packageTypeFindFirstMock).not.toHaveBeenCalled();
    });

    it('a duplicate name (pre-check) → ConflictError, create never attempted', async () => {
      packageTypeFindFirst.mockResolvedValue({ id: 'pt_existing' });
      const input = createPackageTypeSchema.parse({ name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 140000 });

      await expect(createPackageType(adminActor(), input)).rejects.toThrow(ConflictError);
      expect(packageTypeCreateMock).not.toHaveBeenCalled();
    });

    it('an aircraftId that does not exist → NotFoundError', async () => {
      packageTypeFindFirst.mockResolvedValue(null);
      aircraftFindMany.mockResolvedValue([activeAircraft('ac_1')]);
      const input = createPackageTypeSchema.parse({
        name: 'Pacchetto 10 ore',
        includedMinutes: 600,
        priceCents: 140000,
        aircraftIds: ['ac_1', 'ac_missing'],
      });

      await expect(createPackageType(adminActor(), input)).rejects.toThrow(NotFoundError);
      expect(packageTypeCreateMock).not.toHaveBeenCalled();
    });

    it('an archived aircraftId → ConflictError', async () => {
      packageTypeFindFirst.mockResolvedValue(null);
      aircraftFindMany.mockResolvedValue([{ id: 'ac_1', archivedAt: new Date('2025-01-01') }]);
      const input = createPackageTypeSchema.parse({
        name: 'Pacchetto 10 ore',
        includedMinutes: 600,
        priceCents: 140000,
        aircraftIds: ['ac_1'],
      });

      await expect(createPackageType(adminActor(), input)).rejects.toThrow(ConflictError);
      expect(packageTypeCreateMock).not.toHaveBeenCalled();
    });

    it('dedups aircraftIds before validating/persisting', async () => {
      packageTypeFindFirst.mockResolvedValue(null);
      aircraftFindMany.mockResolvedValue([activeAircraft('ac_1')]);
      packageTypeCreate.mockResolvedValue({ id: 'pt_new' });
      packageTypeFindUniqueOrThrow.mockResolvedValue(
        withEligible(
          { id: 'pt_new', name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 140000, validityMonths: null, isActive: true, createdAt: new Date('2026-01-01') },
          [{ id: 'ac_1', registration: 'I-AAAA' }],
        ),
      );
      const input = createPackageTypeSchema.parse({
        name: 'Pacchetto 10 ore',
        includedMinutes: 600,
        priceCents: 140000,
        aircraftIds: ['ac_1', 'ac_1'],
      });

      await createPackageType(adminActor(), input);

      expect(aircraftFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['ac_1'] } } }),
      );
      expect(joinCreateManyMock).toHaveBeenCalledWith({ data: [{ packageTypeId: 'pt_new', aircraftId: 'ac_1' }] });
    });

    it('creates a type with no eligible aircraft (empty aircraftIds is a valid draft)', async () => {
      packageTypeFindFirst.mockResolvedValue(null);
      packageTypeCreate.mockResolvedValue({ id: 'pt_new' });
      packageTypeFindUniqueOrThrow.mockResolvedValue(
        withEligible({ id: 'pt_new', name: 'Solo listino', includedMinutes: 300, priceCents: 70000, validityMonths: null, isActive: true, createdAt: new Date('2026-01-01') }, []),
      );
      const input = createPackageTypeSchema.parse({ name: 'Solo listino', includedMinutes: 300, priceCents: 70000 });

      const result = await createPackageType(adminActor(), input);

      expect(aircraftFindManyMock).not.toHaveBeenCalled();
      expect(joinCreateManyMock).not.toHaveBeenCalled();
      expect(result.eligibleAircraft).toEqual([]);
    });

    it('maps a duplicate name (P2002 concurrency backstop) to ConflictError', async () => {
      packageTypeFindFirst.mockResolvedValue(null);
      packageTypeCreate.mockRejectedValue(prismaError('P2002'));
      const input = createPackageTypeSchema.parse({ name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 140000 });

      await expect(createPackageType(adminActor(), input)).rejects.toThrow(ConflictError);
    });
  });

  describe('updatePackageType (Task 2, AC 1)', () => {
    it('rejects a staff actor (settings.manage required)', async () => {
      const input = updatePackageTypeSchema.parse({ priceCents: 150000 });
      await expect(updatePackageType(staffActor(), 'pt_1', input)).rejects.toThrow(ForbiddenError);
      expect(packageTypeFindUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown id', async () => {
      packageTypeFindUnique.mockResolvedValue(null);
      const input = updatePackageTypeSchema.parse({ priceCents: 150000 });

      await expect(updatePackageType(adminActor(), 'missing', input)).rejects.toThrow(NotFoundError);
      expect(packageTypeUpdateMock).not.toHaveBeenCalled();
    });

    it('a partial update (price only) does not touch the eligible-aircraft set', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1' });
      packageTypeUpdate.mockResolvedValue({ id: 'pt_1' });
      packageTypeFindUniqueOrThrow.mockResolvedValue(
        withEligible({ id: 'pt_1', name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 150000, validityMonths: 12, isActive: true, createdAt: new Date('2026-01-01') }, []),
      );
      const input = updatePackageTypeSchema.parse({ priceCents: 150000 });

      await updatePackageType(adminActor(), 'pt_1', input);

      expect(packageTypeUpdateMock).toHaveBeenCalledWith({ where: { id: 'pt_1' }, data: { priceCents: 150000 } });
      expect(joinDeleteManyMock).not.toHaveBeenCalled();
      expect(joinCreateManyMock).not.toHaveBeenCalled();
    });

    it('aircraftIds present → replaces the eligible-aircraft set entirely', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1' });
      aircraftFindMany.mockResolvedValue([activeAircraft('ac_2')]);
      packageTypeUpdate.mockResolvedValue({ id: 'pt_1' });
      packageTypeFindUniqueOrThrow.mockResolvedValue(
        withEligible({ id: 'pt_1', name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 140000, validityMonths: 12, isActive: true, createdAt: new Date('2026-01-01') }, [
          { id: 'ac_2', registration: 'I-BBBB' },
        ]),
      );
      const input = updatePackageTypeSchema.parse({ aircraftIds: ['ac_2'] });

      const result = await updatePackageType(adminActor(), 'pt_1', input);

      expect(joinDeleteManyMock).toHaveBeenCalledWith({ where: { packageTypeId: 'pt_1' } });
      expect(joinCreateManyMock).toHaveBeenCalledWith({ data: [{ packageTypeId: 'pt_1', aircraftId: 'ac_2' }] });
      expect(result.eligibleAircraft).toEqual([{ id: 'ac_2', registration: 'I-BBBB' }]);
    });

    it('retaining an already-associated, now-archived aircraft is allowed (review 4.3 F1)', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1' });
      // The aircraft was associated while active, then archived: the edit
      // form re-sends the full set — the update must NOT 409.
      joinFindMany.mockResolvedValue([{ aircraftId: 'ac_arch' }]);
      aircraftFindMany.mockResolvedValue([{ id: 'ac_arch', archivedAt: new Date('2026-06-01') }]);
      packageTypeUpdate.mockResolvedValue({ id: 'pt_1' });
      packageTypeFindUniqueOrThrow.mockResolvedValue(
        withEligible({ id: 'pt_1', name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 150000, validityMonths: 12, isActive: true, createdAt: new Date('2026-01-01') }, [
          { id: 'ac_arch', registration: 'I-AAAA' },
        ]),
      );
      const input = updatePackageTypeSchema.parse({ priceCents: 150000, aircraftIds: ['ac_arch'] });

      const result = await updatePackageType(adminActor(), 'pt_1', input);

      expect(joinCreateManyMock).toHaveBeenCalledWith({ data: [{ packageTypeId: 'pt_1', aircraftId: 'ac_arch' }] });
      expect(result.eligibleAircraft).toEqual([{ id: 'ac_arch', registration: 'I-AAAA' }]);
    });

    it('adding a NEW archived aircraft on update still → ConflictError (review 4.3 F1)', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1' });
      joinFindMany.mockResolvedValue([{ aircraftId: 'ac_1' }]);
      aircraftFindMany.mockResolvedValue([activeAircraft('ac_1'), { id: 'ac_new', archivedAt: new Date('2026-06-01') }]);
      const input = updatePackageTypeSchema.parse({ aircraftIds: ['ac_1', 'ac_new'] });

      await expect(updatePackageType(adminActor(), 'pt_1', input)).rejects.toThrow(ConflictError);
      expect(packageTypeUpdateMock).not.toHaveBeenCalled();
    });

    it('validityMonths: null clears the validity (distinguished from omitted)', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1' });
      packageTypeUpdate.mockResolvedValue({ id: 'pt_1' });
      packageTypeFindUniqueOrThrow.mockResolvedValue(
        withEligible({ id: 'pt_1', name: 'Pacchetto 10 ore', includedMinutes: 600, priceCents: 140000, validityMonths: null, isActive: true, createdAt: new Date('2026-01-01') }, []),
      );
      const input = updatePackageTypeSchema.parse({ validityMonths: null });

      await updatePackageType(adminActor(), 'pt_1', input);

      expect(packageTypeUpdateMock).toHaveBeenCalledWith({ where: { id: 'pt_1' }, data: { validityMonths: null } });
    });

    it('a duplicate name on update → ConflictError, update never attempted', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1' });
      packageTypeFindFirst.mockResolvedValue({ id: 'pt_other' });
      const input = updatePackageTypeSchema.parse({ name: 'Nome già usato' });

      await expect(updatePackageType(adminActor(), 'pt_1', input)).rejects.toThrow(ConflictError);
      expect(packageTypeUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe('deletePackageType (Task 2, AC 2/3 — explicit _count pre-check + FK RESTRICT backstop)', () => {
    it('rejects a staff actor (settings.manage required)', async () => {
      await expect(deletePackageType(staffActor(), 'pt_1')).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError for an unknown id', async () => {
      packageTypeFindUnique.mockResolvedValue(null);

      await expect(deletePackageType(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(packageTypeDeleteMock).not.toHaveBeenCalled();
    });

    it('deletes a package type never sold', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1', _count: { soldPackages: 0 } });
      packageTypeDelete.mockResolvedValue({ id: 'pt_1' });

      await expect(deletePackageType(adminActor(), 'pt_1')).resolves.toBeUndefined();
      expect(joinDeleteManyMock).toHaveBeenCalledWith({ where: { packageTypeId: 'pt_1' } });
      expect(packageTypeDeleteMock).toHaveBeenCalledWith({ where: { id: 'pt_1' } });
    });

    it('story 4.4 AC 3: an explicit _count pre-check (soldPackages > 0) -> ConflictError, delete never attempted', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1', _count: { soldPackages: 2 } });

      await expect(deletePackageType(adminActor(), 'pt_1')).rejects.toThrow(ConflictError);
      expect(packageTypeDeleteMock).not.toHaveBeenCalled();
    });

    it('maps a FK violation (P2003 — the concurrency backstop for a sale racing the pre-check) to ConflictError', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1', _count: { soldPackages: 0 } });
      packageTypeDelete.mockRejectedValue(prismaError('P2003'));

      await expect(deletePackageType(adminActor(), 'pt_1')).rejects.toThrow(ConflictError);
    });

    it('maps a concurrent double-DELETE race (P2025 — the loser of the race) to NotFoundError, not a raw 500 (TD-1, AC 1)', async () => {
      packageTypeFindUnique.mockResolvedValue({ id: 'pt_1', _count: { soldPackages: 0 } });
      packageTypeDelete.mockRejectedValue(prismaError('P2025'));

      await expect(deletePackageType(adminActor(), 'pt_1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('schema validation (Task 3, AC 1/2)', () => {
    it('rejects zero/negative/overflow includedMinutes and priceCents', () => {
      expect(createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 0, priceCents: 100 }).success).toBe(false);
      expect(createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: -10, priceCents: 100 }).success).toBe(false);
      expect(createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 600, priceCents: 0 }).success).toBe(false);
      expect(createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 600, priceCents: -100 }).success).toBe(false);
      expect(
        createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 2_147_483_648, priceCents: 100 }).success,
      ).toBe(false);
    });

    it('rejects validityMonths: 0', () => {
      expect(
        createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 600, priceCents: 100, validityMonths: 0 }).success,
      ).toBe(false);
    });

    it('accepts validityMonths: null (no expiry) and omitted (also no expiry)', () => {
      expect(
        createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 600, priceCents: 100, validityMonths: null }).success,
      ).toBe(true);
      expect(createPackageTypeSchema.safeParse({ name: 'X', includedMinutes: 600, priceCents: 100 }).success).toBe(true);
    });

    it('rejects an empty or over-max name', () => {
      expect(createPackageTypeSchema.safeParse({ name: '', includedMinutes: 600, priceCents: 100 }).success).toBe(false);
      expect(
        createPackageTypeSchema.safeParse({ name: 'x'.repeat(101), includedMinutes: 600, priceCents: 100 }).success,
      ).toBe(false);
    });

    it('rejects an empty update body', () => {
      expect(updatePackageTypeSchema.safeParse({}).success).toBe(false);
    });
  });
});
