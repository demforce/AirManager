---
baseline_commit: 89b9235cdc23ab7d9075d63a726d8994cd68a3b1
---

# Story 3.4: Cassa — categorie e movimenti manuali

Status: review

## Story

As a staff,
I want registrare entrate e uscite di cassa categorizzate,
so that le finanze dell'aviosuperficie siano tracciate (FR-29, FR-30).

## Acceptance Criteria

1. **Given** l'admin, **When** gestisce le categorie (CRUD, con seed: Ricariche, Pacchetti, PPR, Carburante, Assicurazione, Manutenzione, Utenze, Altro), **Then** le categorie in uso non sono eliminabili (solo disattivabili).
2. **Given** il permesso staff, **When** registro un movimento manuale (entrata o uscita, categoria, importo, data, descrizione), **Then** appare nel registro cassa paginato e filtrabile per periodo/categoria/segno; niente update/delete, correzioni via storno (AD-3).

## Tasks / Subtasks

- [x] Task 1: Service categorie (AC: 1) — NESSUNA migrazione (modelli già completi da 3.1)
  - [x] `cash.service.ts` NUOVO (spine: `services/cash`): `listCashCategories(actor, {includeInactive})` (per la gestione admin E per popolare il select dei movimenti — le inattive escluse di default), `createCashCategory` (name unique trim 1..100, P2002→Conflict), `renameCashCategory`, `deactivateCashCategory`/`reactivateCashCategory` (guardia atomica updateMany su isActive, pattern 2.2 F1), `deleteCashCategory` — SOLO se non in uso: count `CashMovement` per categoria == 0, altrimenti `ConflictError` con messaggio che suggerisce la disattivazione (race: FK RESTRICT già presente fa da backstop — mappare anche P2003 → Conflict). Gestione categorie: `authorize('settings.manage')` (admin, AC 1); la lista per il select: `finance.manage` basta
  - [x] NON toccare la categoria "Ricariche" in modo speciale: se l'admin la disattiva, `recordTopUp` già fallisce esplicito (3.1) — aggiungere però al lookup di recordTopUp il filtro `isActive: true` con messaggio chiaro (una categoria disattivata non deve ricevere movimenti automatici silenziosamente)
