import { apiRoute } from '@/lib/api/handler';
import { listOwnStudents } from '@/server/services/school.service';

/**
 * Always self-scoped on the calling instructor (`actor.personId`,
 * `school.manage.own`) — no query params, by construction an instructor can
 * never enumerate another instructor's students (AC 4).
 */
export const GET = apiRoute({
  handle: async ({ actor }) => listOwnStudents(actor),
});
