# Review adversarial — Story 19.2 «Via codice fiscale, campi velivolo, contaore e note volo»

- **Reviewer**: Opus 5.5 (unico layer adversarial), 2026-11-01. Metodo `bmad-code-review` (Blind Hunter, Edge Case Hunter e Acceptance Auditor eseguiti in proprio: nessun tool di subagent a disposizione) + `karpathy-guidelines`.
- **Perimetro**: `a7e960e..232bc06` (`b0d142c` feat, `232bc06` docs), più la cancellazione di `src/app/api/v1/aircraft/[id]/hour-meter-adjustments/route.ts` finita in `2acbf6e`. HEAD durante la review: `2dc0025`, poi `eef77ef` (solo story file 19.7a/19.7b, nessun codice).
- **Contratto**: story file (26 AC, D-1..D-3, deviazioni §G), CR `sprint-change-proposal-2026-11-01.md` (R-19-a, R-19-b), `CLAUDE.md`.

## Verdetto: **SHIPPABLE**

Nessun difetto di codice. Il lock `FOR UPDATE` sull'`Aircraft` c'è ancora ed è **ancora discriminante sullo stack reale**: senza il lock, 12 POST concorrenti hanno registrato **10 voli duplicati**; con il lock, 1. Le «Ore totali» sono corrette e coerenti sulle tre superfici e sul registro voli. La migrazione è forward-only con zero drift, i tre seed girano, l'OpenAPI è un sottoinsieme stretto. Restano due finding LOW, nessuno dei due blocca la story: un doc-comment diventato falso (F2) e uno story file **a valle** (16.8) che va riperimetrato prima del suo dev (F1).

---

## Arbitro e2e — suite completa, DB fresco, `CI=1` (build di produzione)

Lanciato per primo con `scripts/e2e.sh start` (`:3000` libero, nessun run vivo, DB appena resettato: 4 utenti, 0 voli, 0 `LoginAttempt`, ultima migrazione `20261101223000_remove_fiscal_code_aircraft_fields_hour_meter`).

```
Running 489 tests using 2 workers
  1 flaky
    [chromium] › e2e/flights.spec.ts:977:7 › Flight registry guards: no duplicate, no overlap (Story 16.2) › E3: two identical POSTs in parallel produce exactly one 201 and one 409 (never two 201)
  488 passed (13.6m)
=== e2e end: 2026-11-01T23:34:19+01:00 ===
E2E_EXIT=0
```

- **Delta 492 → 489 confermato** (−5 cancellati, +2 nuovi, come dichiarato). Nessuno skip.
- **Flaky E3, diagnosi con prove in DB → classe pre-esistente TD 16.2-g, NON attribuibile alla 19.2.** Primo tentativo `Expected [201, 409]`, ricevuto `[201, 422]`. Un 422 non viene mai dal lock (un lock rotto darebbe `[201, 201]`). Ricostruzione sul DB post-suite:
  - velivolo di E3 `I-FL1793571924965-85` creato alle 22:25:24.977 UTC, il suo unico volo alle 22:25:25.241 (1 riga, nessun secondo volo);
  - `ExpiryType` «Tipo voli 1793571925210-j7o3py», `scope ALL`, `blocksBooking = true`, **creato alle 22:25:25.228** dal describe serial «Blocking expiry guard-rail» (14.4) dello stesso spec e disattivato alle 22:25:26.105;
  - le scadenze del pilota di E3 (scansionate da `ensureValidSeedExpiries` alle ~22:25:25.07) **non** includono quel tipo.

  Quindi una delle due POST ha risolto prima delle 25.228 (201), l'altra dopo, e si è presa `FLIGHT_BLOCKED_BY_EXPIRY` per documento assente (R-14.4-a). È la finestra TOCTOU già documentata (TD 14.4(a) / TD 16.2-g in `sprint-status.yaml`, «flaky E3 = classe 16.2-g provata via SQL» nella chiusura 16.2). Il retry (`I-FL1793571927723-S5`) passa `[201, 409]`.

---

## Finding

