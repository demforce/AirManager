---
baseline_commit: 4d3f32152188cdffb6916b57e5a2f28bad4aab0a
---

# Story 2.5: Stato operativo e rettifica contaore

Status: done

## Review Record

- **Reviewer**: claude-opus via BMAD code-review (adversarial, 2026-07-05)
- **Verdict**: CHANGES REQUIRED → resolved. Verified as solid: hourMeterMinutes removed from every generic-update path (schema strips it AND service ignores it, dedicated test); append-only respected (no update/delete, FK RESTRICT); atomic updateMany guards on both status transitions with statusReason cleared on return; actorUserId from actor.userId with FK; actorEmail visible to staff/admin only (no PII leak); AD-2/AD-7/AD-8 honored; no 2.4 regressions.
- **F1 (mandatory, applied)**: under READ COMMITTED two concurrent adjustments could both read the same hour meter value and record a stale audit "before" (the final value was still correct — the damage was confined to the history's integrity). Fixed for real, not just in the comment: the transaction now takes a `SELECT ... FOR UPDATE` row lock via `tx.$queryRaw` (Prisma has no select-for-update), serializing concurrent adjustments; unit tests updated to mock the locked read; e2e exercises the raw query against real Postgres.
- **F3 (optional, applied)**: `reason` capped at 500 chars in both schemas (defense-in-depth, symmetric with the 2.4 F2 integer cap).
- **F2 (optional, deferred)**: adjustment history shows the latest 50 with no "load more" — acceptable at realistic volumes; revisit if a real fleet accumulates more.
- **F4 (nit, confirmed intended)**: adjusting the hour meter of an out-of-service or archived aircraft is legitimate (post-maintenance corrections, historical fixes).
- **F5 (nit, no action)**: return-to-service 409 shows the generic error — consistent with the existing archive/unarchive pattern.
- **Post-fix gates**: lint ✔ (1 documented benign warning), typecheck ✔, test 224/224 ✔, build ✔, e2e 49/49 ✔ (fresh DB).

## Story

As a staff,
I want mettere un velivolo fuori servizio e correggere il contaore,
so that la flotta rifletta la realtà operativa (FR-8, FR-9).

## Acceptance Criteria

1. **Given** un velivolo operativo, **When** lo marco `fuori servizio` con motivo, **Then** lo stato e il motivo sono visibili in elenco; il flag è pronto per bloccare le prenotazioni (Epic 7).
2. **Given** un contaore errato, **When** registro una rettifica con motivo obbligatorio, **Then** il contaore cambia e la rettifica resta tracciata (chi, quando, delta, motivo).

## Tasks / Subtasks

- [x] Task 1: Modelli e migrazione (AC: 1, 2)
  - [x] `Aircraft`: aggiungere `status AircraftStatus @default(OPERATIONAL)` (enum Prisma `OPERATIONAL | OUT_OF_SERVICE`, SCREAMING_SNAKE per convenzione) e `statusReason String?` (motivo, valorizzato solo quando OUT_OF_SERVICE, azzerato al rientro in servizio)
  - [x] NUOVO `HourMeterAdjustment`: `id`, `aircraftId` FK (con `@@index`), `actorUserId String` (chi — l'id User dell'attore; FK su User), `previousMinutes Int`, `newMinutes Int` (il delta è derivabile ma salvare entrambi rende lo storico leggibile senza ricalcoli), `reason String` (obbligatorio), `createdAt` — append-only: NESSUN update/delete API (stesso spirito di AD-3)
  - [x] Migrazione col workaround sandbox (migrate diff --script → file a mano → migrate deploy → generate)
- [x] Task 2: Service + API (AC: tutte)
  - [x] `aircraft.service.ts`: `setOutOfService(actor, id, reason)` (reason obbligatorio non vuoto; `ConflictError` se già fuori servizio), `returnToService(actor, id)` (`ConflictError` se già operativo; azzera `statusReason`) — pattern archive/unarchive 2.1/2.4, con guardia atomica `updateMany` sul valore di `status` (vedi review 2.2 F1); `adjustHourMeter(actor, id, { newMinutes, reason })` — in **una transazione**: crea `HourMeterAdjustment` (previous = valore corrente, actorUserId = actor.userId) e aggiorna `Aircraft.hourMeterMinutes = newMinutes`; `newMinutes` intero 0..INT_MAX (delta negativo ammesso: correggere si può in entrambe le direzioni); `listHourMeterAdjustments(actor, id)` paginato, più recente prima. TUTTO con `authorize(actor, 'aircraft.manage')`
  - [x] **Rimuovere `hourMeterMinutes` da `updateAircraftSchema`/`updateAircraft`** (e dal form di modifica): dopo questa story il contaore cambia SOLO via rettifica tracciata, altrimenti l'audit trail è bypassabile dal PATCH generico. Il valore iniziale resta nel create (2.4). Aggiornare i test 2.4 interessati
  - [x] Route con `apiRoute()`: `POST /api/v1/aircraft/[id]/out-of-service` `{reason}`, `POST /api/v1/aircraft/[id]/return-to-service`, `POST /api/v1/aircraft/[id]/hour-meter-adjustments` `{newMinutes, reason}`, `GET /api/v1/aircraft/[id]/hour-meter-adjustments` (paginato). Schemi in `src/lib/schemas/aircraft.ts` (import `z` da `zod-with-openapi`!), component schemas + paths nel registry, coverage assertion estesa; `status`/`statusReason` aggiunti a `aircraftListItemSchema`
- [x] Task 3: UI (AC: 1, 2)
  - [x] Elenco `/{locale}/dashboard/aircraft`: badge di stato (Operativo verde / Fuori servizio ambra col motivo in tooltip o riga espansa); azioni per riga: "Fuori servizio" (form inline/pannello con motivo obbligatorio + conferma), "Rientro in servizio" (two-step confirm), "Rettifica contaore" (pannello con: contaore attuale H:MM, input nuovo valore in minuti con hint H:MM come in 2.4, motivo obbligatorio, anteprima delta; sotto, lo storico rettifiche: quando, chi, prima → dopo, delta, motivo)
  - [x] Il badge/motivo deve arrivare da `listAircraft` (già nella list item), senza fetch aggiuntive per riga
  - [x] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche (estendere `AircraftPage`)
- [x] Task 4: Test (AC: tutte)
  - [x] Unit service: out-of-service con/senza motivo, già fuori servizio → Conflict, rientro azzera reason, guardie atomiche; adjustHourMeter: transazione (adjustment creato + aircraft aggiornato insieme), previous/new corretti, reason obbligatoria, actorUserId salvato, pilota → `ForbiddenError` su tutte; list adjustments ordinato desc
  - [x] e2e (`e2e/aircraft-status-hours.spec.ts`): staff mette fuori servizio con motivo → badge+motivo in elenco; rientro in servizio → badge torna operativo; rettifica contaore → valore aggiornato in elenco e riga di storico con delta e motivo; pilota su `POST .../out-of-service` → 403 envelope

## Dev Notes

- **Pattern consolidati**: guardia atomica `updateMany` per le transizioni di stato (review 2.2 F1); `$transaction` Prisma per adjustment+update (prima transazione multi-statement del progetto — tenerla nel service, mai nelle route); form con `key` di remount quando cambia il target (review 2.4 F1); '' → null via `setValueAs` per campi opzionali (review 2.4 F3); cap INT max sui minuti (review 2.4 F2).
- **AD-2**: `newMinutes`/`previousMinutes` MINUTI interi; H:MM solo presentazione (`formatMinutes`).
- **AD-3 (spirito)**: `HourMeterAdjustment` è append-only. Qui non serve lo storno (non è un ledger monetario): una rettifica sbagliata si corregge con un'altra rettifica.
- **`actorUserId`**: prendere `actor.userId` (sempre presente nell'`Actor`); FK verso `User`. Non usare personId (uno staff può non avere Person collegata).
- **Fuori servizio NON è archiviazione**: un velivolo fuori servizio resta in elenco default (è flotta attiva, solo non prenotabile); archiviato = uscito dalla flotta. Non mescolare i due stati.
- Il blocco prenotazioni reale è Epic 7: qui SOLO il flag + visibilità. Non aggiungere logica di booking.
- e2e flaky su DB sporco → reset (drop/recreate + migrate deploy + seed), vedi 2.3/2.4.
- Nessuna dipendenza npm nuova prevista.
- Ambiente: PostgreSQL su, Mailpit su 1025/8025; MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto), typecheck, Vitest (205+ attesi), `next build`, e2e Playwright (46+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-8, #FR-9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-5, #AD-8]
- [Source: _bmad-output/implementation-artifacts/2-4-aircraft-crud.md] — dominio Aircraft, pattern e Review Record (F1-F4 da rispettare qui)

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` generated the `AircraftStatus` enum + `Aircraft.status`/`statusReason` columns + `HourMeterAdjustment` table DDL; written by hand to `prisma/migrations/20260705150000_add_aircraft_status_hour_meter_adjustment/migration.sql`, applied with `npx prisma migrate deploy`, client regenerated with `npx prisma generate` (sandbox workaround, no `migrate dev`).
- `npx tsc --noEmit` → clean.
- `npx vitest run` → 224 passed (205 preexisting + 19 new: `aircraft.service.test.ts` gains authorization/setOutOfService/returnToService/adjustHourMeter/listHourMeterAdjustments coverage and a replacement test for the removed `hourMeterMinutes` PATCH path; `time.test.ts` gains 3 tests for the new `formatDateTime` helper).
- `npm run lint` → 1 warning (the same pre-existing, documented `data-table.tsx` React Compiler "incompatible library" warning as story 2.4) — no new warnings.
- `npm run build` → succeeds; the three new `/api/v1/aircraft/[id]/{out-of-service,return-to-service,hour-meter-adjustments}` routes appear in the route list.
- `npx playwright test` → 49 passed (46 preexisting + 3 new in `e2e/aircraft-status-hours.spec.ts`), single run, no flakiness observed this time (DB was freshly reset+seeded going in).

### Completion Notes List

- **Task 1 (model/migration)**: `AircraftStatus` enum (`OPERATIONAL | OUT_OF_SERVICE`) plus `Aircraft.status`/`statusReason`; new append-only `HourMeterAdjustment` (`aircraftId` FK + `@@index`, `actorUserId` FK to `User`, `previousMinutes`/`newMinutes`/`reason`/`createdAt`) with a back-relation array on both `Aircraft` and `User` (required by Prisma for a declared relation, same pattern as `User.authTokens`). No update/delete API exists for `HourMeterAdjustment` anywhere in the service or routes.
- **Task 2 (service/API)**: `setOutOfService`/`returnToService` both use the atomic `updateMany({ where: { id, status: <expected> }, ... })` guard from review 2.2 F1 (existence pre-checked via `findUnique` for a clean 404, then the guarded write; `count === 0` → `ConflictError`, distinguishing "already in that state" from a genuine 404). `adjustHourMeter` is the project's first multi-statement `prisma.$transaction(async (tx) => ...)`: reads the current `hourMeterMinutes` and creates the `HourMeterAdjustment` (with `previousMinutes` = that read) and updates `Aircraft.hourMeterMinutes` inside the same transaction, so the two writes can never be observed out of sync. A negative delta is allowed (no monotonicity constraint) per Dev Notes. `hourMeterMinutes` was removed from `updateAircraftSchema`/`updateAircraft` entirely (not just made optional-but-ignored) — a stale client sending it now has the field silently dropped by Zod rather than rejected, which is the correct "extra fields ignored" REST convention; a unit test simulates this via a type-cast call and asserts the field never reaches Prisma. Routes are thin `apiRoute()` wrappers; schemas/paths registered in `registry.ts` (`SetOutOfServiceRequest`, `CreateHourMeterAdjustmentRequest`, `HourMeterAdjustmentList`), coverage assertion in `registry.test.ts` extended with the three new paths.
- **Deviation/value-add**: `HourMeterAdjustmentListItem`/`hourMeterAdjustmentListItemSchema` include an `actorEmail` field, joined from the existing `HourMeterAdjustment.actorUser` relation (`select: { actorUser: { select: { email: true } } }`) in addition to the stored `actorUserId`. The story's schema for the model only specifies `actorUserId` (FK to `User`), but Task 3's UI explicitly needs a human-readable "chi" column in the history — a raw cuid is not usable there. This is a display-only enrichment (no schema/model change beyond the already-declared relation) and does not affect the append-only audit guarantee.
- **Task 3 (UI)**: added a second status badge column (`operationalStatus`, green "Operativo"/amber "Fuori servizio") distinct from the existing archive badge column — archiving and operational status are explicitly independent per Dev Notes, so they get separate columns rather than being conflated. The reason is surfaced via the badge's `title` attribute (tooltip), per the Dev Notes' "tooltip o riga espansa" option. Row actions gained "Fuori servizio" (opens a dedicated panel — `OutOfServiceForm` — with a mandatory reason field, since this needs input beyond a yes/no confirm), "Rientro in servizio" (reuses the existing two-step confirm mechanism, generalized `handleArchiveToggle` → `handleStateAction` to also cover this third transition), and "Rettifica contaore" (opens `HourMeterAdjustmentPanel`: current value, new-value input with the same H:MM-hint pattern as 2.4's create form, a live signed delta preview via a new `formatSignedMinutes` helper, mandatory reason, and — below the form — the adjustment history fetched once per panel-open via `GET .../hour-meter-adjustments`). Removing `hourMeterMinutes` from the update path required splitting the previously-shared `AircraftFields` component: it now only renders registration/type/model/notes (used by both create and edit), while the hour-meter input is inlined directly in `CreateAircraftForm` only — `EditAircraftForm` no longer renders or submits it at all.
- **Panel-closes-on-success**: like the existing create/edit forms, `OutOfServiceForm` and `HourMeterAdjustmentPanel` close on success (`handleFormSuccess`) rather than staying open to show the freshly-updated state in place. This keeps the interaction model consistent across all of this page's panels; the adjustment history is fetched fresh every time the "Rettifica contaore" panel is (re)opened, so re-opening it after a submission shows the up-to-date history (verified in the e2e test).
- Added `formatDateTime` to `src/lib/time.ts` (day/month/year + hour:minute, Europe/Rome) for the history's "quando" column — no prior full-timestamp display helper existed in the codebase (only the time-of-day `formatTimeOfDay`).
- Confirmed the atomic-guard pattern matches `deactivateProfile` (review 2.2 F1) exactly: existence pre-check (`NotFoundError`) then a guarded `updateMany` keyed on the expected prior state (`ConflictError` on `count === 0`), rather than the plain check-then-`update()` race still present in `archiveAircraft`/`unarchiveAircraft` (those were left as-is — out of this story's scope — since the Dev Notes only called out the atomic pattern for the two new status transitions).

### File List

- `prisma/schema.prisma` — added the `AircraftStatus` enum, `Aircraft.status`/`statusReason` fields, and the new `HourMeterAdjustment` model (plus back-relation arrays on `Aircraft` and `User`).
- `prisma/migrations/20260705150000_add_aircraft_status_hour_meter_adjustment/migration.sql` — new migration (hand-written from `migrate diff --script` output).
- `src/lib/schemas/aircraft.ts` — removed `hourMeterMinutes` from `updateAircraftSchema`; added `setOutOfServiceSchema`, `createHourMeterAdjustmentSchema`, `listHourMeterAdjustmentsQuerySchema`, `hourMeterAdjustmentListItemSchema`/`hourMeterAdjustmentListResponseSchema`, `aircraftStatusSchema`; added `status`/`statusReason` to `aircraftListItemSchema`.
- `src/server/services/aircraft.service.ts` — added `status`/`statusReason` to `AircraftListItem`/`AIRCRAFT_SELECT`; removed `hourMeterMinutes` from `updateAircraft`'s patch; added `setOutOfService`, `returnToService`, `adjustHourMeter`, `listHourMeterAdjustments`, and the `HourMeterAdjustmentListItem` type/mapper.
- `src/server/services/aircraft.service.test.ts` — extended mocks (`updateMany`, `findUniqueOrThrow`, `hourMeterAdjustment.{create,findMany,count}`); replaced the `hourMeterMinutes`-PATCH test with a `model`-based one plus a test asserting the field is never forwarded; added authorization + behavior tests for all four new service functions.
- `src/app/api/v1/aircraft/[id]/out-of-service/route.ts` — new: `POST /api/v1/aircraft/{id}/out-of-service`.
- `src/app/api/v1/aircraft/[id]/return-to-service/route.ts` — new: `POST /api/v1/aircraft/{id}/return-to-service`.
- `src/app/api/v1/aircraft/[id]/hour-meter-adjustments/route.ts` — new: `GET`/`POST /api/v1/aircraft/{id}/hour-meter-adjustments`.
- `src/lib/schemas/registry.ts` — registered the three new component schemas and paths.
- `src/lib/schemas/registry.test.ts` — extended the path-coverage assertion with the three new paths.
- `src/lib/time.ts` — added `formatDateTime` (full timestamp, Europe/Rome, display-only).
- `src/lib/time.test.ts` — added `formatDateTime` tests.
- `src/app/[locale]/dashboard/aircraft/aircraft-manager.tsx` — added the operational-status badge column; split `AircraftFields` (drop `hourMeterMinutes`) and inlined the hour-meter input in `CreateAircraftForm` only; generalized `handleArchiveToggle` → `handleStateAction`; added `OutOfServiceForm` and `HourMeterAdjustmentPanel` components, `formatSignedMinutes`/`operationalStatusLabel`/`operationalStatusBadgeClasses` helpers.
- `src/app/[locale]/dashboard/aircraft/page.tsx` — pass `status`/`statusReason` through to `AircraftManager`; wired the new label groups (`operationalStatus`, `statusForm`, `hourMeterPanel`, extended `actions`/`feedback`).
- `messages/it.json`, `messages/en.json` — extended `AircraftPage` with the new symmetric label groups (confirmed 78/78 keys match).
- `e2e/aircraft-status-hours.spec.ts` — new: out-of-service (with reason) → return-to-service; hour-meter adjustment updates the list and is visible in the reopened history; pilot 403 on `POST .../out-of-service`.

## Change Log

- 2026-07-05: Story 2.5 implemented — Aircraft operational status (out-of-service/return-to-service with a mandatory, tracked reason) and audited hour-meter adjustments via a single Prisma transaction; `hourMeterMinutes` removed from the generic update path. Status → review.
