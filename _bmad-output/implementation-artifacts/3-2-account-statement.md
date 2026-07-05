---
baseline_commit: fa3434b72c3be320048a4fe4c2cc2bcb7a617348
---

# Story 3.2: Estratto conto

Status: done

## Review Record

- **Reviewer**: claude-opus via BMAD code-review (adversarial, 2026-07-06)
- **Verdict**: APPROVE — no mandatory findings. Hot areas verified: `actorEmail` is role-gated IN THE SERVICE (conditional spread, absent from the wire payload for the holder — not merely hidden by the UI; unit test asserts `not.toHaveProperty`), so a pilot cannot obtain staff emails via direct API; OpenAPI declares it optional; full own-access matrix tested with ownership-before-query; AD-8 pagination shape with pageSize cap and count+findMany in one transaction; M1 locale-aware money from the route locale (e2e checks €100.00 on /en); F3 tie-break and F4 404-vs-empty contracts respected; i18n symmetric.
- **F1 (optional, applied)**: out-of-range `?page` now clamps to the last real page instead of showing a misleading empty table with no nav rendered to recover.
- **F2 (optional, no action)**: the page performs three service calls each re-running the person lookup — redundant but safe, consistent with the 2.3 pattern; optimize later if it matters.
- **F3 (informational, confirmed intended)**: ordering is by `createdAt` (registration order, ledger semantics AD-3), not by `effectiveDate` — a backdated top-up sorts by when it was recorded. Deliberate.
- **F4 (nit, no action)**: unused `createdAt` crosses the RSC boundary in row props.
- **Post-fix gates**: lint ✔ (1 documented benign warning), typecheck ✔, test 260/260 ✔, build ✔, e2e 59/59 ✔ (fresh DB).

## Story

As a pilota o allievo,
I want vedere il mio estratto conto,
so that sappia quanto credito ho e da cosa deriva (FR-26).

## Acceptance Criteria

1. **Given** un titolare autenticato, **When** apre "Il mio conto", **Then** vede saldo corrente e movimenti paginati in ordine cronologico inverso con tipo, data, importo firmato e descrizione; 403 sui conti altrui.
2. **Given** il permesso staff, **When** apre il conto di chiunque, **Then** vede lo stesso estratto più i dettagli operativi (chi ha registrato, note).

## Tasks / Subtasks

- [x] Task 1: Service + API (AC: tutte)
  - [x] `accounts.service.ts`: `listAccountMovements(actor, personId, query)` — own-access (riusare `assertReadAccess` esistente; persona inesistente → `NotFoundError`, coerente con review 3.1 F4), paginato con helper 1.5, `orderBy: [{createdAt:'desc'},{id:'desc'}]` (tie-break, review 3.1 F3); ogni item: `type`, `amountCents` firmato, `effectiveDate` (YYYY-MM-DD), `description`, `createdAt` — e `actorEmail` SOLO quando l'attore ha `people.read` (dettaglio operativo staff, AC 2): per il titolare il campo è assente/null, la UI non lo mostra. NESSUN nuovo permesso
  - [x] Route `GET /api/v1/people/[id]/account/movements` con `apiRoute()` (persona senza conto → lista vuota con total 0, NON 404 — il conto può non esistere ancora, review 3.1 O4 riguarda la persona); schemi in `src/lib/schemas/accounts.ts` (z da `zod-with-openapi`!), registry + coverage assertion
- [x] Task 2: UI (AC: tutte)
  - [x] Pagina estratto `/{locale}/dashboard/people/[id]/account`: server page col pattern 2.3 (session → redirect se non autorizzato, service ri-autorizza; own-access identico a scheda persona); intestazione con nome persona + saldo grande (getAccountOverview); tabella movimenti con `data-table.tsx` (colonne: data, tipo tradotto, descrizione, importo firmato colorato ±; per staff anche "registrato da"), paginazione server-side come people/aircraft
  - [x] Accessi: link "Estratto conto" nel pannello saldo della scheda persona (2.3/3.1); per i self-service (con Person e senza `people.read`) la card dashboard "La mia scheda" (2.3) si affianca a una card "Il mio conto" che porta al proprio estratto — stesso pattern, componente riusato se possibile
  - [x] **Denaro SEMPRE con locale della pagina** (`useLocale()` → `formatCents`/`formatSignedCents` — review 3.1 M1, il pattern è già in `account-panel.tsx`)
  - [x] Stile skill `minimalist-ui`; stringhe `messages/{it,en}.json` simmetriche
