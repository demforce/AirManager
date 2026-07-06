import { apiRoute } from '@/lib/api/handler';
import { recordAdjustmentSchema, type RecordAdjustmentInput } from '@/lib/schemas/accounts';
import { recordAdjustment } from '@/server/services/accounts.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, RecordAdjustmentInput, RouteParams>({
  bodySchema: recordAdjustmentSchema,
  handle: async ({ actor, params, body }) => recordAdjustment(actor, params.id, body),
});
