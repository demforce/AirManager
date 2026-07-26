import type { JWT } from 'next-auth/jwt';
import { prisma } from '@/server/db/prisma';

/** Re-verification interval (story 1.4, AC 2: "max 15 min di grazia"). */
export const ACTIVE_RECHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Re-verifies `User.isActive`, `User.roles` and `User.tokenVersion` against
 * the DB at most once every `ACTIVE_RECHECK_INTERVAL_MS`, using
 * `token.lastActiveCheck` as the watermark. Node runtime only (`auth.ts`) —
 * never called from `src/proxy.ts`'s `getToken` read, which has no Prisma
 * access.
 *
 * Returns the token unchanged when the check is not due yet. Once due,
 * returns the token with `lastActiveCheck` refreshed and `roles` overwritten
 * from the DB for a still-active user — this is how a role change made by an
 * admin propagates to an already signed-in session without waiting for the
 * JWT to expire (CWE-613). Returns `null` when the recheck finds the user
 * deactivated or gone, OR when `token.tokenVersion` no longer matches the
 * DB (story TD-6, F1, CWE-613): `setPasswordWithToken` bumps
 * `User.tokenVersion` on every password set (invite or reset), so a session
 * issued before that bump fails this comparison and is evicted here — the
 * mechanism that makes a password reset actually end an attacker's existing
 * session, instead of leaving it valid for the JWT's full 30-day lifetime.
 * A token with NO `tokenVersion` claim at all (issued before this field
 * existed) is treated the same as a mismatch — accepted, documented
 * one-time logout of every session alive at deploy time. In every `null`
 * case, `@auth/core`'s `jwt` callback contract treats the return as "end the
 * session" (the session cookie is cleared — see `@auth/core`'s `session`
 * action).
 */
export async function applyActiveRecheck(token: JWT, now: number = Date.now()): Promise<JWT | null> {
  const lastCheck = token.lastActiveCheck ?? 0;
  if (now - lastCheck < ACTIVE_RECHECK_INTERVAL_MS) {
    return token;
  }

  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    select: { isActive: true, roles: true, tokenVersion: true },
  });

  if (!user || !user.isActive) {
    return null;
  }

  if (token.tokenVersion !== user.tokenVersion) {
    return null;
  }

  token.roles = user.roles;
  token.lastActiveCheck = now;
  return token;
}
