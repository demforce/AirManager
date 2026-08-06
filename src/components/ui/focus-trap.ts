'use client';

/**
 * The epic's ONE focus trap (story 15.10, ratifica R-15.10-b).
 *
 * Two chassis claim the screen with a scrim — `MobileSheet` (every sheet of
 * the app: the "Altro" nav sheet, the profile menu, `BottomSheet`'s 17
 * consumers, `ExportMenu`'s 10) and `SlideOver` (17 usages in 15 files, the
 * full-screen form panel of R3). Both were measured LEAKING before this story:
 * on the flight sheet the fourth Tab landed on `mobile-tab-overview` — the tab
 * bar BEHIND the scrim — and `Shift+Tab` walked out backwards too.
 *
 * The trap lives here, not in either chassis, because writing it twice is how
 * the two copies drift; `aria-modal` is added by the two callers TOGETHER with
 * this hook, never without it (claiming modality without enforcing it is worse
 * than not claiming it — the reason `mobile-sheet.tsx` deliberately withheld
 * `aria-modal` until now).
 *
 * Why a manual cycle and not `inert` on the background: both chassis render
 * INSIDE the page they cover (`.main` contains them), so there is no single
 * background node to mark `inert` — marking `.main` would mark the panel too.
 * `inert` IS used, in `SlideOver`, for the opposite job: the CLOSED panel,
 * which is a real node with real controls and was tabbable through 18 stops.
 */
import { useEffect, type RefObject } from 'react';

/**
 * Tabbable descendants, in DOM order. `getClientRects()` (not `offsetParent`,
 * not `display`) is what tells a rendered control from one inside a
 * `display: none` branch — the same filter the epic's sweeps use, and the one
 * that keeps the closed half of a dual-tree surface out of the cycle.
 */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function tabbableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.getClientRects().length > 0 && element.closest('[inert]') === null,
  );
}

/**
 * Keeps Tab / Shift+Tab inside `panelRef` while `open`.
 *
 * The listener sits on the panel (keydown bubbles from every control inside
 * it), so it can only ever fire while the focus is already in the panel —
 * which is where both chassis put it on open. It never moves focus on its own:
 * it only redirects the wrap-around presses that would otherwise leave.
 */
export function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const stops = tabbableWithin(panel);
      if (stops.length === 0) {
        // Nothing to cycle through (a sheet still loading its content): hold
        // the focus on the panel itself rather than letting it fall behind.
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        // The panel itself is the first stop (tabIndex -1, focused on open):
        // going back from it wraps to the end, like going back from `first`.
        if (active === first || active === panel) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', handleKeydown);
    return () => panel.removeEventListener('keydown', handleKeydown);
  }, [open, panelRef]);
}
