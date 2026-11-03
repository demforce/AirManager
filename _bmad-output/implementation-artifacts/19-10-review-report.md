# Story 19.10 — Review adversarial (Opus 5.5)

- **Story**: `19-10-avviso-deroga-prenotazioni.md` (39 AC). **Commit sotto review**: `a0aba91` (feat) + `dc69faf` (docs), baseline `933de13`.
- **Metodo**: `bmad-code-review` (Blind Hunter / Edge Case Hunter / Acceptance Auditor svolti in proprio, nessun subagent), `karpathy-guidelines`; verifica empirica su API reale, `psql`, sonde di concorrenza, UI reale (`playwright-core` su `chromium-1228`, `localhost`).
- **Data**: 2026-11-03, 01:03-01:45 Europe/Rome (arbitro avviato alle 01:04, dopo la finestra 23:40-01:00 dei TD-19.10-a/b).
- **Script e prove**: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/r1910/` (`lib.cjs`, `probe-api.cjs`, `probe-conc.cjs`, `probe-pool.cjs`, `probe-pool2.cjs`, `probe-cross.cjs`, `probe-fee.cjs`, `probe-ui.cjs`, `topups.cjs`; esiti `*.json`, screenshot in `shots/`, artefatti dell'arbitro in `arbiter-artifacts/`).

## Verdetto

**SHIPPABLE CON FIX — ma la story NON si chiude sull'arbitro attuale: l'arbitro completo su DB fresco è ROSSO** (`E2E_EXIT=1`, 1 failed deterministico causato dalle fixture e2e di questa story, F1). Il fix è piccolo e confinato a `e2e/helpers.ts`; dopo il fix serve un nuovo arbitro completo.

Il cuore della story regge alla verifica empirica: forma unica `REQUIREMENTS_NOT_MET` sui tre percorsi e sulla quota, deroga decisa per ultima dopo ogni non derogabile (passato, velivolo inesistente/archiviato/fuori servizio, 409 — con e senza `force`, create/move/approve), `force` → 403 prima di ogni query (anche su id inesistenti: nessun oracolo 404), own-path bloccato con l'elenco in modalità bloccata (IT/EN), stima del costo esatta (categoria, tariffa del giorno del volo, istruttore), date di riferimento Q-19.10-a = B (scadenze al giorno di Roma di `startsAt`, quota/currency a oggi), R-19-o su persona con entrambi i profili (anche col profilo istruttore disattivato), sonde di concorrenza 10/10 su quattro varianti, nessun deadlock fra prenotazioni / voli / Salva unico persona / ricariche, SQL «essere umano» = 0, migrazione, OpenAPI servito, deroga quota con `Idempotency-Key`.

Finding: **F1 MAJOR** (arbitro rosso, fixture), **F2 MINOR** (pool: approvazioni concorrenti ≥ 10 = 500 per tutti + API ferma ~5 s; meccanismo preesistente, mantenuto da AD-3), **F3 MINOR** (a11y del modale desktop), **F4 LOW** (D-a legge il profilo istruttore fuori dal lock), **F5 LOW** (flaky `bookings.spec.ts:1237`), **F6 osservazione** (finestra globale di `withBlockingRating`).

## Arbitro (priorità zero)

Prima del run: `ss -ltnp | grep :3000` vuoto; `scripts/e2e.sh status` = DONE (run mirato del dev delle 01:01, `E2E_EXIT=0`). DB `airmanager` resettato (DROP/createdb nel container, `migrate deploy`, `db seed`). Lancio: `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (01:04:18).

Esito verbatim (`scripts/e2e.sh status`, 01:28):

```
state: DONE — E2E_EXIT=1
  1 failed
    [chromium] › e2e/mobile-billing.spec.ts:894:7 › Contabilità mobile (story 15.8a) › AC 11: nessun overflow di pagina, nessuno scroller nascosto, nessun testo tagliato senza ellissi e nessun controllo coperto dalla tab bar
  1 flaky
    [chromium] › e2e/bookings.spec.ts:1237:7 › Booking edit/cancel (Story 7.3, AC 1/2) › an overlap on a move shows 409 in the Sposta form
  52 did not run
  543 passed (24.3m)
```

