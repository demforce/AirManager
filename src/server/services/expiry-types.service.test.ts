import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpiryTypeSchema, listExpiryTypesQuerySchema, updateExpiryTypeSchema } from '@/lib/schemas/expiry-types';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    expiryType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { createExpiryType, deleteExpiryType, listExpiryTypes, updateExpiryType } = await import('./expiry-types.service');
const { ConflictError, NotFoundError, ValidationError } = await import('./errors');

const findManyMock = vi.mocked(prisma.expiryType.findMany);
const findFirstMock = vi.mocked(prisma.expiryType.findFirst);
const findUniqueMock = vi.mocked(prisma.expiryType.findUnique);
const createMock = vi.mocked(prisma.expiryType.create);
const updateMock = vi.mocked(prisma.expiryType.update);
const deleteMock = vi.mocked(prisma.expiryType.delete);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as every other `*.service.test.ts`).
type Fixture = Record<string, unknown> | null;
const findMany = findManyMock as unknown as { mockResolvedValue: (v: Fixture[]) => void };
const findFirst = findFirstMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const findUnique = findUniqueMock as unknown as { mockResolvedValue: (v: Fixture) => void };
const create = createMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const update = updateMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };
const del = deleteMock as unknown as { mockResolvedValue: (v: Fixture) => void; mockRejectedValue: (v: unknown) => void };

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

function fixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'et_1',
    name: 'Visita medica classe 2',
    scope: 'PILOTS',
    // Story 13.1: `EXPIRY_TYPE_SELECT` now also includes `kind`.
    kind: 'MEDICAL',
    isActive: true,
    // Story 7.4: `EXPIRY_TYPE_SELECT` now includes `blocksBooking` — every
    // fixture that stands in for a `create`/`update`/`findMany` row needs it.
    blocksBooking: false,
    // Story 12.11: `EXPIRY_TYPE_SELECT` now also includes `validityMonths`.
    validityMonths: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('expiry-types.service (story 6.1 — expiry-type catalogue, FR-35)', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findFirstMock.mockReset();
    findUniqueMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
  });

  describe('listExpiryTypes (Task 2, AC 1)', () => {
    it('rejects a pilot (expiries.manage required)', async () => {
      const query = listExpiryTypesQuerySchema.parse({});
      await expect(listExpiryTypes(pilotActor(), query)).rejects.toThrow(ForbiddenError);
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it('lists — active only by default', async () => {
      findMany.mockResolvedValue([fixture()]);

      const result = await listExpiryTypes(adminActor(), listExpiryTypesQuerySchema.parse({}));

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 500 }),
      );
      expect(result).toEqual([fixture()]);
    });

    it('an admin actor can also list', async () => {
      findMany.mockResolvedValue([]);
      await expect(listExpiryTypes(adminActor(), listExpiryTypesQuerySchema.parse({}))).resolves.toEqual([]);
    });

    it('includeInactive: true also lists deactivated types (admin management page)', async () => {
      findMany.mockResolvedValue([]);

      await listExpiryTypes(adminActor(), listExpiryTypesQuerySchema.parse({ includeInactive: 'true' }));

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    });

    it('kind omitted (story 13.1, AC 2): every kind is returned, retro-compatible with every pre-13.1 consumer', async () => {
      findMany.mockResolvedValue([]);

      await listExpiryTypes(adminActor(), listExpiryTypesQuerySchema.parse({}));

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    });

    it('kind=MEDICAL filters the query to only medical-visit types', async () => {
      findMany.mockResolvedValue([fixture({ name: 'Visita medica classe 2', kind: 'MEDICAL' })]);

      const result = await listExpiryTypes(adminActor(), listExpiryTypesQuerySchema.parse({ kind: 'MEDICAL' }));

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, kind: 'MEDICAL' } }));
      expect(result).toEqual([fixture({ name: 'Visita medica classe 2', kind: 'MEDICAL' })]);
    });

    it('kind=RATING combines with includeInactive', async () => {
      findMany.mockResolvedValue([]);

      await listExpiryTypes(adminActor(), listExpiryTypesQuerySchema.parse({ includeInactive: 'true', kind: 'RATING' }));

      expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { kind: 'RATING' } }));
    });
  });

  describe('createExpiryType (Task 2, AC 1/2 — settings.manage only)', () => {
    it('rejects a non-admin actor (settings.manage required)', async () => {
      const input = createExpiryTypeSchema.parse({ name: 'Nuovo tipo', scope: 'ALL' });
      await expect(createExpiryType(pilotActor(), input)).rejects.toThrow(ForbiddenError);
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('a duplicate name (pre-check) → ConflictError, create never attempted', async () => {
      findFirst.mockResolvedValue({ id: 'et_existing' });
      const input = createExpiryTypeSchema.parse({ name: 'Visita medica classe 2', scope: 'PILOTS' });

      await expect(createExpiryType(adminActor(), input)).rejects.toThrow(ConflictError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('trims the name before persisting (blocksBooking defaults to false, story 7.4)', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Nuovo tipo' }));
      const input = createExpiryTypeSchema.parse({ name: '  Nuovo tipo  ', scope: 'ALL' });

      await createExpiryType(adminActor(), input);

      expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'Nuovo tipo' } }));
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Nuovo tipo', scope: 'ALL', kind: 'RATING', blocksBooking: false, validityMonths: null } }),
      );
    });

    it('creates with blocksBooking: true when the request opts in (story 7.4)', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Tipo critico', blocksBooking: true }));
      const input = createExpiryTypeSchema.parse({ name: 'Tipo critico', scope: 'PILOTS', blocksBooking: true });

      await createExpiryType(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Tipo critico', scope: 'PILOTS', kind: 'RATING', blocksBooking: true, validityMonths: null } }),
      );
    });

    it('creates with a validityMonths value when provided (story 12.11, ratifica utente 2)', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Abilitazione IR', validityMonths: 24 }));
      const input = createExpiryTypeSchema.parse({ name: 'Abilitazione IR', scope: 'PILOTS', validityMonths: 24 });

      await createExpiryType(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ validityMonths: 24 }) }));
    });

    it('creates with kind: MEDICAL when the request specifies it (story 13.1, AC 1/3 — the "Visite mediche" card)', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Visita medica classe 3', kind: 'MEDICAL' }));
      const input = createExpiryTypeSchema.parse({ name: 'Visita medica classe 3', kind: 'MEDICAL' });

      await createExpiryType(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'MEDICAL' }) }));
    });

    // Story 19.7a (AC 3, D-3): a medical visit has no scope and always counts.
    it('MEDICAL with scope and flag omitted → created with ALL / blocksBooking true', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Visita medica classe 3', kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }));
      const input = createExpiryTypeSchema.parse({ name: 'Visita medica classe 3', kind: 'MEDICAL', validityMonths: 24 });

      await createExpiryType(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Visita medica classe 3', scope: 'ALL', kind: 'MEDICAL', blocksBooking: true, validityMonths: 24 } }),
      );
    });

    it('MEDICAL with explicit ALL / true (the values it would get anyway) → accepted', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }));
      const input = createExpiryTypeSchema.parse({ name: 'Visita X', kind: 'MEDICAL', scope: 'ALL', blocksBooking: true });

      await createExpiryType(adminActor(), input);

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope: 'ALL', blocksBooking: true }) }));
    });

    it('MEDICAL with an explicit scope other than ALL → 422 MEDICAL_TYPE_FIELDS, before any query', async () => {
      const input = createExpiryTypeSchema.parse({ name: 'Visita X', kind: 'MEDICAL', scope: 'PILOTS' });

      await expect(createExpiryType(adminActor(), input)).rejects.toMatchObject({ code: 'MEDICAL_TYPE_FIELDS' });
      await expect(createExpiryType(adminActor(), input)).rejects.toThrow(ValidationError);
      expect(findFirstMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });

    it('MEDICAL with an explicit blocksBooking: false → 422 MEDICAL_TYPE_FIELDS', async () => {
      const input = createExpiryTypeSchema.parse({ name: 'Visita X', kind: 'MEDICAL', blocksBooking: false });

      await expect(createExpiryType(adminActor(), input)).rejects.toMatchObject({ code: 'MEDICAL_TYPE_FIELDS' });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('a RATING with scope and flag omitted → ALL / blocksBooking false (retro-compatible loosening)', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Rating X', kind: 'RATING', scope: 'ALL' }));

      await createExpiryType(adminActor(), createExpiryTypeSchema.parse({ name: 'Rating X' }));

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Rating X', scope: 'ALL', kind: 'RATING', blocksBooking: false, validityMonths: null } }),
      );
    });

    it('a RATING with an explicit scope keeps it (as before)', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue(fixture({ name: 'Rating I', kind: 'RATING', scope: 'INSTRUCTORS' }));

      await createExpiryType(adminActor(), createExpiryTypeSchema.parse({ name: 'Rating I', scope: 'INSTRUCTORS' }));

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope: 'INSTRUCTORS', kind: 'RATING', blocksBooking: false }) }));
    });

    it('maps a duplicate name (P2002 concurrency backstop) to ConflictError', async () => {
      findFirst.mockResolvedValue(null);
      create.mockRejectedValue(prismaError('P2002'));
      const input = createExpiryTypeSchema.parse({ name: 'Visita medica classe 2', scope: 'PILOTS' });

      await expect(createExpiryType(adminActor(), input)).rejects.toThrow(ConflictError);
    });
  });

  describe('updateExpiryType (Task 2, AC 1/2)', () => {
    it('rejects a non-admin actor (settings.manage required)', async () => {
      const input = updateExpiryTypeSchema.parse({ isActive: false });
      await expect(updateExpiryType(pilotActor(), 'et_1', input)).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown id BEFORE any other check', async () => {
      findUnique.mockResolvedValue(null);
      const input = updateExpiryTypeSchema.parse({ name: 'Qualcosa' });

      await expect(updateExpiryType(adminActor(), 'missing', input)).rejects.toThrow(NotFoundError);
      expect(findFirstMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('a partial update (isActive only) does not touch name/scope', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      update.mockResolvedValue(fixture({ isActive: false }));
      const input = updateExpiryTypeSchema.parse({ isActive: false });

      await updateExpiryType(adminActor(), 'et_1', input);

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { isActive: false }, select: expect.anything() });
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('patches validityMonths independently of every other field (story 12.11, ratifica utente 2)', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      update.mockResolvedValue(fixture({ validityMonths: 12 }));
      const input = updateExpiryTypeSchema.parse({ validityMonths: 12 });

      await updateExpiryType(adminActor(), 'et_1', input);

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { validityMonths: 12 }, select: expect.anything() });
    });

    it('validityMonths: null clears it back to "no expiry"', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      update.mockResolvedValue(fixture({ validityMonths: null }));
      const input = updateExpiryTypeSchema.parse({ validityMonths: null });

      await updateExpiryType(adminActor(), 'et_1', input);

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { validityMonths: null }, select: expect.anything() });
    });

    it('a duplicate name on update (excluding self) → ConflictError, update never attempted', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      findFirst.mockResolvedValue({ id: 'et_other' });
      const input = updateExpiryTypeSchema.parse({ name: 'Nome già usato' });

      await expect(updateExpiryType(adminActor(), 'et_1', input)).rejects.toThrow(ConflictError);
      expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: { name: 'Nome già usato', NOT: { id: 'et_1' } } }));
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('maps a duplicate name (P2002 concurrency backstop) to ConflictError', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      findFirst.mockResolvedValue(null);
      update.mockRejectedValue(prismaError('P2002'));
      const input = updateExpiryTypeSchema.parse({ name: 'Qualcosa' });

      await expect(updateExpiryType(adminActor(), 'et_1', input)).rejects.toThrow(ConflictError);
    });

    it('an update with an empty body → 422 at the schema layer (never reaches the service)', () => {
      expect(updateExpiryTypeSchema.safeParse({}).success).toBe(false);
    });

    it('patches blocksBooking independently of name/scope/isActive (story 7.4)', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      update.mockResolvedValue(fixture({ blocksBooking: true }));
      const input = updateExpiryTypeSchema.parse({ blocksBooking: true });

      await updateExpiryType(adminActor(), 'et_1', input);

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { blocksBooking: true }, select: expect.anything() });
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    // Story 19.7a (AC 3/4): the MEMBERSHIP lock and the MEDICAL invariant, on the RESULTING state.
    it('any PATCH of the MEMBERSHIP type (even isActive only) → 409 MEMBERSHIP_TYPE_LOCKED, nothing else checked', async () => {
      findUnique.mockResolvedValue({ id: 'et_quota', kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false });

      for (const body of [{ isActive: false }, { name: 'Quota soci' }, { validityMonths: 6 }]) {
        await expect(updateExpiryType(adminActor(), 'et_quota', updateExpiryTypeSchema.parse(body))).rejects.toMatchObject({ code: 'MEMBERSHIP_TYPE_LOCKED' });
      }
      await expect(updateExpiryType(adminActor(), 'et_quota', updateExpiryTypeSchema.parse({ isActive: false }))).rejects.toThrow(ConflictError);
      expect(findFirstMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('a PATCH of an unknown id is still a 404 first (before the MEMBERSHIP lock)', async () => {
      findUnique.mockResolvedValue(null);

      await expect(updateExpiryType(adminActor(), 'missing', updateExpiryTypeSchema.parse({ isActive: false }))).rejects.toThrow(NotFoundError);
    });

    it('a medical visit patched with scope STUDENTS → 422 MEDICAL_TYPE_FIELDS', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', kind: 'MEDICAL', scope: 'ALL', blocksBooking: true });

      await expect(updateExpiryType(adminActor(), 'et_1', updateExpiryTypeSchema.parse({ scope: 'STUDENTS' }))).rejects.toMatchObject({ code: 'MEDICAL_TYPE_FIELDS' });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('a medical visit patched with blocksBooking false → 422 MEDICAL_TYPE_FIELDS', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', kind: 'MEDICAL', scope: 'ALL', blocksBooking: true });

      await expect(updateExpiryType(adminActor(), 'et_1', updateExpiryTypeSchema.parse({ blocksBooking: false }))).rejects.toMatchObject({ code: 'MEDICAL_TYPE_FIELDS' });
    });

    it('a RATING scoped PILOTS moved to MEDICAL alone → 422 (the resulting state keeps PILOTS)', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', kind: 'RATING', scope: 'PILOTS', blocksBooking: false });

      await expect(updateExpiryType(adminActor(), 'et_1', updateExpiryTypeSchema.parse({ kind: 'MEDICAL' }))).rejects.toMatchObject({ code: 'MEDICAL_TYPE_FIELDS' });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('a RATING scoped PILOTS moved to MEDICAL with ALL / true in the same PATCH → 200', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', kind: 'RATING', scope: 'PILOTS', blocksBooking: false });
      update.mockResolvedValue(fixture({ kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }));

      await updateExpiryType(adminActor(), 'et_1', updateExpiryTypeSchema.parse({ kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }));

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }, select: expect.anything() });
    });

    it('renaming a medical visit (name only) passes the invariant untouched', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', kind: 'MEDICAL', scope: 'ALL', blocksBooking: true });
      findFirst.mockResolvedValue(null);
      update.mockResolvedValue(fixture({ name: 'Visita rinominata', kind: 'MEDICAL', scope: 'ALL', blocksBooking: true }));

      await updateExpiryType(adminActor(), 'et_1', updateExpiryTypeSchema.parse({ name: 'Visita rinominata' }));

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { name: 'Visita rinominata' }, select: expect.anything() });
    });

    it('patches kind independently of every other field (story 13.1 review F3 — a misclassified type is recoverable via PATCH)', async () => {
      findUnique.mockResolvedValue({ id: 'et_1' });
      update.mockResolvedValue(fixture({ kind: 'RATING' }));
      const input = updateExpiryTypeSchema.parse({ kind: 'RATING' });

      await updateExpiryType(adminActor(), 'et_1', input);

      expect(updateMock).toHaveBeenCalledWith({ where: { id: 'et_1' }, data: { kind: 'RATING' }, select: expect.anything() });
      expect(findFirstMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteExpiryType (Task 2, AC 2 — P2003 backstop ready for 6.2)', () => {
    it('rejects a non-admin actor (settings.manage required)', async () => {
      await expect(deleteExpiryType(pilotActor(), 'et_1')).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError for an unknown id', async () => {
      findUnique.mockResolvedValue(null);

      await expect(deleteExpiryType(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('deletes a type never used', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', _count: { expiries: 0 } });
      del.mockResolvedValue({ id: 'et_1' });

      await expect(deleteExpiryType(adminActor(), 'et_1')).resolves.toBeUndefined();
      expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'et_1' } });
    });

    it('story 6.2 Task 3: the explicit _count pre-check rejects a type in use with ConflictError, BEFORE attempting the delete', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', _count: { expiries: 3 } });

      await expect(deleteExpiryType(adminActor(), 'et_1')).rejects.toThrow(ConflictError);
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('maps a FK violation (P2003 — the concurrency backstop for a scadenza registered between the pre-check and the delete) to ConflictError', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', _count: { expiries: 0 } });
      del.mockRejectedValue(prismaError('P2003'));

      await expect(deleteExpiryType(adminActor(), 'et_1')).rejects.toThrow(ConflictError);
    });

    it('the MEMBERSHIP type → 409 MEMBERSHIP_TYPE_LOCKED, before the "in use" check, never deleted (story 19.7a, AC 4)', async () => {
      findUnique.mockResolvedValue({ id: 'et_quota', kind: 'MEMBERSHIP', _count: { expiries: 0 } });

      await expect(deleteExpiryType(adminActor(), 'et_quota')).rejects.toMatchObject({ code: 'MEMBERSHIP_TYPE_LOCKED' });
      findUnique.mockResolvedValue({ id: 'et_quota', kind: 'MEMBERSHIP', _count: { expiries: 7 } });
      await expect(deleteExpiryType(adminActor(), 'et_quota')).rejects.toMatchObject({ code: 'MEMBERSHIP_TYPE_LOCKED' });
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('maps a concurrent double-DELETE race (P2025 — the loser of the race) to NotFoundError, not a raw 500 (TD-1, AC 1, was deferred 6.1 D1)', async () => {
      findUnique.mockResolvedValue({ id: 'et_1', _count: { expiries: 0 } });
      del.mockRejectedValue(prismaError('P2025'));

      await expect(deleteExpiryType(adminActor(), 'et_1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('schema validation (Task 3, AC 1/2)', () => {
    it('rejects an empty/whitespace-only or over-max name', () => {
      expect(createExpiryTypeSchema.safeParse({ name: '', scope: 'ALL' }).success).toBe(false);
      expect(createExpiryTypeSchema.safeParse({ name: '   ', scope: 'ALL' }).success).toBe(false);
      expect(createExpiryTypeSchema.safeParse({ name: 'x'.repeat(101), scope: 'ALL' }).success).toBe(false);
    });

    it('rejects a scope outside the enum', () => {
      expect(createExpiryTypeSchema.safeParse({ name: 'X', scope: 'EVERYONE' }).success).toBe(false);
    });

    it('accepts a missing scope on create — resolved by the service from kind (story 19.7a, AD-7)', () => {
      const result = createExpiryTypeSchema.safeParse({ name: 'X' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scope).toBeUndefined();
      }
    });

    it('rejects kind MEMBERSHIP on create and on update — a system type (story 19.7a, AC 4)', () => {
      expect(createExpiryTypeSchema.safeParse({ name: 'X', kind: 'MEMBERSHIP' }).success).toBe(false);
      expect(updateExpiryTypeSchema.safeParse({ kind: 'MEMBERSHIP' }).success).toBe(false);
    });

    it('the list filter accepts kind MEMBERSHIP (story 19.7a, AC 4)', () => {
      expect(listExpiryTypesQuerySchema.parse({ kind: 'MEMBERSHIP' }).kind).toBe('MEMBERSHIP');
    });

    it('rejects an empty update body', () => {
      expect(updateExpiryTypeSchema.safeParse({}).success).toBe(false);
    });

    it('accepts a partial update body with just isActive', () => {
      expect(updateExpiryTypeSchema.safeParse({ isActive: true }).success).toBe(true);
    });

    it('blocksBooking stays undefined on create when omitted — no Zod default, the service resolves it by kind (story 19.7a, AD-7)', () => {
      const result = createExpiryTypeSchema.safeParse({ name: 'X', scope: 'ALL' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.blocksBooking).toBeUndefined();
      }
    });

    it('accepts an explicit blocksBooking: true on create', () => {
      const result = createExpiryTypeSchema.safeParse({ name: 'X', scope: 'ALL', blocksBooking: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.blocksBooking).toBe(true);
      }
    });

    it('accepts a partial update body with just blocksBooking', () => {
      expect(updateExpiryTypeSchema.safeParse({ blocksBooking: true }).success).toBe(true);
    });

    it('accepts a partial update body with just kind (story 13.1 review F3)', () => {
      expect(updateExpiryTypeSchema.safeParse({ kind: 'MEDICAL' }).success).toBe(true);
    });

    it('rejects a kind outside the enum on update', () => {
      expect(updateExpiryTypeSchema.safeParse({ kind: 'OTHER' }).success).toBe(false);
    });
  });
});
