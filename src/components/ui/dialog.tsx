'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { cn } from './cn';

// No tailwind-merge (12.1 Dev Notes: no new dependency) — same guard as
// Card/Skeleton: skip the default padding utility entirely when the caller
// already brings one, rather than risk two conflicting `p-*` classes.
const HAS_PADDING_RE = /(^|\s)(p|px|py|pt|pr|pb|pl)-/;

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Rendered as the dialog's own heading when given. Omit it when the
   * children already own a heading (e.g. the flight form's existing `<h3>`)
   * and pass that heading's `id` as `labelledBy` instead — the dialog never
   * renders a second, redundant title.
   */
  title?: string;
  /** `aria-labelledby` target — defaults to the auto-generated id of the `title` heading above. Required when `title` is omitted. */
  labelledBy?: string;
  children: ReactNode;
  /** Card-body overrides (padding/background) — same guard as `Card`. */
  className?: string;
};

/**
 * Shared native-`<dialog>` plumbing (story 12.1/12.3 AC 1) behind both
 * `Dialog` and `Sheet`: `open` is a controlled prop — the actual
 * `showModal()`/`close()` calls happen imperatively in an effect, since the
 * `<dialog>` element has no declarative equivalent that triggers the
 * top-layer/`::backdrop`. The native `close` event (fired for Esc/`cancel`
 * AND a programmatic `.close()` alike) is the SINGLE path back to the
 * caller's `onClose` — an Esc press and a caller-driven close both funnel
 * through it, so there is only one place that ever "finishes" a close.
 * `showModal()`/`close()` are guarded against the element's OWN current
 * `.open` state to avoid the native `InvalidStateError` (calling
 * `showModal()` while already open) and, symmetrically, a redundant second
 * `close` event when the caller's `onClose` itself flips `open` to `false`
 * in response to a native close that already happened (e.g. Esc).
 *
 * Focus trap, focus-return-to-trigger and `::backdrop` are all native
 * `showModal()` behavior — nothing here reimplements them.
 */
const FOCUSABLE_SELECTOR = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useNativeDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Story 12.3 (AC 3/7): `showModal()`'s own auto-focus algorithm picks
      // the scrollable card wrapper below over the first real field — a
      // known Chromium quirk (an `overflow-y-auto` region with no explicit
      // `tabindex` is still a "focusable area" for keyboard scrolling, and
      // as the wrapper it precedes every field in tree order). Verified live
      // via Playwright MCP: without this, `document.activeElement` after
      // opening the register dialog was the wrapper `<div>`, not "Velivolo".
      // Overriding with the first REAL focusable descendant restores the
      // "focus the first field" behavior the AC calls for.
      dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /**
   * Click-outside-to-close: the native `::backdrop` is not a real DOM node,
   * so a click landing there is dispatched with the `<dialog>` element
   * itself as `event.target` — true ONLY when nothing inside the dialog's
   * own box (which carries zero padding of its own, see the card wrapper
   * below) was clicked. Routed through `.close()`, same single path as
   * every other close above.
   */
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return { ref, handleBackdropClick };
}

/**
 * Centered modal (story 12.1 AC 1, 12.3 AC 1/7 — DESIGN.md "Card": paper
 * surface, 24px radius, hairline border). The outer `<dialog>` carries NO
 * padding/border/background of its own (necessary for the backdrop-click
 * detection above to work) — every visual "card" style lives on the inner
 * wrapper, sized to fill the dialog's box exactly, with its own
 * `overflow-y-auto` for content taller than the viewport allows.
 */
export function Dialog({ open, onClose, title, labelledBy, children, className }: DialogProps) {
  const { ref, handleBackdropClick } = useNativeDialog(open);
  const generatedTitleId = useId();
  const resolvedLabelledBy = labelledBy ?? (title ? generatedTitleId : undefined);
  const hasCustomPadding = className ? HAS_PADDING_RE.test(className) : false;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby={resolvedLabelledBy}
      className="m-auto w-[calc(100%-2rem)] max-w-lg border-0 bg-transparent p-0 outline-none backdrop:bg-ink/40"
    >
      <div
        className={cn(
          'max-h-[85vh] overflow-y-auto rounded-cards border border-hairline bg-paper shadow-subtle',
          !hasCustomPadding && 'p-6',
          className,
        )}
      >
        {title ? (
          <h2 id={generatedTitleId} className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </dialog>
  );
}

export type SheetProps = Omit<DialogProps, 'className'> & {
  /** Card-body overrides — same guard as `Dialog`. */
  className?: string;
};

/**
 * Right-hand side panel (story 12.3, AC 1/5): the SAME native-`<dialog>`
 * primitive as `Dialog`, positioned full-height along the right edge
 * instead of centered (DESIGN.md: radius only on the left side) — every
 * behavior (focus trap/return, Esc, backdrop click, internal scroll) is
 * identical, only the outer positioning and inner card shape differ.
 */
export function Sheet({ open, onClose, title, labelledBy, children, className }: SheetProps) {
  const { ref, handleBackdropClick } = useNativeDialog(open);
  const generatedTitleId = useId();
  const resolvedLabelledBy = labelledBy ?? (title ? generatedTitleId : undefined);
  const hasCustomPadding = className ? HAS_PADDING_RE.test(className) : false;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby={resolvedLabelledBy}
      className="inset-y-0 right-0 left-auto m-0 h-dvh w-full max-w-md border-0 bg-transparent p-0 outline-none backdrop:bg-ink/40"
    >
      <div
        className={cn(
          'h-full overflow-y-auto rounded-l-cards border-l border-hairline bg-paper shadow-subtle',
          !hasCustomPadding && 'p-6',
          className,
        )}
      >
        {title ? (
          <h2 id={generatedTitleId} className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </dialog>
  );
}
