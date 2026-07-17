'use client';

import { BarChart } from '@/components/charts/bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { RankBars, type RankBarsRow } from '@/components/charts/rank-bars';
import { formatCents } from '@/lib/money';
import type { StatsResponseDto } from '@/lib/schemas/stats';
import { formatMinutes } from '@/lib/time';

type MixKey = 'SCHOOL' | 'TOURISM' | 'AERIAL_WORK' | 'TRANSIT';

/**
 * Movement-mix colors (AC 3) — the prototype's own 4 legend tokens
 * (`--info`/`--accent`/`--ok`/`--ink-3`), reassigned to D13's real taxonomy
 * (the prototype's own keys, "Dep/arr basati"/"Noleggi"/etc., don't exist in
 * this domain — ratifica utente 1).
 */
const MIX_COLORS: Record<MixKey, string> = {
  SCHOOL: 'var(--ok)',
  TOURISM: 'var(--accent)',
  AERIAL_WORK: 'var(--ink-3)',
  TRANSIT: 'var(--info)',
};

export type ReportsLabels = {
  charts: {
    revenue: { title: string; sub: string };
    hours: { title: string; sub: string };
    transits: { title: string; sub: string };
    fleet: { title: string; sub: string; empty: string };
  };
  movementMix: { title: string; sub: string; keys: Record<MixKey, string> };
  instructors: { title: string; sub: string; empty: string; owedUnknown: string };
  rankAircraft: { title: string; sub: string; metrics: { hours: string; revenue: string }; empty: string };
  rankPilots: { title: string; sub: string; metrics: { hours: string; spent: string }; empty: string };
};

export type ReportsConsoleProps = {
  stats: StatsResponseDto;
  seriesLabels: string[];
  moneyLocale: 'it' | 'en';
  labels: ReportsLabels;
};

/**
 * Reports body (epic 12, story 12.10, AC 3) — the 4 `.split` rows below the
 * page's own page-head/kpi-row. Client boundary (pattern 12.5-12.9) mainly
 * for `RankBars`' own metric-toggle state; `BarChart`/`LineChart` are pure
 * presentational and simply render inside this tree.
 */
export function ReportsConsole({ stats, seriesLabels, moneyLocale, labels }: ReportsConsoleProps) {
  const revenueData = stats.series.revenueCents.map((cents) => cents / 100);
  const hoursData = stats.series.flightMinutes.map((minutes) => minutes / 60);
  const transitsData = stats.series.transitMovements;

  const fleetMax = Math.max(1, ...stats.fleet.map((aircraft) => aircraft.minutes));
  const instructorsMax = Math.max(1, ...stats.instructors.map((instructor) => instructor.minutes));
  const mixTotal = stats.movementMix.reduce((sum, mix) => sum + mix.count, 0);

  const rankAircraftRows: RankBarsRow[] = stats.fleet.map((aircraft) => ({
    label: aircraft.registration,
    values: { hours: aircraft.minutes, revenue: aircraft.revenueCents },
    testId: `reports-rank-aircraft-row-${aircraft.registration}`,
  }));
  const rankPilotRows: RankBarsRow[] = stats.topPilots.map((pilot) => ({
    label: pilot.name,
    values: { hours: pilot.minutes, spent: pilot.spentCents },
    testId: `reports-rank-pilot-row-${pilot.name}`,
  }));

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

      <div className="split">
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.charts.transits.title}</div>
            <span className="card-sub">{labels.charts.transits.sub}</span>
          </div>
          <div className="card-body">
            <BarChart data={transitsData} labels={seriesLabels} color="oklch(0.6 0.14 260)" />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.charts.fleet.title}</div>
            <span className="card-sub">{labels.charts.fleet.sub}</span>
          </div>
          {stats.fleet.length === 0 ? (
            <div className="card-body">
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels.charts.fleet.empty}</p>
            </div>
          ) : (
            <div className="util-rows">
              {stats.fleet.map((aircraft) => (
                <div className="util-row" key={aircraft.registration} data-testid={`reports-fleet-row-${aircraft.registration}`} style={{ gridTemplateColumns: '90px 1fr 80px' }}>
                  <div className="util-tail mono">{aircraft.registration}</div>
                  <div className="util-bar">
                    <div className="seg flown" style={{ left: 0, width: `${(aircraft.minutes / fleetMax) * 100}%` }} />
                  </div>
                  <div className="util-value mono">{formatMinutes(aircraft.minutes)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
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
                  style={{ width: `${mixTotal > 0 ? (mix.count / mixTotal) * 100 : 0}%`, background: MIX_COLORS[mix.key] }}
                  title={`${labels.movementMix.keys[mix.key]} ${mix.count}`}
                />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
              {stats.movementMix.map((mix) => (
                <div key={mix.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: MIX_COLORS[mix.key], display: 'inline-block' }} />
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
          {stats.instructors.length === 0 ? (
            <div className="card-body">
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels.instructors.empty}</p>
            </div>
          ) : (
            <div className="util-rows">
              {stats.instructors.map((instructor, i) => (
                <div className="util-row" key={i} data-testid={`reports-instructor-row-${instructor.name}`} style={{ gridTemplateColumns: '160px 1fr 100px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{instructor.name}</div>
                  <div className="util-bar">
                    <div className="seg flown" style={{ left: 0, width: `${(instructor.minutes / instructorsMax) * 100}%` }} />
                  </div>
                  <div className="util-value mono">
                    {formatMinutes(instructor.minutes)} · {instructor.owedCents === null ? labels.instructors.owedUnknown : formatCents(instructor.owedCents, moneyLocale)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="split">
        <RankBars
          title={labels.rankAircraft.title}
          sub={labels.rankAircraft.sub}
          rows={rankAircraftRows}
          monoLabel
          labelCol={80}
          testId="reports-rank-aircraft"
          emptyLabel={labels.rankAircraft.empty}
          metrics={[
            { key: 'hours', label: labels.rankAircraft.metrics.hours, color: 'var(--ok)', format: (v) => formatMinutes(v) },
            { key: 'revenue', label: labels.rankAircraft.metrics.revenue, color: 'var(--accent)', format: (v) => formatCents(v, moneyLocale) },
          ]}
        />
        <RankBars
          title={labels.rankPilots.title}
          sub={labels.rankPilots.sub}
          rows={rankPilotRows}
          labelCol={140}
          testId="reports-rank-pilots"
          emptyLabel={labels.rankPilots.empty}
          metrics={[
            { key: 'hours', label: labels.rankPilots.metrics.hours, color: 'var(--ok)', format: (v) => formatMinutes(v) },
            { key: 'spent', label: labels.rankPilots.metrics.spent, color: 'var(--accent)', format: (v) => formatCents(v, moneyLocale) },
          ]}
        />
      </div>
    </>
  );
}
