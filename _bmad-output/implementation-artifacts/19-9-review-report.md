# Review adversarial — Story 19.9 «Avviso con deroga admin — registrazione voli»

- **Reviewer**: subagent `review-19-9` (Claude Opus 5.5, adversarial, metodo `bmad-code-review` + `karpathy-guidelines`), 2026-11-02.
- **Commit sotto review**: `0e13807` (feat) + `e05c9c3` (docs), baseline `7f4e76e`, branch `dev`.
- **Contratto**: story file `19-9-avviso-deroga-voli.md` (29 AC, Q-19.9-a = SÌ, Q-19.9-b = SEMPRE, correzione D-a del lead), CR `sprint-change-proposal-2026-11-01.md` §4.4, R-19-g/h/i/j/k, A9, A10.

## Verdetto

**SHIPPABLE CON FIX.** L'arbitro completo su DB fresco è verde (**579/579, 0 flaky, exit 0**, delta 567 → 579 esattamente come dichiarato) e il cuore della story regge alla verifica empirica: elenco unico nell'ordine di contratto, fuori servizio primo e derogabile, precedenze delle guardie dure, costo = `FLIGHT_CHARGE` anche con arrotondamenti, 16.4 sui voli e sul chip Piloti, 403 senza scritture, timbro solo se serve, OpenAPI, UI desktop/375 chiaro/scuro.

Da chiudere nel commit di fix:
- **F1 (MAJOR)** — una modifica che porta un volo Scuola da **solista a doppio** con lo stesso istruttore non controlla MAI i documenti né la quota dell'istruttore, che ora è a bordo: 200 senza avviso (prova empirica). Buco introdotto dalla correzione D-a.
- **F2 (MINOR, decisione PO)** — il controllo del saldo è aggirabile per race: N registrazioni concorrenti passano tutte su un saldo che ne copre una (5/5 201, saldo −240 €, nessun timbro). D-6 dichiara accettata solo la direzione opposta.
- **F3 (MINOR, a11y)** — «Annulla» (e il 409 sul reinvio) lascia il focus su `BODY` dentro il pannello modale.
- F4, F5: NIT/osservazioni.

## Arbitro (priorità zero)

