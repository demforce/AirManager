---
baseline_commit: 9fdfdf4
---

# Story 7.1: Creazione prenotazione con regole

Status: ready-for-dev

## Story

As a pilota,
I want prenotare un velivolo per un intervallo,
so that lo trovi disponibile quando arrivo in campo (FR-18).

## Acceptance Criteria

1. **Given** un velivolo operativo e un intervallo futuro libero, **When** un pilota prenota per sé, **Then** la prenotazione è creata; un istruttore può prenotare indicando un allievo; lo staff per chiunque; un allievo che tenta da solo riceve 403.
2. **Given** un intervallo sovrapposto a una prenotazione esistente sullo stesso velivolo, **When** provo a prenotare, **Then** 409 con messaggio chiaro; il controllo è transazionale (niente doppie prenotazioni con richieste concorrenti — test).
3. **Given** un velivolo fuori servizio, **When** provo a prenotare, **Then** 422 con motivo.

## Contesto e decisioni di design (vincolanti)

- **Il modello `Booking` rispecchia la forma di `Flight`** (ERD: `Aircraft ||--o{ Booking`, `Person ||--o{ Booking "prenotante"`): `personId` = la persona PER CUI il velivolo è prenotato (pilota, o allievo in prenotazione scuola); `instructorProfileId?` = istruttore indicato (prenotazione scuola), FK verso `InstructorProfile` come `Flight.instructorProfileId`. NIENTE campo status/cancellazione: la 7.3 (modifica/cancellazione + tracking) deciderà lì la propria forma — doc-comment esplicito sul modello.
- **Intervallo semi-aperto `[startsAt, endsAt)`**: due prenotazioni back-to-back (una finisce alle 11:00, l'altra inizia alle 11:00) NON sono sovrapposte. Overlap = `startsAt < other.endsAt AND endsAt > other.startsAt` sullo stesso velivolo.
- **Concorrenza (AC 2) = lock `FOR UPDATE` sulla riga `Aircraft`** dentro `prisma.$transaction`, ESATTAMENTE il pattern di `flights.service.ts#registerFlight` (righe ~766-788): il lock serializza tutte le create concorrenti sullo stesso velivolo, quindi pre-check overlap + insert nella stessa tx sono airtight. NIENTE exclusion constraint Postgres (btree_gist): scelta deliberata — il lock basta, la 7.3 riuserà la stessa disciplina per gli spostamenti; il reviewer proverà la race empiricamente (2 POST paralleli → un 201 + un 409).
- **RBAC — `bookings.manage.own` viene TOLTO a STUDENT** in `rbac.ts` (il catalogo è pensato per crescere/correggersi): FR-18 `[ASSUMPTION]` "le prenotazioni scuola le fa l'istruttore o lo staff" → l'allievo da solo riceve 403 direttamente da `authorize()`, il meccanismo più pulito. Un dual-role pilota+allievo mantiene il permesso via PILOT (unione, AC 2 di 1.3). Aggiornare il doc-comment di `ROLE_PERMISSIONS` (STUDENT = self-service SENZA gestione prenotazioni) e `rbac.test.ts`. La visibilità del CALENDARIO agli allievi (FR-19, tutti gli autenticati) arriva in 7.2, che ripunterà anche i permessi della voce nav.
- **Matrice di creazione** (dopo `authorize`, own-check nel service — pattern AD-5):
  - `bookings.manage.any` (staff/admin): `personId` = chiunque; `instructorProfileId` opzionale (qualunque istruttore attivo).
  - `bookings.manage.own` con `personId === actor.personId` (pilota o istruttore per sé): ok se la persona ha `PilotProfile` ATTIVO **o** `InstructorProfile` ATTIVO, altrimenti 403 ("piloti brevettati", ruolo senza profilo attivo non prenota); `instructorProfileId` deve essere assente → 422 (una prenotazione con istruttore per sé stessi la crea lo staff — fuori scope 7.1).
  - `bookings.manage.own` con `personId !== actor.personId` (istruttore che indica un allievo): l'actor DEVE avere un `InstructorProfile` ATTIVO, altrimenti **403 immediato PRIMA di ogni query sul target** (un pilota che tenta per altri non deve leakare l'esistenza della persona — pattern 403-prima-di-query di 5.4); `instructorProfileId` OBBLIGATORIO e === il profilo dell'actor → altrimenti 403; la persona target deve avere `StudentProfile` ATTIVO → altrimenti 422 `PERSON_NOT_BOOKABLE` (l'assegnazione allievo↔istruttore è di Epic 9: per ora qualunque allievo attivo, doc-comment).
