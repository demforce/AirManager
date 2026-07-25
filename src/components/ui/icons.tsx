/**
 * AirOps icon set (story 12.1, AC 3) — 1:1 port of
 * `docs/design-reference/airops/src/icons.jsx`: same paths/viewBoxes, typed
 * as a `Icon.*` namespace of React components instead of a plain object
 * assigned to `window`. Minimal, consistent stroke icons, 16px grid, stroke
 * 1.6 (except `logo`/`acsmall`, ported verbatim with their own stroke rules).
 */
import type { SVGProps } from 'react';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

type IconComponent = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

export const Icon = {
  plane: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M2 13l8-1 4-9 1.5 .5-2 8.5 6 -.5 2 -3 1.5 .5-2 5 2 5-1.5 .5-6-3-8 4-1-1 3-4-5-1 -1-1z" />
    </svg>
  ),
  dashboard: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
    </svg>
  ),
  calendar: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  users: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c1.2-3.6 4-5 6-5s4.8 1.4 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 14c3-.3 5 1.3 6 4" />
    </svg>
  ),
  book: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M4 4h11a4 4 0 014 4v12H8a4 4 0 01-4-4V4z" />
      <path d="M4 16a4 4 0 014-4h11" />
    </svg>
  ),
  cash: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 9v6M18 9v6" />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M9 12l2 2 5-5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  alert: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v5M12 18.2v.1" />
    </svg>
  ),
  wrench: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M14.7 6.3a4 4 0 015.1 5.1l-2.4-2.4-2.7.7-.7 2.7 2.4 2.4a4 4 0 01-5.1-5.1L4.2 4.2 6 2.5l7 7z" />
    </svg>
  ),
  doc: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </svg>
  ),
  bell: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M6 17h12l-2-3V9a4 4 0 10-8 0v5z" />
      <path d="M10 20a2 2 0 004 0" />
    </svg>
  ),
  plus: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  arrow: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  chevL: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  ),
  chevR: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  chart: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M4 20V4M4 20h16M8 16V10M12 16V6M16 16v-8" />
    </svg>
  ),
  sun: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
    </svg>
  ),
  moon: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M20 15A8 8 0 019 4a8 8 0 1011 11z" />
    </svg>
  ),
  cloud: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M7 18a4 4 0 010-8 6 6 0 0111.7 1.3A4.5 4.5 0 0117 18H7z" />
    </svg>
  ),
  filter: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" />
    </svg>
  ),
  briefing: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
      <path d="M3 12h18" />
    </svg>
  ),
  compass: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-2 6-4 2 2-6 4-2z" />
    </svg>
  ),
  clock: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  gear: (p) => (
    <svg viewBox="0 0 24 24" {...STROKE} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  ),
  logo: (p) => (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M4 14 L12 4 L20 14 L12 11 Z" fill="currentColor" />
      <path d="M7 17 L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  acsmall: (p) => (
    <svg viewBox="0 0 80 24" {...STROKE} {...p}>
      <path d="M2 12h30l8-6 4 3 22 1-22 1-4 3-8-2H2z" />
      <path d="M40 9l8-4 4 2M40 15l8 4 4-2" />
    </svg>
  ),
} satisfies Record<string, IconComponent>;
