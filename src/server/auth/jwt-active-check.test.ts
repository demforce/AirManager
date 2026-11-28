import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JWT } from 'next-auth/jwt';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/server/db/prisma');
const { applyActiveRecheck, ACTIVE_RECHECK_INTERVAL_MS } = await import('./jwt-active-check');

const findUniqueMock = vi.mocked(prisma.user.findUnique);
// Prisma's overloaded `findUnique` type makes `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as me.service.test.ts) — the recheck
// returns a projection of the user, not a complete record.
const findUnique = findUniqueMock as unknown as {
  mockResolvedValue: (value: { isActive: boolean; roles: string[]; tokenVersion: number; personId: string | null } | null) => void;
};

function makeToken(overrides: Partial<JWT> = {}): JWT {
  return {
    userId: 'user_1',
    roles: ['PILOT'],
    personId: null,
    lastActiveCheck: 0,
    tokenVersion: 0,
    ...overrides,
  } as JWT;
}

describe('applyActiveRecheck (story 1.4, AC 2 — mocked time)', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it.each([
    { isActive: true, roles: ['PILOT'], tokenVersion: 2, adminPasswordVersion: 1 },
    { isActive: false, roles: ['ADMIN'], tokenVersion: 2, adminPasswordVersion: 1 },
    { isActive: true, roles: ['ADMIN'], tokenVersion: 3, adminPasswordVersion: 1 },
    { isActive: true, roles: ['ADMIN'], tokenVersion: 2, adminPasswordVersion: 2 },
  ])('ends admin password sessions on the next read after eligibility or version changes: %o', async (user) => {
    findUnique.mockResolvedValue({ ...user, personId: null });
    const token = makeToken({ roles: ['ADMIN'], tokenVersion: 2, adminPasswordVersion: 1, lastActiveCheck: 10_000 });
    expect(await applyActiveRecheck(token, 10_001)).toBeNull();
  });

  it('closes an admin session with a sanitized diagnostic when its live check is unavailable', async () => {
    const audit = vi.spyOn(console, 'warn').mockImplementation(() => {});
    findUniqueMock.mockRejectedValueOnce(new Error('synthetic-private-diagnostic'));
    try {
      expect(await applyActiveRecheck(makeToken({ adminPasswordVersion: 0 }))).toBeNull();
      expect(JSON.parse(audit.mock.calls[0]![0])).toEqual({
        event: 'admin_password_session_check', at: expect.any(String), outcome: 'error',
      });
    } finally {
      audit.mockRestore();
    }
  });

  it('skips the DB recheck when the interval has not elapsed yet', async () => {
    const now = 1_000_000;
    const token = makeToken({ lastActiveCheck: now - (ACTIVE_RECHECK_INTERVAL_MS - 1) });

    const result = await applyActiveRecheck(token, now);

    expect(result).toBe(token);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('rechecks exactly at the interval boundary and refreshes the watermark for an active user', async () => {
    const now = 1_000_000;
    const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 0 });
    findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 0, personId: null });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { isActive: true, roles: true, tokenVersion: true, personId: true },
    });
    expect(result).not.toBeNull();
    expect(result?.lastActiveCheck).toBe(now);
  });

  it('invalidates the token (returns null) when the user has been deactivated', async () => {
    const now = 1_000_000;
    const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS - 1 });
    findUnique.mockResolvedValue({ isActive: false, roles: ['PILOT'], tokenVersion: 0, personId: null });

    const result = await applyActiveRecheck(token, now);

    expect(result).toBeNull();
  });

  it('invalidates the token (returns null) when the user no longer exists', async () => {
    const now = 1_000_000;
    const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS - 1 });
    findUnique.mockResolvedValue(null);

    const result = await applyActiveRecheck(token, now);

    expect(result).toBeNull();
  });

  it('treats a token with no prior check (lastActiveCheck 0) as immediately due for a recheck', async () => {
    const now = Date.now();
    const token = makeToken({ lastActiveCheck: 0 });
    findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 0, personId: null });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(result?.lastActiveCheck).toBe(now);
  });

  it('propagates a DB role change onto token.roles once the recheck is due', async () => {
    const now = 1_000_000;
    const token = makeToken({ roles: ['PILOT'], lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 0 });
    findUnique.mockResolvedValue({ isActive: true, roles: ['ADMIN'], tokenVersion: 0, personId: null });

    const result = await applyActiveRecheck(token, now);

    expect(result).not.toBeNull();
    expect(result?.roles).toEqual(['ADMIN']);
  });

  it('leaves token.roles unchanged when the recheck interval has not elapsed yet', async () => {
    const now = 1_000_000;
    const token = makeToken({ roles: ['PILOT'], lastActiveCheck: now - (ACTIVE_RECHECK_INTERVAL_MS - 1) });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(result).toBe(token);
    expect(result?.roles).toEqual(['PILOT']);
  });

  describe('story 16.7 — linked person', () => {
    it('evicts a session whose linked person no longer matches, even at the current token version', async () => {
      const now = 1_000_000;
      const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 2, personId: 'person_1' });
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 2, personId: 'person_2' });

      expect(await applyActiveRecheck(token, now)).toBeNull();
    });

    it('keeps a session with the current version and linked person', async () => {
      const now = 1_000_000;
      const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 2, personId: 'person_1' });
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 2, personId: 'person_1' });

      const result = await applyActiveRecheck(token, now);

      expect(result?.personId).toBe('person_1');
      expect(result?.lastActiveCheck).toBe(now);
    });
  });

  describe('TD-6, F1 (CWE-613) — tokenVersion watermark', () => {
    it('keeps the session alive when token.tokenVersion matches the DB', async () => {
      const now = 1_000_000;
      const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 2 });
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 2, personId: null });

      const result = await applyActiveRecheck(token, now);

      expect(result).not.toBeNull();
      expect(result?.tokenVersion).toBe(2);
    });

    it('evicts the session (returns null) when token.tokenVersion no longer matches the DB — the setPasswordWithToken bump caught up', async () => {
      const now = 1_000_000;
      // A session signed in while tokenVersion was 2; the account owner has
      // since reset their password, bumping the DB to 3.
      const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 2 });
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 3, personId: null });

      const result = await applyActiveRecheck(token, now);

      expect(result).toBeNull();
    });

    it('evicts the session (returns null) when the token carries NO tokenVersion claim at all (issued before the field existed)', async () => {
      const now = 1_000_000;
      // Deliberately built without going through `makeToken` so the claim is
      // truly ABSENT, not merely `0` — simulates a JWT signed before this
      // story's migration shipped.
      const token = {
        userId: 'user_1',
        roles: ['PILOT'],
        personId: null,
        lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS,
      } as JWT;
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 0, personId: null });

      const result = await applyActiveRecheck(token, now);

      expect(result).toBeNull();
    });

    it('does not compare tokenVersion at all when the recheck interval has not elapsed yet (no DB call)', async () => {
      const now = 1_000_000;
      const token = makeToken({ lastActiveCheck: now - (ACTIVE_RECHECK_INTERVAL_MS - 1), tokenVersion: 2 });

      const result = await applyActiveRecheck(token, now);

      expect(findUniqueMock).not.toHaveBeenCalled();
      expect(result).toBe(token);
    });
  });
});
