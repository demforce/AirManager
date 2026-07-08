import { apiRoute } from '@/lib/api/handler';
import { recordAdjustmentSchema, type RecordAdjustmentInput } from '@/lib/schemas/accounts';
import { recordAdjustment } from '@/server/services/accounts.service';

type RouteParams = { id: string };

// Story TD-2 (AC 5): opt-in `Idempotency-Key` header — see top-ups/route.ts.
export const POST = apiRoute<undefined, RecordAdjustmentInput, RouteParams>({
  bodySchema: recordAdjustmentSchema,
  idempotency: { endpoint: 'account-adjustment' },
  handle: async ({ actor, params, body }) => recordAdjustment(actor, params.id, body),
});
