/**
 * "Meteo campo" card of the mobile home (story 15.3, AC 5, template lines
 * 117-121) — rendered on ALL THREE faces (ratifica R-15.3-f).
 *
 * Why it exists at all: the METAR is already fetched by `dashboard/layout.tsx`
 * but rendered ONLY inside `Sidebar`, and `.sidebar` is `display: none` at
 * <=640px while `.weather-card` is hidden from 900px down (`airops.css`, rail
 * of story 13.10) — so on a phone the airfield weather was invisible. This card
 * is not a duplicate of a visible desktop surface: below 640px it is the only
 * way to see it. (The 641-900px band stays uncovered on purpose: epic R1 pins
 * this story to <=640px, and the gap is tracked as TD.)
 *
 * A pure SERVER renderer: no client JS, no network call from the browser
 * (AC 5). Absent, not empty, when there is no METAR — the same `metar &&` guard
 * `Sidebar` has applied since story 12.1, since `getMetar` degrades every
 * failure (unconfigured station, upstream down, malformed answer) to `null`.
 *
 * The category dot reuses `.flight-dot.vfr|mvfr|ifr`, already defined for the
 * sidebar card: no new colour literal.
 */
import type { MetarCategory } from '@/server/services/metar.service';

const CATEGORY_CLASS: Record<MetarCategory, string> = { VFR: 'vfr', MVFR: 'mvfr', IFR: 'ifr' };

export type MobileMetarCardProps = {
  /** ICAO of the reporting station (`getMetarStation()`, ICAO of the airfield by default). */
  station: string;
  /** Already rounded by the caller — this component formats nothing. */
  tempC: number;
  category: MetarCategory;
  raw: string;
  labels: { title: string };
};

export function MobileMetarCard({ station, tempC, category, raw, labels }: MobileMetarCardProps) {
  return (
    <div className="card mobile-metar-card" data-testid="mobile-metar-card">
      <div className="mobile-metar-head">
        <span className="mobile-metar-label">{labels.title}</span>
        <span className="mobile-metar-station">{station}</span>
      </div>
      <div className="mobile-metar-main">
        <span className="mobile-metar-temp">
          {tempC}
          {/* Not a translated string: `Sidebar`'s own weather card hardcodes the same unit. */}
          <span className="unit">°C</span>
        </span>
        <span className="mobile-metar-cat">
          <span className={`flight-dot ${CATEGORY_CLASS[category]}`} />
          {category}
        </span>
      </div>
      <div className="mobile-metar-raw" data-testid="mobile-metar-raw">
        {raw}
      </div>
    </div>
  );
}
