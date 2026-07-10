import { z } from './zod-with-openapi';

// --- Airfield branding (story 10.2, AC 1) -----------------------------------
// The PDF report header's identity: an admin-configured name + optional
// logo, persisted on the existing `AppSetting` K/V table (no migration —
// see `app-settings.service.ts#getAirfieldBranding`/`setAirfieldBranding`).

/**
 * `GET/PUT /api/v1/settings/airfield` body/response (story 10.2, AC 1).
 * `logoDataUrl` is the ENTIRE image as a base64 data URL (client-side
 * upload, no storage infrastructure) — capped at ~200KB (`280_000` base64
 * chars, `AppSetting.value` is a plain Postgres `text` column, no separate
 * size limit of its own) and restricted to PNG/JPEG (the two formats
 * `<Image>` in the PDF adapter, `@react-pdf/renderer`, decodes without a
 * custom loader). `null` clears the logo (AC 1: "rimozione logo") — never
 * an empty string, which would fail the regex.
 */
export const airfieldBrandingSchema = z.object({
  name: z.string().trim().min(1).max(200),
  logoDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,/, 'logoDataUrl must be a PNG or JPEG data URL.')
    .max(280_000)
    .nullable(),
});

export type AirfieldBrandingDto = z.infer<typeof airfieldBrandingSchema>;
