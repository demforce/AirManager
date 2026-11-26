# Story 18.2b Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact empty mobile lists and provide the correct action for each role, with a clear way out of filtered results.

**Architecture:** Reuse each page's existing list and authorization state. Add mobile-only presentation classes and short localized labels; retain desktop markup and the server's existing permission checks.

**Tech Stack:** Next.js 16, React, next-intl, AirOps CSS, Vitest, Playwright.

**Spec:** `_bmad-output/implementation-artifacts/18-2-fold-liste.md` AC 6 and §PO Q-18.2-d.

## Global Constraints

- No ACL changes, real data, production services or real email.
- Keep 18.2a desktop geometry and mobile fold improvements.
- Use the existing booking eligibility from `bookings/page.tsx`; an allievo without a pilot profile cannot create a booking.
- New UI text must be paired in `messages/it.json` and `messages/en.json`.

## Review Focus

- Deactivated pilot profile: no booking action despite `bookings.manage.own`.
- Student-only: Logbook navigation explains who books; Schedule has no same-page link.
- Active student plus pilot profile, where legacy data allows it: booking action follows the active pilot eligibility.
- Filtered empty results retain access to clear filters and restore the unfiltered list.
- Desktop at 1280 stays unchanged; mobile at 320 has no horizontal overflow.

---

### Task 1: Booking and Logbook actions

**Files:** `src/app/[locale]/dashboard/bookings/page.tsx`, `bookings/schedule.tsx`, `logbook/page.tsx`, `logbook/logbook-console.tsx`, `messages/{it,en}.json`, `e2e/empty-18-2b.spec.ts`.

**Interfaces:** Pass the existing `canCreateNew` to Schedule and the equivalent read-only booking eligibility to Logbook. A student-only actor gets a navigation link from Logbook, never a create control on Schedule.

- [x] Write and run a red unit test for active/inactive pilot, student-only, dual-role legacy actor and staff eligibility. The browser spec covers active/inactive pilot, student-only, admin filtered lists and clear-filter behavior; a browser red run on the base was not performed.
- [x] Render mobile empty copy and authorized action, hide redundant mobile chrome for a genuinely empty unfiltered list, and provide a clear-filter action for filtered empties.
- [x] Run the focused browser spec and confirm pass.

### Task 2: Registry and self-service empty states

**Files:** `src/app/[locale]/dashboard/{fleet,pilots,instructors,expiries,billing,people}`, `src/styles/airops.css`, `messages/{it,en}.json`, `e2e/empty-18-2b.spec.ts`.

**Interfaces:** Preserve each component's existing create button and filter handler; empty action opens that same editor. Self-service account and personal expiry lists remain informational.

- [x] Add focused browser assertions for filtered empties on five admin lists, a filtered empty Planning view, and unfiltered empty Logbook for a private pilot/student. Admin unfiltered lists retain seeded rows, so that runtime branch is covered by code review and the existing create-action e2e tests, not this new browser spec.
- [x] Implement compact unfiltered mobile state and filter reset while leaving desktop nodes and layout unchanged.
- [x] Verify IT/EN, both themes, 375×812 Logbook empty-message height, 320 overflow, and desktop boxes for the filtered admin lists.

### Task 3: Final gates and record

**Files:** `_bmad-output/implementation-artifacts/18-2-fold-liste.md`, `docs/handoffs/HANDOFF.md` (only if required to record an actual result).

- [x] Run `npm run gates` on the final application tree and record exit status.
- [x] Run `scripts/e2e.sh start` and inspect `scripts/e2e.sh status`; separate passes, retries, skips and failures. Final full run: `E2E_EXIT=0`, 662 passed, 5 flaky, 2 skipped. The three METAR cases :61, :167 and :208 were not verified; :167 failed login first and then skipped with missing `raw`. Two user-management cases passed only on retry #2.
- [x] Record measured empty-state heights and the authorization decision; commit with explicit pathspecs. Leave BMAD review and done status pending independent review.
