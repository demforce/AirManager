import { apiRoute } from '@/lib/api/handler';
import { createPersonSchema, listPeopleQuerySchema } from '@/lib/schemas/people';
import { createPerson, listPeople } from '@/server/services/people.service';

/**
 * Thin routes (AD-1): the shared wrapper (story 1.5) validates, calls the
 * service, and maps the result/error to the AD-8 envelope. All
 * authorization still lives in `people.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listPeopleQuerySchema,
  handle: async ({ actor, query }) => listPeople(actor, query),
});

export const POST = apiRoute({
  bodySchema: createPersonSchema,
  successStatus: 201,
  handle: async ({ actor, body }) => createPerson(actor, body),
});
