# Story 2.4: CRUD velivoli

Status: ready-for-dev

## Story

As a staff,
I want gestire la flotta,
so that i velivoli siano pronti per tariffe, voli e prenotazioni (FR-7).

## Acceptance Criteria

1. **Given** il permesso staff, **When** creo un Velivolo con marche (es. I-ABCD), tipo, modello, contaore iniziale in minuti, note, **Then** le marche sono univoche (errore 409 su duplicato) e il velivolo appare nell'elenco.
2. **And** archiviazione non distruttiva come per le persone.

## Tasks / Subtasks

- [ ] Task 1: Modello e migrazione (AC: 1, 2)
  - [ ] `Aircraft`: `registration String @unique` (marche, es. I-ABCD — normalizzare a MAIUSCOLO trim lato Zod prima del confronto univocità), `type String` (es. "ultraleggero 3 assi"), `model String` (es. "Tecnam P92"), `hourMeterMinutes Int` (contaore in MINUTI interi — AD-2, MAI float/ore decimali), `notes String?`, `archivedAt DateTime?` (pattern 2.1), `createdAt`/`updatedAt`
  - [ ] Lo stato operativo (`fuori servizio` + motivo) è la story 2.5: NON aggiungere campi status qui
  - [ ] Migrazione col workaround sandbox: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → file a mano `prisma/migrations/<timestamp>_add_aircraft/migration.sql` → `npx prisma migrate deploy` → `npx prisma generate`
  - [ ] Seed: un velivolo demo (es. `I-ABCD`, idempotente)
- [ ] Task 2: Service + API (AC: tutte)
  - [ ] `aircraft.service.ts` NUOVO (spine: `services/aircraft`), forma speculare a `people.service.ts`: `listAircraft` (paginato, ricerca `q` su registration/model case-insensitive, `includeArchived` default false), `getAircraft`, `createAircraft`, `updateAircraft`, `archiveAircraft`/`unarchiveAircraft` — TUTTO con `authorize(actor, 'aircraft.manage')` (permesso esistente da 1.3; non esiste un `aircraft.read`: i piloti vedranno la flotta con l'epic prenotazioni, non qui); registration duplicata → `ConflictError` (pre-check + backstop P2002 come in people); nessuna API di cancellazione fisica
  - [ ] Route sottili con `apiRoute()`: `GET/POST /api/v1/aircraft`, `GET/PATCH /api/v1/aircraft/[id]`, `POST /api/v1/aircraft/[id]/archive` e `/unarchive` (path plurale-invariabile `aircraft`, coerente con le convenzioni spine)
  - [ ] Schemi in `src/lib/schemas/aircraft.ts` (import `z` da `zod-with-openapi`!): `hourMeterMinutes` intero >= 0; component schemas + paths nel registry, assertion di copertura in `registry.test.ts` estesa
- [ ] Task 3: UI (AC: 1, 2)
  - [ ] `/{locale}/dashboard/aircraft`: server page + client manager sul modello ESATTO di people (2.1): `data-table.tsx` riusato (colonne: marche, tipo, modello, contaore formattato hh:mm, stato attiva/archiviata), ricerca server-side, paginazione, form crea/modifica (react-hook-form + zodResolver), archivia/ripristina con two-step confirm, filtro archiviati
  - [ ] Contaore: input in minuti con visualizzazione hh:mm accanto (helper esistenti `src/lib/time.ts` — verificarli e riusarli, non duplicare)
  - [ ] Nav: repuntare `aircraft` in `nav-items.ts` da `/aircraft` a `/dashboard/aircraft` (stesso pattern del repoint `people` in 2.1)
  - [ ] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche (nuova sezione `AircraftPage`)
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit service: ricerca/filtro archiviati, conflitto registration (pre-check e race P2002), permessi (pilota → `ForbiddenError` su list/create/update/archive), archive/unarchive state guards
  - [ ] e2e (`e2e/aircraft-management.spec.ts`): staff crea velivolo → in elenco; duplicato marche → messaggio errore (409); archivia → sparisce dal default, torna col filtro; pilota su `/dashboard/aircraft` → redirect e `GET /api/v1/aircraft` → 403 envelope

## Dev Notes

- **Pattern consolidati**: copiare la forma di `people.service.ts` / `people/page.tsx` / `people-manager.tsx` / schemi+registry 2.1 — questa story è deliberatamente "un altro giro dello stesso ciclo" su un dominio nuovo; la novità è solo il dominio Aircraft.
- **AD-2 è il vincolo cardine**: contaore in MINUTI interi (`Int`). Niente ore decimali, niente float, mai. La formattazione hh:mm è solo presentazione (UI), il wire format resta minuti interi.
- **`aircraft.manage` esiste già** (1.3, staff+admin) — NON aggiungere permessi nuovi; la lettura piloti arriverà con l'epic 7 (prenotazioni).
- **Registration**: normalizzare (`trim().toUpperCase()`) nello schema Zod di create/update così l'unicità è case-insensitive di fatto; formato libero (niente regex ICAO rigida: le aviosuperfici ospitano marche estere e ultraleggeri con schemi diversi).
- Tariffe (AircraftRate) sono epic 4, stato operativo/rettifiche contaore sono story 2.5: qui SOLO anagrafica flotta + archiviazione.
- e2e: usa email/dati univoci per run (timestamp) come i test people; se un run completo su DB sporco dà flaky, resetta: drop/recreate DB + `migrate deploy` + `db seed` (vedi Review Record 2.3, environment note).
- Nessuna dipendenza npm nuova prevista; se servisse, `npm view` prima del pin.
- Ambiente: PostgreSQL su, Mailpit su 1025/8025; MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto su data-table.tsx), typecheck, Vitest (179+ attesi), `next build`, e2e Playwright (40+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-5, #AD-8, Consistency Conventions]
- [Source: _bmad-output/implementation-artifacts/2-1-people-crud.md] — il template di questa story (service/API/UI/test)
- [Source: _bmad-output/implementation-artifacts/2-3-person-detail.md#Review Record] — environment note su e2e/DB sporco

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
