'use client';

import { BarChart } from '@/components/charts/bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { RankBars } from '@/components/charts/rank-bars';
import { RankedCapFoot } from '@/components/charts/ranked-cap-foot';
import { formatCents } from '@/lib/money';
import type { StatsQuery, StatsResponseDto } from '@/lib/schemas/stats';
import { formatMinutes } from '@/lib/time';

type MixKey = 'SCHOOL' | 'TOURISM';

/**
 * Movement-mix tones (AC 3) — two of the prototype's own legend tokens
 * (`--accent`/`--ok`), reassigned to D13's real taxonomy (the prototype's own
 * keys, "Dep/arr basati"/"Noleggi"/etc., don't exist in this domain —
 * ratifica utente 1). Story 19.5 removed the third flight type, and its
 * `--ink-3` band with it.
 *
 * Story 15.8b (R-15.8b-e): a `.flow-bar-*` CLASS, no longer an inline
 * `background`. Measured in the light theme, the raw tokens painted the four
 * bands at 2.73 / 2.04 / 4.85 / 3.61 — two of them under the 3:1 floor a
 * graphic object has to meet — and the four legend DOTS, which share this
 * map, carried the identical four values. The classes carry the ink-mixed
 * tones decided once in `airops.css` next to `.stat-tone-*`.
 */
const MIX_TONES: Record<MixKey, string> = {
  SCHOOL: 'flow-bar-in',
  TOURISM: 'flow-bar-accent',
};

export type ReportsLabels = {
  charts: {
    revenue: { title: string; sub: string };
    hours: { title: string; sub: string };
    fleet: { title: string; sub: string; empty: string };
  };
  movementMix: { title: string; sub: string; keys: Record<MixKey, string> };
  instructors: { title: string; sub: string; empty: string; owedUnknown: string };
  rankAircraft: { title: string; sub: string; metrics: { hours: string; revenue: string }; empty: string };
  rankPilots: { title: string; sub: string; metrics: { hours: string; spent: string }; empty: string };
};

export type ReportsConsoleProps = {
  stats: StatsResponseDto;
  period: StatsQuery['period'];
  seriesLabels: string[];
  moneyLocale: 'it' | 'en';
  labels: ReportsLabels;
};

/**
 * Reports body (epic 12, story 12.10, AC 3) — the 3 `.split` rows and the
 * full-width "Utilizzo flotta" card below the page's own page-head/kpi-row. Client boundary (pattern 12.5-12.9) mainly
 * for `RankBars`' own metric-toggle state; `BarChart`/`LineChart` are pure
 * presentational and simply render inside this tree.
 */