- **Codici 422 stabili** (pattern `ValidationError(message, details?, code?)` di 5.1): `AIRCRAFT_OUT_OF_SERVICE` (con `details: { reason: statusReason }` — AC 3 "con motivo"), `BOOKING_IN_PAST` (`startsAt` non nel futuro rispetto al now server — FR-18 "intervallo data/ora futuro", uniforme per tutti staff incluso), `PERSON_NOT_BOOKABLE` (persona senza profilo volo attivo: per lo staff-path richiede almeno uno tra pilota/allievo/istruttore attivo).
- **Ordine verifiche senza state leak** (pattern 6.2): authorize 403 → own-rules 403 (prima di query sul target dove indicato sopra) → aircraft 404 → aircraft archiviato 409 → aircraft fuori servizio 422 → persona 404 → persona archiviata 409 → profilo non idoneo 422 `PERSON_NOT_BOOKABLE` → `startsAt` passato 422 `BOOKING_IN_PAST` → [tx: lock + overlap 409 → create].
- **Datetime PIENI, prima volta nel progetto**: `startsAt`/`endsAt` sono istanti (`DateTime` timestamptz, NON `@db.Date`). Wire format ISO 8601 UTC (AD-8): `z.iso.datetime()` sul body — primo request-body con datetime. Form UI: `<input type="datetime-local">` (primo nel progetto), conversione client `new Date(value).toISOString()` (il valore datetime-local è wall-time del browser); display via `formatDateTime`/`formatTimeOfDay` esistenti di `src/lib/time.ts` (Europe/Rome). MAI `date-only.ts` qui (quello è per `@db.Date`). Negli e2e non asserire su stringhe orario esatte dipendenti dal TZ del container: asserire su nomi/marche run-unique.
- **Lista prenotazioni visibile a ogni autenticato** (FR-19 anticipata al minimo): `listBookings` autorizza con `self.read` (ogni ruolo lo ha — documentare che vale "qualunque autenticato"); il DTO include nome prenotante e istruttore (assunzione PRD: nomi visibili a tutti gli autenticati) e `notes` (nessun requisito di privacy nel PRD; aeroclub trasparente — doc-comment).

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/2/3)
  - [ ] `model Booking` in `prisma/schema.prisma`: `id cuid`; `aircraftId` + FK `Aircraft` (RESTRICT default, back-relation `Aircraft.bookings Booking[]`); `personId` + FK `Person` (back-relation `Person.bookings Booking[]`); `instructorProfileId String?` + FK `InstructorProfile?` (back-relation `InstructorProfile.bookings Booking[]`); `startsAt DateTime`; `endsAt DateTime`; `notes String?`; `actorUserId` + FK `User` (chi ha creato — pattern `Flight.actorUserId`; back-relation `User.bookingsRecorded Booking[]`); `createdAt`/`updatedAt`; `@@index([aircraftId, startsAt])` (overlap scan + calendario 7.2); `@@index([personId])`; `@@index([instructorProfileId])`. Doc-comment: semantica prenotante (persona per cui si prenota), intervallo semi-aperto, niente stato — 7.3 aggiungerà modifica/cancellazione tracciata.
  - [ ] Migrazione `prisma/migrations/20260708120000_add_bookings/migration.sql` (diff a mano come sempre, banner rimosso) + `npx prisma migrate deploy` + `npx prisma generate` su DB fresco. Verificare in SQL le 3 FK e gli indici.
