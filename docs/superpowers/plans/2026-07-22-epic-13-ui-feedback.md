# Epic 13 — UI Feedback Batch (post-Epic 12) Implementation Plan

> **For agentic workers:** execution runs on the project's BMAD cycle (CLAUDE.md) — each Task below = ONE story, implemented by ONE `dev-story` subagent (Sonnet 5 xhigh) briefed with: this plan's task section, the skills `karpathy-guidelines` + `design-taste-frontend` + `ui-ux-pro-max` (UI stories). After each story: adversarial review (Opus 4.8 xhigh, never downgraded), fixes in main session, commit per story, handoff + sprint-status updated in the closing `docs(13.N)` commit.

**Goal:** Close the user's post-Epic-12 feedback punch-list (2026-07-22, ~36 items): single-step person creation with profiles/roles/ratings, ratings-vs-medical model cleanup, AirOps port of the last 2 legacy pages (person detail + account statement) with full legacy-stack retirement, per-page polish (fleet, billing, logbook, expiries, PPR/movements, scheduling, reports, settings, shell), then a dark-theme pass and a mobile pass.

**Source of truth:** the user's feedback list (verbatim, mapped item-by-item in the tasks below) + 4 epic-level ratifications (2026-07-22):

- **R1 — suspended pilots**: stay VISIBLE in the pilots table with a clear "Sospeso" badge (archived stay hidden behind the toggle).
- **R2 — ratings picker**: clickable chips (toggle buttons), one per rating defined in Settings — no free text, no dropdown.
- **R3 — aircraft rate/adjustment histories**: show last 5 entries + a "mostra tutte" expander; full history stays reachable.
- **R4 — legacy stack**: with `people/{id}` and `people/{id}/account` ported to AirOps, RETIRE Tailwind, Geist, TanStack Table, `data-table.tsx`, `export-button.tsx` (keep `search-combobox` — already AirOps-themed and used by new pages).
- **R5 (2026-07-23, in review 13.1) — naming**: the catalog concept is called **"Ratings" in BOTH languages, everywhere** (IT "Abilitazioni"/"Certificazioni" → "Ratings": settings card, pilot editor, any other occurrence).
- **R6 (2026-07-23, in review 13.1) — issuedAt**: the emission date is irrelevant to the club — **drop `Expiry.issuedAt` from the DB entirely** (migration + full consumer sweep: forms, views, exports, validityMonths prefill, membership-fee renewal). Only `expiresAt` exists.

