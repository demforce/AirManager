# Story 4.2: Tariffe istruttore storicizzate

Status: ready-for-dev

## Story

As a admin,
I want gestire il prezzo orario di ogni istruttore con decorrenza,
so that i voli scuola addebitino il costo istruttore corretto (FR-11, AD-4).

## Acceptance Criteria

1. **Given** un istruttore attivo, **When** inserisco tariffe con `validFrom` diversi, **Then** valgono le **stesse regole di storicizzazione della Story 4.1**: la tariffa in vigore per una data D è quella col **massimo `validFrom <= D`** (AD-4), lo storico resta consultabile, **nessun update sulle tariffe passate**.
2. **And** due tariffe con lo stesso `validFrom` per lo stesso istruttore → **409**.

## Contesto: questa story è il gemello di 4.1

Story 4.2 è deliberatamente **parallela a Story 4.1** (tariffe velivolo): stesso modello storicizzato con `validFrom`, stessa regola AD-4 (max `validFrom <= D`), stesso append-only (niente update/delete), stesso 409 su `validFrom` duplicato, stessa gestione date TZ-safe. **Riusare i pattern e gli helper di 4.1**, non reinventarli. La differenza è solo il soggetto della tariffa: **l'istruttore** (`InstructorProfile`) invece del velivolo.

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/2)
  - [ ] Nuovo modello `InstructorRate` in `prisma/schema.prisma`, **identico in forma a `AircraftRate`** ma legato all'istruttore: `id String @id @default(cuid())`; `instructorProfileId String` + relazione `instructorProfile InstructorProfile @relation(...)`; `priceCentsPerHour Int` (centesimi interi AD-2, > 0 nel service/schema); `validFrom DateTime @db.Date`; `actorUserId String` + `actorUser User @relation(...)`; `createdAt DateTime @default(now())`. **`@@unique([instructorProfileId, validFrom])`** (AC 2 → P2002 → 409). `@@index([instructorProfileId])`. Aggiungere `rates InstructorRate[]` su `InstructorProfile` e la back-relation su `User` (es. `instructorRates InstructorRate[]`). Doc-comment: append-only, correzione = nuova tariffa con `validFrom` successivo.
  - [ ] Migrazione a mano (Prisma 7 in questo repo: usare `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script`, **rimuovere la riga banner `Loaded Prisma config...`** dallo stdout prima di salvare in `prisma/migrations/<YYYYMMDDHHMMSS>_add_instructor_rates/migration.sql`), poi `npx prisma migrate deploy` + `npx prisma generate`. Timestamp successivo a `20260706100000`. Verificare `CREATE TABLE "InstructorRate"`, le due FK e l'indice unique.
