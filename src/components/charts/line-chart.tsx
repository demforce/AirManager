/**
 * `LineChart` port (epic 12, story 12.10, AC 2) — 1:1 of
 * `docs/design-reference/airops/src/ReportsView.jsx#LineChart` (lines
 * 25-44): gridlines, filled area (opacity `.12`), stroked path, a dot per
 * point (the last one larger), Rome-month labels below. Pure/presentational
 * (no state).
 *
 * `Math.max(1, max - min)` guards the y-scale denominator (prototype's own
 * guard, kept) — a flat/all-zero series renders as a flat line at the
 * bottom instead of `NaN` positions.
 */
export type LineChartProps = {
  data: number[];
  labels: string[];
  height?: number;
  color?: string;
};

export function LineChart({ data, labels, height = 180, color = 'var(--accent)' }: LineChartProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 600;
  const h = height;
  const pad = 24;
  const nx = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const ny = (v: number) => pad + (1 - (v - min) / Math.max(1, max - min)) * (h - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${nx(i)} ${ny(v)}`).join(' ');
  const area = `${path} L ${nx(data.length - 1)} ${h - pad} L ${nx(0)} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img" aria-hidden="true">
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1={pad}
          x2={w - pad}
          y1={pad + (h - pad * 2) * p}
          y2={pad + (h - pad * 2) * p}
          stroke="var(--border)"
          strokeDasharray={i === 4 ? '' : '2 3'}
          strokeWidth="0.8"
        />
      ))}
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={nx(i)} cy={ny(v)} r={i === data.length - 1 ? 3.5 : 2} fill={color} />
      ))}
      {labels.map((l, i) => (
        <text key={i} x={nx(i)} y={h - 6} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
          {l}
        </text>
      ))}
    </svg>
  );
}
