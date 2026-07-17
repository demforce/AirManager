import { apiRoute } from '@/lib/api/handler';
import { schedulingSettingsSchema, type SchedulingSettingsInput } from '@/lib/schemas/settings';
import { getSchedulingSettings, setSchedulingSettings } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1) — story 12.11, AC 1/4. GET has no permission check
 * (needed by any actor creating a booking, not just staff — see
 * `getSchedulingSettings`'s doc-comment); PUT is `settings.manage`.
 */
export const GET = apiRoute({
  handle: async () => getSchedulingSettings(),
});

export const PUT = apiRoute<undefined, SchedulingSettingsInput>({
  bodySchema: schedulingSettingsSchema,
  handle: async ({ actor, body }) => setSchedulingSettings(actor, body),
});
