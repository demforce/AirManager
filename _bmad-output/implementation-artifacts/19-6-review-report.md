# Review adversarial — Story 19.6 «Volo senza addebito e cancellazione definitiva»

- Reviewer: `review-19-6` (Opus 5.5, unico layer adversarial) — 2026-11-02
- Commit sotto review: `6651ec1` (feat) + `3a08b63` (docs), baseline `bb7a795`
- Metodo: `bmad-code-review` + `karpathy-guidelines`; prove empiriche su API reale (build di produzione dell'arbitro), psql, corse deterministiche, UI reale (playwright-core: il Playwright MCP non parte su questa macchina, `chrome` assente in `/opt/google`)

## Verdetto

**SHIPPABLE-WITH-FIXES** — arbitro verde pieno (541/541, delta 534 → 541 come dichiarato), migrazione distruttiva verificata in modo indipendente, RBAC/OpenAPI/UI/compenso/ricavi corretti. Un finding **MEDIUM** (F1: una rettifica concorrente bypassa la D-8 e lascia un credito orfano, saldo falso — riprodotto con sole richieste API reali) da chiudere nel commit di fix o da rinviare esplicitamente alla 16.6b; due **LOW** (F2, F3).

## Arbitro (priorità zero)

- Pre-condizioni: `ss -ltnp | grep :3000` vuoto, `scripts/e2e.sh status` = DONE (run precedente), DB `airmanager` fresco (0 voli, 4 utenti di seed, 0 `LoginAttempt`, 52 migrazioni applicate).
- Comando: `export JOBS_SECRET=local-e2e-secret-0123456789abcdef CI=1 && scripts/e2e.sh start` (full suite, build di produzione dentro il cronometro).
- Esito verbatim: `541 passed (14.1m)` — `E2E_EXIT=0`. 0 failed, 0 flaky, 0 skipped, 0 `retry #` nel log.
- Delta: 534 (arbitro finale 19.5) → **541** = +4 `flight-delete-update` netti rispetto a `flight-reversal`, +4 `flight-no-charge`, −1 chip di stato: coincide col dichiarato.
- Copia del log: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/arbiter-19-6-full.log` (originale `/tmp/airmanager-e2e/last-run.log`, non sovrascritto).
- Nessun flaky da diagnosticare (TD 19.6-c `billing:294` non si è presentato in questo run).

## Finding

### F1 — MEDIUM — Una rettifica concorrente sull'addebito sfugge alla D-8: `DELETE` 204 con credito orfano (saldo falso), `PUT` 200 con rettifica legata a un addebito su un altro conto

**Dove**: `src/server/services/flights.service.ts:1286-1287` (`deleteFlight`: `loadFlightCharge` legge `reversal` PRIMA del lock `Account`), `:1372` vs `:1383` (`updateFlight`, stesso ordine); `loadFlightCharge` `:1244-1256`. L'altra metà della corsa è `src/server/services/accounts.service.ts:608-629` (pre-check di `recordAdjustment` fuori transazione) + `:639-658` (lock `Account` → insert). Lo unit `flights.service.test.ts:1763` («locks -> overlap guard -> charge read -> account upsert -> Account lock …») fissa proprio l'ordine difettoso.

**Perché**: la D-8 promette «un volo il cui addebito ha una rettifica collegata non è cancellabile né modificabile (409)», perché cancellare l'addebito lascia la rettifica come credito orfano (`AccountMovement_reversalOfId_fkey` è `ON DELETE SET NULL`). Ma il controllo legge `reversal` sotto il lock `Flight`/`Aircraft`, che `recordAdjustment` non prende: l'unico lock condiviso dai due percorsi è `Account`, e `deleteFlight`/`updateFlight` lo prendono DOPO aver letto `reversal`. Una rettifica che committa in quella finestra non viene vista.

**Riproduzione con sole richieste API reali** (script `race-api.mjs`; il client psql `L` tiene solo il lock della riga `Account`, non scrive nulla, per mettere in fila le due richieste nella coda FIFO di Postgres):

```
queued on the Account lock: ["SELECT \"id\" FROM \"Account\" WHERE \"id\" = $1 FOR UPDATE","SELECT \"id\" FROM \"Account\" WHERE \"id\" = $1 FOR UPDATE"]
adj-first -> first 200  | second 204
flight exists: 0 | movements on the account: [{"type":"ADJUSTMENT","amountCents":12000,"unlinked":true,"flightId":null}]
```

`POST /people/{id}/account/adjustments` (rettifica +120,00 € legata all'addebito) → 200; `DELETE /flights/{id}` → **204**: volo e addebito spariti, la rettifica resta come **+120,00 € slegato** (`reversalOfId` NULL), saldo +120,00 € invece di 0. Controprova seriale (`probes.mjs d8`): stessa rettifica PRIMA del DELETE → `DELETE 409 CONFLICT … | PUT 409`, nulla cancellato. Quindi l'esito dipende solo dall'interleaving.

Variante `PUT` con cambio persona (`probes.mjs race-put-rettifica`, rettifica replicata in psql con gli stessi statement di `recordAdjustment`):

```
PUT status 200
rettifica -> linked charge [{"adj_account":"…o5prxpou","amountCents":12000,"linked_charge":"…lk2n1vg","charge_account":"…bxkj713t","charge_amount":-18000}]
balances p1 12000 p2 -18000
```

La rettifica (+120 sul conto del pilota vecchio) resta legata a un addebito che ora vive sul conto del pilota nuovo, riscritto a −180: invariante «rettifica sullo stesso conto del movimento» rotta (`cross_account_reversal = 1` nella query d'invariante finale).

**Fix suggerito** (una delle due):
- (a) **minimo, dentro la 19.6**: in `deleteFlight`/`updateFlight` leggere `accountId` dell'addebito (stabile sotto il lock `Flight`), prendere il lock `Account` (o i due, ordinati), POI rileggere `reversal`; e in `recordAdjustment` ripetere dentro la transazione, dopo il proprio lock `Account`, il controllo dell'originale (esiste, stesso conto, nessuna rettifica). Aggiornare lo unit `:1763` e aggiungere uno unit d'ordine «reversal letto dopo il lock Account».
- (b) **anticipare la regola già ratificata per la 16.6b** («422 sulla rettifica di un `FLIGHT_CHARGE`»): una riga in `recordAdjustment` (il tipo di un movimento è immutabile, quindi basta il pre-check), chiude F1, F2 e la variante cross-account in un colpo. È una scelta di sequenza (sessione principale/PO): la 16.6b è pianificata DOPO l'epic 19, quindi senza (a) o (b) la finestra resta aperta per 19.7-19.12.

Rischio reale: richiede due azioni admin concorrenti sullo stesso conto in una finestra stretta (ADMIN è l'unica figura, ma più utenti admin possono esistere); l'effetto però è un saldo sbagliato persistente e silenzioso, cioè esattamente ciò che la D-8 esiste per impedire.

### F2 — LOW — Una rettifica che perde la corsa contro un `DELETE` risponde 500 (P2003) invece di 404

**Dove**: `src/server/services/accounts.service.ts:612-628` (pre-check fuori transazione) e `:647-666` (il `catch` mappa solo la unique violation). Conseguenza nuova della 19.6: prima nessun movimento veniva mai cancellato, quindi la FK `reversalOfId` non poteva fallire.

**Riproduzione** (stesso script, ordine inverso):

```
delete-first -> first 204  | second 500 INTERNAL_ERROR An unexpected error occurred.
```

Log del server: `Foreign key constraint violated on the constraint: AccountMovement_reversalOfId_fkey` — `code: 'P2003'`. Nessun danno ai dati (la transazione della rettifica fa rollback), ma un 500 dove il contratto prevede `404 Movement not found.`

**Fix**: lo stesso di F1 (a) — ricontrollo dell'originale dentro la transazione → 404 — oppure F1 (b), che lo rende irraggiungibile.

### F3 — LOW — `PUT ‖ PUT` sullo stesso volo: le esenzioni (AOG «stesso velivolo», R-14.4-b, Q-19.3-b) sono calcolate sull'identità letta FUORI dal lock

**Dove**: `src/server/services/flights.service.ts:1326-1347` (pre-lettura di `original` fuori transazione, usata da `resolveFlightInput` per `aircraftUnchanged` `:673-674`, `isIdentityUnchanged` `:795`, categoria `:846-847`); il lock `Flight` `:1352-1356` seleziona solo `aircraftId` e non confronta nulla con la pre-lettura. La story (D-2) scarta la ri-lettura «perché il lock chiude il caso per costruzione»: il lock serializza le scritture, ma le esenzioni restano decise su un'identità che nel frattempo può essere cambiata.

**Riproduzione** (`probes.mjs toctou-aog`): volo F su A, A messo fuori servizio; psql tiene il lock di B; PUT1 sposta F su B (prende il lock `Flight`, si ferma su B); PUT2 (pre-letto con F ancora su A) tiene A; rilascio:

```
PUT1 (A->B) 200 | PUT2 (stale, keeps A) 200
final flight {"on_grounded_a":true,"status":"OUT_OF_SERVICE","minutes":45,"forcedAt":null}
control: serial PUT moving a B flight onto grounded A -> 422 AIRCRAFT_OUT_OF_SERVICE
```

Il volo finisce su un velivolo fermo senza deroga né timbro, esito che nessun ordine seriale produce. Stessa classe per il cambio persona (scansione documenti saltata) e per la categoria di prezzo.

**Fix**: selezionare nel `SELECT … FOR UPDATE` di `:1352` le colonne d'identità (`aircraftId`, `personId`, `instructorProfileId`, `flightDate`, `flightType`, `aircraftPriceCategory`) e, se differiscono dalla pre-lettura, rispondere 409 (o rieseguire `resolveFlightInput`). In alternativa dichiararlo come limite noto nel doc-comment di `updateFlight` (due modifiche admin simultanee dello stesso volo). Decisione della sessione principale, non di dominio.

## Decisioni necessarie

1. **F1** — correggere nella 19.6 con (a) o anticipare la 422 della 16.6b con (b) (regola già ratificata, cambia solo la sequenza); in alternativa ratificare il rinvio alla 16.6b come TD dichiarato.
2. **F3** — re-check dell'identità sotto lock (409) oppure limite dichiarato.

## Verificato corretto (con prova)

- **Migrazione su gemello indipendente** (`am_rev196`, creato e poi eliminato): 52 migrazioni precedenti via psql + fixture (a) volo annullato con addebito e storno, (b) catena originale annullata + correzione registrata con addebito, (c) pacchetto + `PACKAGE_PURCHASE` + `PackageConsumption` su volo registrato, (d) `TrainingNote` sul volo annullato, (e) volo normale + ricarica, (f) rettifica legata allo storno. Migrazione 19.6 eseguita: `COMMIT`, **SUM per conto prima/dopo con diff vuoto** (`a1|18000`, `a2|-7500`), restano solo `fb1`/`fe` con `noCharge=f`, `TrainingNote.flightId` NULL, `PackageConsumption` assente, enum a 4 valori, `AccountMovement_flightId_key` UNIQUE e FK `ON DELETE RESTRICT`. La rettifica (f) sopravvive slegata, come dichiarato in AD-1. `pg_dump --schema-only` del gemello = schema del DB dell'arbitro (catena da zero), a meno di `_prisma_migrations`; `prisma migrate diff --from-config-datasource --to-schema` → `This is an empty migration.`
- **RBAC** (`probes.mjs rbac`): pilota/istruttore/allievo → `POST` (con `noCharge: true`) 403 `FORBIDDEN`, `PUT` 403, `DELETE` 403; anonimo `DELETE` 401; volo e addebito intatti dopo i tentativi. Admin: `GET`/`PATCH /flights/{id}` 405, `PUT /flights/pdf` 405, `DELETE`/`PUT` su id inesistente 404; `/cancel` 404 per tutti i ruoli.
- **D-8 seriale**: rettifica prima → `DELETE 409` e `PUT 409`, addebito invariato.
- **Concorrenza** (`probes.mjs stress 12`, 60 coppie): `PUT‖DELETE` 12× → DELETE 204 / PUT 404; `DELETE‖POST` stesso slot 12× → 204/201; `PUT(A→B)‖POST(B)` stesso slot → esattamente uno vince (11× PUT 200 + POST 409 `FLIGHT_OVERLAP`, 1× l'inverso); `PUT‖PUT` 12× 200/200; scambio incrociato di persona su due voli (deadlock-probe) 12× 200/200. **Nessun 500, nessun deadlock.** Invariante globale dopo tutte le sonde: 0 voli senza addebito, 0 importi/conti/date dell'addebito disallineati dal volo, 0 `FLIGHT_CHARGE` senza volo, 0 movimenti non-`FLIGHT_CHARGE` con `flightId`, 0 voli senza addebito con importi ≠ 0, 0 coppie di voli sovrapposti; l'unico `cross_account_reversal = 1` è il residuo voluto della sonda F1.
- **Upsert prima del lock `Account`** in `updateFlight`: con la riga `Account` della persona nuova bloccata da psql, il `PUT` attende sul `SELECT … IN (…) ORDER BY "id" FOR UPDATE`, non sull'upsert (`probes.mjs upsert-lock`): l'upsert non prende un lock di riga anticipato, nessun ciclo.
- **OpenAPI servito** (`GET /api/v1/openapi.json`): `/api/v1/flights/{id}` con `put: 200,401,403,404,409,422,500` e `delete: 204,401,403,404,409,500`; 0 occorrenze di `CancelFlightRequest`, `CorrectFlightRequest`, `FLIGHT_CHARGE_REVERSAL`, `cancelReason`, `correctionOfId`; nessun parametro `status` su `GET /flights`; l'unico `/cancel` rimasto è `/api/v1/bookings/{id}/cancel`; `noCharge` presente (15 occorrenze).
- **Senza addebito**: compenso istruttore — su un istruttore run-unique con payout 60 €/h, un volo Scuola senza addebito da 90' + uno normale da 60' danno in pagina Istruttori `2:30 · 150,00 €` (il volo regalato matura). KPI «Ricavo» del registro filtrato = 190,00 € (solo il volo pagato). Estratto conto: `Volo senza addebito I-… — 1:30 · 0,00 €` desktop e card. In Contabilità il volo regalato compare come riga «Ricavo» con «—»/«—» (0 €), coerente con AD-5.7.
- **UI reale a 1280/375** (screenshot in `scratchpad/shots/`): nessuna select Stato, nessun chip, nessun «Annullato»; sottoriga `flight-no-charge` solo sul volo regalato; conferma desktop con avviso e nome, «Chiudi»/«Elimina volo» distruttivo; toggle precompilato in modifica (`aria-checked="true"`, `aria-describedby` sull'hint), spento nel form nuovo («Addebito normale»); sheet mobile «COSTO 0,00 € · Senza addebito», secondo passo senza textarea con focus su «Indietro», ritorno del focus su «Modifica»; nessun overflow orizzontale del documento.
- **Residui (AC 29)**: i sei grep danno solo le asserzioni d'assenza di `registry.test.ts:402-405` / `flight-delete-update.spec.ts:354-356` e due chiavi d'altri namespace (`FinancePage.cashRegister.reversalBadge`, `BookingsPage.list.mobile.statusAll`), come dichiarato. **i18n**: 1642/1642, parità 0/0; nessun `t()` verso chiavi rimosse.
- **Unit senza env** (regola env eager): `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 5 file toccati → `315 passed`.

## Note non bloccanti (fuori perimetro o pre-esistenti)

- Il modal di conferma desktop non sposta il focus al suo interno (resta sul bottone «Annulla» della riga): identico alla baseline, non introdotto qui.
- Il registro a 1280 scorre orizzontalmente dentro la card (colonna azioni fuori vista anche con dati realistici: contenuto 1344 px su 990): `COLS` è identico alla baseline, non introdotto qui.
- `updateFlight` non protegge la rilettura `getAccountOverview` post-commit come fa `registerFlight` (H3): senza `Idempotency-Key` su `PUT` il retry è innocuo, quindi nessun finding.

## Stato della macchina

- Repo: nessun file tracciato modificato (`git diff --quiet HEAD -- src prisma e2e messages` ok; sha256 `flights.service.ts` = `f663ad81…3ec62d`). Unico file nuovo: questo report (non committato).
- Server `npm run start` avviato dal reviewer (PID 648560 / next-server 648581) **fermato**; porta 3000 libera. `scripts/e2e.sh status` = DONE `E2E_EXIT=0`.
- DB gemello `am_rev196` eliminato; `airmanager_load` non toccato.
- DB `airmanager` **sporco**: fixture run-unique delle sonde (velivoli `I-R6…`/`I-Z…`, persone `Rev …`), il credito slegato di F1, la rettifica cross-account della variante PUT, un volo su velivolo fermo (F3). Resettarlo prima del prossimo arbitro. `LoginAttempt` ultimi 60': admin 523 (in gran parte la suite).
- Script e output delle sonde: `/tmp/claude-1000/-home-admin-AirManager/0e319238-d164-418e-b515-b195fddb6a7e/scratchpad/` (`lib.mjs`, `probes.mjs`, `race-api.mjs`, `fixtures.sql`, `*.out`, `shots/`).
