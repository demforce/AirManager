import { apiRoute } from '@/lib/api/handler';
import { listNegativeBalances } from '@/server/services/accounts.service';

export const GET = apiRoute({
  handle: async ({ actor }) => listNegativeBalances(actor),
});
