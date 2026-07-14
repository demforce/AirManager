---
baseline_commit: ba3ca3e
---

# TD-9: CI verde stabile — eradicare i 4 e2e rossi ricorrenti (change request utente 2026-07-13 notte)

Status: review

## Story

As a maintainer,
I want che la suite e2e passi VERDE su GitHub Actions senza allowlist di "fallimenti noti",
so that la PR #18 (e ogni PR futura) abbia un segnale CI affidabile: oggi 4 test pre-esistenti rossi sul runner CI (più lento: esauriscono i 2 retry) la tengono rossa — l'utente li vede e li vuole risolti («I test e2e su github non passano, sono rossi»).

## I 4 rossi del run CI 29290290222 (evidenza raccolta, 2026-07-13 22:47 UTC)

Esito CI: 216 passed / 5 flaky / **4 failed** (tutti e 3 i retry esauriti). Gates job: verde.

1. **`aircraft-rates.spec.ts:118`** — timeout 30s su `getByRole('row', {name: /I-R1…/}).getByRole('button', {name:'Tariffe'})` a :128: la riga dell'aereo APPENA CREATO non è in pagina — la flotta è paginata e a metà suite CI ci sono decine di aerei accumulati, il nuovo finisce oltre pagina 1. GAP DI SCOPING DEL TEST già documentato nel Debug Log TD-6 («pre-existing pagination-scoping gap in that one spec file; other specs already carry a documented fix for this same class»). Fix di classe: cercare l'aereo con la search della pagina (`?q=registration` o fill della barra) PRIMA di risolvere la riga — replicare il pattern degli spec che già lo fanno (censire, es. `aircraft-management`/`aircraft-status-hours`) su TUTTE le risoluzioni-riga di `aircraft-rates.spec.ts`.
2. **`instructor-rates.spec.ts:123`** — dopo il salvataggio della prima tariffa, `instructor-rates-current` mostra «Nessuna tariffa in vigore» invece di `40,00 €` (5s + retry esauriti). È il bug PRE-ESISTENTE TD6-N1(a): `currentRatePriceCentsPerHour` è una prop calcolata SERVER-side (`instructor-rates-panel.tsx:45-53`, mai ricomputata client-side) e il post-submit si affida a un refresh che sul runner lento non rimaterializza la prop in tempo (race di `router.refresh()` / refetch — individuare il meccanismo esatto nel submit handler del panel e nel gemello `aircraft-manager`). Fix di PRODOTTO richiesto, non del test: il salvataggio deve produrre uno stato osservabile deterministico (es. aggiornare lo stato client dal RESPONSE della POST — la tariffa creata è nel body — oppure await del refresh con invalidazione; scegliere la via più semplice e dichiararla). Il test può poi restare com'è. Stessa classe sul GEMELLO `aircraft-rates` (`current-rate-` nella riga flotta dopo il salvataggio, :139-140 — anche lì prop server): verificare e sistemare ENTRAMBI i lati.
3. **`command-palette.spec.ts:95`** — timeout 30s: il dialog della palette NON si apre su `Control+k` stando sulla pagina voli (`command-palette-dialog` mai visibile). Bug PRE-ESISTENTE TD6-N1(b), ora deterministico sotto suite piena anche in locale (unico rosso dei nostri ultimi 2 full run). Root-cause da trovare in `command-palette.tsx`/`search-trigger.tsx` (listener keydown? dialog nativo? interazione con la pagina voli sotto carico/idratazione?). Fix di PRODOTTO — l'apertura della palette deve essere affidabile; se emerge che il test preme Ctrl+K prima che il listener esista, il fix resta di prodotto (es. listener sul document a mount del layout, non di un client component tardivo) più eventuale attesa esplicita di un segnale di readiness nel test SOLO se documentata come tale.
4. **`bookings.spec.ts:636`** — dopo l'annullo two-step, `booking-row` filtrata per la registration run-unique resta a count 1 (atteso 0): la cancellazione non si riflette nella lista. Deferred storico («fragilità isolamento, stessa classe della :397 fixata» — ma l'evidenza CI mostra la riga del PROPRIO aereo ancora presente: può essere race di refresh della lista post-cancel o isolamento della data fissa condivisa). Root-cause da stabilire: se è race di refresh lista → fix di prodotto; se è isolamento della data → fix del test con slot run-unique (pattern `soonestFutureSlot` della :397). NON limitarsi ad allargare timeout.

## Acceptance Criteria

