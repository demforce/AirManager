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

/**
 * The sheet currently claiming the screen, if any — module-level on purpose.
 *
 * Review 15.3 F4 measured what happens without it: the Panoramica admin mounts
 * TWO sheet owners ("In corso ora" and "Prenotazioni in attesa"), each with its
 * own `openId`, and two Tab presses were enough to leave the first sheet open,
 * reach a row behind it and open the second — two `role="dialog"`, two scrims
 * stacked, and one testid matching twice (which AC 9 forbids). Until 15.2 the
 * question could not arise: every face had a single owner.
 *
 * "One bottom sheet at a time" is a property of the PATTERN, not of any one
 * caller, so it belongs to the chassis — the same reasoning this file already
 * applies to Escape and focus, and the reason 15.10's focus trap will land
 * here once for everybody. A caller-side fix (lifting `openId`, or renaming
 * testids) would have to be repeated by every future pair of owners, and 15.4
 * onwards adds more of them.
 *
 * Identity is a per-instance token, not the callback: `onClose` is required to
 * be stable, but comparing tokens means an instance can never close ITSELF by
 * re-registering.
 */
let openSheet: { token: object; close: () => void } | null = null;

export type MobileSheetProps = {
  open: boolean;
  /** Must be referentially stable (`useCallback`) — it gates the focus effect below. */
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /** `data-testid` of the sheet root; the scrim gets `<testId>-scrim` (mobile-only names, see `mobile-nav.tsx`'s testid convention). */
  testId: string;
  /**
   * Extra classes on the root / scrim / panel (story 15.8a, AC 8). The one
   * consumer is `ExportMenu`, which is a bottom sheet at <=640px and the
   * SAME popover it has always been above it: the epic's architecture allows
   * no JS width switch and no second tree (five page-level e2e assertions
   * read exactly one trigger and one link per voice, AD-4), so the container
   * has to be a single node that changes shape in CSS. Passing `.popover`/
   * `.popover-scrim` here reuses the existing desktop styling instead of
   * re-declaring it — no new colour literal, no duplicated shadow.
   */
  className?: string;
  scrimClassName?: string;
  panelClassName?: string;
  children: ReactNode;
};

function classes(...names: (string | undefined)[]): string {
  return names.filter((name) => name !== undefined && name !== '').join(' ');
}

export function MobileSheet({ open, onClose, label, testId, className, scrimClassName, panelClassName, children }: MobileSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<object>({});

  useEffect(() => {
    if (!open) return;
    // Claim the screen, evicting whoever held it (review 15.3 F4).
    const evicted = openSheet;
    openSheet = { token: tokenRef.current, close: onClose };
    if (evicted && evicted.token !== tokenRef.current) evicted.close();

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // `preventScroll` (story 15.8a): a sheet is `position: fixed` at the bottom
    // of the viewport, so it is in view by construction and the browser's
    // scroll-into-view has nothing to do — EXCEPT for the one consumer that is
    // not a sheet above 640px. `ExportMenu`'s popover is `position: absolute`
    // inside the page, and focusing it scrolled `.main` by up to 461px on the
    // scheda persona (measured on logbook/ppr/movements/person at 1280): a
    // desktop this story declares invariant does not jump when a menu opens.
    panelRef.current?.focus({ preventScroll: true });
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => {
      if (openSheet?.token === tokenRef.current) openSheet = null;
      window.removeEventListener('keydown', handleKeydown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={classes('mobile-sheet', className)} data-testid={testId}>
      <div className={classes('mobile-sheet-scrim', scrimClassName)} onClick={onClose} data-testid={`${testId}-scrim`} />
      <div className={classes('mobile-sheet-panel', panelClassName)} role="dialog" aria-label={label} tabIndex={-1} ref={panelRef}>
        <div className="mobile-sheet-grabber" />
        {children}
      </div>
    </div>
  );
}
