---
baseline_commit: 3712b2b
---

# Story 4.1: Tariffe velivolo storicizzate

Status: review

## Story

As a admin,
I want cambiare il prezzo orario di un velivolo con decorrenza,
so that i voli usino sempre la tariffa giusta per la loro data (FR-10, AD-4).

## Acceptance Criteria

1. **Given** un velivolo con tariffa 150 €/h da gennaio, **When** inserisco una nuova tariffa 160 €/h con `validFrom` oggi, **Then** la tariffa in vigore per una data D è quella con il **massimo `validFrom <= D`** (AD-4), lo storico resta consultabile e **non esistono update sulle tariffe passate**.
2. **And** due tariffe con lo stesso `validFrom` per lo stesso velivolo → **409**.

## Tasks / Subtasks

- [x] Task 1: Modello + migrazione (AC 1/2) — PRIMA migrazione dell'epic 4
  - [x] Nuovo modello `AircraftRate` in `prisma/schema.prisma`: `id String @id @default(cuid())`; `aircraftId String` + relazione `aircraft Aircraft @relation(...)`; `priceCentsPerHour Int` (centesimi interi AD-2, sempre > 0 — vincolo nello schema Zod/service, non a livello DB); `validFrom DateTime @db.Date` (calendar-only, stessa convenzione di `AccountMovement.effectiveDate`); `actorUserId String` + `actorUser User @relation(...)` (chi ha inserito la tariffa — `Actor.userId`, sempre presente, mai `personId`, stesso pattern di `HourMeterAdjustment`); `createdAt DateTime @default(now())`. **`@@unique([aircraftId, validFrom])`** (AC 2 → P2002 → `ConflictError`/409). `@@index([aircraftId])`. Aggiungere `rates AircraftRate[]` su `Aircraft` e la back-relation su `User`.
  - [x] Append-only (AD-3/AD-4 spirit): NESSUN update/delete delle tariffe in questa story. Una tariffa sbagliata si corregge inserendone un'altra con `validFrom` successivo; lo storico non si riscrive mai (AC 1). Documentarlo nel doc-comment del modello.
  - [x] **Migrazione a mano** (il sandbox rifiuta `migrate dev`): generare lo script con `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` NON funziona per il diff DB→schema; usare invece `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_add_aircraft_rates/migration.sql`, poi `npx prisma migrate deploy` e `npx prisma generate`. Timestamp coerente col formato esistente (`YYYYMMDDHHMMSS_add_aircraft_rates`, successivo a `20260706090000`). Verificare che lo script contenga la `CREATE TABLE "AircraftRate"`, la FK e l'indice `@@unique`.
