import type { User as NextAuthUser } from 'next-auth';
import { loginSchema } from '@/lib/schemas/login';
import { prisma } from '@/server/db/prisma';
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
 * malformed input, unknown email, inactive user, or wrong password.
 */
export async function authorizeCredentials(rawCredentials: unknown): Promise<NextAuthUser | null> {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return null;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash) {
    // Same outcome for "no such user", "inactive user", and "invited user
    // who hasn't set a password yet" (story 1.4: `passwordHash` is nullable)
    // as for a wrong password below — never reveal which case it was (AC 2).
    await verifyPassword(await getTimingDummyHash(), password);
    return null;
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    personId: user.personId,
  };
}
