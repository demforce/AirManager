import { apiRoute } from '@/lib/api/handler';
import { listAllExpiriesQuerySchema, registerExpirySchema, type RegisterExpiryInput } from '@/lib/schemas/expiries';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { listAllExpiries, registerExpiry } from '@/server/services/expiries.service';
import { exportExpiriesXlsx } from '@/server/services/exports.service';

/**
 * Thin routes (AD-1): `expiries.manage` (ADMIN-only) — real authorization
 * stays in `expiries.service.ts` (AD-5). GET is the story 6.4 urgency
 * dashboard (AC 1); POST is the story 6.2 registration.
 */
export const GET = apiRoute({
  querySchema: listAllExpiriesQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportExpiriesXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listAllExpiries(actor, query);
  },
});

export const POST = apiRoute<undefined, RegisterExpiryInput>({
  bodySchema: registerExpirySchema,
  successStatus: 201,
  handle: async ({ actor, body }) => registerExpiry(actor, body),
});
