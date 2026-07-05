---
baseline_commit: 994af4f2fd869a1e04c49b77656c4452bab70f17
---

# Story 2.4: CRUD velivoli

Status: done

## Review Record

- **Reviewer**: claude-opus via BMAD code-review (adversarial, 2026-07-05)
- **Verdict**: APPROVE — no mandatory fixes. Verified: AD-2 respected end-to-end (Int everywhere, no float/parseFloat, H:MM is presentation-only); registration normalization (trim+uppercase) applied on create AND update with normalized pre-check + P2002 backstop, case collisions caught, self excluded on update; authorize('aircraft.manage') first line of all six service functions; AD-8 envelope on 401/403/404/409/422; additive migration with correct unique index; i18n symmetric; registry extended without regressions.
- Optional/nit findings applied by the orchestrator: **F1** `EditAircraftForm` now remounts via `key={aircraft.id}` — without it, switching edit target from aircraft A to B kept A's form values and PATCHed them onto B (real latent bug; same fix applied to `EditPersonForm` in people-manager as the reviewer recommended); **F2** `hourMeterMinutes` capped at Postgres INTEGER max in create/update schemas (absurd input now 422, not driver overflow → 500); **F3** notes input maps '' → null (`setValueAs`) so clearing a note works instead of silently failing `.min(1)` with no rendered error; **F4** dead `table.noValue` label removed (type, page mapping, both catalogs).
- **Post-fix gates**: lint ✔ (1 documented benign warning), typecheck ✔, test 205/205 ✔, build ✔, e2e 46/46 ✔ (after the usual dirty-DB reset — see 2.3 environment note).

## Story

As a staff,
I want gestire la flotta,
so that i velivoli siano pronti per tariffe, voli e prenotazioni (FR-7).

## Acceptance Criteria

1. **Given** il permesso staff, **When** creo un Velivolo con marche (es. I-ABCD), tipo, modello, contaore iniziale in minuti, note, **Then** le marche sono univoche (errore 409 su duplicato) e il velivolo appare nell'elenco.
2. **And** archiviazione non distruttiva come per le persone.

## Tasks / Subtasks

- [x] Task 1: Modello e migrazione (AC: 1, 2)
  - [x] `Aircraft`: `registration String @unique` (marche, es. I-ABCD — normalizzare a MAIUSCOLO trim lato Zod prima del confronto univocità), `type String` (es. "ultraleggero 3 assi"), `model String` (es. "Tecnam P92"), `hourMeterMinutes Int` (contaore in MINUTI interi — AD-2, MAI float/ore decimali), `notes String?`, `archivedAt DateTime?` (pattern 2.1), `createdAt`/`updatedAt`
  - [x] Lo stato operativo (`fuori servizio` + motivo) è la story 2.5: NON aggiungere campi status qui
  - [x] Migrazione col workaround sandbox: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → file a mano `prisma/migrations/<timestamp>_add_aircraft/migration.sql` → `npx prisma migrate deploy` → `npx prisma generate`
  - [x] Seed: un velivolo demo (es. `I-ABCD`, idempotente)
