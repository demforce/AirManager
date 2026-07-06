# Story 3.5: Report finanziario per periodo

Status: ready-for-dev

## Story

As a gestore,
I want un report entrate/uscite per periodo,
so that veda come sta economicamente l'aviosuperficie (FR-31).

## Acceptance Criteria

1. **Given** movimenti di cassa in date diverse, **When** scelgo un periodo (mese/trimestre/anno/intervallo libero), **Then** vedo totali per categoria, totale entrate, totale uscite e saldo del periodo, con dettaglio movimenti.
2. **And** la somma dei movimenti mostrati coincide con il saldo del periodo (test automatico).

## Tasks / Subtasks

- [ ] Task 1: Service (AC: tutte) — NESSUNA migrazione
  - [ ] `cash.service.ts`: `getCashReport(actor, {from, to})` — `authorize('finance.manage')`; `from`/`to` obbligatorie (YYYY-MM-DD, inclusive su `effectiveDate`, stesso filtro TZ-exact di `listCashMovements` 3.4); ritorna `{ from, to, totalInCents, totalOutCents, netCents, categories: [{categoryId, categoryName, inCents, outCents, netCents}], movementCount }` — TUTTO calcolato in Postgres con `groupBy` su `categoryId` + somme condizionali (due groupBy filtrati per segno, o raw SQL con `SUM(CASE WHEN...)` — scegliere e documentare); `netCents = totalInCents + totalOutCents` (out è già negativo, AD-2 firmato); categorie senza movimenti nel periodo ESCLUSE dal report; ordina le categorie per `netCents` asc o per nome (scegliere e documentare)
  - [ ] **Invariante AC 2 garantita per costruzione**: `totalInCents/totalOutCents` derivano dalla stessa `WHERE` (periodo) del registro — il "test automatico" dell'AC è un unit test che verifica su fixture che `SUM(movimenti nel periodo) === netCents` e che `netCents === somma dei netCents per categoria`
  - [ ] I preset periodo (mese/trimestre/anno correnti) sono SOLO UI: il service riceve sempre `from`/`to` espliciti — nessuna logica calendario nel service
- [ ] Task 2: API + UI (AC: 1)
  - [ ] Route `GET /api/v1/cash-report?from&to` con `apiRoute()`; 422 se `from`/`to` mancanti o malformati; schema con `.refine(from <= to)` (422 chiaro, review 3.4 F4 ha lasciato il buco lato registro — qui il report DEVE rifiutare l'intervallo invertito); schemi in `cash.ts` (z da zod-with-openapi!), registry + coverage assertion
  - [ ] UI: pagina `/{locale}/dashboard/finance/report` (link dalla pagina finance): selettore periodo con preset (mese corrente default, trimestre, anno, intervallo libero con due date) che spinge `from`/`to` nella URL; card riassuntive (totale entrate verde, totale uscite rosso, saldo periodo con segno/colore); tabella per categoria (nome, entrate, uscite, netto); sotto, il dettaglio movimenti del periodo RIUSANDO il registro esistente (`listCashMovements` con from/to — link "apri nel registro" con i filtri precompilati va benissimo, NON duplicare la tabella movimenti: scegliere la via più pulita e documentare)
  - [ ] Denaro locale-aware (M1), stile `minimalist-ui`, i18n `messages/{it,en}.json` simmetrici; date dei preset calcolate client-side in Europe/Rome (attenzione al cambio mese a cavallo di mezzanotte UTC)
- [ ] Task 3: Test (AC: tutte)
  - [ ] Unit: report con mix entrate/uscite/più categorie → totali per categoria e complessivi corretti; **invariante AC 2**: somma movimenti === netCents === somma netCents categorie (fixture con storno incluso: la coppia si annulla se entrambe le date sono nel periodo); periodo senza movimenti → tutto 0 e categories []; from > to → 422 dallo schema; permessi (pilota → Forbidden)
  - [ ] e2e (`e2e/cash-report.spec.ts`): staff registra entrata 100 € e uscita −40 € in date note → report del periodo mostra entrate 100, uscite −40, saldo 60 e la categoria giusta; intervallo che esclude una delle due date → totali coerenti; pilota su `GET /api/v1/cash-report` → 403 envelope

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

### Debug Log References

### Completion Notes List

### File List

## Change Log
