---
baseline_commit: dab7391
---

# Story 4.2: Tariffe istruttore storicizzate

Status: review

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

- [x] Task 1: Modello + migrazione (AC 1/2)
  - [x] Nuovo modello `InstructorRate` in `prisma/schema.prisma`, **identico in forma a `AircraftRate`** ma legato all'istruttore: `id String @id @default(cuid())`; `instructorProfileId String` + relazione `instructorProfile InstructorProfile @relation(...)`; `priceCentsPerHour Int` (centesimi interi AD-2, > 0 nel service/schema); `validFrom DateTime @db.Date`; `actorUserId String` + `actorUser User @relation(...)`; `createdAt DateTime @default(now())`. **`@@unique([instructorProfileId, validFrom])`** (AC 2 → P2002 → 409). `@@index([instructorProfileId])`. Aggiungere `rates InstructorRate[]` su `InstructorProfile` e la back-relation su `User` (es. `instructorRates InstructorRate[]`). Doc-comment: append-only, correzione = nuova tariffa con `validFrom` successivo.
  - [x] Migrazione a mano (Prisma 7 in questo repo: usare `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script`, **rimuovere la riga banner `Loaded Prisma config...`** dallo stdout prima di salvare in `prisma/migrations/<YYYYMMDDHHMMSS>_add_instructor_rates/migration.sql`), poi `npx prisma migrate deploy` + `npx prisma generate`. Timestamp successivo a `20260706100000`. Verificare `CREATE TABLE "InstructorRate"`, le due FK e l'indice unique.
- [x] Task 2: Service `instructor-rates.service.ts` (AC 1/2) — mirrorare `rates.service.ts`
  - [x] **Estrarre gli helper date-only condivisi**: `parseDateOnlyUtc`, `todayDateOnlyUtc`, `toDateOnlyString` oggi vivono in `rates.service.ts` (alcuni non esportati) e sono duplicati anche in `cash.service.ts`/`accounts.service.ts`. Spostarli in un piccolo modulo condiviso `src/lib/date-only.ts` (con test) e importarli da `rates.service.ts` E dal nuovo `instructor-rates.service.ts`. NON toccare cash/accounts in questa story (evitare uno sweep fuori scope) — solo i due rate service usano il modulo nuovo. Se preferisci non estrarre, importa i due helper già esistenti da `rates.service.ts`; scegli e documenta, ma **non copiarli una terza volta**.
  - [x] `createInstructorRate(actor, personId, input)` — `authorize(actor, 'settings.manage')` (config pricing = admin, come 4.1). Risolvere l'istruttore **dal personId**: `person.instructorProfile` deve esistere ED essere attivo (`deactivatedAt === null`); altrimenti **409** `ConflictError('This person has no active instructor profile.')` (persona esistente, stato sbagliato — stessa forma della decisione "archived aircraft → 409" di 4.1). Persona inesistente → **404**. Pre-check unicità (`findFirst` su `{instructorProfileId, validFrom}`) + `try/catch` P2002 backstop → 409 (AC 2). `actorUserId = actor.userId`.
  - [x] `listInstructorRates(actor, personId)` — `authorize(actor, 'people.read')` (lettura: staff+admin vedono il pricing istruttore, coerente col fatto che i dati istruttore stanno sotto `people`; più larga della scrittura `settings.manage`, documentare la differenza da 4.1 che usa `aircraft.manage`). Risolve l'`instructorProfileId` dal personId (404 se persona assente; se la persona non è istruttore → lista vuota `[]`, NON 404: coerente con "estratto conto vuoto" di 3.2). Storico ordinato `validFrom desc`, `take: 500`.
  - [x] `getEffectiveInstructorRate(actor, personId, onDate)` — `authorize(actor, 'people.read')`; risolve l'instructorProfile, poi `findFirst({ where: { instructorProfileId, validFrom: { lte: onDate } }, orderBy: { validFrom: 'desc' } })` (AD-4). Query **tipizzata Prisma** (@db.Date come `date`, TZ-safe — lezione 3.5 F1). Ritorna `null` se nessuna tariffa `<= onDate` o se la persona non è istruttore. Gancio per l'epic 5, oltre a calcolare la "tariffa attuale" mostrata (onDate = oggi).
  - [x] DTO `InstructorRateListItem` (`priceCentsPerHour`, `validFrom` `YYYY-MM-DD`, `actorEmail`, `createdAt`, e `instructorProfileId`).
