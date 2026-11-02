# Review adversarial — Story 19.3 «Tariffe allievo/pilota ed editor velivolo a Salva unico»

- **Reviewer**: subagent adversarial (Opus 5.5), 2026-11-02, metodo `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor eseguiti in proprio) + `karpathy-guidelines`.
- **Sotto review**: `2e66d40` (feat) + `84b5c2e` (docs) — diff `dc47b71..84b5c2e` (i commit `125f339`/`5a666b1` nel range sono story file di altre sessioni, fuori perimetro).
- **Contratto**: story file 19.3 (33 AC + Q-a..Q-d ratificate), CR 2026-11-01 (R-19-e/f/m, A6/A7/A12/A16/A17), AD-4 emendato.

## Verdetto

**NON SHIPPABLE così com'è — SHIPPABLE dopo il fix di F1 e un nuovo arbitro verde.** Il codice di prodotto regge tutte le sonde empiriche (prezzo dal profilo congelato, Q-b, esclusività sotto concorrenza, decorrenza Roma provata dal vivo a cavallo della mezzanotte, upsert nativo sotto 60 scritture concorrenti, atomicità del `PATCH` dimostrata sul DB reale con un trigger che fa fallire la tariffa). Ma **l'arbitro è rosso** (F1): un test fallisce in modo deterministico (3/3) per il picker cappato a 100, la 19.3 ne peggiora le condizioni e il Dev Record lo attribuisce erroneamente a «DB sporco»; a cascata **40 test della catena serializzata non sono girati**, fra cui `reports.spec.ts` e `mobile-settings.spec.ts` che la story modifica (li ho eseguiti io in sequenza, v. «Catena serializzata»). Gli altri 3 finding sono LOW.

## Arbitro — suite completa, DB fresco, `CI=1` (build di produzione)

Pre-condizioni verificate: `:3000` libero, `scripts/e2e.sh status` = DONE (run precedente), DB appena resettato (4 `Person`, 0 `Flight`, 0 `LoginAttempt`, ultima migrazione `20261102000000_aircraft_rate_student_pilot_prices`). Lanciato con `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start`, letto SOLO con `scripts/e2e.sh status`. Log salvato in scratchpad (`arbiter-19-3.log`).

```
=== e2e start: 2026-11-02T00:45:58+01:00 ===
  1 failed
    [chromium] › e2e/flight-reversal.spec.ts:156:7 › Flight cancellation and correction with reversal (Story 5.3, AC 1/2/3/4) › cancel a school flight (instructor): balance revert, flight shows ANNULLATO with the reason; a second cancel is a 409; correcting a fresh flight links old->new
  40 did not run
  461 passed (12.6m)
