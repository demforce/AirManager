import { apiRoute } from '@/lib/api/handler';
import { listAllExpiriesQuerySchema } from '@/lib/schemas/expiries';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportExpiriesPdf } from '@/server/services/exports.service';

/**
 * Dedicated PDF route (story 10.2, AC 2/3 — spine :105). Reuses the SAME
 * query schema as `GET /api/v1/expiries` — `page`/`pageSize`/`format` are
 * ignored here (`exportExpiriesPdf` always re-pages internally, same as the
 * xlsx export). Real authorization stays in `expiries.service.ts#listAllExpiries`
 * (AD-5), `expiries.manage` (ADMIN-only).
 */
export const GET = apiRoute({
  querySchema: listAllExpiriesQuerySchema,
  handle: async ({ actor, query }) => {
    const { buffer, filename } = await exportExpiriesPdf(actor, query);
    return pdfResponse(buffer, filename);
  },
});