- [x] Task 2: Service + API (AC: tutte)
  - [x] `aircraft.service.ts` NUOVO (spine: `services/aircraft`), forma speculare a `people.service.ts`: `listAircraft` (paginato, ricerca `q` su registration/model case-insensitive, `includeArchived` default false), `getAircraft`, `createAircraft`, `updateAircraft`, `archiveAircraft`/`unarchiveAircraft` — TUTTO con `authorize(actor, 'aircraft.manage')` (permesso esistente da 1.3; non esiste un `aircraft.read`: i piloti vedranno la flotta con l'epic prenotazioni, non qui); registration duplicata → `ConflictError` (pre-check + backstop P2002 come in people); nessuna API di cancellazione fisica
  - [x] Route sottili con `apiRoute()`: `GET/POST /api/v1/aircraft`, `GET/PATCH /api/v1/aircraft/[id]`, `POST /api/v1/aircraft/[id]/archive` e `/unarchive` (path plurale-invariabile `aircraft`, coerente con le convenzioni spine)
  - [x] Schemi in `src/lib/schemas/aircraft.ts` (import `z` da `zod-with-openapi`!): `hourMeterMinutes` intero >= 0; component schemas + paths nel registry, assertion di copertura in `registry.test.ts` estesa
- [x] Task 3: UI (AC: 1, 2)
  - [x] `/{locale}/dashboard/aircraft`: server page + client manager sul modello ESATTO di people (2.1): `data-table.tsx` riusato (colonne: marche, tipo, modello, contaore formattato hh:mm, stato attiva/archiviata), ricerca server-side, paginazione, form crea/modifica (react-hook-form + zodResolver), archivia/ripristina con two-step confirm, filtro archiviati
  - [x] Contaore: input in minuti con visualizzazione hh:mm accanto (helper esistenti `src/lib/time.ts` — verificarli e riusarli, non duplicare)
  - [x] Nav: repuntare `aircraft` in `nav-items.ts` da `/aircraft` a `/dashboard/aircraft` (stesso pattern del repoint `people` in 2.1)
  - [x] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche (nuova sezione `AircraftPage`)
- [x] Task 4: Test (AC: tutte)
  - [x] Unit service: ricerca/filtro archiviati, conflitto registration (pre-check e race P2002), permessi (pilota → `ForbiddenError` su list/create/update/archive), archive/unarchive state guards
  - [x] e2e (`e2e/aircraft-management.spec.ts`): staff crea velivolo → in elenco; duplicato marche → messaggio errore (409); archivia → sparisce dal default, torna col filtro; pilota su `/dashboard/aircraft` → redirect e `GET /api/v1/aircraft` → 403 envelope

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

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` generated the `Aircraft` table DDL; written by hand to `prisma/migrations/20260705100000_add_aircraft/migration.sql`, applied with `npx prisma migrate deploy`, client regenerated with `npx prisma generate` (sandbox workaround, no `migrate dev`).
- `npx vitest run` → 205 passed (179 preexisting + 26 new: `aircraft.service.test.ts` unit tests + `registry.test.ts` coverage additions).
- `npx tsc --noEmit` → clean.
- `npm run lint` → 1 warning (the pre-existing, documented `data-table.tsx` React Compiler "incompatible library" warning) — no new warnings. Initially introduced two new instances of the same warning by reading the hour-meter value via react-hook-form's `watch()`; refactored to a local `useState` mirror updated from the input's own `onChange` instead (see comments in `aircraft-manager.tsx`), which avoids the warning entirely.
- `npm run build` → succeeds; `/dashboard/aircraft` and the four `/api/v1/aircraft*` routes appear in the route list.
- `npx playwright test` → 46 passed (40 preexisting + 6 new in `e2e/aircraft-management.spec.ts`). First full-suite run with `--workers=2` showed 2 flaky login timeouts on the two new aircraft tests scheduled concurrently with each other (both racing the ADMIN login within the same short window right after the dev server's first on-demand compile); re-run with `--workers=1` and then the full default-config suite both passed 100% — treated as the environment-note flakiness called out in the story's Dev Notes, not a defect in this story's code.

### Completion Notes List

- Implemented as a direct structural mirror of story 2.1 (people): `Aircraft` model (registration/type/model/hourMeterMinutes/notes/archivedAt), `aircraft.service.ts`, thin `apiRoute()` handlers, OpenAPI registry entries + `registry.test.ts` coverage, and a `/dashboard/aircraft` server page + `aircraft-manager.tsx` client manager built with `minimalist-ui` styling identical to `people-manager.tsx`.
- AD-2 (cardinal constraint): `hourMeterMinutes` is `Int` end-to-end — Prisma column, Zod schemas (`z.number().int().min(0)`), service, and wire format. The UI stores/submits only the integer; the `H:MM` string is a pure display derivation via the existing `formatMinutes`/`parseMinutes` helpers in `src/lib/time.ts` (no duplication), shown live next to the minutes input.
- `registration` is normalized (`trim().toUpperCase()`) in the Zod create/update schemas so uniqueness is case-insensitive in practice, with the same pre-check + P2002-backstop `ConflictError` pattern as `people.service.ts`'s `assertUnique`. No ICAO-format regex, per Dev Notes (foreign/ultralight registrations vary).
- No `aircraft.read` permission was added — every operation (including `listAircraft`/`getAircraft`) requires `aircraft.manage`, which already existed from story 1.3 (STAFF + ADMIN only). Confirmed via unit tests that a PILOT actor gets `ForbiddenError` on every service function, and via e2e that a pilot is redirected from `/dashboard/aircraft` and gets a 403 AD-8 envelope from `GET /api/v1/aircraft`.
- Archiving follows the story 2.1 pattern exactly: `archivedAt: DateTime?` timestamp (not boolean), no physical-delete endpoint, excluded from the default list, restorable via `unarchiveAircraft`, with `ConflictError` guards for "already archived"/"not archived".
- Deviation from a literal reading of the task list: `HourMeterHint`'s live preview is read via a local `useState` mirror kept in sync from the hour-meter `<input>`'s own `onChange` handler (composed with react-hook-form's registered `onChange`), rather than react-hook-form's `watch()`/`useWatch()`. Both of those are flagged by the project's React Compiler ESLint rule as "incompatible library" (same class of warning already accepted-and-documented for `data-table.tsx`'s `useReactTable()`), and the story's gate only allows that one pre-existing warning. The chosen approach keeps the submitted value fully owned by react-hook-form (AD-2's single source of truth for the integer) while keeping lint at exactly the expected 1 warning.
- Nav: `aircraft` repointed from the epic-1 placeholder `/aircraft` to `/dashboard/aircraft` in `nav-items.ts`, same as `people` was in story 2.1. `nav-items.test.ts` needed no changes (it doesn't assert on `href`).
- Seed: idempotent upsert of a demo aircraft `I-ABCD` (Tecnam P92 Eaglet, 12:30 on the hour meter) alongside the existing admin/pilot/profile seed data.

### File List

- `prisma/schema.prisma` — added the `Aircraft` model.
- `prisma/migrations/20260705100000_add_aircraft/migration.sql` — new migration (hand-written from `migrate diff --script` output).
- `prisma/seed.ts` — added `seedAircraft()` (idempotent demo aircraft `I-ABCD`).
- `src/lib/schemas/aircraft.ts` — new: create/update/list-query/list-item Zod schemas.
- `src/server/services/aircraft.service.ts` — new: `listAircraft`/`getAircraft`/`createAircraft`/`updateAircraft`/`archiveAircraft`/`unarchiveAircraft`.
- `src/server/services/aircraft.service.test.ts` — new: unit tests (RBAC, list/search/archived-filter, create/update conflict handling incl. P2002 race, archive/unarchive guards).
- `src/app/api/v1/aircraft/route.ts` — new: `GET`/`POST /api/v1/aircraft`.
- `src/app/api/v1/aircraft/[id]/route.ts` — new: `GET`/`PATCH /api/v1/aircraft/{id}`.
- `src/app/api/v1/aircraft/[id]/archive/route.ts` — new: `POST /api/v1/aircraft/{id}/archive`.
- `src/app/api/v1/aircraft/[id]/unarchive/route.ts` — new: `POST /api/v1/aircraft/{id}/unarchive`.
- `src/lib/schemas/registry.ts` — registered the Aircraft component schemas and the 5 `/api/v1/aircraft*` paths.
- `src/lib/schemas/registry.test.ts` — extended the path-coverage assertion with the new Aircraft paths.
- `src/app/[locale]/dashboard/aircraft/page.tsx` — new: server page (auth/permission gate, pagination, translations wiring).
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx` — new: client manager (table, search, archive filter, create/edit forms, archive/unarchive two-step confirm).
- `src/app/[locale]/dashboard/nav-items.ts` — repointed `aircraft`'s `href` to `/dashboard/aircraft`.
- `messages/it.json`, `messages/en.json` — new symmetric `AircraftPage` section.
- `e2e/aircraft-management.spec.ts` — new: e2e coverage (create+list, duplicate-registration conflict, archive/unarchive with filter, pilot redirect + 403, unauthenticated 401).

## Change Log

- 2026-07-05: Story 2.4 implemented — Aircraft fleet CRUD with archiving, mirroring the story 2.1 people pattern (model/migration, service+API, `/dashboard/aircraft` UI, unit+e2e tests). Status → review.
