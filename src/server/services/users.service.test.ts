import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';
import { ForbiddenError } from './errors';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    person: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('./auth-tokens.service', () => ({
  sendInviteEmail: vi.fn(),
}));

const { prisma } = await import('@/server/db/prisma');
const { sendInviteEmail } = await import('./auth-tokens.service');
const { createUser, getUser, listAvailablePersons, listUsers, resendInvite, updateUser } = await import(
  './users.service'
);
const { ConflictError, NotFoundError } = await import('./errors');

const findUniqueMock = vi.mocked(prisma.user.findUnique);
const findManyMock = vi.mocked(prisma.user.findMany);
const countMock = vi.mocked(prisma.user.count);
const createMock = vi.mocked(prisma.user.create);
const updateMock = vi.mocked(prisma.user.update);
const personFindUniqueMock = vi.mocked(prisma.person.findUnique);
const personFindManyMock = vi.mocked(prisma.person.findMany);
const transactionMock = vi.mocked(prisma.$transaction);
const sendInviteEmailMock = vi.mocked(sendInviteEmail);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as me.service.test.ts): narrow each
// mock to the shapes this service actually reads.
type UserFixture = Record<string, unknown> | null;
const userFindUnique = findUniqueMock as unknown as {
  mockResolvedValue: (v: UserFixture) => void;
  mockResolvedValueOnce: (v: UserFixture) => void;
};
const userCreate = createMock as unknown as { mockResolvedValue: (v: UserFixture) => void };
const userUpdate = updateMock as unknown as { mockResolvedValue: (v: UserFixture) => void };
const personFindUnique = personFindUniqueMock as unknown as {
  mockResolvedValue: (v: { id: string; user: { id: string } | null } | null) => void;
};
const personFindMany = personFindManyMock as unknown as {
  mockResolvedValue: (v: Array<{ id: string; firstName: string; lastName: string }>) => void;
};
const transaction = transactionMock as unknown as { mockResolvedValue: (v: unknown) => void };

function adminActor(): Actor {
  return { userId: 'admin_1', personId: null, roles: ['ADMIN'] };
}

function pilotActor(): Actor {
  return { userId: 'pilot_1', personId: 'person_pilot', roles: ['PILOT'] };
}