### F1 — LOW (processo, a valle, fuori dal diff): lo story file 16.8 (ready-for-dev) è costruito sul contaore che la 19.2 ha eliminato

- **Dove**: `_bmad-output/implementation-artifacts/16-8-archivio-velivolo-tutele-aog.md`, 15 righe: `:54` (requisito **P2**: `hour-meter-adjustments` → 409 su archiviato), `:167` (guardia in `adjustHourMeter`, `SELECT "hourMeterMinutes" … FOR UPDATE`), `:178` (`HourMeterSection`), `:180` (`:1401-1404` del contaore), `:230` (AD-8: `POST …/hour-meter-adjustments` → 409), `:236` (AD-9, testid `hour-meter-*`), `:264` (copy «…cambiarne stato, contaore o tariffe»), `:319` («riduce il contaore anche di un archiviato»), `:324` (riga di contratto 200 → 409), `:355`, `:364`, `:404` (D6 «contaore su archiviato (AC 9)»), `:458`.
- **Perché conta**: la CR riperimetra esplicitamente 16.5/16.6a/16.6b/16.7, **non la 16.8**. Un dev che parte da questo file inseguirebbe un endpoint, un servizio, una sezione UI e dei test che non esistono più, o peggio li ricreerebbe per soddisfare l'AC 9.
- **Riproduzione**: `grep -nE 'hourMeter|contaore|HourMeterAdjustment|hour-meter' _bmad-output/implementation-artifacts/16-8-archivio-velivolo-tutele-aog.md` → 15 righe.
- **Fix suggerito** (sessione principale, nessun codice della 19.2 da toccare): riperimetrare la 16.8 prima del suo dispatch: togliere P2/AC 9/D6 per la parte contaore, le righe AD-8/AD-9, la copy `archivedReadOnly` («stato o tariffe») e le fixture unit `[{ hourMeterMinutes: 750 }]`; riallineare le righe `file:riga` al post-19.2. Da segnare anche nel `docs(19.2)` di chiusura (sprint-status, commento della 16.8).

### F2 — LOW (doc-comment diventato falso con questa story): `sumFlightMinutesByAircraft` dice «never the whole fleet», e il nuovo chiamante dell'export gli passa tutta la flotta

- **Dove**: `src/server/services/aircraft.service.ts:537-540`: «BATCHED over the ids of the CURRENT PAGE … never one query per card, and never the whole fleet: the bar compares the 20 cards on screen». La 19.2 aggiunge il secondo chiamante `exports.service.ts:192` (`sumFlightMinutesByAircraft(actor, result.items.map(...), null, null)` con `pageSize: EXPORT_MAX_ROWS` = 10 000 id), e lo stesso doc-comment a `:551-553` è già stato aggiornato per citare «the aircraft export». Il paragrafo sul batching invece no: ora è falso per uno dei due chiamanti.
- **Effetto**: nessuno a runtime (una sola `groupBy` su `Flight(aircraftId)` indicizzato: la scelta è giusta). È la classe che la story stessa chiede di chiudere (AD-3 «doc-comment che diventano falsi vanno riscritti nello stesso commit», trappola §5.11).
- **Fix suggerito**: una frase, es. «Batched per caller: the fleet page passes the ids of its CURRENT PAGE (never one query per card…), the aircraft export the ids it exports (one aggregate per export, AC 15)».

### Note non bloccanti (non sono finding)

- **N1 — test di assenza potenzialmente vacui se letti prima del render**: `e2e/people-management.spec.ts:55` (form nuovo pilota, subito dopo il click) e `e2e/aircraft-management.spec.ts:64` (form di creazione velivolo) asseriscono `toHaveCount(0)` senza prima un'asserzione positiva sul form caricato. Il dev ha protetto esplicitamente solo il caso istruttore (`:421-425`). Empiricamente l'assenza è reale (sonda UI qui sotto: count 0 a form renderizzato, a 1280 e a 375), quindi non c'è un difetto. Un `await expect(form.getByLabel('Nome', { exact: true })).toBeVisible()` prima del count le renderebbe non vacue per costruzione.
- **N2 — TD 16.2-g colpisce proprio l'e2e che prova P5**: E3 è la prova e2e del lock (AC 13) e flakka per una ragione estranea al lock. Il flake non può mai dare un falso verde (un lock rotto darebbe `[201, 201]`, il flake dà `[201, 422]`), ma chi legge «E3 flaky» deve controllare il codice ricevuto prima di archiviarlo come flake. Rimedio già scritto nel TD (serializzare il describe 14.4 o cambiare lo scope delle sue fixture). In alternativa, solo per E1-E4, un `force: true` + `forceReason` (precedente 15.5) renderebbe le POST immuni al catalogo globale.