- Pre-condizioni verificate: `ss -ltnp | grep :3000` vuoto; `scripts/e2e.sh status` = DONE (nessun run vivo); nessuna connessione su `airmanager`.
- DB `airmanager` resettato alle 21:21 (`DROP DATABASE … WITH (FORCE)` + `createdb` + `prisma migrate deploy` + `prisma db seed`, esito «6 expiry types ready»), poi `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (suite completa, build di produzione dentro il run).
- Esito verbatim:
  ```
  === e2e start: 2026-11-02T21:22:02+01:00 ===
  === args: <full suite> ===
    579 passed (26.3m)
  === e2e end: 2026-11-02T21:48:24+01:00 ===
  E2E_EXIT=0
  ```
  `grep -cE "flaky|retry #"` = **0**. Nessun failure, nessun flaky da diagnosticare. Delta 567 → 579 = +13 (`flight-requirements.spec.ts`) −1 (`mobile-logbook.spec.ts` 27 → 26), coerente con §F del record (conteggio dei `test(` per file prima/dopo verificato a mano: tutti gli altri spec toccati invariati).
- Copia del log: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-19-9-full.log`.
- **Run rosso preesistente trovato all'avvio** (`/tmp/airmanager-e2e/last-run.log` delle 21:10, args `--project=chromium e2e/flight-requirements.spec.ts`, «5 failed, 8 passed»): è il **run dei mutanti e2e del dev** (record §D: «quattro mutanti in una build … 5 failed, 8 passed», stessi cinque test: (b) currency, (c) saldo, AC 12, AC 13-15, modifica UI). Non è un difetto del codice consegnato; copia in `scratchpad/preexisting-2110-run.log` (il run verde a `--workers=1` delle 21:06 in `scratchpad/preexisting-2109-run.log`).
- Ricerca di spec «verdi per ordine o per stato residuo» (richiesta del lead): nessuno spec della suite principale dipende da X/Y diversi dai predefiniti senza leggerli (`flight-requirements` li legge da `/api/v1/settings/currency`; `flights.spec` E6 usa un volo di currency a 14 giorni, coperto da qualunque Y ≥ 14 con X = 1; gli spec che mutano settings restano nella catena serializzata, che gira dopo). Nessuno spec registra voli senza `force` per il pilota di seed. Residuo di rischio: F5.

## Finding

### F1 — MAJOR — Modifica «solista → doppio» con lo stesso istruttore: l'istruttore, ora a bordo, non viene mai controllato

- **Dove**: `src/server/services/flights.service.ts:674-675` (`instructor: solo ? null : …` e `documents: !isIdentityUnchanged(original, input, instructorPersonId, flightDate)`), predicato `isIdentityUnchanged` a `:371-383` (confronta persona, `instructorPersonId` e data — non chi è **a bordo**).
- **Perché è un difetto**: con la correzione D-a l'istruttore di un Scuola solista non è a bordo (niente suoi documenti né quota, giusto). Ma l'esenzione R-14.4-b confronta l'id dell'istruttore, non l'istruttore a bordo: portando il volo da solista a doppio (stesso allievo, stesso istruttore, stessa data) `isIdentityUnchanged` è vero → `documents: false` → né EXPIRY né MEMBERSHIP dell'istruttore vengono valutati, anche se da quel momento è a bordo (R-19-j «per chiunque sia a bordo», Q-19.9-a «istruttore a bordo»). Nessun avviso, nessun timbro nuovo. Prima della D-a il caso non esisteva (l'istruttore era controllato anche sul solista, quindi già al momento della registrazione). Nessun unit lo copre (`flights.service.test.ts` «requirements of an edit» `:1771-1850`: solo «dual made solo», mai il contrario).
- **Riproduzione** (API reale, build di produzione su gemello fresco `airmanager_r199`, script `scratchpad/probes/api-probes.cjs`, blocco P1): allievo in regola (documenti, quota, saldo 500 €); istruttore appena creato **senza visita e senza quota**; volo Scuola solista registrato con `force` (l'allievo non ha currency); poi:
  ```
  ### P1 control: NEW dual with same instructor
  { "status": 422, "failures": [
    { "type": "EXPIRY", "role": "instructor", "personName": "Revisore P1IstrSenzaDoc-…", "typeName": "Visita medica classe 1 / Visita medica classe 2 / Visita medica LAPL", "expiresAt": null },
    { "type": "MEMBERSHIP", "role": "instructor", "personName": "Revisore P1IstrSenzaDoc-…", "expiresAt": null } ] }
  ### P1 EDIT solo -> dual (same people/date), no force
  { "status": 200, "isSolo": false, "forcedAt": "2026-11-02T20:49:09.051Z" }
  ```
  Lo stesso volo, registrato nuovo in doppio, ha due voci dell'istruttore; ottenuto per modifica passa con 200 senza `force` (il `forcedAt` è quello vecchio della currency, D-7: con un allievo current non ci sarebbe nemmeno quello).
- **Fix suggerito** (chirurgico, nessun cambio al contratto della 19.10): rivalutare i documenti quando un istruttore **sale** a bordo, es. `documents: !isIdentityUnchanged(original, input, instructorPersonId, flightDate) || (originalSolo && !solo)` (`originalSolo` è già calcolato a `:664`). Effetto collaterale accettabile: in quel solo passaggio si rivalutano anche i documenti della persona (il servizio ha un solo flag `documents`). Unit: «(a) an original SOLO made dual with the same instructor brings the instructor's documents and fee back»; e2e API analogo alla prova sopra. Se la sessione principale vede nella scelta «rivalutare anche la persona» un'assunzione di dominio, ratificarla prima.

### F2 — MINOR (decisione PO) — Il controllo del saldo è aggirabile da registrazioni concorrenti

- **Dove**: `src/server/services/requirements.service.ts:141-147` (aggregato letto **fuori** da ogni transazione), chiamato da `resolveFlightInput` prima della transazione (`flights.service.ts:677`); il saldo «vero» è riletto sotto il lock del conto solo per l'alert (`:890`, lock `:998`).
- **Cosa dice la story**: D-6 (story file `:131`) accetta che «una **ricarica** concorrente fra lettura e scrittura può rendere l'avviso inesatto» — cioè un avviso in più, la direzione innocua. Non dichiara la direzione opposta: due addebiti concorrenti leggono lo stesso saldo, passano entrambi **senza avviso e senza timbro**, e il conto va in rosso come se nessun requisito fosse mai stato violato (il timbro silenzioso, unica traccia di una deroga per A10, manca).
- **Riproduzione** (stesso gemello, blocco P2): pilota in regola con saldo 60,00 € dopo la quota, volo di currency senza addebito, poi N `POST /api/v1/flights` simultanei senza `force`, stesso velivolo, orari disgiunti, 60,00 € ciascuno:
  ```
  ### P2 race x2  { "statuses": [ {"s":201}, {"s":201} ], "balanceAfter": -6000,  "flights": { "n": 2, "stamped": 0 } }
  ### P2 race x5  { "statuses": [ {"s":201}×5 ],          "balanceAfter": -24000, "flights": { "n": 5, "stamped": 0 } }
  ```
- **Impatto reale**: basso oggi (solo l'admin registra voli, da una sessione); cresce con la app Flutter (stesso admin su due dispositivi, reinvii di rete con chiavi diverse). Il `FLIGHT_OVERLAP` non protegge: basta un altro velivolo o un altro orario.
- **Opzioni per il PO**: (A) accettarlo come limite e **riscrivere D-6** dichiarando anche questa direzione; (B) fix economico: quando la richiesta NON è forzata e non è senza addebito, ricontrollare il solo BALANCE sotto il lock del conto (il saldo è già letto lì: `registerFlightCore` `:890`, `updateFlight` `before`), e lanciare `throwRequirementsNotMet([balanceFailure])` facendo rollback. L'elenco resta completo per costruzione (se la richiesta non è forzata, la valutazione fuori transazione era vuota). Raccomando B (≈10 righe + un unit per ramo + una sonda di concorrenza).

### F3 — MINOR (a11y) — Chiudere l'avviso lascia il focus su `BODY` dentro il pannello modale

- **Dove**: `src/components/dashboard/requirements-warning.tsx:46-49` (focus all'apertura, introdotto da questa story) e `flight-editor.tsx:331` `dismissRequirements` / `:984` `onCancel={dismissRequirements}` / `:725` (409 sul reinvio): nessuno restituisce il focus.
- **Riproduzione** (`scratchpad/probes/ui-focus.cjs`, 1280, solo tastiera): submit con Enter → focus sull'avviso (`:focus-visible` vero), Tab, Tab → `requirements-cancel`, Enter:
  ```
  after Enter on Annulla: BODY[…] inPanel=false warning count 0
  after Tab from lost focus: BUTTON[Chiudi] inPanel=true
  ```
  Stesso esito dopo il 409 su «Procedi comunque» (`ui-probes.out`, U3: `"focus": "BODY#[]"`). La trappola del pannello (15.10) riporta il Tab dentro, ma sul «Chiudi» in testa: l'utente da tastiera perde la posizione e lo screen reader non annuncia nulla. Preesistente nella vecchia sezione «Forza registrazione», ma qui il componente prende il focus all'apertura: la restituzione alla chiusura è la metà mancante dello stesso schema.
- **Fix suggerito**: dopo «Annulla» e dopo il 409, focus sul bottone di submit del form (o sul banner `flight-form-error` nel caso 409); un'asserzione `toBeFocused()` nell'e2e AC 15.

### F4 — NIT — Il 422 di `POST`/`PUT /flights` nell'OpenAPI non referenzia `RequirementsNotMetDetails`

- `GET /api/v1/openapi.json` (blocco P6): i componenti `RequirementFailure` (5 varianti: `EXPIRY MEMBERSHIP CURRENCY BALANCE AIRCRAFT_OUT_OF_SERVICE`) e `RequirementsNotMetDetails` ci sono, ma la risposta 422 delle due operazioni resta quella generica (`"details":{}`). AC 21 è soddisfatto alla lettera (componenti + descrizioni); un client generato (Flutter) però scopre il tipo dei `details` solo dalla prosa. Valutare con la 19.10 se legare il componente alla risposta 422 (o a una variante documentata) una volta per entrambi i domini.

### F5 — Osservazione (robustezza e2e, classe TD 16.2-g) — test che si aspettano 201 «senza avviso»

- `flight-requirements.spec.ts` (a) `:143`, AC 11 (c) «shorter» `:304`, AC 12 `:331`, `flights.spec.ts` E6: il fixture «in regola» è una fotografia del catalogo (`ensureValidSeedExpiries`) seguita da 1-3 chiamate; un tipo RATING bloccante `scope: 'ALL'` creato in parallelo in quella finestra (i 4 permanenti di `bookings.spec.ts`, i 2 temporanei del describe seriale di `flights.spec.ts`) produce un 422 con un solo EXPIRY mancante estraneo. Non osservato nell'arbitro (0 flaky) né atteso spesso (finestra ~1 s); è la classe preesistente TD 16.2-g, che la story estende a 3-4 test nuovi. Nessuna azione richiesta ora; se compare, la diagnosi è «EXPIRY mancante di un tipo non del test», non un difetto del servizio.

## Decisioni PO necessarie

1. **F2**: accettare la race del saldo come limite (e riscrivere D-6) **oppure** il ricontrollo sotto lock (raccomandato).
2. (Solo se la sessione principale lo ritiene un'assunzione) **F1**: sul passaggio solista → doppio rivalutare documenti e quota anche della persona (effetto del flag unico) — la parte «controllare l'istruttore che sale a bordo» discende già da R-19-j e dalla correzione D-a.

## Verificato corretto (con prova)

- **Arbitro**: 579/579, 0 flaky, exit 0 su DB fresco (sopra).
- **Ordine e contenuto dell'elenco** (P4): velivolo fuori servizio + pilota e istruttore appena creati su Turismo con istruttore → `AIRCRAFT_OUT_OF_SERVICE`, EXPIRY persona, EXPIRY istruttore, MEMBERSHIP persona, MEMBERSHIP istruttore, BALANCE — l'ordine di AD-2; nessuna CURRENCY sul volo con istruttore (A5).
- **Precedenze D-3** (P4): fuori servizio + data futura → `FLIGHT_DATE_IN_FUTURE`; requisiti falliti + velivolo senza tariffa → `NO_AIRCRAFT_RATE`.
- **Costo = addebito** (P4): 37' a 123,45 €/h + istruttore 43,21 €/h → `costCents` 10278 nella voce BALANCE, `totalAmountCents` 10278 e `FLIGHT_CHARGE` −10278 dopo la deroga (una sola formula, `buildFlightWrite` chiamato una volta).
- **Confine del saldo** (P5): saldo = costo (6000/6000) → 201 senza timbro; saldo = costo − 1 → una sola voce `balanceCents 5999, costCents 6000`.
- **Saldo in modifica, Q-19.9-b** (U3 UI): due voli forzati da 120 € su saldo 0, modifica di orario del secondo → voce `saldo -120,00 €, costo 120,00 €` (saldo + addebito attuale, sempre rivalutato).
- **EXPIRY / 16.4** (P7, P8): RATING bloccante attivo scaduto il giorno prima → voce con `expiresAt`; stesso tipo disattivato → 201 senza timbro; `expiresAt` = giorno del volo → 201 (giorno valido). **Chip Piloti D-13** a 375: «Rv19.9 … scaduto» presente col tipo attivo, sparito dopo la disattivazione.
- **Regola mediche** (P5): classe 1 valida + classe 2 scaduta → nessuna voce EXPIRY (solo quota/currency/saldo di una persona non in regola).
- **MEMBERSHIP** (P5): quota spostata al 2024-01-31 sul DB → voce `expiresAt: "2024-01-31"`; mai pagata → `expiresAt: null` (P4).
- **CURRENCY in modifica** (P9): doppio dello stesso giorno reso solista → voce CURRENCY «mai volato» (il volo non conta per sé stesso, `excludeFlightId`).
- **Deroga e 403** (P3, P4, e2e (a)/(f)): `force` di un pilota con `Idempotency-Key` → 403 `FORBIDDEN`, `Flight` 10 → 10, `IdempotencyRecord` 3 → 3, 0 righe per quella chiave; matrice RBAC: istruttore/allievo/pilota `POST` 403, `PUT` 403, `GET` 200; deroga admin → 201 con `forcedAt`, nessuna chiave `forceReason`; un `forceReason` residuo nel body → 201 (scartato da Zod); `force` senza nulla da derogare → `forcedAt: null` (e2e (a), verde nell'arbitro). Il gate `requirements.force` distinto da `flights.manage` è provato a unità (D-m), come dichiarato.
- **Migrazione** (gemello): `20261102210000_flight_drop_force_reason` ultima applicata; `information_schema.columns` del `Flight` → solo `forcedAt`, `forcedByUserId`.
- **OpenAPI** (P6): 5 varianti, `RequirementsNotMetDetails`, `RegisterFlightRequest` con `force` e senza `forceReason`, `REQUIREMENTS_NOT_MET` nelle descrizioni di POST e PUT, 0 `FLIGHT_BLOCKED_BY_EXPIRY`, 0 `forceExpiry`; le 4 occorrenze di `forceReason` sono tutte di `CreateBookingRequest`/`POST /bookings` (19.10).
- **UI** (`ui-probes.out`, screenshot in `scratchpad/shots/`): avviso col focus all'apertura e nel pannello a 375; Tab → «Procedi comunque» → «Annulla»; focus+blur su un campo senza cambiarlo NON chiude l'avviso (letta anche l'implementazione di `subscribe` di RHF 7.80: il blur senza cambio non emette `values`); cambiare velivolo dal combobox lo chiude; voce del fuori servizio prima e leggibile, causa lunga che va a capo; bottoni 34,84 px a 1280 e **44 px** a 375; overflow pannello/pagina 0 in entrambi; tema scuro: fondo `lab(21 …)`, testo `lab(95 …)`, titolo `lab(91 …)` (leggibile); riepilogo dopo «Procedi comunque» senza notice di deroga e con l'alert del saldo negativo (D-11); riga desktop e card mobile del volo derogato senza «Deroga»/badge; in modifica il 409 sul reinvio chiude l'avviso e il banner nomina il volo in conflitto.
- **Unit senza env** (CLAUDE.md, AC 27): `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run` su requirements, formatter, flights, boundary, rbac, registry, expiries → `Test Files 7 passed (7)`, `Tests 363 passed (363)`.
- **Residui**: `grep forceReason|forcedAt` in `src` (esclusi test, generated e prenotazioni) → solo il DTO `forcedAt` e i commenti/descrizioni attesi; nessuna superficie UI legge più `forcedAt` salvo la mappatura del DTO (`logbook/page.tsx:160`).

## Stato della macchina a fine review

- `:3000` e `:3001` liberi. Il server di prova (`next start -p 3001`, PID 1207679 con padre 1207667) è stato fermato per PID.
- `scripts/e2e.sh status` = DONE, `E2E_EXIT=0` (il mio arbitro); il `.prev` è il run dei mutanti del dev delle 21:10.
- DB: `airmanager` = stato post-arbitro (resettato alle 21:21 prima del run); gemello `airmanager_r199` **eliminato**; `airmanager_audit` e `airmanager_load` mai toccati; nessun `docker compose down/up`, nessuno `stash`/`add`.
- Repo: nessun file modificato (`git status` identico all'inizio: solo i non tracciati preesistenti e la `D .claude/skills/design-taste-frontend/SKILL.md` preesistente). Questo report non è committato.
- Script e output delle prove: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/` (`probes/*.cjs`, `api-probes.out`, `api-probes2.out`, `ui-probes.out`, `ui-focus.out`, `shots/*.png`, `arbiter-19-9-full.log`).
