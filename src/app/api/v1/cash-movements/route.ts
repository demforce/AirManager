import { apiRoute } from '@/lib/api/handler';
import { listCashMovementsQuerySchema, recordCashMovementSchema } from '@/lib/schemas/cash';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { listCashMovements, recordCashMovement } from '@/server/services/cash.service';
import { exportCashMovementsXlsx } from '@/server/services/exports.service';

/**
 * Thin routes (AD-1): `finance.manage` (ADMIN-only) for both — the cash
 * register itself is day-to-day operation, unlike category CRUD
 * (`settings.manage`). Real authorization stays in `cash.service.ts` (AD-5).
 */
export const GET = apiRoute({
  querySchema: listCashMovementsQuerySchema,
  // Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint, not a dedicated route.
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportCashMovementsXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listCashMovements(actor, query);
  },
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
