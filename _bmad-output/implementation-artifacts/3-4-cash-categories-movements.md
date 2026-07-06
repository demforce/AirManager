# Story 3.4: Cassa — categorie e movimenti manuali

Status: ready-for-dev

## Story

As a staff,
I want registrare entrate e uscite di cassa categorizzate,
so that le finanze dell'aviosuperficie siano tracciate (FR-29, FR-30).

## Acceptance Criteria

1. **Given** l'admin, **When** gestisce le categorie (CRUD, con seed: Ricariche, Pacchetti, PPR, Carburante, Assicurazione, Manutenzione, Utenze, Altro), **Then** le categorie in uso non sono eliminabili (solo disattivabili).
2. **Given** il permesso staff, **When** registro un movimento manuale (entrata o uscita, categoria, importo, data, descrizione), **Then** appare nel registro cassa paginato e filtrabile per periodo/categoria/segno; niente update/delete, correzioni via storno (AD-3).

## Tasks / Subtasks

- [ ] Task 1: Service categorie (AC: 1) — NESSUNA migrazione (modelli già completi da 3.1)
  - [ ] `cash.service.ts` NUOVO (spine: `services/cash`): `listCashCategories(actor, {includeInactive})` (per la gestione admin E per popolare il select dei movimenti — le inattive escluse di default), `createCashCategory` (name unique trim 1..100, P2002→Conflict), `renameCashCategory`, `deactivateCashCategory`/`reactivateCashCategory` (guardia atomica updateMany su isActive, pattern 2.2 F1), `deleteCashCategory` — SOLO se non in uso: count `CashMovement` per categoria == 0, altrimenti `ConflictError` con messaggio che suggerisce la disattivazione (race: FK RESTRICT già presente fa da backstop — mappare anche P2003 → Conflict). Gestione categorie: `authorize('settings.manage')` (admin, AC 1); la lista per il select: `finance.manage` basta
  - [ ] NON toccare la categoria "Ricariche" in modo speciale: se l'admin la disattiva, `recordTopUp` già fallisce esplicito (3.1) — aggiungere però al lookup di recordTopUp il filtro `isActive: true` con messaggio chiaro (una categoria disattivata non deve ricevere movimenti automatici silenziosamente)