- [ ] Task 2: RBAC (AC 1)
  - [ ] `rbac.ts`: rimuovere `'bookings.manage.own'` da STUDENT; doc-comment aggiornato (FR-18: le prenotazioni scuola le fanno istruttore/staff; l'allievo resta self-service su dati/conto/scadenze); `rbac.test.ts` matrice aggiornata (STUDENT senza bookings.*, PILOT/INSTRUCTOR invariati).
- [ ] Task 3: Service `src/server/services/bookings.service.ts` (AC 1/2/3)
  - [ ] `createBooking(actor, { aircraftId, personId, instructorProfileId?, startsAt, endsAt, notes? })` con la matrice e l'ordine verifiche del Contesto. Fuori tx: risoluzione persona/istruttore (404/409/422); dentro `prisma.$transaction`: `SELECT "id", "status", "statusReason", "archivedAt" FROM "Aircraft" WHERE "id" = ${aircraftId} FOR UPDATE` (riga assente → 404; `archivedAt` → 409 `ConflictError('Aircraft is archived.')`; `OUT_OF_SERVICE` → 422 `AIRCRAFT_OUT_OF_SERVICE` con reason nei details E nel message) → pre-check overlap `tx.booking.findFirst({ where: { aircraftId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })` → 409 `ConflictError('This aircraft is already booked for an overlapping interval.')` → `tx.booking.create` con `actorUserId: actor.userId`. NOTA: i check aircraft DENTRO la tx sulla riga lockata (un solo fetch, niente TOCTOU); i check persona fuori tx vanno bene (non partecipano all'invariante di overlap).
  - [ ] `listBookings(actor, { from?, to?, aircraftId?, personId?, page?, pageSize? })` — `authorize(actor, 'self.read')` (= qualunque autenticato, doc-comment FR-19). Filtri: `from` → `endsAt > from`, `to` → `startsAt < to` (stessa semantica semi-aperta), id passthrough. Ordine `startsAt asc, id asc`. Paginazione `{ items, total, page, pageSize }` via `paginationOffset`/`paginate` + `prisma.$transaction([findMany, count])` (pattern `listFlights`). DTO `BookingListItem`: `id`, `aircraftId`, `aircraftRegistration`, `personId`, `personName` ("Nome Cognome"), `instructorProfileId`, `instructorName` (null se assente), `startsAt`, `endsAt`, `notes`, `createdAt`.
- [ ] Task 4: API + OpenAPI (AC 1/2/3)
  - [ ] `POST /api/v1/bookings` (201) e `GET /api/v1/bookings` in `src/app/api/v1/bookings/route.ts`, thin `apiRoute()` (generics `<TQuery, TBody>`).
  - [ ] Nuovo `src/lib/schemas/bookings.ts` (import da `./zod-with-openapi`, MAI da `'zod'` — lint lo blocca): `createBookingSchema` (`aircraftId`/`personId` cuid string, `instructorProfileId` optional, `startsAt`/`endsAt` `z.iso.datetime()`, refine `endsAt > startsAt` → messaggio chiaro, `notes` `.trim().max(500).optional()`), `listBookingsQuerySchema` (estende paginazione con `from?`/`to?` `z.iso.datetime()`, `aircraftId?`, `personId?`), `bookingItemSchema` mirror del DTO + `paginatedResponseSchema`. Registrare componenti + 2 path in `registry.ts` (tag `['Bookings']`; POST: errorResponses 401,403,404,409,422; GET: 401,403,422). `registry.test.ts` coverage.
