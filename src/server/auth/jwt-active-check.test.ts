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
// only ever selects `{ isActive }`.
const findUnique = findUniqueMock as unknown as {
  mockResolvedValue: (value: { isActive: boolean } | null) => void;
};

function makeToken(overrides: Partial<JWT> = {}): JWT {
  return {
    userId: 'user_1',
    roles: ['PILOT'],
    personId: null,
    lastActiveCheck: 0,
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
    const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS });
    findUnique.mockResolvedValue({ isActive: true });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: { isActive: true },
    });
    expect(result).not.toBeNull();
    expect(result?.lastActiveCheck).toBe(now);
  });

  it('invalidates the token (returns null) when the user has been deactivated', async () => {
    const now = 1_000_000;
    const token = makeToken({ lastActiveCheck: now - ACTIVE_RECHECK_INTERVAL_MS - 1 });
    findUnique.mockResolvedValue({ isActive: false });

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
    findUnique.mockResolvedValue({ isActive: true });

    const result = await applyActiveRecheck(token, now);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(result?.lastActiveCheck).toBe(now);
  });
});
