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
// unchanged: `reserveLoginAttempt` defaults to "always reserved" (never
// locked), `recordSuccessfulLogin` defaults to a no-op. The throttle's OWN
// rolling-window counting/atomicity logic is unit-tested directly in
// `login-throttle.test.ts`; this file only tests that `authorizeCredentials`
// WIRES to it correctly (called with the right args, in the right branch,
// with the timing-equalization property intact).
vi.mock('./login-throttle', () => ({
  reserveLoginAttempt: vi.fn(async () => true),
  recordSuccessfulLogin: vi.fn(async () => undefined),
}));

const { prisma } = await import('@/server/db/prisma');
const { authorizeCredentials } = await import('./authorize');
const { reserveLoginAttempt, recordSuccessfulLogin } = await import('./login-throttle');

const findUniqueMock = vi.mocked(prisma.user.findUnique);
const reserveLoginAttemptMock = vi.mocked(reserveLoginAttempt);
const recordSuccessMock = vi.mocked(recordSuccessfulLogin);

describe('authorizeCredentials (Credentials provider authorize())', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    reserveLoginAttemptMock.mockReset();
    reserveLoginAttemptMock.mockResolvedValue(true);
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
      tokenVersion: 3,
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

    // `tokenVersion` (story TD-6, F1) rides along on the returned NextAuth
    // user object so `auth.config.ts`'s `jwt` callback can stamp it.
    expect(result).toEqual({
      id: 'user_1',
      email: 'pilot@airmanager.local',
      roles: ['PILOT'],
      personId: 'person_1',
      tokenVersion: 3,
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
      tokenVersion: 0,
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
      tokenVersion: 0,
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
      tokenVersion: 0,
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

      expect(reserveLoginAttemptMock).toHaveBeenCalledWith('pilot@airmanager.local', '203.0.113.5');
    });

    it('defaults the IP to null when the caller omits it', async () => {
      findUniqueMock.mockResolvedValue(null);

      await authorizeCredentials({ email: 'pilot@airmanager.local', password: 'whatever' });

      expect(reserveLoginAttemptMock).toHaveBeenCalledWith('pilot@airmanager.local', null);
    });

    it('returns null and skips the DB user lookup entirely when not reserved (locked), but still pays the constant-time Argon2id cost (no new timing oracle)', async () => {
      reserveLoginAttemptMock.mockResolvedValue(false);
      const verifySpy = vi.spyOn(await import('./password'), 'verifyPassword');

      const result = await authorizeCredentials({ email: 'victim@airmanager.local', password: 'a-guess' }, '203.0.113.5');

      expect(result).toBeNull();
      // The dummy-hash equalization still runs — same cost as every other
      // failure branch — even though the real user row is never fetched.
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(findUniqueMock).not.toHaveBeenCalled();

      verifySpy.mockRestore();
    });

    // TD-6, F2: the reservation itself (atomically checked-and-inserted
    // BEFORE this point) is what records the failed attempt now — there is
    // no separate "record failed" call left in `authorizeCredentials` to
    // assert on. `login-throttle.test.ts` covers the reservation's own
    // atomicity/cap logic; here we only confirm `authorizeCredentials`
    // never mistakes a failure for a success.
    it('does not call recordSuccessfulLogin for an unknown email (reserved, but no such user)', async () => {
      findUniqueMock.mockResolvedValue(null);

      await authorizeCredentials({ email: 'nobody@airmanager.local', password: 'whatever' }, '203.0.113.9');

      expect(reserveLoginAttemptMock).toHaveBeenCalledWith('nobody@airmanager.local', '203.0.113.9');
      expect(recordSuccessMock).not.toHaveBeenCalled();
    });

    it('does not call recordSuccessfulLogin for a wrong password (reserved)', async () => {
      const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
      findUniqueMock.mockResolvedValue({
        id: 'user_3',
        email: 'pilot@airmanager.local',
        passwordHash,
        isActive: true,
        tokenVersion: 0,
        locale: 'it',
        roles: ['PILOT'],
        personId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await authorizeCredentials({ email: 'pilot@airmanager.local', password: 'wrong-password' }, '203.0.113.9');

      expect(recordSuccessMock).not.toHaveBeenCalled();
    });

    it('a successful login is never blocked and records success (clearing the reservation via the failure-history cleanup)', async () => {
      const passwordHash = await hashPassword('CorrectHorseBatteryStaple1!');
      findUniqueMock.mockResolvedValue({
        id: 'user_1',
        email: 'pilot@airmanager.local',
        passwordHash,
        isActive: true,
        tokenVersion: 0,
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
    });
  });
});