=== e2e end: 2026-11-02T00:58:37+01:00 ===
E2E_EXIT=1
```

- **Conteggio**: 461 + 1 + 40 = **502** = delta dichiarato (489 → 502). I 40 «did not run» sono i 10 project della catena serializzata (`settings` → … → `aog-overview-count`), saltati perché dipendono dal project `chromium` che ha un fallimento.
- **Coincidenza utile**: l'intero run (00:45:58–00:58:37 CET = 23:45–23:58 UTC del 1/11) è caduto nella finestra in cui la data di Roma (2/11) ≠ la data UTC (1/11): ogni helper `todayRome()`/`addDaysIso()` e ogni `validFrom` degli e2e è stato esercitato al bordo. Nessun fallimento di data.
- **Fallimento `flight-reversal.spec.ts:156`** → F1 (diagnosi completa lì). Tentativo, retry #1, retry #2: tutti `locator.selectOption: Test timeout of 90000ms exceeded … did not find some options` alla riga `:213`.
- **Contaminazione del reviewer, dichiarata**: durante l'arbitro (23:49Z) la mia sonda di mezzanotte ha creato 1 velivolo (`I-REVMNMVYHESOB`), 2 persone e 1 volo. Il velivolo si ordina prima di `I-RV…`, ma al momento del test c'erano **112 altri** velivoli prima della marca della fixture (cap 100): non è la causa (query in F1). Nessun altro test è fallito.

## Catena serializzata (i 40 «did not run») — eseguita dal reviewer

Sul DB post-arbitro (il contesto in cui la catena gira sempre: dopo la suite principale), server di produzione sulla build dell'arbitro (`npm run start`, `E2E_REUSE_SERVER=1`), un project per volta con `--no-deps` nell'ordine della catena:

```
settings:  7 passed (17.5s); E2E_EXIT=0
booking-window:  4 passed (11.7s); E2E_EXIT=0
reports:  5 passed (6.5s); E2E_EXIT=0
treasury-settings:  3 passed (8.3s); E2E_EXIT=0
billing-global:  2 passed (4.4s); E2E_EXIT=0
mobile-metar:  3 passed (9.8s); E2E_EXIT=0
mobile-overview-overflow:  1 passed (3.7s); E2E_EXIT=0
mobile-membership-fee:  2 passed (6.1s); E2E_EXIT=0
mobile-settings:  12 passed (46.1s); E2E_EXIT=0
aog-overview-count:  1 passed (3.2s); E2E_EXIT=0
```

**40/40 passed** (= i 40 «did not run»), inclusi i due spec della catena che la 19.3 modifica (`reports.spec.ts`, `mobile-settings.spec.ts`: fixture SQL). Più la riprova di F1: `flight-reversal.spec.ts` col fix temporaneo → 2 passed. Quindi, a codice di prodotto invariato, **l'unico rosso dell'arbitro è F1**; resta comunque dovuto un arbitro completo su DB fresco dopo il fix (la catena qui è girata fuori dal run unico).

## Finding

### F1 — MAJOR — Arbitro rosso: `flight-reversal.spec.ts:156` fallisce in modo deterministico sul picker velivolo cappato a 100; la 19.3 ne peggiora le condizioni e il Dev Record lo attribuisce a «DB sporco»

- **Dove**: `e2e/flight-reversal.spec.ts:213` (e `:269`, stesso idioma) — `page.getByTestId('flight-filter-aircraft').selectOption({ label: aircraft.registration })`. Le opzioni vengono da `src/app/[locale]/dashboard/logbook/page.tsx:121` (`listAircraft(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE /* 100 */, includeArchived: true })`, ordinate per `registration asc`, `aircraft.service.ts:141`).
- **Prova** (DB dell'arbitro, `docker exec airmanager-postgres-1 psql`): la fixture del primo tentativo è `I-RV1793577013599-UW`, creata alle `23:50:13.632`; velivoli con marca minore creati entro 30 s: **113, di cui 1 mio** → 112 altri, 12 oltre il cap. Ripartizione per prefisso: `I-BK` 51 (bookings), `I-FL` 14, `I-AOG`+`I-AOGB` 19, `I-R` 8, `I-EX` 4, … I retry vedono solo PIÙ velivoli (113 → 131 al retry #2): **per questa classe il retry di Playwright non può mai passare**, quindi il fallimento è strutturalmente 3/3.
- **Ruolo della 19.3**: `aircraft-rates.spec.ts` (che gira per primo, alfabetico) creava 6 velivoli ordinati prima di `I-RV` (`R1`, `R2`, `R4`, `R5`, `C1`, `F1`); ora ne crea 11 (`R1`…`R8`, `A1`, `A3`, `C1` — `A2` è rifiutato dal 422, correttamente), **+5** prima del test. La classe (TD noto dei picker, «TD 19.3-b» nel record) dipende dal timing della suite; l'arbitro della 19.2 lo aveva passato, quello della 19.3 no. Il Dev Record §G scrive che i due rossi del run 2 erano «DB non resettato fra i due run … non la story» e li dà «verdi su gemello fresco» — ma quella riprova eseguiva SOLO i 2 spec, non la suite in ordine: un falso verde. Su DB fresco, suite completa, riproduce.
- **Conseguenza**: exit 1 e, a cascata, 40 test della catena non eseguiti (fra cui `reports.spec.ts` e `mobile-settings.spec.ts`, modificati dalla story).
- **Fix suggerito (provato)**: navigare direttamente col filtro in URL, che il registro supporta già (`logbook/page.tsx:96`), invece di cercare l'opzione nel select cappato:
  ```ts
  await page.goto(`/it/dashboard/logbook?aircraftId=${aircraft.id}`);
  await expect(page).toHaveURL(/aircraftId=/);
  ```
  sostituendo le coppie `goto('/it/dashboard/logbook')` + `selectOption` a `:212-213` e `:268-269`. **Verifica**: patch temporanea applicata, `E2E_REUSE_SERVER=1 scripts/e2e.sh start e2e/flight-reversal.spec.ts --no-deps` sul DB post-suite (277 velivoli, condizione peggiore dell'arbitro) → `2 passed`, `E2E_EXIT=0`; file ripristinato, `sha256sum -c` → `e2e/flight-reversal.spec.ts: OK` (`72361aef…2bff`). Stessa classe, da sistemare nello stesso commit per non ripagare un arbitro: `flight-log.spec.ts:323`, `:368`, `:372` e `flights.spec.ts:490` (`selectOption({ label })` sullo stesso select; in questo run sono passati per timing). Poi **nuovo arbitro su DB fresco** (atteso 502 senza «did not run»).

### F2 — LOW — `PATCH /aircraft/{id}` con `rate`: il controllo «velivolo archiviato → 409» è un pre-check senza lock; un archivio concorrente lascia una tariffa su un velivolo archiviato (20/20)

- **Dove**: `src/server/services/aircraft.service.ts:261` (`findUnique`) e `:268` (409 archiviato) FUORI dalla transazione, poi `:290` `upsertAircraftRateCore` dentro una transazione che non rilegge né blocca la riga `Aircraft`. Stesso TOCTOU pre-esistente in `rates.service.ts:139` → `:146` (`createAircraftRate`) — la 19.3 lo replica sul percorso nuovo che l'AD-3 passo 3 introduce.
- **Riproduzione** (`atomic-patch.mjs archive-race`, scratchpad): 20 volte `Promise.all([POST /aircraft/{id}/archive, PATCH /aircraft/{id} {rate: oggi+2}])` → **20/20 entrambe 200**; in DB `archivedAt 00:00:44.530` e tariffa `createdAt 00:00:44.534` (l'archivio era GIÀ committato quando la tariffa è stata scritta).
- **Impatto**: basso (un velivolo archiviato non vola: `AIRCRAFT_ARCHIVED`; se riattivato, la tariffa è un prezzo che l'admin aveva davvero inserito). Ma è proprio la regola che AD-3/AC 20 dichiarano («`PATCH` con `rate` su un velivolo archiviato → 409»).
- **Fix suggerito**: dentro la `$transaction`, prima dell'upsert, `SELECT "archivedAt" FROM "Aircraft" WHERE "id" = $1 FOR NO KEY UPDATE` e 409 se valorizzato (ordine `Aircraft → AircraftRate`, compatibile con `Aircraft → Account` del registro voli e `Booking → Aircraft → Person` delle prenotazioni); stesso trattamento in `createAircraftRate`. Oppure accettarlo come TD dichiarato.

### F3 — LOW — Editor velivolo: il 409 «velivolo archiviato» viene mostrato come «Esiste già un velivolo con queste marche.»

- **Dove**: `src/app/[locale]/dashboard/fleet/aircraft-editor.tsx:511` (`onSubmit`, ramo non-ok): `setFormError(code === 'CONFLICT' ? labels.errors.conflictRegistration : …)`. Con la 19.3 il `PATCH` può rispondere 409 `CONFLICT` anche per `'Cannot add a rate to an archived aircraft.'` (stesso codice generico di `ConflictError`, `errors.ts:69`).
- **Riproduzione** (`ui-errors.mjs`, playwright-core sull'app reale): editor aperto su un velivolo operativo; nel frattempo `POST /archive` da un'altra sessione (200); nell'editor 120,00/140,00 + Salva → `PATCH -> 409 {"error":{"code":"CONFLICT","message":"Cannot add a rate to an archived aircraft."}}` e banner **«ESISTE GIÀ UN VELIVOLO CON QUESTE MARCHE.»** (screenshot `archived-elsewhere-1280.png`). Le marche non sono state toccate: il messaggio indirizza l'utente sul campo sbagliato.
- **Fix suggerito**: un codice dedicato sul 409 dell'archivio (es. `AIRCRAFT_ARCHIVED`, documentato in OpenAPI sui due percorsi tariffa) mappato su un messaggio proprio (o sul `readOnlyHint` + refresh del pannello); in alternativa, minimo, `generic` quando il body conteneva `rate` e le marche non cambiavano.

### F4 — LOW (doc) — Il doc-comment di `AircraftRate` afferma un invariante che la story stessa smentisce per la riga di oggi

- **Dove**: `prisma/schema.prisma:334-336` (doc di `model AircraftRate`): «a past row can never change, so a registered flight's frozen price never disagrees with the history».
- **Prova**: la riga di OGGI è riscrivibile (R-19-f) e i voli di oggi già registrati restano al prezzo vecchio — è esattamente AC 6. Nel DB dell'arbitro: volo `cmvyhh95p01f91epvqviadrgr` (`I-FL1793577070769-DI`, 2026-11-02, `PILOT`) congelato a **14000** mentre la riga in vigore quel giorno dice `16000/15000@2026-11-02` (query di coerenza: 134 voli, 1 solo disaccordo, proprio questo). Il comportamento è quello ratificato (AD-4: «entrambi legittimi in quell'istante»); è falsa la frase.
- **Fix**: «a row before today never changes; today's row can still be rewritten, and a flight already registered today keeps the price it froze (AD-4)».

## Decisioni PO (facoltative, nessuna bloccante)

- **D-1 con una variazione programmata in mezzo** (non è un finding: è la scelta D-1 della story, qui solo resa visibile). Campo vuoto = prezzo in vigore **oggi**, anche quando la nuova decorrenza è futura e una variazione programmata cade prima di essa. Esempio: attuale 120/140, programmata +20 gg 130/150; salvo a +40 gg allievo 160 e pilota vuoto → da +40 gg il pilota **torna a 140**, annullando in silenzio l'aumento programmato su quella colonna. L'hint dice «lascia vuoto per non cambiarlo». Se il PO lo trova controintuitivo, l'alternativa è «vuoto = prezzo in vigore alla decorrenza scelta» (il client ha già `scheduledRate`). **Dimostrato sull'app reale** (`d1-demo.mjs`, velivolo `I-REVRRMVYHT34H`): prima `[2026-11-07 30004/40004, 2026-11-02 10019/20019]`, hint pilota «Attuale: 200,19 €/h — lascia vuoto per non cambiarlo.»; allievo 500,00 + «In vigore da» 20/11 + pilota vuoto → body `{"studentPriceCents":50000,"pilotPriceCents":20019,"validFrom":"2026-11-20"}` → dopo: il pilota fa 200,19 → **400,04 dal 7/11 → di nuovo 200,19 dal 20/11**.
- **Deviazione §H-4 «Aggiungi istruttore»** — la approvo: con Q-c = B è l'unica altra UI che attiva l'istruttore, il 422 andava mappato. Verificata sull'app reale: banner «Questa persona ha un profilo allievo attivo: disattivalo prima di attivare l'istruttore.» (`add-instructor-student-1280.png`). Manca un e2e che la copra: da aggiungere (fix commit o 19.4).

## Verificato corretto (con prova)

- **Prezzo dal profilo, congelato con la categoria (AC 9-10, P2)**: e2e AC 10 verde nell'arbitro; coerenza sul DB dell'arbitro (prezzo applicato = colonna della categoria della riga in vigore a `flightDate`): `STUDENT 11 voli / 0 discordanti`, `PILOT 123 / 1` (il caso AC 6 voluto, F4).
- **Q-b sulla correzione, stack reale** (`qb-correction.mjs`): allievo, volo Scuola 60' → `STUDENT 10000`; `PUT pilot` con allievo attivo → **422**; disattiva allievo → 200; attiva pilota → 200; correzione stessa persona → **`STUDENT` a 10000 €/h** (50,00 € per 30'); correzione che cambia persona verso un pilota → **`PILOT` a 15000**. Catena `correctionOfId` coerente in DB.
- **Esclusività sotto concorrenza (AC 13-15, Q-c)** (`race-profiles.mjs`, 75 persone, 225 richieste concorrenti): A1 tre attivazioni parallele pilota/allievo/istruttore → `200/422/200` ×21, `422/200/422` ×4; A2 allievo attivo + [disattiva allievo, attiva pilota, attiva istruttore] in parallelo → `200/200/200` ×23, `200/200/422` ×2; A3 pilota attivo + [disattiva pilota, attiva allievo ×2] → `200/200/200` ×25. **Violazioni in DB: 0** (allievo attivo con pilota o istruttore attivo, anche sull'intero DB). Nessun 500. Censimento lock rifatto: unica nuova acquisizione `people.service.ts:745` `Person FOR NO KEY UPDATE` come primo statement; nessuna transazione prende `Account` poi `Person`.
- **Decorrenza Roma dal vivo (AC 4, A16)**: alle 00:49 CET (23:49Z del 1/11) sull'app reale `validFrom=2026-11-01` → **422 `RATE_VALID_FROM_IN_PAST`**, `2026-11-02` → **201**; un volo delle 00:29 di Roma → `flightDate 2026-11-02` e prezzo della riga del 2/11 (2000 €/h × 15' = 500); la pagina Flotta, nella stessa finestra, espone `currentRate {1000, 2000}` = la riga del 2/11 (D-8). Sul DB post-arbitro: **0** righe tariffa (velivolo e istruttore) scritte via API con `validFrom` < data di Roma della scrittura (76 + 17 righe `e2e_` della fixture SQL, le sole nel passato).
- **Riscrittura senza 500 (AC 5, upsert nativo)** (`race-rates.mjs`): 3 round × 20 `POST /rates` concorrenti sullo stesso giorno → 60 × **201**, **1 riga**, coppia di prezzi coerente (stessa richiesta); 2 round × 15 `PATCH` con `rate` → 30 × **200**, 1 riga per data. Voli già registrati intatti (e2e AC 6 verde; DB in F4).
- **Atomicità del `PATCH` composito (AC 20, A17) sul DB reale**: (a) **la tariffa fallisce → l'identità non si salva**: trigger temporaneo `BEFORE INSERT OR UPDATE ON "AircraftRate"` che solleva su `studentPriceCents = 4242`; `PATCH {model, registration nuove, rate 4242}` → 500 (fallimento artificiale) e dopo: marche e modello **invariati**, 0 tariffe; trigger e funzione rimossi (`pg_trigger`/`pg_proc` → 0). (b) **l'identità fallisce → la tariffa non si salva**: marche duplicate + tariffa valida → 409, 0 tariffe; 15 gare di rinomina sulla stessa marca, ognuna con la sua tariffa → 15 × (un 200, un 409), **il perdente non ha mai una tariffa**.
- **RBAC** (`rbac.mjs`): `POST /aircraft/{id}/rates`, `PATCH` con `rate`, `POST /people/{id}/instructor-rates`, `PUT …/profiles/student`, `GET /aircraft/{id}/rates` → admin 201/200/201/422 `STUDENT_PROFILE_EXCLUSIVE`/200; pilota, istruttore, allievo → **403** su tutto.
- **OpenAPI servito (AC 31)**: `GET /api/v1/openapi.json` 200 — `studentPriceCents` 23, `pilotPriceCents` 23, `aircraftPriceCategory` 14, `RATE_VALID_FROM_IN_PAST` 4, `STUDENT_PROFILE_EXCLUSIVE` 4, `dryHourlyRateCents` **0**; `UpdateAircraftRequest` = `{model, rate, registration, type}`; `AircraftRate` senza `priceCentsPerHour`.
- **Editor velivolo e superfici (AC 17-25, 27, 33)** — playwright-core sull'app reale (MCP non disponibile: `Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`), 1280×900 e 375×812, `timezoneId Europe/Rome`: un solo `<form>`, unico submit «Salva modifiche» nel `.so-foot` (`["Annulla","Salva modifiche"]`); nel corpo solo i bottoni d'azione `["Fuori servizio","Archivia"]`; placeholder `100,19`/`200,19` = tariffa attuale; hint «Attuale: 100,19 €/h — lascia vuoto per non cambiarlo.»; «In vigore da» = `min` = `2026-11-02`; riga «Variazione programmata dal 07/11/2026: allievo 300,04 €/h · pilota 400,04 €/h» (la più vicina); nessun wet/dry/storico; calendario `DDDDDDDT……` (26/10–1/11 disabilitati e barrati, 2/11 `.today` abilitato, «Oggi» abilitato); `scrollWidth == innerWidth` a 1280 e 375; card desktop «I-REVRRMVYHT34H Disponibile Race 2-4», card mobile «… Ore mese 0:00», sheet mobile «STATO · ORE TOTALI · ORE MESE» — **nessun prezzo** (Q-a). Screenshot: `fleet-*.png`, `editor-*.png`, `calendar-*.png`, `sheet-375.png`.
- **Migrazione**: letta riga per riga — rename `priceCentsPerHour → pilotPriceCents`, copia su `studentPriceCents`, drop del dry; disattivazione allievo se pilota **o istruttore** attivi (Q-c) PRIMA del backfill; backfill categoria «solo allievo → STUDENT, altrimenti PILOT». Il DB dell'arbitro è stato migrato da zero con essa (diff schema implicitamente verde: build + suite).
- **Fixture SQL `e2e/db-fixtures.ts`**: usata solo per tariffe nel PASSATO in spec il cui soggetto non è l'API tariffe; l'API (422, riscrittura, 201) resta provata in `aircraft-rates`/`instructor-rates` (e `bookings.spec.ts:2040` usa l'API con `todayRome()`). Scrive le stesse colonne dei core; nessuna validazione che quegli spec dovessero esercitare viene saltata.
- **Unit**: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 7 file toccati → `Test Files 7 passed (7) · Tests 414 passed (414)` (nessuna dipendenza dall'env eager). Le prove di fuso (`2026-11-01T23:30:00Z`) usano `vi.useFakeTimers()`.
- **Grep AC 30 / AC 5 / AC 8 e i18n**: residui = solo le due asserzioni di assenza dichiarate (§H-7); `aircraftRate.create|instructorRate.create` in `src/server` = 0; `/rates` in `aircraft-editor.tsx` = 0; parità it/en **1713/1713**, `diff` vuoto.

## Note (non finding)

- **N1 — TD 19.3-a confermato per costruzione**: il pannello tariffe istruttore (`instructor-rates-panel.tsx:71`, non toccabile per AC 26) propone come default la data UTC: nella finestra 00:00–01:00/02:00 di Roma il default è «ieri» → 422, e il pannello mostra il messaggio generico (non mappa `RATE_VALID_FROM_IN_PAST`). L'arbitro, girato tutto nella finestra, è verde su `instructor-rates` solo perché lo spec digita `todayRome()`. Da chiudere nella 19.4 (default Roma + mappatura del 422).
- **N2 — Backfill D-5 dal profilo attuale**: i voli storici di chi era allievo ed è oggi pilota ricevono `PILOT`; innocuo sul prezzo (le righe pre-migrazione hanno allievo = pilota), salvo una correzione futura che sposti la data di uno di quei voli oltre la migrazione (caso limite, accettabile).
- **N3 — TD 19.3-c** (`today` fissato al mount dell'editor): dichiarato, il 422 server è mappato sul campo.

## Stato della macchina a fine review

- **Repo**: nessun file tracciato modificato dal reviewer (`git status`: solo la cancellazione pre-esistente `.claude/skills/design-taste-frontend/SKILL.md` e gli untracked dell'utente); patch temporanea di `e2e/flight-reversal.spec.ts` ripristinata e verificata con sha256. Questo report è untracked (non committato).
- **DB `airmanager`**: SPORCO — dati dell'arbitro + run mirati + sonde del reviewer (velivoli `I-REV*`, persone `Rev …` con cognomi `Race3-/RaceSw-/RacePs-/QB*/Rbac-/UiStud*/Midnight*`, tariffe `rev_*`, voli di prova). Trigger temporaneo rimosso. Va resettato prima del prossimo arbitro. `airmanager_load` mai toccato; nessun `docker compose down/up`, nessuno `stash`/`add`.
- **Server**: il `npm run start` avviato dal reviewer (pgid `360530`: `npm run start` 360530 + `next-server` 360545) è stato fermato per PGID; `:3000` libero; `scripts/e2e.sh status` → `DONE — E2E_EXIT=0` (ultimo run della catena), nessun run vivo. Playwright MCP non utilizzabile (Chrome assente nel container MCP): usato `playwright-core` su `chromium-1228`.
- **Log, script e screenshot** (scratchpad `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad`): arbitro `arbiter-19-3.log`; catena `chain-<project>.log`; riprova F1 `flight-reversal-patched.log`; sonde `midnight*.mjs`, `race-profiles.mjs`, `race-rates.mjs`, `atomic-patch.mjs`, `trigger-on/off.sql`, `qb-correction.mjs`, `rbac.mjs`, `ui375.mjs`, `ui-errors.mjs`, `d1-demo.mjs`; screenshot `*.png`; `last-run.log` corrente = l'ultimo run della catena.
