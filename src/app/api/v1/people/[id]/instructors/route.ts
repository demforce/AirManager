import { apiRoute } from '@/lib/api/handler';
import { assignInstructorSchema, type AssignInstructorInput } from '@/lib/schemas/school';
import { assignInstructor, listStudentInstructors } from '@/server/services/school.service';

type RouteParams = { id: string };

/**
 * Thin routes (AD-1) — real authorization (`school.manage.any`) stays in
 * `school.service.ts` (AD-5), same pattern as `.../instructor-rates`.
 * `{id}` is the STUDENT's `Person.id`, never a profile id (existing
 * convention: routes never expose profile ids).
 */
export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => listStudentInstructors(actor, params.id),
});

export const POST = apiRoute<undefined, AssignInstructorInput, RouteParams>({
  bodySchema: assignInstructorSchema,
  successStatus: 201,
  handle: async ({ actor, params, body }) => assignInstructor(actor, params.id, body),
});
