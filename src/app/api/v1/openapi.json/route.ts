import { apiRoute } from '@/lib/api/handler';
import { generateOpenApiDocument } from '@/lib/schemas/registry';

/**
 * Public (`src/proxy.ts` `PUBLIC_API_PATHS`) — serves the OpenAPI 3.1
 * document generated at runtime from the registry (story 1.5, AD-1). Only
 * contracts are exposed here, never data, so it is safe to leave
 * unauthenticated for the future Flutter client (FR-42) and any other
 * tooling that wants to discover the API shape.
 */
export const GET = apiRoute({
  auth: 'public',
  handle: async () => generateOpenApiDocument(),
});
