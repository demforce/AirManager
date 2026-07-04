import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from './password';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { authorizeCredentials } = await import('./authorize');

const findUniqueMock = vi.mocked(prisma.user.findUnique);

describe('authorizeCredentials (Credentials provider authorize())', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('returns the user for correct credentials of an active user', async () => {
    const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
    findUniqueMock.mockResolvedValue({
      id: 'user_1',
      email: 'pilot@airmanager.local',
      passwordHash,
      isActive: true,
      roles: ['PILOT'],
      personId: 'person_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await authorizeCredentials({
      email: 'pilot@airmanager.local',
      password: 'CorrectHorseBatteryStaple1!',
    });

    expect(result).toEqual({
      id: 'user_1',
      email: 'pilot@airmanager.local',
      roles: ['PILOT'],
      personId: 'person_1',
    });
  });

  it('returns null for a non-existent user', async () => {
    findUniqueMock.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: 'nobody@airmanager.local',
      password: 'whatever',
    });

    expect(result).toBeNull();
  });

  it('returns null for an inactive user, even with the correct password', async () => {
    const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
    findUniqueMock.mockResolvedValue({
      id: 'user_2',
      email: 'inactive@airmanager.local',
      passwordHash,
      isActive: false,
      roles: ['PILOT'],
      personId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await authorizeCredentials({
      email: 'inactive@airmanager.local',
      password: 'CorrectHorseBatteryStaple1!',
    });

    expect(result).toBeNull();
  });

  it('returns null for a wrong password', async () => {
    const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
    findUniqueMock.mockResolvedValue({
      id: 'user_3',
      email: 'pilot@airmanager.local',
      passwordHash,
      isActive: true,
      roles: ['PILOT'],
      personId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await authorizeCredentials({
      email: 'pilot@airmanager.local',
      password: 'wrong-password',
    });

    expect(result).toBeNull();
  });

  it('returns null for malformed credentials (schema validation)', async () => {
    const result = await authorizeCredentials({ email: 'not-an-email', password: '' });

    expect(result).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
