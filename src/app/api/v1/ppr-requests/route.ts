import { apiRoute } from '@/lib/api/handler';
import { createPprRequestSchema, listPprRequestsQuerySchema } from '@/lib/schemas/ppr';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { exportPprRequestsXlsx } from '@/server/services/exports.service';
import { createPprRequest, extractSubmitterIp, listPprRequests, toPprRequestDto } from '@/server/services/ppr.service';

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

/**
 * `GET /api/v1/ppr-requests` — the staff approval queue (epic 8, story 8.2,
 * AC 1/2). ATTENTION: this pathname is ALSO in `src/proxy.ts`'s
 * `PUBLIC_API_PATHS` (added in 8.1 for the public POST above) — the
 * middleware skips its own session check for EVERY method on this exact
 * path, this GET included. That is fine BY DESIGN, not a hole: `apiRoute`'s
 * own default (`auth: 'required'`, no override here) resolves the session
 * itself and answers 401 with no cookie, and `listPprRequests`
 * (`ppr.service.ts`) calls `authorize(actor, 'ppr.manage')` before any
 * query — AD-5's "the middleware is never the only guardian" applies here
 * literally: this route has ZERO help from the middleware and still ends up
 * fully guarded by `apiRoute` + the service.
 */
export const GET = apiRoute({
  querySchema: listPprRequestsQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportPprRequestsXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    // Review 12.4 F1: the wire shape is `pprRequestItemSchema`, never the raw service item.
    const result = await listPprRequests(actor, query);
    return { ...result, items: result.items.map(toPprRequestDto) };
  },
});
