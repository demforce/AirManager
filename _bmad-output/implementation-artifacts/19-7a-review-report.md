# Review adversarial — Story 19.7a «Scadenze: modello, regole, quota, currency»

- **Reviewer**: `review-19-7a` (Opus 5.5, adversarial, unico layer adversarial), metodo `bmad-code-review` + `karpathy-guidelines`.
- **Commit sotto review**: `83c4a0c` (feat) + `552dc48` (docs). Baseline `9f3e2dc`.
- **Data**: 2026-11-02.

## Verdetto

**NOT SHIPPABLE così com'è → SHIPPABLE-WITH-FIXES.** L'implementazione delle regole è solida e verificata empiricamente (regola mediche, migrazioni su dati, lock della quota, RBAC, UI), ma:

1. **l'arbitro e2e su DB fresco è ROSSO** (`E2E_EXIT=1`: 1 failed deterministico + 40 did not run). Il fallimento è provocato dalle fixture del nuovo spec della story (voli dell'anno corrente su velivoli run-unique) che fanno scattare un'asserzione order-sensitive pre-esistente in `mobile-billing.spec.ts` (F1, BLOCKER, fix di una riga);
2. **la currency conta il volo Scuola SOLISTA per l'istruttore che non era a bordo** (F2, MEDIUM, contraddice CR §4.5; serve una conferma PO rapida, fix di una riga SQL).

Restano tre LOW (F3 race sull'invariante D-3 riprodotta 25/25; F4 dirottamento del tipo quota su un'installazione senza seed, riprodotto; F5 tie-break non deterministico del badge Piloti).

---

## Arbitro (priorità zero)

Pre-condizioni verificate: `ss -ltnp | grep :3000` vuoto, `scripts/e2e.sh status` = DONE (run mirato precedente del dev), DB `airmanager` appena resettato (0 `Flight`, 4 `User`, 0 `LoginAttempt`).

Lancio: `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (suite completa, build di produzione dentro il run).

Esito verbatim (`scripts/e2e.sh status`):

```
state: DONE — E2E_EXIT=1
--- summary ---
  1 failed
    [chromium] › e2e/mobile-billing.spec.ts:1073:7 › Contabilità mobile (story 15.8a) › AC 12 viii/ix: i selettori nuovi non raggiungono gli overlay di questa pagina ne il resto dell'app
  40 did not run
  508 passed (12.3m)
=== e2e end: 2026-11-02T09:08:27+01:00 ===
E2E_EXIT=1
```

- **Totale** 508 + 1 + 40 = **549** = delta dichiarato 543 → 549 (+6 del nuovo spec): il conteggio torna.
- **Flaky**: 0. Il fallito è rosso su tutti e 3 i tentativi (`retry #1`, `retry #2`) → deterministico, non una flake.
- **40 did not run** = l'intera catena serializzata (`settings` → … → `aog-overview-count`), saltata perché dipende dal project `chromium` che ha un fallimento. Rieseguita da me a parte (vedi sotto): **40/40 passed**.
- **Copia del log dell'arbitro**: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-197a-full.log` (⚠️ `/tmp/airmanager-e2e/last-run.log` ora contiene il mio ultimo run mirato, la catena 40/40 exit 0 — NON è l'arbitro).

