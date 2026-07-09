import { apiRoute } from '@/lib/api/handler';
import { pprOperatingInstructionsSchema, type PprOperatingInstructionsDto } from '@/lib/schemas/ppr';
import { getPprOperatingInstructions, setPprOperatingInstructions } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1): asymmetric gate on purpose (story 8.2, AC 1) — GET is
 * `ppr.manage` (staff sees the configured instructions from the queue page),
 * PUT is `settings.manage` (admin-only edit). Real authorization stays in
 * `app-settings.service.ts` (AD-5).
 */
export const GET = apiRoute({
  handle: async ({ actor }) => getPprOperatingInstructions(actor),
});

export const PUT = apiRoute<undefined, PprOperatingInstructionsDto>({
  bodySchema: pprOperatingInstructionsSchema,
  handle: async ({ actor, body }) => setPprOperatingInstructions(actor, body),
});
