import { apiRoute } from '@/lib/api/handler';
import { createPprRequestSchema } from '@/lib/schemas/ppr';
import { createPprRequest, extractSubmitterIp } from '@/server/services/ppr.service';

/**
 * Public route (`src/proxy.ts` `PUBLIC_API_PATHS`) — the first
 * fully-unauthenticated `/api/v1/*` write endpoint (story 8.1, AC 1/2).
 * `actor` is always `null` here (`auth: 'public'`) and is never referenced
 * — `ppr.service.ts#createPprRequest` takes no `Actor` at all (see its
 * doc-comment for the AD-5 deroga). `idempotency` is deliberately NOT set:
 * `apiRoute` blocks it for public routes at construction time (needs a
 * `userId`) — anti-abuse here is the honeypot + rate limit, not replay
 * protection.
 */
export const POST = apiRoute({
  auth: 'public',
  bodySchema: createPprRequestSchema,
  successStatus: 201,
  handle: async ({ body, request }) => {
    const ip = extractSubmitterIp(request.headers.get('x-forwarded-for'));
    return createPprRequest(body, { ip });
  },
});
