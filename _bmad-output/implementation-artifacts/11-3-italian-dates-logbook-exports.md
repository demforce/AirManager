---
baseline_commit: a0abb71
---

# Story 11.3: Date italiane ovunque ed export logbook

Status: ready-for-dev

## Story

As a utente,
I want date in formato italiano su ogni schermata ed export allineati al logbook,
so that il sistema parli la lingua del campo volo (FR-44, FR-45; epics.md «Epic 11», change-request-flight-log-2026-07-10.md).

## Acceptance Criteria

1. **Given** l'audit completo delle superfici UI che rendono date-only ISO raw (elenco CHIUSO in Contesto, dal recon di sessione), **When** le apro, **Then** ogni data è DD/MM/YYYY via `formatDateOnly` (o `formatDateTime` dove il dato è un instant) — NESSUN formatter nuovo, NESSUN cambio ai campi `<input type="date">` e ai request body (restano ISO).
2. **Given** l'export Excel del registro voli, **Then** contiene le colonne logbook SEPARATE — partenza, arrivo, ora decollo (HH:MM Europe/Rome), ora atterraggio, decolli — più la colonna PIC (derivazione story 11.2), con intestazioni localizzate IT/EN da `FlightsPage.list.table`; i voli storici senza dati logbook esportano celle vuote/`null`. Colonna `landings` esistente invariata.
3. **Given** l'export PDF del registro voli (A4 verticale, colonne flex a larghezza uguale — vincolo recon), **Then** le stesse informazioni entrano in forma COMPATTA: `tratta` (`dep → arr`), `orari` (`HH:MM–HH:MM`), `dec./att.` (`N / N`, sostituisce la colonna atterraggi), `PIC` — riusando le chiavi/formati della tabella registro (story 11.2). La leggibilità del PDF va VERIFICATA su un export reale generato con dati di prova (non solo il magic-byte check degli e2e); se ancora illeggibile, ulteriore merge dichiarato come deviazione.
4. **Given** la derivazione PIC, **Then** exports e registro usano UN SOLO helper condiviso: se la story 11.2 l'ha lasciato module-scope nel client `flights-manager.tsx`, estrarlo in `src/lib/flight-pic.ts` (client-safe e importabile server-side) e far importare il registro da lì — refactor chirurgico, unit test dei 3 rami + fallback se non già esistenti.
5. Test verdi: `exports.service.test.ts` aggiornato (mock voli in shape post-11.1, assert nuove colonne xlsx per indice e PDF per header-lookup, caso SCHOOL doppio-comando per il ramo istruttore del PIC); `e2e/exports.spec.ts` aggiornato (array intestazioni ESATTO e indici cella slittano); `e2e/pdf-exports.spec.ts` resta verde senza modifiche (non assert sul contenuto).
6. i18n IT/EN completo (nuove chiavi header sotto `FlightsPage.list.table`, riusando quelle introdotte da 11.2 dove esistono); email templates NON toccati (già localizzati, formato long-form deliberato — fuori scope, decisione ratificata in questa story).

## Contesto e decisioni di design (vincolanti)

- **Audit CHIUSO — superfici da retrofittare** (tutte rendono stringhe date-only ISO raw; refs dal recon, verificare per nome se le righe sono slittate):
  - `people/account-panel.tsx` :186 (`movement.effectiveDate`)
  - `people/[id]/account/account-statement-table.tsx` :153 (colonna data) e :131/:137/:370 (badge/sottotitolo `{date}` interpolati)
  - `people/expiries-panel.tsx` :281-282 (`issuedAt`/`expiresAt`)
  - `expiries/page.tsx` :303-304; `expiries/my-expiries.tsx` :129-130; `expiries/proposals-queue.tsx` :111/:116 (4 date correnti/proposte)
  - `finance/cash-register.tsx` :162 (colonna data) e :602 (label dialog conferma)
  - `aircraft/aircraft-manager.tsx` :1348 (`validFrom` storico tariffe); `people/instructor-rates-panel.tsx` :304 (idem istruttori)
  - `people/profiles-panel.tsx` :423/:469 (`courseStartDate`); `school/page.tsx` :293 (`courseStartDate` — la riga :296 accanto usa GIÀ `formatDateOnly`: allineare)
  - **ESCLUSI**: `flights-manager.tsx` (fatto da 11.2 — NON toccare), form/input bindings (restano ISO), email templates (già localizzati), export (già `formatDateOnly`), superfici già formattate (home, school journal, packages, bookings, ppr — v. recon).
