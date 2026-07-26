'use client';

/**
 * Shared "fixed, viewport-anchored popover" mechanism — story TD-7,
 * AC 5(a): auditing every real usage of `CalendarPopover` found the SAME
 * clipping bug reviews 13.7-F1/13.11 already fixed once for
 * `bookings/schedule.tsx`'s own two popovers, now live in the NEW
 * `date-input.tsx`/`datetime-input.tsx` consumers too (`.card{overflow:hidden}`
 * — the public `/ppr` form, the pre-existing billing console filter — and
 * `.so-body{overflow:auto}` — every SlideOver form): a `position:absolute`
 * popover gets silently clipped, its lower controls present in the DOM but
 * not hit-testable (`elementFromPoint`), whenever the field renders low
 * enough in the scrollable/clipped container.
 *
 * This is the SAME algorithm as `schedule.tsx#useFixedPopover`/
 * `#clampPopoverLeft` (measure the trigger's viewport rect, position the
 * popover `fixed` from it, cap its height to whatever room is left below,
 * clamp its left edge inside the viewport) — extracted here rather than
 * imported FROM `schedule.tsx` because that file is pinned "do not modify"
 * for this story (Dev Notes: verified only via its own existing e2e
 * regression tests). `schedule.tsx` keeps its own copy of both functions,
 * byte-identical to before; this module exists so `date-input.tsx`/
 * `datetime-input.tsx` reuse the SAME mechanism instead of a THIRD
 * reinvention, per the story's own instruction.
 */
import { useEffect, useState, type RefObject } from 'react';

export type FixedPopoverAnchor = { top: number; maxHeight: number; triggerRect: DOMRect };

/**
 * Portal target/z-index for `date-input.tsx`/`datetime-input.tsx` (story
 * TD-7 finding, NOT needed by `schedule.tsx`'s own two popovers): CSS
 * `transform` on an ancestor makes IT the containing block for a
 * `position:fixed` descendant (`.slideover-panel{transform: translateX(...)}`,
 * always active while open, for the slide transition) — a fixed popover
 * left in-place inside a SlideOver therefore does NOT escape to true
 * viewport coordinates at all, and stays subject to `.so-body`'s
 * `overflow:auto` clip, defeating the whole fix. `schedule.tsx`'s `.card`
 * ancestor has no such `transform`, so it never hit this. The fix:
 * `createPortal` the popover/scrim to `document.body`, which has none
 * either — true viewport-fixed positioning, unconditionally. Once
 * portaled, the popover/scrim become SIBLINGS of `.slideover{z-index:50}`/
 * `.mini-modal{z-index:60}` instead of their descendants, so they need
 * their OWN z-index high enough to still paint on top — these two clear
 * both with room to spare (only the toast's 200, `airops.css`, ranks higher
 * app-wide).
 */
export const POPOVER_PORTAL_SCRIM_Z_INDEX = 65;
export const POPOVER_PORTAL_Z_INDEX = 66;

/** Clamps a `position:fixed` popover's LEFT edge to stay inside the viewport with an 8px gutter on both sides — see `schedule.tsx#clampPopoverLeft`'s doc comment for the full reasoning (in particular why the lower bound must win when the two bounds cross on a narrow viewport). */
export function clampPopoverLeft(desiredLeft: number, width: number): number {
  const gutter = 8;
  return Math.max(gutter, Math.min(desiredLeft, window.innerWidth - width - gutter));
}

/**
 * See `schedule.tsx#useFixedPopover`'s doc comment for the full design
 * rationale (identical here): `toggle(onOpen?)` measures the trigger's
 * viewport rect and caps `maxHeight` to the room left below it BEFORE
 * flipping `open`; the scroll/resize effect closes the popover so a
 * `position:fixed` element never visually detaches from a trigger that has
 * scrolled away, except for scroll events that target the popover's OWN
 * `overflow-y:auto` box (exempted via `popoverRef`).
 */
export function useFixedPopover(triggerRef: RefObject<HTMLElement | null>, popoverRef: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<FixedPopoverAnchor | null>(null);

  function toggle(onOpen?: () => void) {
    if (!open && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const top = triggerRect.bottom + 6;
      setAnchor({ top, maxHeight: window.innerHeight - top - 18, triggerRect });
      onOpen?.();
    }
    setOpen((wasOpen) => !wasOpen);
  }

  useEffect(() => {
    if (!open) return;
    function close(event: Event) {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, popoverRef]);

  return { open, setOpen, anchor, toggle };
}
