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
const { requestPasswordReset, sendInviteEmail, setPasswordWithToken, INVITE_TTL_MS, PASSWORD_RESET_TTL_MS } =
  await import('./auth-tokens.service');
const { ValidationError } = await import('./errors');

const findUniqueUserMock = vi.mocked(prisma.user.findUnique);
const updateUserMock = vi.mocked(prisma.user.update);
const updateManyTokenMock = vi.mocked(prisma.authToken.updateMany);
const createTokenMock = vi.mocked(prisma.authToken.create);
const findUniqueTokenMock = vi.mocked(prisma.authToken.findUnique);
const findFirstTokenMock = vi.mocked(prisma.authToken.findFirst);
const transactionMock = vi.mocked(prisma.$transaction);

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
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    vi.mocked(hashPassword).mockClear();
    vi.mocked(buildInviteEmail).mockClear();
    vi.mocked(buildPasswordResetEmail).mockClear();

    transactionMock.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops as Promise<unknown>[]);
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

      await setPasswordWithToken('valid-raw-token', 'a-long-enough-password');

      expect(hashPassword).toHaveBeenCalledWith('a-long-enough-password');
      expect(transactionMock).toHaveBeenCalled();
    });
  });
});