---

## Decisioni PO necessarie

**Nessuna per la 19.2.** D-1/D-2/D-3 sono rispettate alla lettera (tre superfici; DTO senza campo ore, OpenAPI `Aircraft` = `id,registration,type,model,status,statusReason,outOfServiceUntil,archivedAt,createdAt`; sub dello sheet = tipo). F1 è un riperimetro tecnico della 16.8 che segue dalla R-19-b già ratificata, non una domanda nuova.

---

## Verificato corretto (con prove)

**Lock `FOR UPDATE` (P5, AC 13): presente e discriminante.**
- Codice: `registerFlight` `flights.service.ts:1140-1141`, `cancelFlight` `:1355-1356`, `correctFlight` `:1483-1484` (`IN (…) ORDER BY "id"`, `Set` con lo stesso controllo di esistenza). Il lock è il primo statement della transazione e viene prima di `assertNoOverlappingFlight` (che a sua volta precede `account.upsert` e il lock `Account`): **nessun altro lock** protegge la guardia.
- **Sonda di mutazione sullo stack reale** (build di produzione, ripristino byte-identico): in `registerFlight` la `$queryRaw … FOR UPDATE` è stata sostituita con `[{ id: resolved.aircraft.id }]`, poi rebuild:
  ```
  -- baseline (lock present):
  round 1..3: 12x identical -> 201,409×11 | REGISTERED rows in DB: 1   (tutti e tre i round)
  -- MUTANT (registerFlight lock removed):
  round 1: 12x identical -> 201,409×11 | REGISTERED rows in DB: 1
  round 2: 12x identical -> 201×10,409,409 | REGISTERED rows in DB: 10
  round 3: 12x identical -> 201×10,409,409 | REGISTERED rows in DB: 10
  ```
  sha256 di `flights.service.ts` prima = dopo = `f98de9c623c990594040219b68af49d71c3b071b494953295a57d828c6cbb2db` (lo stesso dichiarato dal dev in §D); `sha256sum -c` → `OK`. Dopo il ripristino `.next` è stato ricostruito dai gate sull'albero pulito.
- Altre sonde di concorrenza (server di produzione su HEAD):
  - 10 slot sovrapposti a catena, concorrenti → `409,201,409,201,…` = 5×201, **0 coppie sovrapposte** in DB;
  - `correct‖correct` dello stesso volo → `201,409`;
  - `cancel‖correct` → `200,409`;
  - correzione che SPOSTA un volo sul velivolo B ‖ registrazione concorrente su B nello stesso slot → `201,409`.

**«Ore totali» (R-19-b, AC 14-16).**
- Velivolo di prova con 90'+30' REGISTERED, 45' ANNULLATO, 20' corretto a 25', più un volo notturno 00:30-01:00 ora di Roma (22:30Z del giorno prima, `flightDate` = giorno Roma): Σ SQL dei REGISTERED = **175**.
  - Export xlsx: `["Marche","Tipo","Modello","Ore totali","Stato","Stato operativo"]` / `[…,"2:55",…]`.
  - Readout dell'editor: `Ore totali: 2:55` (1280 e 375).
  - Sheet mobile: `["Stato=Disponibile","Tariffa=120,00 €/h","Ore totali=2:55","Ore mese=0:00"]` (voli di ottobre: il mese è a zero, il totale no, quindi discrimina).
  - KPI del registro voli filtrato: `ORE DI VOLO 2:55`.
