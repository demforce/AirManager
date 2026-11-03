'use client';

/**
 * `.slideover` port (story 12.1, AC 3) — 1:1 of
 * `docs/design-reference/airops/src/SlideOver.jsx#SlideOver`, typed. Closes
 * on Esc or scrim click.
 *
 * Story 15.10 (ratifica R-15.10-b) turned it into a real dialog. Ratifica R3
 * promoted this panel to the epic's central mobile idiom, and three defects
 * were measured on it at 375px, all of them pre-existing since 12.1:
 *
 *  - CLOSED, it kept ELEVEN focusable controls in the tab order under its own
 *    `aria-hidden="true"` — a tab walk of `/dashboard/bookings` stopped inside
 *    the hidden panel 18 times, ending on the "Prenota" submit. `pointer-events:
 *    none` was the only defence and it does not touch the keyboard. `inert`
 *    (below) closes it for both: no focus, no clicks, out of the a11y tree.
 *  - OPEN, it had no `role`, no accessible name and no focus management: after
 *    opening the booking panel `document.activeElement` was still the trigger,
 *    and the panel's first control was the 204th of 221 in DOM order.
 *  - OPEN, Tab walked straight out into the page behind the scrim.
 *
 * What must NOT change (both are load-bearing for the suite): the GLOBAL Esc
 * listener closes the WHOLE panel — never a popup inside it (CLAUDE.md) — and
 * the panel is rendered, not unmounted, when closed.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from './focus-trap';

// Story 12.1 review finding F3, fixed here (story 12.3, its first real
// consumer): the Esc listener is mounted unconditionally for the component's
// whole lifetime, regardless of `open` — without the early-return below, an
// Esc press with the panel CLOSED still calls `onClose`, which a caller
// wired to also reset other state (e.g. clearing a "which row is this
// slide-over editing" id) would run on every stray Esc anywhere on the page.

export type SlideOverProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
};

export function SlideOver({ title, subtitle, open, onClose, children, footer, closeLabel }: SlideOverProps) {
  const panelRef = useRef<HTMLElement>(null);
  const headingId = useId();

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // `preventScroll` for the same reason `MobileSheet` uses it: the panel is
    // `position: fixed`, so it is in view by construction and the browser's
    // scroll-into-view would only move the page BEHIND it.
    panelRef.current?.focus({ preventScroll: true });
    return () => previouslyFocused?.focus();
  }, [open]);

  useFocusTrap(open, panelRef);

  return (
    // `inert` while closed: the panel stays mounted (callers keep their form
    // state, and the suite reads content that mounts with the panel), but it
    // leaves the tab order and the accessibility tree entirely.
    <div className={`slideover ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="slideover-scrim" onClick={onClose} />
      <aside
        className="slideover-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="so-head">
          {/* One labelling node for the two lines: the accessible name is
              "<subtitle> <title>", the same "sub then title" formula
              `BottomSheet` already gives every sheet. */}
          <div id={headingId}>
            <div className="so-sub">{subtitle}</div>
            <div className="so-title">{title}</div>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
            ✕
          </button>
        </header>
        <div className="so-body">{children}</div>
        {footer && <footer className="so-foot">{footer}</footer>}
      </aside>
    </div>
  );
}
