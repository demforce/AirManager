import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    APP_URL: 'http://localhost:3000',
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    MAIL_FROM: 'AirManager <no-reply@airmanager.local>',
  },
}));

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    authToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    passwordResetAttempt: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/server/auth/password', () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
}));

const sendMock = vi.fn();
vi.mock('@/server/adapters/mail', () => ({
  getMailSender: vi.fn(() => ({ send: sendMock })),
}));

vi.mock('@/server/adapters/mail/templates', () => ({
  buildInviteEmail: vi.fn(async () => ({ subject: 'Invite subject', text: 'Invite text' })),
  buildPasswordResetEmail: vi.fn(async () => ({ subject: 'Reset subject', text: 'Reset text' })),
}));

const { prisma } = await import('@/server/db/prisma');
const { hashPassword } = await import('@/server/auth/password');
const { buildInviteEmail, buildPasswordResetEmail } = await import('@/server/adapters/mail/templates');
const {
  requestPasswordReset,
  sendInviteEmail,
  setPasswordWithToken,
  isPasswordResetThrottled,
  INVITE_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} = await import('./auth-tokens.service');
const { ValidationError } = await import('./errors');

const findUniqueUserMock = vi.mocked(prisma.user.findUnique);
const updateUserMock = vi.mocked(prisma.user.update);
const updateManyTokenMock = vi.mocked(prisma.authToken.updateMany);
const createTokenMock = vi.mocked(prisma.authToken.create);
const findUniqueTokenMock = vi.mocked(prisma.authToken.findUnique);
const findFirstTokenMock = vi.mocked(prisma.authToken.findFirst);
const transactionMock = vi.mocked(prisma.$transaction);
const resetAttemptCountMock = vi.mocked(prisma.passwordResetAttempt.count);
const resetAttemptCreateMock = vi.mocked(prisma.passwordResetAttempt.create);

// Prisma's overloaded delegate types make `mockResolvedValue`'s literal
// fixtures ambiguous (same workaround as me.service.test.ts): narrow to the
// shapes this service actually reads.
const userFindUnique = findUniqueUserMock as unknown as {
  mockResolvedValue: (v: { id: string; email: string; isActive: boolean; locale: string } | null) => void;
};
const tokenFindUnique = findUniqueTokenMock as unknown as {
  mockResolvedValue: (
    v: { id: string; userId: string; usedAt: Date | null; expiresAt: Date } | null,
  ) => void;
};

