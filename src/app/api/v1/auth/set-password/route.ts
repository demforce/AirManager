import { apiRoute } from '@/lib/api/handler';
import { setPasswordSchema } from '@/lib/schemas/auth-tokens';
import { setPasswordWithToken } from '@/server/services/auth-tokens.service';

/**
 * Public route (`src/proxy.ts` `PUBLIC_API_PATHS`) — used before the caller
 * has a session, by both the invite flow and the password-reset flow (AC
 * 1/3): both end with "consume a single-use token and set a password".
 */
export const POST = apiRoute({
  auth: 'public',
  bodySchema: setPasswordSchema,
  handle: async ({ body }) => {
    await setPasswordWithToken(body.token, body.password);
    return { ok: true };
  },
});
