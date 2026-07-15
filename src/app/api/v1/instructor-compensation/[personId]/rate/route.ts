import { apiRoute } from '@/lib/api/handler';
import { setInstructorPayoutRateSchema, type SetInstructorPayoutRateInput } from '@/lib/schemas/instructor-compensation';
import { setPayoutRate } from '@/server/services/instructor-compensation.service';

type RouteParams = { personId: string };

/**
 * Thin route (AD-1) — real authorization (`payouts.manage`, ADMIN-only) stays
 * in `instructor-compensation.service.ts` (AD-5). `{personId}` is the
 * instructor's `Person.id` (same convention as `.../people/{id}/instructor-rates`),
 * not a dedicated `instructor-compensation/{id}` route — the plan names the
 * field but not this route (declared deviation, story 12.7 AC 3).
 */
export const PUT = apiRoute<undefined, SetInstructorPayoutRateInput, RouteParams>({
  bodySchema: setInstructorPayoutRateSchema,
  handle: async ({ actor, params, body }) => setPayoutRate(actor, params.personId, body.payoutRateCents),
});
