'use client';

/**
 * The app's bottom-sheet CHASSIS: scrim + panel rising from the bottom,
 * grabber, 20px top corners — visual language ported from the `AirOps
 * Mobile` template's own sheets. It owns only what every sheet shares
 * (scrim, Escape, focus in/out, z-index); the content is the caller's.
 *
 * Consumers (story 15.2 moved this file from `shell/` to `ui/`, where the
 * design-system primitives live, when the third one arrived):
 * - `shell/mobile-nav.tsx` — the "Altro" nav sheet (15.1);
 * - `shell/mobile-top-bar.tsx` — the profile menu (15.1);
 * - `ui/bottom-sheet.tsx` — the row-detail `BottomSheet` of R3 (15.2),
 *   which COMPOSES this one and adds the template's header/rows/actions
 *   layout on top. It is deliberately not a second implementation: when
 *   story 15.10 adds the focus trap and `aria-modal`, the fix lands here
 *   once, for every sheet.
 *
 * Interaction: closes on scrim click and on Escape. The Escape listener is
 * mounted only while open and is INDEPENDENT of `SlideOver`'s own global one
 * (`ui/slide-over.tsx`): the two can never be open together anyway (a
 * `SlideOver` scrim, z-index 50, covers the tab bar that opens this sheet,
 * and this sheet's own scrim covers the page underneath), and even if they
 * were, both listeners sit on `window` and would simply both close.
 *
 * A11y baseline (the full pass is story 15.10): the panel takes focus on
 * open and hands it back to the trigger on close, and is exposed as a
 * `dialog` with an accessible name. It deliberately does NOT claim
 * `aria-modal` — there is no focus trap yet, and claiming modality without
 * enforcing it is worse than not claiming it.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export type MobileSheetProps = {
  open: boolean;
  /** Must be referentially stable (`useCallback`) — it gates the focus effect below. */
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** `data-testid` of the sheet root; the scrim gets `<testId>-scrim` (mobile-only names, see `mobile-nav.tsx`'s testid convention). */
  testId: string;
  children: ReactNode;
};

export function MobileSheet({ open, onClose, label, testId, children }: MobileSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mobile-sheet" data-testid={testId}>
      <div className="mobile-sheet-scrim" onClick={onClose} data-testid={`${testId}-scrim`} />
      <div className="mobile-sheet-panel" role="dialog" aria-label={label} tabIndex={-1} ref={panelRef}>
        <div className="mobile-sheet-grabber" />
        {children}
      </div>
    </div>
  );
}
