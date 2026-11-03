'use client';

import { useState } from 'react';
import { RANKED_MOBILE_LIMIT, rankedCap } from '@/lib/mobile-reports';
import { RankedCapFoot, useRankedExpansion, type RankedCapFootLabels } from './ranked-cap-foot';

/**
 * `RankBars` port (epic 12, story 12.10, AC 2) — 1:1 of
 * `docs/design-reference/airops/src/ReportsView.jsx#RankBars` (lines
 * 46-76): a `.card` with a `.segmented` metric toggle in the head and
 * ranked `.util-row`s below, sorted by the SELECTED metric, bar width
 * relative to that metric's own max. ZERO new CSS (`.util-*`/`.segmented`
 * already in `airops.css`, story 12.1).
 *
 * Deliberately DROPS the prototype's `period`/`mField`/`yField` dance: here
 * the period switch is a SERVER-SIDE `?period=` navigation (12.10's page),
 * so by the time this renders, `rows` already carry the values for the
 * CURRENTLY selected period — there is only ONE value per metric per row,
 * never a month/year pair to pick between client-side. The only client
 * state left is the metric toggle itself (Ore vs Ricavo/Spesa).
 */
export type RankBarsMetric = {
  key: string;
  label: string;
  /**
   * Graphic tone class of this metric's bars (`.flow-bar-*`, `airops.css`) —
   * was an inline `background` until story 15.8b: measured against its own
   * sunken track in the LIGHT theme, the raw `--ok` fill read 2.47:1 and the
   * raw `--accent` one 1.85:1, both under the 3:1 floor a graphic object has
   * to meet. A class (not a colour) is what lets the ONE decision on those
   * tokens live next to its text twin `.stat-tone-*` instead of being taken a
   * second time here (review 15.8a LOW-3).
   */
  barClass: string;
  format: (value: number) => string;
};

export type RankBarsRow = {
  label: string;
  values: Record<string, number>;
  /** Optional e2e hook (`e2e/reports.spec.ts`) — a row identified by a unique label (never by array position, which shifts as other rows enter/leave the ranking). */
  testId?: string;
};

export type RankBarsProps = {
  title: string;
  sub: string;
  rows: RankBarsRow[];
  metrics: RankBarsMetric[];
  labelCol?: number;
  monoLabel?: boolean;
  emptyLabel: string;
  /** Optional e2e hook on the root `.card` — the page renders two `RankBars` instances sharing the same DOM shape, so a plain class selector can't tell them apart. */
  testId?: string;
  /** Wording of the phone cap (story 15.8b) — see `RankedCapFoot`. */
  capLabels: RankedCapFootLabels;
  /** `data-testid` of the phone cap foot (mobile-only surface ⇒ `mobile-` prefix). */
  capTestId: string;
  /** Metric toggle: `.segmented` has SIX consumers app-wide, so the 44px phone floor is hung on this page-owned class instead (lesson 15.3 F1). */
  metricsClassName?: string;
};

const NAME_LABEL_STYLE = { fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export function RankBars({ title, sub, rows, metrics, labelCol = 110, monoLabel = false, emptyLabel, testId, capLabels, capTestId, metricsClassName }: RankBarsProps) {
  const [metricIndex, setMetricIndex] = useState(0);
  /**
   * Story 15.8b: the phone shows the first `RANKED_MOBILE_LIMIT` rows until
   * the reader asks for the rest. Expansion deliberately SURVIVES a metric
   * change (AD-3 asks for the decision to be taken, not inherited): the reader
   * asked to see the whole ranking, and re-hiding 137 aircraft because the
   * ranking was re-sorted would undo a request nobody withdrew — this
   * component keeps `metricIndex` across navigations for the same reason.
   *
   * Here the cap can stay POSITIONAL (review MAJOR-1 is about the two lists of
   * `reports-console.tsx`): these rows are sorted by the selected metric one
   * line below, so the first `RANKED_MOBILE_LIMIT` of them ARE the top ones.
   */
  const { expanded, showAll, rowsRef } = useRankedExpansion();
  const metric = metrics[metricIndex]!;
  const sorted = [...rows].sort((a, b) => (b.values[metric.key] ?? 0) - (a.values[metric.key] ?? 0));
  const max = Math.max(1, ...sorted.map((row) => row.values[metric.key] ?? 0));
  const cap = rankedCap(sorted.length);

  return (
    <div className="card" data-testid={testId}>
      <div className="card-head">
        <div className="card-title">{title}</div>
        <span className="card-sub">{sub}</span>
        <div className="spacer" />
        <div className={metricsClassName ? `segmented ${metricsClassName}` : 'segmented'}>
          {metrics.map((m, i) => (
            <button key={m.key} type="button" className={i === metricIndex ? 'on' : ''} onClick={() => setMetricIndex(i)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="card-body">
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{emptyLabel}</p>
        </div>
      ) : (
        <>
          <div className={`util-rows ranked-rows${expanded ? '' : ' ranked-rows-capped'}`} ref={rowsRef} tabIndex={-1}>
            {sorted.map((row, i) => {
              const value = row.values[metric.key] ?? 0;
              return (
                <div
                  className={i >= RANKED_MOBILE_LIMIT ? 'util-row ranked-row-overflow' : 'util-row'}
                  key={i}
                  data-testid={row.testId}
                  style={{ gridTemplateColumns: `${labelCol}px 1fr 96px` }}
                >
                  <div className={monoLabel ? 'util-tail' : undefined} style={monoLabel ? undefined : NAME_LABEL_STYLE}>
                    {row.label}
                  </div>
                  <div className="util-bar">
                    <div className={`seg ${metric.barClass}`} style={{ left: 0, width: `${(value / max) * 100}%` }} />
                  </div>
                  <div className="util-value">{metric.format(value)}</div>
                </div>
              );
            })}
          </div>
          {expanded ? null : <RankedCapFoot cap={cap} total={sorted.length} labels={capLabels} onShowAll={showAll} testId={capTestId} />}
        </>
      )}
    </div>
  );
}
