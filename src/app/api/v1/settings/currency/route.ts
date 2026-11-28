import { apiRoute } from '@/lib/api/handler';
import { currencySettingsSchema, type CurrencySettingsInput } from '@/lib/schemas/settings';
import { getCurrencySettings, setCurrencySettings } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1) — story 19.8 (D-8: every block of the composite save
 * keeps its own single route). GET has no permission check (the currency of
 * a pilot is read by the flight and booking checks of any actor, see
 * `getCurrencySettings`); PUT is `settings.manage`.
 */
export const GET = apiRoute({
  handle: async () => getCurrencySettings(),
});

export const PUT = apiRoute<undefined, CurrencySettingsInput>({
  bodySchema: currencySettingsSchema,
  handle: async ({ actor, body }) => setCurrencySettings(actor, body),
});
