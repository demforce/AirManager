import type { JWT } from 'next-auth/jwt';
import { prisma } from '@/server/db/prisma';

/** Re-verification interval (story 1.4, AC 2: "max 15 min di grazia"). */
export const ACTIVE_RECHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Re-verifies `User.isActive` against the DB at most once every
 * `ACTIVE_RECHECK_INTERVAL_MS`, using `token.lastActiveCheck` as the
 * watermark. Node runtime only (`auth.ts`) — never called from
 * `src/proxy.ts`'s `getToken` read, which has no Prisma access.
 *
 * Returns the token unchanged (refreshing `lastActiveCheck`) when the check
 * is not due yet, or the user is still active. Returns `null` when the
 * recheck finds the user deactivated or gone: `@auth/core`'s `jwt` callback
 * contract treats a `null` return as "end the session" (the session cookie
 * is cleared — see `@auth/core`'s `session` action), which is exactly how a
 * deactivated user's existing session decays without waiting for expiry.
 */
export async function applyActiveRecheck(token: JWT, now: number = Date.now()): Promise<JWT | null> {
  const lastCheck = token.lastActiveCheck ?? 0;
  if (now - lastCheck < ACTIVE_RECHECK_INTERVAL_MS) {
    return token;
  }

  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    select: { isActive: true },
  });

  if (!user || !user.isActive) {
    return null;
  }

  token.lastActiveCheck = now;
  return token;
}
