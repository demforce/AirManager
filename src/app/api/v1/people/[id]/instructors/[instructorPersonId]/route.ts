import { apiRoute } from '@/lib/api/handler';
import { unassignInstructor } from '@/server/services/school.service';

type RouteParams = { id: string; instructorPersonId: string };

/**
 * `{id}`/`{instructorPersonId}` are both `Person.id` (existing convention).
 * Hard delete (AC 2) — a concurrent double-DELETE answers one 204 + one 404,
 * never a 500 (`school.service.ts#unassignInstructor`'s TD-1 pattern).
 */
export const DELETE = apiRoute<undefined, undefined, RouteParams>({
  successStatus: 204,
  handle: async ({ actor, params }) => unassignInstructor(actor, params.id, params.instructorPersonId),
});
