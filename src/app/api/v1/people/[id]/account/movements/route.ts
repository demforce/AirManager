import { apiRoute } from '@/lib/api/handler';
import { listAccountMovementsQuerySchema, type ListAccountMovementsQuery } from '@/lib/schemas/accounts';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { listAccountMovements } from '@/server/services/accounts.service';
import { exportAccountMovementsXlsx } from '@/server/services/exports.service';

type RouteParams = { id: string };

// Story 10.1 (AC 1): `?format=xlsx` is the SAME endpoint. `assertReadAccess`
// inside `listAccountMovements` (reused by `exportAccountMovementsXlsx`) is
// the only own/staff access check — no extra guard needed in the route.
export const GET = apiRoute<ListAccountMovementsQuery, undefined, RouteParams>({
  querySchema: listAccountMovementsQuerySchema,
  handle: async ({ actor, params, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportAccountMovementsXlsx(actor, params.id, query);
      return xlsxResponse(buffer, filename);
    }
    return listAccountMovements(actor, params.id, query);
  },
});
