/**
 * Extracts the caller's IP from the `x-forwarded-for` header (first value,
 * trimmed) — `null` when the header is absent/empty. Same shape and trust
 * assumption as `ppr.service.ts#extractSubmitterIp` (production sits behind
 * a reverse proxy that sets this header; dev/e2e set it directly when a
 * spec needs it): duplicated here rather than imported so the auth
 * anti-abuse throttles (H1 login lockout, H4 forgot-password rate limit)
 * don't pull in the PPR service — keep the two extractors in sync if the
 * trust model ever changes.
 */
export function extractClientIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) {
    return null;
  }
  const first = forwardedFor.split(',')[0]?.trim();
  return first || null;
}
