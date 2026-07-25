import { apiRoute } from '@/lib/api/handler';
import { listPprRequestsQuerySchema } from '@/lib/schemas/ppr';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportPprRequestsPdf } from '@/server/services/exports.service';

/**
 * Dedicated PDF route (story 13.6, AC 4 — spine :105). Reuses the SAME query
 * schema as `GET /api/v1/ppr-requests` (status/from/to filters + `locale`) —
 * `page`/`pageSize`/`format`, also present on that schema, are simply
 * ignored here (`exportPprRequestsPdf` always re-pages internally, same as
 * the xlsx export). Real authorization stays in `ppr.service.ts#listPprRequests`
 * (AD-5). NOT in `src/proxy.ts`'s `PUBLIC_API_PATHS` — that Set matches the
 * exact `/api/v1/ppr-requests` pathname only, this is a different path.
 */
export const GET = apiRoute({
  querySchema: listPprRequestsQuerySchema,
  handle: async ({ actor, query }) => {
    const { buffer, filename } = await exportPprRequestsPdf(actor, query);
    return pdfResponse(buffer, filename);
  },
});