- [ ] Task 5: UI (AC 1/2/3) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [ ] Nuova pagina `src/app/[locale]/dashboard/bookings/page.tsx` (server component): gate `bookings.manage.own` OR `bookings.manage.any` OR `self.read` con redirect `/dashboard` (di fatto ogni autenticato — la pagina serve anche la lista); sezione **"Prossime prenotazioni"** = tabella (velivolo, data, orario inizio–fine, prenotante, istruttore) da `listBookings({ from: now })` con paginazione query-param (pattern esistente, href che preservano lo stato); empty state.
  - [ ] Form **"Nuova prenotazione"** (client component `new-booking-form.tsx`, visibile solo con `bookings.manage.own`/`any`): select velivolo (il server passa i velivoli non archiviati; le voci `OUT_OF_SERVICE` visibili ma disabilitate con il motivo — il service ri-verifica comunque); per staff: select persona (persone attive con profilo pilota/allievo/istruttore attivo, passate dal server) + select istruttore opzionale; per istruttore: toggle "per me" / "per un allievo" con select allievi attivi (il proprio `instructorProfileId` lo fornisce il server component nelle props); per pilota puro: nessun picker, prenota per sé; 2 `<input type="datetime-local">` (start/end, `step=300`), submit → POST con conversione `toISOString()`; errori per-form: 409 overlap, 422 per codice (`AIRCRAFT_OUT_OF_SERVICE` col motivo dai details, `BOOKING_IN_PAST`, `PERSON_NOT_BOOKABLE`, refine end>start), successo `role="status"` + reset + refresh lista (`router.refresh()`).
  - [ ] Nav: `nav-items.ts` → `bookings` ripuntata a `/dashboard/bookings` (permessi invariati: `bookings.manage.own`/`any` — l'estensione a tutti arriva in 7.2 col calendario); `nav-items.test.ts`; verificare che `rbac.spec.ts`/altri e2e non asseriscano sulla voce bookings per allievi (aggiornare se sì).
  - [ ] i18n `messages/{it,en}.json` simmetrici: namespace `BookingsPage.*` (titoli, form, errori per codice, empty state); label nav già esistente.
- [ ] Task 6: Test (AC 1/2/3)
  - [ ] Unit `bookings.service.test.ts` (mock prisma, pattern `flights.service.test.ts` con `$transaction`/`$queryRaw` mockati): matrice permessi (student 403 da authorize; pilota per sé ok; pilota per altri → 403 SENZA query sul target — asserire che nessun fetch persona sia avvenuto; pilota con profilo disattivato → 403; istruttore per sé ok; istruttore per allievo attivo con proprio profilo ok; istruttore con `instructorProfileId` altrui → 403; istruttore per persona non-allievo → 422 `PERSON_NOT_BOOKABLE`; istruttore senza `instructorProfileId` nel body per allievo → 403; staff per chiunque ok; staff con istruttore indicato ok; actor senza `personId` in own-path → 403); ordine errori aircraft (404 / archiviato 409 / OOS 422 con reason in details); persona (404 / archiviata 409 / nessun profilo attivo 422); self-booking con `instructorProfileId` → 422; `startsAt` passato → 422 `BOOKING_IN_PAST`; overlap pre-check → 409 e il lock `$queryRaw` chiamato PRIMA del findFirst; create con `actorUserId` giusto; `listBookings`: filtri from/to semantica semi-aperta, ordine, paginazione, DTO con nomi composti. Schema: datetime malformati 422, `endsAt <= startsAt` 422, notes >500 422, body vuoto 422.
  - [ ] Unit `rbac.test.ts` (Task 2) + `nav-items.test.ts` (Task 5) + `registry.test.ts` (Task 4).
  - [ ] e2e `bookings.spec.ts` (dati run-unique, pattern `flights.spec.ts`): velivolo run-unique creato via API admin; pilota seed (`pilot@airmanager.local`) prenota da UI per un intervallo futuro → riga in "Prossime prenotazioni" con marche run-unique; secondo tentativo overlappante da UI → messaggio 409 nel form; **concorrenza (AC 2): due `page.request.post('/api/v1/bookings')` PARALLELI (Promise.all) stesso velivolo run-unique stesso intervallo → esattamente un 201 e un 409** (osservabili run-unique, MAI contatori globali — lezione F1 6.3); velivolo run-unique messo OUT_OF_SERVICE via API con motivo → tentativo prenotazione → 422 col motivo mostrato; allievo run-unique (utente creato via API users + set-password Mailpit, con persona+StudentProfile via API people) tenta `POST /api/v1/bookings` diretto → 403 envelope, e non vede la voce nav Prenotazioni; istruttore run-unique prenota indicando l'allievo → 201 e riga con entrambi i nomi; back-to-back (end = start dell'esistente) → 201 (semi-aperto).
