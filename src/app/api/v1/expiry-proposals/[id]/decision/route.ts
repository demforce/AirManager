import { apiRoute } from '@/lib/api/handler';
import { decideProposalSchema, type DecideProposalInput } from '@/lib/schemas/expiries';
import { decideExpiryProposal } from '@/server/services/expiries.service';

type RouteParams = { id: string };

/** Thin route (AD-1): `expiries.manage` only — real authorization stays in `expiries.service.ts` (AD-5). `{id}` is the `ExpiryUpdateProposal.id`. */
export const POST = apiRoute<undefined, DecideProposalInput, RouteParams>({
  bodySchema: decideProposalSchema,
  handle: async ({ actor, params, body }) => decideExpiryProposal(actor, params.id, body.decision),
});
