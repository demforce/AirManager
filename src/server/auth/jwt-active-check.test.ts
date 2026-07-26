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
// only ever selects `{ isActive, roles, tokenVersion }`.
const findUnique = findUniqueMock as unknown as {
  mockResolvedValue: (value: { isActive: boolean; roles: string[]; tokenVersion: number } | null) => void;
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
    findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 0 });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { isActive: true, roles: true, tokenVersion: true },
    });
    expect(result).not.toBeNull();
    expect(result?.lastActiveCheck).toBe(now);
  });

  it('invalidates the token (returns null) when the user has been deactivated', async () => {
    const now = 1_000_000;
    const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS - 1 });
    findUnique.mockResolvedValue({ isActive: false, roles: ['PILOT'], tokenVersion: 0 });

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
    findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 0 });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(result?.lastActiveCheck).toBe(now);
  });

  it('propagates a DB role change onto token.roles once the recheck is due', async () => {
    const now = 1_000_000;
    const token = makeToken({ roles: ['PILOT'], lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 0 });
    findUnique.mockResolvedValue({ isActive: true, roles: ['ADMIN'], tokenVersion: 0 });

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

  describe('TD-6, F1 (CWE-613) — tokenVersion watermark', () => {
    it('keeps the session alive when token.tokenVersion matches the DB', async () => {
      const now = 1_000_000;
      const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 2 });
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 2 });

      const result = await applyActiveRecheck(token, now);

      expect(result).not.toBeNull();
      expect(result?.tokenVersion).toBe(2);
    });

    it('evicts the session (returns null) when token.tokenVersion no longer matches the DB — the setPasswordWithToken bump caught up', async () => {
      const now = 1_000_000;
      // A session signed in while tokenVersion was 2; the account owner has
      // since reset their password, bumping the DB to 3.
      const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS, tokenVersion: 2 });
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 3 });

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
      findUnique.mockResolvedValue({ isActive: true, roles: ['PILOT'], tokenVersion: 0 });

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
