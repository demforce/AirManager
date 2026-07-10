import { apiRoute } from '@/lib/api/handler';
import { schoolSummaryQuerySchema } from '@/lib/schemas/school';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { exportStudentHourSummariesXlsx } from '@/server/services/exports.service';
import { getStudentHourSummaries } from '@/server/services/school.service';

/**
 * Staff-only (`school.manage.any`) — the per-student dual-command/solo hour
 * summary for a mandatory period (story 9.3, AC 1/5).
 */
export const GET = apiRoute({
  querySchema: schoolSummaryQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportStudentHourSummariesXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return getStudentHourSummaries(actor, query);
  },
});
