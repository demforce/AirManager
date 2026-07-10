import { apiRoute } from '@/lib/api/handler';
import { pdfQuerySchema, type PdfQuery } from '@/lib/schemas/common';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportAccountStatementPdf } from '@/server/services/exports.service';

type RouteParams = { id: string };

/**
 * Dedicated PDF route (story 10.2, AC 2/3 — spine :105, unlike the xlsx
 * export's `?format=xlsx` on the SAME endpoint). `assertReadAccess` inside
 * `listAccountMovements` (reused by `exportAccountStatementPdf`) is the
 * only own/staff access check — no extra guard needed in the route (AD-1).
 */
export const GET = apiRoute<PdfQuery, undefined, RouteParams>({
  querySchema: pdfQuerySchema,
  handle: async ({ actor, params, query }) => {
    const { buffer, filename } = await exportAccountStatementPdf(actor, params.id, query);
    return pdfResponse(buffer, filename);
  },
});