- [x] Task 2: Service `rates.service.ts` (AC 1/2)
  - [x] `createAircraftRate(actor, aircraftId, input)` — `authorize(actor, 'settings.manage')` (config di pricing = admin, come le categorie cassa 3.4; lo staff NON crea tariffe). PRIMA verificare che il velivolo esista (`findUnique` → `NotFoundError` se assente/**archiviato**? decidere: un velivolo archiviato non dovrebbe accettare nuove tariffe — 409/404, scegliere e documentare). Creare la `AircraftRate`; `try/catch` su P2002 (`isUniqueViolation`, stesso helper degli altri service) → `ConflictError('A rate with this validFrom already exists for this aircraft.')` (AC 2). `actorUserId = actor.userId`.
  - [x] `listAircraftRates(actor, aircraftId)` — `authorize(actor, 'aircraft.manage')` (lettura del listino: staff+admin la vedono sulla flotta; scelta più larga della scrittura, documentare). Ritorna lo storico ordinato per `validFrom` **desc** (più recente in cima). Verificare l'esistenza del velivolo (404 altrimenti). Piccolo (nessuna paginazione ora — come `listCashCategories`), ma cap difensivo `take: 500`.
  - [x] `getEffectiveRate(actor, aircraftId, onDate)` — la tariffa in vigore per una data (AD-4): `findFirst({ where: { aircraftId, validFrom: { lte: <date> } }, orderBy: { validFrom: 'desc' } })`. **Usare la query tipizzata Prisma** (che lega `@db.Date` come `date`, TZ-safe) — se mai si usasse raw SQL, legare la data come TEXT + cast `::date`, MAI un `Date` JS (lezione review 3.5 F1: `date >= timestamptz` promuove alla timezone di sessione e scarta i bordi). Ritorna `null` se non esiste alcuna tariffa con `validFrom <= onDate` (velivolo senza tariffa a quella data). Questa funzione è il gancio per l'epic 5 (snapshot sul volo) — esporla pulita ma non serve ancora una route dedicata se non la si consuma in UI; usarla per calcolare il "prezzo attuale" mostrato (con `onDate = oggi`).
  - [x] Tipi di ritorno (`AircraftRateListItem` con `priceCentsPerHour`, `validFrom` come `YYYY-MM-DD` via `toDateOnlyString`, `actorEmail`, `createdAt`) mirrorati come DTO in schema.
- [x] Task 3: API + OpenAPI (AC 1/2)
  - [x] `POST /api/v1/aircraft/{id}/rates` (body `createAircraftRateSchema`, `successStatus: 201`) e `GET /api/v1/aircraft/{id}/rates` (lista), thin `apiRoute()` come le altre sotto-route velivolo (`.../hour-meter-adjustments`). `z` da `zod-with-openapi`.
  - [x] `createAircraftRateSchema`: `priceCentsPerHour` int > 0 (`.int().positive().max(2_147_483_647)`), `validFrom` `z.iso.date()`. `aircraftRateItemSchema` (documentazione, mirror del DTO). Registrare in `registry.ts` (componenti `AircraftRate`/`CreateAircraftRateRequest` + le due path, tag `['Aircraft']`, `errorResponses(401,403,404,409,422)` sul POST, `(401,403,404,422)` sul GET) e aggiungere le due path a `registry.test.ts` (coverage assertion).
- [x] Task 4: UI (AC 1) — stile `minimalist-ui`
  - [x] Estendere `aircraft-manager.tsx` con un nuovo pannello `panel` mode `'rates'` (mirrorare il pannello `'hour-meter'` esistente: apertura da un'azione per-riga "Tariffe"): mostra la **tariffa attuale** (effective, `onDate = oggi`, o "nessuna tariffa"), lo **storico** (tabella validFrom/prezzo/inserita da/data), e un **form "Nuova tariffa"** (prezzo €/h con `parseCents`, data `validFrom`). Solo per attori `settings.manage` il form è visibile/abilitato (`aircraft.manage` vede solo lettura). Denaro locale-aware (M1, `formatCents`); errori 409 (validFrom duplicato) mappati a un messaggio chiaro.
  - [x] Mostrare il **prezzo orario attuale** come colonna/cella nella tabella velivoli (effective a oggi) così la flotta è leggibile a colpo d'occhio. i18n `messages/{it,en}.json` simmetrici (nuova sezione es. `AircraftPage.rates.*`).
- [x] Task 5: Test (AC 1/2)
  - [x] Unit (`rates.service.test.ts`, mockando `prisma` come `aircraft.service.test.ts`): `getEffectiveRate` sceglie il **massimo `validFrom <= D`** (fixture con 3 tariffe, controlla il bordo esatto D == validFrom → inclusa, e D subito prima → tariffa precedente); `null` quando nessuna tariffa `<= D`; `createAircraftRate` P2002 → `ConflictError` (AC 2); permessi (staff crea → Forbidden con `settings.manage`; pilota list → Forbidden); velivolo inesistente → NotFound. Schema: `priceCentsPerHour` 0/negativo → 422; `validFrom` malformato → 422.
  - [x] e2e (`e2e/aircraft-rates.spec.ts`): admin apre le tariffe di `I-ABCD`, inserisce 150 €/h da una data passata e 160 €/h da oggi → lo storico mostra entrambe, la "tariffa attuale" è 160 €/h; reinserire una tariffa con lo **stesso validFrom** → errore 409 mostrato; `POST /api/v1/aircraft/{id}/rates` come **staff** (solo `aircraft.manage`, non `settings.manage`) → **403** envelope AD-8; come pilota → 403. Date run-unique se necessario per evitare collisioni su DB sporco (pattern `uniqueDatePair` di 3.5). Il seed ha admin + `I-ABCD`; serve un utente **staff** senza admin per il test 403 — se non esiste nel seed, crearlo nel test via API admin (come fanno gli altri e2e) o usare un attore staff già disponibile.

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

Sonnet 5 (dev subagent)

### Debug Log References

- Prisma 7 (this project's version) removed `migrate diff`'s `--from-url`/`--to-schema-datamodel` flags used in the Dev Notes' exact command; the working equivalent (config-based datasource) is `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script`. The command also prints a `Loaded Prisma config from prisma.config.ts.` banner line to stdout that had to be stripped from the redirected `migration.sql` before it would parse as SQL.
- First e2e run of `aircraft-rates.spec.ts`'s AC 2 (409) test timed out clicking "Aggiungi tariffa" a second time: the click raced the still-in-flight `router.refresh()` from the first submission. Fixed by waiting for the refreshed `current-rate-*` cell (same synchronization pattern already used in the AC 1 test) before the next interaction, rather than proceeding immediately after the feedback toast appears.
- Ran the full `npx playwright test` suite once against a DB that had accumulated data from my own repeated manual runs (aircraft, invited users, etc.) and saw 19 unrelated failures (people/person-profiles/accounts specs) — a dirty-DB artifact, not a regression. Reset the DB per the Dev Notes' clean-reset recipe and the full suite (75 tests) went green.

### Completion Notes List

- Added the `AircraftRate` model (Task 1): `id`, `aircraftId` + `aircraft` relation, `priceCentsPerHour Int`, `validFrom DateTime @db.Date`, `actorUserId` + `actorUser` relation, `createdAt`; `@@unique([aircraftId, validFrom])` + `@@index([aircraftId])`; back-relations `Aircraft.rates` / `User.aircraftRates`. Generated the migration by hand (sandbox refuses `migrate dev`) and deployed it; `npx prisma migrate deploy` from a fully-dropped/recreated DB applies all 10 migrations cleanly (verified during the final gate run).
- `rates.service.ts` (Task 2): `createAircraftRate` (`settings.manage`), `listAircraftRates` (`aircraft.manage`, ordered `validFrom desc`, `take: 500`, no pagination), `getEffectiveRate(actor, aircraftId, onDate)` (`aircraft.manage`; typed Prisma `findFirst` with `validFrom: { lte: onDate }` + `orderBy: [{ validFrom: 'desc' }]` — AD-4's max-validFrom-<=-D rule, TZ-safe per the review 3.5 F1 lesson). Unique-guard is pre-check (`assertRateAvailable`) + `try`/`catch` P2002 backstop, same pattern as `aircraft.service.ts`.
- **Decision point for the reviewer**: an aircraft with `archivedAt !== null` gets a **409 ConflictError** from `createAircraftRate`, not a 404 — the aircraft demonstrably exists (staff/admin already see archived aircraft via `aircraft.manage`, so there's no enumeration concern) and pricing a retired airframe going forward would be misleading; this mirrors `archiveAircraft`'s own "already archived" `ConflictError` for the same "valid id, wrong state" shape. Not covered by an e2e test (only reasoned about + documented in the model/service doc-comments) — worth a second look.
- API + OpenAPI (Task 3): `GET`/`POST /api/v1/aircraft/{id}/rates`, thin `apiRoute()` routes. Registered `AircraftRate`/`AircraftRateList`/`CreateAircraftRateRequest` components and both paths in `registry.ts` (POST: `errorResponses(401,403,404,409,422)`; GET: `(401,403,404,422)`), and added `/api/v1/aircraft/{id}/rates` to `registry.test.ts`'s coverage array.
- UI (Task 4): new `panel` mode `'rates'` in `aircraft-manager.tsx` mirroring the `'hour-meter'` panel — current rate (sourced from the server-computed `AircraftRow.currentRatePriceCentsPerHour`, never recomputed client-side, so it can't disagree with the table cell), full history table, and a "Nuova tariffa" form gated on `canManageSettings` (derived server-side from `hasPermission(actor, 'settings.manage')`, same `readOnly`-prop pattern as `account-panel.tsx`'s `canManageFinance`); `aircraft.manage`-only viewers get a read-only current-rate + history view, no form. `page.tsx` computes each row's effective-today rate via `Promise.all(items.map(item => getEffectiveRate(actor, item.id, today)))` — N small calls (page size 20) rather than inventing a batch service function the story never asked for. i18n keys added symmetrically to `messages/it.json`/`en.json` (`AircraftPage.table.currentRate`/`noRate`, `.actions.rates`, `.ratesPanel.*`, `.feedback.rateAdded`).
- Tests (Task 5): `rates.service.test.ts` (19 cases) covers authorization for all three functions, `createAircraftRate`'s not-found/archived-conflict/P2002-race paths, `listAircraftRates`'s ordering + cap, `getEffectiveRate`'s exact AD-4 boundary (D === validFrom included; D one day before falls back to the previous rate; `null` when nothing qualifies), and `createAircraftRateSchema`'s 422 cases (zero/negative/overflow price, malformed date). `e2e/aircraft-rates.spec.ts` (4 tests): admin adds a past + a today rate and sees both in history with the correct current rate; a duplicate `validFrom` shows the 409 message; a STAFF-only actor (created via the admin users API + Mailpit invite flow, since the seed has no staff user) gets 403; a pilot gets 403.
- Final gates: `npm run lint` — 1 known benign `data-table.tsx` warning, no new ones; `npm run typecheck` — clean; `npx vitest run` — 382/382 (>= 375 required); `npx next build` — succeeded, `/api/v1/aircraft/[id]/rates` present in the route list; `npx playwright test` (clean DB reset, Mailpit already running) — 75/75 (>= 74 required).

### File List

- `prisma/schema.prisma` (modified — new `AircraftRate` model, `Aircraft.rates`/`User.aircraftRates` back-relations)
- `prisma/migrations/20260706100000_add_aircraft_rates/migration.sql` (new)
- `src/server/services/rates.service.ts` (new)
- `src/server/services/rates.service.test.ts` (new)
- `src/lib/schemas/aircraft.ts` (modified — `createAircraftRateSchema`, `aircraftRateItemSchema`, `aircraftRateListResponseSchema`)
- `src/lib/schemas/registry.ts` (modified — registered rate components + both `/api/v1/aircraft/{id}/rates` paths)
- `src/lib/schemas/registry.test.ts` (modified — added the new path to the coverage assertion)
- `src/app/api/v1/aircraft/[id]/rates/route.ts` (new)
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx` (modified — `'rates'` panel mode, `RatesPanel` component, current-rate table column)
- `src/app/[locale]/dashboard/aircraft/page.tsx` (modified — per-row `getEffectiveRate` call, `canManageSettings` prop, new labels)
- `messages/it.json` (modified — `AircraftPage.table.currentRate`/`noRate`, `.actions.rates`, `.ratesPanel.*`, `.feedback.rateAdded`)
- `messages/en.json` (modified — same keys, English)
- `e2e/aircraft-rates.spec.ts` (new)

## Change Log

- 2026-07-07: Story file created (Opus 4.8 main session), ready-for-dev.
- 2026-07-07: Implemented (Sonnet 5 dev subagent) — historicized `AircraftRate` model/migration, `rates.service.ts` (create/list/effective-rate), API + OpenAPI, `aircraft-manager.tsx` rates panel + fleet-table current-rate column, unit + e2e tests. Status set to review.
