'use client';

/**
 * The declared cap of a ranked list on a phone (story 15.8b, R-15.8b-b —
 * pattern 13.4's "prime N · Mostra tutte", the same affordance
 * `aircraft-editor.tsx`'s rate history has used since 13.4).
 *
 * It is shared by the three ranked lists of `/dashboard/reports`
 * (`reports-console.tsx`'s "Utilizzo flotta" and "Ore istruttori", plus both
 * `RankBars` instances) so the cap is worded and shaped ONCE — a list that
 * declared its truncation differently from the list under it would read as a
 * bug, and a list that did not declare it at all would be the lie R4 forbids.
 *
 * The cap itself is CSS, not JS: every row is rendered at every width and the
 * rows past the limit are hidden by `.ranked-rows-capped .ranked-row-overflow`
 * inside `@media (max-width: 640px)`. That is what keeps the epic's "no
 * `matchMedia`, no width switch in JS" architecture AND leaves the desktop
 * untouched — `reports.spec.ts` reads `reports-fleet-row-*` and
 * `reports-rank-*-row-*` page-level at 1280px, where every row must still be
 * there, and each testid must still match exactly one node at BOTH widths.
 */
import type { RankedCap } from '@/lib/mobile-reports';

export type RankedCapFootLabels = {
  /** `"Prime {shown} di {total}"` — client-interpolated, pass it with `t.raw`. */
  note: string;
  /** `"Mostra tutte ({count})"` — `{count}` is the HIDDEN count, same wording as story 13.4's own. */
  showAll: string;
};

export type RankedCapFootProps = {
  cap: RankedCap;
  total: number;
  labels: RankedCapFootLabels;
  onShowAll: () => void;
  /** Mobile-only surface, so a `mobile-`-prefixed name (testid convention of the epic, story 15.1). */
  testId: string;
};

export function RankedCapFoot({ cap, total, labels, onShowAll, testId }: RankedCapFootProps) {
  if (!cap.capped) return null;

  return (
    <div className="mobile-card-foot ranked-cap-foot" data-testid={testId}>
      <span className="mobile-card-count">{labels.note.replace('{shown}', String(cap.visibleCount)).replace('{total}', String(total))}</span>
      <button type="button" className="btn" onClick={onShowAll} data-testid={`${testId}-button`}>
        {labels.showAll.replace('{count}', String(cap.hiddenCount))}
      </button>
    </div>
  );
}
