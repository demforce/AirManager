import { apiRoute } from '@/lib/api/handler';
import { createUserSchema, listUsersQuerySchema } from '@/lib/schemas/users';
import { createUser, listUsers } from '@/server/services/users.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. All
 * authorization still lives in `users.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listUsersQuerySchema,
  handle: async ({ actor, query }) => listUsers(actor, query),
});

export const POST = apiRoute({
  bodySchema: createUserSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createUser(actor, body),
});