describe('auth-tokens.service (story 1.4, AC 1/3)', () => {
  beforeEach(() => {
    findUniqueUserMock.mockReset();
    updateUserMock.mockReset();
    updateManyTokenMock.mockReset();
    createTokenMock.mockReset();
    findUniqueTokenMock.mockReset();
    findFirstTokenMock.mockReset();
    transactionMock.mockReset();
    resetAttemptCountMock.mockReset();
    resetAttemptCountMock.mockResolvedValue(0);
    resetAttemptCreateMock.mockReset();
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    vi.mocked(hashPassword).mockClear();
    vi.mocked(buildInviteEmail).mockClear();
    vi.mocked(buildPasswordResetEmail).mockClear();

    // Interactive-callback stand-in (story TD-1, AC 3: `issueAuthToken` now
    // uses `$transaction(async (tx) => ...)`, not the batch/array form) —
    // same pattern as `mockTransaction` in `cash.service.test.ts`: a
    // function argument is INVOKED with the mocked `prisma` as `tx` (never
    // just returned unexecuted), a legacy array argument still falls back to
    // `Promise.all`.
    transactionMock.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops as Promise<unknown>[]);
      }
      if (typeof ops === 'function') {
        return (ops as (tx: unknown) => unknown)(prisma);
      }
      return ops;
    });
  });

  describe('token lifetimes', () => {
    it('invite tokens live for 7 days', () => {
      expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('password-reset tokens live for 2 hours', () => {
      expect(PASSWORD_RESET_TTL_MS).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe('sendInviteEmail (AC 1)', () => {
    it('invalidates prior unused invite tokens, creates a new one, and sends the invite email', async () => {
      await sendInviteEmail('user_1', 'invitee@airmanager.local', 'it');

      expect(updateManyTokenMock).toHaveBeenCalledWith({
        where: { userId: 'user_1', type: 'INVITE', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(createTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user_1', type: 'INVITE' }),
        }),
      );
      expect(buildInviteEmail).toHaveBeenCalledWith(
        'it',
        expect.objectContaining({ expiresInDays: 7, setPasswordUrl: expect.stringContaining('/set-password?token=') }),
      );
      expect(sendMock).toHaveBeenCalledWith({
        to: 'invitee@airmanager.local',
        subject: 'Invite subject',
        text: 'Invite text',
      });
    });
  });

  describe('requestPasswordReset (AC 3 — no enumeration)', () => {
    it('is silent and does equivalent work for an unknown email (no token, no email)', async () => {
      userFindUnique.mockResolvedValue(null);

      await expect(requestPasswordReset('nobody@airmanager.local')).resolves.toBeUndefined();

      expect(createTokenMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
      // Equivalent-cost DB lookup for the "doesn't exist" branch (Dev Notes).
      expect(findFirstTokenMock).toHaveBeenCalledTimes(1);
    });

    it('is silent and does equivalent work for an inactive user', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user_1',
        email: 'inactive@airmanager.local',
        isActive: false,
        locale: 'it',
      });

      await requestPasswordReset('inactive@airmanager.local');

      expect(createTokenMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('issues a reset token and sends the email (fire-and-forget) for an active user', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user_1',
        email: 'pilot@airmanager.local',
        isActive: true,
        locale: 'en',
      });

      await requestPasswordReset('pilot@airmanager.local');
      // Let the fire-and-forget `.send(...)` microtask settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(createTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user_1', type: 'PASSWORD_RESET' }) }),
      );
      expect(buildPasswordResetEmail).toHaveBeenCalledWith('en', expect.objectContaining({ expiresInHours: 2 }));
      expect(sendMock).toHaveBeenCalledWith({
        to: 'pilot@airmanager.local',
        subject: 'Reset subject',
        text: 'Reset text',
      });
    });

    it('never throws even if the mail send fails (fire-and-forget)', async () => {
      userFindUnique.mockResolvedValue({
        id: 'user_1',
        email: 'pilot@airmanager.local',
        isActive: true,
        locale: 'it',
      });
      sendMock.mockRejectedValue(new Error('SMTP down'));

      await expect(requestPasswordReset('pilot@airmanager.local')).resolves.toBeUndefined();
    });

    it('records the attempt (email + ip) for an allowed call, before the account lookup', async () => {
      userFindUnique.mockResolvedValue(null);

      await requestPasswordReset('nobody@airmanager.local', '203.0.113.5');

      expect(resetAttemptCreateMock).toHaveBeenCalledWith({
        data: { email: 'nobody@airmanager.local', ip: '203.0.113.5' },
      });
    });
  });

  describe('H4 (CWE-799/307) forgot-password throttle', () => {
    describe('isPasswordResetThrottled', () => {
      it('is false with no recent attempts', async () => {
        await expect(isPasswordResetThrottled('pilot@airmanager.local', null)).resolves.toBe(false);
      });

      it('is true once the per-email cap is reached — checked BEFORE the per-IP cap (single count call)', async () => {
        resetAttemptCountMock.mockResolvedValueOnce(3); // PASSWORD_RESET_MAX_PER_EMAIL

        await expect(isPasswordResetThrottled('pilot@airmanager.local', '203.0.113.5')).resolves.toBe(true);
        expect(resetAttemptCountMock).toHaveBeenCalledTimes(1);
      });

      it('is true once the per-IP cap is reached, even with few attempts on this specific email', async () => {
        resetAttemptCountMock.mockResolvedValueOnce(0); // email count, under cap
        resetAttemptCountMock.mockResolvedValueOnce(10); // ip count, PASSWORD_RESET_MAX_PER_IP

        await expect(isPasswordResetThrottled('pilot@airmanager.local', '203.0.113.5')).resolves.toBe(true);
        expect(resetAttemptCountMock).toHaveBeenCalledTimes(2);
      });

      it('skips the per-IP check (not an unlimited pass) when ip is null — the per-email cap alone still applies', async () => {
        resetAttemptCountMock.mockResolvedValueOnce(0);

        await expect(isPasswordResetThrottled('pilot@airmanager.local', null)).resolves.toBe(false);
        expect(resetAttemptCountMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('requestPasswordReset throttled path', () => {
      it('over-limit: returns the identical undefined result, issues no token, sends no mail, and does not even look up the account', async () => {
        resetAttemptCountMock.mockResolvedValueOnce(3); // per-email cap reached

        await expect(requestPasswordReset('victim@airmanager.local', '203.0.113.5')).resolves.toBeUndefined();

        expect(userFindUnique).not.toHaveBeenCalled();
        expect(createTokenMock).not.toHaveBeenCalled();
        expect(sendMock).not.toHaveBeenCalled();
        expect(resetAttemptCreateMock).not.toHaveBeenCalled();
      });

      it('under-limit: still issues the token and sends, same as before the throttle existed', async () => {
        userFindUnique.mockResolvedValue({
          id: 'user_1',
          email: 'pilot@airmanager.local',
          isActive: true,
          locale: 'it',
        });

        await requestPasswordReset('pilot@airmanager.local', '203.0.113.5');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(createTokenMock).toHaveBeenCalled();
        expect(sendMock).toHaveBeenCalled();
      });

      it('the response is identical (both resolve to undefined) whether throttled or not — no signal leaks through the return value', async () => {
        userFindUnique.mockResolvedValue(null);
        resetAttemptCountMock.mockResolvedValueOnce(0);
        const underLimit = await requestPasswordReset('a@airmanager.local', '203.0.113.5');

        resetAttemptCountMock.mockReset();
        resetAttemptCountMock.mockResolvedValueOnce(3);
        const overLimit = await requestPasswordReset('b@airmanager.local', '203.0.113.5');

        expect(underLimit).toBeUndefined();
        expect(overLimit).toBeUndefined();
        expect(underLimit).toEqual(overLimit);
      });
    });
  });

  describe('setPasswordWithToken (AC 1/3 — monouso)', () => {
    it('throws ValidationError for an unknown token', async () => {
      tokenFindUnique.mockResolvedValue(null);

      await expect(setPasswordWithToken('unknown-raw-token', 'a-long-enough-password')).rejects.toThrow(
        ValidationError,
      );
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError for an already-used token (monouso)', async () => {
      tokenFindUnique.mockResolvedValue({
        id: 'token_1',
        userId: 'user_1',
        usedAt: new Date('2026-01-01T00:00:00.000Z'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(setPasswordWithToken('replayed-token', 'a-long-enough-password')).rejects.toThrow(
        ValidationError,
      );
    });

    it('throws ValidationError for an expired token', async () => {
      tokenFindUnique.mockResolvedValue({
        id: 'token_1',
        userId: 'user_1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(setPasswordWithToken('expired-token', 'a-long-enough-password')).rejects.toThrow(
        ValidationError,
      );
    });

    it('hashes the password, marks the token used, and updates the user for a valid token', async () => {
      tokenFindUnique.mockResolvedValue({
        id: 'token_1',
        userId: 'user_1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      // The interactive-callback `$transaction` mock (fixed story TD-1, AC 3
      // — see the `transactionMock.mockImplementation` above) now actually
      // INVOKES the callback, so the atomic single-use claim inside it needs
      // a real resolved value: `{ count: 1 }` simulates the winning claim
      // (previously this test passed vacuously — the old, buggy mock never
      // called the callback at all, so `updateMany`/`user.update` never ran).
      (updateManyTokenMock as unknown as { mockResolvedValue: (v: { count: number }) => void }).mockResolvedValue({ count: 1 });

      await setPasswordWithToken('valid-raw-token', 'a-long-enough-password');

      expect(hashPassword).toHaveBeenCalledWith('a-long-enough-password');
      expect(transactionMock).toHaveBeenCalled();
      expect(updateManyTokenMock).toHaveBeenCalledWith({ where: { id: 'token_1', usedAt: null }, data: { usedAt: expect.any(Date) } });
      expect(updateUserMock).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { passwordHash: expect.any(String), tokenVersion: { increment: 1 } },
      });
    });

    it('bumps tokenVersion (TD-6, F1, CWE-613) in the SAME user.update call as the password change — same transaction, same atomicity as the token claim', async () => {
      tokenFindUnique.mockResolvedValue({
        id: 'token_2',
        userId: 'user_2',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      (updateManyTokenMock as unknown as { mockResolvedValue: (v: { count: number }) => void }).mockResolvedValue({ count: 1 });

      await setPasswordWithToken('another-valid-raw-token', 'a-long-enough-password');

      // A single `user.update` call carries both fields — not two separate
      // writes — so the DB guarantees they commit or roll back together.
      expect(updateUserMock).toHaveBeenCalledTimes(1);
      const [call] = updateUserMock.mock.calls;
      expect(call[0]).toMatchObject({ where: { id: 'user_2' }, data: { tokenVersion: { increment: 1 } } });
      expect(call[0].data).toHaveProperty('passwordHash');
    });
  });
});
