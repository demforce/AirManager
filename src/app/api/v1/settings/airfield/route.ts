import { apiRoute } from '@/lib/api/handler';
import { airfieldBrandingSchema, type AirfieldBrandingDto } from '@/lib/schemas/settings';
import { getAirfieldBranding, setAirfieldBranding } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1): asymmetric gate (story 10.2, AC 1) — GET has no
 * permission check beyond the default authenticated session (every role
 * exporting a PDF needs the header), PUT is `settings.manage` (admin-only
 * edit). Real authorization stays in `app-settings.service.ts` (AD-5).
 */
export const GET = apiRoute({
  handle: async () => getAirfieldBranding(),
});

export const PUT = apiRoute<undefined, AirfieldBrandingDto>({
  bodySchema: airfieldBrandingSchema,
  handle: async ({ actor, body }) => setAirfieldBranding(actor, body),
});
