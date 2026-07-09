import { apiRoute } from '@/lib/api/handler';
import { recordTopUpSchema, type RecordTopUpInput } from '@/lib/schemas/accounts';
import { recordTopUp } from '@/server/services/accounts.service';

type RouteParams = { id: string };

// Story TD-2 (AC 5): opt-in `Idempotency-Key` header — a network retry of
// this money-mutating POST replays the first response instead of recording
// a second top-up (`src/lib/api/handler.ts`'s `idempotency` option).
export const POST = apiRoute<undefined, RecordTopUpInput, RouteParams>({
  bodySchema: recordTopUpSchema,
  idempotency: { endpoint: 'account-topup' },
  handle: async ({ actor, params, body }) => recordTopUp(actor, params.id, body),
});
