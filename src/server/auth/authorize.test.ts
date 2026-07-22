import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from './password';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// H1 (CWE-307) throttle — mocked at the module boundary so every existing
// test below (none of which cares about the throttle) keeps working
// unchanged: `isLoginLocked` defaults to "never locked", the two recorders
// default to no-ops. The throttle's OWN rolling-window counting logic is
// unit-tested directly in `login-throttle.test.ts`; this file only tests
// that `authorizeCredentials` WIRES to it correctly (called with the right
// args, in the right branch, with the timing-equalization property intact).
vi.mock('./login-throttle', () => ({
  isLoginLocked: vi.fn(async () => false),
  recordFailedLoginAttempt: vi.fn(async () => undefined),
  recordSuccessfulLogin: vi.fn(async () => undefined),
}));

const { prisma } = await import('@/server/db/prisma');
const { authorizeCredentials } = await import('./authorize');
const { isLoginLocked, recordFailedLoginAttempt, recordSuccessfulLogin } = await import('./login-throttle');

const findUniqueMock = vi.mocked(prisma.user.findUnique);
const isLoginLockedMock = vi.mocked(isLoginLocked);
const recordFailedMock = vi.mocked(recordFailedLoginAttempt);
const recordSuccessMock = vi.mocked(recordSuccessfulLogin);

describe('authorizeCredentials (Credentials provider authorize())', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    isLoginLockedMock.mockReset();
    isLoginLockedMock.mockResolvedValue(false);
    recordFailedMock.mockReset();
    recordFailedMock.mockResolvedValue(undefined);
    recordSuccessMock.mockReset();
    recordSuccessMock.mockResolvedValue(undefined);
  });

  it('returns the user for correct credentials of an active user', async () => {
    const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
    findUniqueMock.mockResolvedValue({
      id: 'user_1',
      email: 'pilot@airmanager.local',
      passwordHash,
      isActive: true,
      locale: 'it',
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
      locale: 'it',
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

  it('returns null for an invited user who has not set a password yet (nullable passwordHash, story 1.4)', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'user_4',
      email: 'invited@airmanager.local',
      passwordHash: null,
      isActive: true,
      locale: 'it',
      roles: ['PILOT'],
      personId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await authorizeCredentials({
      email: 'invited@airmanager.local',
      password: 'whatever-they-guess',
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
      locale: 'it',
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

  describe('H1 (CWE-307) login throttle wiring', () => {
    it('checks the throttle with the (lowercased) email and the given IP before anything else', async () => {
      findUniqueMock.mockResolvedValue(null);

      await authorizeCredentials({ email: 'Pilot@AirManager.local', password: 'whatever' }, '203.0.113.5');

      expect(isLoginLockedMock).toHaveBeenCalledWith('pilot@airmanager.local', '203.0.113.5');
    });

    it('defaults the IP to null when the caller omits it', async () => {
      findUniqueMock.mockResolvedValue(null);

      await authorizeCredentials({ email: 'pilot@airmanager.local', password: 'whatever' });

      expect(isLoginLockedMock).toHaveBeenCalledWith('pilot@airmanager.local', null);
    });

    it('returns null and skips the DB user lookup entirely when locked, but still pays the constant-time Argon2id cost (no new timing oracle)', async () => {
      isLoginLockedMock.mockResolvedValue(true);
      const verifySpy = vi.spyOn(await import('./password'), 'verifyPassword');

      const result = await authorizeCredentials({ email: 'victim@airmanager.local', password: 'a-guess' }, '203.0.113.5');

      expect(result).toBeNull();
      // The dummy-hash equalization still runs — same cost as every other
      // failure branch — even though the real user row is never fetched.
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(findUniqueMock).not.toHaveBeenCalled();
      // No new row while already locked (login-throttle.ts's doc-comment):
      // a continued flood must not keep re-extending the lockout window.
      expect(recordFailedMock).not.toHaveBeenCalled();

      verifySpy.mockRestore();
    });

    it('records a failed attempt for an unknown email (not locked)', async () => {
      findUniqueMock.mockResolvedValue(null);

      await authorizeCredentials({ email: 'nobody@airmanager.local', password: 'whatever' }, '203.0.113.9');

      expect(recordFailedMock).toHaveBeenCalledWith('nobody@airmanager.local', '203.0.113.9');
      expect(recordSuccessMock).not.toHaveBeenCalled();
    });

    it('records a failed attempt for a wrong password (not locked)', async () => {
      const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
      findUniqueMock.mockResolvedValue({
        id: 'user_3',
        email: 'pilot@airmanager.local',
        passwordHash,
        isActive: true,
        locale: 'it',
        roles: ['PILOT'],
        personId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await authorizeCredentials({ email: 'pilot@airmanager.local', password: 'wrong-password' }, '203.0.113.9');

      expect(recordFailedMock).toHaveBeenCalledWith('pilot@airmanager.local', '203.0.113.9');
      expect(recordSuccessMock).not.toHaveBeenCalled();
    });

    it('a successful login is never blocked and records success (clearing the failure history) instead of a failure', async () => {
      const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
      findUniqueMock.mockResolvedValue({
        id: 'user_1',
        email: 'pilot@airmanager.local',
        passwordHash,
        isActive: true,
        locale: 'it',
        roles: ['PILOT'],
        personId: 'person_1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authorizeCredentials(
        { email: 'pilot@airmanager.local', password: 'CorrectHorseBatteryStaple1!' },
        '203.0.113.9',
      );

      expect(result).not.toBeNull();
      expect(recordSuccessMock).toHaveBeenCalledWith('pilot@airmanager.local', '203.0.113.9');
      expect(recordFailedMock).not.toHaveBeenCalled();
    });
  });
});
