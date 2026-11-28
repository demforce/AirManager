'use client';

import { useState } from 'react';
import type { StatsQuery, StatsRankingKey, StatsResponseDto } from '@/lib/schemas/stats';
import { RankedCapFoot } from './ranked-cap-foot';

export type RankBarsMetric = {
  rank: StatsRankingKey;
  rows: StatsResponseDto['rankings']['fleetHours'];
  value: 'minutes' | 'cents';
  testIdPrefix: string;
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

export type RankBarsProps = {
  title: string;
  sub: string;
  period: StatsQuery['period'];
  reference: string;
  metrics: RankBarsMetric[];
  labelCol?: number;
  monoLabel?: boolean;
  emptyLabel: string;
  /** Optional e2e hook on the root `.card` — the page renders two `RankBars` instances sharing the same DOM shape, so a plain class selector can't tell them apart. */
  testId?: string;
  /** `data-testid` of the ranking footer. */
  capTestId: string;
  /** Metric toggle: `.segmented` has SIX consumers app-wide, so the 44px phone floor is hung on this page-owned class instead (lesson 15.3 F1). */
  metricsClassName?: string;
};

const NAME_LABEL_STYLE = { fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

export function RankBars({ title, sub, period, reference, metrics, labelCol = 110, monoLabel = false, emptyLabel, testId, capTestId, metricsClassName }: RankBarsProps) {
  const [metricIndex, setMetricIndex] = useState(0);
  const metric = metrics[metricIndex]!;
  const { items, total } = metric.rows;
  const max = Math.max(1, ...items.map((row) => row[metric.value] ?? 0));

  return (
    <div className="card" data-testid={testId}>
      <div className="card-head">
        <div className="card-title">{title}</div>
        <span className="card-sub">{sub}</span>
        <div className="spacer" />
        <div className={metricsClassName ? `segmented ${metricsClassName}` : 'segmented'}>
          {metrics.map((m, i) => (
            <button key={m.rank} type="button" aria-pressed={i === metricIndex} className={i === metricIndex ? 'on' : ''} onClick={() => setMetricIndex(i)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="card-body">
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{emptyLabel}</p>
        </div>
      ) : (
        <>
          <div className="util-rows ranked-rows">
            {items.map((row) => {
              const value = row[metric.value] ?? 0;
              return (
                <div
                  className="util-row"
                  key={row.key}
                  data-testid={`${metric.testIdPrefix}${row.label}`}
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
          <RankedCapFoot shown={items.length} total={total} rank={metric.rank} period={period} reference={reference} testId={capTestId} />
        </>
      )}
    </div>
  );
}
