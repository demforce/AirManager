import { apiRoute } from '@/lib/api/handler';
import { getMetarStation } from '@/server/services/app-settings.service';
import { getMetar } from '@/server/services/metar.service';

/**
 * Thin route (AD-1) — story 12.11, AC 5. Authenticated (`apiRoute`'s
 * default `auth: 'required'`), no further gate: every role sees the
 * sidebar weather card. `null` whenever no station is configured or the
 * upstream fetch failed (see `metar.service.ts#getMetar`'s doc-comment) —
 * NEVER a 4xx/5xx for that case, this is a best-effort widget.
 */
export const GET = apiRoute({
  handle: async () => {
    const station = await getMetarStation();
    return getMetar(station);
  },
});
