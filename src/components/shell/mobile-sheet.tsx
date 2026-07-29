'use client';

/**
 * Bottom sheet shared by the two <=640px shell menus (story 15.1): the
 * "Altro" nav sheet (`MobileNav`) and the profile menu (`MobileTopBar`).
 * Visual language ported from the `AirOps Mobile` template's own sheets
 * (scrim + panel rising from the bottom, grabber, 20px top corners).
 *
 * Scope note: this is deliberately the SHELL's sheet, not the epic's generic
 * row-detail `BottomSheet` primitive — that one, with its title/badge/rows
 * layout and its own consumers, is story 15.2 (R3). Two real consumers
 * TODAY justify factoring the scrim/Escape/focus handling out of them; a
 * third, richer consumer is 15.2's problem, not this story's.
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
