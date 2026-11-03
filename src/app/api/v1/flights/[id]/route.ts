import { apiRoute } from '@/lib/api/handler';
import { registerFlightSchema, type RegisterFlightInput } from '@/lib/schemas/flights';
import { deleteFlight, updateFlight } from '@/server/services/flights.service';

type RouteParams = { id: string };

/**
 * Thin routes (AD-1): real authorization/logic (`flights.manage`, story 19.6 —
 * R-19-c) stays in `flights.service.ts` (AD-5). No `Idempotency-Key` on either:
 * both verbs are idempotent by HTTP semantics — a second identical `PUT`
 * rewrites the same values, a second `DELETE` answers 404.
 */

/** Full replacement with the `POST /api/v1/flights` body — 200 with the SAME flight id (edit in place, AD-4). */
export const PUT = apiRoute<undefined, RegisterFlightInput, RouteParams>({
  bodySchema: registerFlightSchema,
  handle: async ({ actor, params, body }) => updateFlight(actor, params.id, body),
});

/** 204 No Content — same convention as `DELETE /api/v1/expiries/{id}`; the flight goes together with its charge (AD-3). */
export const DELETE = apiRoute<undefined, undefined, RouteParams>({
  successStatus: 204,
  handle: async ({ actor, params }) => {
    await deleteFlight(actor, params.id);
    return undefined;
  },
});
