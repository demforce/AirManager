import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    person: {
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
const { archivePerson, createPerson, getPerson, listPeople, unarchivePerson, updatePerson } = await import(
  './people.service'
);
const { ConflictError, NotFoundError } = await import('./errors');

const findUniqueMock = vi.mocked(prisma.person.findUnique);
const findFirstMock = vi.mocked(prisma.person.findFirst);
const findManyMock = vi.mocked(prisma.person.findMany);
const countMock = vi.mocked(prisma.person.count);
const createMock = vi.mocked(prisma.person.create);
const updateMock = vi.mocked(prisma.person.update);
const transactionMock = vi.mocked(prisma.$transaction);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as users.service.test.ts): narrow each
// mock to the shapes this service actually reads.
type PersonFixture = Record<string, unknown> | null;
const personFindUnique = findUniqueMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const personFindFirst = findFirstMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const personCreate = createMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const personUpdate = updateMock as unknown as { mockResolvedValue: (v: PersonFixture) => void };
const transaction = transactionMock as unknown as { mockResolvedValue: (v: unknown) => void };

function staffActor(): Actor {
  return { userId: 'staff_1', personId: null, roles: ['STAFF'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const SELECTED_PERSON = {
  id: 'person_1',
  firstName: 'Maria',
  lastName: 'Bianchi',
  email: 'maria.bianchi@airmanager.local',
  phone: '+39 333 1234567',
  address: 'Via Roma 1, Torino',
  fiscalCode: 'BNCMRA80A01L219K',
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('people.service (story 2.1 — people.read/people.manage RBAC + CRUD/archiving)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findFirstMock.mockReset();
    findManyMock.mockReset();
    countMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    transactionMock.mockReset();
  });

  describe('authorization (AD-5, AC 3)', () => {
    it('listPeople rejects an actor without people.read', async () => {
      await expect(listPeople(pilotActor(), { page: 1, pageSize: 20, includeArchived: false })).rejects.toThrow(
        ForbiddenError,
      );
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('getPerson rejects an actor without people.read', async () => {
      await expect(getPerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
    });

    it('createPerson rejects an actor without people.manage', async () => {
      await expect(
        createPerson(pilotActor(), { firstName: 'X', lastName: 'Y', email: null, phone: null, address: null, fiscalCode: null }),
      ).rejects.toThrow(ForbiddenError);
      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('updatePerson rejects an actor without people.manage', async () => {
      await expect(updatePerson(pilotActor(), 'person_1', { firstName: 'X' })).rejects.toThrow(ForbiddenError);
    });

    it('archivePerson rejects an actor without people.manage', async () => {
      await expect(archivePerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
    });

    it('unarchivePerson rejects an actor without people.manage', async () => {
      await expect(unarchivePerson(pilotActor(), 'person_1')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('listPeople', () => {
    it('returns the AD-8 paginated shape', async () => {
      transaction.mockResolvedValue([[SELECTED_PERSON], 1]);

      const result = await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      expect(result).toEqual({
        items: [
          {
            id: 'person_1',
            firstName: 'Maria',
            lastName: 'Bianchi',
            email: 'maria.bianchi@airmanager.local',
            phone: '+39 333 1234567',
            address: 'Via Roma 1, Torino',
            fiscalCode: 'BNCMRA80A01L219K',
            archivedAt: null,
            createdAt: SELECTED_PERSON.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('excludes archived persons by default (AC 2)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({ archivedAt: null });
    });

    it('includes archived persons when includeArchived is true (AC 2)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: true });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).not.toHaveProperty('archivedAt');
    });

    it('searches first name, last name and email case-insensitively (AC 1)', async () => {
      transaction.mockResolvedValue([[], 0]);

      await listPeople(staffActor(), { page: 1, pageSize: 20, includeArchived: false, q: 'maria' });

      const findManyCall = findManyMock.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(findManyCall.where).toMatchObject({
        OR: [
          { firstName: { contains: 'maria', mode: 'insensitive' } },
          { lastName: { contains: 'maria', mode: 'insensitive' } },
          { email: { contains: 'maria', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('getPerson', () => {
    it('throws NotFoundError for a missing id', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(getPerson(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('returns the mapped person', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      const result = await getPerson(staffActor(), 'person_1');
      expect(result.id).toBe('person_1');
    });
  });

  describe('createPerson', () => {
    const input = {
      firstName: 'Maria',
      lastName: 'Bianchi',
      email: 'maria.bianchi@airmanager.local',
      phone: '+39 333 1234567',
      address: 'Via Roma 1, Torino',
      fiscalCode: 'BNCMRA80A01L219K',
    };

    it('creates the person (AC 1)', async () => {
      personFindFirst.mockResolvedValue(null); // no existing conflict
      personCreate.mockResolvedValue(SELECTED_PERSON);

      const result = await createPerson(staffActor(), input);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ firstName: 'Maria', lastName: 'Bianchi', email: input.email }),
        }),
      );
      expect(result.id).toBe('person_1');
    });

    it('throws ConflictError when the email is already taken', async () => {
      personFindFirst.mockResolvedValue({ id: 'other_person' });

      await expect(createPerson(staffActor(), input)).rejects.toThrow(ConflictError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('throws ConflictError when the fiscal code is already taken', async () => {
      personFindFirst.mockResolvedValue({ id: 'other_person' });

      await expect(
        createPerson(staffActor(), { ...input, email: null, fiscalCode: 'BNCMRA80A01L219K' }),
      ).rejects.toThrow(ConflictError);
    });

    it('never conflicts when email and fiscalCode are both omitted', async () => {
      personCreate.mockResolvedValue({ ...SELECTED_PERSON, email: null, fiscalCode: null });

      await createPerson(staffActor(), { firstName: 'X', lastName: 'Y', email: null, phone: null, address: null, fiscalCode: null });

      expect(findFirstMock).not.toHaveBeenCalled();
    });

    it('maps a race-condition P2002 to ConflictError', async () => {
      personFindFirst.mockResolvedValue(null);
      createMock.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

      await expect(createPerson(staffActor(), input)).rejects.toThrow(ConflictError);
    });
  });

  describe('updatePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(updatePerson(staffActor(), 'missing', { firstName: 'X' })).rejects.toThrow(NotFoundError);
    });

    it('updates only the provided fields', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, phone: '+39 333 7654321' });

      const result = await updatePerson(staffActor(), 'person_1', { phone: '+39 333 7654321' });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, data: { phone: '+39 333 7654321' } }),
      );
      expect(result.phone).toBe('+39 333 7654321');
    });

    it('allows clearing email (null) without a uniqueness check', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, email: null });

      await updatePerson(staffActor(), 'person_1', { email: null });

      expect(findFirstMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { email: null } }));
    });

    it('throws ConflictError when re-using an email already taken by another person', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personFindFirst.mockResolvedValue({ id: 'someone_else' });

      await expect(
        updatePerson(staffActor(), 'person_1', { email: 'taken@airmanager.local' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('archivePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(archivePerson(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when already archived', async () => {
      personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      await expect(archivePerson(staffActor(), 'person_1')).rejects.toThrow(ConflictError);
    });

    it('sets archivedAt (AC 2)', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });

      const result = await archivePerson(staffActor(), 'person_1');

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'person_1' }, data: { archivedAt: expect.any(Date) } }),
      );
      expect(result.archivedAt).not.toBeNull();
    });
  });

  describe('unarchivePerson', () => {
    it('throws NotFoundError for a missing person', async () => {
      personFindUnique.mockResolvedValue(null);
      await expect(unarchivePerson(staffActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when not archived', async () => {
      personFindUnique.mockResolvedValue(SELECTED_PERSON);
      await expect(unarchivePerson(staffActor(), 'person_1')).rejects.toThrow(ConflictError);
    });

    it('clears archivedAt', async () => {
      personFindUnique.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: new Date('2026-02-01T00:00:00.000Z') });
      personUpdate.mockResolvedValue({ ...SELECTED_PERSON, archivedAt: null });

      const result = await unarchivePerson(staffActor(), 'person_1');

      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { archivedAt: null } }));
      expect(result.archivedAt).toBeNull();
    });
  });
});
