import { apiRoute } from '@/lib/api/handler';

/**
 * Public liveness check — intentionally excluded from the auth gate in
 * `src/proxy.ts` (AC 3). No domain logic, no DB call: a minimal stub is
 * enough for infra health checks; a richer version (DB ping, etc.) is out
 * of scope here. Uses the shared wrapper (story 1.5) like every other
 * `/api/v1/*` route, even though it has no input to validate and cannot
 * throw a `DomainError`.
 */
export const GET = apiRoute({
  auth: 'public',
  handle: async () => ({ status: 'ok' }),
});
