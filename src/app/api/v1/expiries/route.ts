import { apiRoute } from '@/lib/api/handler';
import { registerExpirySchema, type RegisterExpiryInput } from '@/lib/schemas/expiries';
import { registerExpiry } from '@/server/services/expiries.service';

/**
 * Thin route (AD-1): `expiries.manage` (staff+admin) — real authorization
 * stays in `expiries.service.ts` (AD-5).
 */
export const POST = apiRoute<undefined, RegisterExpiryInput>({
  bodySchema: registerExpirySchema,
  successStatus: 201,
  handle: async ({ actor, body }) => registerExpiry(actor, body),
});
