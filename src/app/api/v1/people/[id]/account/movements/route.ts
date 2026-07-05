import { apiRoute } from '@/lib/api/handler';
import { listAccountMovementsQuerySchema, type ListAccountMovementsQuery } from '@/lib/schemas/accounts';
import { listAccountMovements } from '@/server/services/accounts.service';

type RouteParams = { id: string };

export const GET = apiRoute<ListAccountMovementsQuery, undefined, RouteParams>({
  querySchema: listAccountMovementsQuerySchema,
  handle: async ({ actor, params, query }) => listAccountMovements(actor, params.id, query),
});
