import { apiRoute } from '@/lib/api/handler';
import { schoolSummaryQuerySchema } from '@/lib/schemas/school';
import { getInstructorHourSummaries } from '@/server/services/school.service';

/**
 * Two access paths, decided by the service (story 9.3, AC 2): `school.manage.any`
 * sees every active instructor, `school.manage.own` sees ONLY the caller's
 * own row (FR-2 "proprie ore"). Period `from`/`to` mandatory (AC 5).
 */
export const GET = apiRoute({
  querySchema: schoolSummaryQuerySchema,
  handle: async ({ actor, query }) => getInstructorHourSummaries(actor, query),
});
