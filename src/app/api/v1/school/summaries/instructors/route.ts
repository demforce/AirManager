import { apiRoute } from '@/lib/api/handler';
import { schoolSummaryQuerySchema } from '@/lib/schemas/school';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { exportInstructorHourSummariesXlsx } from '@/server/services/exports.service';
import { getInstructorHourSummaries } from '@/server/services/school.service';

/**
 * Two access paths, decided by the service (story 9.3, AC 2): `school.manage.any`
 * sees every active instructor, `school.manage.own` sees ONLY the caller's
 * own row (FR-2 "proprie ore"). Period `from`/`to` mandatory (AC 5).
 */
export const GET = apiRoute({
  querySchema: schoolSummaryQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportInstructorHourSummariesXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return getInstructorHourSummaries(actor, query);
  },
});
