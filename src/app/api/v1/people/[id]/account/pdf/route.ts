import { apiRoute } from '@/lib/api/handler';
import { accountStatementPdfQuerySchema, type AccountStatementPdfQuery } from '@/lib/schemas/accounts';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportAccountStatementPdf } from '@/server/services/exports.service';

type RouteParams = { id: string };

/**
 * Dedicated PDF route (story 10.2, AC 2/3 — spine :105, unlike the xlsx
 * export's `?format=xlsx` on the SAME endpoint). `assertReadAccess` inside
 * `listAccountMovements` (reused by `exportAccountStatementPdf`) is the
 * only own/staff access check — no extra guard needed in the route (AD-1).
 * `from`/`to` (epic 12, story 12.9, AC 5) are ADDITIVE optional bounds on
 * the SAME route — absent means the full statement, unchanged.
 */
export const GET = apiRoute<AccountStatementPdfQuery, undefined, RouteParams>({
  querySchema: accountStatementPdfQuerySchema,
  handle: async ({ actor, params, query }) => {
    const { buffer, filename } = await exportAccountStatementPdf(actor, params.id, query);
    return pdfResponse(buffer, filename);
  },
});
