import { apiRoute } from '@/lib/api/handler';
import { reverseCashMovementSchema, type ReverseCashMovementInput } from '@/lib/schemas/cash';
import { reverseCashMovement } from '@/server/services/cash.service';

type RouteParams = { id: string };

export const POST = apiRoute<undefined, ReverseCashMovementInput, RouteParams>({
  bodySchema: reverseCashMovementSchema,
  handle: async ({ actor, params, body }) => reverseCashMovement(actor, params.id, body.reason),
});
