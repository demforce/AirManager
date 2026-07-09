import { apiRoute } from '@/lib/api/handler';
import { listCashMovementsQuerySchema, recordCashMovementSchema } from '@/lib/schemas/cash';
import { listCashMovements, recordCashMovement } from '@/server/services/cash.service';

/**
 * Thin routes (AD-1): `finance.manage` (staff+admin) for both — the cash
 * register itself is day-to-day operation, unlike category CRUD
 * (`settings.manage`). Real authorization stays in `cash.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listCashMovementsQuerySchema,
  handle: async ({ actor, query }) => listCashMovements(actor, query),
});

// Story TD-2 (AC 5): opt-in `Idempotency-Key` header — see
// `people/[id]/account/top-ups/route.ts`. `POST
// /cash-movements/{id}/reverse` (storno) is NOT covered: it is already
// protected by `CashMovement.reversalOfId`'s existing unique constraint (at
// most one storno per movement, 409 on a retry).
export const POST = apiRoute({
  bodySchema: recordCashMovementSchema,
  successStatus: 201,
  idempotency: { endpoint: 'cash-movement' },
  handle: async ({ actor, body }) => recordCashMovement(actor, body),
});
