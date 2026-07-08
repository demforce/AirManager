import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Bearer-token verification for `/api/v1/jobs/*` (story 6.3, AD-9) —
 * deliberately its OWN module, not the route file, so it is unit-testable
 * without the Next.js route plumbing (Task 5: "servizio del confronto
 * bearer estratto e testato").
 *
 * `Authorization: Bearer <token>` is compared against `JOBS_SECRET`
 * TIMING-SAFE, per Contesto: never a plain `===` on secret strings (a
 * variable-time comparison leaks how many leading bytes matched) and never
 * `crypto.timingSafeEqual` directly on the raw strings either — that
 * function REQUIRES both buffers to be the same length and throws
 * otherwise, so comparing it against attacker-controlled-length input would
 * itself leak the secret's length (or crash). The standard workaround: hash
 * both sides to a fixed-length SHA-256 digest first, then
 * `timingSafeEqual` the digests.
 */

const BEARER_PATTERN = /^Bearer\s+(\S+)$/;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Timing-safe equality of two strings, via fixed-length digests (see module doc). */
export function timingSafeStringEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** Extracts the token from an `Authorization: Bearer <token>` header — `null` on a missing/malformed header (wrong scheme, empty token, extra whitespace/segments). */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = BEARER_PATTERN.exec(authorizationHeader);
  return match ? match[1] : null;
}

/** True iff `authorizationHeader` carries exactly `expectedSecret` as a bearer token (timing-safe). */
export function verifyJobsBearer(authorizationHeader: string | null, expectedSecret: string): boolean {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return false;
  }
  return timingSafeStringEqual(token, expectedSecret);
}
