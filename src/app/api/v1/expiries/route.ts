import { apiRoute } from '@/lib/api/handler';
import { listAllExpiriesQuerySchema, registerExpirySchema, type RegisterExpiryInput } from '@/lib/schemas/expiries';
import { listAllExpiries, registerExpiry } from '@/server/services/expiries.service';

/**
 * Thin routes (AD-1): `expiries.manage` (staff+admin) — real authorization
 * stays in `expiries.service.ts` (AD-5). GET is the story 6.4 urgency
 * dashboard (AC 1); POST is the story 6.2 registration.
 */
export const GET = apiRoute({
  querySchema: listAllExpiriesQuerySchema,
  handle: async ({ actor, query }) => listAllExpiries(actor, query),
});

export const POST = apiRoute<undefined, RegisterExpiryInput>({
  bodySchema: registerExpirySchema,
  successStatus: 201,
  handle: async ({ actor, body }) => registerExpiry(actor, body),
});
