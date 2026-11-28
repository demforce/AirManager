# AirManager — Engineering health audit (code quality, CI, operations, performance)

**Date**: 2026-11-02 · **Code judged**: `dev` @ `a598b26` (HEAD; uncommitted story 19.8 WIP excluded) · **Method**: read-only. Static analysis on a `git archive HEAD` snapshot, `tsc`/`eslint` with extra flags (no build info written), read-only `EXPLAIN ANALYZE` on `airmanager_load`, `gh run list`, two read-only sub-audits (OpenAPI drift; API-first and duplication) whose claims were spot-checked. Every finding is tagged **VERIFIED** (evidence read or measured) or **SUSPECTED**.

## 1. Executive summary

AirManager is unusually disciplined at the type level. Strict TypeScript has zero `any`, `@ts-ignore` or `eslint-disable` in production code. ESLint reports 0 errors on 424 files, and the OpenAPI registry matches the real routes almost exactly. The weaknesses sit around the code rather than in it:

- **Nothing is deployable.** There is no Dockerfile, no production configuration, no backup, no error boundaries and a health check that never touches the DB.
- **Work is not reaching CI or `main`.** 56 commits exist only on this machine, and `main` has not moved since 2026-07-27.
- **The 2026-09-10 performance findings are almost all still open.** Epic 17 completed only 17.1.
- **"API-first" holds only for writes.** Pages read through services, and 21 page-read functions have no API route.
- **Client i18n runs on two mechanisms at once.** The full catalog ships on every page, while 75 hand-rolled `.replace('{x}')` calls bypass ICU, which breaks plurals.

**Counts by severity**: High 5 · Medium 21 · Low 16 · Info 4.

## 2. Measurements

