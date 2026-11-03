import { apiRoute } from '@/lib/api/handler';
import { createExpiryTypeSchema, listExpiryTypesQuerySchema } from '@/lib/schemas/expiry-types';
import { createExpiryType, listExpiryTypes } from '@/server/services/expiry-types.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. Authorization
 * stays in `expiry-types.service.ts` (AD-5) — `GET` needs only
 * `expiries.manage` (ADMIN-only reads the catalogue, story 6.1), `POST`
 * needs `settings.manage` (catalogue configuration is admin-only).
 */
export const GET = apiRoute({
  querySchema: listExpiryTypesQuerySchema,
  handle: async ({ actor, query }) => listExpiryTypes(actor, query),
});

export const POST = apiRoute({
  bodySchema: createExpiryTypeSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createExpiryType(actor, body),
});
