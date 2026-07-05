import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    aircraft: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/server/db/prisma');
const {
  archiveAircraft,
  createAircraft,
  getAircraft,
  listAircraft,
  unarchiveAircraft,
  updateAircraft,
} = await import('./aircraft.service');
const { ConflictError, NotFoundError } = await import('./errors');

const findUniqueMock = vi.mocked(prisma.aircraft.findUnique);
const findFirstMock = vi.mocked(prisma.aircraft.findFirst);
const findManyMock = vi.mocked(prisma.aircraft.findMany);
const countMock = vi.mocked(prisma.aircraft.count);
const createMock = vi.mocked(prisma.aircraft.create);
const updateMock = vi.mocked(prisma.aircraft.update);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as people.service.test.ts).
type AircraftFixture = Record<string, unknown> | null;
const aircraftFindUnique = findUniqueMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftFindFirst = findFirstMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftCreate = createMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const aircraftUpdate = updateMock as unknown as { mockResolvedValue: (v: AircraftFixture) => void };
const transaction = transactionMock as unknown as { mockResolvedValue: (v: unknown) => void };

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const SELECTED_AIRCRAFT = {
  id: 'aircraft_1',
  registration: 'I-ABCD',
  type: 'Ultraleggero 3 assi',
  model: 'Tecnam P92 Eaglet',
  hourMeterMinutes: 750,
  notes: 'Velivolo scuola volo demo.',
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('aircraft.service (story 2.4 — aircraft.manage RBAC + CRUD/archiving)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    findManyMock.mockReset();
    countMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    transactionMock.mockReset();
  });

  describe('authorization (AD-5, AC 1/2)', () => {
    it('listAircraft rejects an actor without aircraft.manage', async () => {
      await expect(listAircraft(pilotActor(), { page: 1, pageSize: 20, includeArchived: false })).rejects.toThrow(
        ForbiddenError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('getAircraft rejects an actor without aircraft.manage', async () => {
      await expect(getAircraft(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('createAircraft rejects an actor without aircraft.manage', async () => {
      await expect(
        createAircraft(pilotActor(), {
          registration: 'I-XYZW',
          type: 'Ultraleggero',
          model: 'Test',
          hourMeterMinutes: 0,
          notes: null,
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('updateAircraft rejects an actor without aircraft.manage', async () => {
      await expect(updateAircraft(pilotActor(), 'aircraft_1', { notes: 'x' })).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('archiveAircraft rejects an actor without aircraft.manage', async () => {
      await expect(archiveAircraft(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
    });

    it('unarchiveAircraft rejects an actor without aircraft.manage', async () => {
      await expect(unarchiveAircraft(pilotActor(), 'aircraft_1')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('listAircraft', () => {
    it('returns the AD-8 paginated shape', async () => {
      transaction.mockResolvedValue([[SELECTED_AIRCRAFT], 1]);

      const result = await listAircraft(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result).toEqual({
        items: [
          {
            id: 'aircraft_1',
            registration: 'I-ABCD',
            type: 'Ultraleggero 3 assi',
            model: 'Tecnam P92 Eaglet',
            hourMeterMinutes: 750,
            notes: 'Velivolo scuola volo demo.',
            archivedAt: null,
            createdAt: SELECTED_AIRCRAFT.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('excludes archived aircraft by default (AC 2)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listAircraft(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({ archivedAt: null });
    });

    it('includes archived aircraft when includeArchived is true (AC 2)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listAircraft(staffActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).not.toHaveProperty('archivedAt');
    });

    it('searches registration and model case-insensitively (AC 1)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listAircraft(staffActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'abcd' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({
        OR: [
          { registration: { contains: 'abcd', mode: 'insensitive' } },
          { model: { contains: 'abcd', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('getAircraft', () => {
    it('throws NotFoundError for a missing id', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(getAircraft(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('returns the mapped aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      const result = await getAircraft(staffActor(), 'aircraft_1');
      expect(result.id).toBe('aircraft_1');
      expect(result.hourMeterMinutes).toBe(750);
    });
  });

  describe('createAircraft', () => {
    const input = {
      registration: 'I-ABCD',
      type: 'Ultraleggero 3 assi',
      model: 'Tecnam P92 Eaglet',
      hourMeterMinutes: 750,
      notes: 'Velivolo scuola volo demo.',
    };

    it('creates the aircraft (AC 1)', async () => {
      aircraftFindFirst.mockResolvedValue(null); // no existing conflict
      aircraftCreate.mockResolvedValue(SELECTED_AIRCRAFT);

      const result = await createAircraft(staffActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ registration: 'I-ABCD', hourMeterMinutes: 750 }),
        }),
      );
      expect(result.id).toBe('aircraft_1');
    });

    it('throws ConflictError when the registration is already taken', async () => {
      aircraftFindFirst.mockResolvedValue({ id: 'other_aircraft' });

      await expect(createAircraft(staffActor(), input)).rejects.toThrow(ConflictError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError', async () => {
      aircraftFindFirst.mockResolvedValue(null);
      createMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(createAircraft(staffActor(), input)).rejects.toThrow(ConflictError);
    });

    it('never stores hourMeterMinutes as anything but the integer provided (AD-2)', async () => {
      aircraftFindFirst.mockResolvedValue(null);
      aircraftCreate.mockResolvedValue({ ...SELECTED_AIRCRAFT, hourMeterMinutes: 90 });

      await createAircraft(staffActor(), { ...input, hourMeterMinutes: 90 });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ hourMeterMinutes: 90 }) }),
      );
    });
  });

  describe('updateAircraft', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(updateAircraft(staffActor(), 'missing', { notes: 'x' })).rejects.toThrow(NotFoundError);
    });

    it('updates only the provided fields', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, hourMeterMinutes: 800 });

      const result = await updateAircraft(staffActor(), 'aircraft_1', { hourMeterMinutes: 800 });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'aircraft_1' }, data: { hourMeterMinutes: 800 } }),
      );
      expect(result.hourMeterMinutes).toBe(800);
    });

    it('does not check registration uniqueness when registration is not part of the patch', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue(SELECTED_AIRCRAFT);

      await updateAircraft(staffActor(), 'aircraft_1', { notes: 'updated' });

      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when re-using a registration already taken by another aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftFindFirst.mockResolvedValue({ id: 'someone_else' });

      await expect(
        updateAircraft(staffActor(), 'aircraft_1', { registration: 'I-TAKEN' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('archiveAircraft', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(archiveAircraft(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when already archived', async () => {
      aircraftFindUnique.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      await expect(archiveAircraft(staffActor(), 'aircraft_1')).rejects.toThrow(ConflictError);
    });

    it('sets archivedAt (AC 2)', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: new Date('2026-02-01T00:00:00.000Z') });

      const result = await archiveAircraft(staffActor(), 'aircraft_1');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'aircraft_1' }, data: { archivedAt: expect.any(Date) } }),
      );
      expect(result.archivedAt).not.toBeNull();
    });
  });

  describe('unarchiveAircraft', () => {
    it('throws NotFoundError for a missing aircraft', async () => {
      aircraftFindUnique.mockResolvedValue(null);
      await expect(unarchiveAircraft(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when not archived', async () => {
      aircraftFindUnique.mockResolvedValue(SELECTED_AIRCRAFT);
      await expect(unarchiveAircraft(staffActor(), 'aircraft_1')).rejects.toThrow(ConflictError);
    });

    it('clears archivedAt', async () => {
      aircraftFindUnique.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      aircraftUpdate.mockResolvedValue({ ...SELECTED_AIRCRAFT, archivedAt: null });

      const result = await unarchiveAircraft(staffActor(), 'aircraft_1');

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { archivedAt: null } }));
      expect(result.archivedAt).toBeNull();
    });
  });
});
