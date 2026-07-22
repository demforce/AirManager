import type { User as NextAuthUser } from 'next-auth';
import { loginSchema } from '@/lib/schemas/login';
import { prisma } from '@/server/db/prisma';
import { isLoginLocked, recordFailedLoginAttempt, recordSuccessfulLogin } from './login-throttle';
import { hashPassword, verifyPassword } from './password';

// Verified against when the email doesn't match an active user, so the
// unknown-email and wrong-password paths cost the same Argon2id work —
// otherwise response timing reveals whether an account exists (AC 2).
let timingDummyHash: string | undefined;
async function getTimingDummyHash(): Promise<string> {
  timingDummyHash ??= await hashPassword('timing-equalization-dummy');
  return timingDummyHash;
}

/**
 * Credentials provider `authorize()` (AC 1, AC 2), extracted so it can be
 * unit-tested without exercising the full Auth.js request/response cycle.
 * Returns `null` — never a distinguishing error — for every failure case:
 * malformed input, unknown email, inactive user, wrong password, or a
 * throttled identifier/IP (H1, CWE-307 — `login-throttle.ts`). `ip` is the
 * caller's address (from `x-forwarded-for`, resolved by `auth.ts`) or
 * `null` when unresolvable; passing `null` never disables the throttle,
 * only its per-IP dimension (see `isLoginLocked`'s doc-comment).
 */
export async function authorizeCredentials(rawCredentials: unknown, ip: string | null = null): Promise<NextAuthUser | null> {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return null;
  }
  const { email, password } = parsed.data;

  if (await isLoginLocked(email, ip)) {
    // Same generic `null` as every other failure path (AC 2), and still runs
    // the constant-time dummy verify so the CredentialsSignin outcome carries
    // no password-shaped timing. This path is measurably FASTER than the
    // paths below (it skips the user lookup and the LoginAttempt write) — but
    // that only reveals *lock-state*, which the attacker themselves caused;
    // it does NOT reveal email validity (an unknown and a real email lock
    // identically). No new LoginAttempt row here (see
    // `recordFailedLoginAttempt`'s doc-comment for why).
    await verifyPassword(await getTimingDummyHash(), password);
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash) {
    // Same outcome for "no such user", "inactive user", and "invited user
    // who hasn't set a password yet" (story 1.4: `passwordHash` is nullable)
    // as for a wrong password below — never reveal which case it was (AC 2).
    await verifyPassword(await getTimingDummyHash(), password);
    await recordFailedLoginAttempt(email, ip);
    return null;
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    await recordFailedLoginAttempt(email, ip);
    return null;
  }

  await recordSuccessfulLogin(email, ip);

  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    personId: user.personId,
  };
}