- [x] Task 3: API + OpenAPI (AC 1/2)
  - [x] `POST /api/v1/people/{id}/instructor-rates` (body `createInstructorRateSchema`, 201) e `GET /api/v1/people/{id}/instructor-rates` (lista), thin `apiRoute()` — **person-scoped**, coerente con `/api/v1/people/{id}/account/...`. `z` da `zod-with-openapi`.
  - [x] `createInstructorRateSchema`: `priceCentsPerHour` `.int().positive().max(2_147_483_647)`, `validFrom` `z.iso.date()` (identico a `createAircraftRateSchema`). `instructorRateItemSchema` (mirror DTO). Registrare in `registry.ts` (componenti + le due path, tag `['People']` o `['Instructors']` — scegliere; POST `errorResponses(401,403,404,409,422)`, GET `(401,403,404,422)`) e aggiungere le due path a `registry.test.ts` (coverage assertion). Schemi in `src/lib/schemas/people.ts` (o un nuovo `instructor-rates.ts`; scegliere coerentemente).
- [x] Task 4: UI (AC 1) — stile `minimalist-ui`
  - [x] Sulla **scheda persona** (`/dashboard/people/[id]/page.tsx`): mostrare una sezione "Tariffe istruttore" **solo se la persona ha un profilo istruttore** (attivo o disattivato — se disattivato, sola lettura). Nuovo client component `instructor-rates-panel.tsx` (mirrorare il `RatesPanel` di `aircraft-manager.tsx`): tariffa attuale (effective a oggi, calcolata server-side e passata come prop — mai ricalcolata client-side), storico (validFrom/prezzo/inserita da/data), e form "Nuova tariffa" (prezzo €/h con `parseCents`, data `validFrom`) visibile/abilitato solo per `settings.manage`; `people.read`-only (staff) vede sola lettura. Denaro locale-aware (M1, `formatCents`); 409 (validFrom duplicato o "non istruttore") mappato a messaggio chiaro. `key={personId}` sul component.
  - [x] i18n `messages/{it,en}.json` simmetrici (nuova sezione es. `PersonDetailPage.instructorRates.*`).
- [x] Task 5: Test (AC 1/2) — mirrorare `rates.service.test.ts`
  - [x] Unit (`instructor-rates.service.test.ts`, mock `prisma`): `getEffectiveInstructorRate` sceglie max `validFrom <= D` (bordo esatto D == validFrom incluso; D-1 → precedente; `null` se nulla `<= D`); `createInstructorRate` P2002 → Conflict (AC 2); persona senza profilo istruttore → 409; profilo istruttore disattivato → 409; persona inesistente → 404; permessi (staff crea → Forbidden con `settings.manage`; pilota list → Forbidden). Se estrai `src/lib/date-only.ts`, aggiungi `date-only.test.ts` (parse/oggi/format, incluso il caso mezzanotte UTC). Schema: prezzo 0/negativo/overflow → 422; `validFrom` malformato → 422.
  - [x] e2e (`e2e/instructor-rates.spec.ts`): serve una persona **con profilo istruttore** — crearla via API admin (POST person + PUT `/api/v1/people/{id}/profiles/instructor`, come negli e2e esistenti dei profili) oppure riusare un helper esistente. Admin inserisce 40 €/h (data passata) e 45 €/h (oggi) → storico mostra entrambe, tariffa attuale 45 €/h; stesso `validFrom` → 409 mostrato; `POST /api/v1/people/{id}/instructor-rates` come **staff** (senza `settings.manage`) → **403** envelope; come pilota → 403. Date run-unique se servono (pattern `uniqueDatePair` di 3.5).

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

Sonnet 5 (dev subagent)

### Debug Log References