- [ ] Task 2: Service `instructor-rates.service.ts` (AC 1/2) — mirrorare `rates.service.ts`
  - [ ] **Estrarre gli helper date-only condivisi**: `parseDateOnlyUtc`, `todayDateOnlyUtc`, `toDateOnlyString` oggi vivono in `rates.service.ts` (alcuni non esportati) e sono duplicati anche in `cash.service.ts`/`accounts.service.ts`. Spostarli in un piccolo modulo condiviso `src/lib/date-only.ts` (con test) e importarli da `rates.service.ts` E dal nuovo `instructor-rates.service.ts`. NON toccare cash/accounts in questa story (evitare uno sweep fuori scope) — solo i due rate service usano il modulo nuovo. Se preferisci non estrarre, importa i due helper già esistenti da `rates.service.ts`; scegli e documenta, ma **non copiarli una terza volta**.
  - [ ] `createInstructorRate(actor, personId, input)` — `authorize(actor, 'settings.manage')` (config pricing = admin, come 4.1). Risolvere l'istruttore **dal personId**: `person.instructorProfile` deve esistere ED essere attivo (`deactivatedAt === null`); altrimenti **409** `ConflictError('This person has no active instructor profile.')` (persona esistente, stato sbagliato — stessa forma della decisione "archived aircraft → 409" di 4.1). Persona inesistente → **404**. Pre-check unicità (`findFirst` su `{instructorProfileId, validFrom}`) + `try/catch` P2002 backstop → 409 (AC 2). `actorUserId = actor.userId`.
  - [ ] `listInstructorRates(actor, personId)` — `authorize(actor, 'people.read')` (lettura: staff+admin vedono il pricing istruttore, coerente col fatto che i dati istruttore stanno sotto `people`; più larga della scrittura `settings.manage`, documentare la differenza da 4.1 che usa `aircraft.manage`). Risolve l'`instructorProfileId` dal personId (404 se persona assente; se la persona non è istruttore → lista vuota `[]`, NON 404: coerente con "estratto conto vuoto" di 3.2). Storico ordinato `validFrom desc`, `take: 500`.
  - [ ] `getEffectiveInstructorRate(actor, personId, onDate)` — `authorize(actor, 'people.read')`; risolve l'instructorProfile, poi `findFirst({ where: { instructorProfileId, validFrom: { lte: onDate } }, orderBy: { validFrom: 'desc' } })` (AD-4). Query **tipizzata Prisma** (@db.Date come `date`, TZ-safe — lezione 3.5 F1). Ritorna `null` se nessuna tariffa `<= onDate` o se la persona non è istruttore. Gancio per l'epic 5, oltre a calcolare la "tariffa attuale" mostrata (onDate = oggi).
  - [ ] DTO `InstructorRateListItem` (`priceCentsPerHour`, `validFrom` `YYYY-MM-DD`, `actorEmail`, `createdAt`, e `instructorProfileId`).
- [ ] Task 3: API + OpenAPI (AC 1/2)
  - [ ] `POST /api/v1/people/{id}/instructor-rates` (body `createInstructorRateSchema`, 201) e `GET /api/v1/people/{id}/instructor-rates` (lista), thin `apiRoute()` — **person-scoped**, coerente con `/api/v1/people/{id}/account/...`. `z` da `zod-with-openapi`.
  - [ ] `createInstructorRateSchema`: `priceCentsPerHour` `.int().positive().max(2_147_483_647)`, `validFrom` `z.iso.date()` (identico a `createAircraftRateSchema`). `instructorRateItemSchema` (mirror DTO). Registrare in `registry.ts` (componenti + le due path, tag `['People']` o `['Instructors']` — scegliere; POST `errorResponses(401,403,404,409,422)`, GET `(401,403,404,422)`) e aggiungere le due path a `registry.test.ts` (coverage assertion). Schemi in `src/lib/schemas/people.ts` (o un nuovo `instructor-rates.ts`; scegliere coerentemente).
- [ ] Task 4: UI (AC 1) — stile `minimalist-ui`
  - [ ] Sulla **scheda persona** (`/dashboard/people/[id]/page.tsx`): mostrare una sezione "Tariffe istruttore" **solo se la persona ha un profilo istruttore** (attivo o disattivato — se disattivato, sola lettura). Nuovo client component `instructor-rates-panel.tsx` (mirrorare il `RatesPanel` di `aircraft-manager.tsx`): tariffa attuale (effective a oggi, calcolata server-side e passata come prop — mai ricalcolata client-side), storico (validFrom/prezzo/inserita da/data), e form "Nuova tariffa" (prezzo €/h con `parseCents`, data `validFrom`) visibile/abilitato solo per `settings.manage`; `people.read`-only (staff) vede sola lettura. Denaro locale-aware (M1, `formatCents`); 409 (validFrom duplicato o "non istruttore") mappato a messaggio chiaro. `key={personId}` sul component.
  - [ ] i18n `messages/{it,en}.json` simmetrici (nuova sezione es. `PersonDetailPage.instructorRates.*`).
