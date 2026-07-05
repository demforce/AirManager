# Story 2.2: Profili pilota, allievo, istruttore

Status: ready-for-dev

## Story

As a staff,
I want attivare più profili sulla stessa persona con i dati specifici,
so that una persona possa essere insieme pilota e istruttore, o passare da allievo a pilota senza perdere nulla (FR-5).

## Acceptance Criteria

1. **Given** una Persona esistente, **When** attivo il profilo Pilota (numero/tipo licenza) o Allievo (data inizio corso) o Istruttore (abilitazioni), **Then** i dati del profilo sono salvati in tabelle profilo separate 1-a-0/1 (AD-11) e la UI persone li mostra.
2. **Given** un Allievo che consegue la licenza, **When** disattivo il profilo Allievo e attivo il profilo Pilota, **Then** la persona mantiene lo stesso id, lo storico e (quando esisterà) lo stesso conto.
3. **Given** un `pilota` (senza `people.manage`), **When** chiama le API profili in scrittura, **Then** riceve 403 con envelope AD-8.

## Tasks / Subtasks

- [ ] Task 1: Modelli e migrazione (AC: 1, 2)
  - [ ] `PilotProfile` (`licenseNumber String`, `licenseType String`), `StudentProfile` (`courseStartDate DateTime @db.Date`), `InstructorProfile` (`ratings String`): ognuno con `personId String @unique` → relazione 1-a-0/1 su `Person` (AD-11), `deactivatedAt DateTime?`, `createdAt`/`updatedAt`
  - [ ] **Disattivazione soft, mai delete fisico**: `deactivatedAt` timestamp (stesso razionale di `archivedAt` in 2.1) — `InstructorRate`, `Flight` e `TrainingNote` referenzieranno i profili negli epic 4/6/9, la riga deve sopravvivere alla disattivazione. Riattivare = azzerare `deactivatedAt` (+ aggiornare i dati). La transizione allievo→pilota (AC 2) è quindi: deactivate StudentProfile + upsert PilotProfile — `Person.id` non cambia mai.
  - [ ] Migrazione: **`prisma migrate dev` NON funziona in questo sandbox** (rifiuta il non-interattivo) — usare `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, scrivere a mano `prisma/migrations/<timestamp>_add_person_profiles/migration.sql`, applicare con `npx prisma migrate deploy`, poi `npx prisma generate` (procedura collaudata in 2.1, vedi Dev Agent Record 2.1)
  - [ ] Seed: dare alla Person di `pilot@airmanager.local` un `PilotProfile` attivo (idempotente come il resto di `prisma/seed.ts`)
- [ ] Task 2: Service + API (AC: tutte)
  - [ ] In `people.service.ts` (stesso dominio, non un service nuovo): `upsertProfile(actor, personId, type, data)` — crea o aggiorna+riattiva il profilo (`deactivatedAt: null`), `people.manage`; `deactivateProfile(actor, personId, type)` — `people.manage`, `ConflictError` se già disattivato o inesistente (pattern archive/unarchive 2.1); persona inesistente → `NotFoundError`
  - [ ] `getPerson` e la risposta `GET /api/v1/people/[id]` includono i profili (`pilotProfile`/`studentProfile`/`instructorProfile`: oggetto con dati + `deactivatedAt`, oppure `null`); aggiungere i profili attivi anche alla list item (bastano i flag/badge, es. `profiles: { pilot: boolean, student: boolean, instructor: boolean }` calcolati da profili con `deactivatedAt: null`)
  - [ ] Route sottili con `apiRoute()`: `PUT /api/v1/people/[id]/profiles/[type]` (upsert/attiva) e `POST /api/v1/people/[id]/profiles/[type]/deactivate`; `type ∈ {pilot, student, instructor}` validato con Zod (404 o 422 per tipo sconosciuto — scegliere e documentare); body per-tipo (discriminato dal path): pilota `{licenseNumber, licenseType}`, allievo `{courseStartDate}` (ISO date, wire format AD-8), istruttore `{ratings}`
  - [ ] Schemi in `src/lib/schemas/people.ts` (import `z` da `zod-with-openapi`! regola ESLint attiva), component schemas + paths registrati in `registry.ts`, assertion di copertura in `registry.test.ts` estesa
- [ ] Task 3: UI (AC: 1, 2)
  - [ ] In `/{locale}/dashboard/people`: colonna/badge dei profili attivi in elenco (P/A/I); azione "Profili" per riga che apre un pannello con i tre profili — ognuno attivabile con i suoi campi, modificabile, disattivabile con conferma inline (pattern two-step confirm di 2.1); banale e pulito, skill `minimalist-ui`
  - [ ] La scheda persona completa è la story 2.3 — NON costruirla qui; il pannello profili nella pagina elenco è sufficiente e la 2.3 lo riuserà
  - [ ] Stringhe in `messages/{it,en}.json` simmetriche (sezione `PeoplePage` esistente)
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit service: upsert crea/aggiorna/riattiva; deactivate su profilo attivo/già disattivato/inesistente; transizione allievo→pilota conserva `Person.id`; pilota (senza `people.manage`) → `ForbiddenError` su upsert/deactivate; `people.read` basta per leggere i profili in `getPerson`
  - [ ] e2e: staff attiva profilo Pilota su una persona → badge in elenco e dati nel pannello; transizione allievo→pilota (disattiva Allievo, attiva Pilota, stessa riga persona); pilota autenticato su `PUT .../profiles/pilot` → 403 envelope

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

### Debug Log References

### Completion Notes List

### File List

## Change Log
