import { apiRoute } from '@/lib/api/handler';
import { createUserSchema } from '@/lib/schemas/users';
import { createUser } from '@/server/services/users.service';

/**
 * Thin route (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. All
 * authorization still lives in `users.service.ts` (AD-5). Story 12.13: the
 * sibling GET (list) handler was removed — the Piloti page reads its roster
 * from `people.service.ts#listPilotsPageData` directly, never from here.
 */
export const POST = apiRoute({
  bodySchema: createUserSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createUser(actor, body),
});
