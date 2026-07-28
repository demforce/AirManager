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
 * clamp its left edge inside the viewport) — `schedule.tsx` now imports
 * `useFixedPopover`/`clampPopoverLeft`/`CAL_POPOVER_WIDTH` straight from
 * here (review F1's fix — a below-only anchor — would otherwise have
 * diverged silently between two copies; review finding TD7-F6, PO decision
 * 2026-07-26: dedup now).
 *
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
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { CAL_POPOVER_WIDTH } from './calendar-popover';

// Re-exported so `schedule.tsx` (story TD-7 review F6) can import all three
// previously-duplicated symbols from this one module — `CAL_POPOVER_WIDTH`
// itself stays DEFINED in `calendar-popover.tsx` (it's that component's own
// CSS width), just re-exported here for a single import path.
export { CAL_POPOVER_WIDTH };

/**
 * `top`/`bottom` are mutually exclusive (exactly one is `null`) — below-anchor
 * sets `top`, above-anchor (review F1) sets `bottom` instead, since a
 * `position:fixed` box anchored by `bottom` grows upward from the trigger
 * regardless of how tall it actually renders, which `top` cannot express.
 */
export type FixedPopoverAnchor = { top: number | null; bottom: number | null; maxHeight: number; triggerRect: DOMRect };

export const POPOVER_PORTAL_SCRIM_Z_INDEX = 65;
export const POPOVER_PORTAL_Z_INDEX = 66;

/** Clamps a `position:fixed` popover's LEFT edge to stay inside the viewport with an 8px gutter on both sides — see `schedule.tsx#clampPopoverLeft`'s (former) doc comment for the full reasoning (in particular why the lower bound must win when the two bounds cross on a narrow viewport). */
export function clampPopoverLeft(desiredLeft: number, width: number): number {
  const gutter = 8;
  return Math.max(gutter, Math.min(desiredLeft, window.innerWidth - width - gutter));
}

/** Turns a `FixedPopoverAnchor` into the `top`/`bottom` pair for the popover's inline `style` — whichever side wasn't chosen is pinned to `'auto'` so it overrides the `.cal-popover`/`.popover` CSS classes' own `top: calc(100% + 6px)` (and, for `.popover`, `right: 0`) rules, which would otherwise still apply for a `position:fixed` box that only sets one of the two. */
export function anchorPositionStyle(anchor: FixedPopoverAnchor): Pick<CSSProperties, 'top' | 'bottom'> {
  return anchor.top !== null ? { top: anchor.top, bottom: 'auto' } : { top: 'auto', bottom: anchor.bottom! };
}

/** Gap kept between the trigger and the popover, whichever side it ends up anchored on. */
const POPOVER_GAP = 6;
/** Safety margin from the viewport edge that `maxHeight` never eats into. */
const VIEWPORT_MARGIN = 18;
/**
 * Floor for `maxHeight` (story TD-7 review F1, blocker): the popover
 * scrolls internally (`overflow-y:auto`, already in place) below this
 * rather than being driven to zero/negative — a negative CSS `max-height`
 * is invalid and gets silently IGNORED (`max-height: none`), which is what
 * let the popover render fully off-screen with no usable fallback.
 */
const MIN_POPOVER_HEIGHT = 200;

/**
 * Per-caller overrides to the shared flip/clamp math (story 14.1 review
 * F2/F3): both default to CalendarPopover's exact prior constants/behavior,
 * so calling `computeFixedPopoverAnchor` with no third argument (every
 * `CalendarPopover`/`date-input`/`datetime-input` call site, via
 * `useFixedPopover#toggle`) is byte-for-byte unchanged — these two knobs
 * exist ONLY so `SearchCombobox` can ask for its own, different tradeoffs
 * without a second copy of the geometry.
 */
