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
 *
 * Story 13.8 (review F2, extending AC 3's `bar-chart.tsx` fix to its sibling
 * on the same reports row): the X-axis labels used to be `<text>` nodes
 * inside the SVG's own scaled `viewBox` — same distortion as the bar chart
 * had. Labels now render as a plain HTML row below the SVG, `aria-hidden`
 * (F7 — the chart stays decorative, same as the SVG's own `aria-hidden`) so
 * real font-size is never affected by the chart's non-uniform scale. Points
 * sit at `i/(n-1)` (not `1fr` columns like the bar chart), so the row uses
 * `justify-content: space-between` over the same `pad`-derived inset —
 * labels are monospace/equal-width, so this lines up with each dot to
 * within half a glyph's width at the row's two end points — a constant
 * ~7.4px offset (glyph width / 2), independent of viewport, measured at
 * 1201/1440/1920/375px (see story 13.8 Review Record for the numbers).
 *
 * Story 13.10 (F8-13.8 follow-up, mobile pass): same `chart-label` class /
 * `airops.css` narrow-viewport thinning as `bar-chart.tsx` — see that
 * file's doc-comment.
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

  const padPercent = (pad / w) * 100;

  return (
    <div>
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
      </svg>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${padPercent}%` }}>
        {labels.map((label, i) => (
          <span key={i} className="chart-label" style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
