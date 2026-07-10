import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/server/auth/rbac';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { getMe } = await import('./me.service');
const { NotFoundError } = await import('./errors');

const findUniqueMock = vi.mocked(prisma.user.findUnique);

function actorWith(roles: Actor['roles']): Actor {
  return { userId: 'user_1', personId: 'person_1', roles };
}

// The mocked `findUnique` is typed against Prisma's overloaded signature,
// which picks an unrelated overload for `mockResolvedValue`'s parameter
// type. We only ever call it the one way `me.service.ts` does (a fixed
// `select`), so narrow the mock's resolved-value type to that shape here
// instead of using `any` at every call site below.
type MeSelectResult = {
  id: string;
  email: string;
  roles: Actor['roles'];
  person: { id: string; firstName: string; lastName: string; studentProfile: { deactivatedAt: Date | null } | null } | null;
} | null;
const findUnique = findUniqueMock as unknown as {
  mockResolvedValue: (value: MeSelectResult) => void;
};

describe('getMe (Story 1.3 Task 3 — first real service)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('returns the caller’s own user + person data (self.read, granted to every role)', async () => {
    findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'pilot@airmanager.local',
      roles: ['PILOT'],
      person: { id: 'person_1', firstName: 'Piero', lastName: 'Volante', studentProfile: null },
    });

    const result = await getMe(actorWith(['PILOT']));

    expect(result).toEqual({
      userId: 'user_1',
      email: 'pilot@airmanager.local',
      roles: ['PILOT'],
      person: { id: 'person_1', firstName: 'Piero', lastName: 'Volante', hasActiveStudentProfile: false },
    });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: {
        id: true,
        email: true,
        roles: true,
        person: {
          select: { id: true, firstName: true, lastName: true, studentProfile: { select: { deactivatedAt: true } } },
        },
      },
    });
  });

  it('returns a null person when the user has none linked yet', async () => {
    findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'staff@airmanager.local',
      roles: ['STAFF'],
      person: null,
    });

    const result = await getMe(actorWith(['STAFF']));

    expect(result.person).toBeNull();
  });

  it('sets hasActiveStudentProfile = true only for an ACTIVE (non-deactivated) student profile (story 9.2)', async () => {
    findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@airmanager.local',
      roles: ['STUDENT'],
      person: { id: 'person_1', firstName: 'Sara', lastName: 'Allieva', studentProfile: { deactivatedAt: null } },
    });

    const result = await getMe(actorWith(['STUDENT']));
    expect(result.person?.hasActiveStudentProfile).toBe(true);
  });

  it('sets hasActiveStudentProfile = false for a DEACTIVATED student profile', async () => {
    findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'student@airmanager.local',
      roles: ['STUDENT'],
      person: { id: 'person_1', firstName: 'Sara', lastName: 'Allieva', studentProfile: { deactivatedAt: new Date('2026-01-01T00:00:00.000Z') } },
    });

    const result = await getMe(actorWith(['STUDENT']));
    expect(result.person?.hasActiveStudentProfile).toBe(false);
  });

  it('throws NotFoundError when the session references a user that no longer exists', async () => {
    findUnique.mockResolvedValue(null);

    await expect(getMe(actorWith(['ADMIN']))).rejects.toThrow(NotFoundError);
  });
});
