import { prisma } from '@/server/db/prisma';

/**
 * Login brute-force / credential-stuffing throttle (H1, CWE-307,
 * `docs/security/owasp-audit-2026-07-22.md`) — a DB-backed rolling-window
 * failed-attempt counter, same "count recent rows in a window" pattern as
 * `ppr.service.ts`'s per-IP rate limit. Two independent caps apply: an
 * identifier (email) locks after too many of ITS OWN recent failures, and
 * an IP locks after too many failures from THAT IP across any identifier
 * (credential stuffing spread across many accounts from one source).
 * Either cap alone is enough to lock.
 */

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Per-identifier cap. `e2e/login.spec.ts` is the only spec that ever submits
 * a wrong password — 2 failed attempts total in a full suite run, against 2
 * DIFFERENT identifiers (`admin@airmanager.local` once, a nonexistent email
 * once); every other spec only ever logs in with correct credentials, which
 * never counts (see `recordSuccessfulLogin`). 10 is comfortably above that
 * and above a real typo rate, while still bounding a guessing attack to 10
 * Argon2id verifies per identifier per window.
 */
export const LOGIN_MAX_FAILED_PER_IDENTIFIER = 10;

/**
 * Per-IP cap, higher than the per-identifier one: one IP (office NAT, a
 * shared kiosk) can legitimately host several different accounts' failed
 * logins within the same window, so it must tolerate more organic failures
 * before locking out everyone behind it.
 */
export const LOGIN_MAX_FAILED_PER_IP = 30;

/**
 * `true` when either the identifier or the IP has reached its cap of FAILED
 * (`succeeded: false`) attempts within the rolling window. `ip: null` (no
 * resolvable `x-forwarded-for` — no trusted proxy in front, same situation
 * `ppr.service.ts` handles) skips the per-IP check but NEVER the
 * per-identifier one: the identifier always comes from the login form
 * itself, so a missing/spoofed IP can never fully bypass the throttle the
 * way it once did for the PPR form when IP was the ONLY dimension (H5).
 */
export async function isLoginLocked(identifier: string, ip: string | null): Promise<boolean> {
  const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS);

  const identifierFailures = await prisma.loginAttempt.count({
    where: { identifier, succeeded: false, createdAt: { gt: windowStart } },
  });
  if (identifierFailures >= LOGIN_MAX_FAILED_PER_IDENTIFIER) {
    return true;
  }

  if (ip) {
    const ipFailures = await prisma.loginAttempt.count({
      where: { ip, succeeded: false, createdAt: { gt: windowStart } },
    });
    if (ipFailures >= LOGIN_MAX_FAILED_PER_IP) {
      return true;
    }
  }

  return false;
}

/**
 * Records a failed attempt. Callers only invoke this on a path that already
 * checked `isLoginLocked` and found it `false` (`authorizeCredentials`
 * never calls this once already locked) — a continued flood against an
 * already-locked identifier/IP therefore writes no further rows, so it
 * cannot keep re-extending the lockout window indefinitely (which would
 * turn the lockout itself into a denial-of-service against the legitimate
 * account holder). The lockout instead expires naturally,
 * `LOGIN_RATE_LIMIT_WINDOW_MS` after the last COUNTED failure.
 */
export async function recordFailedLoginAttempt(identifier: string, ip: string | null): Promise<void> {
  await prisma.loginAttempt.create({ data: { identifier, ip, succeeded: false } });
}

/**
 * A successful login records the success (audit trail — mirrors the
 * `succeeded` column) AND clears this identifier's failed-attempt history,
 * so a legitimate user who mistyped their password a few times before
 * getting it right doesn't carry a near-lockout count into a future
 * genuine typo. Deliberately scoped to the identifier only, NEVER the IP:
 * clearing the IP bucket too would let an attacker credential-stuff many
 * accounts from one IP, then "reset" that IP's counter by logging into an
 * unrelated account of their own from the same address.
 */
export async function recordSuccessfulLogin(identifier: string, ip: string | null): Promise<void> {
  await prisma.loginAttempt.create({ data: { identifier, ip, succeeded: true } });
  await prisma.loginAttempt.deleteMany({ where: { identifier, succeeded: false } });
}