export type FixedPopoverAnchorOptions = {
  /**
   * Review F2 (major): the "stay below" branch used to clamp `top` UPWARD
   * whenever `maxHeight` (floored at `MIN_POPOVER_HEIGHT`) would otherwise
   * overrun the viewport bottom — fine for `CalendarPopover` (TD-7's
   * deliberate compromise: better a slightly clipped popover than one that
   * never fits), but for `SearchCombobox` it dragged the listbox UP so far
   * it covered the input itself (measured: `overlapsInput` true, input not
   * hit-testable at several short-viewport heights). The listbox already
   * scrolls internally (`overflow-y:auto`) below the fold, so there is
   * nothing to gain from pulling it up — `true` pins `top` to
   * `triggerRect.bottom + POPOVER_GAP` unconditionally, never above it.
   */
  neverOverlapTrigger?: boolean;
  /**
   * Review F3 (major): floor for `maxHeight` in the flip-ABOVE branch.
   * `MIN_POPOVER_HEIGHT` (200) is sized for `CalendarPopover`'s day grid;
   * forcing the same floor on `SearchCombobox`'s short option rows pushed
   * the popover's TOP edge past the viewport's own top edge whenever the
   * real `spaceAbove` was smaller than 200 (measured: first option
   * unreachable at any scroll position). Defaults to `MIN_POPOVER_HEIGHT`.
   */
  minAboveHeight?: number;
};

/**
 * Pure geometry decision, factored out of `useFixedPopover#toggle` (story
 * 14.1, AC 1) so `SearchCombobox` — whose own open/close lifecycle is driven
 * by focus/typing/blur, not a single toggle-on-click — can reuse the EXACT
 * same flip/clamp math against its own trigger rect, instead of a second
 * copy silently diverging (same dedup rationale as `CAL_POPOVER_WIDTH`/
 * `clampPopoverLeft` above, PO decision 2026-07-26). `neededHeight` is the
 * caller's own estimate of how tall the popover naturally renders — used
 * ONLY to decide whether flipping above the trigger is worth it, see the
 * three bullets below.
 *
 * - Not enough room below AND more room above → anchor the popover ABOVE
 *   the trigger instead (`bottom`, not `top` — see `anchorPositionStyle`).
 * - Otherwise (including "tight on both sides", where flipping wouldn't
 *   help either) → stay below, but clamp `top` down so the popover can
 *   never run past the bottom of the viewport (unless `neverOverlapTrigger`,
 *   review F2 above).
 * - `maxHeight` is NEVER allowed below `MIN_POPOVER_HEIGHT` on the "below"
 *   branch, nor below `minAboveHeight` on the "above" one: with little room
 *   the popover scrolls internally instead of vanishing or escaping the
 *   viewport (review F1's actual failure mode — 26-45px slivers with zero
 *   hit-testable controls).
 */
export function computeFixedPopoverAnchor(
  triggerRect: DOMRect,
  neededHeight: number,
  options: FixedPopoverAnchorOptions = {},
): FixedPopoverAnchor {
  const { neverOverlapTrigger = false, minAboveHeight = MIN_POPOVER_HEIGHT } = options;
  const spaceBelow = window.innerHeight - triggerRect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
  const spaceAbove = triggerRect.top - POPOVER_GAP - VIEWPORT_MARGIN;

  if (spaceBelow < neededHeight && spaceAbove > spaceBelow) {
    const maxHeight = Math.max(minAboveHeight, spaceAbove);
    return { top: null, bottom: window.innerHeight - triggerRect.top + POPOVER_GAP, maxHeight, triggerRect };
  }
  const maxHeight = Math.max(MIN_POPOVER_HEIGHT, spaceBelow);
  const naturalTop = triggerRect.bottom + POPOVER_GAP;
  const top = neverOverlapTrigger
    ? naturalTop
    : Math.min(naturalTop, Math.max(8, window.innerHeight - maxHeight - VIEWPORT_MARGIN));
  return { top, bottom: null, maxHeight, triggerRect };
}