| Metric | Value | Source |
|---|---|---|
| Production TS/TSX (non-test) | 50,201 lines in ~280 files | `git ls-files src` + `wc` |
| TSX in pages and components | 26,071 lines | same |
| Unit test files / lines / `it(` blocks | 76 / 24,590 / 1,758 (HANDOFF reports 1,956 tests incl. `.each`) | same |
| E2E specs / lines / `test(` | 65 / 28,549 / 542 (arbiter counts 555) | `e2e/` |
| E2E full-suite wall time | 13–15 min locally; CI 9.5–22.8 min (timeout 40) | HANDOFF:369,404; `gh run list` |
| API route files / exported methods | 70 v1 + Auth.js; 93 methods (97 path+method ops) | OpenAPI sub-audit |
| Registered OpenAPI ops / stale / missing | 96 / 0 / 1 (`GET /openapi.json` itself) | OpenAPI sub-audit |
| Services (`*.service.ts`) | 24 + helpers | `src/server/services` |
| `'use client'` files / with `fetch` / fetch calls | 58 / 26 / 62 (49 without try/catch) | arch sub-audit |
| Files > 1,000 lines | 10 (registry.ts 1,906; flights.service 1,641; billing-console 1,598; bookings.service 1,569; pilot-editor 1,386; flight-editor 1,167; dashboard/page 1,160; logbook-console 1,102; aircraft-editor 1,093; scadenze-console 1,010) | `wc -l` |
| Comment : code line ratio | 0.39 overall; 0.93–0.97 in bookings.service, flights.service, schemas/people | awk over HEAD |
| "story N.N" refs in `src` / incl. AC, R-, review F, TD tokens | 1,958 / 2,511 | `git grep -o` |
| TODO / FIXME / HACK | 0 | `git grep` |
| `any` / `@ts-ignore` / `eslint-disable` (prod) | 0 / 0 / 0 | `git grep` |
| ESLint (src + e2e) | 0 errors, 6 warnings | `npx eslint -f json` |
| `tsc --noUnusedLocals --noUnusedParameters` | 8 errors (5 in e2e) | `npx tsc --incremental false` |
| i18n keys IT / EN / missing / empty | 1,662 / 1,662 / 0 / 0 | key diff of HEAD catalogs |
| ICU plurals in catalog / `t.raw(` / hand `.replace('{x}')` | 9 / 82 / 75 | `grep` |
| Prisma migrations / with DROP/DELETE/type rewrite | 55 / 10 | `prisma/migrations` |
| Raw SQL call sites (`$queryRaw` etc.) | 40 in 11 files (expiries 15, flights 8, bookings 7) | `git grep` |
| Interactive `$transaction` / read-only among them | 35 / 6 | paren-matching script |
| `findMany`/`groupBy` without `take` (not id-bounded, not paginated) | 9 genuinely unbounded | script + manual review |
| Unit coverage | none: no `@vitest/coverage-*`, `coverage/` empty | `package.json`, `ls` |
| Source files without sibling unit test | 195 (incl. 69 route handlers, `proxy.ts`, auth config, `prisma.ts`) | script |
| `npm outdated` | 31 packages behind; 8 with a new major | `npm outdated` |
| Node: CI / local / `@types/node` / `engines` | 22 / 24.15.0 / ^20 / absent | ci.yml, `node -v`, package.json |
| Unpushed commits on `dev` / `main` behind local `dev` | 56 / 232 (PR #22 open since 2026-08-07) | `git log origin/dev..dev` |
| Last CI run | 2026-10-26 (green) | `gh run list` |
| Load DB `airmanager_load` migration head | `20260807074113` (7 migrations behind HEAD) | `_prisma_migrations` |

## 3. Findings

Format: **ID · Severity · VERIFIED/SUSPECTED · Title**, then location, evidence, impact and fix.

### 3.1 Architecture and conventions

**A1 · High · VERIFIED · "API-first" is true for writes only, and some roles cannot reach their data through the API**
- *Where*: 13 of 14 `dashboard/**/page.tsx` import `@/server/services/*` directly (47 import lines). No page fetches `/api/v1` for data: all 17 references are export links.
- *Evidence*:
  - 21 of the 46 service functions pages read have no route. Examples: `listBookableAircraft` (`bookings.service.ts:1480`), `listActiveInstructors` (`:1514`), `getFlightTotals`, `getExpiryTierCounts`, `listCurrencyByPerson`, `getBillingSummary`, an instructor's own compensation (`instructor-compensation.service.ts:325`).
  - `GET /aircraft` needs `aircraft.manage` (`aircraft.service.ts:119`). The booking form says so itself: "a pilot or an instructor cannot call the …" (`new-booking-form.tsx:266`).
  - `settings/treasury` is PUT-only.
- *Why it matters*: the stated reason for the REST layer is a future Flutter client. Today a mobile pilot could not fill in a booking form or see their own logbook totals through the API.
- *Fix*: for each page read, add a GET route over the same service function, scoped to the caller. Add a test that maps every page-level service import to a route.

**A2 · Medium · VERIFIED · Response schemas are documentation only; nothing ties them to what services return**
- *Evidence*:
  - `apiRoute` has no response schema, and no test parses a response with one (`handler.ts:494` returns the raw service result).
  - 52 exported `*Dto` types in `src/lib/schemas/*` are imported nowhere (e.g. `NegativeBalanceItemDto`, `BookingListResponseDto`, `FlightListResponseDto`). Services return hand-declared types instead.
  - `registry.test.ts:19-93` is a hand list of 66 paths with no methods. It misses 7 registered paths and would not notice a new unregistered `route.ts`; story 12.11 once shipped 9 unregistered routes (`registry.ts:303-305`).
  - The OpenAPI sub-audit found little drift today: 0 stale entries, 0 parameter mismatches, field parity on 10 sampled routes. The remaining drift: `POST /transactions` documents its **required** `Idempotency-Key` as optional (route `transactions/route.ts:30-33` vs `registry.ts:903`), 413 `PAYLOAD_TOO_LARGE` cannot be documented on 39 body routes (`registry.ts:334` allows only 401/403/404/409/422), and 404 is missing on `GET /people/{id}/account` (`registry.ts:579`). Low ones: `membership-fee` 409, a phantom 404 on `set-password`, and a stale reference in the `instructor-compensation` description (`registry.ts:1816`).
- *Fix*: type each service's return as `z.infer` of its registered schema. Validate responses in dev and test. Make the registry test walk `src/app/api/v1/**/route.ts` and compare path+method.

**A3 · Medium · VERIFIED · No shared client fetch helper, so error handling is copied and often missing**
- *Evidence*:
  - 62 `fetch` calls in 26 client files, 49 without try/catch in the enclosing function, 1 `finally` in all UI code.
  - The shared `parseApiError` (`src/lib/api-field-errors.ts:31`) is used in 10 of 26 files.
  - `errorCodeOf` exists twice (`pilot-editor.tsx:128`, `aircraft-editor.tsx:207`). The booking error-code→message mapping exists 3 times and has diverged (`new-booking-form.tsx:365`, `edit-booking-form.tsx:190`, `booking-transition.ts:49`; the last lacks the "out of service until" wording).
  - Busy flags stay set on a network failure (`billing-console.tsx:414`, `smtp-card.tsx:71`, `aircraft-editor.tsx:769`, `logbook-console.tsx:490`).
- *Fix*: one `apiFetch()` returning `{ok, data, error: ParsedApiError}` plus a per-domain code→label map. Add type-aware lint (`no-floating-promises`).

**A4 · Medium · VERIFIED · Money-path write without an idempotency key or failure handling**
- *Where*: `billing-console.tsx:414-424` `postAdjust` posts to `/people/{id}/account/adjustments` without `Idempotency-Key` and without try/finally. `account-section.tsx:752` calls the same endpoint with both. Idempotency on this route is opt-in (`adjustments/route.ts:7-10`).
- *Why it matters*: a retried or double-submitted adjustment can be booked twice (SUSPECTED consequence). A network error leaves `adjustSubmitting` stuck at `true`.
- *Fix*: use `useIdempotencyKey` and try/finally, as `transaction-editor.tsx:109` already does.

**A5 · Medium · VERIFIED · Giant client components built from copied boilerplate**

| File | lines | useState | useEffect | fetch | main body |
|---|---|---|---|---|---|
| billing-console.tsx | 1,598 | 28 | 2 | 3 | 1,347 |
| pilot-editor.tsx | 1,386 | 26 | 4 | 6 | 10 components |
| flight-editor.tsx | 1,167 | 22 | 0 | 5 | 876 |
| dashboard/page.tsx (server) | 1,160 | – | – | 0 | `renderAdminOverview` 508 |
| logbook-console.tsx | 1,102 | 11 | 2 | 1 | 887 |
| aircraft-editor.tsx | 1,093 | 19 | 2 | 6 | 5 components |
| scadenze-console.tsx | 1,010 | 14 | 1 | 3 | 594 |

- *Duplicated*:
  - `useDebouncedCallback` ×5 (3 byte-identical: billing:81, logbook:68, scadenze:60).
  - The filter-panel block (build query / navigate / reset / apply) ×3: `billing:326-690`, `logbook:281-471`, `scadenze:260-326`.
  - `pageHref` ×7, pager markup ×6, `closeSheet` ×13, the `Section` component ×3, `ArchiveSection` ×2.
  - 10 desktop/phone twin handlers, e.g. `submitAdjust` vs `submitSheetAdjust` at `billing-console.tsx:426/579`. The "deny with reason" flow exists 3 times with 3 different error behaviors (`bookings-table.tsx:306`, `:348`, `mobile-pending-bookings.tsx:141`).
  - 16 client files exceed 400 lines. `useMemo` is used 0 times in these files.
- *Fix*: `useUrlFilters()`, `<Pager>`, `<FilterPanel>`, and one submit function per action shared by the desktop and phone paths. Split `renderAdminOverview` into per-widget server components.

**A6 · Medium · VERIFIED · Pages re-serialize service data by hand, duplicating the API's wire shape**
- *Evidence*:
  - `dashboard/page.tsx:380-395` and `bookings/page.tsx:388-403` are byte-identical apart from one variable name.
  - `bookings-table.tsx:35-55` re-declares `BookingStatusDto`/`BookingRowDto`, which already exist in `schemas/bookings.ts:92-164`.
  - `logbook/page.tsx:155-162` converts Dates to strings by hand.
  - Option lists `{id, firstName, lastName}` are mapped 6 times across 5 pages.
- *Fix*: one mapper per resource in `src/lib`, used by both the route and the page.

**A7 · Low · VERIFIED · Italian identifiers despite the "code in English" rule**
- *Where*: `expiries/scadenze-console.tsx` and `components/dashboard/scadenze-widget.tsx`, exporting `ScadenzeConsole`, `ScadenzeFilters`, `ScadenzeConsoleLabels`, `ScadenzeConsoleProps`, `ScadenzeWidget`, `ScadenzeWidgetLabels`, `ScadenzeWidgetProps`. The `scadenzeWidget` i18n namespace is used 15 times.
- Comments mix in Italian domain words ("motivo", "saldo residuo dovuto", "allievo", "Contesto", "ratifica").
- *Fix*: rename to `Expiries*` in one mechanical commit.

**A8 · Low · VERIFIED · Small dead code**
- `previousMonthRange` (`period-presets.ts`) is unused.
- `currentQuarterRange`, `currentYearRange`, `getCurrencyStatus` and `getMembershipStatus` are referenced only by their own tests.
- `flights.service.ts:19` imports `ExpiredDocument` without using it. `tsc --noUnusedLocals` finds 8 cases in total.
- Removed domains are clean: no PPR, hour-meter or licence-expiry code survives outside tests. One deliberate exception: `/ppr` stays public in `proxy.ts:13` so anonymous visitors get a 404 (Info).

**A9 · Low · VERIFIED · Login and form pages ship Zod plus zod-to-openapi to the browser**
- *Where*: 5 client files import runtime schemas from OpenAPI-registered modules (e.g. `login-form.tsx` → `schemas/login`), which run `extendZodWithOpenApi` at import.
- *Evidence*: the current build (today's, includes WIP) gives the login page a 293 KB chunk with 499 Zod and 11 `openapi` markers (`.next/static/chunks/3earavxxbd0nq.js`). The page's client-reference chunks total 448 KB.
- *Fix*: keep form schemas in modules that do not import `zod-with-openapi`, or use `zod/mini` on the client.

### 3.2 i18n

**I1 · Medium · VERIFIED · Two client i18n mechanisms at once: the full catalog ships everywhere, yet ICU is bypassed**
- *Evidence*:
  - `NextIntlClientProvider` has no `messages` prop (`[locale]/layout.tsx:93`). In next-intl 4.13.1 it then inherits **all** messages (`NextIntlClientProviderServer.js`: `messages: void 0===v ? await getMessages() : v`), roughly 80 KB of JSON per locale in every page's RSC payload.
  - Only 5 of 58 client files use `useTranslations`. The rest receive label bags built with `t.raw` (82 calls) and format by hand with `.replace('{count}', …)` (75 sites, e.g. `schedule.tsx:710`, `bookings-table.tsx:557`).
  - The catalog holds 9 ICU plurals. 38 EN messages take a numeric placeholder without `plural`, e.g. `"{count} bookings"` and `"{count} movements"`, which render "1 bookings". 8 keys hand-roll `…One`/`…Many` pairs (`aircraft-editor.tsx:921` `countText`).
- *Why it matters*: payload is paid twice (catalog plus label props), plurals break in both languages, and number formatting in messages is never localized.
- *Fix*: pick one approach. Either `useTranslations` in client components with ICU messages, or pass `messages={pick(...)}` and stop sending label bags.

**I2 · Medium · VERIFIED · Export errors open as raw English JSON in a new tab**
- *Where*: `components/ui/export-menu.tsx:67,85` uses plain `<a href target="_blank">`.
- *Evidence*: `EXPORT_TOO_LARGE` (`exports.service.ts:75`) has no message key anywhere. At load-DB volumes, the flights, bookings and expiries PDFs always answer 422 (perf F5). The user then sees `{"error":{"code":"EXPORT_TOO_LARGE",…}}`.
- *Fix*: run a HEAD or count pre-check before following the link, or fetch as a blob with a localized error.

**I3 · Low · VERIFIED · Ledger descriptions are persisted in hard-coded, mixed languages**
- `flights.service.ts:1023` writes "Volo" / "Volo senza addebito", and `membership.service.ts:137` writes "Quota associativa {year}" (Italian).
- `instructor-compensation.service.ts:501` writes "Instructor payout …" (English).
- These strings are frozen in `AccountMovement`/`CashMovement` rows and shown on statements and exports in both UI languages.
- *Fix*: store a type plus parameters and render the label at read time.

**I4 · Low · VERIFIED · Catalog hygiene**
- Key parity is perfect: 1,662 = 1,662, no empty values, no Italian found in `en.json`.
- 14 keys have a leaf name that appears nowhere in the code, e.g. `FinancePage.cashRegister.newMovement`, `PersonDetailPage.accountPanel.viewStatement`, `CashReportPage.openInRegister`.
- Namespaces of retired pages (`FinancePage`, `CashReportPage`, `FlightsPage`, `AccountStatementPage`) live on only as export column labels (`exports.service.ts:342,558`).
- 33 values are identical in IT and EN, mostly legitimate ("Email"). The IT UI also says "Currency" and "Ratings" (story 19.12 is in the backlog).

**I5 · Low · VERIFIED · Editable money text uses two decimal separators regardless of locale**
- `(cents/100).toFixed(2).replace('.', ',')` appears in `aircraft-editor.tsx:226`, `instructor-editor.tsx:231` and `instructors-console.tsx:469`.
- A plain `.toFixed(2)` appears in `club-card.tsx:51`, `treasury-card.tsx:40-41` and `scadenze-console.tsx:887`.
- `parseCents` accepts both, so there is no data bug, only inconsistency.

**I6 · Info · VERIFIED · Known and tracked**
- Server-side `Intl.DateTimeFormat` without `timeZone` on billing and reports, plus 5 client UTC copies of `todayDateOnly` (TD 16.1-b/c, story 16.9 ready-for-dev). Between 00:00 and 02:00 Rome time, forms default to yesterday.

### 3.3 Tests and CI

**T1 · High · VERIFIED · Recent work is neither in CI nor in `main`, and 56 commits exist on one disk only**
- *Evidence*:
  - `dev` is ahead of `origin/dev` by 56 commits (all of epic 19 since 2026-11-01).
  - The last CI run was 2026-10-26.
  - `origin/main` was last updated 2026-07-27 and is 232 commits behind local `dev`.
  - PR #22 (`dev`→`main`) has been open since 2026-08-07.
- *Why it matters*: four destructive migrations and a dozen domain changes have never run in clean-room CI. A disk failure loses two days of work. The "main = stable" model has frozen.
- *Fix*: push `dev` at every story close (the CLAUDE.md cycle already implies it) and merge or close PR #22.

**T2 · Medium · VERIFIED · No DB-backed tests: raw SQL is "unit tested" by matching its text**
- *Evidence*:
  - All 76 unit files mock `@/server/db/prisma`. Even `flights-expiry-boundary.integration.test.ts` mocks it (line 23).
  - The 40 raw-SQL sites are asserted with regexes over the SQL string, e.g. `expiries.service.test.ts:261-310` checks `'currency:' || s."id"` and `COUNT(*) OVER ()`.
  - The SQL twin of `computeCurrency` (19.7b) is proved correct only by e2e.
- *Why it matters*: these tests fail on harmless refactors and pass on semantic bugs. The only real check of the SQL is the 15-minute shared-DB e2e suite.
- *Fix*: a Vitest project against a throwaway Postgres schema (`CREATE SCHEMA test_<pid>`, `migrate deploy`) for the raw-SQL services, starting with the expiries registry, currency, ledger balances and the booking overlap checks.

**T3 · Medium · VERIFIED · No coverage measurement; whole layers have no unit tests**
- No coverage provider is installed, and `coverage/` is empty.
- 195 source files have no sibling test, including all 69 route handlers (e2e only), `proxy.ts` (the auth gate), `auth.config.ts`, `session.ts`, `prisma.ts`, `smtp-test-email.service.ts` and `aircraft-status.ts`.
- *Fix*: add `@vitest/coverage-v8` and report (not gate) per-directory coverage in CI. Unit-test `proxy.ts` path classification.

**T4 · Medium · VERIFIED · The e2e suite is the real test suite, and it is slow and flaky by construction**
- *Size*: 542 `test()` and 28.5k lines, more than all the UI TSX it covers. Wall time is 13–15 min locally.
- *Shared state*: one shared DB under `fullyParallel`. 10 serialized projects are listed twice in `playwright.config.ts` (in `testIgnore` and as the `projects` chain), and one red test in the main project skips all ten.
- *Flakes*: CI `retries: 2` hides them. HANDOFF documents ≥6 flaky classes: login-timeout, page-1 saturation, METAR upstream, the shared seed pilot, the brute-force lock (TD-6), registration collisions.
- *External dependencies*: 20 `waitForTimeout`, and a live dependency on aviationweather.gov both in `mobile-metar.spec.ts` and in the app's SSR (P1).
- *Fix*: move rule matrices down into DB-backed integration tests (T2) and keep e2e for flows. Generate `testIgnore` from the chain. Stub METAR in e2e.

**T5 · Low · VERIFIED · Node version drift**
- CI uses `node-version: 22` (`ci.yml:29,92`), the dev machine runs 24.15.0, `@types/node` is `^20`, and there is no `engines` field or `.nvmrc`.
- *Fix*: pin one major in `engines` and `.nvmrc`, and use it in CI.

**T6 · Low · VERIFIED · CI gaps**
- No dependency scanning (no Dependabot, no `npm audit` step).
- No schema↔migration drift check (`prisma migrate diff --exit-code`).
- Playwright browsers are re-installed on every run.
- The comment at `ci.yml:104` says the config "starts the dev server". Under `CI` it builds and starts production (`playwright.config.ts` `webServer.command`).

**T7 · Low · VERIFIED · `npm run db:reset` does not work on the Docker setup**
- `scripts/reset-db.sh:21-22` runs `sudo -u postgres psql/createdb`, which exists only in the remote container. On the compose setup `psql` lives inside the Postgres container (HANDOFF "Ciclo per story" recipe).
- The documented reset path is a hand recipe.

### 3.4 Operations and deployability

**O1 · High · VERIFIED · There is no production deployment story**
- *Missing*: no Dockerfile or `.dockerignore`, no production compose, no `output: 'standalone'` in `next.config.ts`, no reverse-proxy or TLS doc, no Postgres backup or restore, no migration runbook, no scheduler for `POST /api/v1/jobs/expiry-alerts` (it requires an external cron that nothing configures).
- HSTS is explicitly delegated to a proxy that does not exist (`next.config.ts:36-38`).
- The architecture spine says "il seed produce Dockerfile + docker-compose" (`ARCHITECTURE-SPINE.md:236`), but neither exists. Production is "deferred" (`:206,236-239`), and README covers development only.
- *Why it matters*: the expiry alerts never fire without a cron, and the first deploy will be improvised.
- *Fix*: Dockerfile (standalone) + `compose.prod.yml` (app, Postgres with the tuned parameters, backup sidecar or `pg_dump` cron, cron for jobs) + `docs/operations/deploy.md`.

**O2 · Medium · VERIFIED · No error, not-found or loading boundaries anywhere**
- 0 `error.tsx`, 0 `global-error.tsx`, 0 `not-found.tsx`, 0 `loading.tsx` and 0 `Suspense` across 18 pages.
- Any SSR failure (P2028 under load, a hung METAR) shows Next's default unstyled English error page.
- Heavy pages (Panoramica, Contabilità) give no navigation feedback.
- *Fix*: a localized `error.tsx`/`not-found.tsx` under `[locale]`, a `global-error.tsx`, and `loading.tsx` on the heavy routes.

**O3 · Medium · VERIFIED · The health endpoint does not check the DB**
- `api/v1/health/route.ts:11-14` returns `{status:'ok'}` with no DB call ("a richer version … is out of scope").
- A dead DB or an exhausted pool still reports healthy.
- *Fix*: `SELECT 1` with a short timeout and 503 on failure. Optionally split liveness from readiness.

**O4 · Medium · VERIFIED · Logging is console only, with no correlation**
- 22 `console.*` calls (5 in app-settings.service, 3 each in aircraft and accounts).
- Unhandled API errors go through one `console.error` (`handler.ts:75`). There is no request id, no levels, no structured output, and no metrics.
- SSR page errors are not logged by app code at all.
- *Fix*: a small JSON logger (pino) with a request id set in `proxy.ts` and propagated, used by `handler.ts` and the jobs.

**O5 · Medium · VERIFIED · Unbounded growth tables with no retention**
- `IdempotencyRecord` stores the full `responseBody` JSON. Rows are deleted only on a failed request (`handler.ts:276`), and the table has only the unique index.
- `LoginAttempt` failures are cleared only for the identifier that later succeeds (`login-throttle.ts:133`), so sprayed unknown identifiers accumulate forever.
- `PasswordResetAttempt` and expired `AuthToken` rows are never cleaned.
- *Fix*: a daily cleanup job (same bearer-cron pattern as expiry alerts) with documented TTLs, plus a `createdAt` index on `IdempotencyRecord`.

**O6 · Medium · VERIFIED · The destructive migration chain depends on display names; the load DB is stale**
- 10 of 55 migrations drop or delete. Epic 19 alone deletes:
  - `PprRequest`, `PprCounter` and the PPR cash movements (`20261101193941`);
  - 5 Aircraft columns, 3 Flight columns, `Person.fiscalCode` and `HourMeterAdjustment` (`20261101223000`);
  - `PackageConsumption`, every cancelled `Flight` and their `AccountMovement` rows (`20261102180000`);
  - every "Licenza" expiry (`20261102200100`).
- All of this is ratified (R-19-a: test data only), and that is acceptable before go-live.
- The data steps select rows by **Italian display name**: `WHERE "name" = 'Licenza'`, `'Quota associativa'`, `'PPR'`. On a DB where an admin renamed a type or category they silently do nothing, and a later step can then fail (e.g. the enum recast) or leave orphans.
- `airmanager_load` stops at `20260807074113`, 7 migrations behind, so the epic-17 perf harness cannot run current code unchanged.
- *Fix*: record in CLAUDE.md that the history is destructive and pre-production-only, and squash it into a baseline before go-live. Key data migrations on stable identifiers (`kind`, seeded ids). Re-seed the load DB on HEAD before 17.2.

**O7 · Low · VERIFIED · Dev-only settings live in committed config**
- `next.config.ts:25` hard-codes `allowedDevOrigins: ['192.168.56.115']`. The local `.env` points `APP_URL`/`AUTH_URL` at the same LAN IP.
- `.env.example` sets `NODE_ENV="development"`, which breaks `next build` (`scripts/gates.sh:29-30` works around it with `env -u NODE_ENV`), a trap for anyone deploying from the example.
- `AUTH_TRUST_HOST`/`AUTH_URL`, required behind a proxy (CI sets the first), are absent from `.env.example` and from the env schema.
- *Fix*: read the dev origin from an env var, drop `NODE_ENV` from the example, and document the Auth.js host variables.

**O8 · Low · VERIFIED · Untracked agent tooling at the repo root is not ignored**
- `.agents/`, `.github/hooks/impeccable.json` (a Copilot hook that runs `.github/skills/impeccable/scripts/hook.mjs` after every edit), `.github/skills/`, `skills-lock.json`, an empty `q.txt`, and 7 skill folders under `.claude/skills/`.
- A `git add -A` would commit them, and HANDOFF records a past accidental commit of exactly this kind.
- Generated artifacts are correctly ignored: `coverage/`, `test-results/`, `tsconfig.tsbuildinfo`, `ds-bundle/`, `CLAUDE-SECURITY-*` (via its own `.gitignore`).

**O9 · Info · SUSPECTED · No graceful shutdown**
- No SIGTERM handler or `$disconnect` anywhere.
- Each `next start` opens up to 2 × `DATABASE_POOL_MAX` connections (documented in `prisma.ts:22-31`). In-flight requests are cut on redeploy.

### 3.5 Performance

**P1 · High · VERIFIED · The METAR upstream call has no timeout and sits on the critical render path of every landing page**
- `metar.service.ts:111` calls `fetch(...)` with no `signal` or `AbortSignal.timeout`.
- It is awaited inside the `Promise.all` of the admin, instructor and pilot landings (`dashboard/page.tsx:229,308,874,1022`).
- Measured by story 19.7b at ~16 s on an unknown station (TD 19.7b-e, "alta"), and still open.
- *Fix*: `AbortSignal.timeout(2000)` plus a cached failure, or render the METAR card in a `Suspense` boundary so it streams.

**P2 · High · VERIFIED · The 2026-09-10 load findings are still open (see §4)**
- Epic 17 delivered 17.1 only; 17.2–17.8 are backlog.
- The pages that failed at 10 concurrent admins (Panoramica, Statistiche, Contabilità) have the same code shape today.

**P3 · Medium · VERIFIED · The admin overview fans out about 18 service calls per request, with no caching**
- `dashboard/page.tsx:258-310`: 2 sequential list reads, then 16 parallel calls.
- They include `getStats(month)`, which itself pages through all aircraft with one interactive transaction per page (`stats.service.ts:126-133`, about 15 transactions at 1,500 aircraft), plus `listNegativeBalances` and 3 separate settings reads.
- No `unstable_cache` or `'use cache'` exists in the codebase.
- *Fix*: slim aggregates for the widgets, one settings read, and caching of settings and static lookups.

**P4 · Medium · VERIFIED · Read-only interactive transactions on every hot list endpoint**
- `people.service.ts:227`, `flights.service.ts:1573`, `aircraft.service.ts:137`, `cash.service.ts:501` and `accounts.service.ts:181,385` wrap `findMany + count` in `$transaction(async tx => …)`.
- Each holds a pool connection for the duration and produces `P2028` under bursts. `listBookings` already uses the batch form (`bookings.service.ts:836`), and `listExpiries` moved to `COUNT(*) OVER ()` in 19.7b, so the codebase is inconsistent with itself (17.5 backlog).

**P5 · Medium · VERIFIED · Balances are recomputed from the whole ledger, twice per Contabilità render**
- `listNegativeBalances` (`accounts.service.ts:758`) and `computeDeposits` (`billing-summary.service.ts:130`) each run `GROUP BY accountId` over all of `AccountMovement`.
- `EXPLAIN ANALYZE` on the load DB: Seq Scan of 104,612 rows, **118–203 ms** each (HAVING variant 167–172 ms).
- Contabilità runs both, and Panoramica runs the first.
- *Fix*: one aggregate per request shared by both, then a maintained balance (column or materialized view) once 17.3 lands.

**P6 · Medium · VERIFIED · Missing indexes for the hot filters**

| Query shape | Index today | Load-DB measurement |
|---|---|---|
| `AccountMovement` by `effectiveDate` (monthly revenue, transactions, cost) | only `accountId` (`schema.prisma:626`) | 1 month: Parallel Seq Scan, **41–117 ms**; 12 single-month queries vs one `GROUP BY month`: **123–149 ms** total |
| `CashMovement` by `categoryId` / `effectiveDate` | **none** besides unique twin keys (`schema.prisma:652-700`) | count by category: Seq Scan **19–64 ms** on 31k rows |
| Calendar `Booking` (`status`, `startsAt < to`, `endsAt > from`, all aircraft) | `(aircraftId, startsAt)` only | Seq Scan **18–42 ms** on 40k, grows forever |
| Person-overlap `Booking` by `personId` + time | `personId` | Bitmap index, **0.1–1.7 ms** (fine) |
| Currency query (`Flight` by person, rank by date) | `personId`, `flightDate` | about 20 ms for 20 people (fine) |

- *Fix*: `@@index([effectiveDate])` on both ledgers, `@@index([categoryId, effectiveDate])` on `CashMovement`, `@@index([startsAt])` (or partial on `APPROVED`) on `Booking`. Story 19.11 already plans `(accountId, effectiveDate, createdAt, id)`.

**P7 · Low · VERIFIED · The expiry-alert job is N+1 and rescans long-expired rows**
- `expiry-alerts.service.ts:113` selects every expiry with `expiresAt <= horizon`, which includes all long-expired rows.
- Per candidate it then does `createMany`, a `user.findUnique` (`:159`) and a sequential email.
- Story 17.8 is in the backlog.

### 3.6 Dependencies and tooling

**D1 · Medium · VERIFIED · Authentication runs on a beta**
- `next-auth` is pinned at `5.0.0-beta.31`, and the npm `latest` tag is still 4.24.15.
- Every login, session and JWT check depends on an API that can still change.
- *Fix*: track v5 GA and record the decision and its upgrade path. The custom `jwt-active-check`/`login-throttle` layer keeps the surface small.

**D2 · Low · VERIFIED (audit not run) · Version lag**
- 31 packages are behind. New majors are available for TypeScript 7, Vitest 5, ESLint 10, nodemailer 10, zod-to-openapi 9, `@hookform/resolvers` 7, dotenv 18, and Prisma 8 (rc).
- Minor and patch lag: next 16.2.10→16.4.4, Prisma 7.8→7.10.1, Playwright 1.61→1.64, React 19.2.7→19.3.1, zod 4.4→4.6.
- `npm ls` is clean. `npm audit` timed out against the registry, so vulnerability status is **not verified**.

**D3 · Info · VERIFIED · The `overrides` are justified**
- `docs/superpowers/plans/2026-07-14-deps-vuln-cleanup.md` explains all three: `$nodemailer` aligns the Auth.js peer, `uuid@^11` replaces deprecated uuid 8 under exceljs, and `@hono/node-server` fixes a CVE under `@prisma/dev`.

**D4 · Low · VERIFIED · Lint strictness is the Next default only**
- `eslint.config.mjs` adds only a zod-import restriction. There are no type-aware rules (`no-floating-promises`, `no-misused-promises`), which A3 shows would catch real defects.
- `tsconfig` is `strict` but lacks `noUncheckedIndexedAccess`. Target ES2017 needs the `src/lib/money.d.ts` shim for `useGrouping: 'always'`.
- Results are excellent regardless: 0 lint errors, 0 suppressions, 0 `any`.

### 3.7 Maintainability and process

**M1 · Medium · VERIFIED · Comments double as a story ledger and go stale**
- *Evidence*:
  - 1,958 "story N.N" references and 2,511 process tokens (AC, R-, review F, TD, ratifica) in `src`.
  - 34 doc blocks run 30 lines or more. `bookings.service.ts:17` is 121 lines, `flights.service.ts:25` 89, `:507` 86.
  - The OpenAPI descriptions, which are the public contract a Flutter team would read, carry 260 story/AC references.
- *Stale examples*: `bookings.service.ts:18-19` says Booking has "no status/cancellation field yet", but `schema.prisma:1062-1066` has `status` and `cancelledAt`. `:31` says self-bookings with an instructor are "created by staff", but STAFF was removed in 14.9 and R-19-l now forbids pilot+instructor bookings.
- *Why it matters*: the reader cannot tell current invariants from history, and the history is already wrong in places.
- *Fix*: keep invariants and why-comments in code, and move "story X decided Y" to commit messages and story files. Strip story ids from OpenAPI descriptions.

**M2 · Low · VERIFIED · Process artifacts have outgrown readability**
- HANDOFF.md is 73 KB in 498 lines. CLAUDE.md is 15 KB in 58 lines, because lines run to paragraphs.
- `sprint-status.yaml` has a ~6 KB single-line `last_updated`. Story files reach 165 KB, and `_bmad-output/implementation-artifacts` totals 6.3 MB.
- Commit subjects reach 1,974 characters on one line, which makes `git log --oneline` unusable.
- 25 tech-debt items are open in `action_items`.

**M3 · Low · VERIFIED · Error-code vocabulary is scattered**
- 42 distinct codes are thrown as string literals, and 73 throws use the defaults `VALIDATION_ERROR`/`CONFLICT`. There is no central union type.
- The UI maps codes ad hoc (34 inline `code === 'X'` checks in 10 files). `EXPORT_TOO_LARGE` and `IDEMPOTENCY_KEY_REQUIRED` have no UI mapping.
- *Fix*: an `ErrorCode` union exported from `errors.ts`, used by services, the registry and the client map.

**M4 · Info · VERIFIED · Debt lives in the tracker, not in the code**
- There are 0 TODO/FIXME/HACK markers in `src`/`e2e`; all debt is tracked in `sprint-status.yaml`.

## 4. Status of the 2026-09-10 performance findings

| # | Finding | Status | Evidence today |
|---|---|---|---|
| F1 | Timeline renders every aircraft (Panoramica, Pianificazione) | **OPEN** | `schedule.tsx:292,606-623` still maps all `visibleAircraft` with 25 `grid-line` divs each; `listBookableAircraft` unbounded (`bookings.service.ts:1480`); 17.2 backlog |
| F2 | Negative balances: all rows, embedded in Panoramica | **OPEN** | `accounts.service.ts:758`; `dashboard/page.tsx:307`, `billing/page.tsx:93`; 118–203 ms per call (P5); 17.3 backlog |
| F3 | Stats series in JS on raw rows, uncapped rankings | **OPEN** | `stats.service.ts:171` still `flight.findMany({select:{flightDate,minutes}})`; 17.4 backlog |
| F4 | 10 concurrent users break pages (pool, interactive reads, shm) | **PARTIAL** | Fixed: `shm_size: 1gb`, tuned Postgres, `DATABASE_POOL_MAX`, explicit `transactionOptions` (17.1). Open: 6 read-only interactive transactions (P4), the `listAllActiveAircraft` loop, the 18-call fan-out (P3); 17.5 backlog |
| F5 | react-pdf slow, PDFs 422 beyond 2,000 rows | **OPEN** | `adapters/pdf/document.tsx:158` `renderToBuffer`; caps 2,000/10,000 (`exports.service.ts:61,64`); 17.7 backlog |
| F6 | Silent picker caps (100) | **PARTIAL** | Flight editor uses server typeahead (`flight-editor.tsx:528,565`). Booking forms still get static full lists (`new-booking-form.tsx:266`); `OPTIONS_PAGE_SIZE = 100` in `dashboard/page.tsx:66`, `logbook/page.tsx:32`; 17.6 backlog |
| F7 | Transactions COUNT with join, no `effectiveDate` index | **OPEN** | no index on either ledger's `effectiveDate` (P6) |
| F8 | Monthly revenue/cost = 24 self-joined aggregates | **OPEN** | `stats.service.ts:147-158` (6 or 12 months × `getLedgerRevenueCents`), `billing-summary.service.ts:84`; EXPLAIN 41–117 ms per month vs 123–149 ms for one `GROUP BY` over 12 months |
| F9 | Picker data duplicated in RSC payload and markup | **PARTIAL** | Picker DTO now 5 fields (`bookings.service.ts:1484-1486`), but all rows still ship; the full i18n catalog is now also in every payload (I1) |
| F10 | Postgres at factory settings | **FIXED (dev only)** | `docker-compose.yml` `shm_size: '1gb'`, `shared_buffers=512MB`, `work_mem=16MB`; no production configuration exists (O1) |

## 5. What is good

- **Type and lint hygiene is exceptional for this size**: strict TypeScript, 0 `any`/`@ts-ignore`/`eslint-disable` in production code, ESLint 0 errors on 424 files, and only 8 unused locals under `--noUnusedLocals`.
- **The OpenAPI registry is close to faithful**: 96 of 97 operations registered, 0 stale entries, 0 parameter mismatches, request and response parity on 10 sampled routes.
- **Money discipline**: integer cents end to end, one locale-aware formatter (`money.ts`), a parser that accepts both separators, and a deterministic SSR/CSR grouping fix.
- **Uniform API plumbing**: one `apiRoute` wrapper (AD-8 error envelope, 64 KB body cap, idempotency layer). The environment is validated at boot, and placeholder secrets are rejected in production (`env.ts`).
- **Paginated reads scale**: 15–50 ms at 60k flights / 105k movements (2026-09-10 report). Currency and person-overlap queries are index-backed (P6 table).
- **Clean client/server boundary**: no client file imports server or Prisma code at runtime, and exceljs/react-pdf stay server-only.
- **Removed domains really are removed** (PPR, hour meter, licence expiry) outside the tests that prove their absence.
- **Process strengths**: debt is tracked explicitly, decisions are ratified and recorded, a load-test harness exists (`scripts/perf/`, `seed-load.ts`), and i18n key parity is perfect.

## 6. Open questions

1. Is the Flutter client still planned? If yes, A1 and A2 are blocking work for the API surface. If no, CLAUDE.md should stop calling the project API-first and accept RSC reads.
2. Target hosting (VPS Docker or Vercel with managed Postgres)? It decides O1 (standalone build, cron, backups), O4 (log sink) and the pool sizing rule.
3. Does any database other than test/demo exist, e.g. the PO's demo instance? If so, the epic-19 migrations (O6) delete its data on the next deploy.
4. Are the 56 unpushed commits held back on purpose? T1 assumes not.
5. Should `airmanager_load` be re-seeded on HEAD before story 17.2, so the before/after measurements of epic 17 use the current schema?
6. Is there a plan for `next-auth` v5 GA, or a decision to stay on the beta (D1)?