- [x] Task 3: Test (AC: tutte)
  - [x] Unit service: matrix own-access (staff ok con actorEmail; titolare ok senza actorEmail; pilota su conto altrui → Forbidden PRIMA della query; personId null → Forbidden); paginazione e ordinamento (orderBy con tie-break); persona senza conto → items [] total 0; persona inesistente → NotFound
  - [x] e2e (`e2e/account-statement.spec.ts`): staff registra 2 ricariche a un pilota → apre estratto → 2 righe reverse-chrono con importi firmati e colonna "registrato da"; il pilota seed apre "Il mio conto" → saldo e movimenti visibili, colonna staff assente; pilota su `GET /api/v1/people/{altro}/account/movements` → 403 envelope; verifica formato EN su /en (pattern 3.1)

## Dev Notes

- Story deliberatamente piccola: il service ha già overview/own-access/ledger (3.1) — qui si aggiunge SOLO la lista paginata e la pagina estratto. Non toccare recordTopUp né i modelli (nessuna migrazione).
- **AD-2/AD-3**: importi in centesimi firmati, saldo sempre SUM (già in getAccountOverview — riusarlo per l'header), ledger append-only (nessuna nuova scrittura in questa story).
- `actorEmail`: risolto via relazione `actorUser.email` (pattern `listHourMeterAdjustments` 2.5); condizionato a `hasPermission(actor,'people.read')` nel service — la UI nasconde la colonna ma il service è il guardiano del dato (AD-5).
- Pattern consolidati: own-access ownership-before-query; tie-break id; locale-aware money (M1 3.1); data-table riusabile; server page 2.3.
- e2e flaky su DB sporco → reset (drop/recreate + migrate deploy + seed).
- Nessuna dipendenza npm nuova. Ambiente: PostgreSQL su, Mailpit su 1025/8025; MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto), typecheck, Vitest (253+ attesi), `next build`, e2e Playwright (55+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-26]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-5, #AD-8]
- [Source: _bmad-output/implementation-artifacts/3-1-accounts-topups.md#Review Record] — assertReadAccess, buildOverview, M1 locale, F3/F4
- [Source: _bmad-output/implementation-artifacts/2-3-person-detail.md] — pattern pagina + accessi self-service

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- Initial `AccountStatementPage` attempt built `ColumnDef`s (with function-valued `cell`/`header`) directly in the server page and passed them as a prop to the client `DataTable` — Next.js RSC rejected this at runtime ("Functions cannot be passed directly to Client Components"), caught by the first e2e run. Fixed by extracting a client `AccountStatementTable` component (`account-statement-table.tsx`) that builds its own `columns` from serializable props (`rows`, `showActor`, `moneyLocale`, `labels`) — same reason `PeopleManager`/`AircraftManager` build columns internally instead of receiving them from the server page.
- Full e2e suite showed 2 pre-existing `people-management.spec.ts` failures and 1 transient `ECONNRESET` on `accounts-topups.spec.ts` after several repeated local runs had accumulated test data across pagination pages — resolved per Dev Notes by resetting the DB (drop/recreate + `migrate deploy` + `db seed`); a clean run afterward passed all 59 e2e tests (55 pre-existing + 4 new), and the isolated re-run of the flaked spec files also passed standalone, confirming DB pollution/dev-server load rather than a regression.

### Completion Notes List

- Added `listAccountMovements(actor, personId, query)` to `accounts.service.ts`: reuses the existing `assertReadAccess` own-access guard (checked before any query), paginates via the story 1.5 `paginate`/`paginationOffset` helpers with the `[{createdAt:'desc'},{id:'desc'}]` tie-break (review 3.1 F3 pattern), and returns `actorEmail` only when the actor has `people.read` (AC 2) — a person without an `Account` yet returns an empty page (`total: 0`), not a 404 (review 3.1 F4 pattern: only an unknown person 404s).
- Added `GET /api/v1/people/[id]/account/movements` via `apiRoute()`, new Zod schemas in `src/lib/schemas/accounts.ts` (`listAccountMovementsQuerySchema` reusing the shared pagination schema, `accountStatementItemSchema`/`accountStatementResponseSchema`), and registered the path + `AccountStatement` component in the OpenAPI registry, extending the registry's coverage-assertion test.
- Built the server page `/{locale}/dashboard/people/[id]/account` following the story 2.3 pattern (session check → redirect, service re-authorizes); header shows the person's name and balance (via `getAccountOverview`); the paginated table is rendered by a new client component (`account-statement-table.tsx`) to keep `ColumnDef` function values off the server/client prop boundary. Money is always formatted from the route's `locale` param (never a client-side `useLocale()` guess) — same locale-aware invariant as `AccountPanel` (review 3.1 M1).
- Added an "Estratto conto completo" link in `AccountPanel` (linking to the new page) and an "Il mio conto" dashboard tile for self-service actors (Person, no `people.read`) alongside the existing "La mia scheda" tile — both gated the same way as the existing 2.3 own-access tile.
- Unit tests: full own-access matrix (staff with `actorEmail`, titolare without it, cross-person Forbidden before any query, `personId: null` Forbidden), pagination/ordering with the tie-break, no-account-yet empty page, and unknown-person NotFound — 7 new tests, `accounts.service.test.ts` now covers `listAccountMovements` alongside the existing `getAccountOverview`/`recordTopUp` suites.
- e2e (`e2e/account-statement.spec.ts`, 4 new tests): staff records 2 top-ups and sees 2 reverse-chronological rows with signed amounts and the "Registrato da" column; the seeded pilot opens "Il mio conto" and sees balance/movements without that column; a pilot gets a 403 AD-8 envelope on `GET .../account/movements` for someone else's account; money formatting follows the page locale on `/en`.
- Gates, all green: `npm run lint` (1 known benign warning on `data-table.tsx`), `npx tsc --noEmit` (clean), `npx vitest run` (260 passed = 253 pre-existing + 7 new), `npm run build` (successful, new routes listed), `npx playwright test` on a freshly reset+seeded DB (59 passed = 55 pre-existing + 4 new).
- No migrations, no new npm dependencies, no changes to `recordTopUp` or the Prisma models — scope stayed to the paginated read path and its UI, as scoped by the Dev Notes.

### File List

- `src/server/services/accounts.service.ts` (modified — added `listAccountMovements`, `AccountStatementItem`/`AccountStatementResult` types, `ACCOUNT_STATEMENT_SELECT`/`toStatementItem`)
- `src/server/services/accounts.service.test.ts` (modified — added `listAccountMovements` unit test suite + `accountMovement.count` mock)
- `src/lib/schemas/accounts.ts` (modified — added `listAccountMovementsQuerySchema`, `accountStatementItemSchema`, `accountStatementResponseSchema`)
- `src/app/api/v1/people/[id]/account/movements/route.ts` (new — `GET` route)
- `src/lib/schemas/registry.ts` (modified — registered `AccountStatement` component + `GET /api/v1/people/{id}/account/movements` path)
- `src/lib/schemas/registry.test.ts` (modified — added the new path to the coverage-assertion list)
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx` (new — the estratto conto server page)
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx` (new — client table component)
- `src/app/[locale]/dashboard/people/account-panel.tsx` (modified — added the "Estratto conto completo" link)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (modified — passed the new `viewStatement` label to `AccountPanel`)
- `src/app/[locale]/dashboard/page.tsx` (modified — added the "Il mio conto" self-service tile)
- `messages/it.json` / `messages/en.json` (modified — `AccountStatementPage` section, `PersonDetailPage.accountPanel.viewStatement`, `DashboardPage.myAccount`)
- `e2e/account-statement.spec.ts` (new — 4 e2e tests)

## Change Log

- 2026-07-05: Story 3.2 implemented — paginated account statement service/API/UI with role-aware "registrato da" detail; all gates green (lint, typecheck, 260 unit tests, build, 59 e2e tests on a clean DB); Status → review.
