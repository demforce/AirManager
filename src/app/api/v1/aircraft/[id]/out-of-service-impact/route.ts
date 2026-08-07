import { apiRoute } from '@/lib/api/handler';
import { outOfServiceImpactQuerySchema, type OutOfServiceImpactQuery } from '@/lib/schemas/aircraft';
import { previewOutOfServiceImpact } from '@/server/services/aircraft.service';

type RouteParams = { id: string };

/**
 * Story AOG-1b (AD-2): the PREVIEW behind "Stai per impattare N prenotazioni".
 * A read of its own, gated exactly like the write it precedes
 * (`aircraft.manage`), rather than a client-built `GET /api/v1/bookings` query
 * — see `previewOutOfServiceImpact`'s doc-comment for why.
 */
export const GET = apiRoute<OutOfServiceImpactQuery, undefined, RouteParams>({
  querySchema: outOfServiceImpactQuerySchema,
  handle: async ({ actor, params, query }) => previewOutOfServiceImpact(actor, params.id, query),
});
