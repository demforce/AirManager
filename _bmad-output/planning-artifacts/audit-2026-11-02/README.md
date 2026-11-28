# AirManager — Comprehensive audit (2026-11-02)

**Scope.** The whole web app on branch `dev` at `a598b26`. The uncommitted story 19.8 "Salva unico" settings work was present in the tree: it was looked at, its observations are labelled WIP, and no finding depends on it. Four dimensions: security, business logic, UI/UX, engineering health (architecture, tests, CI, operations, performance, dependencies).

**Method.** Read-only. Four adversarial review agents (Opus) worked in parallel, each with the prior audits as a checklist, and wrote the appendices listed at the end. The main session re-verified every High finding and the most consequential Mediums independently: `npm audit`, a real-browser reproduction of the open redirect, a `curl` probe of the API's cross-origin handling, code reads of the payout-twin guard, the booking edit path and the confirm modals, git/CI state. The UI was exercised on a live instance (`next dev` on port 3100) against a throwaway database `airmanager_audit` seeded with `prisma/seed-demo.ts`: 209 page loads, 4 roles plus anonymous, 4 viewports, 3 theme modes, 2 locales, axe-core, and real keyboard flows. The shared e2e database and port 3000 were never touched. No repo file was modified, no commit was made, no e2e suite was run. The throwaway database still exists and can be dropped (`DROP DATABASE airmanager_audit`).

**Prior audits used as checklists** (not re-discovered): `docs/security/owasp-audit-2026-07-22.md`, `CLAUDE-SECURITY-20260723-073138/`, `_bmad-output/planning-artifacts/audit-2026-09-10/` (ledger, ops, UI, perf), and the `action_items` tech-debt register in `sprint-status.yaml`.

**Severity scale.** Judged for a single small club (a few dozen members, one or a few admins): money, medical/PII data, availability, daily-task friction. Critical = silent money loss or safety-relevant bypass; High = will bite in production, blocks a core promise, or blocks a class of users; Medium = real defect with a workaround or limited blast radius; Low/Info/Nit = hygiene.

**Counts.** Per appendix (new findings only, before de-duplication): security 1 High / 5 Medium / 7 Low / 5 Info; business logic 1 / 3 / 10 / 2; engineering 5 / 21 / 16 / 4; UI/UX 1 / 17 / 26 / 4. No Critical anywhere. Five items appear in two appendices (METAR, APPROVED-booking move, adjustments without idempotency key, profile PUT body cap, missing error pages); the ranked list below de-duplicates them.

---

## Verdict in ten lines

1. **The core is sound.** RBAC and ownership hold on all 73 API routes and every page, every raw SQL statement is parameterized, there are no XSS sinks, balances are always `SUM(movements)`, money is integer cents, and 60,487 of 60,487 flight charges on the load DB match their snapshots. The July security remediation landed and still holds.
2. **Dependencies are the most urgent item.** Next 16.2.10 carries two unauthenticated Server-Actions CPU-exhaustion advisories this app qualifies for (it has a logout Server Action); next-auth beta.31 has a `getToken` crash the edge proxy triggers; nodemailer and zod are behind. One upgrade commit fixes most of it.
3. **One verified open redirect after login**: `callbackUrl=%2F%09%2Fevil.example` passes the guard, the browser strips the tab, and the user lands on the attacker's page. Credential-phishing quality, cheap to fix.
4. **The ledger's weak edge is where two books record one event by convention**: a payout's cash twin can be reversed while the payout stays (cash and "owed" diverge silently); a wrong top-up cannot be corrected on both the account and the drawer without inventing a cost; the flight registry has no per-person/per-instructor overlap guard, so one hour of instruction can be billed and accrued twice.
5. **Scheduling has one approval hole and one privacy hole**: a pilot can move an already-APPROVED booking to another aircraft, day or duration and it stays APPROVED; masked bookings still leak `personId`, `forcedAt` and other members' denied/cancelled rows.
6. **The UI is a coherent design system with a keyboard/screen-reader blocker**: the six desktop destructive confirms (delete flight, reverse payment, reject booking, membership fee) are not dialogs. No focus move, no trap, no Escape; 36 Tab presses to reach "Chiudi". Every page shares the title "AirManager" and exposes one heading; focus is lost after every successful action. None of the 21 September UI findings is fixed (epic 18 not started), four are only hidden by the small demo data.
7. **Availability is fragile by design**: the METAR fetch has no timeout and every dashboard render awaits it; any role can pin the single Node process with a 2,000-row PDF; the overview already returned 500 under modest concurrent load during the walkthrough (Prisma P2028); the September performance findings are 6 open, 3 partial, 1 fixed-in-dev-only.
8. **Nothing is deployable yet**: no Dockerfile, no production compose, no backup, no cron for the expiry-alert job (alerts never fire), no error/not-found/loading pages, a health check that never touches the DB.
9. **Work is at risk**: 56 commits exist only on this machine, `origin/main` has not moved since 2026-07-27 (232 commits behind), the last CI run was 2026-10-26, PR #22 has been open since August.
10. **Engineering hygiene is excellent where it is measured** (strict TS, 0 `any`, 0 lint errors, OpenAPI registry 96/97, perfect i18n key parity, 0 horizontal overflow in 209 loads) and weak where it is not: no DB-backed tests, no coverage, 1,958 story-number references in code comments, five 1,000-line client consoles built from copied boilerplate, "API-first" true for writes only.

---

## Top findings, ranked (de-duplicated)

