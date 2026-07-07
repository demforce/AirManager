# Story 3.5: Report finanziario per periodo

Status: review

## Story

As a gestore,
I want un report entrate/uscite per periodo,
so that veda come sta economicamente l'aviosuperficie (FR-31).

## Acceptance Criteria

1. **Given** movimenti di cassa in date diverse, **When** scelgo un periodo (mese/trimestre/anno/intervallo libero), **Then** vedo totali per categoria, totale entrate, totale uscite e saldo del periodo, con dettaglio movimenti.
2. **And** la somma dei movimenti mostrati coincide con il saldo del periodo (test automatico).

## Tasks / Subtasks

- [x] Task 1: Service (AC: tutte) — NESSUNA migrazione
  - [x] `cash.service.ts`: `getCashReport(actor, {from, to})` — `authorize('finance.manage')`; `from`/`to` obbligatorie (YYYY-MM-DD, inclusive su `effectiveDate`, stesso filtro TZ-exact di `listCashMovements` 3.4); ritorna `{ from, to, totalInCents, totalOutCents, netCents, categories: [{categoryId, categoryName, inCents, outCents, netCents}], movementCount }` — TUTTO calcolato in Postgres con `groupBy` su `categoryId` + somme condizionali (due groupBy filtrati per segno, o raw SQL con `SUM(CASE WHEN...)` — scegliere e documentare); `netCents = totalInCents + totalOutCents` (out è già negativo, AD-2 firmato); categorie senza movimenti nel periodo ESCLUSE dal report; ordina le categorie per `netCents` asc o per nome (scegliere e documentare)
  - [x] **Invariante AC 2 garantita per costruzione**: `totalInCents/totalOutCents` derivano dalla stessa `WHERE` (periodo) del registro — il "test automatico" dell'AC è un unit test che verifica su fixture che `SUM(movimenti nel periodo) === netCents` e che `netCents === somma dei netCents per categoria`
  - [x] I preset periodo (mese/trimestre/anno correnti) sono SOLO UI: il service riceve sempre `from`/`to` espliciti — nessuna logica calendario nel service
- [x] Task 2: API + UI (AC: 1)
  - [x] Route `GET /api/v1/cash-report?from&to` con `apiRoute()`; 422 se `from`/`to` mancanti o malformati; schema con `.refine(from <= to)` (422 chiaro, review 3.4 F4 ha lasciato il buco lato registro — qui il report DEVE rifiutare l'intervallo invertito); schemi in `cash.ts` (z da zod-with-openapi!), registry + coverage assertion
  - [x] UI: pagina `/{locale}/dashboard/finance/report` (link dalla pagina finance): selettore periodo con preset (mese corrente default, trimestre, anno, intervallo libero con due date) che spinge `from`/`to` nella URL; card riassuntive (totale entrate verde, totale uscite rosso, saldo periodo con segno/colore); tabella per categoria (nome, entrate, uscite, netto); sotto, il dettaglio movimenti del periodo RIUSANDO il registro esistente (`listCashMovements` con from/to — link "apri nel registro" con i filtri precompilati va benissimo, NON duplicare la tabella movimenti: scegliere la via più pulita e documentare)
  - [x] Denaro locale-aware (M1), stile `minimalist-ui`, i18n `messages/{it,en}.json` simmetrici; date dei preset calcolate client-side in Europe/Rome (attenzione al cambio mese a cavallo di mezzanotte UTC)
- [x] Task 3: Test (AC: tutte)
  - [x] Unit: report con mix entrate/uscite/più categorie → totali per categoria e complessivi corretti; **invariante AC 2**: somma movimenti === netCents === somma netCents categorie (fixture con storno incluso: la coppia si annulla se entrambe le date sono nel periodo); periodo senza movimenti → tutto 0 e categories []; from > to → 422 dallo schema; permessi (pilota → Forbidden)
  - [x] e2e (`e2e/cash-report.spec.ts`): staff registra entrata 100 € e uscita −40 € in date note → report del periodo mostra entrate 100, uscite −40, saldo 60 e la categoria giusta; intervallo che esclude una delle due date → totali coerenti; pilota su `GET /api/v1/cash-report` → 403 envelope

## Dev Notes

- Story piccola e SOLO di lettura: nessun nuovo modello, nessuna scrittura, nessuna migrazione. È un'aggregazione sul ledger 3.4 (AD-3: i totali sono sempre SUM, mai contatori mantenuti).
- **AD-2**: tutti i totali in centesimi interi firmati; la formattazione EUR è presentazione (M1 locale-aware).
- Lo storno (3.4) dentro il periodo si annulla col suo originale nei totali; se solo uno dei due cade nel periodo, il report lo mostra sbilanciato — comportamento contabile corretto già documentato in 3.4, non "aggiustarlo".
- Pattern consolidati: authorize-prima-delle-query, filtri periodo TZ-exact su @db.Date (3.4), M1, RSC boundary (colonne nel client), i18n simmetrica.
- e2e flaky su DB sporco → reset (drop/recreate + migrate deploy + seed). Nessuna dipendenza npm nuova. MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto), typecheck, Vitest (346+ attesi), `next build`, e2e Playwright (68+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-31]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-5, #AD-8]
- [Source: _bmad-output/implementation-artifacts/3-4-cash-categories-movements.md] — registro, filtri periodo, Review Record (F4: from>to)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (subagent dev, BMAD v6 workflow)