- Unit: `where` senza `flightDate` con limiti `null`. Nessun limite UTC spurio (TD 16.9 evitato).

**Migrazione (AD-1, AC 1/5/9/20).**
- `git diff --stat a7e960e..2dc0025 -- prisma/migrations` = solo il file nuovo (33 righe): nessuna migrazione storica toccata.
- psql su `airmanager`: `Person` = `id,firstName,lastName,email,createdAt,updatedAt,address,archivedAt,phone`, indici `Person_pkey`/`Person_email_key`; `Aircraft` senza le 5 colonne; colonne di `Flight` senza `hourMeterStart/End/notes`; `to_regclass('"HourMeterAdjustment"')` = NULL; indici `%fiscal%`/`%hourmeter%` = 0.
- **Gemello `am_rev192`** (creato e poi cancellato): `migrate deploy` da zero → `All migrations have been successfully applied.`; `migrate diff --from-config-datasource --to-schema` → `-- This is an empty migration.`

**Seed (AC 21)** sul gemello:
- `prisma db seed` verde;
- `seed:demo` verde (`24 flights registered`; Σ REGISTERED I-A661 545, I-B412 735, I-PDVB 290, I-ABCD 0 = i numeri del record);
- `seed-load.ts` a `LOAD_SCALE=0.02` verde (1234 voli, 34 velivoli, 2125 movimenti). Le 7 coppie di voli REGISTERED parzialmente sovrapposti nel dataset load non coinvolgono correzioni e sono dichiarate dal commento nuovo («partial overlaps are NOT prevented here»): il commento riscritto è vero.
- `airmanager_load` non toccato.

**API, contratto, RBAC (AC 2/3/6/10/11/12/18/24).**
- `POST /aircraft` con sole marche/tipo/modello → 201.
- Route rettifiche: GET/POST 404 per admin, pilota, istruttore e allievo; 401 per un anonimo.
- Pilota/istruttore/allievo: 403 su GET/POST `/aircraft` e sull'xlsx; `/dashboard/fleet` li reindirizza a `/dashboard`.
- Persona:
  - con `fiscalCode` → 201, chiavi della risposta `id,firstName,lastName,email,phone,address,archivedAt,createdAt,profiles`;
  - stessa email maiuscola → 409 `{"code":"CONFLICT","message":"A person with this email already exists."}`;
  - stesso ex-CF senza email → 201;
  - PATCH su un'email presa → 409 con lo stesso messaggio;
  - **8 POST concorrenti con la stessa email → 1×201 + 7×409** (il backstop P2002 dà il messaggio nuovo).
- POST `/flights` con coppia contaore invalida + `notes` di 5000 caratteri → 201 (strip, nessun 422: è il comportamento voluto dalla story).
- OpenAPI generato:
  - `CreateAircraftRequest` = `registration,type,model,rate` (required `registration,type,model`);
  - `RegisterFlightRequest` senza i tre campi;
  - testo senza `hourMeter|HourMeter|fiscal|contaore|"seats"|"fuelType"|"based"|HOUR_METER`.

**Residui (AC 22, deviazione §G-1).** I 5 grep sul codice di produzione, i messaggi, i seed e lo schema danno **0**, salvo le due eccezioni ammesse (`mobile-reports.ts:62`, `logbook-console.tsx:784`). Le righe residue sono tutte nei test, e ognuna è un'asserzione di assenza (elenco verificato riga per riga). **§G-1 accettata**: TD 19.2-b è la proposta giusta. `CLAUDE.md`, `README.md`, `.claude/hooks`, `scripts`, `.github/workflows`: 0 occorrenze. Le righe `^=` citate in `CLAUDE.md` (`aircraft-management:46`, `aircraft-rates:39`, `aircraft-status-hours:39`, `people-management:46`, `person-profiles:34`, `user-management:94`) sono ancora esatte.

**i18n (AC 3/23).**
- it 1720 / en 1720, parità `diff` vuota.
- `conflictEmail` e `PeoplePage.form.conflictError` = «Esiste già una persona con questa email.» / «A person with this email already exists.»
- Le 4 chiavi nuove sono presenti in entrambi i file.