| # | Sev | Area | Finding | Verified by | Where / appendix |
|---|---|---|---|---|---|
| 1 | High | Security | Vulnerable runtime deps: `next` 16.2.10 (GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r: unauthenticated Server Actions DoS), `next-auth` beta.31 (GHSA-xmf8-cvqr-rfgj: `getToken` crash on a malformed Bearer header, hit by `src/proxy.ts`), `nodemailer` 9.0.3 (address-parser and DoS advisories), `zod` 4.4.3 (memory exhaustion) | `npm audit --omit=dev` run by the main session: 28 advisories, 3 critical, 12 high | `package.json`; security.md S-1 |
| 2 | High | Business logic | An instructor payout's cash twin can be reversed from the cash register; the `InstructorPayout` row stays and keeps lowering "owed". The reversal guard selects only `accountMovementId`, never `instructorPayoutId`; the unified ledger marks the row actionable | code read (main session) + reproducing vitest probe | `cash.service.ts` (HEAD :393), `transactions.service.ts:318`; business-logic.md BL-01 |
| 3 | High | Ops | No production deployment story: no Dockerfile, no prod compose, no backup/restore, no migration runbook, nothing schedules `POST /api/v1/jobs/expiry-alerts` (the spine promised a Dockerfile; README covers dev only) | repo inspection (main session) | engineering.md O1 |
| 4 | High | Process | 56 unpushed commits on `dev`; `origin/main` last moved 2026-07-27, 232 behind; last CI run 2026-10-26; PR #22 open since 2026-08-07; four destructive migrations never run in clean-room CI | `git log origin/dev..dev`, `gh pr list` (main session) | engineering.md T1 |
| 5 | High | Availability | METAR fetch has no timeout and no in-flight dedup; every dashboard landing awaits it (~16 s on an unknown station, up to undici's 300 s on a blackhole). Already TD 19.7b-e | code read (main session) | `metar.service.ts:111`, `dashboard/page.tsx:229`; S-4 / P1 |
| 6 | High | Accessibility | Six desktop destructive/money confirms (`.mini-modal` ×5, inline booking cancel) are not dialogs: no `role`, no `aria-modal`, no focus move, no trap, no Escape; 36 Tab presses to reach "Chiudi" from the flight-delete confirm; the inline cancel drops focus to `<body>`. The app already has a correct dialog primitive (`SlideOver`) | measured on the live instance + code grep (main session) | `logbook-console.tsx:868`, `bookings-table.tsx:623-640, 792`, `billing-console.tsx:1204, 1255`, `scadenze-console.tsx:933`; ui-ux.md A-1 |
| 7 | Medium | Security | Open redirect after login: `callbackUrl=%2F%09%2Fevil.example%2Fphish` passes `/^\/(?![/\\])/`; `router.push` resolves to `http://evil.example/phish` | **reproduced in a real browser on the live instance** (main session) | `(auth)/login/page.tsx:65`, `login-form.tsx:65`; S-2 |
| 8 | Medium | Security / privacy | Masked bookings still carry `personId` (ops F6, story 16.7 not built) and `forcedAt` (an admin overrode an expired document for that person); `?status=DENIED,CANCELLED` is honoured for every role | code read | `bookings.service.ts:257-260, 815-831`; S-6 |
| 9 | Medium | Business logic / security | Owner edit of an APPROVED booking (aircraft, day, duration) keeps it APPROVED with the old `decidedAt` | vitest probe + code read (main session) | `bookings.service.ts:1052-1171`; BL-03 = S-5 |
| 10 | Medium | Business logic | Flight overlap guard keyed on `aircraftId` only: the same instructor or pilot on two overlapping flights on different aircraft → double charge, double payout accrual | code read; load DB shows 85 instructor and 118 person overlapping pairs | `flights.service.ts:942-974`; BL-02 |
| 11 | Medium | Availability | Any role (STUDENT included) can request a 2,000-row bookings PDF; react-pdf costs 16-70 ms CPU per row in-process, no concurrency cap | code read + perf-report numbers | `exports.service.ts:61`, `pdf/document.tsx:158`; S-3 |
| 12 | Medium | Business logic | A mistyped or refunded top-up can be corrected on the account (rettifica) but not in the cash drawer; the only path books a phantom cost (every departing member's deposit refund takes it) | code read | `cash.service.ts`, `accounts.service.ts:595-720`; BL-04 |
| 13 | Medium | Performance | September perf findings F1, F2, F3, F5, F7, F8 open; F4, F6, F9 partial; F10 fixed dev-only. `/en/dashboard` returned 500 under modest concurrent load during the walkthrough (P2028 in `getStats → listAircraft` interactive transaction). Balances recomputed over the whole ledger twice per Contabilità render (118-203 ms each); no `effectiveDate` index on either ledger | `EXPLAIN ANALYZE`; dev-server log lines 17-33 | engineering.md P2-P6; ui-ux.md PERF-1 |
| 14 | Medium | Ops / UX | 0 `error.tsx` / `not-found.tsx` / `loading.tsx` / `Suspense` across 18 pages: an invalid person id or a P2028 shows Next's unstyled English page with no shell, no `lang`, no way back; `/api/v1/health` never touches the DB; console-only logging without request ids | `find` (main session) + live 404/500 screenshots | O2, O3, O4; PERF-1, I18N-5 |
| 15 | Medium | Architecture | "API-first" holds for writes only: 13 of 14 pages read services directly; 21 page-read functions have no route; a pilot cannot list bookable aircraft via the API (`GET /aircraft` needs `aircraft.manage`) | sub-audit + spot checks | engineering.md A1; architecture-api-first.md |
| 16 | Medium | Correctness / i18n | Two client i18n mechanisms: the provider inherits the whole catalog (~80 KB per locale in every RSC payload) while 75 hand-rolled `.replace('{x}')` calls bypass ICU → "1 bookings"; server-written ledger descriptions are Italian with ISO dates even in the EN UI ("Flight charge — Volo I-PDVB 2026-10-31") | code read (main session confirmed the provider) + live EN screenshots | `[locale]/layout.tsx:93`; I1, I3; ui-ux.md I18N-1 |
| 17 | Medium | Forms | The flight form preselects the first aircraft (a hurried user charges the wrong aircraft) and defaults the date from UTC: with the clock at 00:30 Rome on 03/11 the form proposed 02/11. 11 `toISOString().slice(0,10)` copies remain in client code (TD 16.9) | fixed-clock browser test + grep (main session) | `flight-editor.tsx:244-246`, `transaction-editor.tsx:73-75`; ui-ux.md FORM-2 |
| 18 | Medium | Tests | No DB-backed tests: all 76 unit files mock Prisma; 40 raw-SQL sites are "tested" by regex over the SQL text; the only real check is the 13-15 min shared-DB e2e suite with `retries: 2` in CI | inspection | T2, T3, T4 |
| 19 | Medium | Money / client | Billing console posts account adjustments without `Idempotency-Key` and without try/finally (the sibling account-section does both) | code read | `billing-console.tsx:414-424`; A4 |
| 20 | Medium | Ops | Unbounded tables: `IdempotencyRecord` (full response bodies, never cleaned), `LoginAttempt`, `PasswordResetAttempt`, expired `AuthToken` | code read | O5, S-8 |
| 21 | Medium | Business logic | Deactivated/archived instructor's owed money is hidden AND cannot be paid (`recordPayout` → 409). Load DB: 27 such instructors, 69,633 school minutes | code read + SQL | ledger MAJOR-2, aggravated |
| 22 | Medium | Security | Session identity never refreshed on user↔person relink (ops F8): the old session keeps "own" access to the previous person for up to 30 days | code read | `users.service.ts:182-188`, `jwt-active-check.ts:40`; F8 |
| 23 | Medium | UX | Pending requests are invisible on the schedule the admin decides them against (timeline and week view read APPROVED only; week view says "0 prenotazioni" on days with pending requests); the page subtitle promises otherwise | live screenshots | `bookings/page.tsx:276`; ui-ux.md DESK-2 |
| 24 | Medium | Accessibility | Every page has the same `<title>` and a single heading (card titles are `div`s); focus lost to `<body>` after every successful action; global link colour 3.61:1; error toasts vanish after 2.6 s and are inserted with their text (often not announced) | measured on 209 loads + axe | ui-ux.md A-2, A-3, A-4, A-5, A-7 |

---

## 1. Security

**Appendix:** `security.md` (full authorization matrix for all 73 routes, prior-finding status table, S-1…S-18, checked-and-OK list).

**Status of prior findings.** H1-H4, M1-M4, L2-L4, scan F1/F2: fixed and holding. H5/F12: moot (PPR removed in 19.1). L1 (SMTP SSRF guard): partial, non-canonical literals (`127.1`, `0177.0.0.1`, `169.254.43518`, `::ffff:7f00:1`) pass. M5 (body cap): bypassed by one route. Ops F6/F8: open (story 16.7 ready-for-dev, not built). D-A…D-D: accepted residuals, unchanged; D-C refined (sessions slide on every read, they are not absolute, see S-16).

**New, by severity.**

- **S-1 High — outdated runtime dependencies.** Confirmed by `npm audit` in the main session. Applicable: Next Server Actions DoS (fixed in 16.2.11 and >16.4.0 → upgrade to 16.4.4), next-auth `getToken` crash (beta.32), nodemailer address-parser/DoS advisories (≥10.1.4, a major bump), zod memory exhaustion (4.6.7), prisma 7.10.1 (CLI chain only). Not applicable: image optimizer, `next/og`, `use cache`, OAuth/email-provider advisories (features unused). Fix: upgrade in one commit, re-run gates and the e2e arbiter.
- **S-2 Medium — open redirect after login** (verified in a real browser). Fix: parse `callbackUrl` against a fixed origin, reject control characters and backslashes, forward only `pathname+search+hash`; add unit cases for `%09`, `%0A`, `%0D`, `//`, `/\`.
- **S-3 Medium — any authenticated role can monopolize the process with exports.** Fix: lower the PDF cap (~300 rows), add a per-user concurrency limit returning 429; long-term render PDFs in a worker or with a streaming engine (perf plan item 8).
- **S-4 Medium — METAR without timeout on the critical path** (= P1, TD 19.7b-e). Fix: `AbortSignal.timeout(3000)`, a per-station in-flight promise, and a `<Suspense>` boundary so the card streams instead of blocking the layout.
- **S-5 Medium — APPROVED booking movable by its owner** (= BL-03). PO decision: reset to PENDING on aircraft/time change (recommended) or forbid own edits of APPROVED bookings.
- **S-6 Medium — booking mask leaks** `personId`, `forcedAt`, and others' DENIED/CANCELLED rows via `?status=`. Fix inside story 16.7: null both fields, restrict `status` to APPROVED for actors without `bookings.read.names`, switch unit tests to exact `toEqual`.
- **S-7 Low — login lockout is attacker-steerable**: 10 failures per identifier lock the correct password too, from every IP; a known email (the admin's) can be kept locked indefinitely with 10 requests per 15 minutes. Fix: lock (identifier, IP) pairs, or admit a correct password from another IP after a progressive delay.
- **S-8 Low — forgot-password throttle is check-then-insert** (same race class as the removed PPR limiter) and the throttle tables are unbounded. Fix: `pg_advisory_xact_lock` around count+insert (the login throttle's idiom) plus a purge job.
- **S-9 Low — `PUT /people/{id}/profiles/{type}` reads an uncapped body before authorizing** (partial regression of M5). Fix: `bodySchema: z.unknown()` or authorize before reading.
- **S-10 Low — SMTP host SSRF guard bypassable** with non-canonical IP literals. Fix: resolve with `dns.lookup({all:true})` and check each address with a CIDR library, or record it as an accepted residual.
- **S-11 Low — last-admin guard is racy** (count and update are separate statements). Fix: one transaction under an advisory lock.
- **S-12 Low — archiving a person leaves their login, roles and instructor powers intact**; an archived instructor keeps `bookings.read.names` and can still book for students. PO decision: archive = offboarding (deactivate the user) or add an explicit "revoke access".
- **S-13 Low — CSRF rests on `SameSite=Lax` alone.** The main session confirmed the API accepts a state-changing POST with `Content-Type: text/plain` and a foreign `Origin` (201 Created). Modern browsers block the cross-site cookie, but a same-site sibling service or a future `SameSite` regression removes the only layer. Fix (~10 lines in `apiRoute`): require `application/json` on body routes and reject a non-matching `Origin`/`Sec-Fetch-Site`.
- **S-14…S-18 Info**: an instructor can read any student's blocking-document types and dates through a failing booking's 422 `details`; no SMTP `socketTimeout` (10-minute default inside admin requests); JWT sessions slide for 30 days and logout does not revoke (add "log out everywhere" via `tokenVersion`); stale `/ppr` public path in `proxy.ts`; several admin strings without `.max()`.

**Checked and OK**: injection (all `$queryRaw` tagged templates incl. the 19.7b registry CTE), XSS sinks (none), Excel formula neutralization, email text-only with `APP_URL`-based links, token entropy/hashing/single-use/TTL, Argon2id at the OWASP minimum, login timing equalization, Auth.js CSRF on the credentials callback, mass assignment (schemas strip, no `passthrough`), money concurrency (FOR UPDATE, deterministic lock order, idempotency fingerprint), no 403-vs-404 existence oracles, secrets handling (AES-GCM/HKDF, `hasPassword` only on GET), server-side role gates on every page, `.env` ignored, security headers present (CSP with `frame-ancestors 'none'`, nosniff, referrer policy; HSTS deliberately left to a proxy).

---

## 2. Business logic

**Appendix:** `business-logic.md` (prior-finding status for 31 ledger/ops items, BL-01…BL-16, invariants verified, 4 reproducing vitest probes and read-only SQL on `airmanager_load`).

**What holds.** Balance never denormalized; one rounding rule for charges (half-up on `rate×min/60`), 60,487/60,487 charges equal their snapshot on the load DB; flight date = Rome day of takeoff (0 mismatches); one charge per flight with `flightId @unique` and `ON DELETE RESTRICT`; acyclic lock order across flights/bookings/people; Rome "today" on every money writer (September MAJOR-3 fixed server-side); rates unique per day, past rows immutable; profile exclusivity (R-19-e) enforced under a `Person` lock; booking overlap half-open on aircraft/person/instructor under locks with approval re-verification (R-16 fixes landed); AOG guards and DST-safe impact window; currency parity between the SQL registry and `computeCurrency`; medical "one valid of any class" (R-19-j); membership in one transaction; no cascade can drop a ledger row.

**Prior findings.** 9 fixed, 6 superseded by PO decisions or removed features, 14 still open and mostly already scheduled in stories 16.5-16.9 and 17.x that are not built. Worth naming: payout rate not historicized and applied retroactively (MAJOR-1, 16.5; R-19-c widened it: editing or deleting a flight after a payout drives "owed" negative with no way to settle, which is also what the instructor landing shows as "-75,00 € dovuti nel mese"); deactivated instructor's owed hidden and now unpayable (MAJOR-2, aggravated); future value dates accepted (MAJOR-4, 16.6a); membership fee idempotency key regenerated per attempt (MAJOR-6, 16.6b); client form defaults still UTC (MAJOR-3 residual, 16.9); deactivated expiry types still block (ops F5 half, TD-19.9-a); archived aircraft without AOG protections (F7, 16.8); static 100-row pickers in the admin booking form (§4 caps, 17.6).

**New.**

- **BL-01 High — payout cash twin reversible, payout stays** (verified by the main session). Fix: refuse reversal when `instructorPayoutId !== null`, `actionable: false` in `toCashRow`, then design a two-sided payout correction with the PO.
- **BL-02 Medium — no person/instructor overlap guard on flights.** Fix: extend `assertNoOverlappingFlight` to `personId` and `instructorProfileId` with `FOR NO KEY UPDATE` locks after the Aircraft lock (mirrors `lockBookingPeople`).
- **BL-03 Medium — owner move of an APPROVED booking keeps approval** (= S-5).
- **BL-04 Medium — top-up correction has no cash-side mirror**; a departing member's deposit refund books as a cost. Fix: a dedicated "storno/rimborso ricarica" writer that moves account and cash together (DEPOSIT book); keep the generic twin reversal refused.
- **BL-05 Low — reversing a standalone credit adjustment books phantom revenue**; the planned 16.6b exclusion (`reversalRootType === 'TOP_UP'`) would not cover it. Fix in 16.6b: classify by the root's book.
- **BL-06 Low — membership validity decoupled from the ledger**: refunding a fee does not shorten the membership; with MAJOR-6 open a retry charges twice and extends 24 months.
- **BL-07 Low — month/year "owed" nets a whole payout in its `periodEnd` month** while accrual is by flight date (2,254/2,254 load-DB payouts span months): negative monthly figures (visible on the instructor landing, ui-ux.md DESK-10). Fix: prorate or relabel.
- **BL-08 Low — a flight later today is accepted and charged** (date-only "not in the future" check). Fix: also require `landingAt <= now`.
- **BL-09 Low — same-day edit re-prices at a rate rewritten after registration** (contradicts the schema doc "keeps the price it froze"). Fix: reuse the stored rate unless aircraft/person/date change.
- **BL-10 Low — alert job emails archived people, deactivated types, and a class-2 medical already covered by a valid class-1**. Fix: filter `archivedAt`, `isActive`, alert on the best visit only.
- **BL-11 Low — a booking can name the booked person as their own instructor** (only the flight refuses it). Fix: same 422 `INSTRUCTOR_SAME_AS_PILOT` on booking.
- **BL-12 Low — archiving a person or deactivating an instructor leaves their future APPROVED bookings in place**, each flight later refused with `INSTRUCTOR_NOT_FOUND`. Fix: count and surface them like `computeAogImpact`.
- **BL-13 Low — fleet utilization divides all flights by today's operational fleet hours** (can exceed 100 % for past months; the reports page shows an unexplained "0,2 %").
- **BL-14 Info — TOURISM flights with an instructor charge the instructor fee but accrue no payout** (3,773 flights, 186,568.70 € of fees on the load DB). PO question.
- **BL-15 Info — expired-document scan is scope-blind** (an expired FI rating blocks plain pilot flying) while the missing-document scan is scope-aware. PO question.
- **BL-16 Low — ledger book-type filter and row badge disagree** on rettifiche of top-ups.

**Design-level concerns.** The same rule written twice (currency in SQL and TS; revenue book in a Prisma `where` + JS + filters; medical rule in three places); no closed accounting periods (a reported month can change silently via R-19-c in-place edits and any past value date); flight edits leave no money audit trail; two ledgers linked by convention per writer (BL-01/04/06); instructor compensation has no snapshot and no settlement entity.

---

## 3. UI / UX

**Appendix:** `ui-ux.md` (coverage table for 209 loads, status of the 21 September findings, A/MOB/DESK/FORM/I18N/VIS/PERF/CODE findings, contrast table). Evidence screenshots for the items below are in `screenshots/`.

**Overall.** The AirOps port is a coherent, recognisable system, not generic SaaS: Inter Tight + JetBrains Mono, one amber accent, tight radii, hairline borders, 0 horizontal overflow on 209 loads, 0 duplicate IDs, 0 unnamed icon buttons, tokens that hold in both themes, no Tailwind/shadcn leftovers. `SlideOver` and `SearchCombobox` are correct dialog/combobox implementations, inline validation is right (per-field `role="alert"`, first invalid field focused), double-submit is guarded, and the flight result panel (duration, rate, total, new balance, negative-balance warning) is the best feedback in the app. The weak spots sit outside those primitives.

**Status of the 2026-09-10 UI findings.** 0 of 21 fixed (epic 18 "Mobile 2 e desktop" not started). 17 open as measured: mobile header still eats 324-650 px of the fold (Bookings got worse: 650 vs 366); topbar buttons 32 px and panel inputs 37-39 px on mobile (10 of 16 controls under 44 px on New flight); the schedule filter is still the desktop popover with 27 px chips; Back leaves the page instead of closing sheets (0 `pushState`); 5th tab label wraps at 9.5 px; no navigation feedback (0 `loading.tsx`/`useLinkStatus`/`aria-busy`; 8.2 s blank on throttled 3G); OS dark preference ignored (0 `prefers-color-scheme` rules); "Pianifica volo" opens "Registra volo"; nav says "Aeromobili" while the H1 says "Velivoli"; Logbook hides 354 px of columns at 1280 with no affordance, 698 px at 768; no sticky headers; no skip link. 4 open in code but masked by the 3-aircraft demo data (truncating card names, the ✕ shrinking on two-line titles, the uncapped overview timeline and fleet widget, uncapped desktop rankings). The ratified contrast set (M15) is unchanged.

**New, by severity.**

- **A-1 High — destructive and money confirms are not dialogs** (verified live and in code by the main session). Fix: one `ConfirmDialog` primitive on `focus-trap.ts` (`role="alertdialog"`, labelled, initial focus on the safe button, Escape, focus return); replace all 6 sites. Mobile `secondStep` already does this inside a sheet.
- **A-2/A-3 Medium — one heading per page (card titles are `div`s) and the same `<title>` "AirManager" on 202 of 209 loads** (the only `generateMetadata` is in the root layout). Fix: `.card-title` as `<h2>`, per-page `generateMetadata` with a `%s · AirManager` template reusing the H1 key.
- **A-4 Medium — focus lost to `<body>` after success** (booking submit, flight registered, failed login, inline cancel): the focused button disables or unmounts. Fix: move focus to the status message or result heading.
- **A-5 Medium — global link colour 3.61:1** in light theme (`a{color:var(--info)}`); pilot-name links in the roster. Fix: a dedicated `--link` token.
- **A-6 Medium — mobile KPI strip is a scroll region keyboard/switch users cannot scroll** (axe serious on Overview, Logbook, Reports, Instructors; scrollbar hidden). Fix: focusable `role="group"` or wrap to 2×2.
- **A-7 Medium — toasts, including errors, vanish after 2.6 s** and are inserted together with their text (a pattern screen readers often miss); a successful rejection uses the red tone. Fix: persistent `aria-live` host, errors until dismissed, pause on hover.
- **DESK-2 Medium — pending requests invisible on the schedule** (see ranked #23). PO question on ghost blocks.
- **DESK-3 Medium — the person page ships "Prossime prenotazioni — Disponibile prossimamente"** (a placeholder, while the data exists in `listBookings`) under the fallback title "Pannello".
- **DESK-1 Medium — the Logbook route column spells the full home-field name twice in bold mono** ("Aviosuperficie Poggio al Vento → Aviosuperficie Poggio al Vento", 3-4 lines per row, a 2,190 px page that is mostly the airfield name; the mobile row truncates before the destination). Fix: ICAO code and a "Locale" badge.
- **FORM-1 Medium — "Annulla" means three things**, including both sides of one confirm ("Sì, annulla | Annulla"), the form dismiss, the panel ✕, and a modal titled "Annulla volo" whose button says "Elimina volo". Fix: "Chiudi"/"Indietro" for dismiss, destructive verbs named by their object.
- **FORM-2 Medium — flight form preselects the first aircraft and defaults the date from UTC** (verified with a fixed clock: 00:30 Rome → yesterday). Fix: no preselection, local-date helper (closes TD 16.9 for this form).
- **FORM-3 Medium — booking success is a 10.5 px uppercase mono line at 2.73:1** while the panel stays open and focus goes to `<body>`. Fix: close + persistent toast naming the booking, or a result panel like the flight form.
- **FORM-4 Medium — top-up amount errors say "Campo obbligatorio." for "abc" or "-5"** (`errors.amount ? labels.requiredField`). Fix: distinct messages.
- **FORM-5 Medium — set-password with an invalid/expired token is a dead end**: the form renders, the error appears only after typing the password twice, with no link to request a new one. Fix: validate on load, replace the form with the message and a CTA.
- **FORM-6 Medium — a filtered empty state says "Nessun volo registrato." with four zero KPIs** while 24 flights exist; mobile shows only a "Filtri (1)" badge. Fix: "Nessun volo corrisponde ai filtri" + reset next to it.
- **I18N-1 Medium — server-composed ledger descriptions are stored in Italian with ISO dates** and show in the EN UI as "Flight charge — Volo I-PDVB 2026-10-31 — 1:35"; system categories untranslated. Fix: structured fields rendered at read time (data migration decision).
- **PERF-1 Medium — no `error.tsx`/`not-found.tsx`**: `/people/<bad id>` and the P2028 500 show Next's English pages without shell or `lang`.
- **Lows (26) and Nits (4), selected**: tab-bar labels 9.5 px; booking rows with 4-5 equal mini buttons wrapping to two lines (no primary action); 4-tile KPI rows leave an empty fifth column (`repeat(5, 1fr)`); KPI numeric style used for text ("Rating SEP · Inglese ICAO" in a 295 px tile); billing table noise (coloured "—" placeholders, a "Stato" column that always says "Registrato", descriptions truncated before their identifying part); reports charts without y-axis values, the partial current month plotted as a plunge to 0, negative instructor amounts wrapping; a grey haze on the right edge of every page from the closed SlideOver's `box-shadow` (inherited from the prototype); negative "dovuto" shown to instructors with no label; first invalid combobox auto-opens over the other errors; required fields unmarked; two money-input patterns (text with comma vs `type=number` with a leading "€"); native date inputs follow the browser locale; person-name order differs between views; "Ratings"/"Currency"/"payout" anglicisms in the Italian catalogue (17 "Ratings"); the Next.js default favicon, no manifest or `theme-color`; the port dropped useful density from the prototype (fleet hourly rate row, expiries role sub-line); heavy full-row tints on Expiries in dark; `airops.css` 187 KB of which 107 KB comments, 47 colour literals outside tokens, 52 selector blocks declared twice, 478 inline `style={{}}` objects (billing-console 52), `Segmented` imported once while 8 places hand-roll it, KPI tiles re-implemented twice, Instrument Serif imported and never used; desktop and mobile trees both rendered (18-37 % hidden nodes on desktop, up to 89 % on mobile); an intermittent hydration attribute mismatch (6 of 209 loads, suspected dev-only, check on a production build).

**Contrast.** Body text, KPI values, badges, status pills, sheet labels and the mobile tab bar pass in both themes on all 209 loads. Worst measured: raw `--ok`/`--bad` inline text 2.73 / 3.97 (accepted TD), table headers 3.46 / 3.88 (accepted), link colour 3.61 (new), negative balance "-94,25 €" 3.96 (new instance of the accepted class), search placeholders 4.17 / 4.31 (new).

**PO questions from the UI**: pending requests as ghost blocks on the timeline; aircraft preselection intended or not; name-order convention per context; structured ledger descriptions (data migration); glossary ("rating" vs "abilitazione", "currency", "payout"); whether the 44 px floor should key on `(pointer: coarse)` rather than `≤640px` (tablets now clip 244-698 px of tables); whether a negative "dovuto" is an intended presentation of an advance.

---

## 4. Engineering health

**Appendix:** `engineering.md` (measurements table, A1-A9, I1-I6, T1-T7, O1-O9, P1-P7, D1-D4, M1-M4, status of the September perf findings), plus `openapi-drift.md` and `architecture-api-first.md`.

**Measurements that matter.** 50,201 production TS/TSX lines; 10 files over 1,000 lines (`registry.ts` 1,906, `flights.service.ts` 1,641, `billing-console.tsx` 1,598, `bookings.service.ts` 1,569 …); comment:code ratio 0.93-0.97 in the two biggest services; 1,958 "story N.N" references in `src`; 76 unit files / 1,758 `it(` blocks, all mocking Prisma; 65 e2e specs / 542 tests / 13-15 min; 195 source files without a sibling test (all 69 route handlers, `proxy.ts`, `auth.config.ts`); 0 `any` / `@ts-ignore` / `eslint-disable`; ESLint 0 errors; i18n 1,662 = 1,662 keys; 55 migrations, 10 destructive; 31 packages behind, 8 with a new major; Node 22 in CI vs 24 locally vs `@types/node ^20`, no `engines`.

**Architecture.** A1 (High) API-first for writes only; A2 response schemas are documentation only (52 exported `*Dto` types imported nowhere; `registry.test.ts` is a hand list that misses 7 paths and cannot catch a new unregistered route); A3 no shared `apiFetch` (62 fetch calls, 49 without try/catch, busy flags stuck on network failure, booking error mapping copied 3× and diverged); A4 adjustments without idempotency key; A5 giant client components built from copied boilerplate (`useDebouncedCallback` ×5, filter-panel block ×3, pager ×6, `closeSheet` ×13, 10 desktop/phone twin handlers, `useMemo` 0×); A6 pages hand-serialize DTOs (two byte-identical 15-line blocks); A7 Italian identifiers (`ScadenzeConsole`, `ScadenzeWidget`) despite the English-code rule; A9 zod + zod-to-openapi shipped to the browser on the login page (293 KB chunk).

**OpenAPI drift (sub-audit).** 96/97 operations registered, 0 stale. Drift: `POST /transactions` documents a required `Idempotency-Key` as optional; 413 undocumented on 39 body routes (the error helper cannot express it); `GET /people/{id}/account` 404 missing; phantom 404 on set-password; stale `PUT /people/{id}/instructor-rates` in a description; `Idempotency-Replayed`/`Content-Disposition` headers undeclared.

**i18n.** I1 (Medium) double mechanism and broken plurals; I2 export errors open as raw English JSON in a new tab (`EXPORT_TOO_LARGE` has no message key, and at load-DB volumes the flights/bookings/expiries PDFs always 422); I3 ledger descriptions persisted in mixed hard-coded languages; I4 14 orphan keys, retired-page namespaces alive as export labels, "Currency"/"Ratings" untranslated in IT (19.12 backlog); I5 money inputs formatted with two decimal separators.

**Tests and CI.** T1 (High) unpushed work and frozen `main`; T2 no DB-backed tests; T3 no coverage provider; T4 the e2e suite is the real test suite and is slow and flaky by construction (shared DB under `fullyParallel`, 10 serialized projects listed twice in config, `retries: 2` in CI, 20 `waitForTimeout`, live dependency on aviationweather.gov in a spec and in SSR); T5 Node version drift; T6 CI has no dependency scanning, no `prisma migrate diff` check, reinstalls browsers every run; T7 `npm run db:reset` does not work on the Docker setup.

**Operations.** O1 (High) no deployment story; O2 no boundaries; O3 health without DB; O4 console-only logging; O5 unbounded tables; O6 destructive migrations keyed on Italian display names (`WHERE "name" = 'Licenza'`: a renamed type silently skips the step), load DB 7 migrations behind HEAD; O7 dev-only values in committed config (`allowedDevOrigins: ['192.168.56.115']`; `.env.example` sets `NODE_ENV=development`, which breaks `next build`; `AUTH_TRUST_HOST`/`AUTH_URL` undocumented); O8 untracked agent tooling at the root that `git add -A` would commit; O9 no graceful shutdown.

**Performance.** P1 (High) METAR; P2 (High) September findings open; P3 admin overview fans out ~18 service calls per request incl. `getStats` paging all aircraft with one interactive transaction per page, no caching anywhere (the 500 observed in the walkthrough is this path timing out); P4 read-only interactive transactions on the hot lists (17.5 backlog); P5 balances recomputed over the whole ledger twice per Contabilità render; P6 missing indexes (`effectiveDate` on both ledgers, `categoryId` on `CashMovement`, `startsAt` on `Booking`); P7 alert job N+1 and rescans long-expired rows.

**Dependencies.** D1 auth on a beta (`next-auth` 5.0.0-beta.31 while npm `latest` is 4.24); D2 version lag; D3 the three `overrides` are justified and documented; D4 lint strictness is the Next default only (no type-aware rules; A3 shows they would catch real defects).

**Maintainability.** M1 comments double as a story ledger and are already stale in places (`bookings.service.ts:18-19` says Booking has "no status field yet"); M2 process artefacts outgrew readability (HANDOFF 73 KB, commit subjects up to 1,974 characters on one line, 25 open TD items); M3 42 error codes as string literals with no central union and ad-hoc UI mapping; M4 debt lives in the tracker, not in TODOs (good).

---

## 5. Cross-cutting root causes

1. **Two books, one event, linked by convention.** Top-up ↔ cash twin, payout ↔ cash twin, fee ↔ membership expiry, charge ↔ flight: each writer keeps its pair consistent, but no correction path does. BL-01, BL-04, BL-06 and the September MINOR-6 are the same defect in four coats. One "correction writer" per pair plus a nightly twin-integrity query closes the class.
2. **Rules duplicated across layers.** Currency (SQL + TS), revenue classification (3 places), medical rule (3 places), booking error messages (3 client copies), desktop vs mobile twins, confirm modals re-implemented 6 times instead of using the dialog primitive the app already has. Drift is already visible (BL-10, BL-16, A3, A-1). A parity test that feeds the same fixture to both halves is cheaper than another fix.
3. **Availability depends on things outside the process**: an external weather API on the render path, in-process PDF rendering, whole-ledger aggregates per page view, ~18 service calls and several interactive transactions per overview render, no SMTP socket timeout. None is a bug in isolation; together they make the single Node process easy to stall, by accident (the 500 seen during the audit) or on purpose.
4. **The project is in a "long dev branch" state.** 56 unpushed commits, `main` frozen for three months, four destructive migrations never run in CI, perf epic stalled after 17.1, mobile epic 18 not started so all 21 September UI findings are open, 25 open TD items. The BMAD cycle is rigorous per story; the integration cadence is not.
5. **Client code is written per surface, not per concept.** No `apiFetch`, no `useUrlFilters`, no `<Pager>`, no `ConfirmDialog`, no `MoneyInput`, label bags instead of `useTranslations`: every console re-implements fetch/error/filter/pagination/confirm and every mobile twin re-implements the desktop handler. This is the main maintainability cost and the source of the i18n plural defects and the a11y blocker.
6. **Feedback and wayfinding were never designed as a layer.** No page titles, one heading per page, focus dropped after success, 2.6 s error toasts, no loading/error/404 pages, "Annulla" for three meanings, success as a 10 px mono line. Each is small; together they are why the app is mouse-only in practice.
7. **Deployment was deferred and never scheduled.** The architecture spine promises a Dockerfile and compose; neither exists, and the expiry-alert cron the product depends on is not configured anywhere.

---

## 6. Recommended plan

**This week (small, high value, no PO decision needed).**
1. Upgrade `next` → 16.4.4, `next-auth` → beta.32, `zod` → 4.6.7, `prisma` → 7.10.1; plan `nodemailer` 10 separately (major). Wrap `getToken` in try/catch in `proxy.ts` meanwhile. Re-run gates + e2e arbiter. (S-1)
2. Fix the `callbackUrl` guard with the origin-parse approach and unit cases. (S-2)
3. Refuse reversal of a cash movement with `instructorPayoutId`; mark it non-actionable. (BL-01)
4. `AbortSignal.timeout` + in-flight dedup on METAR; `Suspense` around the weather card. (S-4/P1, closes TD 19.7b-e)
5. Push `dev`, let CI run, decide what to do with PR #22. (T1)
6. Add `Origin`/`Content-Type` checks to `apiRoute`; cap the profile PUT body; lock the forgot-password throttle. (S-13, S-9, S-8)
7. Add `Idempotency-Key` + try/finally to the billing-console adjustment path. (A4)
8. A `ConfirmDialog` primitive on `focus-trap.ts`, used by the 6 confirm sites. (A-1)
9. `error.tsx`, `not-found.tsx`, `loading.tsx` under `[locale]/dashboard`; per-page `generateMetadata`; `.card-title` as `<h2>`; focus to the status message after success; error toasts until dismissed; a `--link` token. (PERF-1, A-2…A-5, A-7)
10. Flight form: no aircraft preselection, local-date default (one helper replacing the 11 UTC copies). (FORM-2, TD 16.9)

**Next sprint (needs the PO decisions in §7).**
11. Booking: reset to PENDING on owner move of an APPROVED booking; same-person instructor check; archive/deactivate impact count; pending requests as ghost blocks on the timeline. (BL-03/S-5, BL-11, BL-12, DESK-2)
12. Flights: person/instructor overlap guard; `landingAt <= now`; keep the stored rate on same-day edits. (BL-02, BL-08, BL-09)
13. Ship story 16.7 with the extended mask (`personId`, `forcedAt`, `status` restriction) and the `tokenVersion` bump on relink. (S-6, F6, F8)
14. Top-up/refund correction writer; payout correction; decide on membership refund. (BL-04, BL-01 follow-up, BL-06)
15. Export limits: lower PDF cap, per-user concurrency, localized `EXPORT_TOO_LARGE`. (S-3, I2)
16. Retention job (idempotency records, login/reset attempts, expired tokens) on the existing bearer-cron pattern; DB-aware health check. (O5, O3)
17. Indexes: `effectiveDate` on both ledgers, `(categoryId, effectiveDate)` on `CashMovement`, `startsAt` on `Booking`; one balance aggregate per request. (P5, P6)
18. Copy and forms: "Annulla" disambiguation, filtered empty states, top-up error messages, set-password dead end, person-page placeholder, Logbook route column, structured ledger descriptions. (FORM-1/4/5/6, DESK-1/3, I18N-1)

**Structural (epics).**
19. Deployment: Dockerfile (standalone) + `compose.prod.yml` (app, tuned Postgres, backup, cron for jobs) + `docs/operations/deploy.md`; pin Node in `engines`/`.nvmrc`/CI. (O1, T5)
20. Epic 17 as planned (17.2-17.8): timeline cap, aggregates in SQL, no read-only interactive transactions, server typeahead everywhere, streaming PDF.
21. Epic 18 as planned, reordered to start with the 44 px floor keyed on `(pointer: coarse)`, the mobile fold, Back-closes-sheets, navigation feedback and OS dark mode.
22. A DB-backed Vitest project for the raw-SQL services and the overlap/ledger invariants; coverage reporting; shrink the e2e matrix to flows; stub METAR in e2e. (T2, T3, T4)
23. Client foundation: `apiFetch`, `useUrlFilters`, `<Pager>`, `<FilterPanel>`, `MoneyInput`, one submit per action shared by desktop/mobile, `useTranslations` with ICU plurals, `messages={pick(...)}`. Then split the 1,000-line consoles. (A3, A5, A6, I1, FORM-9, CODE-2)
24. API completeness for the Flutter client: a GET per page read; response-schema validation in dev/test; a registry test that walks the route files. (A1, A2)
25. Comment and CSS hygiene: invariants stay, story history moves to commit messages and story files; strip story ids from OpenAPI descriptions; rename `Scadenze*` to `Expiries*`; move the 107 KB of CSS comments to git history; add `--ok-ink`/`--bad-ink` tokens. (M1, A7, CODE-1)

---

## 7. Questions for the PO (consolidated)

1. Should an owner's move of an APPROVED booking go back to PENDING, or should owners only be able to cancel? (BL-03/S-5)
2. Is "archive person" offboarding (end the login) or only hiding from lists? (S-12, BL-12)
3. How is a wrong instructor payout corrected: two-sided payout reversal or a signed correcting payout? (BL-01)
4. How is a deposit refund / mistyped top-up booked on the cash side? Recommended: one writer that moves account and cash together as DEPOSIT, never cost. (BL-04)
5. Does refunding a membership fee shorten the membership? (BL-06)
6. Should an instructor on a TOURISM flight (checkride) accrue payout, given the customer is charged the instructor fee? (BL-14)
7. Should an expired rating block only the role it is scoped to? (BL-15)
8. Pending requests drawn as non-blocking ghost blocks on the timeline? (DESK-2)
9. Aircraft preselection in "Nuova voce": intended or not? Name order per context? Glossary ("rating" vs "abilitazione", "currency", "payout")? Structured ledger descriptions (touches existing rows)? (FORM-2, I18N-1/2/3)
10. Should the 44 px touch floor key on `(pointer: coarse)` instead of `≤640px`? (T1 ratified R1)
11. Is the Flutter client still planned? It decides whether A1/A2 are blocking work or whether "API-first" should be dropped from CLAUDE.md. (A1)
12. Target hosting (VPS + Docker, or managed)? It decides O1, logging, pool sizing. (O1)
13. Are the 56 unpushed commits held back deliberately? (T1)
14. Does any non-test database exist (the PO's demo instance)? The epic-19 migrations delete its PPR/licence/cancelled-flight data on the next deploy. (O6)

---

## 8. What is good (calibration)

- Access control that holds on every route and every page, with own-checks before queries and no existence oracles.
- A ledger that is append-only, cents-only, locked, idempotent with payload fingerprints, and provably consistent on 60k flights / 105k movements.
- July security remediation that landed and stayed (throttle with advisory lock, `tokenVersion` eviction, encrypted SMTP password, body cap, security headers, loopback binds).
- A design system that reads as its own, with correct `SlideOver`/`SearchCombobox` primitives, inline validation done right, double-submit protection, 0 overflow in 209 loads, and both themes passing contrast on body text, badges and KPIs.
- Strict TypeScript with zero escape hatches, zero lint errors, an OpenAPI registry that matches 96 of 97 operations, and perfect i18n key parity.
- A documented, measured load-test harness and a tech-debt register where every item has a measure and an owner.
- Removed domains (PPR, hour meter, licence) are really gone.

---

## Appendices (same folder)

- `security.md` — authorization matrix, prior-finding status, S-1…S-18, checked-and-OK list.
- `business-logic.md` — ledger/ops prior-finding status, BL-01…BL-16, invariants, design concerns, probes.
- `ui-ux.md` — coverage table, September UI finding status, A/MOB/DESK/FORM/I18N/VIS/PERF/CODE findings, contrast table.
- `engineering.md` — measurements, A/I/T/O/P/D/M findings, September perf status.
- `openapi-drift.md` — registry vs routes (sub-audit).
- `architecture-api-first.md` — page/service/API read paths and duplication (sub-audit).
- `screenshots/` — 13 evidence captures referenced above (the full 349-image set and raw JSON measurements live in the session scratchpad and are not kept).
