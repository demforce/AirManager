'use client';

/**
 * Story 14.2, AC 2: focuses the FIRST invalid field after a failed submit —
 * for a form built on react-hook-form this happens automatically
 * (`shouldFocusError`, its own default), but plain-`useState` forms (the
 * SlideOver sections that validate a `SearchCombobox`/checkbox-driven block
 * imperatively, never through RHF) have no such mechanism. Querying the
 * already-rendered `aria-invalid="true"` marker — rather than threading a
 * ref per field — works regardless of which control type failed (native
 * `.input`, `SearchCombobox`'s own input) and needs no per-field plumbing.
 *
 * Must run AFTER the render that sets those `aria-invalid` attributes has
 * committed (a plain synchronous call right after `setState` would still see
 * the PREVIOUS DOM) — callers wrap it in `setTimeout(..., 0)`, the same
 * deferral `CLAUDE.md`'s Playwright/verification conventions already expect
 * for post-render DOM queries.
 */
export function focusFirstInvalid(root: HTMLElement | Document | null): void {
  if (!root) return;
  root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
