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
 * Atomically checks both caps and, if under them, immediately records a
 * pessimistic "failed" `LoginAttempt` row for `identifier`/`ip` — BEFORE the
 * caller runs the (slow) Argon2 verify. This closes a TOCTOU race (story
 * TD-6, F2, LOW, CWE-367, `CLAUDE-SECURITY-20260723-073138`): the previous
 * separate check-then-record (`isLoginLocked` followed later by
 * `recordFailedLoginAttempt`) let a burst of concurrent requests for the
 * same identifier all read the same pre-burst count, all pass the gate, and
 * all run a verify before any of them wrote its failure row — admitting
 * more than `LOGIN_MAX_FAILED_PER_IDENTIFIER` guesses into one window.
 *
 * The count-then-insert runs inside a Postgres transaction serialized on
 * `pg_advisory_xact_lock(hashtext(identifier))`: concurrent reservations for
 * the SAME identifier queue behind the lock and each sees the previous
 * one's committed insert before counting; different identifiers use
 * different lock keys and proceed in parallel. The lock is held only for
 * the count-then-insert, never across the verify — Argon2's CPU cost stays
 * outside the critical section (the Dev Agent Record explains why this was
 * chosen over locking around the whole check+verify+record).
 *
 * Returns `false` — and inserts NOTHING — once either cap is already at its
 * limit. Preserves the existing anti-DoS property: a continued flood
 * against an already-locked identifier/IP never re-extends the lockout
 * window (the lockout instead still expires `LOGIN_RATE_LIMIT_WINDOW_MS`
 * after the last COUNTED failure). The caller (`authorizeCredentials`) must
 * treat `false` as "locked" and skip the real password verify.
 *
 * Returns `true` once the reservation row is written. On a real password
 * mismatch the caller records nothing further — the reserved row already IS
 * the failure record. On success, `recordSuccessfulLogin` deletes every
 * failed row for the identifier, including this reservation, for free.
 *
 * `ip: null` (no resolvable `x-forwarded-for` — no trusted proxy in front,
 * same situation `ppr.service.ts` handles) skips the per-IP check but NEVER
 * the per-identifier one: the identifier always comes from the login form
 * itself, so a missing/spoofed IP can never fully bypass the throttle the
 * way it once did for the PPR form when IP was the ONLY dimension (H5).
 */
export async function reserveLoginAttempt(identifier: string, ip: string | null): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identifier})::bigint)`;

    const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS);

    const identifierFailures = await tx.loginAttempt.count({
      where: { identifier, succeeded: false, createdAt: { gt: windowStart } },
    });
    if (identifierFailures >= LOGIN_MAX_FAILED_PER_IDENTIFIER) {
      return false;
    }

    if (ip) {
      const ipFailures = await tx.loginAttempt.count({
        where: { ip, succeeded: false, createdAt: { gt: windowStart } },
      });
      if (ipFailures >= LOGIN_MAX_FAILED_PER_IP) {
        return false;
      }
    }

    await tx.loginAttempt.create({ data: { identifier, ip, succeeded: false } });
    return true;
  });
}

/**
 * A successful login records the success (audit trail — mirrors the
 * `succeeded` column) AND clears this identifier's failed-attempt history —
 * including any pessimistic reservation `reserveLoginAttempt` made for THIS
 * request — so a legitimate user who mistyped their password a few times
 * before getting it right doesn't carry a near-lockout count into a future
 * genuine typo. Deliberately scoped to the identifier only, NEVER the IP:
 * clearing the IP bucket too would let an attacker credential-stuff many
 * accounts from one IP, then "reset" that IP's counter by logging into an
 * unrelated account of their own from the same address.
 */
export async function recordSuccessfulLogin(identifier: string, ip: string | null): Promise<void> {
  await prisma.loginAttempt.create({ data: { identifier, ip, succeeded: true } });
  await prisma.loginAttempt.deleteMany({ where: { identifier, succeeded: false } });
}
