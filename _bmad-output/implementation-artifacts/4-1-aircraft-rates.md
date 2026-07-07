# Story 4.1: Tariffe velivolo storicizzate

Status: ready-for-dev

## Story

As a admin,
I want cambiare il prezzo orario di un velivolo con decorrenza,
so that i voli usino sempre la tariffa giusta per la loro data (FR-10, AD-4).

## Acceptance Criteria

1. **Given** un velivolo con tariffa 150 €/h da gennaio, **When** inserisco una nuova tariffa 160 €/h con `validFrom` oggi, **Then** la tariffa in vigore per una data D è quella con il **massimo `validFrom <= D`** (AD-4), lo storico resta consultabile e **non esistono update sulle tariffe passate**.
2. **And** due tariffe con lo stesso `validFrom` per lo stesso velivolo → **409**.

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/2) — PRIMA migrazione dell'epic 4
  - [ ] Nuovo modello `AircraftRate` in `prisma/schema.prisma`: `id String @id @default(cuid())`; `aircraftId String` + relazione `aircraft Aircraft @relation(...)`; `priceCentsPerHour Int` (centesimi interi AD-2, sempre > 0 — vincolo nello schema Zod/service, non a livello DB); `validFrom DateTime @db.Date` (calendar-only, stessa convenzione di `AccountMovement.effectiveDate`); `actorUserId String` + `actorUser User @relation(...)` (chi ha inserito la tariffa — `Actor.userId`, sempre presente, mai `personId`, stesso pattern di `HourMeterAdjustment`); `createdAt DateTime @default(now())`. **`@@unique([aircraftId, validFrom])`** (AC 2 → P2002 → `ConflictError`/409). `@@index([aircraftId])`. Aggiungere `rates AircraftRate[]` su `Aircraft` e la back-relation su `User`.
  - [ ] Append-only (AD-3/AD-4 spirit): NESSUN update/delete delle tariffe in questa story. Una tariffa sbagliata si corregge inserendone un'altra con `validFrom` successivo; lo storico non si riscrive mai (AC 1). Documentarlo nel doc-comment del modello.
  - [ ] **Migrazione a mano** (il sandbox rifiuta `migrate dev`): generare lo script con `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` NON funziona per il diff DB→schema; usare invece `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_add_aircraft_rates/migration.sql`, poi `npx prisma migrate deploy` e `npx prisma generate`. Timestamp coerente col formato esistente (`YYYYMMDDHHMMSS_add_aircraft_rates`, successivo a `20260706090000`). Verificare che lo script contenga la `CREATE TABLE "AircraftRate"`, la FK e l'indice `@@unique`.
