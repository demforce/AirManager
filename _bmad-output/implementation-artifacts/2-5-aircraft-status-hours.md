# Story 2.5: Stato operativo e rettifica contaore

Status: ready-for-dev

## Story

As a staff,
I want mettere un velivolo fuori servizio e correggere il contaore,
so that la flotta rifletta la realtà operativa (FR-8, FR-9).

## Acceptance Criteria

1. **Given** un velivolo operativo, **When** lo marco `fuori servizio` con motivo, **Then** lo stato e il motivo sono visibili in elenco; il flag è pronto per bloccare le prenotazioni (Epic 7).
2. **Given** un contaore errato, **When** registro una rettifica con motivo obbligatorio, **Then** il contaore cambia e la rettifica resta tracciata (chi, quando, delta, motivo).

## Tasks / Subtasks

- [ ] Task 1: Modelli e migrazione (AC: 1, 2)
  - [ ] `Aircraft`: aggiungere `status AircraftStatus @default(OPERATIONAL)` (enum Prisma `OPERATIONAL | OUT_OF_SERVICE`, SCREAMING_SNAKE per convenzione) e `statusReason String?` (motivo, valorizzato solo quando OUT_OF_SERVICE, azzerato al rientro in servizio)
  - [ ] NUOVO `HourMeterAdjustment`: `id`, `aircraftId` FK (con `@@index`), `actorUserId String` (chi — l'id User dell'attore; FK su User), `previousMinutes Int`, `newMinutes Int` (il delta è derivabile ma salvare entrambi rende lo storico leggibile senza ricalcoli), `reason String` (obbligatorio), `createdAt` — append-only: NESSUN update/delete API (stesso spirito di AD-3)
  - [ ] Migrazione col workaround sandbox (migrate diff --script → file a mano → migrate deploy → generate)
- [ ] Task 2: Service + API (AC: tutte)
  - [ ] `aircraft.service.ts`: `setOutOfService(actor, id, reason)` (reason obbligatorio non vuoto; `ConflictError` se già fuori servizio), `returnToService(actor, id)` (`ConflictError` se già operativo; azzera `statusReason`) — pattern archive/unarchive 2.1/2.4, con guardia atomica `updateMany` sul valore di `status` (vedi review 2.2 F1); `adjustHourMeter(actor, id, { newMinutes, reason })` — in **una transazione**: crea `HourMeterAdjustment` (previous = valore corrente, actorUserId = actor.userId) e aggiorna `Aircraft.hourMeterMinutes = newMinutes`; `newMinutes` intero 0..INT_MAX (delta negativo ammesso: correggere si può in entrambe le direzioni); `listHourMeterAdjustments(actor, id)` paginato, più recente prima. TUTTO con `authorize(actor, 'aircraft.manage')`
  - [ ] **Rimuovere `hourMeterMinutes` da `updateAircraftSchema`/`updateAircraft`** (e dal form di modifica): dopo questa story il contaore cambia SOLO via rettifica tracciata, altrimenti l'audit trail è bypassabile dal PATCH generico. Il valore iniziale resta nel create (2.4). Aggiornare i test 2.4 interessati
  - [ ] Route con `apiRoute()`: `POST /api/v1/aircraft/[id]/out-of-service` `{reason}`, `POST /api/v1/aircraft/[id]/return-to-service`, `POST /api/v1/aircraft/[id]/hour-meter-adjustments` `{newMinutes, reason}`, `GET /api/v1/aircraft/[id]/hour-meter-adjustments` (paginato). Schemi in `src/lib/schemas/aircraft.ts` (import `z` da `zod-with-openapi`!), component schemas + paths nel registry, coverage assertion estesa; `status`/`statusReason` aggiunti a `aircraftListItemSchema`
- [ ] Task 3: UI (AC: 1, 2)
  - [ ] Elenco `/{locale}/dashboard/aircraft`: badge di stato (Operativo verde / Fuori servizio ambra col motivo in tooltip o riga espansa); azioni per riga: "Fuori servizio" (form inline/pannello con motivo obbligatorio + conferma), "Rientro in servizio" (two-step confirm), "Rettifica contaore" (pannello con: contaore attuale H:MM, input nuovo valore in minuti con hint H:MM come in 2.4, motivo obbligatorio, anteprima delta; sotto, lo storico rettifiche: quando, chi, prima → dopo, delta, motivo)
  - [ ] Il badge/motivo deve arrivare da `listAircraft` (già nella list item), senza fetch aggiuntive per riga
  - [ ] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche (estendere `AircraftPage`)
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit service: out-of-service con/senza motivo, già fuori servizio → Conflict, rientro azzera reason, guardie atomiche; adjustHourMeter: transazione (adjustment creato + aircraft aggiornato insieme), previous/new corretti, reason obbligatoria, actorUserId salvato, pilota → `ForbiddenError` su tutte; list adjustments ordinato desc
  - [ ] e2e (`e2e/aircraft-status-hours.spec.ts`): staff mette fuori servizio con motivo → badge+motivo in elenco; rientro in servizio → badge torna operativo; rettifica contaore → valore aggiornato in elenco e riga di storico con delta e motivo; pilota su `POST .../out-of-service` → 403 envelope

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

### Debug Log References

### Completion Notes List

### File List

## Change Log