Run supplementari (server di produzione della stessa build su :3000, `E2E_REUSE_SERVER=1`, stesso DB dopo l'arbitro):

| Run | Comando | Esito |
|---|---|---|
| R1 — il fallito da solo | `scripts/e2e.sh start --project=chromium e2e/mobile-billing.spec.ts:1073 --retries=0` | `1 failed`, stesso diff (`utilBarWidths` `[0, 281]` invece di `[281, 0]`) → deterministico sui dati attuali |
| R2 — la catena che non era girata | `scripts/e2e.sh start --project=settings --project=booking-window --project=reports --project=treasury-settings --project=billing-global --project=mobile-metar --project=mobile-overview-overflow --project=mobile-membership-fee --project=mobile-settings --project=aog-overview-count --no-deps --workers=1` | **`40 passed (2.2m)`, `E2E_EXIT=0`** — log: `.../scratchpad/chain-40-nodeps.log` |

Quindi la catena (che comprende `mobile-membership-fee` e `mobile-settings`, prove di AC 10 e AC 3) è verde; l'unico rosso è F1. Dopo il fix di F1 serve **un nuovo arbitro completo su DB fresco** (della sessione principale).

---

## Finding

### F1 — BLOCKER — Arbitro rosso: le fixture di `expiry-rules-currency.spec.ts` rompono l'asserzione order-sensitive di `mobile-billing.spec.ts:1073`

**Dove**: `e2e/mobile-billing.spec.ts:1117` (`utilBarWidths: [...new Set([...document.querySelectorAll('.util-bar')].map(...))]`), asserito con `toEqual({... utilBarWidths: [281, 0] ...})` per `/it/dashboard/reports` a 375px (riga ~1129). Causa scatenante: `e2e/expiry-rules-currency.spec.ts` (AC 6 e AC 15) che registra voli nell'anno corrente (oggi−1…oggi−91 = 2026-08/2026-11) su **due velivoli run-unique** «Regole 19.7a».

**Meccanismo** (provato):
- `stats.service.ts:213-220`: `fleet` = TUTTI i velivoli OPERATIONAL non archiviati, **in ordine di registrazione**, con i minuti del periodo (0 se nessun volo). `reports-console.tsx:101/140`: a 375px restano visibili solo i top-8 per minuti (`rankedTopIndexes`), gli altri sono `ranked-row-overflow` (larghezza 0).
- Il primo velivolo per registrazione ha 0 minuti. A parità (0) `rankedTopIndexes` ordina per indice: la riga 0 è visibile **solo se meno di 8 velivoli hanno minuti nell'anno**. Dimostrazione con la funzione reale:
  ```
  $ npx tsx scratchpad/rank.ts
  7 aircraft with current-year minutes -> first row visible: true
  8 aircraft with current-year minutes -> first row visible: false
  9 aircraft with current-year minutes -> first row visible: false
  ```
- Il `Set` conserva l'ordine DOM: riga 0 visibile → `[281, 0]` (verde), riga 0 nascosta → `[0, 281]` (rosso).
- Ricostruzione all'istante del fallimento (error-context scritto alle 09:03:24 +01:00 = 08:03:24 UTC), velivoli OPERATIONAL con voli 2026 già creati: `I-BL…` (07:57:47), **`I-R7…-N9` (08:00:11) e `I-R7…-18` (08:00:15) — model «Regole 19.7a»**, sei `I-FL…` di `flights.spec.ts` (08:00:44-08:01:25) = **9 ≥ 8** → riga 0 nascosta. Senza i due velivoli della 19.7a: **7 < 8** → verde, coerente con l'arbitro 543/543 della 19.6 (stesso `mobile-billing.spec.ts`, invariato).
  ```
  SELECT a.registration, a.model, ... FROM "Aircraft" a JOIN "Flight" f ... WHERE f."flightDate" >= '2026-01-01' ...
   I-AOG…  | AOG Test      | … | OUT_OF_SERVICE   (escluso da fleet)
   I-BL…   | Test Model    | 07:57:47 | OPERATIONAL
   I-R71793606410645-N9 | Regole 19.7a | 08:00:11 | OPERATIONAL
   I-R71793606413806-18 | Regole 19.7a | 08:00:15 | OPERATIONAL
   I-FL… ×6 | Test Model   | 08:00:44 … 08:01:25 | OPERATIONAL
   (I-L6…, I-H…, I-I… creati dopo le 08:04 UTC)
  ```
- È la classe nota «aggregati globali sotto `fullyParallel`» (CLAUDE.md): la sonda fotografa l'ORDINE di un dato globale; la 19.7a l'ha resa deterministicamente rossa (e resterebbe timing-dependent in futuro).

**Riproduzione**: R1 sopra (rosso deterministico sul DB post-arbitro).

**Fix suggerito** (una riga, nel commit di review-fix della 19.7a): rendere la sonda indipendente dall'ordine — l'invariante voluto dal commento («the invariant is their WIDTH») è l'insieme delle larghezze, non la loro sequenza:
```ts
utilBarWidths: [...new Set([...document.querySelectorAll('.util-bar')].map((s) => Math.round(s.getBoundingClientRect().width)))].sort((a, b) => b - a),
```
Le attese esistenti (`[281, 0]`, `[]`) restano valide (ordinate decrescenti). Con un commento che citi la 19.7a. Non serve toccare lo spec nuovo (i voli nell'anno corrente sono intrinseci a AC 15). Poi arbitro completo su DB fresco.

---

### F2 — MEDIUM — La currency conta il volo Scuola **solista** per l'istruttore, che non è a bordo

**Dove**: `src/server/services/currency.service.ts:52-56` (ramo `InstructorProfile` della CTE `on_board`): nessun filtro su `f."isSolo"`. Origine: D-7 della story («a bordo = `personId` oppure l'istruttore del volo»), scelta su delega che non tiene conto del solista.

**Contratto violato**: CR §4.5 — «almeno X voli registrati negli ultimi Y giorni **in cui è a bordo** (come pilota/allievo o come istruttore)» e, nello stesso paragrafo, «**Volo solista** = volo senza istruttore, **oppure volo Scuola con «solista» attivo**». Lo schema (`schema.prisma`, doc di `isSolo`) conferma che il solista «still carries (and bills) the instructor — the student is PIC»: `instructorProfileId` è valorizzato, ma l'istruttore non vola. Conseguenza operativa: un istruttore con profilo pilota (soggetto currency per D-8) diventa/resta current supervisionando da terra i soli degli allievi, e la 19.9 (che controllerà la currency sui suoi voli solisti) non lo segnalerà.

**Riproduzione empirica** (API reale, build di produzione, `scratchpad/probe.ts` con `ONLY_A=1`): pilota+istruttore D senza altri voli, allievo S; `POST /api/v1/flights` Scuola `isSolo: true`, istruttore D, data oggi−10; controllo `ctrl` pilota+istruttore senza voli.
```
"A_flight": { "status": 201, "isSolo": true },
"A_db": [ { "isSolo": true, "instr_is_d": true } ],
"A_badge_soloInstructor": "(none => current, > 30 days)",
"A_badge_control_noflights": "Non current",
"A_sheet_soloInstructor": [ "CURRENCY", "Fino al 21/01/2027" ]
```
(screenshot dello sheet: `scratchpad/A-solo-sheet.png`). D risulta current fino a oggi−10+90 per un volo su cui non era.

**Fix suggerito**: nel ramo istruttore `AND f."isSolo" = false` (l'allievo del solista continua a contare dal ramo `personId`); unit in `currency.service.test.ts` (la SQL del ramo istruttore contiene il filtro) e un caso e2e in AC 15 (pilota+istruttore con un solo volo **solista** supervisionato → «Non current»). Aggiornare D-7 nella story e il doc-comment di `currency.service.ts` («a dual flight counts for both; a solo counts for the student only»). **Richiede conferma PO** (CLAUDE.md, assumption di dominio) — vedi «Decisioni PO».

---

### F3 — LOW — L'invariante D-3 (`MEDICAL` ⇒ `ALL`/`true`) si viola con due PATCH concorrenti (25/25)

**Dove**: `src/server/services/expiry-types.service.ts:184-189` + `:200`: `updateExpiryType` legge la riga (`findUnique`), valida lo stato **risultante** contro quella lettura e scrive un update **parziale** senza lock né condizione. Due PATCH concorrenti che singolarmente sono legali — `{ kind: 'MEDICAL' }` su un RATING `ALL/true` e `{ scope: 'PILOTS' }` sullo stesso tipo — passano entrambi e la riga finale è `MEDICAL/PILOTS`. In sequenza il secondo sarebbe un 422 `MEDICAL_TYPE_FIELDS`.

**Riproduzione** (`scratchpad/probe.ts`, 25 tipi run-unique, le due PATCH in `Promise.all`, stato letto in SQL):
```
"C_race": { "200/200 -> MEDICAL/PILOTS/true": 25 },
"C_invariant_violations_in_db": [ "Zz race Rev197a-… 0 MEDICAL/PILOTS", … 25 righe ],
"C_consequence_register_visit_for_student": { "status": 422, "body": { "error": { "code": "SCOPE_MISMATCH", … } } }
```
Conseguenza: una «visita» non registrabile per allievi/istruttori (R-19-j dice «per chiunque sia a bordo»), e i tre lettori dell'ambito che D-3 lasciava intatti (`assertScopeCompatible`, `isExpiryScopeCompatible`, validazione del composito) tornano a filtrarla. Tipi ripuliti a fine sonda (`C_cleanup_left: 0`). Impatto basso (solo admin, concorrenza su un catalogo), ma è esattamente l'invariante che AD-2 assegna al solo service.

**Fix suggerito** (scelta tecnica della sessione principale): o il `CHECK ("kind" <> 'MEDICAL' OR ("scope" = 'ALL' AND "blocksBooking"))` che il banner della 19.8 prevedeva (D-f l'ha scartato per AD-1 «nessun altro DDL»: questa sonda è l'argomento per riaprirlo), oppure lettura+validazione+update in un `$transaction` con `SELECT … FOR UPDATE` sulla riga. La 19.8, che estrae questi controlli nei core transazionali, eredita il problema se non si chiude qui.

---

### F4 — LOW — Su un DB senza riga «Quota associativa» (installazione di produzione: il seed rifiuta `NODE_ENV=production`) un admin può creare un RATING con quel nome e la quota resta un rating per sempre

**Dove**: `src/server/services/membership.service.ts:141-146` (upsert per NOME con `update: {}`) + `src/server/services/expiry-types.service.ts:143` (create accetta il nome riservato). La migrazione (`20261102200100…`, passo 3) converte solo una riga già esistente; `prisma/seed.ts:382` rifiuta di girare in produzione, quindi su un'installazione vera la riga MEMBERSHIP nasce solo al primo addebito. L'invariante AD-2 «esattamente un tipo MEMBERSHIP» e il doc-comment «the name's uniqueness keeps it to ONE row» non reggono.

**Riproduzione** (gemello `airmanager_rev197a_mig`: catena completa + seed, poi riga quota cancellata per simulare la produzione; server di produzione su :3001 contro il gemello; `scratchpad/hijack.ts`):
```
"before_membership": [],
"create_rating_named_quota": { "status": 201, "body": { "name": "Quota associativa", "kind": "RATING", "scope": "ALL", … } },
"charge": { "status": 200, "body": { "expiresAt": "2027-11-02", … } },
"after_membership": [],
"after_rating_names": [ …, "Quota associativa:RATING", … ],
"person_expiries": [ { "typeName": "Quota associativa", "typeKind": "RATING", "expiresAt": "2027-11-02" } ],
"patch_isActive_false": 200,
"ratings_card_has_quota": 1
```
Effetti: la quota torna nella card Ratings e nei chip (esattamente ciò che R-19-k toglie), il tipo è modificabile/disattivabile, e `getMembershipStatus` (contratto P6 per 19.9/19.10, filtro per `kind`) risponderebbe `missing` a chi ha pagato.

**Fix suggerito** (minimo, nessun DDL): in `createExpiryType`/`updateExpiryType` rifiutare `name === MEMBERSHIP_FEE_TYPE_NAME` (409/422 con codice dedicato o `MEMBERSHIP_TYPE_LOCKED`), e/o nell'upsert di `chargeMembershipFee` usare `update: { kind: 'MEMBERSHIP', scope: 'ALL', blocksBooking: false, isActive: true }` così il primo addebito riallinea comunque la riga. Unit per entrambi.

---

### F5 — LOW — Badge Piloti: a parità di `expiresAt` la «visita migliore» dipende dall'ordine delle righe

**Dove**: `src/server/services/expiries.service.ts:625-630`: `medicalRows` arriva da un `findMany` **senza `orderBy`** e la riduzione sostituisce solo con `>` stretto; con due visite della stessa persona alla stessa data (plausibile: classe 1 e classe 2 rinnovate insieme) il `typeName` del chip «… scade tra Ngg» è quello della prima riga restituita dal planner. `pilotRowFlag` (`src/lib/mobile-registries.ts`, doc-comment) pretende esplicitamente il tie-break per nome «so two documents expiring the same day always produce the same chip (a row that flickers between two labels across renders would be a heisenbug in every screenshot test)».

**Prova**: lettura del codice (il non-determinismo di un heap scan non si riproduce a comando). **Fix**: tie-break per `typeName` (`row.expiresAt > best || (uguale && row.expiryType.name < best.expiryType.name)`) o `orderBy` sulla query; un caso unit.

---

## Decisioni PO necessarie

1. **F2 — volo Scuola solista e currency dell'istruttore**: confermare che sul volo Scuola con «solista» attivo l'istruttore **non** è a bordo e quindi il volo **non** conta per la sua currency (conta solo per l'allievo). Raccomandazione: **sì** — è la lettura letterale di CR §4.5 (definizione di «volo solista» + «in cui è a bordo»). Domanda chiusa, una riga di fix.

Nessun'altra decisione di dominio: F1, F3, F4, F5 sono tecnici.

---

## Verificato corretto (con prove)

- **Regole pure** (`scratchpad/pure.ts`, funzioni reali): `computeCurrency` — oggi−90 → current, `expiresAt` = oggi; oggi−91 → non current, `expiresAt` = ieri; X=2 con oggi−10 e oggi−91 → non current, `flightsInWindow` 1; X=2 due voli lo stesso giorno → current, +85; X=3 con due voli → `expiresAt: null`; voli futuri ignorati; Y=1 ai bordi; passaggi DST (2026-03-29, 2026-10-25) corretti; invariante `current === flightsInWindow >= X` vero su tutti i casi. `evaluateMedicalRequirement`: nomi «mancante» in ordine alfabetico `it`, scaduta più recente con tie per nome minore, giorno di scadenza valido.
- **Migrazioni su dati** (gemello `airmanager_rev197a_mig`: catena fino alla 19.6, fixture baseline-shaped, poi `prisma migrate deploy` delle due nuove): spariscono **solo** le 2 righe `Licenza` (nome esatto), con i `SentAlert` s1/s3 e la proposta q1 collegati; sopravvivono `SentAlert` s2 (classe 2) e la proposta q2 (Licenza estera); `Licenza estera` e `licenza` (minuscolo) intatte; le 4 MEDICAL (anche la custom `PILOTS/false/disattiva`) → `ALL/true`; «Quota associativa» `PILOTS/true/disattiva` → `MEMBERSHIP/ALL/false/attiva`; `prisma migrate diff` → `-- This is an empty migration.` Catalogo del DB fresco dell'arbitro (seed): identico (6 tipi, nessuna Licenza).
- **Scansioni** (API reale): prenotazioni — sole scadute (classe 2 a −40, LAPL a −20) → 422 `EXPIRED_DOCUMENTS` con **un** documento, la LAPL (più recente); nessuna visita → 201 `warnings: []` (D-5); classe 2 scaduta + classe 1 valida → 201 `warnings: []`. Voli — allievo con LAPL scaduta + istruttore senza visite → **un** documento scaduto `role: person` e **un** «mancante» `role: instructor`, mai doppioni; volo nel giorno di scadenza della visita → nessun documento medico.
- **RBAC** su catalogo/quota (instructor, pilot, student): `GET ?kind=MEMBERSHIP`, `PATCH`/`DELETE` del tipo quota, `POST` di una visita → **403** per tutti e tre (il 409 `MEMBERSHIP_TYPE_LOCKED` non è sondabile da chi non ha `settings.manage`).
- **OpenAPI** servita: `POST kind` enum `RATING/MEDICAL`, filtro `GET kind` a tre valori, 409/422 presenti su PATCH/DELETE.
- **AC 17** (sola lettura, `BEGIN READ ONLY … ROLLBACK`, `SELECT current_database()` = `airmanager_load`; un `CREATE TEMP TABLE` di controllo è stato rifiutato con «cannot execute CREATE TABLE in a read-only transaction»): query letterale di `loadOnBoardFlightDates`, 20 soggetti D-8 con priorità agli istruttori → Bitmap Index Scan su `Flight_personId_idx` e `Flight_instructorProfileId_idx`, **Execution Time 4.330 ms**, Planning 2.094 ms (a caldo, id letterali; il dev misurava anche la sottoquery degli id).
- **UI** (playwright-core su Chromium locale — il Playwright MCP fallisce: «Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome»; screenshot in `scratchpad/ui-*.png`): Piloti 1280 — «Currency 0gg» `badge warn`, «Non current» `badge bad` ×2, tutti dentro la cella da 110px, anche a 1024; tema scuro ok; 375 — chip A «Currency 0gg», B/C «Non current», D/E/F nessuno; Scadenze EN «Membership fee» intero (scrollW = clientW = 105px); categorie IT «Visita medica»/«Rating»; card «Visite mediche»: nessun `medical-scope-select`, nessun checkbox; quota in nessuna card; landing pilota «Scadenza medico 21/05/2027» (la classe 1, non la classe 2 scaduta), «Ratings: Rating SEP».
- **Unit**: i 13 file toccati passano con `env -u DATABASE_URL -u AUTH_SECRET npx vitest run …` → `13 passed, 778 tests`.
- **Grep di AC 16/18**: `categoryOf`/`ExpiryCategory` assenti da `src`; nessun residuo «Licenza» di dominio; nessun import circolare nuovo (`expiries.service.ts` non importa bookings/flights).
- Confini 19.7b/19.8/19.9/19.10 rispettati (nessuna route, nessun check nuovo oltre alla regola mediche, nessuna email).

## Osservazioni non bloccanti

- TD 19.7a-c confermato in pratica: sul DB e2e longevo il documento «mancante» si chiama `Salva MEDICAL ALL 1793606871089-fk5myb / Visita medica classe 1 / …` (tipo lasciato attivo da `person-save.spec.ts`). Innocuo per la suite; da ricordare alla 19.7b.
- Fuori scope e non introdotto dalla story: a 1280 con la sidebar la colonna «Azioni» della tabella Piloti è tagliata a destra (griglia `cols` invariata nel diff).

## Stato della macchina a fine review

- Repo: nessun file modificato da me (`git status` = solo gli untracked/D pre-esistenti: `.agents/`, `.claude/skills/*`, `q.txt`, `skills-lock.json`, …); questo report non committato.
- Server: :3000 (next-server PID 740848, da `npm run start`) e :3001 (PID 742904/742941, gemello) **fermati per PID**; `ss -ltnp | grep -E ":300[01]"` vuoto.
- e2e: nessun run vivo; `scripts/e2e.sh status` = DONE `E2E_EXIT=0` (= la mia catena R2, NON l'arbitro — l'arbitro è nella copia in scratchpad).
- DB: gemello `airmanager_rev197a_mig` **eliminato**; `airmanager_load` solo letto in transazioni READ ONLY; `airmanager` contiene i dati dell'arbitro + le fixture delle mie sonde (persone `Probe Rev197a-…`, velivoli `I-PR…`, tariffe `rev_…`; i 25 tipi della race cancellati) → va resettato prima del prossimo arbitro.
- Nessun `git stash`/`git add`, nessun `docker compose down/up`.
- Script e output delle sonde: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/` (`probe.ts`, `probe-out.json`, `probe-A-out.json`, `hijack.ts`, `ui.ts`, `ui-out.json`, `rank.ts`, `pure.ts`, `explain2.sql`, `mig/`, `arbiter-197a-full.log`, `chain-40-nodeps.log`, `*.png`).
