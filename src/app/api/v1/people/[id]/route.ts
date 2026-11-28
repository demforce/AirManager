import { apiRoute } from '@/lib/api/handler';
import { updatePersonCompositeSchema, type UpdatePersonCompositeInput } from '@/lib/schemas/people';
import { getPerson, updatePerson } from '@/server/services/people.service';

type RouteParams = { id: string };

export const GET = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => getPerson(actor, params.id),
});

export const PATCH = apiRoute<undefined, UpdatePersonCompositeInput, RouteParams>({
  bodySchema: updatePersonCompositeSchema,
  handle: async ({ actor, params, body }) => updatePerson(actor, params.id, body),
});
