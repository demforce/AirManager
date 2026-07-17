import { apiRoute } from '@/lib/api/handler';
import { smtpSettingsInputSchema, type SmtpSettingsInput } from '@/lib/schemas/settings';
import { getSmtpSettings, setSmtpSettings } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1) — story 12.11, AC 1/2. Both `settings.manage`
 * (admin-only, real gate in the service): unlike `settings/scheduling`,
 * nobody but the admin editing this card needs to see the SMTP config.
 * `pass` is write-only (never in the GET response, AC 1).
 */
export const GET = apiRoute({
  handle: async ({ actor }) => getSmtpSettings(actor),
});

export const PUT = apiRoute<undefined, SmtpSettingsInput>({
  bodySchema: smtpSettingsInputSchema,
  handle: async ({ actor, body }) => setSmtpSettings(actor, body),
});
