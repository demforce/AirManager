import { apiRoute } from '@/lib/api/handler';
import { reverseCashMovementSchema, type ReverseCashMovementInput } from '@/lib/schemas/cash';
import { reverseCashMovement } from '@/server/services/cash.service';

type RouteParams = { id: string };

// No `Idempotency-Key` (story TD-2, AC 5): already protected by
// `CashMovement.reversalOfId`'s unique constraint (at most one storno per
// movement, 409 on a retry) — a second layer here would duplicate that
// protection, not add to it.
export const POST = apiRoute<undefined, ReverseCashMovementInput, RouteParams>({
  bodySchema: reverseCashMovementSchema,
  handle: async ({ actor, params, body }) => reverseCashMovement(actor, params.id, body.reason),
});
