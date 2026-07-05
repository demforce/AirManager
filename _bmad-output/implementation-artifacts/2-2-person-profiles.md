---
baseline_commit: 3aae25484a37d12d7a59d5a31579a42a44881966
---

# Story 2.2: Profili pilota, allievo, istruttore

Status: review

## Story

As a staff,
I want attivare più profili sulla stessa persona con i dati specifici,
so that una persona possa essere insieme pilota e istruttore, o passare da allievo a pilota senza perdere nulla (FR-5).

## Acceptance Criteria

1. **Given** una Persona esistente, **When** attivo il profilo Pilota (numero/tipo licenza) o Allievo (data inizio corso) o Istruttore (abilitazioni), **Then** i dati del profilo sono salvati in tabelle profilo separate 1-a-0/1 (AD-11) e la UI persone li mostra.
2. **Given** un Allievo che consegue la licenza, **When** disattivo il profilo Allievo e attivo il profilo Pilota, **Then** la persona mantiene lo stesso id, lo storico e (quando esisterà) lo stesso conto.
3. **Given** un `pilota` (senza `people.manage`), **When** chiama le API profili in scrittura, **Then** riceve 403 con envelope AD-8.

## Tasks / Subtasks

- [x] Task 1: Modelli e migrazione (AC: 1, 2)
  - [x] `PilotProfile` (`licenseNumber String`, `licenseType String`), `StudentProfile` (`courseStartDate DateTime @db.Date`), `InstructorProfile` (`ratings String`): ognuno con `personId String @unique` → relazione 1-a-0/1 su `Person` (AD-11), `deactivatedAt DateTime?`, `createdAt`/`updatedAt`
  - [x] **Disattivazione soft, mai delete fisico**: `deactivatedAt` timestamp (stesso razionale di `archivedAt` in 2.1) — `InstructorRate`, `Flight` e `TrainingNote` referenzieranno i profili negli epic 4/6/9, la riga deve sopravvivere alla disattivazione. Riattivare = azzerare `deactivatedAt` (+ aggiornare i dati). La transizione allievo→pilota (AC 2) è quindi: deactivate StudentProfile + upsert PilotProfile — `Person.id` non cambia mai.
  - [x] Migrazione: **`prisma migrate dev` NON funziona in questo sandbox** (rifiuta il non-interattivo) — usare `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, scrivere a mano `prisma/migrations/<timestamp>_add_person_profiles/migration.sql`, applicare con `npx prisma migrate deploy`, poi `npx prisma generate` (procedura collaudata in 2.1, vedi Dev Agent Record 2.1)
  - [x] Seed: dare alla Person di `pilot@airmanager.local` un `PilotProfile` attivo (idempotente come il resto di `prisma/seed.ts`)
- [x] Task 2: Service + API (AC: tutte)
  - [x] In `people.service.ts` (stesso dominio, non un service nuovo): `upsertProfile(actor, personId, type, data)` — crea o aggiorna+riattiva il profilo (`deactivatedAt: null`), `people.manage`; `deactivateProfile(actor, personId, type)` — `people.manage`, `ConflictError` se già disattivato o inesistente (pattern archive/unarchive 2.1); persona inesistente → `NotFoundError`
  - [x] `getPerson` e la risposta `GET /api/v1/people/[id]` includono i profili (`pilotProfile`/`studentProfile`/`instructorProfile`: oggetto con dati + `deactivatedAt`, oppure `null`); aggiungere i profili attivi anche alla list item (bastano i flag/badge, es. `profiles: { pilot: boolean, student: boolean, instructor: boolean }` calcolati da profili con `deactivatedAt: null`)
  - [x] Route sottili con `apiRoute()`: `PUT /api/v1/people/[id]/profiles/[type]` (upsert/attiva) e `POST /api/v1/people/[id]/profiles/[type]/deactivate`; `type ∈ {pilot, student, instructor}` validato con Zod (404 o 422 per tipo sconosciuto — scegliere e documentare); body per-tipo (discriminato dal path): pilota `{licenseNumber, licenseType}`, allievo `{courseStartDate}` (ISO date, wire format AD-8), istruttore `{ratings}`
  - [x] Schemi in `src/lib/schemas/people.ts` (import `z` da `zod-with-openapi`! regola ESLint attiva), component schemas + paths registrati in `registry.ts`, assertion di copertura in `registry.test.ts` estesa
- [x] Task 3: UI (AC: 1, 2)
  - [x] In `/{locale}/dashboard/people`: colonna/badge dei profili attivi in elenco (P/A/I); azione "Profili" per riga che apre un pannello con i tre profili — ognuno attivabile con i suoi campi, modificabile, disattivabile con conferma inline (pattern two-step confirm di 2.1); banale e pulito, skill `minimalist-ui`
  - [x] La scheda persona completa è la story 2.3 — NON costruirla qui; il pannello profili nella pagina elenco è sufficiente e la 2.3 lo riuserà
  - [x] Stringhe in `messages/{it,en}.json` simmetriche (sezione `PeoplePage` esistente)
- [x] Task 4: Test (AC: tutte)
  - [x] Unit service: upsert crea/aggiorna/riattiva; deactivate su profilo attivo/già disattivato/inesistente; transizione allievo→pilota conserva `Person.id`; pilota (senza `people.manage`) → `ForbiddenError` su upsert/deactivate; `people.read` basta per leggere i profili in `getPerson`
  - [x] e2e: staff attiva profilo Pilota su una persona → badge in elenco e dati nel pannello; transizione allievo→pilota (disattiva Allievo, attiva Pilota, stessa riga persona); pilota autenticato su `PUT .../profiles/pilot` → 403 envelope

## Dev Notes

- **Pattern consolidati da seguire** (non reinventare): `people.service.ts` 2.1 (authorize, P2002→Conflict, select esplicite, toListItem), `apiRoute()` (1.5), registry OpenAPI, `people-manager.tsx` per la UI (form react-hook-form + zodResolver, two-step confirm), `data-table.tsx` riusabile per l'elenco (già in uso).
- **Permessi esistenti**: `people.read` / `people.manage` (1.3) — bastano, NON aggiungere permessi nuovi.
- **AD-11 è il vincolo cardine**: profili 1-a-0/1 su `Person` (`personId @unique`); il futuro `Account` apparterrà a `Person`, non ai profili — niente in questa story deve legare dati economici o storici al profilo.
- **Ruoli utente ≠ profili persona**: `User.roles` (RBAC, chi può fare cosa) resta separato dai profili anagrafici (cosa una persona È in aviosuperficie). Attivare un profilo NON tocca `User.roles` — fuori scope qui qualunque sincronizzazione.
- `ratings` istruttore: campo testo libero singolo per l'MVP (es. "SEP(land), FI(A)"); l'eventuale strutturazione arriverà con l'epic scuola (9) se servirà.
- `courseStartDate`: solo data (no ora) — `@db.Date` in Prisma, stringa `YYYY-MM-DD` sul wire; attenzione alla timezone nel round-trip UI (presentare in Europe/Rome senza shift di giorno).
- Persone archiviate: l'upsert/deactivate profili su una persona archiviata è permesso (coerente con F3 della review 2.1: modificare un'archiviata è by-design).
- Nessuna dipendenza npm nuova prevista; se ne servisse una, versione verificata con `npm view` prima del pin (mai da memoria).
- Ambiente: `service postgresql start`; Mailpit `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 &` (serve agli e2e); Chromium preinstallato, MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto su data-table.tsx), typecheck, Vitest (162+ attesi), `next build`, e2e Playwright (31+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8, #AD-11, ERD]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-5]
- [Source: _bmad-output/implementation-artifacts/2-1-people-crud.md#Dev Agent Record] — pattern service/UI e workaround migrazioni
- [Source: docs/handoffs/HANDOFF.md] — stato ambiente e convenzioni

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- Ambiente: PostgreSQL riavviato con `service postgresql start` (era down a inizio sessione); Mailpit riavviato su 1025/8025 prima degli e2e. DB già migrato+seedato dalla 2.1.
- Migrazione con la procedura collaudata in 2.1 (`prisma migrate dev` continua a rifiutare il non-interattivo): `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → SQL scritto in `prisma/migrations/20260705093000_add_person_profiles/migration.sql` → `npx prisma migrate deploy` → `npx prisma generate`. Il diff genera solo le 3 tabelle nuove + 3 unique index su `personId` + 3 FK verso `Person` (RESTRICT on delete) — nessun impatto su tabelle esistenti né sui dati seed.
- Seed ri-eseguito e verificato idempotente (`npx tsx prisma/seed.ts` — upsert su `personId` unique, nessun duplicato).
- Primo `npm run lint` dopo la UI: 1 errore reale `react-hooks/set-state-in-effect` in `profiles-panel.tsx` (`setLoading(true)`/`setError(false)` sincroni nel body dell'effect di fetch) — risolto spostando ogni `setState` nel callback async e delegando il reset dello stato al remount (`key={personId}` sul componente nel parent); più 1 warning `no-unused-vars` su un alias di mock non usato nel test, rimosso. Lint finale: 0 errori, 1 warning benigno noto su `data-table.tsx` (React Compiler + TanStack Table, documentato in 2.1).
- `npx tsc --noEmit` — pulito dopo ogni task.
- `npx vitest run` — 175/175 (162 preesistenti + 13 nuovi in `people.service.test.ts`; l'assertion di copertura in `registry.test.ts` è stata estesa, non aggiunge test).
- `npm run build` — passa; le due route nuove (`/api/v1/people/[id]/profiles/[type]` e `.../deactivate`) presenti nella route table.
- `npx playwright test` — 36/36 (31 preesistenti + 5 nuovi in `e2e/person-profiles.spec.ts`). Nessun flake; lo stack trace `[WebServer]` nel log è il 403/404 atteso dei test negativi.

### Completion Notes List

- **Task 1 — modelli/migrazione/seed**: tre modelli profilo (`PilotProfile`, `StudentProfile`, `InstructorProfile`) 1-a-0/1 su `Person` via `personId @unique` (AD-11), tutti con `deactivatedAt DateTime?` (soft-deactivation, mai delete — stesso razionale di `archivedAt` 2.1) e `createdAt`/`updatedAt`. `courseStartDate` è `@db.Date` (solo data). Seed: `PilotProfile` attivo (`IT-PPL-100200`, `PPL(A)`) sulla Person di `pilot@airmanager.local`, upsert idempotente che riattiva anche un profilo lasciato disattivato da un test.
- **Task 2 — service/API**: `upsertProfile` (overload per-tipo, `people.manage`) usa `prisma.<profile>.upsert` keyed su `personId`: create per l'attivazione, update+`deactivatedAt: null` per modifica/riattivazione — la transizione allievo→pilota (AC 2) è `deactivateProfile('student')` + `upsertProfile('pilot')` e non tocca mai la riga `Person`. `deactivateProfile` lancia `ConflictError` sia per "mai attivato" sia per "già disattivato" (pattern archive/unarchive 2.1) e `NotFoundError` per persona inesistente. `getPerson` ora restituisce `PersonDetail` (list item + i tre profili in full; `courseStartDate` come stringa `YYYY-MM-DD` derivata dalle parti UTC del `DATE` Postgres — mai un datetime, niente shift di giorno); `listPeople` aggiunge `profiles: {pilot, student, instructor}` booleani calcolati da `deactivatedAt: null` con un select `{ deactivatedAt: true }` per relazione (niente over-fetch in lista).
- **Decisione documentata — tipo sconosciuto → 404**: `type` è un segmento URL, non un campo body; un tipo non riconosciuto significa che l'URL non indirizza alcuna risorsa/route ("no such route"), non che l'input di una route valida sia malformato — quindi `NotFoundError` (404), non 422. Documentato nel doc comment della route e coperto da un e2e.
- **Deviazione minima dal pattern route "sottile"** (motivata nel doc comment): il body di `PUT .../profiles/[type]` è discriminato dal path (tre shape diverse), quindi non può passare per l'unico slot `bodySchema` di `apiRoute()`; la route valida `type` con `profileTypeSchema` e poi il body con lo schema Zod del tipo giusto, lanciando `ValidationError` (→ 422 envelope AD-8 identico a quello di `bodySchema`). Tutto il resto resta nel pattern 1.5.
- **OpenAPI**: la route dinamica è documentata come 6 path letterali (`/profiles/pilot|student|instructor` + `/deactivate`), uno per tipo — request/response tipizzati per tipo leggono meglio nello spec di un unico path con `oneOf`. 8 component schemas nuovi registrati; assertion di copertura in `registry.test.ts` estesa ai 6 path.
- **Task 3 — UI** (skill `minimalist-ui`: bordi `#EAEAEA` 1px, bottoni `#111111`, badge pastello, radius 8/12px, nessuna shadow): colonna "Profili" nell'elenco con badge P/A/I (pastello blu `#E1F3FE`, solo profili attivi, `—` se nessuno); azione "Profili" per riga che apre `profiles-panel.tsx` sotto l'elenco — tre sezioni (Pilota/Allievo/Istruttore) ciascuna con badge di stato (Attivo/Disattivato/Non attivato), form inline react-hook-form+zodResolver per attiva/modifica/riattiva, e disattivazione con two-step confirm inline (pattern 2.1). Il pannello fetcha `GET /api/v1/people/{id}` al mount (`key={personId}` per remount pulito quando si cambia persona) e dopo ogni salvataggio rifetcha + `router.refresh()` per aggiornare i badge in lista. La scheda persona completa resta alla 2.3, che riuserà questo pannello.
- **Task 4 — test**: 13 unit nuovi in `people.service.test.ts` (Forbidden su upsert/deactivate per attore PILOT; upsert create/update+riattivazione per i tre tipi con assert sul payload `upsert`; round-trip `YYYY-MM-DD` dello studente; deactivate su attivo/mai attivato/già disattivato/persona mancante; flag `profiles` in lista; profili full in `getPerson` con solo `people.read`; transizione allievo→pilota senza alcuna scrittura su `Person`). 5 e2e nuovi in `e2e/person-profiles.spec.ts` (attivazione Pilota → dati nel pannello + badge P in lista; transizione allievo→pilota sulla stessa riga persona con dato allievo conservato; 403 envelope per pilota su PUT e su POST deactivate; 404 envelope per tipo profilo sconosciuto).

### File List

- `prisma/schema.prisma` — modified (modelli `PilotProfile`/`StudentProfile`/`InstructorProfile`, relazioni su `Person`)
- `prisma/migrations/20260705093000_add_person_profiles/migration.sql` — new (generata via `migrate diff --script`, applicata con `migrate deploy`)
- `prisma/seed.ts` — modified (`seedPilotProfile`: PilotProfile attivo idempotente per il demo pilot)
- `src/lib/schemas/people.ts` — modified (`profileTypeSchema`, request/response schema per i tre profili, `profileFlagsSchema`, `personDetailSchema`, `profiles` nel list item)
- `src/server/services/people.service.ts` — modified (`upsertProfile`, `deactivateProfile`, `getPerson` → `PersonDetail`, flag `profiles` in `toListItem`, select estesi)
- `src/server/services/people.service.test.ts` — modified (+13 test: profili, transizione, RBAC; fixture estese con le relazioni profilo)
- `src/app/api/v1/people/[id]/profiles/[type]/route.ts` — new (`PUT` upsert/attiva, validazione `type` → 404, body per-tipo → 422)
- `src/app/api/v1/people/[id]/profiles/[type]/deactivate/route.ts` — new (`POST`, `{ok:true}`)
- `src/lib/schemas/registry.ts` — modified (8 component schemas + 6 path profili registrati, `GET /people/{id}` ora documenta `PersonDetail`)
- `src/lib/schemas/registry.test.ts` — modified (assertion di copertura estesa con i 6 path profili)
- `src/app/[locale]/dashboard/people/profiles-panel.tsx` — new (pannello tre profili: attiva/modifica/riattiva/disattiva con confirm inline)
- `src/app/[locale]/dashboard/people/people-manager.tsx` — modified (colonna badge P/A/I, azione "Profili", rendering pannello con `key={personId}`)
- `src/app/[locale]/dashboard/people/page.tsx` — modified (flag `profiles` alle row, label `profilesPanel` dal namespace `PeoplePage`)
- `messages/it.json`, `messages/en.json` — modified (sezione `PeoplePage.profilesPanel` + `table.profiles`/`actions.profiles`, simmetriche IT/EN)
- `e2e/person-profiles.spec.ts` — new (5 e2e: attivazione pilota, transizione allievo→pilota, 403 su PUT/deactivate da pilota, 404 tipo sconosciuto)

## Change Log

- 2026-07-05 — Story 2.2 implementata (tre modelli profilo 1-a-0/1 su `Person` con soft-deactivation, `upsertProfile`/`deactivateProfile` in `people.service.ts`, route `PUT/POST /api/v1/people/[id]/profiles/[type](/deactivate)` documentate come 6 path OpenAPI, badge P/A/I + pannello profili in `/dashboard/people`, seed PilotProfile demo). 13 unit nuovi (175 totali) + 5 e2e nuovi (36 totali). Status → review.