const SELECTED_USER = {
  id: 'user_1',
  email: 'invitee@airmanager.local',
  roles: ['PILOT'] as const,
  isActive: true,
  locale: 'it',
  passwordHash: null,
  person: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('users.service (story 1.4 — users.manage RBAC + create/update/resend)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findManyMock.mockReset();
    countMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    personFindUniqueMock.mockReset();
    personFindManyMock.mockReset();
    transactionMock.mockReset();
    sendInviteEmailMock.mockReset();
  });

  describe('authorization (AD-5)', () => {
    it('listUsers rejects an actor without users.manage', async () => {
      await expect(listUsers(pilotActor(), { page: 1, pageSize: 20 })).rejects.toThrow(ForbiddenError);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('createUser rejects an actor without users.manage', async () => {
      await expect(
        createUser(pilotActor(), { email: 'x@airmanager.local', roles: ['PILOT'], locale: 'it', personId: null }),
      ).rejects.toThrow(ForbiddenError);
      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it('updateUser rejects an actor without users.manage', async () => {
      await expect(updateUser(pilotActor(), 'user_1', { isActive: false })).rejects.toThrow(ForbiddenError);
    });

    it('resendInvite rejects an actor without users.manage', async () => {
      await expect(resendInvite(pilotActor(), 'user_1')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('listUsers', () => {
    it('returns the AD-8 paginated shape', async () => {
      transaction.mockResolvedValue([[SELECTED_USER], 1]);

      const result = await listUsers(adminActor(), { page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: [
          {
            id: 'user_1',
            email: 'invitee@airmanager.local',
            roles: ['PILOT'],
            isActive: true,
            locale: 'it',
            passwordSet: false,
            person: null,
            createdAt: SELECTED_USER.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe('getUser', () => {
    it('throws NotFoundError for a missing id', async () => {
      userFindUnique.mockResolvedValue(null);
      await expect(getUser(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('maps passwordHash presence to passwordSet: true', async () => {
      userFindUnique.mockResolvedValue({ ...SELECTED_USER, passwordHash: 'argon2id$...' });
      const result = await getUser(adminActor(), 'user_1');
      expect(result.passwordSet).toBe(true);
    });
  });

  describe('createUser', () => {
    it('creates the user with passwordHash null and sends the invite email (AC 1)', async () => {
      userFindUnique.mockResolvedValue(null); // no existing user with that email
      userCreate.mockResolvedValue(SELECTED_USER);
      sendInviteEmailMock.mockResolvedValue(undefined);

      const result = await createUser(adminActor(), {
        email: 'invitee@airmanager.local',
        roles: ['PILOT'],
        locale: 'it',
        personId: null,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: null, isActive: true }) }),
      );
      expect(sendInviteEmailMock).toHaveBeenCalledWith('user_1', 'invitee@airmanager.local', 'it');
      expect(result.passwordSet).toBe(false);
    });

    it('throws ConflictError when the email is already taken', async () => {
      userFindUnique.mockResolvedValue(SELECTED_USER);

      await expect(
        createUser(adminActor(), {
          email: 'invitee@airmanager.local',
          roles: ['PILOT'],
          locale: 'it',
          personId: null,
        }),
      ).rejects.toThrow(ConflictError);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when personId does not exist', async () => {
      userFindUnique.mockResolvedValue(null);
      personFindUnique.mockResolvedValue(null);

      await expect(
        createUser(adminActor(), {
          email: 'invitee@airmanager.local',
          roles: ['PILOT'],
          locale: 'it',
          personId: 'ghost_person',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when personId is already linked to a different user', async () => {
      userFindUnique.mockResolvedValue(null);
      personFindUnique.mockResolvedValue({ id: 'person_2', user: { id: 'other_user' } });

      await expect(
        createUser(adminActor(), {
          email: 'invitee@airmanager.local',
          roles: ['PILOT'],
          locale: 'it',
          personId: 'person_2',
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('still returns the created user when the invite email fails to send', async () => {
      userFindUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue(SELECTED_USER);
      sendInviteEmailMock.mockRejectedValue(new Error('SMTP unreachable'));

      const result = await createUser(adminActor(), {
        email: 'invitee@airmanager.local',
        roles: ['PILOT'],
        locale: 'it',
        personId: null,
      });

      expect(result.id).toBe('user_1');
    });
  });

  describe('updateUser', () => {
    it('throws NotFoundError for a missing user', async () => {
      userFindUnique.mockResolvedValue(null);
      await expect(updateUser(adminActor(), 'missing', { isActive: false })).rejects.toThrow(NotFoundError);
    });

    it('deactivates a user (AC 2)', async () => {
      userFindUnique.mockResolvedValue(SELECTED_USER);
      userUpdate.mockResolvedValue({ ...SELECTED_USER, isActive: false });

      const result = await updateUser(adminActor(), 'user_1', { isActive: false });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user_1' }, data: { isActive: false } }),
      );
      expect(result.isActive).toBe(false);
    });

    it('allows unlinking the person (personId: null) without a Person lookup', async () => {
      userFindUnique.mockResolvedValue(SELECTED_USER);
      userUpdate.mockResolvedValue(SELECTED_USER);

      await updateUser(adminActor(), 'user_1', { personId: null });

      expect(personFindUniqueMock).not.toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { personId: null } }));
    });

    it('throws ConflictError when re-linking to a person already linked elsewhere', async () => {
      userFindUnique.mockResolvedValue(SELECTED_USER);
      personFindUnique.mockResolvedValue({ id: 'person_2', user: { id: 'someone_else' } });

      await expect(updateUser(adminActor(), 'user_1', { personId: 'person_2' })).rejects.toThrow(ConflictError);
    });

    describe('email (story TD-7, AC 4 — single-email-field propagation)', () => {
      it('updates the email when it is free', async () => {
        // First findUnique is the "existing user" lookup, second is the
        // email-availability check — both hit the same mock in sequence.
        userFindUnique.mockResolvedValueOnce(SELECTED_USER);
        userFindUnique.mockResolvedValueOnce(null);
        userUpdate.mockResolvedValue({ ...SELECTED_USER, email: 'new@airmanager.local' });

        const result = await updateUser(adminActor(), 'user_1', { email: 'new@airmanager.local' });

        expect(updateMock).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'user_1' }, data: { email: 'new@airmanager.local' } }),
        );
        expect(result.email).toBe('new@airmanager.local');
      });

      it('throws ConflictError when the email is already taken by another user', async () => {
        userFindUnique.mockResolvedValueOnce(SELECTED_USER);
        userFindUnique.mockResolvedValueOnce({ ...SELECTED_USER, id: 'other_user' });

        await expect(updateUser(adminActor(), 'user_1', { email: 'taken@airmanager.local' })).rejects.toThrow(
          ConflictError,
        );
        expect(updateMock).not.toHaveBeenCalled();
      });

      it('allows re-submitting the user’s own current email (no conflict against itself)', async () => {
        userFindUnique.mockResolvedValueOnce(SELECTED_USER);
        userFindUnique.mockResolvedValueOnce(SELECTED_USER);
        userUpdate.mockResolvedValue(SELECTED_USER);

        await updateUser(adminActor(), 'user_1', { email: SELECTED_USER.email });

        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ data: { email: SELECTED_USER.email } }));
      });
    });
  });

  describe('resendInvite', () => {
    it('throws NotFoundError for a missing user', async () => {
      userFindUnique.mockResolvedValue(null);
      await expect(resendInvite(adminActor(), 'missing')).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictError when the user already set a password', async () => {
      userFindUnique.mockResolvedValue({ ...SELECTED_USER, passwordHash: 'argon2id$...' });
      await expect(resendInvite(adminActor(), 'user_1')).rejects.toThrow(ConflictError);
    });

    it('re-sends the invite for a user who has not set a password yet', async () => {
      userFindUnique.mockResolvedValue(SELECTED_USER);
      sendInviteEmailMock.mockResolvedValue(undefined);

      await resendInvite(adminActor(), 'user_1');

      expect(sendInviteEmailMock).toHaveBeenCalledWith('user_1', 'invitee@airmanager.local', 'it');
    });
  });

  describe('listAvailablePersons', () => {
    it('rejects an actor without users.manage', async () => {
      await expect(listAvailablePersons(pilotActor())).rejects.toThrow(ForbiddenError);
    });

    it('returns unlinked persons for an authorized actor', async () => {
      personFindMany.mockResolvedValue([{ id: 'person_3', firstName: 'Maria', lastName: 'Bianchi' }]);

      const result = await listAvailablePersons(adminActor());

      expect(result).toEqual([{ id: 'person_3', firstName: 'Maria', lastName: 'Bianchi' }]);
    });
  });
});
