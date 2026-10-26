'use client';

/**
 * Row-detail bottom sheet (epic 15 ratifica R3, story 15.2) — the mobile
 * counterpart of a desktop table row: tap a row, its full detail rises from
 * the bottom as key/value lines with the decision buttons underneath.
 *
 * Ported 1:1 from the `AirOps Mobile` template's own detail sheet (lines
 * 515-539) and its row-builders (`openFlight`/`openBooking`/`openPPR`/…,
 * lines 584-601), which is where the `{ sub, title, badge, rows[], act? }`
 * shape comes from: every entity maps onto exactly that, so the API is the
 * template's, not an invented one.
 *
 * It COMPOSES `MobileSheet` rather than re-implementing it: scrim, Escape,
 * focus-on-open/focus-return, `role="dialog"` and the z-index (40, above the
 * page popovers, below `SlideOver` and the toasts) are identical and already
 * written there — and story 15.10's focus trap must land in ONE place for
 * every sheet in the app.
 *
 * Testid convention of the epic (fixed by 15.1, see `shell/mobile-nav.tsx`):
 * `testId` names a surface that exists only on mobile, so callers pass a
 * `mobile-`-prefixed name (`mobile-ppr-sheet`); the controls INSIDE it that
 * duplicate a desktop one take the desktop name plus `-mobile`.
 */
import type { ReactNode } from 'react';
import { MobileSheet } from './mobile-sheet';

export type BottomSheetRow = {
  /** Key: rendered mono/uppercase on the left. */
  k: string;
  /** Value: rendered on the right, baseline-aligned with the key. */
  v: ReactNode;
};

export type BottomSheetProps = {
  open: boolean;
  /** Must be referentially stable (`useCallback`) — `MobileSheet` gates its focus effect on it. */
  onClose: () => void;
  /** `data-testid` of the sheet root (mobile-only name, see the doc-comment). */
  testId: string;
  /** Mono uppercase line above the title (template: "Richiesta PPR-2026-0001"). Doubles as the dialog's accessible name together with `title`. */
  sub: string;
  title: string;
  /** Status pill on the right of the header — a `Badge`, in practice. */
  badge?: ReactNode;
  rows: BottomSheetRow[];
  /** Decision buttons under the rows. Absent when the row admits no decision (template: `act` is set only on a pending entity). */
  actions?: ReactNode;
  /**
   * Second step of an action STARTED in this sheet (ratifica R-15.2-a: the
   * reject reason). When set it replaces the rows, the action row and the
   * "Chiudi" button — same dialog node, different body, so the action
   * completes where it began instead of stacking an overlay on an overlay.
   */
  secondStep?: ReactNode;
  closeLabel: string;
};

export function BottomSheet({ open, onClose, testId, sub, title, badge, rows, actions, secondStep, closeLabel }: BottomSheetProps) {
  return (
    <MobileSheet open={open} onClose={onClose} label={`${sub} — ${title}`} testId={testId}>
      <div className="bottom-sheet-head">
        <div className="bottom-sheet-headings">
          <div className="bottom-sheet-sub">{sub}</div>
          <div className="bottom-sheet-title">{title}</div>
        </div>
        {badge}
      </div>

      {secondStep ?? (
        <>
          {rows.map((row) => (
            <div className="bottom-sheet-kv" key={row.k}>
              <span className="bottom-sheet-k">{row.k}</span>
              <span className="bottom-sheet-v">{row.v}</span>
            </div>
          ))}
          {actions ? <div className="bottom-sheet-actions">{actions}</div> : null}
          <button type="button" className="btn bottom-sheet-close" onClick={onClose}>
            {closeLabel}
          </button>
        </>
      )}
    </MobileSheet>
  );
}
