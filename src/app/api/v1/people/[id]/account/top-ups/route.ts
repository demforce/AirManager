import { apiRoute } from '@/lib/api/handler';
import { recordTopUpSchema, type RecordTopUpInput } from '@/lib/schemas/accounts';
import { recordTopUp } from '@/server/services/accounts.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, RecordTopUpInput, RouteParams>({
  bodySchema: recordTopUpSchema,
  handle: async ({ actor, params, body }) => recordTopUp(actor, params.id, body),
});
