import { apiRoute } from '@/lib/api/handler';
import { instructorCompensationQuerySchema } from '@/lib/schemas/instructor-compensation';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { exportInstructorCompensationXlsx } from '@/server/services/exports.service';
import { getCompensationSummary, getInstructorCompensationDetail } from '@/server/services/instructor-compensation.service';

/**
 * Thin route (AD-1) — real authorization (`finance.manage`) stays in
 * `instructor-compensation.service.ts` (AD-5). Story 12.7, AC 3: ONE route,
 * three branches — `?format=xlsx` exports the summary (never the detail,
 * `personId` is ignored there), `?personId=` returns the single-instructor
 * DETAIL (KPI + recent flights/students for the profile slide-over), no
 * query at all returns the full roster's summary.
 */
export const GET = apiRoute({
  querySchema: instructorCompensationQuerySchema,
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportInstructorCompensationXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    if (query.personId) {
      return getInstructorCompensationDetail(actor, query.personId);
    }
    return getCompensationSummary(actor);
  },
});
