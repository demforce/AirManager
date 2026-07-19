import { apiRoute } from '@/lib/api/handler';
import { updateUserSchema, type UpdateUserInput } from '@/lib/schemas/users';
import { updateUser } from '@/server/services/users.service';

type RouteParams = { id: string };

/**
 * Story 12.13: the sibling GET (single) handler was removed — no consumer
 * ever read it directly (the Piloti page reads its roster from
 * `people.service.ts#listPilotsPageData`).
 */
export const PATCH = apiRoute<undefined, UpdateUserInput, RouteParams>({
  bodySchema: updateUserSchema,
  handle: async ({ actor, params, body }) => updateUser(actor, params.id, body),
});
