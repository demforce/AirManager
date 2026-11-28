# Story 18.3a History Implementation Plan

> **For agentic workers:** Execute these tasks in order in this session; the user has already selected one development agent and a separate final reviewer.

**Goal:** Back closes the current sheet or panel without changing URL, while navigation, refresh and layer handoffs keep their intended result.

**Architecture:** A shared browser history hook gives each open UI layer an instance token and one same-URL entry. UI dismissals consume that entry with Back; action dismissals mark it consumed and skip it on the next Back. Explicit navigation and handoff paths identify their intent before closing the source layer.

**Tech Stack:** Next.js App Router, React, TypeScript, Playwright.

**Spec:** `_bmad-output/implementation-artifacts/18-3-indietro-chiude-navigazione-risponde.md` AC 1–7 and §PO Q-18.3-a.

## Global Constraints

- Desktop panels and Export menu have the same Back behavior as mobile sheets.
- MiniModal and the membership fee modal are excluded.
- No ACL changes, production data, or real email. Test with a fresh synthetic database and local SMTP.
- Preserve focus trap and popup Escape precedence; do not touch 18.3b.

## Review Focus

- Rapid open/close or changing sheet owner must not create more than one active history layer: cover in browser tests.
- Closing after save must not discard `router.refresh`: assert new row before Back.
- A link or Apply must navigate once and one Back must return to source: assert URL and frame navigation count.
- A sheet to editor handoff must leave the editor open for one Back: assert both transitions.
- A quota modal opened from a sheet must remain open at the same URL and retain focus: synthetic fee test.

---

### Task 1: Shared layer history

**Files:** Create `src/components/ui/history-layer.ts`; modify `src/components/ui/slide-over.tsx`, `mobile-sheet.tsx`; test `e2e/history-layers.spec.ts`.

**Interfaces:** `useHistoryLayer(open, onClose): () => void` returns the dismiss handler; `prepareHistoryNavigation()` and `transferHistoryLayer()` declare action paths before the source is closed.

- [x] Write browser tests for Back, second Back, ✕, scrim, Escape, desktop Export and focus return; run to confirm the old implementation fails.
- [x] Add one same-URL entry per active layer and popstate handling; use instance tokens and check current `history.state` before programmatic Back.
- [x] Run focused browser tests and typecheck.

### Task 2: Action paths

**Files:** Modify the three filter consoles, sheet links in shell and dashboard, and Fleet/Pilots handoffs; extend `e2e/history-layers.spec.ts`.

- [x] Write tests for Apply, internal links, sheet-to-panel, save/refresh, and quota handoff; run failing tests.
- [x] Declare navigation before close and use replace navigation from the active history entry; transfer the entry for sheet-to-panel.
- [x] Run focused browser tests and unit gate.

### Task 3: Final validation and record

**Files:** Update `CLAUDE.md`, story record, and test evidence; keep umbrella 18.3 in progress.

- [x] Run isolated mutant discriminants against a copy; record hashes and failing assertions.
- [x] Run `npm run gates`, then full `scripts/e2e.sh` on a fresh synthetic DB and local SMTP; record exit codes, retries and METAR skips precisely.
- [x] Commit only story implementation and record with explicit pathspec. Leave review and done status to the independent review cycle.
