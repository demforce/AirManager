import { apiRoute } from '@/lib/api/handler';
import { schoolSummaryQuerySchema } from '@/lib/schemas/school';
import { getStudentHourSummaries } from '@/server/services/school.service';

/**
 * Staff-only (`school.manage.any`) — the per-student dual-command/solo hour
 * summary for a mandatory period (story 9.3, AC 1/5).
 */
export const GET = apiRoute({
  querySchema: schoolSummaryQuerySchema,
  handle: async ({ actor, query }) => getStudentHourSummaries(actor, query),
});
