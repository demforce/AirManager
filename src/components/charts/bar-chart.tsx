/**
 * `BarChart` port (epic 12, story 12.10, AC 2) — 1:1 of
 * `docs/design-reference/airops/src/ReportsView.jsx#BarChart` (lines 1-24):
 * SVG viewBox 600, gridlines, bars `rx=2`, last bar full opacity (`1`) vs
 * `0.85` for the rest. Pure/presentational (no state) — typed props, ZERO
 * new CSS (the gridline/bar styling is all inline `var(--*)` tokens the
 * prototype already used, same as the port).
 *
 * `max` is guarded to at least `1` (the prototype's mock data is never
 * all-zero; real data for an empty/new period can be) so an all-zero
 * `data` array renders flat zero-height bars instead of `NaN` heights.
 */
export type BarChartProps = {
  data: number[];
  labels: string[];
  height?: number;
  color?: string;
};

export function BarChart({ data, labels, height = 180, color = 'var(--ink)' }: BarChartProps) {
  const max = Math.max(1, ...data);
  const w = 600;
  const h = height;
  const pad = 24;
  const bw = (w - pad * 2) / data.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img" aria-hidden="true">
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <line
          key={i}
          x1={pad}
          x2={w - pad}
          y1={pad + (h - pad * 1.5) * p}
          y2={pad + (h - pad * 1.5) * p}
          stroke="var(--border)"
          strokeDasharray={i === 4 ? '' : '2 3'}
          strokeWidth="0.8"
        />
      ))}
      {data.map((v, i) => {
        const barH = (v / max) * (h - pad * 2);
        const x = pad + i * bw + 4;
        const y = h - pad * 0.5 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw - 8} height={barH} rx="2" fill={color} opacity={i === data.length - 1 ? 1 : 0.85} />
            <text x={x + (bw - 8) / 2} y={h - 6} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
