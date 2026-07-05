import { apiRoute } from '@/lib/api/handler';
import { archivePerson } from '@/server/services/people.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, undefined, RouteParams>({
  handle: async ({ actor, params }) => archivePerson(actor, params.id),
});
