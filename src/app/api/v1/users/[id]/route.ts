import { apiRoute } from '@/lib/api/handler';
import { updateUserSchema, type UpdateUserInput } from '@/lib/schemas/users';
import { getUser, updateUser } from '@/server/services/users.service';

type RouteParams = { id: string };

export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => getUser(actor, params.id),
});

export const PATCH = apiRoute<undefined, UpdateUserInput, RouteParams>({
  bodySchema: updateUserSchema,
  handle: async ({ actor, params, body }) => updateUser(actor, params.id, body),
});