- **Totale 543 + 1 + 1 + 52 = 597** = delta dichiarato 580 → 597 (conteggio corretto).
- **52 did not run** = l'intera catena serializzata (`settings` → … → `aog-overview-count`), saltata perché il project `chromium` ha un failure. Eseguita a parte, sullo stesso DB sporco subito dopo l'arbitro, con `E2E_REUSE_SERVER=1 scripts/e2e.sh start --project=settings … --project=aog-overview-count --no-deps --workers=1`: **`52 passed (3.9m)`, `E2E_EXIT=0`** (incluso il caso AC 2 e2e «fuori finestra con e senza `force`» di `booking-window.spec.ts`).
- Copie dei log: arbitro `scratchpad/r1910/arbiter-full.log`; catena `scratchpad/r1910/chain-nodeps.log`; failure mobile-billing da solo su DB sporco `billing894-dirty.log`, su DB fresco + ricariche `billing894-fresh-plus-topups.log`; ripetizione di 1237 `b1237-repeat.log`; artefatti Playwright (error-context, trace) in `scratchpad/r1910/arbiter-artifacts/`.

### Diagnosi del failure — `mobile-billing.spec.ts:894` (3 tentativi su 3, deterministico) → F1

```
Error: hidden scrollers @320
+   Object { "cls": "", "cw": 226, "sw": 228 },
+   Object { "cls": "billing-cat-line", "cw": 226, "sw": 228 },
```

Lo snapshot della pagina mostra la riga «Per categoria → Ricariche: Entrate **112.445,00 €** / Uscite 0,00 € / Netto 112.445,00 €»: a 320 px i tre importi a 6 cifre stanno 2 px oltre la cella. Composizione delle ricariche sul DB dell'arbitro (a metà run): `TOP_UP 148 movimenti, 126.944,24 €`, di cui **28 da esattamente 400 000 cent e 1 da 390 000** = le ricariche di `ensureBookingRequirements` (`e2e/helpers.ts:321-323`: `2 * BOOKING_BALANCE_FLOOR_CENTS − saldo`, floor 200 000). Senza di esse il totale è ~6.000 € (4 cifre), come in ogni arbitro precedente (19.9: 579/579, questo test verde).

