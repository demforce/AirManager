import { createHash } from 'node:crypto';
import { credentialEligible } from '@/server/auth/email-trial-policy';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { prisma } from '@/server/db/prisma';
import { enqueueCredential, lockMailAccount } from './credential-mail.service';
export { INVITE_TTL_MS, PASSWORD_RESET_TTL_MS } from './credential-mail.service';
import { ValidationError } from './errors';

// --- H4 (CWE-799/307) throttle: mail-bomb / token-churn on forgot-password,
// `docs/security/owasp-audit-2026-07-22.md` — same "count recent rows in a
// window" pattern as `login-throttle.ts`'s login lockout.

const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Per-email cap — the finding's own number (`docs/security/...md`, H4 fix). */
const PASSWORD_RESET_MAX_PER_EMAIL = 3;

/** Per-IP cap, higher than the per-email one for the same reason as `login-throttle.ts#LOGIN_MAX_FAILED_PER_IP`: one IP can legitimately host several different accounts requesting a reset within the window. */
const PASSWORD_RESET_MAX_PER_IP = 10;

/**
 * `true` when the email or the IP has reached its cap of recent
 * `PasswordResetAttempt` rows. Exported for direct unit-testing. `ip: null` (no
 * resolvable `x-forwarded-for`) skips the per-IP check but never the
 * per-email one — the email always comes from the request body itself, so
 * a missing IP can't bypass the throttle entirely (H5 lesson).
 */
export async function isPasswordResetThrottled(email: string, ip: string | null): Promise<boolean> {
  const windowStart = new Date(Date.now() - PASSWORD_RESET_RATE_LIMIT_WINDOW_MS);

  const emailCount = await prisma.passwordResetAttempt.count({
    where: { email, createdAt: { gt: windowStart } },
  });
  if (emailCount >= PASSWORD_RESET_MAX_PER_EMAIL) {
    return true;
  }

  if (ip) {
    const ipCount = await prisma.passwordResetAttempt.count({
      where: { ip, createdAt: { gt: windowStart } },
    });
    if (ipCount >= PASSWORD_RESET_MAX_PER_IP) {
      return true;
    }
  }

  return false;
}

/**
 * Records one allowed reset request. Recorded for EVERY email, real or not
 * (before the account-existence check below) — both so the throttle itself
 * never becomes an enumeration/timing signal (identical DB cost regardless
 * of whether the account exists) and so a probe of a nonexistent email
 * still gets capped. Only called on a path that already checked
 * `isPasswordResetThrottled` and found it `false` — same "don't let a flood
 * re-extend its own window" reasoning as `login-throttle.ts`.
 */
async function recordPasswordResetAttempt(email: string, ip: string | null): Promise<void> {
  await prisma.passwordResetAttempt.create({ data: { email, ip } });
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
 * Public acknowledgement remains uniform. The durable reset intent commits before returning;
 * SMTP is entirely independent of account lookup, throttling and the HTTP request.
 */
export async function requestPasswordReset(email: string, ip: string | null = null): Promise<void> {
  if (await isPasswordResetThrottled(email, ip)) {
    return;
  }
  await recordPasswordResetAttempt(email, ip);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    await dummyEquivalentDbWork();
    return;
  }

  // Commit the intent without waiting for the transport. The dispatcher owns its retry budget.
  try {
    await prisma.$transaction(tx => enqueueCredential(tx, user.id, 'PASSWORD_RESET', undefined, email));
  } catch {
    // A storage failure on the active-account branch must not identify an account to the caller.
    console.error('credential-mail: reset queue unavailable');
  }
}

/**
 * Consumes a single-use token (invite OR reset — both lead to "set this
 * password", AC 1/3) and sets the user's password. Throws `ValidationError`
 * for a token that is unknown, expired, or already used — intentionally the
 * same error for all three so a probing client can't tell them apart.
 *
 * Also bumps `User.tokenVersion` (story TD-6, F1, CWE-613), in the SAME
 * update call as the password change, so the bump shares the transaction's
 * atomicity with the token's single-use claim. This is what makes the
 * password change actually evict every other live session: the sign-in
 * `jwt` callback stamps `tokenVersion` into new tokens, and
 * `applyActiveRecheck` evicts any token whose stamped value no longer
 * matches the DB — covering INVITE and PASSWORD_RESET alike, including an
 * admin re-sending an invite to a user who already has a session.
 */
export async function setPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const authToken = await prisma.authToken.findUnique({ where: { tokenHash } });

  if (!authToken || !['INVITE', 'PASSWORD_RESET'].includes(authToken.type) || authToken.usedAt || authToken.expiresAt.getTime() <= Date.now()) {
    throw new ValidationError('Invalid or expired token.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await lockMailAccount(tx, authToken.userId);
    const user = await tx.user.findUnique({
      where: { id: authToken.userId }, include: { emailVerification: true },
    });
    if (!user || (user.emailVerification && !credentialEligible(user, authToken.type))) {
      throw new ValidationError('Invalid or expired token.');
    }
    if (user.roles.includes('ADMIN') && (Array.from(newPassword).length < 15
      || (user.passwordHash && await verifyPassword(user.passwordHash, newPassword)))) {
      throw new ValidationError('Choose a new individual administrator password of at least 15 characters.', undefined, 'ADMIN_PASSWORD_POLICY');
    }
    // Atomic single-use claim: the conditional `usedAt: null` filter makes
    // the database decide exactly one winner between concurrent requests
    // replaying the same token — a plain check-then-update would let both
    // through (TOCTOU).
    const claimed = await tx.authToken.updateMany({
      where: { id: authToken.id, type: authToken.type, usedAt: null, expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ValidationError('Invalid or expired token.');
    }
    await tx.user.update({
      where: { id: authToken.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
  });
}