**UI (AC 4/7/8/14/18/26).** Il Playwright MCP non parte su questa macchina (`Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome`). Ho usato il workaround sanzionato: script `playwright-core` + `chromium_headless_shell-1228` su server di produzione. Screenshot (scratchpad della sessione) a 1280 e 375 di: editor pilota nuovo/modifica, scheda persona, editor istruttore, editor velivolo nuovo/modifica, sheet flotta, form volo nuovo/correzione, sheet registro.
- Overflow orizzontale: **no** su tutti i 20 scatti.
- Griglie a 1280:
  - pilota (nuovo e modifica) `Nome@781|Cognome@1028`, `Email@781|Telefono@1028`, `Indirizzo@781 w479`: nessun buco;
  - istruttore identico;
  - velivolo nuovo `Marche|Tipo`, `Modello` wide.
- A 375 tutto è a colonna singola, w335.
- Label rimosse: count 0 con `exact: true` ovunque (CF; Posti/Carburante/Basato/Note/«Contaore iniziale (minuti)»; contaore iniziale/finale/Note anche in correzione).
- Scheda persona: righe `["Nome","Cognome","Email","Telefono","Indirizzo"]`.
- Sheet flotta: nome accessibile `Ultraleggero 3 assi — I-CHMVYERRLR9FPW · Probe`.
- Chiavi dello sheet registro: `["Data","Tratta","Pilota","Istruttore","PIC","Aereo","Tipo","Ore","Orari","Decolli","Atterraggi","Costo"]`.
- `.so-foot` presente nell'editor velivolo (nuovo e modifica) e nel form di correzione, a 1280 e 375.

**Gate.** `npm run gates` sull'albero ripristinato:
```
PASS  lint (21s)
PASS  typecheck (18s)
PASS  test (8s) — Tests  1769 passed (1769)
PASS  build (34s)
```
- Env eager: `env -u DATABASE_URL -u AUTH_SECRET -u JOBS_SECRET npx vitest run` sugli 8 file unit toccati → `8 passed / 415 passed`.
- I warning di lint sui file della story sono pre-esistenti (`ExpiredDocument` presente anche in `a7e960e`; `_minutes` slittato da `:163` a `:160`).

**Altro.**
- Nessun lettore di `Aircraft.updatedAt` (quindi togliere `tx.aircraft.update` dal registro è innocuo).
- Nessuna classe CSS rimasta orfana (`.meter-row` ha ancora 3 consumer).
- `Segmented` ha ancora un consumer.
- `git stash list` intatto (`stash@{0}` epic-12, §G-8).
- ARCHITECTURE-SPINE riga Velivoli aggiornata (FR-8 esiste ancora nel PRD).

---

## Stato della macchina a fine review

- **Repo**: nessun file tracciato modificato (`flights.service.ts` ripristinato, sha256 `OK`). Non ho usato `git stash` né `git add`. L'unico file nuovo è questo report (non committato). Gli script delle sonde stanno solo nello scratchpad della sessione.
- **`:3000` libero**: i server che ho avviato (PID 294545/294558 → fermato per env JOBS_SECRET; 294751/294764 HEAD; 299425/299438 mutante) sono stati tutti fermati per PID. Nessun run e2e vivo (`scripts/e2e.sh status` = `DONE — E2E_EXIT=0`).
- **`.next`**: build di produzione di HEAD prodotta da `npm run gates` dopo il ripristino (nessuna traccia del mutante).
- **DB `airmanager` SPORCO, va resettato prima del prossimo arbitro.** Contiene:
  - i dati della suite e delle sonde;
  - **2 velivoli `I-LKMVYEZA1KTP7G` / `I-LKMVYEZAAK4R4M` con 10 voli REGISTERED sovrapposti ciascuno**, prodotti dal server mutante;
  - `LoginAttempt` degli ultimi 15 minuti: admin 122, pilot 27, student 9, instructor 8 (rischio lock TD-6).
- **Gemello `am_rev192`**: creato e cancellato. `airmanager_load` mai toccato. Nessun `docker compose down/up`.
