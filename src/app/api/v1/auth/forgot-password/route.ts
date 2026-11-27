import { extractClientIp } from '@/lib/api/client-ip';
import { apiRoute } from '@/lib/api/handler';
import { forgotPasswordSchema } from '@/lib/schemas/auth-tokens';
import { requestPasswordReset } from '@/server/services/auth-tokens.service';

/**
 * Public route (AC 3): always responds `200 { ok: true }`, whether or not
 * the email matches an active account — `requestPasswordReset` itself does
 * equivalent work either way and never throws, so there is nothing here
 * that could leak account existence via status code, body, or (server-side)
 * timing. A malformed email still gets a distinct 422 — rejecting an
 * obviously-invalid input shape isn't an enumeration channel. H4
 * (CWE-799/307): the client IP (`x-forwarded-for`, `client-ip.ts`) feeds
 * `requestPasswordReset`'s per-IP throttle
 * dimension — a throttled call still returns this SAME 200.
 */
export const POST = apiRoute({ sanitizeUnexpected: true,
  auth: 'public',
  bodySchema: forgotPasswordSchema,
  handle: async ({ body, request }) => {
    const ip = extractClientIp(request.headers.get('x-forwarded-for'));
    try { await requestPasswordReset(body.email, ip); }
    catch { console.error('credential-mail: reset request unavailable'); }
    return { ok: true };
  },
});
