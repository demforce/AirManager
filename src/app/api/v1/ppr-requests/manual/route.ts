import { apiRoute } from '@/lib/api/handler';
import { createManualPprRequestSchema } from '@/lib/schemas/ppr';
import { createManualPprRequest } from '@/server/services/ppr.service';

/**
 * Thin route (AD-1): `ppr.manage` — real authorization stays in
 * `ppr.service.ts` (AD-5). Staff manual PPR intake (epic 12, story 12.4,
 * AC 1), shared by BOTH the console's "PPR manuale" slide-over and the
 * movements page's "Registra arrivo" slide-over (`approveImmediately:
 * true` in the body). `idempotency` (creates data, same convention as
 * `flights/route.ts`'s registration POST).
 */
export const POST = apiRoute({
  bodySchema: createManualPprRequestSchema,
  successStatus: 201,
  idempotency: { endpoint: 'ppr-manual-create' },
  handle: async ({ actor, body }) => createManualPprRequest(actor, body, { approveImmediately: body.approveImmediately }),
});
