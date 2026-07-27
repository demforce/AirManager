import { apiRoute } from '@/lib/api/handler';
import { reclassifyCashMovementSchema, type ReclassifyCashMovementInput } from '@/lib/schemas/cash';
import { reclassifyCashMovement } from '@/server/services/cash.service';

type RouteParams = { id: string };

/**
 * Reclassifies an unattributed historical cash movement (story Billing-2,
 * AC 3) — the sole write available on a `CashMovement` besides create/reverse
 * (append-only otherwise, AD-3): only `paymentMethod` can change, and only
 * while it is currently `null`.
 */
export const PATCH = apiRoute<undefined, ReclassifyCashMovementInput, RouteParams>({
  bodySchema: reclassifyCashMovementSchema,
  handle: async ({ actor, params, body }) => reclassifyCashMovement(actor, params.id, body),
});