- [ ] Task 5: Test (AC 1/2) — mirrorare `rates.service.test.ts`
  - [ ] Unit (`instructor-rates.service.test.ts`, mock `prisma`): `getEffectiveInstructorRate` sceglie max `validFrom <= D` (bordo esatto D == validFrom incluso; D-1 → precedente; `null` se nulla `<= D`); `createInstructorRate` P2002 → Conflict (AC 2); persona senza profilo istruttore → 409; profilo istruttore disattivato → 409; persona inesistente → 404; permessi (staff crea → Forbidden con `settings.manage`; pilota list → Forbidden). Se estrai `src/lib/date-only.ts`, aggiungi `date-only.test.ts` (parse/oggi/format, incluso il caso mezzanotte UTC). Schema: prezzo 0/negativo/overflow → 422; `validFrom` malformato → 422.
  - [ ] e2e (`e2e/instructor-rates.spec.ts`): serve una persona **con profilo istruttore** — crearla via API admin (POST person + PUT `/api/v1/people/{id}/profiles/instructor`, come negli e2e esistenti dei profili) oppure riusare un helper esistente. Admin inserisce 40 €/h (data passata) e 45 €/h (oggi) → storico mostra entrambe, tariffa attuale 45 €/h; stesso `validFrom` → 409 mostrato; `POST /api/v1/people/{id}/instructor-rates` come **staff** (senza `settings.manage`) → **403** envelope; come pilota → 403. Date run-unique se servono (pattern `uniqueDatePair` di 3.5).

## Dev Notes

- **AD-4 / AD-2 / AD-3**: identici a Story 4.1 (storicizzazione max-validFrom, centesimi interi orari, append-only). Rileggere il Review Record di 4.1 (`4-1-aircraft-rates.md`) — le stesse cose che ho verificato lì valgono qui.
- **Lezioni review da rispettare** (evitano i F* già visti): `@db.Date` via query tipizzata Prisma + Date UTC-midnight (mai raw SQL con `Date` JS — 3.5 F1); unicità = pre-check + `try/catch` P2002; `key={id}` sui form; `.positive()`/`.max` sui numeri, `.max(500)` sulle stringhe libere; `authorize()` PRIMA di ogni query; envelope AD-8; i18n IT/EN simmetrica; denaro locale-aware (M1).
- **Differenza di permesso rispetto a 4.1** (volutamente): lettura tariffe istruttore = `people.read` (i dati istruttore vivono sotto `people`), non `aircraft.manage`. Scrittura resta `settings.manage`. La vista "own" dell'istruttore sulle proprie tariffe è **fuori scope** (come 4.1 non ha dato accesso ai piloti) — non implementarla.
- **Riuso**: il costo istruttore NON si somma al costo velivolo qui — l'addebito combinato è epic 5. Questa story definisce e storicizza soltanto. `getEffectiveInstructorRate` è il gancio per lo snapshot volo (epic 5), non implementare lo snapshot.
- **Ambiente**: postgres attivo; Mailpit avviato (Bash `run_in_background: true`, mai `&`) prima degli e2e; reset DB pulito prima di giudicare un run e2e completo (`DROP DATABASE`/recreate + `migrate deploy` + `db seed`). MAI `playwright install`.
- **Gate** (tutti verdi prima del commit): `npm run lint` (1 warning benigno noto), `npm run typecheck`, `npx vitest run` (>= 395 attesi), `npx next build`, `npx playwright test` (>= 78 attesi, DB resettato + Mailpit up).
- Un commit di implementazione (`Story 4.2: <sintesi>`, nessun riferimento AI/modello). NON push: review + push li fa la sessione principale. Branch corrente: `claude/epic-4-rates-packages`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2]
- [Source: _bmad-output/implementation-artifacts/4-1-aircraft-rates.md] — il gemello: modello, service, API, UI panel, test, Review Record
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #AD-5, #AD-8]
- [Source: prisma/schema.prisma#InstructorProfile, #AircraftRate] — profilo istruttore (soft-deactivation) e forma del modello rate
- [Source: src/server/services/rates.service.ts] — pattern da mirrorare (helper date-only da estrarre)
- [Source: src/app/[locale]/dashboard/people/[id]/page.tsx, src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx] — scheda persona e pattern RatesPanel

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-07: Story file created (Opus 4.8 main session), ready-for-dev.