- Same Prisma 7 migration-command gap as 4.1: `migrate diff`'s `--from-url`/`--to-schema-datamodel` flags don't exist in this repo's version; used `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script` instead, and stripped the `Loaded Prisma config from prisma.config.ts.` banner line the CLI writes to stdout before the redirected `migration.sql` would parse. Applied cleanly both as a single incremental migration and, later, as part of a full `DROP DATABASE`/recreate + `migrate deploy` (all 12 migrations, including 4.1's, apply in order).
- `npm run lint`'s `react-hooks/set-state-in-effect` flagged the first `instructor-rates-panel.tsx` draft, which fetched history via an outer `useCallback` referenced from inside `useEffect` (even without a `.then()` chain — the rule appears to key off the state-setting function being declared outside the effect body, not merely off promise chaining). Fixed by declaring the fetch-on-mount function INSIDE the effect (exactly the shape already used by `aircraft-manager.tsx`'s `RatesPanel`/`HourMeterAdjustmentPanel`) and adding a second, separately-declared `refetchHistory` used only from `onSubmit` (a plain event-handler `await`, never inside an effect).
- Full `npx playwright test` run (79 tests) showed 2 unrelated failures in `account-adjustments.spec.ts` (login timeout under full-suite parallel load) that did not reproduce when that spec file — or the full suite again on a freshly reset DB — was re-run in isolation; treated as a pre-existing flake (same category as 4.1's dirty-DB note), not a regression from this story.

### Completion Notes List

- **Shared date-only helpers extracted** (Task 2, per Dev Notes' preferred option): `parseDateOnlyUtc`, `todayDateOnlyUtc`, `toDateOnlyString` moved out of `rates.service.ts` into a new `src/lib/date-only.ts` (with `src/lib/date-only.test.ts`, 8 cases). `rates.service.ts` now imports all three from there and re-exports `todayDateOnlyUtc` (so `aircraft/page.tsx`'s existing import path keeps working unchanged); `instructor-rates.service.ts` imports the same two it needs (`parseDateOnlyUtc`, `toDateOnlyString`). `cash.service.ts`/`accounts.service.ts` were deliberately left untouched (their own private copies stay as-is) — out of scope per the Dev Notes, to avoid an unrelated sweep.
- **Model + migration** (Task 1): `InstructorRate` — identical shape to `AircraftRate`, keyed on `instructorProfileId` (FK to `InstructorProfile`, `onDelete: RESTRICT`) instead of `aircraftId`; `@@unique([instructorProfileId, validFrom])` + `@@index([instructorProfileId])`; back-relations `InstructorProfile.rates` / `User.instructorRates`. Hand-authored migration `20260707120000_add_instructor_rates` (see below for the `CREATE TABLE`) — verified applying cleanly both incrementally and via a full `DROP DATABASE`/recreate + `migrate deploy` (12 migrations in order) during the final gate run.
- **Service** (Task 2): `instructor-rates.service.ts` mirrors `rates.service.ts` function-for-function (`createInstructorRate`/`listInstructorRates`/`getEffectiveInstructorRate`), with a shared `resolveInstructorProfile(personId)` helper that throws `NotFoundError` for an unknown person and otherwise returns `person.instructorProfile` (`null` if never activated). `createInstructorRate` treats BOTH "no profile" and "deactivated profile" as the same `ConflictError('This person has no active instructor profile.')` (409) — the decision point flagged in the story, mirroring 4.1's archived-aircraft 409. `listInstructorRates`/`getEffectiveInstructorRate` treat only `null` (never activated) as "nothing to show" (`[]`/`null`) — a DEACTIVATED instructor's rates stay fully readable (Dev Notes: the person page shows them read-only), so those two functions never re-check `deactivatedAt`, only `createInstructorRate` does.
- **Permission split** (documented per the story's ask): `createInstructorRate` = `settings.manage` (unchanged from 4.1); `listInstructorRates`/`getEffectiveInstructorRate` = `people.read` — WIDER than 4.1's `aircraft.manage` read, because instructor data lives under the `people` domain (Dev Notes' explicit asymmetry between the twins).
- **API + OpenAPI** (Task 3): `GET`/`POST /api/v1/people/{id}/instructor-rates`, thin `apiRoute()` routes, person-scoped like `.../account/...`. Schemas placed in `src/lib/schemas/people.ts` (decision point: chose this over a new `instructor-rates.ts` file to mirror how 4.1 put `AircraftRate`'s schemas directly in `aircraft.ts` — the rate schemas live alongside their subject's other schemas). Registered `InstructorRate`/`InstructorRateList`/`CreateInstructorRateRequest` components and both paths in `registry.ts` (tag `['People']`; POST `errorResponses(401,403,404,409,422)`; GET `(401,403,404,422)`), and added the path to `registry.test.ts`'s coverage array.
- **UI** (Task 4): new `instructor-rates-panel.tsx` client component (twin of `aircraft-manager.tsx`'s `RatesPanel`, but embedded directly and permanently on the person page rather than opened from a per-row action, since there is no per-row list here — one instructor per page). Rendered in `people/[id]/page.tsx` only when `person.instructorProfile !== null`; the effective-today rate is computed server-side via `getEffectiveInstructorRate(actor, person.id, todayDateOnlyUtc())` and passed as a prop (never recomputed client-side). `canAddRate` = `hasPermission(actor, 'settings.manage') && person.instructorProfile.deactivatedAt === null` — a deactivated instructor's section stays visible but read-only (hides the form; the server-side `createInstructorRate` 409 remains the real guardian either way). `key={person.id}` on the panel. i18n keys added symmetrically under `PersonDetailPage.instructorRates.*` in both `messages/it.json`/`en.json`; the "open the add-rate form" button and the form's own submit button use deliberately DIFFERENT labels ("Nuova tariffa" vs "Aggiungi tariffa") to avoid two same-named buttons appearing in sequence during the same interaction.
- **Tests** (Task 5): `instructor-rates.service.test.ts` (23 cases) covers authorization for all three functions, `createInstructorRate`'s not-found/no-profile-conflict/deactivated-conflict/P2002-race paths, `listInstructorRates`'s empty-for-non-instructor + ordering/cap, `getEffectiveInstructorRate`'s not-found path plus the exact AD-4 boundary (D === validFrom included; D one day before falls back; `null` when nothing qualifies; `null` without a query for a non-instructor person), and `createInstructorRateSchema`'s 422 cases. `date-only.test.ts` (8 cases) covers `parseDateOnlyUtc`/`todayDateOnlyUtc`/`toDateOnlyString` including the UTC-midnight/leap-day/non-midnight-input edge cases. `e2e/instructor-rates.spec.ts` (4 tests): admin adds a past + a today rate on a person with an instructor profile (created via `POST /api/v1/people` + `PUT /api/v1/people/{id}/profiles/instructor`) and sees both in history with the correct current rate; a duplicate `validFrom` shows the 409 message; a STAFF-only actor gets 403 on POST; a pilot gets 403.
- Final gates: `npm run lint` — 1 known benign `data-table.tsx` warning, no new ones; `npm run typecheck` — clean; `npx vitest run` — 412/412 (>= 395 required); `npx next build` — succeeded, `/api/v1/people/[id]/instructor-rates` present in the route list; `npx playwright test` (clean DB reset, MailPit already running) — 79/79 (>= 78 required; one full-suite run hit 2 unrelated `account-adjustments.spec.ts` login-timeout flakes under parallel load that did not reproduce on re-run, see Debug Log).

### File List

- `prisma/schema.prisma` (modified — new `InstructorRate` model, `InstructorProfile.rates`/`User.instructorRates` back-relations)
- `prisma/migrations/20260707120000_add_instructor_rates/migration.sql` (new)
- `src/lib/date-only.ts` (new — `parseDateOnlyUtc`/`todayDateOnlyUtc`/`toDateOnlyString`, extracted out of `rates.service.ts`)
- `src/lib/date-only.test.ts` (new)
- `src/server/services/rates.service.ts` (modified — imports the extracted date-only helpers instead of defining them; re-exports `todayDateOnlyUtc`)
- `src/server/services/instructor-rates.service.ts` (new)
- `src/server/services/instructor-rates.service.test.ts` (new)
- `src/lib/schemas/people.ts` (modified — `createInstructorRateSchema`, `instructorRateItemSchema`, `instructorRateListResponseSchema`)
- `src/lib/schemas/registry.ts` (modified — registered instructor-rate components + both `/api/v1/people/{id}/instructor-rates` paths)
- `src/lib/schemas/registry.test.ts` (modified — added the new path to the coverage assertion)
- `src/app/api/v1/people/[id]/instructor-rates/route.ts` (new)
- `src/app/[locale]/dashboard/people/instructor-rates-panel.tsx` (new)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (modified — renders `InstructorRatesPanel` when the person has an instructor profile, computes the effective-today rate + `canManageSettings` server-side)
- `messages/it.json` (modified — `PersonDetailPage.instructorRates.*`)
- `messages/en.json` (modified — same keys, English)
- `e2e/instructor-rates.spec.ts` (new)

## Change Log

- 2026-07-07: Story file created (Opus 4.8 main session), ready-for-dev.
- 2026-07-07: Implemented (Sonnet 5 dev subagent) — historicized `InstructorRate` model/migration (twin of 4.1's `AircraftRate`), extracted shared `src/lib/date-only.ts` helpers, `instructor-rates.service.ts` (create/list/effective-rate, person-scoped instructor resolution), API + OpenAPI, person-page `InstructorRatesPanel`, unit + e2e tests. Status set to review.