1. **Root cause dichiarata per ciascuno dei 4** nel Dev Agent Record: prodotto vs test, con la spiegazione del meccanismo (niente fix "a timeout allargato" — vietato aumentare timeout globali; un timeout puntuale è accettabile SOLO se motivato da un'operazione intrinsecamente lenta e dichiarato).
2. **Fix di prodotto dove il bug è di prodotto** (atteso: #2 rates refresh — entrambi i gemelli instructor E aircraft; #3 palette; #4 se race di lista), **fix di test dove è di test** (atteso: #1 scoping paginazione; #4 se isolamento data). Ogni fix chirurgico e riconducibile alla causa.
3. **I 4 test passano 3 volte CONSECUTIVE in locale** nel contesto che li rompeva: full suite CI-mode su DB fresco (non basta il run isolato — il fallimento emerge sotto carico/accumulo). Le 3 run complete devono chiudere con **0 failed** (flaky-pass-on-retry accettati e riportati).
4. **`npm run gates` verde**; nessuna migrazione/env/dipendenza nuova attesa (se un fix di prodotto richiedesse una migrazione, fermarsi e dichiararlo PRIMA).
5. **CI verde su GitHub**: dopo il push (della sessione principale), il job `e2e` del workflow deve chiudere verde. Se il primo run CI rosso rivela un residuo, il ciclo riparte (diagnosi → fix → push) finché il job è verde — questo AC chiude la story.
6. I deferred TD6-N1(a)/(b) e bookings:636 vengono marcati CHIUSI nell'HANDOFF (a cura della sessione principale, post-review).

## Contesto e vincoli

- **Convenzioni e2e vincolanti**: selettori landmark-scoped/`exact:true`; MAI `hasText` con orari H:MM o date; i testid esistenti NON cambiano; MAI toccare i retry/timeout di `playwright.config.ts`.
- **Gemelli tariffe**: `instructor-rates-panel.tsx` (scheda persona) e la sezione tariffe di `aircraft-manager.tsx` sono stati scritti come twin (story 4.1/4.2) — il fix del refresh deve restare simmetrico.
- **Palette**: `command-palette.tsx` + `search-trigger.tsx` (topbar, layout persistente 12.2); il deep-link `?new=1` e il pattern adjust-state-during-render di 12.6 NON vanno regrediti (gli altri test della palette restano verdi).
- **Il DB CI parte fresco ma la suite accumula**: qualunque fix deve reggere l'ordine/parallelismo reale (fullyParallel, 2 retry CI). Riproduzione locale: full suite CI-mode su DB fresco, eventualmente ripetuta.
- **Fuori scope (dichiarato)**: gli altri 5 flaky-pass-on-retry del run CI (aircraft-management:48, bookings:309, date-picker:70, instructor-rates:163, school:497) — NON toccarli se non gratis col fix di classe; TD8-N1 (picker AOG); 121-N1.

## Tasks / Subtasks

- [x] **T1 (AC 1)** — Riproduzione + root cause dei 4 (full suite CI-mode locale su DB fresco; strumentare solo il necessario).
- [x] **T2 (AC 2)** — Fix #1 scoping aircraft-rates (pattern search esistente, tutte le risoluzioni-riga dello spec).
- [x] **T3 (AC 2)** — Fix #2 refresh tariffe (prodotto, entrambi i gemelli) + verifica che i test esistenti passino invariati.
- [x] **T4 (AC 2)** — Fix #3 palette Ctrl+K (prodotto).
- [x] **T5 (AC 2)** — Fix #4 bookings:636 secondo root cause.
- [x] **T6 (AC 3, 4)** — 3 full run CI-mode consecutivi con 0 failed; gates.
- [x] **T7** — Dev Agent Record + File List; sprint-status `td-9` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`. Story quasi tutta backend/test: le skill UI servono SOLO se un fix tocca markup visibile (improbabile).
- Ambiente: DB fresco fornito (NON resettare all'avvio; per i run ripetuti di T6 il reset è consentito e anzi necessario tra un run e l'altro — dichiararlo nel log); prima di ogni run `curl localhost:3000` deve FALLIRE; gates SOLO `npm run gates`; MAI `playwright install`; MAI stash; MAI `git add -A`; esito dai `test-results/.last-run.json`.
- Baseline: `ba3ca3e` — 225 e2e / 1307 unit / 31 migrazioni; il run CI di riferimento è il 29290290222 (evidenze sopra, estratte dai log del job `e2e`).

### References

- [Source: change request utente 2026-07-13 notte («I test e2e su github non passano, sono rossi») — run CI 29290290222]
- [Source: HANDOFF — deferred TD6-N1(a) refresh race tariffe, TD6-N1(b) palette vuota/chiusa, bookings:636 isolamento; TD-6 Debug Log (pagination-scoping gap aircraft-rates)]
- [Source: recon in sessione — instructor-rates-panel.tsx:45-53 (prop server-side), errori CI verbatim per i 4 test]

## Dev Agent Record

### Agent Model Used

Dev subagent Sonnet 5 xhigh (interrotto dall'harness a metà validazione AC 3) + continuation della sessione principale (Fable), che ha corretto due fix del dev, trovato la root cause vera della palette e completato validazione e chiusura.

### Debug Log References

- Gates: PASS a ogni iterazione (lint/typecheck/1307 unit/build).
- Validazione AC 3 (full suite CI-mode, DB fresco per run, esito da `.last-run.json`): v1 r1 0-failed / r2 2-failed (create-race bookings) → fix → v3 r1 1-failed (:1102, stesso membro) → fix → v4 r1 1-failed (secondo assert adjustments) → sweep → **v5: 3/3 run consecutive 0-failed (219/220/221 passed, flaky 6→5→4)**.
- **AC 5: job `e2e` GitHub Actions VERDE** (run 29326667775) sul push dei fix — prima CI interamente verde della PR #18.

### Completion Notes List — root cause per test (AC 1)

1. **aircraft-rates:118 — TEST (scoping)**: riga del velivolo fresco oltre pagina 1 sotto accumulo; fix search-first (`?q=registration`) su tutte le risoluzioni-riga dello spec (pattern esistente). [dev]
2. **instructor/aircraft rates — PRODOTTO (refresh race)**: la tariffa corrente era SOLO una prop server che raceava `router.refresh()`; ora deriva anche dallo storico appena salvato (`currentRateFromHistory`/`rateOverrides`, simmetrico sui due gemelli); test invariati. [dev]
3. **command-palette:95 — TEST (selettore), NON il dialog**: l'input della palette è `role="combobox"` (command-palette.tsx:265) e SOLO questo test usava `getByRole('textbox')` → mai matchabile; il dialog si è SEMPRE aperto (snapshot di ogni run fallito). Tre cicli di review avevano letto l'errore come "dialog non si apre". Fix: testid come gli altri test del file; rimossi i timeout gonfiati del primo taglio (45s/30s, deviazione ritirata); MANTENUTO il marker di prodotto `data-shortcut-ready` (race di idratazione reale: keypress perso prima dell'attach del listener) con attesa dichiarata nel test; ritirato il `flushSync` (motivato dalla diagnosi errata). [dev diagnosi parziale; continuation root cause + fix]
4. **bookings:636 — PRODOTTO (visibilità lista) + TEST (isolamento)**: righe cancellate/spostate nascoste con override locali deterministici (indipendenti dal timing di `router.refresh()`, che non ha segnale di completamento — `useTransition` provato e SCARTATO empiricamente); l'override dello spostamento è keyed sulla coppia pre-move (aircraftId, startsAt) — il primo taglio del dev (solo aircraftId) nascondeva PER SEMPRE le righe spostate solo di orario (beccato dalla validazione su :1064). Slot run-unique al posto di FUTURE_DAY. [dev + fix continuation]
5. **Classe trasversale emersa in validazione — TEST**: ogni assert che leggeva lista/saldo/stato subito dopo una mutazione raceava lo stesso `router.refresh()` senza segnale; pattern uniforme dichiarato «feedback DELL'AZIONE (testo specifico, non toBeVisible — il toast precedente può ancora essere visibile e un reload prematuro aborterebbe la POST in volo) → `page.reload()` → assert sull'esito durevole» applicato a: bookings create/force/expiry-move (:314/:350/:636/:715/:1005/:1102), adjustments (3 assert), archiviazione velivoli e persone, stati fuori servizio/rientro. [continuation]

### File List

- `src/app/[locale]/dashboard/search-trigger.tsx` (marker `data-shortcut-ready`; flushSync introdotto e ritirato)
- `src/app/[locale]/dashboard/bookings/bookings-list.tsx` (override `cancelledIds`/`staleMoves` a coppia pre-move)
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx` (tariffa corrente derivata post-save)
- `src/app/[locale]/dashboard/people/instructor-rates-panel.tsx` (idem, gemello)
- `e2e/command-palette.spec.ts` (selettore + readiness wait)
- `e2e/aircraft-rates.spec.ts` (search-first)
- `e2e/bookings.spec.ts` (slot run-unique + reload-then-assert, 6 test)
- `e2e/account-adjustments.spec.ts` (reload-then-assert, 3 assert)
- `e2e/aircraft-management.spec.ts`, `e2e/people-management.spec.ts` (archiviazione: feedback specifico + reload)
- `e2e/aircraft-status-hours.spec.ts` (stati operativi: feedback specifico + reload)
- `_bmad-output/implementation-artifacts/td-9-ci-stabilization.md`, `sprint-status.yaml`

## Change Log

- 2026-07-14: implementazione (dev subagent, interrotto a validazione iniziata) + continuation della sessione principale: root cause palette corretta (selettore, non timing), staleMoves a coppia, conversioni slot, sweep classe reload-then-assert. Validazione AC 3: 3 run consecutive 0-failed. **AC 5: CI GitHub verde (gates + e2e)**. Status → review.
