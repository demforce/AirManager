import { apiRoute } from '@/lib/api/handler';
import { createInstructorRateSchema, type CreateInstructorRateInput } from '@/lib/schemas/people';
import { createInstructorRate, listInstructorRates } from '@/server/services/instructor-rates.service';

type RouteParams = { id: string };

/**
 * Thin routes (AD-1) — real authorization (`settings.manage` for POST,
 * `people.read` for GET) stays in `instructor-rates.service.ts` (AD-5),
 * same pattern as `.../aircraft/{id}/rates`. Person-scoped (`{id}` is the
 * `Person.id`, not the `InstructorProfile.id`), consistent with
 * `.../people/{id}/account/...`.
 */
export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => listInstructorRates(actor, params.id),
});

export const POST = apiRoute<undefined, CreateInstructorRateInput, RouteParams>({
  bodySchema: createInstructorRateSchema,
  successStatus: 201,
  handle: async ({ actor, params, body }) => createInstructorRate(actor, params.id, body),
});
