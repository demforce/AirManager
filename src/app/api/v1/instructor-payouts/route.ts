import { apiRoute, IDEMPOTENCY_KEY_HEADER } from '@/lib/api/handler';
import { recordInstructorPayoutSchema, type RecordInstructorPayoutInput } from '@/lib/schemas/instructor-compensation';
import { ValidationError } from '@/server/services/errors';
import { recordPayout } from '@/server/services/instructor-compensation.service';

/**
 * Thin route (AD-1) — real authorization (`payouts.manage`, ADMIN-only) stays
 * in `instructor-compensation.service.ts` (AD-5). `Idempotency-Key` is
 * MANDATORY here (AC 3) — unlike TD-2's other 5 opt-in money-mutating routes:
 * `apiRoute`'s `idempotency` option itself stays opt-in (absent header ==
 * proceed unprotected, story TD-2 AC 3), so the explicit check below is what
 * turns "a retry replays" into "a retry MUST replay" for this one route —
 * every request without the header is rejected before the service ever runs.
 */
export const POST = apiRoute<undefined, RecordInstructorPayoutInput>({
  bodySchema: recordInstructorPayoutSchema,
  successStatus: 201,
  idempotency: { endpoint: 'instructor-payout' },
  handle: async ({ actor, body, request }) => {
    if (!request.headers.get(IDEMPOTENCY_KEY_HEADER)) {
      throw new ValidationError(`The ${IDEMPOTENCY_KEY_HEADER} header is required for this endpoint.`, undefined, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    return recordPayout(actor, body);
  },
});
