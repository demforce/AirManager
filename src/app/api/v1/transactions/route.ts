import { apiRoute, IDEMPOTENCY_KEY_HEADER } from '@/lib/api/handler';
import { listTransactionsQuerySchema, recordTransactionSchema, type RecordTransactionInput } from '@/lib/schemas/transactions';
import { xlsxResponse } from '@/server/adapters/excel/response';
import { ValidationError } from '@/server/services/errors';
import { exportTransactionsXlsx } from '@/server/services/exports.service';
import { listTransactions, recordTransaction } from '@/server/services/transactions.service';

/**
 * Thin routes (AD-1): `finance.manage` (staff+admin) — real authorization
 * stays in `transactions.service.ts` (AD-5). `POST` mandates
 * `Idempotency-Key` (AC 4), same pattern as `POST /api/v1/instructor-payouts`
 * (story 12.7) — a money-mutating discriminated-union write, not opt-in like
 * the 5 pre-existing TD-2 routes it delegates to.
 */
export const GET = apiRoute({
  querySchema: listTransactionsQuerySchema,
  handle: async ({ actor, query }) => {
    if (query.format === 'xlsx') {
      const { buffer, filename } = await exportTransactionsXlsx(actor, query);
      return xlsxResponse(buffer, filename);
    }
    return listTransactions(actor, query);
  },
});

export const POST = apiRoute<undefined, RecordTransactionInput>({
  bodySchema: recordTransactionSchema,
  successStatus: 201,
  idempotency: { endpoint: 'transaction' },
  handle: async ({ actor, body, request }) => {
    if (!request.headers.get(IDEMPOTENCY_KEY_HEADER)) {
      throw new ValidationError(`The ${IDEMPOTENCY_KEY_HEADER} header is required for this endpoint.`, undefined, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    return recordTransaction(actor, body);
  },
});
