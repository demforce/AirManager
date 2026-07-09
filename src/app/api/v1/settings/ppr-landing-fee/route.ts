import { apiRoute } from '@/lib/api/handler';
import { pprLandingFeeDefaultSchema, type PprLandingFeeDefaultDto } from '@/lib/schemas/ppr';
import { getPprLandingFeeDefaultCents, setPprLandingFeeDefaultCents } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1): exact mirror of `ppr-operating-instructions`'s
 * asymmetric gate (story 8.3, AC 1) — GET is `ppr.manage` (the completion
 * panel prefills from it), PUT is `settings.manage` (admin-only edit). Real
 * authorization stays in `app-settings.service.ts` (AD-5).
 */
export const GET = apiRoute({
  handle: async ({ actor }) => ({ landingFeeCents: await getPprLandingFeeDefaultCents(actor) }),
});

export const PUT = apiRoute<undefined, PprLandingFeeDefaultDto>({
  bodySchema: pprLandingFeeDefaultSchema,
  handle: async ({ actor, body }) => ({ landingFeeCents: await setPprLandingFeeDefaultCents(actor, body.landingFeeCents) }),
});