- **Export xlsx** (`exports.service.ts#exportFlightsXlsx`, ~:221-249): colonne = ordine della tabella registro post-11.2 ma con partenza/arrivo/orari SEPARATI (Excel non ha vincoli di larghezza; `width` opzionale su `ExportColumn`, default 18): data, velivolo, persona, istruttore, tipo, partenza, arrivo, ora decollo, ora atterraggio, durata, decolli, atterraggi, PIC, addebito, stato. Orari via `formatTimeOfDay(row.takeoffAt, locale)` — pattern GIÀ presente in `exportBookingsXlsx` :268; null-guard → `null`. Header: `t('list.table.*')` (namespace `FlightsPage`).
- **Export PDF** (`exportFlightsPdf`, ~:516-556): colonne compatte (AC 3) — data, velivolo, persona, istruttore, tipo, tratta, orari, durata, dec./att., PIC, addebito, stato (12). Celle PDF sono SEMPRE stringhe; null → `''`. Totali (`pdf.totalDuration`/`pdf.totalAmount`) INVARIATI. NIENTE landscape (non esiste), NIENTE modifiche a `document.tsx` salvo necessità dichiarata.
- **Precedente xlsx≠pdf**: già sancito nel file (doc-comment :55-57, nota aircraft :179-185) — set colonne divergenti legittimi.
- **PIC condiviso** (AC 4): la logica è nel story file 11.2 (non-SCHOOL → person; SCHOOL+isSolo → person; SCHOOL dual → instructor, fallback noValue). In export il fallback rende `''`/`null`. Formato nome `lastName firstName` (stesso di `${row.person.lastName} ${row.person.firstName}` già usato in export).
- **e2e exports.spec.ts** (~:126-137, :191): array intestazioni esatto + indici `getCell(n)` — aggiornarli TUTTI coerentemente col nuovo ordine; l'helper `registerFlight` degli spec invia già la shape 11.1 (`'Base Airfield'`, decollo `10:00Z`) quindi le nuove celle hanno valori assertabili deterministici.
- **Unit test exports** (`exports.service.test.ts`): i mock flights (~:132-160 xlsx, ~:394-421 pdf) sono in shape PRE-11.1 (`as never`) — portarli alla shape reale (campi logbook popolati e caso storico null) e aggiungere il caso SCHOOL doppio-comando (istruttore presente, `isSolo:false`) per coprire il ramo PIC-istruttore; i mock attuali coprono solo solo/istruttore-null.
- **Fuori scope (dichiarato)**: QTB/libretto pilota PDF (follow-up fuori epic); header colonne PDF ripetuto su pagine 2+ (deferred storico 102-N1); formato date nelle email (deliberato long-form); ogni altro export non-flights; larghezze proporzionali `PdfColumn` (introdurle SOLO se la verifica leggibilità lo impone, dichiarandolo).

## Tasks / Subtasks

- [ ] **T1 (AC 4)** — Helper PIC condiviso `src/lib/flight-pic.ts` (estrazione da 11.2 se module-scope, altrimenti riuso diretto) + unit test se mancanti.
- [ ] **T2 (AC 1)** — Retrofit `formatDateOnly` sulle superfici dell'audit CHIUSO; nessun cambio a form/wire.
- [ ] **T3 (AC 2, 3, 6)** — Colonne export xlsx (separate) e PDF (compatte) + i18n header keys; verifica leggibilità PDF su export reale con dati di prova (decode/screenshot, come review 10.2). Nel passaggio: pulire il ramo morto `row.landings === null` in `exportFlightsPdf` (review 11.1, nit 111-N2 — il DTO è non-null dal 11.1).
- [ ] **T4 (AC 5)** — `exports.service.test.ts` (mock post-11.1 + ramo PIC-istruttore) e `e2e/exports.spec.ts` (header array + indici); run mirato anche di `pdf-exports.spec.ts` e delle superfici retrofittate (expiries, cash-report, account-statement e2e).
- [ ] **T5** — `npm run gates`; Dev Agent Record + File List; sprint-status `11-3` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; UI marginale (solo formattazione celle esistenti): coerenza `minimalist-ui`, nessun redesign; per il PDF vale la verifica visiva (screenshot/decodifica) più degli e2e.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE; gates SOLO `npm run gates`; MAI `playwright install`.
- UN commit di implementazione (`Story 11.3: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- Baseline post-11.2 nel prompt di dispatch (migrazioni 30, unit/e2e aggiornati). Flake noti: `ppr-register:206`, `cash-report` ECONNRESET, login-redirect su webServer freddo.
- ATTENZIONE: gli e2e di expiries/cash/account potrebbero assert-are date ISO nelle righe (come faceva flight-reversal) — grep PRIMA di toccare le superfici (`grep -n "20[0-9][0-9]-" e2e/*.spec.ts`) e aggiornare i selettori `hasText` al nuovo formato dove serve.

### Project Structure Notes

- File toccati attesi: `src/server/services/exports.service.ts` (+test), `src/lib/flight-pic.ts` (+test), le 11 superfici UI dell'audit, `messages/{it,en}.json`, `e2e/exports.spec.ts`, eventuali e2e con `hasText` ISO. NESSUNA migrazione, env var, API nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 11.3»; change-request-flight-log-2026-07-10.md]
- [Source: recon 11.3 in sessione — audit completo raw-ISO (11 superfici + esclusioni motivate); exports.service.ts :221-249 (xlsx flights), :516-556 (pdf flights), :61/:64 (cap 10k/2k), :111 (MONEY_NUM_FMT), :268 (formatTimeOfDay precedente bookings); adapters/excel/workbook.ts :22 (DEFAULT_COLUMN_WIDTH); adapters/pdf/document.tsx :60-61 (flex:1), :71-78 (header non ripetuto, MVP), :107 (wrap={false})]
- [Source: e2e/exports.spec.ts :77-87 (helper shape 11.1), :126-137 (header array esatto), :191 (getCell person); e2e/pdf-exports.spec.ts (nessun assert di contenuto)]
- [Source: exports.service.test.ts :126-186 (xlsx flights, mock pre-11.1), :384-453 (pdf flights, header-lookup)]
- [Source: messages/it.json — FlightsPage.list.table ~:963-984, FlightsPage.form (labels partenza/arrivo/orari da rispecchiare), PdfExport ~:1522]
- [Source: story file 11-2 (helper PIC, chiavi tabella, colonne compatte tratta/orari/dec-att)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