export function ReportsConsole({ stats, period, seriesLabels, moneyLocale, labels }: ReportsConsoleProps) {
  const revenueData = stats.series.revenueCents.map((cents) => cents / 100);
  const hoursData = stats.series.flightMinutes.map((minutes) => minutes / 60);
  const { fleetHours, fleetRevenue, instructorHours, pilotHours, pilotSpent } = stats.rankings;
  const fleetMax = Math.max(1, ...fleetHours.items.map((aircraft) => aircraft.minutes));
  const instructorsMax = Math.max(1, ...instructorHours.items.map((instructor) => instructor.minutes));
  const mixTotal = stats.movementMix.reduce((sum, mix) => sum + mix.count, 0);

  return (
    <>
      <div className="split">
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.charts.revenue.title}</div>
            <span className="card-sub">{labels.charts.revenue.sub}</span>
          </div>
          <div className="card-body">
            <LineChart data={revenueData} labels={seriesLabels} color="oklch(0.55 0.14 155)" />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.charts.hours.title}</div>
            <span className="card-sub">{labels.charts.hours.sub}</span>
          </div>
          <div className="card-body">
            <BarChart data={hoursData} labels={seriesLabels} color="var(--ink)" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.charts.fleet.title}</div>
          <span className="card-sub">{labels.charts.fleet.sub}</span>
        </div>
        {fleetHours.items.length === 0 ? (
          <div className="card-body">
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels.charts.fleet.empty}</p>
          </div>
        ) : (
          <>
            <div className="util-rows ranked-rows">
              {fleetHours.items.map((aircraft) => (
                <div
                  className="util-row"
                  key={aircraft.key}
                  data-testid={`reports-fleet-row-${aircraft.label}`}
                  style={{ gridTemplateColumns: '90px 1fr 80px' }}
                >
                  <div className="util-tail mono">{aircraft.label}</div>
                  <div className="util-bar">
                    <div className="seg flown" style={{ left: 0, width: `${(aircraft.minutes / fleetMax) * 100}%` }} />
                  </div>
                  <div className="util-value mono">{formatMinutes(aircraft.minutes)}</div>
                </div>
              ))}
            </div>
            <RankedCapFoot shown={fleetHours.items.length} total={fleetHours.total} rank="fleet-hours" period={period} reference={stats.referenceMonth} testId="reports-fleet-cap" />
          </>
        )}
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.movementMix.title}</div>
            <span className="card-sub">{labels.movementMix.sub}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ height: 18, borderRadius: 4, overflow: 'hidden', display: 'flex', border: '1px solid var(--border)' }}>
              {stats.movementMix.map((mix) => (
                <div
                  key={mix.key}
                  className={MIX_TONES[mix.key]}
                  style={{ width: `${mixTotal > 0 ? (mix.count / mixTotal) * 100 : 0}%` }}
                  title={`${labels.movementMix.keys[mix.key]} ${mix.count}`}
                />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
              {stats.movementMix.map((mix) => (
                <div key={mix.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={MIX_TONES[mix.key]} style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
                    {labels.movementMix.keys[mix.key]}
                  </span>
                  <span className="mono num" style={{ color: 'var(--ink-2)' }}>
                    {mix.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.instructors.title}</div>
            <span className="card-sub">{labels.instructors.sub}</span>
          </div>
          {instructorHours.items.length === 0 ? (
            <div className="card-body">
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels.instructors.empty}</p>
            </div>
          ) : (
            <>
              <div className="util-rows ranked-rows">
                {instructorHours.items.map((instructor) => (
                  <div
                    className="util-row"
                    key={instructor.key}
                    data-testid={`reports-instructor-row-${instructor.label}`}
                    style={{ gridTemplateColumns: '160px 1fr 100px' }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{instructor.label}</div>
                    <div className="util-bar">
                      <div className="seg flown" style={{ left: 0, width: `${(instructor.minutes / instructorsMax) * 100}%` }} />
                    </div>
                    <div className="util-value mono">
                      {formatMinutes(instructor.minutes)} · {instructor.cents === null ? labels.instructors.owedUnknown : formatCents(instructor.cents, moneyLocale)}
                    </div>
                  </div>
                ))}
              </div>
              <RankedCapFoot shown={instructorHours.items.length} total={instructorHours.total} rank="instructor-hours" period={period} reference={stats.referenceMonth} testId="reports-instructors-cap" />
            </>
          )}
        </div>
      </div>

      <div className="split">
        <RankBars
          title={labels.rankAircraft.title}
          sub={labels.rankAircraft.sub}
          period={period}
          reference={stats.referenceMonth}
          monoLabel
          labelCol={80}
          testId="reports-rank-aircraft"
          emptyLabel={labels.rankAircraft.empty}
          capTestId="reports-rank-aircraft-cap"
          metricsClassName="reports-rank-metrics"
          metrics={[
            { rank: 'fleet-hours', rows: fleetHours, value: 'minutes', testIdPrefix: 'reports-rank-aircraft-row-', label: labels.rankAircraft.metrics.hours, barClass: 'flow-bar-in', format: (v) => formatMinutes(v) },
            { rank: 'fleet-revenue', rows: fleetRevenue, value: 'cents', testIdPrefix: 'reports-rank-aircraft-row-', label: labels.rankAircraft.metrics.revenue, barClass: 'flow-bar-accent', format: (v) => formatCents(v, moneyLocale) },
          ]}
        />
        <RankBars
          title={labels.rankPilots.title}
          sub={labels.rankPilots.sub}
          period={period}
          reference={stats.referenceMonth}
          labelCol={140}
          testId="reports-rank-pilots"
          emptyLabel={labels.rankPilots.empty}
          capTestId="reports-rank-pilots-cap"
          metricsClassName="reports-rank-metrics"
          metrics={[
            { rank: 'pilot-hours', rows: pilotHours, value: 'minutes', testIdPrefix: 'reports-rank-pilot-row-', label: labels.rankPilots.metrics.hours, barClass: 'flow-bar-in', format: (v) => formatMinutes(v) },
            { rank: 'pilot-spent', rows: pilotSpent, value: 'cents', testIdPrefix: 'reports-rank-pilot-row-', label: labels.rankPilots.metrics.spent, barClass: 'flow-bar-accent', format: (v) => formatCents(v, moneyLocale) },
          ]}
        />
      </div>
    </>
  );
}
