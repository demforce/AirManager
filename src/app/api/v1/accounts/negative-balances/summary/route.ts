import { apiRoute } from '@/lib/api/handler';
import { getNegativeBalanceSummary } from '@/server/services/accounts.service';

export const GET = apiRoute({
  handle: async ({ actor }) => getNegativeBalanceSummary(actor),
});