- [ ] Task 2: Service `rates.service.ts` (AC 1/2)
  - [ ] `createAircraftRate(actor, aircraftId, input)` — `authorize(actor, 'settings.manage')` (config di pricing = admin, come le categorie cassa 3.4; lo staff NON crea tariffe). PRIMA verificare che il velivolo esista (`findUnique` → `NotFoundError` se assente/**archiviato**? decidere: un velivolo archiviato non dovrebbe accettare nuove tariffe — 409/404, scegliere e documentare). Creare la `AircraftRate`; `try/catch` su P2002 (`isUniqueViolation`, stesso helper degli altri service) → `ConflictError('A rate with this validFrom already exists for this aircraft.')` (AC 2). `actorUserId = actor.userId`.
  - [ ] `listAircraftRates(actor, aircraftId)` — `authorize(actor, 'aircraft.manage')` (lettura del listino: staff+admin la vedono sulla flotta; scelta più larga della scrittura, documentare). Ritorna lo storico ordinato per `validFrom` **desc** (più recente in cima). Verificare l'esistenza del velivolo (404 altrimenti). Piccolo (nessuna paginazione ora — come `listCashCategories`), ma cap difensivo `take: 500`.
  - [ ] `getEffectiveRate(actor, aircraftId, onDate)` — la tariffa in vigore per una data (AD-4): `findFirst({ where: { aircraftId, validFrom: { lte: <date> } }, orderBy: { validFrom: 'desc' } })`. **Usare la query tipizzata Prisma** (che lega `@db.Date` come `date`, TZ-safe) — se mai si usasse raw SQL, legare la data come TEXT + cast `::date`, MAI un `Date` JS (lezione review 3.5 F1: `date >= timestamptz` promuove alla timezone di sessione e scarta i bordi). Ritorna `null` se non esiste alcuna tariffa con `validFrom <= onDate` (velivolo senza tariffa a quella data). Questa funzione è il gancio per l'epic 5 (snapshot sul volo) — esporla pulita ma non serve ancora una route dedicata se non la si consuma in UI; usarla per calcolare il "prezzo attuale" mostrato (con `onDate = oggi`).
  - [ ] Tipi di ritorno (`AircraftRateListItem` con `priceCentsPerHour`, `validFrom` come `YYYY-MM-DD` via `toDateOnlyString`, `actorEmail`, `createdAt`) mirrorati come DTO in schema.
- [ ] Task 3: API + OpenAPI (AC 1/2)
  - [ ] `POST /api/v1/aircraft/{id}/rates` (body `createAircraftRateSchema`, `successStatus: 201`) e `GET /api/v1/aircraft/{id}/rates` (lista), thin `apiRoute()` come le altre sotto-route velivolo (`.../hour-meter-adjustments`). `z` da `zod-with-openapi`.
  - [ ] `createAircraftRateSchema`: `priceCentsPerHour` int > 0 (`.int().positive().max(2_147_483_647)`), `validFrom` `z.iso.date()`. `aircraftRateItemSchema` (documentazione, mirror del DTO). Registrare in `registry.ts` (componenti `AircraftRate`/`CreateAircraftRateRequest` + le due path, tag `['Aircraft']`, `errorResponses(401,403,404,409,422)` sul POST, `(401,403,404,422)` sul GET) e aggiungere le due path a `registry.test.ts` (coverage assertion).
- [ ] Task 4: UI (AC 1) — stile `minimalist-ui`
  - [ ] Estendere `aircraft-manager.tsx` con un nuovo pannello `panel` mode `'rates'` (mirrorare il pannello `'hour-meter'` esistente: apertura da un'azione per-riga "Tariffe"): mostra la **tariffa attuale** (effective, `onDate = oggi`, o "nessuna tariffa"), lo **storico** (tabella validFrom/prezzo/inserita da/data), e un **form "Nuova tariffa"** (prezzo €/h con `parseCents`, data `validFrom`). Solo per attori `settings.manage` il form è visibile/abilitato (`aircraft.manage` vede solo lettura). Denaro locale-aware (M1, `formatCents`); errori 409 (validFrom duplicato) mappati a un messaggio chiaro.
  - [ ] Mostrare il **prezzo orario attuale** come colonna/cella nella tabella velivoli (effective a oggi) così la flotta è leggibile a colpo d'occhio. i18n `messages/{it,en}.json` simmetrici (nuova sezione es. `AircraftPage.rates.*`).
- [ ] Task 5: Test (AC 1/2)
  - [ ] Unit (`rates.service.test.ts`, mockando `prisma` come `aircraft.service.test.ts`): `getEffectiveRate` sceglie il **massimo `validFrom <= D`** (fixture con 3 tariffe, controlla il bordo esatto D == validFrom → inclusa, e D subito prima → tariffa precedente); `null` quando nessuna tariffa `<= D`; `createAircraftRate` P2002 → `ConflictError` (AC 2); permessi (staff crea → Forbidden con `settings.manage`; pilota list → Forbidden); velivolo inesistente → NotFound. Schema: `priceCentsPerHour` 0/negativo → 422; `validFrom` malformato → 422.
  - [ ] e2e (`e2e/aircraft-rates.spec.ts`): admin apre le tariffe di `I-ABCD`, inserisce 150 €/h da una data passata e 160 €/h da oggi → lo storico mostra entrambe, la "tariffa attuale" è 160 €/h; reinserire una tariffa con lo **stesso validFrom** → errore 409 mostrato; `POST /api/v1/aircraft/{id}/rates` come **staff** (solo `aircraft.manage`, non `settings.manage`) → **403** envelope AD-8; come pilota → 403. Date run-unique se necessario per evitare collisioni su DB sporco (pattern `uniqueDatePair` di 3.5). Il seed ha admin + `I-ABCD`; serve un utente **staff** senza admin per il test 403 — se non esiste nel seed, crearlo nel test via API admin (come fanno gli altri e2e) o usare un attore staff già disponibile.

## Dev Notes

- **AD-4 (cardine di questa story)**: tariffe storicizzate con `validFrom`; la tariffa in vigore per una data è quella col **massimo `validFrom <= data`**. Mai ricalcolare lo storico: l'epic 5 salverà uno **snapshot** del rate applicato dentro i movimenti del volo — `getEffectiveRate` è il gancio, ma lo snapshot è epic 5, NON implementarlo qui.
- **AD-2**: prezzo in centesimi interi (`priceCentsPerHour`), sempre > 0; `src/lib/money.ts` (`formatCents`/`parseCents`) già esiste, riusarlo. È un prezzo **orario** — la moltiplicazione per i minuti volo è epic 5, non qui.
- **AD-3 spirit**: append-only, nessun update/delete delle tariffe (come i ledger). Correzione = nuova tariffa con `validFrom` successivo; stesso `validFrom` → 409 (voluto, AC 2).
- **Lezioni review diventate pattern** (rispettarle, evitano i F* già visti):
  - `@db.Date` in query: usare la query **tipizzata Prisma** (TZ-safe); mai un `Date` JS in raw SQL contro una colonna `date` (review 3.5 F1 — bind TEXT + `::date`).
  - `key={id}` sui form di edit (remount su cambio record); `setValueAs`/`.nullish()` ''→null sui campi opzionali; cap INT max sui numeri e `.max(500)` sulle stringhe libere.
  - Guardie di unicità: pre-check + `try/catch` P2002 come backstop concorrenza (mai fidarsi solo del pre-check) — vedi `createCashCategory`.
  - `authorize()` PRIMA di ogni query; envelope 403/404/409/422 AD-8; niente enumeration (404 coerente per velivolo inesistente).
  - i18n IT/EN **simmetrica** (stesse chiavi in entrambi i file), denaro **locale-aware** (M1).
- **Migrazione**: reset DB pulito con `sudo -u postgres psql -c 'DROP DATABASE airmanager;' && sudo -u postgres createdb -O airmanager airmanager && npx prisma migrate deploy && npx prisma db seed`. Mailpit va avviato (Bash `run_in_background: true`) prima degli e2e o 5 test non-cassa falliscono con ECONNREFUSED. MAI `playwright install`.
- **Gate** (tutti verdi prima del commit): `npm run lint` (1 warning benigno noto su `data-table.tsx`), `npm run typecheck`, `npx vitest run` (>= 375 attesi), `npx next build`, `npx playwright test` (>= 74 attesi, DB resettato + Mailpit up).
- Un solo commit di implementazione (`Story 4.1: <sintesi>`, nessun riferimento AI/modello). NON fare push: la review + push li fa la sessione principale.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #AD-5, #AD-8]
- [Source: prisma/schema.prisma#Aircraft, #HourMeterAdjustment, #AccountMovement] — pattern `@db.Date`, `actorUserId`, append-only
- [Source: src/server/services/aircraft.service.ts] — pattern service velivolo (authorize, findUnique, P2002)
- [Source: src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx] — pattern pannello `panel` (mode `'hour-meter'` → aggiungere `'rates'`)
- [Source: _bmad-output/implementation-artifacts/3-4-cash-categories-movements.md, 3-5-financial-report.md] — Review Records (unicità, TZ `@db.Date`)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-07: Story file created (Opus 4.8 main session), ready-for-dev.
