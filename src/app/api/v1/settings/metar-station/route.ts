import { apiRoute } from '@/lib/api/handler';
import { metarStationInputSchema, type MetarStationInput } from '@/lib/schemas/settings';
import { getMetarStation, setMetarStation } from '@/server/services/app-settings.service';

/**
 * Thin routes (AD-1) — story 12.11, AC 1/5. GET has no permission check
 * (the sidebar weather card is rendered for every authenticated role); PUT
 * is `settings.manage`.
 */
export const GET = apiRoute({
  handle: async () => ({ station: await getMetarStation() }),
});

export const PUT = apiRoute<undefined, MetarStationInput>({
  bodySchema: metarStationInputSchema,
  handle: async ({ actor, body }) => ({ station: await setMetarStation(actor, body.station) }),
});