- [x] Task 2: Service movimenti (AC: 2)
  - [x] `recordCashMovement(actor, {categoryId, amountCents (int firmato ≠ 0, ±INT_MAX), effectiveDate (YYYY-MM-DD), description? (''→null, max 500)})` — `authorize('finance.manage')`; categoria inesistente → `NotFoundError`, inattiva → `ConflictError` (niente movimenti nuovi su categorie disattivate; lo storico resta); crea `CashMovement` con `actorUserId` (append-only: NESSUN update/delete)
  - [x] `reverseCashMovement(actor, id, reason (1..500))` — storno AD-3: crea movimento con `amountCents` OPPOSTO, stessa categoria (anche se inattiva: lo storno corregge storia esistente), `reversalOfId` = originale (`@unique` → un solo storno per movimento; secondo tentativo → `ConflictError`, pre-check + backstop P2002), description = reason; uno storno NON è stornabile a sua volta (movimento con `reversalOfId` valorizzato → `ConflictError`, tenere la contabilità leggibile)
  - [x] `listCashMovements(actor, query)` — `finance.manage`; paginato helper 1.5; filtri: `from`/`to` su `effectiveDate` (inclusivi, YYYY-MM-DD), `categoryId`, `sign` (`in` = amountCents > 0, `out` = < 0); ordine `[{effectiveDate:'desc'},{createdAt:'desc'},{id:'desc'}]` (registro per data valuta — scelta DIVERSA e consapevole rispetto all'estratto conto 3.2 che ordina per registrazione: documentarla nel doc comment); item: categoria (nome), importo firmato, data, descrizione, `actorEmail` (tutti i lettori qui sono staff), badge storno (`reversalOfId`/`hasReversal` come 3.3)
- [x] Task 3: API + UI (AC: tutte)
  - [x] Route: `GET/POST /api/v1/cash-categories`, `PATCH /api/v1/cash-categories/[id]` (rename), `POST .../deactivate`, `POST .../reactivate`, `DELETE /api/v1/cash-categories/[id]`; `GET/POST /api/v1/cash-movements`, `POST /api/v1/cash-movements/[id]/reverse`. Schemi in NUOVO `src/lib/schemas/cash.ts` (z da zod-with-openapi!), registry + coverage assertion
  - [x] UI `/dashboard/finance` (3.3): aggiungere sezione **Registro cassa** — filtri (periodo da/a, categoria, segno) che spingono nella URL (pattern search people 2.1), tabella `data-table.tsx` (data, categoria, descrizione, importo firmato colorato, registrato da, badge storno), paginazione server-side, pulsante "Nuovo movimento" (pannello: entrata/uscita, categoria attiva, importo EUR → parseCents al submit, data default oggi, descrizione), azione riga "Storna" (two-step con motivo obbligatorio, nascosta su righe già stornate/storni)
  - [x] Pagina admin categorie `/dashboard/finance/categories` (visibile/raggiungibile solo con `settings.manage`; link dalla pagina finance): elenco con stato attiva/disattivata e conteggio movimenti, crea/rinomina/disattiva/riattiva/elimina (elimina solo se count 0 — il bottone può mostrarsi sempre e gestire il 409 con messaggio chiaro)
  - [x] Denaro locale-aware (M1), remount `key`, ''→null, stile `minimalist-ui`, i18n `messages/{it,en}.json` simmetrici
- [x] Task 4: Test (AC: tutte)
  - [x] Unit: categorie (unique, rename, guardie atomiche, delete su categoria usata → Conflict con P2003 backstop, permessi settings.manage vs finance.manage); recordCashMovement (categoria inattiva → Conflict, ≠0, permessi); reverseCashMovement (opposto+stessa categoria, doppio storno → Conflict, storno di storno → Conflict, P2002 race); listCashMovements (filtri periodo inclusivi, categoria, segno, ordine per effectiveDate)
  - [x] e2e (`e2e/cash-register.spec.ts`): staff registra entrata 50 € e uscita −30 € → entrambe nel registro con segni/colori; filtro per segno e per periodo; storno dell'uscita con motivo → riga storno +30 € con badge e azione storna sparita dall'originale; admin crea categoria, la disattiva → non selezionabile per nuovi movimenti; delete di categoria usata → errore chiaro; pilota su `GET /api/v1/cash-movements` → 403 envelope

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

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- Ambiente: PostgreSQL e Mailpit erano DOWN a metà sessione (riavvio del container) — riavviati (`service postgresql start`, `/root/go/bin/mailpit`); DB resettato (drop/recreate + `migrate deploy` + `db seed`) prima della suite e2e completa, come da regole operative.
- Nessuna migrazione (modelli `CashCategory`/`CashMovement` completi dalla 3.1, verificato: FK `categoryId` è `ON DELETE RESTRICT` nella migrazione 3.1 → il backstop P2003 è reale).
- `recordTopUp` lookup con `where: { name, isActive: true }`: verificato che `CashCategoryWhereUniqueInput` di Prisma 7 accetta filtri non-unique accanto alla chiave (`AtLeast<'id'|'name'>`) — nessun `findFirst` necessario.
- tsc rosso su `sign` nel ternario con `||` (narrowing non propagato alla const): risolto con ternario esplicito annotato `'in' | 'out' | undefined`.
- e2e: primo full-run con 2 flaky preesistenti noti (login timeout argon2 sotto carico — già documentato nel Debug Log 3.1 — e people-management su DB sporco accumulato dai run precedenti); dopo reset DB pulito → 68/68 verdi.
- Anti-flake nel nuovo spec: il feedback "Movimento registrato." persiste tra due submit nello stesso test → aggiunto wait sulla chiusura del pannello (`cash-movement-form` count 0) come segnale di completamento; assert sul conteggio movimenti mirato alla cella (il nome univoco della categoria contiene cifre).

### Completion Notes List

- **Task 1** — Nuovo `cash.service.ts`: `listCashCategories` (`finance.manage` — serve sia alla pagina admin sia al picker del pannello movimenti; `includeInactive` default false; `movementCount` da `_count`, ordinamento per nome); `createCashCategory`/`renameCashCategory` (`settings.manage`, P2002 → 409); `deactivateCashCategory`/`reactivateCashCategory` (`settings.manage`, guardia atomica `updateMany` su `isActive`, pattern 2.2 F1 — il perdente della race prende lo stesso 409 di uno stato già raggiunto); `deleteCashCategory` (`settings.manage`, pre-check `_count.movements == 0` → 409 con suggerimento di disattivare, backstop P2003 dal FK RESTRICT per la race → stesso 409, mai un 500). `recordTopUp` (3.1) ora risolve "Ricariche" con `isActive: true` nel where: una categoria disattivata fallisce esplicito come una mancante (errore operativo, envelope 500 AD-8), mai movimenti automatici silenziosi su categoria spenta.
- **Task 2** — `recordCashMovement` (`finance.manage`): categoria inesistente → 404, inattiva → 409 (lo storico resta, i nuovi movimenti no); crea `CashMovement` append-only con `actorUserId`, `accountMovementId`/`reversalOfId` sempre null (il gemello automatico resta compito di `recordTopUp`). `reverseCashMovement` (`finance.manage`): storno AD-3 — importo OPPOSTO, STESSA categoria (anche se disattivata: corregge storia esistente), `reversalOfId` collegato, `effectiveDate` = oggi UTC (come la rettifica 3.3, mai retrodatato), description = reason; NON stornabili: righe già stornate (pre-check + backstop P2002 → 409), storni stessi (409, contabilità leggibile), gemelli automatici da ricarica (`accountMovementId != null` → 409: la correzione passa dalla rettifica conto 3.3, altrimenti conto e cassa divergono). `listCashMovements` (`finance.manage`): paginato helper 1.5, filtri `from`/`to` inclusivi su `effectiveDate` (`@db.Date` UTC-midnight → `gte`/`lte` esatti), `categoryId`, `sign` (in/out sul segno); ordine `[{effectiveDate desc},{createdAt desc},{id desc}]` — per data valuta, scelta consapevolmente DIVERSA dall'estratto conto 3.2 (per registrazione), documentata nel doc comment; item con nome categoria, `actorEmail` (lettori sempre staff), `reversalOfId`/`hasReversal` (badge/azione come 3.3) e `isAutomatic` (nasconde lo storno sui gemelli da ricarica).
- **Task 3** — Route sottili con `apiRoute()`: `GET/POST /api/v1/cash-categories`, `PATCH/DELETE /api/v1/cash-categories/[id]`, `POST .../deactivate|reactivate`, `GET/POST /api/v1/cash-movements`, `POST /api/v1/cash-movements/[id]/reverse`; nessun update/delete sui movimenti (AD-3). Schemi in nuovo `src/lib/schemas/cash.ts` (z da zod-with-openapi; `amountCents` firmato ≠ 0 ±INT_MAX, reason/description cap 500, `includeInactive` col preprocess anti-footgun di `"false"`); registry: 8 component schema + 7 path (tag `Cash`), coverage assertion estesa. UI `/dashboard/finance`: sezione "Registro cassa" col client component `cash-register.tsx` (colonne DENTRO il client component — lezione RSC 3.2): filtri periodo/categoria/segno che spingono nella URL (pattern people 2.1; il filtro categoria include le disattivate per lo storico, il picker del form no), tabella data-table con importo firmato colorato locale-aware (M1), badge storno ("Storno del movimento del {date}" via `t.raw`, fallback generico) e badge "Automatico", paginazione server-side con clamp (pattern 3.2 F1), pannello "Nuovo movimento" (entrata/uscita → segno applicato a `parseCents` SOLO al submit, data default oggi, ''→null), azione riga "Storna" two-step (pannello con motivo obbligatorio, remount `key`, 409 con messaggio dedicato) nascosta su righe stornate/storni/automatiche. Pagina admin `/dashboard/finance/categories` (redirect senza `settings.manage`; link "Gestisci categorie" dalla pagina finance, visibile solo con `settings.manage`): elenco con badge stato e conteggio movimenti, crea/rinomina (pannello condiviso con remount `key`), disattiva/riattiva, elimina two-step col bottone sempre visibile e 409 gestito con messaggio chiaro che suggerisce la disattivazione. i18n it/en simmetrica (verificata con confronto programmatico delle chiavi).
- **Task 4** — 46 unit test nuovi (343 totali, 297 preesistenti): 45 in `cash.service.test.ts` (permessi settings.manage vs finance.manage su ogni funzione, unique P2002 su create/rename, guardie atomiche count 0 → 409, delete su categoria usata → 409 senza DELETE + backstop P2003, categoria inattiva → 409, storno opposto/stessa categoria/collegato/datato oggi, doppio storno → 409, storno di storno → 409, storno di automatico → 409, P2002 race, storno su categoria disattivata OK, filtri inclusivi/categoria/segno, ordine per effectiveDate, mapping isAutomatic/hasReversal, schemi Zod ≠0/±INT_MAX/reason) + 1 in `accounts.service.test.ts` (lookup Ricariche con `isActive: true`). 5 e2e nuovi (68 totali, 63 preesistenti) in `e2e/cash-register.spec.ts`: tutti gli scenari del Task 4 coperti (entrata/uscita con segni e colori, filtri segno e periodo inclusivo, storno two-step con badge e azione sparita da originale e storno, categoria creata/disattivata sparita dal picker ma non dal filtro, delete di categoria usata → errore chiaro, 403 envelope per pilota).
- **Gate finali**: lint 0 errori (1 warning benigno noto su data-table.tsx), `tsc --noEmit` pulito, Vitest **343/343**, `next build` ok, Playwright **68/68** su DB resettato.

### File List

- src/lib/schemas/cash.ts (A)
- src/lib/schemas/registry.ts (M — 8 component + 7 path Cash)
- src/lib/schemas/registry.test.ts (M — coverage dei 7 nuovi path)
- src/server/services/cash.service.ts (A)
- src/server/services/cash.service.test.ts (A)
- src/server/services/accounts.service.ts (M — lookup Ricariche con isActive: true)
- src/server/services/accounts.service.test.ts (M — test del nuovo where)
- src/app/api/v1/cash-categories/route.ts (A)
- src/app/api/v1/cash-categories/[id]/route.ts (A — PATCH rename + DELETE)
- src/app/api/v1/cash-categories/[id]/deactivate/route.ts (A)
- src/app/api/v1/cash-categories/[id]/reactivate/route.ts (A)
- src/app/api/v1/cash-movements/route.ts (A)
- src/app/api/v1/cash-movements/[id]/reverse/route.ts (A)
- src/app/[locale]/dashboard/finance/page.tsx (M — sezione Registro cassa, filtri URL, paginazione, link categorie)
- src/app/[locale]/dashboard/finance/cash-register.tsx (A)
- src/app/[locale]/dashboard/finance/categories/page.tsx (A)
- src/app/[locale]/dashboard/finance/categories/categories-manager.tsx (A)
- messages/it.json (M — FinancePage.cashRegister, CashCategoriesPage, manageCategories)
- messages/en.json (M — idem, simmetrico)
- e2e/cash-register.spec.ts (A)
- _bmad-output/implementation-artifacts/3-4-cash-categories-movements.md (M — questo record)
- _bmad-output/implementation-artifacts/sprint-status.yaml (M — 3-4 → review)

## Change Log

- 2026-07-06: Story 3.4 implementata (claude-sonnet-5 via BMAD dev-story) — registro cassa append-only (AD-3) con categorie admin (`settings.manage`: CRUD, disattivazione soft, delete solo se mai usata con backstop P2003) e movimenti manuali (`finance.manage`: entrata/uscita firmata, storno AD-3 opposto/stessa categoria/un solo storno/mai su storni o movimenti automatici da ricarica), registro filtrabile per periodo/categoria/segno ordinato per data valuta, UI su /dashboard/finance + pagina categorie. Gate: lint / tsc / Vitest 343 / build / Playwright 68 tutti verdi. Status → review.
