import { apiRoute } from '@/lib/api/handler';
import { negativeBalancesQuerySchema } from '@/lib/schemas/accounts';
import { listNegativeBalances } from '@/server/services/accounts.service';

export const GET = apiRoute({
  querySchema: negativeBalancesQuerySchema,
  handle: async ({ actor, query }) => listNegativeBalances(actor, query),
});
