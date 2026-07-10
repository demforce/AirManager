import { apiRoute } from '@/lib/api/handler';
import { cashReportPdfQuerySchema } from '@/lib/schemas/cash';
import { pdfResponse } from '@/server/adapters/pdf/response';
import { exportCashReportPdf } from '@/server/services/exports.service';

/**
 * Dedicated PDF route (story 10.2, AC 2/3 — spine :105). `finance.manage`
 * (staff/admin) — real authorization stays in `cash.service.ts#getCashReport`
 * (AD-5), same gate as `GET /api/v1/cash-report`.
 */
export const GET = apiRoute({
  querySchema: cashReportPdfQuerySchema,
  handle: async ({ actor, query }) => {
    const { buffer, filename } = await exportCashReportPdf(actor, query);
    return pdfResponse(buffer, filename);
  },
});