### Debug Log References

None — no blocking failures. One environment-only e2e flake was found and fixed during development (not a regression): the first draft of `e2e/cash-report.spec.ts` used fixed calendar dates for its fixtures; because the report's summary cards sum ACROSS every category in the period (unlike the register table, which is filterable by category), re-running the suite against a not-freshly-reseeded dev DB accumulated a previous run's movements into the same day and doubled the expected totals (`200,00 €` instead of `100,00 €`). Fixed by drawing a run-unique two-day window per scenario (`uniqueDatePair()`, spread across ~24 years) instead of fixed dates — same negligible-collision-risk pattern already used by `uniqueCategoryName()`. Verified green on both a dirty and a freshly reset DB after the fix.

### Completion Notes List

- Service: `getCashReport(actor, {from, to})` added to `cash.service.ts`. `authorize(actor, 'finance.manage')` first. Aggregation approach: ONE parameterized raw SQL query (`prisma.$queryRaw` tagged template — dates are bound values, never string-interpolated) joining `CashCategory` to `CashMovement` with conditional `SUM(CASE WHEN amountCents > 0/< 0 ...)` plus a per-category `COUNT`, grouped by category and ordered by name ascending. Chosen over two separate Prisma `groupBy` calls (one per sign) because `groupBy` alone cannot join in the category name — two `groupBy`s would still need a follow-up category lookup and a JS-side merge by `categoryId`; the raw query does the join, the conditional sums and the per-category count in one round trip. Categories with no movements in the period are excluded "for free" by the `JOIN`+`WHERE` (no separate existence check). `totalInCents`/`totalOutCents`/`movementCount` are derived by summing the per-category rows in JS — never a second, independently-queried total — which is what makes the AC 2 invariant true BY CONSTRUCTION (verified by a dedicated unit test with a storno-pair fixture that cancels).
- Schema: `cashReportQuerySchema` (mandatory `from`/`to`, `.refine(from <= to)` → 422 on an inverted range, closing the same hole story 3.4 review F4 left open on the register) and `cashReportResponseSchema`/`cashReportCategorySchema` added to `cash.ts`. Registered in `registry.ts` (`CashReport` component + `GET /api/v1/cash-report` path) and added to `registry.test.ts`'s coverage assertion.
- Route: `GET /api/v1/cash-report` (`src/app/api/v1/cash-report/route.ts`), thin `apiRoute()` wrapper, same `finance.manage` gate as the register.
- UI: new page `/{locale}/dashboard/finance/report` — `ReportFilters` (client) offers three presets (mese/trimestre/anno correnti, computed in Europe/Rome via the new `src/lib/period-presets.ts`, unit-tested including the UTC-midnight month-boundary case) plus two always-editable date inputs for a free interval; the server component computes the default period (current month) with the SAME helper so the first render and a later "mese corrente" click always agree. Summary cards (entrate/uscite/saldo, locale-aware, signed/colored) and a per-category table (name/entrate/uscite/netto). Movement detail is NOT duplicated: an "Apri nel registro" link reopens the existing cash register (`/dashboard/finance`) with `from`/`to` prefilled, per the Dev Notes' explicitly allowed option. Linked from the finance landing page (`viewReport`). i18n keys added symmetrically to `messages/it.json`/`messages/en.json` (`CashReportPage`, plus `FinancePage.viewReport`).
- Tests: unit tests in `cash.service.test.ts` (mixed in/out/multi-category totals, the AC 2 invariant with a storno-pair fixture, empty period → zero + `categories: []`, pilot → Forbidden) and in the same file's schema block (`cashReportQuerySchema`: valid range, `from === to`, inverted range → 422, missing/malformed dates → 422). New `src/lib/period-presets.test.ts` covers the month/quarter/year presets, including two UTC-midnight month-boundary cases (winter CET and summer CEST) called out in the Dev Notes. e2e `e2e/cash-report.spec.ts`: staff records +100 €/-40 € on a run-unique two-day window → correct entrate/uscite/saldo/category; narrowing the range to exclude one day keeps totals coherent; empty period → all zero; pilot → 403 envelope.
- Decision points for the reviewer: (1) aggregation via raw SQL vs. two `groupBy`s — documented above and in the service's own doc comment; (2) category order by name (not `netCents`) — same convention as `listCashCategories`; (3) the RSC report page calls `getCashReport` directly (not through the API route), so a hand-edited `?from=...&to=...` with an inverted range is NOT rejected at that layer (only the API schema enforces `from <= to` with a 422) — same pattern already accepted for `listCashMovements`'s own `from`/`to` on the finance page; Postgres just returns zero rows for an inverted range, so this is inert, not a crash risk; (4) an environment-only gap unrelated to this story: MailPit (and the Docker daemon that would start it) is not available in this sandbox, so 5 pre-existing e2e tests in `account-adjustments.spec.ts`/`user-management.spec.ts` (none touching cash/report code) fail with `ECONNREFUSED` — confirmed pre-existing by running `cash-register.spec.ts`/`cash-report.spec.ts` alone (both fully green) and by inspecting those failing tests' code, which predates this story.

### File List

- `src/server/services/cash.service.ts` (modified — `getCashReport`)
- `src/server/services/cash.service.test.ts` (modified — `getCashReport` + schema tests)
- `src/lib/schemas/cash.ts` (modified — `cashReportQuerySchema`/`cashReportResponseSchema`/`cashReportCategorySchema`)
- `src/lib/schemas/registry.ts` (modified — `CashReport` component + `/api/v1/cash-report` path)
- `src/lib/schemas/registry.test.ts` (modified — coverage assertion)
- `src/app/api/v1/cash-report/route.ts` (new)
- `src/lib/period-presets.ts` (new)
- `src/lib/period-presets.test.ts` (new)
- `src/app/[locale]/dashboard/finance/report/page.tsx` (new)
- `src/app/[locale]/dashboard/finance/report/report-filters.tsx` (new)
- `src/app/[locale]/dashboard/finance/page.tsx` (modified — link to the report page)
- `messages/it.json` (modified — `CashReportPage`, `FinancePage.viewReport`)
- `messages/en.json` (modified — `CashReportPage`, `FinancePage.viewReport`)
- `e2e/cash-report.spec.ts` (new)

## Change Log

- 2026-07-07: Story implemented (service, API, UI, i18n, unit + e2e tests). Status → review.