Prova causale (server di produzione sulla build dell'arbitro, `E2E_REUSE_SERVER=1`, `--retries=0`):
1. DB sporco dell'arbitro, test da solo → **failed**, stesso `cw 226 / sw 228`.
2. DB **fresco** → **1 passed**.
3. Stesso DB fresco + 28 piloti con una ricarica di 4.000 € ciascuno (`topups.cjs`, l'importo esatto dell'helper) → **failed**, identico (`cw 226 / sw 228`, `billing-cat-line`).

Attribuzione: **story 19.10, fixture e2e** (non un difetto del codice di prodotto della story).

### Diagnosi del flaky — `bookings.spec.ts:1237` (fallito 2 volte, verde al retry #2) → F5

- Tentativo 1: `expect(await countBookingRowsAcrossPages(page, aircraft.registration)).toBe(2)` (riga 1263) → `Received: 1`.
- Retry #1: timeout a `selectFromCombobox` (helper `:168`) sulla **seconda** scelta del velivolo: «locator resolved to `<li role="option" … class="combo-option active">` … element was detached from the DOM, retrying», e nello snapshot finale nessun `listbox` (popup chiuso, campo a fuoco col testo digitato). Il trace mostra la POST `/api/v1/bookings` 201 (288 ms) seguita dal `router.refresh()` (`GET /it/dashboard/bookings?_rsc=…`, **566 ms**) che si chiude esattamente fra il `fill` e il click sull'opzione: il refresh post-successo chiude il popup del combobox.
- Da solo: `--repeat-each=6 --workers=3 --retries=0` → **6 passed** (`b1237-repeat.log`).
- Classi: passeggiata di pagina sotto inserimenti paralleli (classe nota «pagina 1 / passeggiate di pagina») e popup del combobox chiuso dal refresh post-successo (classe picker). Il test non è cambiato nei passi (solo `inRegola: true`), ma non era mai stato flaky negli arbitri 19.9 (0 flaky) ed è flaky in **entrambi** i run della 19.10 (serie 3 del dev e questo arbitro): carico più alto (+17 test, più prenotazioni e POST più lente per la valutazione dei requisiti). Non è un difetto della 19.10; il test è fragile (F5).

## Finding

### F1 — MAJOR (blocca la chiusura) — le ricariche di `ensureBookingRequirements` gonfiano un aggregato GLOBALE e rompono `mobile-billing.spec.ts:894`

- **Dove**: `e2e/helpers.ts:284` (`BOOKING_BALANCE_FLOOR_CENTS = 200_000`), `:321-323` (ricarica di `2 × floor − saldo` = 4.000 € per ogni persona appena creata); 47 chiamate in 12 spec (`grep -n "ensureBookingRequirements\|inRegola: true" e2e/*.ts`).
- **Effetto**: il totale mensile «Ricariche» supera i 100.000 € durante la suite; la riga `billing-cat-line` del pannello «Per categoria» a 320 px nasconde 2 px (`src/app/[locale]/dashboard/billing/billing-console.tsx:1100`) → il test AC 11 della 15.8a fallisce 3/3 → il project `chromium` è rosso → 52 test della catena non girano. AC 35 («arbitro completo verde») non soddisfatto.
- **Riproduzione**: vedi «Prova causale» sopra (fresco verde; fresco + 28 × 4.000 € rosso).
- **Fix suggerito**: ricaricare solo quanto serve (`floor − saldo`, non `2 × floor − saldo`) con un floor misurato sulla stima più alta dei flussi own-path in regola (i velivoli con tariffa usati da quei flussi sono 90-120 €/h: un floor di qualche centinaio di euro basta), così il totale resta nell'ordine di grandezza di prima; verificare con gli stessi due passi (fresco + spec che chiamano l'helper, poi `mobile-billing.spec.ts:894`) e poi nuovo arbitro completo. È la stessa lezione di CLAUDE.md sugli aggregati globali sotto `fullyParallel`, applicata alle fixture.
- **Separato, da TD (preesistente, non della 19.10)**: a 320 px la riga di categoria non regge tre importi a 6 cifre (`112.445,00 €`): un limite di layout reale per un club con più di 100.000 € in una categoria nel mese. Da registrare come TD, non da correggere qui.

### F2 — MINOR (preesistente, mantenuto da AD-3) — ≥ 10 approvazioni concorrenti si autobloccano sul pool: tutte 500, e l'API intera ferma ~5 s

- **Dove**: `src/server/services/bookings.service.ts:1506-1512` (`evaluateBookingRequirements(tx, …)` dentro `prisma.$transaction`, ma `evaluateRequirements` legge con `prisma`, cioè con una **seconda** connessione) e `:1518` (`assertWithinSchedulingWindow` → `getSchedulingSettings`, idem). Ogni approvazione tiene la sua connessione di transazione e ne chiede un'altra; con N ≥ dimensione del pool (10, adapter pg di default) nessuna può proseguire finché il timeout di 5 s delle transazioni interattive non le uccide tutte.
- **Prova** (`probe-pool.cjs`, `probe-pool2.cjs`, server di produzione, DB fresco):
  ```
  8  {"tally":{"200":8},"ms":113}
  9  {"tally":{"200":9},"ms":131}
  10 {"tally":{"500:INTERNAL_ERROR":10},"ms":5085}
  14 (probe-conc C6) 14 × 500:INTERNAL_ERROR, 5173 ms
  10 approvazioni SENZA force: {"500:INTERNAL_ERROR":10} 5165 ms; una GET /api/v1/bookings lanciata durante lo stallo: {"status":500,"ms":2038}
  contrasto: 12 create parallele {"201":12} 218 ms; 12 move parallele {"200":12} 204 ms
  ```
  Log del server: `P2028 … Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5054 ms passed` (×10) e `Unable to start a transaction in the given time.`
