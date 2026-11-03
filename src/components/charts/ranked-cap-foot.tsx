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
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { RankedCap } from '@/lib/mobile-reports';

export type RankedExpansion = {
  expanded: boolean;
  /** Pass as `onShowAll`: expands the list AND moves the focus off the button it is about to unmount. */
  showAll: () => void;
  /** Put on the `.ranked-rows` container, which must also carry `tabIndex={-1}`. */
  rowsRef: RefObject<HTMLDivElement | null>;
};

/**
 * Expansion state of one capped list, plus the single thing a "Mostra tutte"
 * that unmounts itself has to get right.
 *
 * The foot is rendered only while collapsed, so the click destroys the button
 * that received it and the focus falls back to `<body>` — measured, and it is
 * the third time this epic (15.2 F1, 15.8a MINOR-2, review 15.8b MINOR-1): the
 * next Tab of a keyboard reader restarts from the top of a document that the
 * expansion just made thousands of pixels taller.
 *
 * DECLARED destination: the rows container itself, focused with
 * `preventScroll` — the epic's own idiom for "the surface that just changed
 * takes the focus" (`mobile-sheet.tsx:104` focuses its `tabIndex={-1}` panel
 * the same way). It sits immediately before the removed button in the DOM, so
 * the next Tab continues where the reader was instead of at the top of the
 * page, and `preventScroll` keeps the viewport where the reader left it (the
 * container starts several screenfuls above the button).
 */
export function useRankedExpansion(): RankedExpansion {
  const [expanded, setExpanded] = useState(false);
  const rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    rowsRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  return { expanded, showAll: () => setExpanded(true), rowsRef };
}

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