- [ ] Task 7: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `7-1-booking-creation: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: NIENTE vista calendario (7.2), NIENTE modifica/cancellazione (7.3), NIENTE blocco scadenze/forzatura (7.4 — non toccare `expiries` qui). Solo creazione con regole + lista minima.
- **AD-1**: la UI muta via `POST /api/v1/bookings` (fetch dal client component); la lettura della pagina server-side chiama direttamente il service (pattern `expiries/page.tsx`). **AD-5**: `authorize()` prima di tutto; own-check via `actor.personId` nel service; la UI nasconde ma non protegge. **AD-8**: envelope errori standard, messaggi server English-only, datetime wire ISO UTC.
- **Lock**: import `Prisma` per eventuale `Prisma.join` non necessario qui (un solo velivolo); il template è `flights.service.ts:766` — commento nel codice che cita il pattern. Il lock DEVE essere la PRIMA cosa nella tx.
- **Riuso**: `apiRoute` handler; `paginationOffset`/`paginate`/`paginatedResponseSchema` (`src/lib/api/pagination.ts`); `formatDateTime`/`formatTimeOfDay` (`src/lib/time.ts`); pattern pagina+client components di `dashboard/expiries/`; `isUniqueViolation`-style helpers se servono (qui il backstop è il lock, non P2002); people/aircraft liste per i picker via services esistenti (`people.service`/`aircraft.service` — riusare le list functions esistenti, filtrare lato server component).
- **Lezioni review da rispettare**: 403-prima-di-query su own-path cross-person; 404→409→422 senza state leak; errori per-form mappati per codice (mai conflare 409 overlap con 422); `key={id}`; i18n simmetrica contata; `.max()` su stringhe; `role="status"`; overflow tabelle; niente enum raw in UI; niente `new Date(string)` su input non validati Zod.
- **e2e**: PRIMA del run di gate `curl localhost:3000` DEVE fallire (altrimenti `pkill -f "next dev"` — lezione server stale epic 6). Asserire SOLO osservabili run-unique (lezione F1 6.3). Classe flaky nota di epic 5 (flight specs form-refresh + people-management sotto carico, `flights.spec:210` riproduce anche solo): NON è regressione — giudicare su DB fresco, re-run in isolamento le spec estranee fallite; le spec di questa story devono essere stabili.
- **Il dev agent NON può resettare il DB** (guard AI-consent): il DB arriva GIÀ resettato+seedato dalla sessione principale; se il run e2e finale richiede un DB fresco che non hai, segnalarlo in `notesForReview` invece di forzare (la review girerà su DB fresco).
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "booking form datetime"` o simili); coerenza `minimalist-ui` (monocromi caldi, bento flat, palette chip esistenti); verifica interattiva Playwright MCP (pilota: crea + overlap 409; staff: crea per altri; istruttore: allievo; OOS 422 col motivo) PRIMA degli e2e automatici.
- **Ambiente**: Mailpit su `127.0.0.1:8025` (serve agli e2e per il set-password degli utenti creati via API); `SEED_ADMIN_PASSWORD` da `.env`; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`.
- **Gate**: lint 0 errori (warning benigno noto `data-table.tsx`), typecheck, `npx vitest run` (≥ 752 + nuovi), build, `npx playwright test` su DB fresco (≥ 107 + nuovi; classificare i fail con la procedura flaky).
- Un commit di implementazione (`Story 7.1: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-resume-gcly8l`, non detached) prima del commit.

### Project Structure Notes

- Nuovi file: `src/server/services/bookings.service.ts` (+test), `src/lib/schemas/bookings.ts`, `src/app/api/v1/bookings/route.ts`, `src/app/[locale]/dashboard/bookings/page.tsx` + `new-booking-form.tsx` (client components siblings), migrazione. Modifiche: `prisma/schema.prisma` (+ back-relations su Aircraft/Person/InstructorProfile/User), `rbac.ts`(+test), `nav-items.ts`(+test), `registry.ts`(+test), `messages/{it,en}.json`.
- Naming: service `bookings.service.ts` (plurale kebab, come da spine); route `/api/v1/bookings`; nav href `/dashboard/bookings`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#4.6 FR-18] — matrice ruoli e assumption allievo
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-1, #AD-5, #AD-8, ERD Booking]
- [Source: src/server/services/flights.service.ts#registerFlight ~766-788] — pattern tx + FOR UPDATE (template del lock)
- [Source: src/server/services/expiries.service.ts] — ordine 404/409/422, codici 422 stabili
- [Source: src/lib/api/handler.ts, src/lib/api/pagination.ts] — apiRoute, envelope, paginazione
- [Source: src/app/[locale]/dashboard/expiries/page.tsx] — pattern pagina server component + client components + DTO mapper
- [Source: src/lib/time.ts] — formatDateTime/APP_TIMEZONE (display Europe/Rome)
- [Source: prisma/schema.prisma#Flight] — forma personId/instructorProfileId/actorUserId da rispecchiare
- [Source: docs/handoffs/HANDOFF.md] — lezioni epic 6 (server stale, F1 run-unique, reset DB dev-agent)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-08: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
