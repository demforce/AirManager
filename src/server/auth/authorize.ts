import type { User as NextAuthUser } from 'next-auth';
import { loginSchema } from '@/lib/schemas/login';
import { prisma } from '@/server/db/prisma';
import { verifyPassword } from './password';

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
  if (!user || !user.isActive) {
    // Same outcome for "no such user" and "inactive user" as for a wrong
    // password below — never reveal which case it was (AC 2).
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
