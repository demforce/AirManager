# Mobile Touch Floor Implementation Plan

> **For agentic workers:** Implement natively with one development agent; a separate reviewer checks the finished branch. The already authorized execution method takes precedence over the skill's suggested subagent handoff.

**Goal:** Make the agreed 44 px phone touch floor consistent across panels, shell and authentication without moving desktop controls.

**Architecture:** Keep geometry in the existing phone media query in `src/styles/airops.css`. Give the three public auth pages a shared wrapper and localized language switch; measure actual browser boxes and CSSOM with Playwright. Preserve the calendar cell exemption and preexisting ACLs.

**Tech Stack:** Next.js 16, React 19, CSS, next-intl, Playwright.

**Spec:** `_bmad-output/implementation-artifacts/18-1-pavimento-mobile-unico.md`

## Global Constraints

- Phone ceiling is 640 px; 641, 900, and 1280 px must retain desktop control geometry.
- Floor is 44 px with 43.5 px browser tolerance; calendar day cells and calendar time input retain the ratified exemption.
- Topbar remains 53 px at zero safe-area inset and tab bar does not move.
- Only local SMTP and synthetic fixture data. No production actions.
- Keep 17.8 ambiguous SMTP delivery and best-effort AOG fan-out in backlog.

## Review Focus

- A 320 px, two-line SlideOver title must not squeeze its close target or overflow.
- A checkbox's effective `<label>` must clear the floor even though its native box stays 13 px.
- The calendar popover must still fit a 320 px viewport and its 42 cells must remain compact.
- Auth return links on confirmation and missing-token faces must remain reachable and readable in both themes.
- A style declaration escaping the phone media query must be caught by CSSOM and desktop geometry pins.

---

### Task 1: Shared phone panel and shell floor

**Files:** Modify `src/styles/airops.css`; test `e2e/mobile-ink-targets.spec.ts`.

- [x] Measure before-state on representative panels at 320/375 and five editors at 641/900/1280.
- [x] Add a failing Playwright sweep that measures the smaller box side, mapping a native checkbox to its owning label and exempting only the ratified calendar targets.
- [x] Add one `.so-body` phone rule for controls and checkbox labels, plus phone rules for close header, topbar, date navigation and PO named standalone controls; remove five redundant declarations.
- [x] Verify the sweep, 320 px header overflow, phone shell across roles/routes, and unchanged desktop box/style snapshot.

### Task 2: Public authentication

**Files:** Modify three `(auth)` `page.tsx` files, `src/styles/airops.css`, `messages/{it,en}.json`, and `e2e/mobile-ink-targets.spec.ts`.

- [x] Add red browser checks for input/button/link boxes, link contrast, three auth routes and form/confirmation/success/missing-token faces.
- [x] Add a shared auth wrapper class, locale switch, and missing-token return link. Keep auth copy parity between it/en.
- [x] Set phone-only floor and all-width link ink/underline; verify at 375 and desktop in both themes.

### Task 3: Complete regression and evidence

**Files:** Modify `e2e/mobile-reports.spec.ts`, `e2e/mobile-expiries-movements.spec.ts`, story record; create evidence in `/tmp`.

- [x] Reverse the two obsolete segmented pins per PO ratification; add CSSOM phone-scope guard and explicit desktop geometry pins.
- [x] Run focused browser checks, isolated red discriminants, `npm run gates`, then full `scripts/e2e.sh` on final candidate and synthetic database. Record commands, exit codes and sanitized outcomes.
- [x] Document the precise two skipped 17.8 METAR tests without calling them passed; record 18.1 coverage, desktop before/after measurements, updated pins and limitations.
- [x] Commit development and story evidence locally; leave BMAD ready for independent review, no push.
