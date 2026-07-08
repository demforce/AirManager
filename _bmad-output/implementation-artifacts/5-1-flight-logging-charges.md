---
baseline_commit: d16444c
---

# Story 5.1: Registrazione volo con calcolo costo e addebito

Status: done

## Story

As a staff,
I want registrare un volo e vedere l'addebito generato automaticamente,
so that nessun volo resti non contabilizzato (FR-14, FR-15).

## Acceptance Criteria

1. **Given** un velivolo con tariffa in vigore e una persona con conto, **When** registro un volo (velivolo, pilota/allievo, istruttore opzionale, data, contaore iniziale/finale OPPURE minuti, tipo, note, atterraggi), **Then** il costo velivolo è `round(rate_cents × minuti / 60)` alla tariffa in vigore alla data del volo (AD-4, max `validFrom <= flightDate`); se c'è un istruttore si aggiunge il suo addebito alla sua tariffa in vigore alla stessa data.
2. **And** nasce un `AccountMovement` **`FLIGHT_CHARGE`** (importo NEGATIVO = −(costo velivolo + costo istruttore)) con lo snapshot della scomposizione persistito (minuti, tariffe applicate, importi — AD-4) e il contaore del velivolo avanza dei minuti del volo (FR-9) — tutto in UNA transazione.
3. **Given** contaore finale < iniziale (o = iniziale), o velivolo archiviato, o persona archiviata, **When** provo a registrare, **Then** **422 con codice errore SPECIFICO** (non il generico `VALIDATION_ERROR` — vedi Contesto).
4. **Given** un utente non staff (pilota/allievo/istruttore), **When** chiama `POST /api/v1/flights`, **Then** 403 envelope AD-8 (FR-14: solo staff registra; la consultazione per gli altri ruoli è story 5.4).

## Contesto e decisioni chiave (LEGGERE PRIMA DI CODIFICARE)