- [ ] Task 2: Service movimenti (AC: 2)
  - [ ] `recordCashMovement(actor, {categoryId, amountCents (int firmato ≠ 0, ±INT_MAX), effectiveDate (YYYY-MM-DD), description? (''→null, max 500)})` — `authorize('finance.manage')`; categoria inesistente → `NotFoundError`, inattiva → `ConflictError` (niente movimenti nuovi su categorie disattivate; lo storico resta); crea `CashMovement` con `actorUserId` (append-only: NESSUN update/delete)
  - [ ] `reverseCashMovement(actor, id, reason (1..500))` — storno AD-3: crea movimento con `amountCents` OPPOSTO, stessa categoria (anche se inattiva: lo storno corregge storia esistente), `reversalOfId` = originale (`@unique` → un solo storno per movimento; secondo tentativo → `ConflictError`, pre-check + backstop P2002), description = reason; uno storno NON è stornabile a sua volta (movimento con `reversalOfId` valorizzato → `ConflictError`, tenere la contabilità leggibile)
  - [ ] `listCashMovements(actor, query)` — `finance.manage`; paginato helper 1.5; filtri: `from`/`to` su `effectiveDate` (inclusivi, YYYY-MM-DD), `categoryId`, `sign` (`in` = amountCents > 0, `out` = < 0); ordine `[{effectiveDate:'desc'},{createdAt:'desc'},{id:'desc'}]` (registro per data valuta — scelta DIVERSA e consapevole rispetto all'estratto conto 3.2 che ordina per registrazione: documentarla nel doc comment); item: categoria (nome), importo firmato, data, descrizione, `actorEmail` (tutti i lettori qui sono staff), badge storno (`reversalOfId`/`hasReversal` come 3.3)
- [ ] Task 3: API + UI (AC: tutte)
  - [ ] Route: `GET/POST /api/v1/cash-categories`, `PATCH /api/v1/cash-categories/[id]` (rename), `POST .../deactivate`, `POST .../reactivate`, `DELETE /api/v1/cash-categories/[id]`; `GET/POST /api/v1/cash-movements`, `POST /api/v1/cash-movements/[id]/reverse`. Schemi in NUOVO `src/lib/schemas/cash.ts` (z da zod-with-openapi!), registry + coverage assertion
  - [ ] UI `/dashboard/finance` (3.3): aggiungere sezione **Registro cassa** — filtri (periodo da/a, categoria, segno) che spingono nella URL (pattern search people 2.1), tabella `data-table.tsx` (data, categoria, descrizione, importo firmato colorato, registrato da, badge storno), paginazione server-side, pulsante "Nuovo movimento" (pannello: entrata/uscita, categoria attiva, importo EUR → parseCents al submit, data default oggi, descrizione), azione riga "Storna" (two-step con motivo obbligatorio, nascosta su righe già stornate/storni)
  - [ ] Pagina admin categorie `/dashboard/finance/categories` (visibile/raggiungibile solo con `settings.manage`; link dalla pagina finance): elenco con stato attiva/disattivata e conteggio movimenti, crea/rinomina/disattiva/riattiva/elimina (elimina solo se count 0 — il bottone può mostrarsi sempre e gestire il 409 con messaggio chiaro)
  - [ ] Denaro locale-aware (M1), remount `key`, ''→null, stile `minimalist-ui`, i18n `messages/{it,en}.json` simmetrici
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit: categorie (unique, rename, guardie atomiche, delete su categoria usata → Conflict con P2003 backstop, permessi settings.manage vs finance.manage); recordCashMovement (categoria inattiva → Conflict, ≠0, permessi); reverseCashMovement (opposto+stessa categoria, doppio storno → Conflict, storno di storno → Conflict, P2002 race); listCashMovements (filtri periodo inclusivi, categoria, segno, ordine per effectiveDate)
  - [ ] e2e (`e2e/cash-register.spec.ts`): staff registra entrata 50 € e uscita −30 € → entrambe nel registro con segni/colori; filtro per segno e per periodo; storno dell'uscita con motivo → riga storno +30 € con badge e azione storna sparita dall'originale; admin crea categoria, la disattiva → non selezionabile per nuovi movimenti; delete di categoria usata → errore chiaro; pilota su `GET /api/v1/cash-movements` → 403 envelope

## Dev Notes

- **AD-3**: CashMovement append-only, saldo/totali sempre da SUM, storno = movimento opposto collegato (`reversalOfId @unique`). La coppia storno/originale si annulla nei totali di periodo SOLO se entrambe le date cadono nel periodo — comportamento corretto e standard, non "aggiustarlo".
- **Permessi**: gestione categorie = `settings.manage` (admin, AC 1); tutto il resto = `finance.manage` (staff+admin). NON aggiungere permessi nuovi.
- I movimenti automatici delle ricariche (3.1, `accountMovementId` valorizzato) appaiono nel registro come tutti gli altri: NON dare l'azione storno su di essi (la correzione passa dalla rettifica conto 3.3, non dalla cassa — altrimenti conto e cassa divergono; nascondere l'azione e rifiutare nel service con `ConflictError` se `accountMovementId != null`).
- Ordine per `effectiveDate` (data valuta) qui vs `createdAt` (registrazione) nell'estratto conto 3.2: scelte diverse per usi diversi, documentate — il registro cassa si consulta per periodo contabile.
- Pattern consolidati: guardie atomiche, ownership/authorize prima delle query, tie-break id, M1 locale money, parseCents firmato, cap 500, remount key, RSC boundary (niente funzioni server→client: colonne dentro il client component, lezione 3.2).
- e2e flaky su DB sporco → reset. Nessuna dipendenza npm nuova. MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto), typecheck, Vitest (297+ attesi), `next build`, e2e Playwright (63+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-29, #FR-30]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-5, #AD-8]
- [Source: _bmad-output/implementation-artifacts/3-1-accounts-topups.md] — modelli CashCategory/CashMovement, seed categorie
- [Source: _bmad-output/implementation-artifacts/3-3-adjustments-negative-alerts.md#Review Record] — pagina finance, pattern storno/badge

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
