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
 *
 * Review 15.10 MAJOR-2 (PO decision 2026-08-06, option A) — the modal context
 * is the panel PLUS the portals it opens. The first version listened on the
 * panel, so a popover portaled to `document.body` (`fixed-popover.ts`: a
 * `transform`ed panel is the containing block of any `fixed` descendant, TD-7)
 * never routed its keydowns through it: measured at 375px on
 * `/dashboard/bookings`, from inside `.cal-popover` eight Tabs gave two stops
 * in the popover and then SIX outside — `Cambia tema`, `mobile-profile-button`,
 * `calendar-prev`, `schedule-date-pick`… — i.e. the page behind the scrim,
 * while the panel claimed `aria-modal="true"`.
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
 * The two surfaces the app portals OUT of the panel while keeping them part of
 * the same interaction: the calendar/date-time popover and the typeahead
 * listbox. Both are opened by a control INSIDE the modal, both only exist
 * while open, and both live at the end of `<body>` (`fixed-popover.ts`).
 *
 * The toast host is deliberately NOT here: it is a `role="status"` live region
 * with ZERO focusable descendants (measured), so it has nothing to contribute
 * to a tab cycle and trapping into it would be a defect, not a fix.
 */
const MODAL_PORTALS = '.cal-popover, .combo-listbox';

/** The panel plus the portals that are open right now (in DOM order). */
function modalRoots(panel: HTMLElement): HTMLElement[] {
  const portals = Array.from(document.querySelectorAll<HTMLElement>(MODAL_PORTALS)).filter(
    (portal) => !panel.contains(portal),
  );
  return [panel, ...portals];
}

let portalIdSeed = 0;

/** `aria-owns` needs an id; `.cal-popover` renders without one (`.combo-listbox` has its own). */
function portalId(portal: HTMLElement): string {
  if (!portal.id) {
    portalIdSeed += 1;
    portal.id = `modal-portal-${portalIdSeed}`;
  }
  return portal.id;
}

/**
 * Keeps Tab / Shift+Tab inside the modal context — the panel and any portal it
 * has open — while `open`.
 *
 * The listener sits on `document`, not on the panel: a portaled popover is not
 * a descendant of the panel, so its keydowns never bubble through it (review
 * MAJOR-2). It stays just as conservative as the panel-bound version was: it
 * acts only when the focus is already inside the context (or nowhere at all,
 * see below), and only on the wrap-around presses that would otherwise leave.
 * When another overlay owns the focus it returns without touching the event.
 *
 * Review LOW-1: if the focused node is destroyed the focus falls to `<body>`,
 * where the old panel-bound listener could no longer see the key at all. From
 * `document` the same press is caught and put back on the first stop of the
 * context (or on the panel itself when the context has no stop left, which is
 * the case the panel-bound version already handled).
 */
export function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    /**
     * Review LOW-2: what the trap includes, `aria-modal` must not exclude.
     * `aria-modal="true"` makes everything outside the dialog's subtree
     * unperceivable, and these portals are outside it BY DOM only — so while
     * one is open the panel `aria-owns` it, which is the one mechanism that
     * puts a node back inside a dialog's accessibility subtree without moving
     * it in the DOM (moving it is what TD-7 forbids). Synced on `focusin`
     * because that is exactly when a portal appears and disappears:
     * `fixed-popover.ts` moves the focus into the popover on open and back
     * onto the trigger on close.
     */
    const syncOwnedPortals = () => {
      const portals = modalRoots(panel).slice(1);
      if (portals.length === 0) {
        panel.removeAttribute('aria-owns');
        return;
      }
      panel.setAttribute('aria-owns', portals.map(portalId).join(' '));
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const roots = modalRoots(panel);
      const stops = roots.flatMap((root) => tabbableWithin(root));
      const active = document.activeElement;
      if (!active || active === document.body) {
        // The focused node was destroyed (LOW-1): pull the focus back in.
        event.preventDefault();
        (stops[0] ?? panel).focus({ preventScroll: true });
        return;
      }
      if (!roots.some((root) => root.contains(active))) return;
      if (stops.length === 0) {
        // Nothing to cycle through (a sheet still loading its content): hold
        // the focus on the panel itself rather than letting it fall behind.
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
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

    syncOwnedPortals();
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('focusin', syncOwnedPortals);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('focusin', syncOwnedPortals);
      panel.removeAttribute('aria-owns');
    };
  }, [open, panelRef]);
}
