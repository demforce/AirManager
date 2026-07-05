import { apiRoute } from '@/lib/api/handler';
import { forgotPasswordSchema } from '@/lib/schemas/auth-tokens';
import { requestPasswordReset } from '@/server/services/auth-tokens.service';

/**
 * Public route (AC 3): always responds `200 { ok: true }`, whether or not
 * the email matches an active account — `requestPasswordReset` itself does
 * equivalent work either way and never throws, so there is nothing here
 * that could leak account existence via status code, body, or (server-side)
 * timing. A malformed email still gets a distinct 422 — rejecting an
 * obviously-invalid input shape isn't an enumeration channel.
 */
export const POST = apiRoute({
  auth: 'public',
  bodySchema: forgotPasswordSchema,
  handle: async ({ body }) => {
    await requestPasswordReset(body.email);
    return { ok: true };
  },
});