/**
 * `toggle(neededHeight, onOpen?)` measures the trigger's viewport rect and
 * computes where the popover should sit (via `computeFixedPopoverAnchor`
 * above) BEFORE flipping `open`. `neededHeight` is the CALLER's own estimate
 * of how tall the popover naturally renders (`CalendarPopover`'s date-only
 * vs date+time mode render at different heights — see
 * `CAL_POPOVER_HEIGHT_DATE_ONLY`/`_DATE_TIME` next to the component); it
 * never shrinks `maxHeight` below what's genuinely available when there IS
 * enough room (so an existing consumer whose trigger never sits near the
 * bottom — `schedule.tsx`'s two popovers, `date-input`/`datetime-input` call
 * sites with plenty of room — renders byte-for-byte the same as before this
 * fix's predecessor, TD-7 review F1).
 *
 * `onOpen` runs only when the popover is about to OPEN (never on close),
 * for a caller's own pre-open side effect (e.g. snapping the month cursor
 * to the selected date).
 */
export function useFixedPopover(triggerRef: RefObject<HTMLElement | null>, popoverRef: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<FixedPopoverAnchor | null>(null);

  function toggle(neededHeight: number, onOpen?: () => void) {
    if (!open && triggerRef.current) {
      setAnchor(computeFixedPopoverAnchor(triggerRef.current.getBoundingClientRect(), neededHeight));
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

  // Story TD-7 review F4 (minor): the popover is portaled to `document.body`
  // (see the module doc comment) — a SIBLING of `SlideOver`'s panel rather
  // than a descendant — so an Esc press used to skip it entirely and close
  // the SlideOver instead (`SlideOver`'s own listener, a plain bubble-phase
  // `window` listener), leaving the popover orphaned and still interactive
  // above the now-closed form. Capture phase + `stopPropagation` means THIS
  // listener sees the key FIRST and stops the same dispatch from ever
  // reaching the SlideOver's bubble-phase listener on that same `window`
  // node — a second Esc is needed to close the SlideOver, the expected
  // nested-overlay behavior.
  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    }
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [open]);

  // Story TD-7 review F5 (minor): portaled to the end of `<body>`, the
  // popover no longer sits right after its trigger button in DOM/tab order —
  // Tab used to walk straight into it, now it skips past it. Move focus INTO
  // the popover on open (the time field in date+time mode, the most useful
  // place to land, or the popover's own root otherwise — see the `tabIndex`
  // on `.cal-popover`) and back onto the trigger's own BUTTON on close.
  // `triggerRef` isn't always the button itself: `schedule.tsx` attaches it
  // directly to a `<button>`, but `date-input.tsx`/`datetime-input.tsx`
  // attach it to the `.date-input` WRAPPER `<span>` (its rect is what
  // centers the popover, matching the pre-TD-7 CSS centering) — the actual
  // `.date-input-btn` is one of its children. `querySelector` finds it when
  // present; falling back to the trigger element itself covers `schedule.tsx`.
  // `{ preventScroll: true }` on BOTH calls (found empirically, not in the
  // review's own recommendation): a plain `.focus()` on the time field makes
  // the BROWSER auto-scroll it into view inside the popover's own
  // `overflow-y:auto` box whenever `maxHeight` (F1's fix) makes that box
  // shorter than its content — which scrolls the day grid ABOVE it clean out
  // of view the instant the popover opens, undoing F1's "every control
  // reachable" guarantee for whichever control focus lands on. `preventScroll`
  // still moves keyboard focus (F5's actual goal) without moving the
  // scrollbox — the popover opens at `scrollTop: 0`, day grid visible first.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      const target = popoverRef.current?.querySelector<HTMLElement>('input[type="text"]') ?? popoverRef.current;
      target?.focus({ preventScroll: true });
    } else if (wasOpenRef.current && triggerRef.current) {
      const trigger = triggerRef.current;
      (trigger.querySelector<HTMLElement>('.date-input-btn') ?? trigger).focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open, popoverRef, triggerRef]);

  return { open, setOpen, anchor, toggle };
}
