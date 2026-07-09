---
baseline_commit: be3b6f5
---

# Story 7.3: Modifica e cancellazione

Status: ready-for-dev

## Story

As a pilota,
I want spostare o cancellare la mia prenotazione,
so that liberi il velivolo se i piani cambiano (FR-20).

## Acceptance Criteria

1. **Given** una mia prenotazione futura, **When** la modifico o cancello prima dell'orario di inizio, **Then** l'operazione riesce (con le stesse regole di conflitto); dopo l'inizio ricevo 422; lo staff può sempre modificare/cancellare qualunque prenotazione.
2. **And** ogni modifica/cancellazione è tracciata (chi, quando).

## Contesto e decisioni di design (vincolanti)

- **Cancellazione = SOFT, mai delete** (pattern `FlightStatus` di 5.3): `enum BookingStatus { ACTIVE CANCELLED }`, campi nuovi su `Booking`: `status BookingStatus @default(ACTIVE)`, `cancelledAt DateTime?`, `cancelledByUserId String?` + FK `User?` (relazione nominata — `User` ha già più back-relations; back-relation `User.bookingsCancelled`). Una prenotazione cancellata LIBERA lo slot: il predicato overlap di `createBooking` E delle nuove edit aggiunge `status: 'ACTIVE'`; `listBookings` e `listCalendarBookings` filtrano `status: 'ACTIVE'` (le cancellate spariscono da lista e calendario — la traccia resta in DB; nessuna UI "mostra cancellate" richiesta, non-goal).
- **Tracking modifica (AC 2) = `updatedByUserId String?` + FK `User?`** (relazione nominata, back-relation `User.bookingsUpdated`) aggiornato a ogni `updateBooking` insieme a `updatedAt` automatico; `actorUserId` resta IL CREATORE, invariato per sempre (doc-comment aggiornato). "Chi, quando" della cancellazione = `cancelledByUserId`/`cancelledAt`. NIENTE tabella audit separata (il PRD chiede chi/quando, non lo storico dei valori).
- **Ownership per modifica/cancellazione ("il prenotante")**: own = `booking.personId === actor.personId` **oppure** `booking.instructorProfileId === il profilo istruttore ATTIVO dell'actor` (l'istruttore gestisce le prenotazioni scuola che ha creato/che lo coinvolgono). L'allievo NON ha `bookings.manage.own` (deciso in 7.1): le sue prenotazioni scuola le gestiscono istruttore/staff. Un actor own-scope su una prenotazione NON sua → **403 PRIMA di rivelare qualunque dettaglio**… ma il 404-vs-403: la prenotazione va fetchata per decidere l'ownership → id inesistente = 404 per chiunque autorizzato a provarci (le prenotazioni sono già visibili a tutti gli autenticati per FR-19 — nessun oracle da proteggere qui, DIVERSO dal caso persone di 7.1; doc-comment).
- **Regole temporali (AC 1)**: own-path — la prenotazione deve essere FUTURA: `startsAt > now` server, altrimenti 422 `ValidationError` code **`BOOKING_ALREADY_STARTED`** (sia per edit sia per cancel); e il NUOVO intervallo di un edit deve rispettare `BOOKING_IN_PAST` come in 7.1. Staff/admin (`bookings.manage.any`) — NESSUN vincolo temporale: modifica/cancella anche una prenotazione già iniziata ("lo staff può sempre"), e un suo edit è esente dal check `BOOKING_IN_PAST` sul nuovo intervallo (può correggere una prenotazione in corso, es. accorciarla; doc-comment sull'asimmetria deliberata create-vs-edit per lo staff).
- **Campi modificabili**: `aircraftId`, `startsAt`, `endsAt`, `notes` (PATCH parziale, `notes` nullable esplicito per svuotare — pattern update 6.2/4.3, validazione sui valori RISULTANTI dal merge). `personId` e `instructorProfileId` NON modificabili (cambiare il prenotante = cancella + ricrea, come persona/tipo in 6.2) — campi estranei strippati da Zod.
- **Concorrenza edit (stesse regole di conflitto, transazionali)**: `updateBooking` in `prisma.$transaction` — lock `FOR UPDATE` su TUTTI i velivoli coinvolti in UNA query `WHERE id IN (...) ORDER BY id FOR UPDATE` (il velivolo di destinazione, e quello corrente se diverso — pattern multi-lock di `correctFlight`, anti-deadlock); poi **guard di stato dentro la tx**: ri-fetch della booking `WHERE id AND status='ACTIVE'` → count 0 = cancellata/spostata da una race → 409 (pattern `updateMany`-count-0 di 6.2); check aircraft (404/409 archived/422 OOS sulla riga lockata, come 7.1 — l'edit verso un velivolo OOS è 422 anche per staff); overlap pre-check con `id: { not: bookingId }` e `status: 'ACTIVE'` → 409; update con `updatedByUserId`. `cancelBooking`: niente lock velivolo (non tocca l'invariante overlap): guard atomico `updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'CANCELLED', cancelledAt: now, cancelledByUserId } })`, count 0 → 409 `ConflictError('This booking is already cancelled.')` (double-cancel race safe); i check own/temporali PRIMA, su un fetch semplice (il guard atomico copre la race residua).
- **API**: `PATCH /api/v1/bookings/{id}` (200, item aggiornato) e `POST /api/v1/bookings/{id}/cancel` (200, item cancellato — body vuoto, niente motivo: FR-20 chiede chi/quando, non il perché; mirror del path `flights/{id}/cancel`). Registry: PATCH 401,403,404,409,422; cancel 401,403,404,409,422.
- **UI — la lista "Prossime prenotazioni" è la superficie delle azioni** (il calendario resta read-only, non-goal dichiarato — niente drag): per ogni riga, azioni "Sposta"/"Cancella" visibili SOLO se l'actor può (staff sempre; own se personId/instructorProfileId match — il server component passa `canManageAny`, `ownPersonId`, `ownInstructorProfileId` e il client decide cosa RENDERIZZARE, il service resta il guardiano). "Sposta" = sub-form per riga condizionalmente montato (fresh defaultValues a ogni apertura — lezione 2.4 F1) con velivolo/inizio/fine/note prefillati (datetime-local dal valore UTC → wall-time browser); "Cancella" = conferma a due passi (pattern esistente); errori per codice (409 overlap, 422 `BOOKING_ALREADY_STARTED`/`BOOKING_IN_PAST`/`AIRCRAFT_OUT_OF_SERVICE` col motivo, 409 già-cancellata); successo `role="status"` + `router.refresh()`. La lista diventa (in parte) client-interattiva: mantenere il read server-side e passare i DTO serializzati (pattern `ExpiriesPanel`).
- **Debito 7.2 M1 (OBBLIGATORIO in questa story)**: aggiungere l'e2e del crosstalk href COMBINATO — ≥21 prenotazioni future run-unique per forzare la paginazione, carica `?view=week&date=<non-oggi>&page=2`, assert: ogni link del calendario (prev/oggi/next/toggle) porta `page=2` E ogni link di paginazione della lista porta `view=week&date=<...>`.

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/2)
  - [ ] `enum BookingStatus { ACTIVE CANCELLED }`; su `Booking`: `status BookingStatus @default(ACTIVE)`, `cancelledAt DateTime?`, `cancelledByUserId String?` + FK `User?` `@relation("BookingCancelledBy")`, `updatedByUserId String?` + FK `User?` `@relation("BookingUpdatedBy")`; back-relations su `User` (`bookingsCancelled`, `bookingsUpdated`); `@@index([status])` NON serve (le query filtrano sempre per aircraftId/startsAt già indicizzati + status — doc-comment se lo ometti); doc-comment del modello aggiornato (soft-cancel libera lo slot, actorUserId = creatore).
  - [ ] Migrazione `prisma/migrations/20260709090000_add_booking_cancellation/migration.sql` (diff a mano, banner rimosso) + `npx prisma migrate deploy` + `npx prisma generate`.
- [ ] Task 2: Service (AC 1/2)
  - [ ] `bookings.service.ts`: `BOOKING_SELECT`/`BookingListItem` estesi con `status`, `cancelledAt` (il DTO resta retro-compatibile — i consumer esistenti ignorano i campi nuovi); `createBooking` overlap pre-check + `listBookings` + `listCalendarBookings` filtrano `status: 'ACTIVE'` (doc-comment: le cancellate liberano lo slot e spariscono dalle viste).
  - [ ] `updateBooking(actor, bookingId, { aircraftId?, startsAt?, endsAt?, notes? })` — authorize any-first/own; fetch booking → 404; già cancellata → 409; own-rules: ownership (403) e `BOOKING_ALREADY_STARTED` (422) come da Contesto; merge parziale + validazioni risultanti (`endsAt > startsAt` 422; `BOOKING_IN_PAST` solo own-path); tx: multi-lock `ORDER BY id FOR UPDATE`, guard status ACTIVE (409), aircraft checks (404/409/422 OOS), overlap `id != bookingId AND status ACTIVE` (409), update con `updatedByUserId: actor.userId`. Ritorna il DTO aggiornato.
  - [ ] `cancelBooking(actor, bookingId)` — authorize any-first/own; fetch → 404; già cancellata → 409; own-rules 403/422 come sopra; guard atomico `updateMany` status ACTIVE→CANCELLED con `cancelledAt`/`cancelledByUserId`, count 0 → 409. Ritorna il DTO cancellato.
- [ ] Task 3: API + OpenAPI (AC 1/2)
  - [ ] `src/lib/schemas/bookings.ts`: `updateBookingSchema` (tutti opzionali, refine "almeno un campo", datetime come ISTANTI — lezione N1, `notes` `.trim().max(500).nullable().optional()`; `personId`/`instructorProfileId` ASSENTI dallo schema), item schema esteso (`status` enum, `cancelledAt` nullable). Route `src/app/api/v1/bookings/[id]/route.ts` (PATCH) e `src/app/api/v1/bookings/[id]/cancel/route.ts` (POST, senza body). Registry: 2 path nuovi + item aggiornato; `registry.test.ts`.
- [ ] Task 4: UI (AC 1/2) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [ ] Nuovo client component `booking-row-actions.tsx` (o estensione della lista estratta in un client component `bookings-list.tsx` — motivare la scelta): azioni per riga come da Contesto, sub-form "Sposta" (select velivolo dalle stesse `aircraftOptions` — servono anche ai non-creator ora: passarle SEMPRE dal server component, non solo con `canCreate`; datetime-local prefillati con conversione UTC→local; note), conferma a due passi su "Cancella", mapping errori per codice, `role="status"`, refresh. La riga cancellata sparisce al refresh (filtro ACTIVE server-side).
  - [ ] i18n `messages/{it,en}.json` simmetrici: `BookingsPage.list.actions.*` (sposta/cancella/conferme/errori incl. `BOOKING_ALREADY_STARTED` e già-cancellata).
- [ ] Task 5: Test (AC 1/2 + debito 7.2 M1)
  - [ ] Unit `bookings.service.test.ts`: matrice update/cancel (pilota own futura ok con `updatedByUserId` giusto; pilota su prenotazione altrui 403; pilota own già iniziata 422 `BOOKING_ALREADY_STARTED` per edit E cancel; istruttore own via `instructorProfileId` match ok; istruttore con profilo disattivato 403; staff su prenotazione altrui già iniziata OK anche nel passato (niente `BOOKING_IN_PAST` staff); student 403 da authorize; actor senza personId own-path 403); 404 id inesistente; 409 già cancellata (pre-check E guard count-0); edit: merge parziale (solo notes; solo startsAt con endsAt corrente), `endsAt <= startsAt` risultante 422, cambio velivolo → lock di ENTRAMBI in una query ordinata (assert sul SQL/args), overlap esclude sé stessa e le CANCELLED, aircraft OOS destinazione 422 anche staff; cancel: niente lock, updateMany con i campi giusti; create sopra slot di una CANCELLED → ok (mock); listBookings/listCalendarBookings filtrano ACTIVE; schema: body vuoto 422, personId strippato, notes null svuota.
  - [ ] e2e `bookings.spec.ts` esteso (run-unique, `gotoBookingsAndWaitForHydration` per le interazioni form — lezione 7.2): pilota sposta la propria prenotazione da UI (nuovo orario visibile in lista); la cancella (conferma 2 passi) → sparisce dalla lista E dal calendario, e ricreare lo stesso intervallo → 201 (slot liberato); overlap su edit → 409 nel form; prenotazione già iniziata: creata via API con `startsAt` = now+4s, attesa attiva finché è iniziata, PATCH e cancel own → 422 envelope `BOOKING_ALREADY_STARTED`, poi staff la cancella → 200 (AC "lo staff può sempre"); pilota tenta cancel della prenotazione di un altro via API → 403; **concorrenza: due PATCH paralleli che spostano due prenotazioni diverse sullo stesso slot run-unique → esattamente un 200 e un 409**; double-cancel parallelo → un 200 e un 409; **crosstalk href combinato (debito 7.2 M1)** come da Contesto.
- [ ] Task 6: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `7-3-booking-edit-cancel: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: NIENTE blocco scadenze/forzatura (7.4), NIENTE drag sul calendario, NIENTE vista "cancellate", NIENTE motivo di cancellazione. Il calendario cambia SOLO per il filtro ACTIVE (via service, zero modifiche UI calendario).
- **AD-1**: mutazioni via `PATCH /api/v1/bookings/{id}` e `POST .../cancel` dal client; read invariati server-side. **AD-5**: authorize + own-check nel service, la UI decide solo cosa renderizzare. **AD-8**: envelope, codici stabili, datetime UTC.
- **Riuso**: pattern lock multiplo `ORDER BY id FOR UPDATE` da `flights.service.ts#correctFlight` (~1052-1074); guard `updateMany`-count-0 da `expiries.service.ts#decideExpiryProposal`; PATCH parziale merge-validation da 6.2 `updateExpiry`; route nested `[id]/cancel` da `flights/[id]/cancel`; sub-form per riga da `ExpiriesPanel`; conferma 2 passi esistente; `gotoBookingsAndWaitForHydration` esistente in `bookings.spec.ts`.
- **ATTENZIONE ai test 7.1/7.2 esistenti**: l'aggiunta del filtro ACTIVE e dei campi DTO NON deve romperli — i mock unit esistenti che ritornano row senza `status` vanno aggiornati insieme al `BOOKING_SELECT` (dichiarare nel Debug Log quali test sono stati toccati e perché; il contratto osservabile per l'utente non cambia).
- **Lezioni review da rispettare**: N1 7.1 (istanti, mai stringhe); F1/F2 7.2 (già in codice — non regredire il sanitize/clamp toccando page.tsx); crosstalk 6.4 M1 (ora con assert automatica — debito da saldare); F1 6.3 (osservabili run-unique); fresh defaultValues sub-form (2.4 F1); 404→409→422 senza state leak; i18n simmetrica contata.
- **Il test "già iniziata" e2e usa attesa reale (~5s)**: startsAt = now+4s via API (è futuro alla creazione), poi poll finché `Date.now() > startsAt`, poi PATCH/cancel → 422. Tenerlo in UN solo test per non gonfiare la durata della suite.
- **Il dev agent NON può resettare il DB** (arriva fresco dalla sessione principale); PRIMA del run e2e di gate: `curl localhost:3000` DEVE fallire (altrimenti `fuser -k 3000/tcp`). Classe flaky nota epic 5 + volume: procedura invariata (DB fresco, isolamento, criterio deterministico-assente-alla-baseline).
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query es. `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "table row actions inline edit"`); coerenza `minimalist-ui`; verifica interattiva Playwright MCP (sposta, cancella, errori, staff-su-altrui) PRIMA degli e2e.
- **Ambiente**: Mailpit :8025/:1025; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`.
- **Gate**: lint 0 errori (warning benigno noto), typecheck, `npx vitest run` (≥ 848 + nuovi), build, `npx playwright test` (≥ 116 + nuovi).
- Un commit di implementazione (`Story 7.3: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-resume-gcly8l`) prima del commit.

### Project Structure Notes

- Nuovi file: `src/app/api/v1/bookings/[id]/route.ts`, `src/app/api/v1/bookings/[id]/cancel/route.ts`, `src/app/[locale]/dashboard/bookings/booking-row-actions.tsx` (o `bookings-list.tsx`), migrazione. Modifiche: `prisma/schema.prisma`, `bookings.service.ts`(+test), `schemas/bookings.ts`, `registry.ts`(+test), `page.tsx` bookings, `messages/{it,en}.json`, `e2e/bookings.spec.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#4.6 FR-20]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-1, #AD-5, #AD-8]
- [Source: _bmad-output/implementation-artifacts/7-1-booking-creation.md, 7-2-booking-calendar.md] — matrice creazione, lock discipline, Review Records (N1/F1/F2, M1 debito)
- [Source: prisma/schema.prisma#FlightStatus, Flight.cancelledAt] — pattern soft-cancel 5.3
- [Source: src/server/services/flights.service.ts#correctFlight ~1052-1074] — multi-lock ORDER BY id FOR UPDATE
- [Source: src/server/services/expiries.service.ts#decideExpiryProposal, #updateExpiry] — guard updateMany-count-0, PATCH merge-validation
- [Source: src/app/api/v1/flights/[id]/cancel/route.ts] — shape route cancel
- [Source: src/app/[locale]/dashboard/people/expiries-panel.tsx] — sub-form per riga + conferma 2 passi

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