- **Preesistente**: su `933de13` l'approvazione chiamava già `findBlockingExpiredDocuments` (`prisma.expiry.findMany` + `getMedicalRequirementFailure`) dentro la transazione (`933de13:bookings.service.ts:1362`, `:482`): la soglia (= dimensione del pool) è la stessa per costruzione (dedotto dal codice, non misurato sulla baseline). La 19.10 riscrive proprio questo percorso e allunga il tratto in cui la transazione aspetta la seconda connessione (≈ 10 query invece di 2-3); AD-3 lo dichiara («nessuna connessione in più rispetto a oggi per richiesta»), ma il modo di guasto è totale (tutte le richieste dell'app falliscono per ~5 s), non solo le approvazioni.
- **Fix suggerito**: valutare i requisiti dell'approvazione **prima** della transazione come già fanno create e move (lettura non bloccata della prenotazione → valutazione → in transazione, sotto il lock `Booking`, verificare che `status/personId/instructorProfileId/aircraftId/startsAt/endsAt` siano invariati, altrimenti 409 o rivalutazione), e lo stesso per `getSchedulingSettings`. **Decisione della sessione principale**: correggere ora o registrare come TD (non è una regressione funzionale; la probabilità reale con un solo admin è bassa, ma un client API/Flutter in batch la raggiunge).

### F3 — MINOR (a11y) — il modale desktop dell'approvazione non è un dialogo

- **Dove**: `src/app/[locale]/dashboard/bookings/bookings-table.tsx:914-915` (`<div className="mini-modal"><div className="mini-modal-card" data-testid="booking-requirements-modal">`).
- **Prova** (`probe-ui.cjs` U3, 1280): focus all'apertura sull'avviso ✓, «Annulla» restituisce il focus ad «Approva» ✓, ma `closest('[role="dialog"]')` / `[aria-modal="true"]` → `{"dialog":false,"ariaModal":false}`; dopo 3 × Tab il focus è su `BODY` (esce dal modale verso la pagina/browser, nessuna trappola); Escape non lo chiude.
- **Contesto**: AD-6 chiedeva «stesso markup del modale di rifiuto», e il modale di rifiuto (`:870-871`) e il pannello quota hanno le stesse lacune: è un pattern preesistente, ma la story aggiunge una superficie modale nuova mentre la 15.10 ha già reso `SlideOver`/`MobileSheet` dialoghi con focus trap (`src/components/ui/focus-trap.ts`).
- **Fix suggerito**: `role="dialog" aria-modal="true"` con `aria-labelledby` sul titolo dell'avviso, `focus-trap.ts` condiviso, Escape = «Annulla»; per i due `mini-modal` preesistenti un TD. Decisione: ora per il solo modale nuovo, o TD per tutti e tre.

### F4 — LOW — D-a: l'id del profilo istruttore della persona è letto FUORI dal lock `Person`

