'use client';

/**
 * The `.mini-modal` as a real dialog (review 19.10 F3) — the small centred
 * card over a scrim that the bookings list opens for a reject reason and for
 * an approval's requirements. Until then it was a bare `div`: no `role`, no
 * name, no focus on open for the reject one, Tab walked out of it into the
 * page behind the scrim, and Escape did nothing (measured at 1280 on
 * `/dashboard/bookings`, both cards).
 *
 * The same mechanics as `SlideOver`, the epic's other dialog: `role="dialog"`
 * + `aria-modal` with the shared trap (`focus-trap.ts` — the card plus any
 * portal it opens), Escape closes. Unlike `SlideOver` the card is mounted only
 * while open, so the focus moves in on mount: onto whatever a child already
 * focused (the requirements warning focuses itself), otherwise onto the first
 * control. It goes back to `returnFocusRef` on unmount — the button that
 * opened the card, set by its click: "the element focused before" would be
 * `<body>` for the approval card, whose «Approva» is disabled while it asks.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { tabbableWithin, useFocusTrap } from './focus-trap';

export type MiniModalProps = {
  /** The id of the card's own title. */
  labelledBy: string;
  /** Escape — the same as the card's own «Annulla». */
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  'data-testid'?: string;
};

export function MiniModal({ labelledBy, onClose, returnFocusRef, children, 'data-testid': testId }: MiniModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  useEffect(() => {
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) (tabbableWithin(card)[0] ?? card).focus();
    // The trigger that opened THIS card — its click set the ref before the card mounted.
    const opener = returnFocusRef.current;
    return () => opener?.focus();
  }, [returnFocusRef]);

  useFocusTrap(true, cardRef);

  return (
    <div className="mini-modal">
      <div ref={cardRef} className="mini-modal-card" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} data-testid={testId}>
        {children}
      </div>
    </div>
  );
}