- **QUI il conto si addebita DAVVERO** (a differenza di `PACKAGE_PURCHASE` che è amount 0): `FLIGHT_CHARGE` ha `amountCents` **negativo**. Il saldo (SUM, AD-3) scende e può andare in rosso — è il flusso previsto dal dominio (il pilota ricarica dopo). NIENTE blocco per saldo insufficiente.
- **Alert saldo negativo (FR-27, pattern story 3.3)**: un addebito può far peggiorare la banda del saldo (`ok` → `negative` → `belowThreshold`). Il service DEVE riusare il meccanismo di `recordAdjustment`: lock `FOR UPDATE` sulla riga `Account` nella transazione, lettura saldo prima, confronto bande dopo, email fire-and-forget POST-commit. Per riusarlo: **esportare** da `accounts.service.ts` gli helper oggi privati che servono (`getNegativeBalanceThresholdCents`, `sendNegativeBalanceAlert`, `bandWorsened` — `balanceBand` è già esportato) SENZA cambiarne la logica; NON duplicarli in flights.service.
- **Un solo movimento per volo**: UNA riga `FLIGHT_CHARGE` con il totale negativo; la **scomposizione** (AD-4 "snapshot dentro i movimenti generati") vive sulle colonne snapshot del nuovo modello `Flight`, raggiungibile dal movimento via la nuova FK `AccountMovement.flightId`. Il dettaglio del movimento (FR-15) si legge dalla relazione, MAI ricalcolando dalle tariffe correnti. (Story 5.3 aggancerà lo storno allo stesso movimento via `reversalOfId`; 5.2 aggiungerà i minuti scalati da pacchetto alla scomposizione.)
- **Contaore (FR-9)**: `Aircraft.hourMeterMinutes` **avanza SEMPRE di `minutes`** (`+=`), nella stessa transazione dell'addebito, con lock `FOR UPDATE` sulla riga `Aircraft` (stesso pattern di `adjustHourMeter`, review 2.5 F1). Quando lo staff inserisce contaore iniziale/finale, quei valori sono OSSERVAZIONI registrate sul volo (`hourMeterStart`/`hourMeterEnd`) e `minutes = end − start`; NON si fa `SET hourMeterMinutes = end` (voli registrati fuori ordine o rettifiche manuali pregresse renderebbero il set distruttivo). Nessun `HourMeterAdjustment` viene creato: quella tabella è SOLO per le rettifiche manuali motivate; il volo stesso è l'audit dell'avanzamento.
- **422 con codice specifico (AC 3)**: l'epica lo impone. `ValidationError` oggi ha `code = 'VALIDATION_ERROR'` fisso: **estenderla** con un code opzionale nel costruttore (`constructor(message, details?, code = 'VALIDATION_ERROR')` o equivalente — decidere la firma pulita, il campo resta `readonly`) così i 422 di dominio portano codici stabili SCREAMING_SNAKE (AD-8) e Zod continua a produrre `VALIDATION_ERROR`. Codici da usare: `HOUR_METER_INVALID` (finale <= iniziale), `AIRCRAFT_ARCHIVED`, `PERSON_ARCHIVED`, `PERSON_NOT_PILOT_OR_STUDENT`, `INSTRUCTOR_NOT_FOUND` (persona indicata senza profilo istruttore attivo), `INSTRUCTOR_SAME_AS_PILOT`, `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`, `NO_AIRCRAFT_RATE`, `NO_INSTRUCTOR_RATE`, `FLIGHT_DATE_IN_FUTURE`. NOTA consapevole: per `sellPackage` (4.4) una persona archiviata è 409 — qui l'AC dell'epica dice esplicitamente 422, e la divergenza va documentata nel doc-comment del service (il flight input referenzia più entità: lo stato sbagliato di una di esse è trattato come input non processabile, non come conflitto di stato della risorsa target).
- **Arrotondamento (AD-2/FR-15/NFR-5)**: costo componente = `Math.round(priceCentsPerHour * minutes / 60)` (half-up sui positivi, al centesimo). Velivolo e istruttore si arrotondano **separatamente**, il totale è la somma dei due arrotondati. 80' × 150 €/h → 20000 cents (caso testabile del PRD).
- **Tariffe (AD-4)**: riusare `rates.service.ts#getEffectiveRate` e `instructor-rates.service.ts#getEffectiveInstructorRate` (già pronti per questo — handoff epic 4), con `onDate = flightDate`. Nessuna tariffa velivolo in vigore → 422 `NO_AIRCRAFT_RATE`; istruttore presente senza tariffa in vigore → 422 `NO_INSTRUCTOR_RATE` (mai addebito 0 silenzioso). I lookup avvengono PRIMA della transazione (le tariffe sono append-only, niente race rilevante).
- **Chi vola / chi paga**: `Flight.personId` → `Person` (AD-11: mai il profilo). La persona DEVE avere un profilo pilota O allievo ATTIVO (`deactivatedAt: null`) → altrimenti 422 `PERSON_NOT_PILOT_OR_STUDENT` (FR-14 "Pilota o Allievo"). L'addebito totale (velivolo + istruttore) va sul conto di QUESTA persona (upsert get-or-create come `recordTopUp` — un allievo al primo volo può non avere ancora l'Account). L'istruttore nell'API è indicato per `instructorPersonId` (coerente con `/people/{id}/instructor-rates`), risolto a `InstructorProfile` attivo; sul modello la FK è `instructorProfileId` (ERD). `instructorPersonId === personId` → 422 `INSTRUCTOR_SAME_AS_PILOT`.
- **Tipo volo**: nuovo enum Prisma `FlightType { PRIVATE, SCHOOL, OTHER }` (il PRD non enumera i tipi: PRIVATE = volo privato/turistico, SCHOOL = volo scuola con istruttore per la scuola — epic 9 sommerà le ore scuola per istruttore da qui —, OTHER = tutto il resto). `SCHOOL` RICHIEDE l'istruttore (422 `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`); l'istruttore è ammesso anche su PRIVATE/OTHER (es. checkride) e in ogni caso genera il suo addebito.
- **Stato volo**: nuovo enum `FlightStatus { REGISTERED, CANCELLED }`, colonna `status` default `REGISTERED`. In 5.1 nessun volo diventa mai CANCELLED (l'annullamento è story 5.3) — la colonna nasce ora perché il registro 5.4 filtra per stato e l'enum-migration additiva dopo sarebbe più fragile.
- **Velivolo OUT_OF_SERVICE**: la registrazione è AMMESSA (il flag governa la prenotabilità, epic 7; un volo può essere registrato dopo che il velivolo è andato fuori servizio). Solo `archivedAt` blocca (422 `AIRCRAFT_ARCHIVED`). Data volo futura → 422 `FLIGHT_DATE_IN_FUTURE` (un volo si registra a cose avvenute; oggi UTC date-only è ammesso).

## Tasks / Subtasks

- [x] Task 1: Modello + migrazione (AC 1/2)
  - [x] Enum `AccountMovementType`: aggiungere **`FLIGHT_CHARGE`** (migrazione additiva `ALTER TYPE ... ADD VALUE`; come in 4.4: il valore NON è usabile nella stessa transazione che lo aggiunge — la migrazione aggiunge solo il valore).
  - [x] Nuovi enum `FlightType { PRIVATE, SCHOOL, OTHER }` e `FlightStatus { REGISTERED, CANCELLED }`.
  - [x] Nuovo modello `Flight`: `id String @id @default(cuid())`; `aircraftId` + FK `Aircraft` (back-relation `Aircraft.flights Flight[]`); `personId` + FK `Person` (back-relation `Person.flights Flight[]` — AD-11, mai il profilo); `instructorProfileId String?` + FK `InstructorProfile` (back-relation `InstructorProfile.flights Flight[]`); `flightDate DateTime @db.Date` (convenzione date-only); `flightType FlightType`; `status FlightStatus @default(REGISTERED)`; `minutes Int` (SEMPRE popolato, derivato o diretto — AD-2); `hourMeterStart Int?` / `hourMeterEnd Int?` (osservazioni, entrambi o nessuno); `landings Int?`; `notes String?`; snapshot AD-4: `aircraftRateCentsPerHour Int`, `aircraftAmountCents Int` (positivo, costo componente), `instructorRateCentsPerHour Int?`, `instructorAmountCents Int?` (null ⟺ nessun istruttore); `actorUserId` + FK `User` (back-relation `User.flightsRecorded Flight[]`); `createdAt`, `updatedAt`. Indici: `@@index([aircraftId])`, `@@index([personId])`, `@@index([instructorProfileId])`, `@@index([flightDate])`. Doc-comment sul modello: snapshot mai ricalcolato, contaore avanzato via transazione (mai PATCH), storno/consumo pacchetti = 5.2/5.3. NIENTE colonna totale (il totale vive sul movimento; niente contatori derivabili persistiti oltre lo snapshot per-componente).
  - [x] `AccountMovement`: aggiungere `flightId String?` + FK `Flight` (back-relation `Flight.movements AccountMovement[]` — plurale: 5.3 aggancerà anche gli storni) + `@@index([flightId])`. NON unique: più movimenti per volo sono attesi in futuro.
  - [x] Migrazione a mano (procedura Prisma 7 consolidata: `prisma format` + `validate`, `migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script`, togliere la riga banner, timestamp dopo `20260707140000`), poi `migrate deploy` + `generate`. Verificare `ALTER TYPE`, `CREATE TABLE "Flight"`, FK e indici, `ALTER TABLE "AccountMovement" ADD COLUMN "flightId"`.
- [x] Task 2: Errori con codice specifico (AC 3)
  - [x] `src/server/services/errors.ts`: `ValidationError` accetta un `code` opzionale (default `'VALIDATION_ERROR'`), campo `readonly` — la mappa HTTP in `handler.ts` non cambia (instanceof). Unit test: code custom nel envelope 422, default invariato per gli usi esistenti.
- [x] Task 3: Service (AC 1/2/3/4)
  - [x] `accounts.service.ts`: esportare `getNegativeBalanceThresholdCents`, `sendNegativeBalanceAlert`, `bandWorsened` (logica INVARIATA, solo `export`; aggiornare i doc-comment con il nuovo consumer). NON toccare `recordTopUp`/`recordAdjustment`.
  - [x] Nuovo `src/server/services/flights.service.ts` — `registerFlight(actor, input)`, `authorize(actor, 'flights.manage')` (STAFF/ADMIN, FR-14). Ordine guardie (pattern consolidato: esistenza 404 → stato → dominio): velivolo esiste → 404; persona esiste → 404; (poi gli stati, 422 per AC 3): velivolo archiviato → `AIRCRAFT_ARCHIVED`; persona archiviata → `PERSON_ARCHIVED`; profilo pilota/allievo attivo mancante → `PERSON_NOT_PILOT_OR_STUDENT`; `flightDate > oggi UTC` → `FLIGHT_DATE_IN_FUTURE`; risoluzione minuti (`minutes` diretti oppure `hourMeterEnd − hourMeterStart`; `end <= start` → `HOUR_METER_INVALID` — lo Zod refine copre già i casi struttura, il service ri-verifica la disuguaglianza); `flightType === 'SCHOOL' && !instructorPersonId` → `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`; se `instructorPersonId`: `=== personId` → `INSTRUCTOR_SAME_AS_PILOT`, profilo istruttore attivo mancante → `INSTRUCTOR_NOT_FOUND`. Tariffe PRIMA della transazione: `getEffectiveRate(actor, aircraftId, flightDate)` → null → `NO_AIRCRAFT_RATE`; con istruttore `getEffectiveInstructorRate(actor, instructorPersonId, flightDate)` → null → `NO_INSTRUCTOR_RATE`. Importi: `aircraftAmountCents = Math.round(rate * minutes / 60)`, idem istruttore; totale = somma. Threshold alert letto prima della tx (come `recordAdjustment`).
  - [x] UNA `prisma.$transaction`: lock `FOR UPDATE` su `Aircraft` (riga contaore — raw query tipizzata come `adjustHourMeter`) e su `Account` (upsert get-or-create PRIMA del lock non è possibile: upsert → poi `SELECT ... FOR UPDATE` sulla riga account, pattern `recordAdjustment`); saldo prima (aggregate SUM); `Flight.create` (snapshot completo); `AccountMovement.create` (`type: FLIGHT_CHARGE`, `amountCents: -(totale)`, `flightId`, `effectiveDate: flightDate`, `description` auto: `Volo <marche> <YYYY-MM-DD> — <H:MM>` via `formatMinutes`, `actorUserId`); `Aircraft.update` `hourMeterMinutes += minutes`. Ritorno: DTO volo + overview conto (via `getAccountOverview`, stesso caveat documentato di `sellPackage`). POST-commit: confronto bande e `sendNegativeBalanceAlert` fire-and-forget (pattern `recordAdjustment` — MAI dentro la tx).
  - [x] `listFlights(actor, query)` — `authorize(actor, 'flights.manage')` (5.4 estenderà a own-access + filtri; documentarlo). Paginata (`paginate`/`paginationOffset` — pattern `listAccountMovements`), ordine `flightDate desc, createdAt desc, id desc`. DTO `FlightListItem`: id, `flightDate` (string date-only), `flightType`, `status`, `minutes`, `hourMeterStart/End`, `landings`, `notes`, aircraft `{ id, registration }`, person `{ id, firstName, lastName }`, instructor `{ personId, firstName, lastName } | null` (via `instructorProfile.person`), breakdown `{ aircraftRateCentsPerHour, aircraftAmountCents, instructorRateCentsPerHour?, instructorAmountCents?, totalAmountCents }` (totale CALCOLATO nel DTO, mai colonna), `actorEmail` (staff-only list, sempre presente qui), `createdAt`.
- [x] Task 4: API + OpenAPI (AC 1/4)
  - [x] `POST /api/v1/flights` (201) e `GET /api/v1/flights` (paginata) — `apiRoute`, nuovo `src/lib/schemas/flights.ts`. `registerFlightSchema`: `aircraftId`/`personId` string min 1; `instructorPersonId` optional; `flightDate` `z.iso.date()`; `flightType` enum; ESATTAMENTE UNO tra `minutes` (int, min 1, max 1440) e la coppia `hourMeterStart`/`hourMeterEnd` (int >= 0, refine: entrambi o nessuno, `end > start`, `end − start <= 1440`) — superRefine con messaggi chiari; `landings` int min 0 max 500 optional; `notes` `.max(1000)` optional. Registrare componenti + path in `registry.ts` (nuovo tag `['Flights']`; POST `errorResponses(401,403,404,422)`, GET `(401,403,422)`) + coverage in `registry.test.ts`.
- [x] Task 5: UI (AC 1/2) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE** (regola utente), coerenza minimalista editoriale esistente (`minimalist-ui`)
  - [x] Nuova pagina `/dashboard/flights` (server component + client panel, pattern `/dashboard/finance/packages`): form "Registra volo" (staff/admin): select velivolo ATTIVO (da `listAircraft`, escludere archiviati), select persona (da `listPeople`, mostrare solo persone con profilo pilota/allievo attivo — il DTO `PersonListItem.profiles` ha i flag), select istruttore opzionale (persone con profilo istruttore attivo), data (default oggi), toggle "minuti diretti / contaore" (input `H:MM` o minuti — decidere UX pulita col toggle; il valore inviato all'API è SEMPRE minuti interi o la coppia contaore), tipo volo, atterraggi, note. Successo → mostra la scomposizione dell'addebito appena creato (minuti, tariffa velivolo, importo, eventuale riga istruttore, totale, nuovo saldo — dal DTO di risposta) + refresh lista. Errori 422 con codice specifico → messaggi i18n mirati per codice (almeno `HOUR_METER_INVALID`, `NO_AIRCRAFT_RATE`, `NO_INSTRUCTOR_RATE`, `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR`; fallback generico per gli altri).
  - [x] Lista "Voli recenti" sotto il form (da `GET /flights`, prima pagina): data, marche, persona, istruttore o "—", tipo, durata `H:MM` (`formatMinutes`), totale addebito (formattazione denaro locale-aware, `formatCents`), atterraggi. Niente filtri (story 5.4).
  - [x] Nav: `nav-items.ts` — repoint `flights` a `/dashboard/flights` (pattern commenti 2.1/2.4/3.3), permessi invariati `['flights.manage']` (5.4 riaprirà la visibilità ai piloti). Aggiornare `nav-items.test.ts` se asserisce l'href.
  - [x] Estratto conto / preview: aggiungere il case `FLIGHT_CHARGE` (+ chiave i18n `flightCharge`) agli switch tipo-movimento di `account-panel.tsx` e `account-statement-table.tsx` e allo `accountMovementTypeSchema` (`src/lib/schemas/accounts.ts`) — stesso pattern con cui 4.4 aggiunse `PACKAGE_PURCHASE`. L'importo negativo si mostra già col segno (`formatSignedCents`).
  - [x] i18n `messages/{it,en}.json` simmetrici (`FlightsPage.*`, chiavi errore per codice, `flightCharge`).
- [x] Task 6: Test (AC 1/2/3/4)
  - [x] Unit (`flights.service.test.ts`, mock prisma — pattern `packages.service.test.ts`): 403 pilota/istruttore/allievo; 404 velivolo/persona; TUTTI i 422 con assert sul `code` specifico (archiviati, profilo mancante, data futura, contaore invalido, school senza istruttore, istruttore=pilota, istruttore senza profilo, no tariffa velivolo/istruttore); calcolo: 80'×150€/h→20000, caso half-up (es. 30'×333 cents/h → `Math.round(166.5)=167`), separate-rounding (somma di due round, non round della somma); minuti da contaore (end−start); transazione: Flight+movement(−totale)+contaore avanzato, snapshot corretti, `flightId` sul movimento; con/senza istruttore (`instructor*` null); alert: banda peggiora → send chiamato post-commit, banda invariata → no send (mock mail come i test 3.3); `effectiveDate` = flightDate. `ValidationError` code custom (test in `errors`/handler esistenti). Zod: esattamente-uno (nessuno/entrambi → 422), refine contaore, max 1440.
  - [x] e2e (`e2e/flights.spec.ts`): admin definisce tariffa velivolo (API) → staff registra volo con minuti diretti → scomposizione visibile, saldo persona sceso del totale nell'estratto (riga `FLIGHT_CHARGE` negativa), contaore velivolo avanzato (pagina aircraft); volo con contaore start/end → minuti derivati; volo SCUOLA con istruttore (tariffa istruttore via API) → totale = velivolo+istruttore; 422 contaore invalido mostrato nel form; velivolo senza tariffa → messaggio `NO_AIRCRAFT_RATE`; pilota: `POST /api/v1/flights` → 403 envelope; nav "Voli" visibile a staff, assente per pilota. Nomi/date run-unique (pattern consolidato).

## Dev Notes

- **AD-2**: centesimi e minuti interi ovunque; `Math.round` half-up sui positivi. **AD-3**: movimento append-only, saldo = SUM; contaore NON è un ledger ma avanza solo via transazione qui e via `adjustHourMeter` (mai PATCH). **AD-4**: snapshot su `Flight` + tariffa effettiva a `flightDate`; mai ricalcolare lo storico. **AD-5**: `authorize` prima di tutto. **AD-8**: envelope errori, codici stabili. **AD-11**: `personId`, mai profili, per chi vola/paga.
- **Lezioni review**: lock FOR UPDATE per letture-then-write concorrenti (2.5 F1, 3.3); pre-check + backstop dove c'è unique/FK; guardie di stato DOPO il 404; date-only UTC via `src/lib/date-only.ts` (MAI `new Date(anno, mese, giorno)` locale, MAI raw SQL su `@db.Date`); email fire-and-forget POST-commit (3.3); `key={id}` sui client panel; i18n simmetrica; denaro/durate locale-aware in UI.
- **Cosa NON fare**: niente consumo pacchetti (story 5.2 — `computeRemainingMinutes` NON si tocca); niente storno/annullamento (5.3); niente filtri/own-access sul registro (5.4); niente blocco saldo insufficiente; niente `HourMeterAdjustment` per l'avanzamento da volo; niente CashMovement (nessun contante si muove); NON toccare `recordTopUp`/`recordAdjustment`/`sellPackage`; niente preview live del costo nel form (il risultato si mostra dopo il salvataggio).
- **Ambiente/gate**: postgres attivo; reset DB (DROP/createdb/`migrate deploy`/`db seed`) prima del run e2e finale; Mailpit se disponibile (`/root/go/bin/mailpit` via Bash `run_in_background: true` — se assente, i test email-dipendenti esistenti potrebbero fallire: segnalarlo, non è colpa di questa story); MAI `playwright install`. Gate: lint (warning benigno noto `data-table.tsx`), typecheck, `npx vitest run` (>= 479 attesi + i nuovi), `npx next build`, `npx playwright test` (>= 83 attesi + i nuovi; flaky noti: re-run in isolamento su DB fresco prima di giudicare). UN commit di implementazione (`Story 5.1: <sintesi>`, nessun riferimento AI). NON push.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-9, FR-14, FR-15, FR-27, NFR-5]
- [Source: src/server/services/rates.service.ts#getEffectiveRate; src/server/services/instructor-rates.service.ts#getEffectiveInstructorRate] — lookup tariffa AD-4 (pronti dall'epic 4)
- [Source: src/server/services/accounts.service.ts#recordAdjustment] — lock Account, bande saldo, alert post-commit (pattern da riusare via export)
- [Source: src/server/services/aircraft.service.ts#adjustHourMeter] — lock FOR UPDATE su Aircraft
- [Source: src/server/services/packages.service.ts#sellPackage] — guard order, transazione multi-record, overview di ritorno
- [Source: src/lib/api/handler.ts, src/lib/api/pagination.ts, src/lib/time.ts, src/lib/money.ts, src/lib/date-only.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #AD-5, #AD-8, #AD-11]
- [Source: _bmad-output/implementation-artifacts/4-4-package-sale.md#Review Record] — deferred D1/D2/D3 (contesto, non scope)

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

- Migrazione a mano: `npx prisma format && npx prisma validate`, `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script` (nessuna riga banner nell'output di questa versione di Prisma — nulla da rimuovere), salvata come `prisma/migrations/20260707150000_add_flights/migration.sql`, poi `npx prisma migrate deploy` + `npx prisma generate` — applicata pulita (14 migrazioni totali).
- Durante la verifica interattiva (Playwright MCP) la pagina `/dashboard/flights` produceva un warning Node `DeprecationWarning: Calling client.query() when the client is already executing a query` alla prima navigazione: causato dal `Promise.all` iniziale di `page.tsx` che apriva 3 `$transaction` concorrenti (`listAircraft`+`listPeople`+`listFlights`) sullo stesso client `@prisma/adapter-pg`. Corretto sostituendo con `await` sequenziali (stesso pattern conservativo delle altre dashboard page) — verificato che il warning non si ripresenta.
- Verifica interattiva end-to-end via Playwright MCP (Chromium headless, dev server + Mailpit locali) prima di scrivere gli e2e: registrazione volo minuti diretti (80'×150€/h→200,00€, saldo -200,00€, contaore 750→830), volo SCUOLA con istruttore in modalità contaore (830→900, 70'×150€/h + 70'×40€/h→221,67€ totale), messaggio `NO_AIRCRAFT_RATE` su velivolo senza tariffa, estratto conto con riga "Addebito volo" negativa, nav "Voli" verso `/dashboard/flights`.

### Completion Notes List

- Tutti gli AC (1-4) implementati e verificati: costo velivolo/istruttore arrotondati separatamente (`Math.round`), `FLIGHT_CHARGE` negativo con saldo che può andare in rosso, contaore avanzato `+= minutes` dentro la stessa transazione, 422 con codici specifici per ognuno dei 10 casi elencati nel Contesto, 403 per attori non-staff.
- `ValidationError` esteso con `code` opzionale (default invariato `'VALIDATION_ERROR'`) — nessun consumer esistente rotto (verificato da `handler.test.ts` e dal resto della suite).
- `accounts.service.ts`: `getNegativeBalanceThresholdCents`, `sendNegativeBalanceAlert`, `bandWorsened` esportati SENZA modifiche di logica; `flights.service.ts` li riusa verbatim per l'alert saldo negativo (stesso pattern lock-read-compare-send di `recordAdjustment`), senza duplicarli.
- Deviazione consapevole rispetto a `sellPackage` documentata nel doc-comment del service: qui gli stati sbagliati (velivolo/persona archiviati) sono 422 (non 409) perché l'AC dell'epica lo richiede esplicitamente e l'input referenzia più entità.
- UI: skill `design-taste-frontend` e `ui-ux-pro-max` interrogate prima di costruire il form; per una pagina di dashboard interna (fuori scope dichiarato di `design-taste-frontend`, che è pensata per landing/portfolio) ho seguito lo stile minimalista editoriale già stabilito nell'app (imitando `packages-panel.tsx`/`account-panel.tsx`/`aircraft-manager.tsx`), senza introdurre un sistema di design nuovo.
- Toggle "minuti diretti / contaore" implementato con stato locale (non `react-hook-form.watch()`) per evitare un secondo warning del React Compiler (stessa eccezione documentata di `data-table.tsx`); il valore inviato all'API resta sempre minuti interi o la coppia contaore, mai un valore derivato lato form.
- Nessuna preview live del costo nel form (Dev Notes) — la scomposizione si vede solo dopo la creazione, dal DTO di risposta.
- Pagina `/dashboard/flights`: le 3 letture iniziali (`listAircraft`/`listPeople`/`listFlights`) sono sequenziali, non `Promise.all` — vedi Debug Log References.

### File List

- `prisma/schema.prisma` (enum `FlightType`/`FlightStatus`, modello `Flight`, `AccountMovementType.FLIGHT_CHARGE`, `AccountMovement.flightId`, back-relations su `Aircraft`/`Person`/`InstructorProfile`/`User`)
- `prisma/migrations/20260707150000_add_flights/migration.sql`
- `src/server/services/errors.ts`
- `src/server/services/accounts.service.ts`
- `src/server/services/flights.service.ts`
- `src/server/services/flights.service.test.ts`
- `src/lib/schemas/flights.ts`
- `src/lib/schemas/accounts.ts`
- `src/lib/schemas/registry.ts`
- `src/lib/schemas/registry.test.ts`
- `src/app/api/v1/flights/route.ts`
- `src/app/[locale]/dashboard/flights/page.tsx`
- `src/app/[locale]/dashboard/flights/flights-manager.tsx`
- `src/app/[locale]/dashboard/nav-items.ts`
- `src/app/[locale]/dashboard/people/account-panel.tsx`
- `src/app/[locale]/dashboard/people/[id]/page.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx`
- `src/lib/api/handler.test.ts`
- `messages/it.json`, `messages/en.json`
- `e2e/flights.spec.ts`

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: clean pass — nessuna modifica al codice richiesta.**

Verificato e trovato corretto (review con verifica empirica su DB + riproduzione concorrenza):
- **Money math (AD-2/NFR-5)**: 80'×150€/h = 20000 cents esatti; arrotondamento half-up per-componente verificato empiricamente (30'×333c/h → `Math.round(166.5)=167`); totale = somma dei componenti GIÀ arrotondati (mai round-della-somma); movimento a −totale, SUM del ledger scende esattamente del totale.
- **AD-4**: volo datato ESATTAMENTE sul `validFrom` prende quella tariffa (`lte` inclusivo); volo prima di ogni tariffa → 422 `NO_AIRCRAFT_RATE`; query tipizzate su `@db.Date` (mai raw SQL), round-trip `parseDateOnlyUtc` verificato — TZ-safe.
- **Atomicità e lock (riproduzione DB-backed)**: 3 registrazioni parallele stesso velivolo → contaore avanzato esattamente della somma (10+25+5=40, nessun lost update — FOR UPDATE serializza, stesso pattern di `adjustHourMeter` che quindi si serializza anche con i voli); 4 addebiti paralleli stesso conto → SUM coerente (lock su Account serializza la lettura saldo-prima); Flight + movimento + contaore in UNA transazione, partial failure → rollback completo.
- **FR-9**: contaore `+= minutes` dal valore lockato, mai `SET = end`; nessun `HourMeterAdjustment` creato.
- **Guardie e RBAC (AD-5)**: authorize → 404 esistenza → 422 stato → 422 tariffe, tutti i 10 codici specifici verificati; persona con solo profilo istruttore attivo → `PERSON_NOT_PILOT_OR_STUDENT`; PILOT senza `flights.manage` → 403 e nav nascosta; `INSTRUCTOR_NOT_FOUND` enumeration-safe (fold voluto).
- **AC 3**: `ValidationError` con code opzionale, default `VALIDATION_ERROR` preservato (nessun consumer esistente rotto), mapping handler invariato (instanceof).
- **Alert FR-27**: helper 3.3 esportati verbatim (soli `export` aggiunti, corpi invariati; `recordTopUp`/`recordAdjustment`/`sellPackage` intatti); threshold pre-tx, bande before/after, send POST-commit fire-and-forget col saldo ri-letto fresco; unit: send su peggioramento, no-send su banda invariata.
- **Migrazione**: 14 migrazioni pulite su DB fresco; `ALTER TYPE ADD VALUE` mai usato nella propria migrazione; FK corrette (`AccountMovement.flightId` SET NULL non-unique, pronto per 5.3; aircraft/person/actorUser RESTRICT; instructorProfile SET NULL); indici presenti; nessuna colonna totale persistita.
- **API/OpenAPI/UI/i18n**: path e componenti registrati (tag `Flights`) + coverage; it/en 100% simmetrici (59 chiavi `FlightsPage`); `FLIGHT_CHARGE` nei due switch movimento + schema; mapping errori per codice nel form (tutti i 10 wired); picker filtrati sui profili ATTIVI coerenti con la re-validazione server.
- **Story compliance**: tutti gli AC e i task onesti; File List = diff reale (23 file). Gate ri-eseguiti dal reviewer: tsc pulito, 530/530 unit, migrate deploy + seed su DB fresco OK (+4 check integrativi DB-backed throwaway, tutti passati).

Deferral (non bloccante, nessuna azione):
- **D1** — un istruttore la cui Person è archiviata ma col profilo istruttore ancora attivo verrebbe accettato via API diretta (la UI non lo propone: `includeArchived: false`). Sanzionato dalla spec (la guard list scopa la validazione istruttore al solo profilo attivo); se in futuro va vietato: guard `archivedAt` foldato in `INSTRUCTOR_NOT_FOUND`.

### Final gates (review run)

typecheck pulito, **530/530 unit**, `migrate deploy` 14/14 + seed su DB fresco, 4 riproduzioni DB-backed (AD-4 boundary, NO_AIRCRAFT_RATE, concorrenza contaore, concorrenza SUM ledger) tutte verdi; e2e 89/89 dal run dev (non ri-eseguito dal reviewer: logica coperta da unit+integrazione). Working tree pulito.

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
- 2026-07-07: Implemented (Sonnet 5 single dev agent, xhigh) — all tasks complete, all gates green.
- 2026-07-07: Review Opus 4.8 xhigh — clean pass (D1 deferred, non bloccante). Status → done.