- **Dove**: create `bookings.service.ts:797-800` (lettura fuori transazione) → usato in `:872`; move `:1182` → `:1272`; approvazione `:1500` (in transazione ma prima del lock) → `:1541`. Il predicato persona di D-a (`OR [{ personId: P }, { instructorProfileId: <profilo di P> }]`, `:466-474`) dipende da quella lettura, mentre la forma di AD-5 (`instructorProfile: { personId: P }`) era valutata sotto il lock.
- **Scenario**: T1 legge P (nessun profilo istruttore) → T2 crea il profilo istruttore di P (commit) → T3 crea una prenotazione APPROVED con P istruttore, sovrapposta (prende e rilascia il lock di P) → T1 prende il lock di P e cerca con `personInstructorProfileId = null` → non vede T3 → due prenotazioni sovrapposte per lo stesso «essere umano». Finestra di decine di ms contro una catena di 3 richieste: **non riprodotto**, dimostrato per lettura del codice; il doc-comment del modulo dichiara il pre-check «airtight».
- **Fix suggerito**: dopo `lockBookingPeople`, rileggere `InstructorProfile.id WHERE personId = P` con `tx` (lookup sull'indice unico `personId`, costo trascurabile) e passarlo al predicato; resta la forma indicizzata misurata in §E (confermata da me su `airmanager_load` in `BEGIN READ ONLY`: forma con join = `Seq Scan on "Booking"` + Hash Left Join, 15,8 ms; forma adottata = `BitmapOr` di `Booking_personId_idx` e `Booking_instructorProfileId_idx`, 2,1 ms).

### F5 — LOW (robustezza e2e) — `bookings.spec.ts:1237` fragile sotto carico

- **Dove**: `e2e/bookings.spec.ts:1255-1263` e `:1257` (seconda `selectFromCombobox` subito dopo il primo successo).
- **Problemi**: (a) l'asserzione `:1261` `booking-form-success` passa già sul banner del PRIMO invio, quindi un secondo invio fallito o non ancora partito diventa un «Received: 1» a `:1263`; (b) la seconda scelta del combobox corre contro il `router.refresh()` post-successo, che chiude il popup (trace: RSC 566 ms fra `fill` e click).
- **Fix suggerito**: aspettare la seconda POST (`page.waitForResponse` su `POST /api/v1/bookings` → 201) invece del banner persistente; prima della seconda selezione aspettare la fine del refresh (o chiudere e riaprire il pannello). Diagnosi completa sopra.

### F6 — Osservazione (classe TD 16.2-g) — `withBlockingRating` rende un RATING bloccante `scope: 'ALL'` mancante per tutti, per la durata di una richiesta

- **Dove**: `e2e/booking-requirements.spec.ts:166-178` (usato a `:221` e `:332`). Durante quella finestra ogni prenotazione/volo senza `force` di uno spec parallelo riceve un 422 con un EXPIRY mancante estraneo (la 19.9 aveva scelto `scope: 'STUDENTS'` per lo stesso motivo, D-o). Non osservato in questo arbitro; nessuna azione ora, ma la diagnosi di un futuro flaky «EXPIRY mancante di un tipo `Zz rating prenotazioni …`» è questa.

## Decisioni PO / sessione principale necessarie

1. **F2**: correggere ora (requisiti dell'approvazione valutati prima della transazione) o TD.
2. **F3**: modale nuovo reso dialogo ora, con TD per il modale di rifiuto e il pannello quota, oppure TD unico per i tre.
3. **F1**: nessuna decisione di dominio (fix delle fixture); registrare il TD del layout a 320 px con importi a 6 cifre.

## Verificato corretto (con prove)

- **RBAC / 403 prima di ogni query** (`probe-api.cjs` A1-A11, tutti PASS): pilota POST own con `force` → 403, **anche su un velivolo inesistente** (403, non 404); pilota PATCH con `force` su una prenotazione **inesistente** → 403 (prima della lettura); istruttore PATCH idem → 403; istruttore per l'allievo con `force` → 403, anche con `personId` inesistente (nessun oracolo); pilota transition con `force` → 403; allievo POST → 403; pilota membership-fee con `force` → 403; admin PATCH `force` su inesistente → 404; `PATCH {force:true}` → 422 `VALIDATION_ERROR`; `transition {to:'DENIED', reason, force:true}` → 422 `VALIDATION_ERROR`.
- **Deroga decisa per ultima** (B0-B14): persona non conforme (EXPIRY, MEMBERSHIP, CURRENCY, BALANCE) + passato → `BOOKING_IN_PAST`; + velivolo inesistente → 404; + fuori servizio → 422 `AIRCRAFT_OUT_OF_SERVICE`; + archiviato → 409; + velivolo occupato → 409 `CONFLICT`; ciascuno **con e senza `force`**, su create, move (fuori servizio, occupato, archiviato) e approvazione (fermo, occupato); le approvazioni forzate fallite non scrivono nulla (resta PENDING). Nota-solo PATCH rigiudicata (D-3) → 422. Catena e2e: AC 2 «fuori finestra con e senza `force`» verde (`booking-window.spec.ts`).
- **Timbro** (B6, F1 della sonda, U1h, U3f): `force` con failure → `forcedAt` scritto su create e approvazione; PATCH falliti non toccano il timbro.
- **Stima del costo** (C0-C6): pilota 60 min a D+10 = 15 000 (tariffa in vigore a D), a D+40 = 30 000 (tariffa programmata da D+30), solo-allievo 90 min = 13 500 (prezzo allievo), allievo + istruttore 40 €/h 90 min = 19 500, persona solo istruttore senza conto → nessun BALANCE né CURRENCY. Pilota+allievo non è più creabile (`STUDENT_PROFILE_EXCLUSIVE`): D-b vale solo per dati legacy.
- **Date di riferimento Q-19.10-a = B** (D0-D3): visita scaduta il 2033-02-14, prenotazione alle 23:30Z (00:30 di Roma del 15) → EXPIRY; alle 22:30Z (23:30 di Roma del 14) → valida: il giorno è quello di Roma, non UTC. Quota che scade oggi, prenotazione anni avanti → nessun MEMBERSHIP.
- **R-19-o, persona con entrambi i profili** (E1-E6): istruttore di X su A → persona su B sovrapposta = 409 `PERSON_BUSY` con `details.bookingId` = X; contigui alle 11:00 → 201; persona di Y → istruttore su C sovrapposto = `INSTRUCTOR_BUSY` con Y; l'allievo di X altrove → `PERSON_BUSY`; **profilo istruttore disattivato**: la sua prenotazione APPROVED tiene ancora occupato l'essere umano → `PERSON_BUSY`; istruttore = persona → 422 `INSTRUCTOR_SAME_AS_PILOT` con e senza `force`.
- **Concorrenza** (`probe-conc.cjs`, 10 round ciascuna): approvazione ∥ approvazione (P persona su A, istruttore su B) 10/10 un solo 200; create (P persona) ∥ approvazione (P istruttore) 10/10; move (P persona su T) ∥ approvazione (P istruttore a T) 10/10; **ruoli invertiti** (P/Q e Q/P) 10/10 `[200,409]`, mai 500/40P01. SQL «essere umano» (unione `personId` / `InstructorProfile.personId`, coppie APPROVED sovrapposte) = **0** sulle persone delle sonde e **0 sull'intero DB dopo l'arbitro** (`0|0`).
- **Ordine dei lock con gli altri servizi** (`probe-cross.cjs`, 10 round): approvazione ∥ volo sullo stesso velivolo (tariffa dal 2020, il lock `Aircraft` del volo è davvero preso: 201) ∥ Salva unico di P e di Q ∥ ricarica di P ∥ move della stessa prenotazione → nessun 5xx/40P01 (`200,201,200,200,200,409`). Censimento dei lock riletto: solo `people.service.ts:652/931` bloccano `Person`, una riga, prima istruzione.
- **Deroga quota** (`probe-fee.cjs`): senza chiave anche con `force` → 422 `IDEMPOTENCY_KEY_REQUIRED`; saldo 0 → 422 con UN `BALANCE` `{balanceCents:0, costCents:5000}`; stessa chiave + `force` → 200; replay → 200 `Idempotency-Replayed: true`; un solo `ADJUSTMENT` −5 000; corpo legacy `override:true` ignorato (422); saldo = importo → 200 (uguale = coperto); due addebiti concorrenti da 30 € su 50 € → un 200 e un 422 con `balanceCents: 2000` (deciso sotto il lock `Account`).
- **OpenAPI servito** (O1-O4): `REQUIREMENTS_NOT_MET` + `$ref RequirementsNotMetDetails` + `force` nel body su POST/PATCH/transition prenotazioni e membership-fee; 0 occorrenze di `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`, `EXPIRED_DOCUMENTS`, `forceReason`, `"override"`; body quota = `{amountCents, force}`.
- **Migrazione**: `\d "Booking"` sul DB dell'arbitro → `forcedAt`, `forcedByUserId`, FK `Booking_forcedByUserId_fkey`, nessun `forceReason`.
- **UI** (`probe-ui.cjs`, screenshot in `shots/`): form admin 1280 — avviso dentro il form col focus, ancora visibile dopo 1,5 s (la sottoscrizione RHF non lo chiude da sola), nessun `force-booking-*`, voci in IT, titolo `requirements.title`, «Annulla» → focus su «Prenota», scrivere nelle Note lo chiude (guardia del corpo stantio), «Procedi comunque» → APPROVED con `forcedAt` e le note del corpo rinviato; pilota in **EN** — titolo «Booking not allowed: only an administrator can proceed anyway», 0 bottoni, voci in inglese, nessuna prenotazione creata; modale desktop (vedi F3 per le lacune); sheet della lista a 375 — focus su «Procedi comunque», 44 px, nel viewport, nessun overflow, «Annulla» torna al primo passo; pannello quota a 375 — una voce BALANCE, bottone 44 px nel viewport, «Procedi comunque» → un `ADJUSTMENT` −5 000.
- **Gate**: `npm run gates` sul codice committato → `PASS lint (47s)`, `PASS typecheck (6s)`, `PASS test (22s) — Tests 2147 passed (2147)`, `PASS build (63s)`; `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run` sui 4 file toccati → `4 passed, 412 passed` (AC 34).
- **D-e** (saldo non rigiudicato sotto lock sulle prenotazioni): coerente con D-2 (nessun movimento scritto, ogni prenotazione giudicata sul proprio costo). **D-a**: misura confermata (sopra), con la riserva di F4.

## Stato della macchina

- **`:3000` libero**: il mio `npm run start` (pid npm 1351103, next-server 1351120, avviato alle 01:29 sulla build dell'arbitro) fermato per PID alle ~01:41.
- **`.next`**: ricostruita da `npm run gates` (01:42) sul codice di `dc69faf`, albero `src/` invariato.
- **DB `airmanager`**: resettato da me due volte (01:04 per l'arbitro, 01:33 per prove e sonde), ora **sporco** delle mie sonde (persone `Revisore …`, `Conc…`, `Pool…`, `Topup…` con 28 ricariche da 4.000 €, `Cross…`, prenotazioni 2033-2035, quota impostata a 50 € e riportata a 0): **resettarlo prima del prossimo arbitro**.
- **`airmanager_load`**: solo due `EXPLAIN (ANALYZE)` e una SELECT, dentro `BEGIN READ ONLY … ROLLBACK`. **`airmanager_audit`** e `_bmad-output/planning-artifacts/audit-2026-11-02/`: mai toccati. Nessun gemello creato (`pg_database` = airmanager, airmanager_audit, airmanager_load, postgres, template0/1).
- **Repo**: nessuna modifica (`git status` = solo i file non tracciati preesistenti e la `D .claude/skills/design-taste-frontend/SKILL.md` presente già all'avvio); nessun stash, add o commit. Questo report non è committato.
- **`scripts/e2e.sh status`**: DONE `E2E_EXIT=0` = il mio ultimo run mirato (ripetizione di 1237); l'arbitro è conservato in `scratchpad/r1910/arbiter-full.log`. `test-results/` contiene gli artefatti dei miei run mirati.
