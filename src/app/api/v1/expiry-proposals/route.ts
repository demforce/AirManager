import { apiRoute } from '@/lib/api/handler';
import { listExpiryProposalsQuerySchema } from '@/lib/schemas/expiries';
import { listExpiryProposals } from '@/server/services/expiries.service';

/** Thin route (AD-1): `expiries.manage` (staff's validation queue) — real authorization stays in `expiries.service.ts` (AD-5). */
export const GET = apiRoute({
  querySchema: listExpiryProposalsQuerySchema,
  handle: async ({ actor, query }) => listExpiryProposals(actor, query),
});
