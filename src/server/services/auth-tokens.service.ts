import { createHash, randomBytes } from 'node:crypto';
import type { AuthTokenType } from '@/generated/prisma/enums';
import { getMailSender } from '@/server/adapters/mail';
import { buildInviteEmail, buildPasswordResetEmail } from '@/server/adapters/mail/templates';
import { hashPassword } from '@/server/auth/password';
import { prisma } from '@/server/db/prisma';
import { env } from '@/lib/env';
import { ValidationError } from './errors';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 2 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function buildSetPasswordUrl(rawToken: string): string {
  const url = new URL('/set-password', env.APP_URL);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

/**
 * Creates a single-use, hashed token for `userId` (AC 1/3). Any previously
 * unused token of the *same* type for the same user is invalidated first
 * (`usedAt` set) — at most one active invite and one active reset link
 * exist per user at a time, so an old emailed link can't be replayed
 * alongside a freshly issued one.
 */
async function issueAuthToken(userId: string, type: AuthTokenType, ttlMs: number): Promise<string> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: { userId, type, tokenHash, expiresAt },
    }),
  ]);

  return rawToken;
}

/** Sends the invite email (AC 1) — used by `users.service.ts` on user creation and resend. */
export async function sendInviteEmail(userId: string, email: string, locale: 'it' | 'en'): Promise<void> {
  const rawToken = await issueAuthToken(userId, 'INVITE', INVITE_TTL_MS);
  const { subject, text } = await buildInviteEmail(locale, {
    setPasswordUrl: buildSetPasswordUrl(rawToken),
    expiresInDays: Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000)),
  });
  await getMailSender().send({ to: email, subject, text });
}

/**
 * A trivial query with the same shape/cost as the real lookup inside
 * `issueAuthToken`'s transaction, run for the "no such user" branch of
 * `requestPasswordReset` so the DB round-trip count doesn't itself leak
 * account existence (best-effort — see Dev Notes for the limits of this).
 */
async function dummyEquivalentDbWork(): Promise<void> {
  await prisma.authToken.findFirst({ where: { tokenHash: 'timing-equalization-dummy-lookup' } });
}

/**
 * Silent by design (AC 3): the response status/body is identical for known
 * and unknown emails, and the SMTP send is fire-and-forget. Residual limit,
 * accepted and documented: the real-account branch still performs the token
 * write transaction on the response path, so a low-noise timing oracle is
 * not fully closed — `dummyEquivalentDbWork` only equalizes the lookup, not
 * the writes. Never throws.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    await dummyEquivalentDbWork();
    return;
  }

  const rawToken = await issueAuthToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS);
  const locale = user.locale === 'en' ? 'en' : 'it';
  const { subject, text } = await buildPasswordResetEmail(locale, {
    setPasswordUrl: buildSetPasswordUrl(rawToken),
    expiresInHours: Math.round(PASSWORD_RESET_TTL_MS / (60 * 60 * 1000)),
  });

  // Fire-and-forget: awaiting the SMTP round-trip here would make the HTTP
  // response slower for a real account than for an unknown one, reopening
  // the exact timing side-channel AC 3 forbids.
  void getMailSender()
    .send({ to: user.email, subject, text })
    .catch((error: unknown) => {
      console.error('requestPasswordReset: failed to send password reset email', error);
    });
}

/**
 * Consumes a single-use token (invite OR reset — both lead to "set this
 * password", AC 1/3) and sets the user's password. Throws `ValidationError`
 * for a token that is unknown, expired, or already used — intentionally the
 * same error for all three so a probing client can't tell them apart.
 */
export async function setPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const authToken = await prisma.authToken.findUnique({ where: { tokenHash } });

  if (!authToken || authToken.usedAt || authToken.expiresAt.getTime() <= Date.now()) {
    throw new ValidationError('Invalid or expired token.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    // Atomic single-use claim: the conditional `usedAt: null` filter makes
    // the database decide exactly one winner between concurrent requests
    // replaying the same token — a plain check-then-update would let both
    // through (TOCTOU).
    const claimed = await tx.authToken.updateMany({
      where: { id: authToken.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ValidationError('Invalid or expired token.');
    }
    await tx.user.update({ where: { id: authToken.userId }, data: { passwordHash } });
  });
}