**Branch:** `epic-13-ui-feedback`, stacked on `epic-12-airops-ui` (PR #20 still open → stacked PR per project rule).

---

## Ground rules (apply to every task)

- One commit set per story: story file → implementation → review fixes → closing docs. `npm run gates` MUST pass before every commit.
- e2e selectors: landmark-scoped or `exact: true`; never page-level substring name-match; never `hasText` with H:MM/dates. Specs writing global AppSettings go in the serialized project chain of `playwright.config.ts`.
- i18n: IT source of truth, EN in the same commit. Money/dates via existing `src/lib/money.ts` / `formatDateOnly` / Europe/Rome bucketing.
- Backend removals (owner field, statement endpoint, logo setting): inventory ALL consumers first (lesson 12.12/12.13 — removals have tentacles; cross-check against what other stories keep alive).
- Full-suite arbiter: `CI=1 npx playwright test` on fresh DB, production build.

## Task order rationale

Backend model before the UI that consumes it (13.1 → 13.2); person pages ported (13.3) BEFORE billing statement-endpoint removal (13.5) so the ported account page's real needs are known; cross-cutting sweeps (dark theme, mobile) LAST, after page churn settles.

---

### Task 1 (story 13.1) — Piloti backend: ratings/medical model + one-step create API

User items: single-step account creation (person + profiles + roles + ratings in ONE form/API); ratings chosen from the admin-defined list in Settings (no free text); medical certificate is NOT a rating — own expiry date, excluded from the Settings ratings list; "Certifications" renamed to "Ratings" everywhere (i18n IT/EN + identifiers where cheap).

Recon facts: settings "ratings" = model `ExpiryType` (`prisma/schema.prisma:1250`, card `settings/ratings-card.tsx`, `expiry-types.service.ts`); per-person expiries = `Expiry` (`schema.prisma:1314`, unique per person+type, status derived). **Medical visits are seeded as ExpiryTypes like any rating** → model needs a RATING vs MEDICAL distinction (e.g. `ExpiryType.kind`), with data migration for seeded medical types. Separately, `InstructorProfile.ratings` (`schema.prisma:125`) is a FREE-TEXT string disconnected from the catalog — this is the free-text the user wants gone; replace with catalog-driven selection. Today's flow: create = `POST /api/v1/people` (identity only, `pilot-editor.tsx:202-313` mode `new`); profiles/access only afterwards in edit (`ProfilesSection` :339, `AccessSection` :858 → `POST /api/v1/users`). New: one atomic create endpoint (person + profiles + roles/invite + ratings + medical expiry) delegating to existing services.

Per-story ratifications needed BEFORE dispatch: how medical types appear in Settings (own card vs built-in), fate of existing seeded medical ExpiryTypes, exact shape of instructor ratings replacement.

### Task 2 (story 13.2) — Piloti UI: form unico, editor, tabella

User items: single-step "Aggiungi pilota" form (anagrafica + profili + ruoli/accesso + ratings chips **R2** + scadenza medica); pilot expiries managed inline from the editor — today `CertificationsSection` (`pilot-editor.tsx:779-845`) is read-only with a "Gestisci" link to `/dashboard/expiries`; "mostra archiviati" checkbox (`pilots-console.tsx:236`) becomes an on/off toggle BUTTON (the filter chain already works — `?includeArchived` → `people.service.ts:194`; the "does nothing" perception = archived set nearly always empty); suspended pilots visible with badge (**R1** — ALREADY current behavior via `User.isActive` + `userStatusTone`, `pilots-console.tsx:136-139,300-302`: verify badge clarity, no rework expected).

### Task 3 (story 13.3) — Scheda persona + estratto conto AirOps + ritiro stack legacy

User items: `people/{id}` and `people/{id}/account` rebuilt in AirOps (last legacy-Tailwind pages, light-only hardcoded colors — `people/[id]/page.tsx:112-119`, panels `profiles-panel/account-panel/expiries-panel`, statement table on `DataTable`/TanStack); clicking a pilot's NAME in the pilots table opens `people/{id}` — today it opens the `PilotProfile` slide-over (`pilots-console.tsx:276-285`), which gets deleted (`pilot-profile.tsx`). Then **R4**: retire Tailwind/Geist/TanStack/`data-table.tsx`/`export-button.tsx`. Consumer inventory (recon): `data-table.tsx` ← account-statement-table, new-booking-form, aircraft-editor; `export-button.tsx` ← account page, logbook-console, export-menu. **`search-combobox` stays BUT its dropdown list is styled with raw Tailwind utilities and no font-family (`search-combobox.tsx:275-313`) → must be converted to airops.css classes here; this also fixes the logbook "wrong font in suggestions" item for free.**

### Task 4 (story 13.4) — Flotta: toggle archiviati, storici, rimozione owner

User items: "show archived" checkbox → on/off toggle button (same mechanics/perception as pilots — `fleet-console.tsx:133-136`, `aircraft.service.ts:172`); rate history currently UNBOUNDED (`aircraft-editor.tsx` `fetchRatesHistory` :606 renders everything) and hour-adjustment history paginated at 50 (`:750-819`) → both become last 5 + "mostra tutte" (**R3**); `owner/private` removed from UI AND backend — consumers: enum+field `schema.prisma:260-263,303`, migration `20260715170000`, `src/lib/schemas/aircraft.ts:5-8`, `aircraft.service.ts` create/update, `aircraft-editor.tsx:391-395` select, `fleet-card.tsx:31`, `fleet/page.tsx:92` (drop-column migration).

### Task 5 (story 13.5) — Polish tabelle: billing + logbook + expiries

User items — billing: pilot filter `SearchCombobox` (`billing-console.tsx:430-441`) → debounced free-text like pilots (`pilots-console.tsx:240-250` + server `q`); the transaction-id string under each pilot name (`billing-console.tsx:481-483`) removed; "Tipo" column fixed `108px` in `COLS` (`:134`) truncates "Storno addebito volo" via `.student-row > * { overflow:hidden }` (`airops.css:857`) → widen; "Estratti conto" button (`billing-console.tsx:448-450` + `statement-dialog.tsx`) deleted from UI and backend endpoint `api/v1/people/[id]/account/pdf` (verify the 13.3-ported account page doesn't consume it; the billing ExportMenu keeps its separate cash-report PDF). Logbook: "correggi"→"modifica", "storna"→"annulla" (EN "correct"→"edit", "reverse"→"cancel"); two separate export `<a class="btn">` (`logbook-console.tsx:386-391`) → ONE `ExportMenu` dropdown (pattern already used by fleet/pilots/billing); pilot filter native `<select>` of ALL people (`:340-355`) → debounced free-text. Expiries: pilot filter `SearchCombobox` (`scadenze-console.tsx:215`) → debounced free-text; "invia promemoria" chain VERIFIED in recon (trigger → `runExpiryAlertsJob` → real SMTP holder+digest emails, idempotent via SentAlert) → story just proves it end-to-end vs Mailpit and reports.

### Task 6 (story 13.6) — PPR & Movimenti

User items: "Operation Instructions" — text ALREADY lives in AppSettings (`ppr.operatingInstructions.it/en`, delivered in approval email `ppr.service.ts:547-548`); its EDITOR sits in the PPR console → move editor card to `/dashboard/settings` (public `/ppr` page deliberately doesn't render it — keep that behavior unless user says otherwise). Movements: phone invisible because `contactLine` "email · phone" is ellipsis-truncated (`movements-table.tsx:235-240`, `.student-sub` nowrap + `airops.css:857`) → fix layout; date filters are native `<input type="date">` (`:185-189`) → `CalendarPopover`; export today Excel-only (`ExportMenu` `pdfLabel=""`) → add PDF. PPR console: NO export at all (`ppr-console.tsx`) → add ExportMenu Excel + PDF.

### Task 7 (story 13.7) — Pianificazione

User items: filters popover clipped by `.card { overflow:hidden }` (`airops.css:400-405`; popover `schedule.tsx:267-283`, z-index is fine) → fix clipping; bookings table IS server-sorted `startsAt asc` (`bookings.service.ts:577,633`) — ratify with user what "sort by date" means (desc? clickable sort control?); export today Excel-only (`bookings-table.tsx:310`) → add PDF.

### Task 8 (story 13.8) — Shell & misc trasversali

User items: language switcher (IT/EN) next to the theme toggle in `top-bar.tsx:62`, same icon size (NO locale switcher exists in the dashboard today — only on public `/ppr`); sidebar icons: movements already `'plane'`, fleet uses `'fleet'` (`route-registry.ts:72,78`) → small plane for both; reports month labels: recon found NO defect (`reports/page.tsx:18-23` locale-driven, no off-by-one) → ratify with user what looks wrong (hypothesis: cramped/overlapping labels in the bar chart, not wrong names); settings "logo" input removed from UI and backend — consumers: `settings-form.tsx:54-146`, `club-card.tsx`, AppSettings `airfield.logo` (`app-settings.service.ts:30`), `getAirfieldBranding` used by PDF branding and `/ppr` mark → they fall back to name-only.

### Task 9 (story 13.9) — Dark theme pass

User item: dark theme has unreadable text (background vs text color combos). Systematic pass over all AirOps pages in dark mode; fix token usage, not per-page hacks where avoidable.

### Task 10 (story 13.10) — Mobile pass

User item: all mobile UI/UX reviewed and fixed (currently broken on mobile). Shell (sidebar/topbar), tables, slide-overs, calendars, charts at mobile viewports; verify interactively + viewport e2e where cheap.

---

## Tracking

`_bmad-output/implementation-artifacts/sprint-status.yaml` (epic-13 section) + story files `13-*.md` in the same dir. Story files carry per-story ratifications (AskUserQuestion BEFORE dev dispatch) and the Review Record.
