# Story 3.2: Estratto conto

Status: ready-for-dev

## Story

As a pilota o allievo,
I want vedere il mio estratto conto,
so that sappia quanto credito ho e da cosa deriva (FR-26).

## Acceptance Criteria

1. **Given** un titolare autenticato, **When** apre "Il mio conto", **Then** vede saldo corrente e movimenti paginati in ordine cronologico inverso con tipo, data, importo firmato e descrizione; 403 sui conti altrui.
2. **Given** il permesso staff, **When** apre il conto di chiunque, **Then** vede lo stesso estratto più i dettagli operativi (chi ha registrato, note).

## Tasks / Subtasks

- [ ] Task 1: Service + API (AC: tutte)
  - [ ] `accounts.service.ts`: `listAccountMovements(actor, personId, query)` — own-access (riusare `assertReadAccess` esistente; persona inesistente → `NotFoundError`, coerente con review 3.1 F4), paginato con helper 1.5, `orderBy: [{createdAt:'desc'},{id:'desc'}]` (tie-break, review 3.1 F3); ogni item: `type`, `amountCents` firmato, `effectiveDate` (YYYY-MM-DD), `description`, `createdAt` — e `actorEmail` SOLO quando l'attore ha `people.read` (dettaglio operativo staff, AC 2): per il titolare il campo è assente/null, la UI non lo mostra. NESSUN nuovo permesso
  - [ ] Route `GET /api/v1/people/[id]/account/movements` con `apiRoute()` (persona senza conto → lista vuota con total 0, NON 404 — il conto può non esistere ancora, review 3.1 O4 riguarda la persona); schemi in `src/lib/schemas/accounts.ts` (z da `zod-with-openapi`!), registry + coverage assertion
- [ ] Task 2: UI (AC: tutte)
  - [ ] Pagina estratto `/{locale}/dashboard/people/[id]/account`: server page col pattern 2.3 (session → redirect se non autorizzato, service ri-autorizza; own-access identico a scheda persona); intestazione con nome persona + saldo grande (getAccountOverview); tabella movimenti con `data-table.tsx` (colonne: data, tipo tradotto, descrizione, importo firmato colorato ±; per staff anche "registrato da"), paginazione server-side come people/aircraft
  - [ ] Accessi: link "Estratto conto" nel pannello saldo della scheda persona (2.3/3.1); per i self-service (con Person e senza `people.read`) la card dashboard "La mia scheda" (2.3) si affianca a una card "Il mio conto" che porta al proprio estratto — stesso pattern, componente riusato se possibile
  - [ ] **Denaro SEMPRE con locale della pagina** (`useLocale()` → `formatCents`/`formatSignedCents` — review 3.1 M1, il pattern è già in `account-panel.tsx`)
  - [ ] Stile skill `minimalist-ui`; stringhe `messages/{it,en}.json` simmetriche
- [ ] Task 3: Test (AC: tutte)
  - [ ] Unit service: matrix own-access (staff ok con actorEmail; titolare ok senza actorEmail; pilota su conto altrui → Forbidden PRIMA della query; personId null → Forbidden); paginazione e ordinamento (orderBy con tie-break); persona senza conto → items [] total 0; persona inesistente → NotFound
  - [ ] e2e (`e2e/account-statement.spec.ts`): staff registra 2 ricariche a un pilota → apre estratto → 2 righe reverse-chrono con importi firmati e colonna "registrato da"; il pilota seed apre "Il mio conto" → saldo e movimenti visibili, colonna staff assente; pilota su `GET /api/v1/people/{altro}/account/movements` → 403 envelope; verifica formato EN su /en (pattern 3.1)

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

### Debug Log References

### Completion Notes List

### File List

## Change Log
