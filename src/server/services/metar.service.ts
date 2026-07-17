/**
 * METAR fetch (story 12.11, AC 5) — feeds the sidebar `weather-card`
 * (`Sidebar.jsx:57-72`, already wired since story 12.1 behind the `metar`
 * prop, no caller until this story). Server-side only: no egress HTTP
 * existed in this codebase before this file (Dev Notes). Deliberately the
 * FIRST and ONLY module that talks to `aviationweather.gov` — every other
 * caller (the `GET /api/v1/metar` route, `dashboard/layout.tsx`) goes
 * through {@link getMetar}, never `fetch` directly.
 *
 * **Any error degrades to `null`, never throws** (AC 5): a malformed
 * response, a network failure, a non-200 status, an empty result set — all
 * of them return `null`, which the sidebar already renders as "no weather
 * card" (story 12.1's existing `metar &&` guard). METAR is a nice-to-have
 * widget, not a feature the rest of the app can ever depend on succeeding.
 *
 * **Cache**: a simple in-memory `Map`, keyed by station, 10-minute TTL
 * (AC 5) — module-level state, reset on every server restart/redeploy, no
 * new infrastructure. A cache MISS (including a failed fetch, cached as
 * `null`) still costs one real request; a HIT costs zero. Good enough for a
 * single-station sidebar widget refreshed on every dashboard navigation —
 * NOT a general-purpose cache (Dev Notes: "pattern nuovo, semplice").
 */

export type MetarCategory = 'VFR' | 'MVFR' | 'IFR';

export type MetarData = {
  raw: string;
  tempC: number;
  windDir: number;
  windKt: number;
  /** Visibility in meters (the API reports statute miles, converted here — 1 SM = 1609.344 m). */
  visM: number;
  /** QNH / altimeter setting, hPa. */
  qnh: number;
  category: MetarCategory;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { data: MetarData | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function isMetarCategory(value: unknown): value is MetarCategory {
  return value === 'VFR' || value === 'MVFR' || value === 'IFR';
}

/** `"10+"`/`"10"`/`10` (statute miles) -> a plain number. `null` for anything that doesn't parse (e.g. a fractional report like `"1/2"` — `Number` on the leading digits, `NaN` -> `null`, out of scope for "parsing minimo"). */
function parseVisibilitySM(visib: unknown): number | null {
  if (typeof visib === 'number') return Number.isFinite(visib) ? visib : null;
  if (typeof visib !== 'string') return null;
  const value = Number(visib.replace(/\+$/, ''));
  return Number.isFinite(value) ? value : null;
}

/** Lowest BKN/OVC cloud base, in feet — the "ceiling" the VFR/MVFR/IFR fallback derivation compares against (SKC/FEW/SCT layers don't count as a ceiling). `null` when there is none (a clear or scattered-only sky has no ceiling). */
function ceilingFtFromClouds(clouds: unknown): number | null {
  if (!Array.isArray(clouds)) return null;
  const bases = clouds
    .filter((layer): layer is { cover: unknown; base: unknown } => typeof layer === 'object' && layer !== null)
    .filter((layer) => (layer.cover === 'BKN' || layer.cover === 'OVC') && typeof layer.base === 'number')
    .map((layer) => layer.base as number);
  return bases.length > 0 ? Math.min(...bases) : null;
}

/** Standard ceiling/visibility category derivation (used only when `fltCat` is absent/unrecognized) — IFR: vis < 3SM or ceiling < 1000ft; MVFR: vis <= 5SM or ceiling <= 3000ft; VFR: otherwise. An unknown ceiling/visibility never blocks the OTHER dimension from still triggering a lower category. */
function deriveCategory(visibilitySM: number | null, ceilingFt: number | null): MetarCategory {
  if ((visibilitySM !== null && visibilitySM < 3) || (ceilingFt !== null && ceilingFt < 1000)) return 'IFR';
  if ((visibilitySM !== null && visibilitySM <= 5) || (ceilingFt !== null && ceilingFt <= 3000)) return 'MVFR';
  return 'VFR';
}

/**
 * Parses one `aviationweather.gov` METAR entry (verified field names:
 * `rawOb`/`temp`/`wdir`/`wspd`/`visib`/`altim`/`fltCat`/`clouds`) into
 * {@link MetarData}, or `null` if the entry is missing any of the 4
 * NUMERIC/text fields this DTO cannot do without (`raw`/`tempC`/`windKt`/
 * `qnh`) — `windDir`/`visM` degrade to `0` instead (a variable/calm wind
 * report, `"VRB"`, has no single direction; an unparsed visibility is rarer
 * still) rather than nulling an otherwise-good reading over a secondary
 * field. Exported for offline unit testing (Dev Notes: "MAI rete nei test").
 */
export function parseMetarEntry(entry: unknown): MetarData | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;

  const raw = typeof record['rawOb'] === 'string' ? record['rawOb'] : null;
  const tempC = typeof record['temp'] === 'number' ? record['temp'] : null;
  const windKt = typeof record['wspd'] === 'number' ? record['wspd'] : null;
  const qnh = typeof record['altim'] === 'number' ? record['altim'] : null;
  if (raw === null || tempC === null || windKt === null || qnh === null) {
    return null;
  }

  const windDir = typeof record['wdir'] === 'number' ? record['wdir'] : 0;
  const visibilitySM = parseVisibilitySM(record['visib']);
  const visM = visibilitySM !== null ? Math.round(visibilitySM * 1609.344) : 0;

  const fltCat = record['fltCat'];
  const category = isMetarCategory(fltCat)
    ? fltCat
    : fltCat === 'LIFR' // narrower than our 3-way type — bucketed into IFR, still the worst category we report.
      ? 'IFR'
      : deriveCategory(visibilitySM, ceilingFtFromClouds(record['clouds']));

  return { raw, tempC, windDir, windKt, visM, qnh, category };
}

async function fetchMetar(station: string): Promise<MetarData | null> {
  try {
    const response = await fetch(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(station)}&format=json`);
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length === 0) {
      return null;
    }
    return parseMetarEntry(body[0]);
  } catch {
    // ANY failure (network, malformed JSON, ...) degrades to null (AC 5) — never thrown.
    return null;
  }
}

/**
 * Reads the current METAR for `station` (an ICAO code), 10-minute
 * in-memory cache (AC 5). An empty/blank station short-circuits to `null`
 * with no request at all (no station configured yet).
 */
export async function getMetar(station: string): Promise<MetarData | null> {
  const trimmed = station.trim();
  if (!trimmed) {
    return null;
  }

  const cached = cache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await fetchMetar(trimmed);
  cache.set(trimmed, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
