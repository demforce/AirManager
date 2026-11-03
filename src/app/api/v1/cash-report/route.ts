import { apiRoute } from '@/lib/api/handler';
import { cashReportQuerySchema } from '@/lib/schemas/cash';
import { getCashReport } from '@/server/services/cash.service';

/**
 * Thin route (AD-1): `finance.manage` (ADMIN-only), same as the cash
 * register itself. Real authorization stays in `cash.service.ts` (AD-5).
 * `from`/`to` are both mandatory and validated (incl. `from <= to`) by
 * `cashReportQuerySchema` — a 422 on any violation.
 */
export const GET = apiRoute({
  querySchema: cashReportQuerySchema,
  handle: async ({ actor, query }) => getCashReport(actor, query),
});
