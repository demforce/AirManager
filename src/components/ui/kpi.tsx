/**
 * `.kpi`/`.kpi-spark` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/primitives.jsx#KPI`/`Spark`, typed.
 */
import type { ReactNode } from 'react';

export type SparkProps = {
  data?: number[];
  w?: number;
  h?: number;
  color?: string;
};

const DEFAULT_SPARK_DATA = [3, 5, 4, 7, 6, 8, 10, 9, 11, 13];

export function Spark({ data = DEFAULT_SPARK_DATA, w = 64, h = 20, color = 'currentColor' }: SparkProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const nx = (i: number) => (i / (data.length - 1)) * w;
  const ny = (v: number) => h - ((v - min) / Math.max(1, max - min)) * h;
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={color} strokeWidth="1.3">
      <path d={d} />
    </svg>
  );
}

export type KpiTrend = 'up' | 'down' | '';

export type KpiProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  trend?: KpiTrend;
  sparkData?: number[];
};

export function KPI({ label, value, unit, delta, trend = '', sparkData }: KpiProps) {
  const sparkColor = trend === 'up' ? 'var(--ok)' : trend === 'down' ? 'var(--bad)' : 'var(--ink-4)';
  return (
    <div className="kpi">
      {sparkData && (
        <div className="kpi-spark">
          <Spark data={sparkData} color={sparkColor} />
        </div>
      )}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {delta && (
        <div className="kpi-delta">
          <span className={trend === 'up' ? 'up' : trend === 'down' ? 'down' : ''}>{delta}</span>
        </div>
      )}
    </div>
  );
}
