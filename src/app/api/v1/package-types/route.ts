import { apiRoute } from '@/lib/api/handler';
import { createPackageTypeSchema, listPackageTypesQuerySchema } from '@/lib/schemas/package-types';
import { createPackageType, listPackageTypes } from '@/server/services/package-types.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. Authorization
 * stays in `package-types.service.ts` (AD-5) — `GET` needs only
 * `finance.manage` (staff sells from this list in story 4.4 and reads it
 * now), `POST` needs `settings.manage` (listino configuration is admin-only,
 * story 4.3, Task 3).
 */
export const GET = apiRoute({
  querySchema: listPackageTypesQuerySchema,
  handle: async ({ actor, query }) => listPackageTypes(actor, query),
});

export const POST = apiRoute({
  bodySchema: createPackageTypeSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createPackageType(actor, body),
});
