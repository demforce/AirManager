---
baseline_commit: 6ab21fd
---

# Story 5.4: Registro voli con filtri e permessi

Status: ready-for-dev

## Story

As a pilota,
I want vedere i miei voli (e lo staff tutti),
so that ognuno abbia il proprio storico (FR-17).

## Acceptance Criteria

1. **Given** voli di persone diverse, **When** un pilota (o allievo) apre il registro, **Then** vede SOLO i propri voli (quelli in cui è la persona del volo), paginati (NFR-6), inclusi gli ANNULLATI (storia completa).
2. **And** un istruttore vede i propri voli come persona E i voli (scuola o no) in cui figura come istruttore.
3. **Given** lo staff, **When** apre il registro, **Then** vede TUTTI i voli con filtri per **periodo** (`dateFrom`/`dateTo` su `flightDate`), **velivolo**, **persona**, **tipo**, **stato** — combinabili, paginati.
4. **Given** un non-staff che passa `personId` di un ALTRO nel filtro, **When** chiama `GET /api/v1/flights`, **Then** 403 (mai dati altrui, nemmeno via filtro).

## Contesto e decisioni chiave (LEGGERE PRIMA DI CODIFICARE)

- **`listFlights` si apre all'own-access (AD-5)**: oggi (5.1) è `authorize('flights.manage')`. Diventa: chi ha `flights.manage` → tutti i voli + tutti i filtri; altrimenti `authorize('self.read')` e lo scope è FORZATO a `OR: [{ personId: actor.personId }, { instructorProfile: { personId: actor.personId } }]` (proprietario O istruttore a bordo — AC 2; la seconda gamba copre da sola anche gli istruttori che volano come persona del volo sulla prima). `actor.personId == null` con solo `self.read` → **pagina vuota** (nulla è "proprio"; scelta documentata — non un 403: il registro esiste, è semplicemente vuoto per un utente senza anagrafica collegata).
- **Filtro `personId` per non-staff**: se fornito e `!== actor.personId` → `ForbiddenError` (AC 4 — mai enumerare/filtrare dati altrui); se `=== actor.personId` è lecito (ridondante ma innocuo). Gli altri filtri (periodo/tipo/stato/velivolo) sono leciti per tutti DENTRO il proprio scope.
- **Filtri (query string, tutti opzionali e combinabili in AND)**: `dateFrom`/`dateTo` (`z.iso.date()`, su `flightDate` con `gte`/`lte` date-only via `parseDateOnlyUtc` — MAI timestamp); `aircraftId` (string); `personId` (string); `flightType` (enum); `status` (enum). Zod refine: `dateFrom <= dateTo` altrimenti 422 (VALIDATION_ERROR standard, niente codice custom qui). Id inesistenti nei filtri → semplicemente 0 risultati (nessun 404: è un filtro, non un lookup).
- **`actorEmail` diventa CONDIZIONALE** (`people.read`, stesso pattern `AccountStatementItem` 3.2): il DTO 5.1 lo includeva sempre perché la lista era staff-only; ora un pilota non deve vedere chi ha registrato il volo. Nessun altro campo del DTO cambia (l'istruttore vede legittimamente nome della persona del volo in cui insegna).
- **Ordine invariato**: `flightDate desc, createdAt desc, id desc` (5.1). Paginazione invariata (`paginate`/`paginationOffset`).
- **Nav**: `nav-items.ts` — l'item `flights` diventa visibile anche a pilota/allievo/istruttore: `permissions: ['flights.manage', 'self.read']` (union OR già supportata). ATTENZIONE: aggiornare i test che asseriscono la visibilità della nav per ruolo (`nav-items.test.ts` e le eventuali asserzioni e2e in `rbac.spec.ts`/`login.spec.ts` sul menu del pilota) — la comparsa di "Voli" per tutti è VOLUTA (FR-17).
- **Pagina `/dashboard/flights` a due volti**: per lo staff resta identica (form registrazione + azioni annulla/correggi) e GUADAGNA la barra filtri; per i non-staff mostra SOLO il registro personale paginato (niente form, niente azioni — il service è comunque il guardiano, la UI si limita a non mostrare ciò che fallirebbe) con filtri limitati a periodo/tipo/stato. I dropdown velivolo/persona della barra filtri si alimentano da `listAircraft`/`listPeople` che richiedono permessi staff — per questo i non-staff non li hanno (scelta documentata: niente endpoint nuovi per alimentare picker non-staff in questa story).
- **Stati visibili a tutti nel proprio scope**: gli ANNULLATI restano visibili anche al titolare (con badge esistente) — lo storico è storia, il filtro `status` serve proprio a escluderli a richiesta.
- **Niente export** (`?format=xlsx` è epic 10); niente route nuove: si estendono `GET /api/v1/flights` (query schema) e la pagina esistente.

## Tasks / Subtasks

- [ ] Task 1: Service (AC 1/2/3/4)
  - [ ] `flights.service.ts#listFlights(actor, query)`: nuovo ramo permessi come da Contesto (manage → tutto; self.read → scope forzato OR own/instructor, personId null → pagina vuota); costruzione `where` AND-combinata dai filtri; guardia 403 sul filtro `personId` altrui per non-staff; `actorEmail` condizionale su `people.read` (il DTO/tipo diventa `actorEmail?`). Aggiornare doc-comment (la promessa 5.1 "5.4 estenderà" si realizza).
  - [ ] `src/lib/schemas/flights.ts`: `listFlightsQuerySchema` esteso con i 6 filtri opzionali + refine date; registry aggiornato (parametri query documentati in OpenAPI) + coverage.
- [ ] Task 2: UI (AC 1/2/3) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE**, stile minimalista editoriale
  - [ ] `/dashboard/flights/page.tsx`: rendere la pagina accessibile ai non-staff (oggi presumibilmente redirect/gate staff — verificare) caricando i dati scope-aware; passare al client component i flag (`canManage` da `flights.manage`, `canPickEntities` per i dropdown).
  - [ ] `flights-manager.tsx` (o componente estratto se più pulito): barra filtri sobria sopra il registro — periodo (due date input), tipo (select), stato (select), e SOLO per staff velivolo (select da `listAircraft` incl. archiviati per consultare lo storico — decidere e documentare) e persona (select da `listPeople`); reset filtri; i filtri aggiornano la query e riportano a pagina 1; paginazione visibile (pattern `data-table`/liste esistenti). Non-staff: niente form registrazione, niente azioni annulla/correggi, titolo/descrizione adeguati ("I miei voli").
  - [ ] Nav `flights` → `['flights.manage', 'self.read']`; aggiornare `nav-items.test.ts` e ogni asserzione e2e sulla nav del pilota.
  - [ ] i18n simmetrici it/en (chiavi filtri, stato vuoto, titolo own-view).
- [ ] Task 3: Test (AC tutti)
  - [ ] Unit (`flights.service.test.ts`): pilota vede solo i propri (where con OR own/instructor — query-shape assertion); istruttore: OR include la gamba instructorProfile; staff: where dai filtri combinati (periodo gte/lte date-only, aircraftId, personId, flightType, status); non-staff + `personId` altrui → Forbidden; non-staff + proprio `personId` → ok; `personId` null + self.read → pagina vuota senza query; `actorEmail` presente per staff, assente per pilota; refine dateFrom>dateTo → errore Zod (422). Schema: enum invalidi → 422.
  - [ ] e2e (`e2e/flight-log.spec.ts`): staff registra voli per DUE persone diverse (una è il pilota seed) su velivoli/tipi diversi; login pilota → nav "Voli" ora visibile, registro mostra SOLO i suoi (anche l'annullato se creato), niente form/azioni; filtro periodo/tipo/stato dal pilota funziona; staff: filtri per persona e velivolo restringono, combinazione periodo+tipo, paginazione (>1 pagina con pageSize piccolo via query param se supportato o creando abbastanza voli run-unique); pilota chiama `GET /api/v1/flights?personId=<altro>` → 403 envelope. Aggiornare asserzioni nav esistenti se rompono.
  - [ ] Regressione: suite 5.1/5.2/5.3 verdi (l'unico contratto cambiato è l'apertura own-access + actorEmail condizionale).

## Dev Notes

- **AD-5**: authorize prima di tutto; scope own-access FORZATO nel service (mai fidarsi della UI); 403 sul filtro altrui PRIMA di ogni query. **AD-8**: 422 refine date standard; envelope invariati. **AD-2/AD-4**: nessun impatto (sola lettura). **NFR-6**: paginazione obbligatoria.
- **Lezioni review**: date-only UTC nei confronti su `@db.Date` (`parseDateOnlyUtc`, mai timestamp — review 3.5 F1); `actorEmail` condizionale (3.2); query-shape assertions; i18n simmetrica; e2e con dati run-unique (la paginazione soffre i DB sporchi — vedi handoff).
- **Cosa NON fare**: niente export xlsx/pdf (epic 10); niente endpoint dedicati per alimentare picker non-staff; niente vista calendario; niente drill-down/detail route per volo (i chip 5.3 restano testo); non toccare `registerFlight`/`cancelFlight`/`correctFlight`; niente permesso nuovo in `rbac.ts` (si compone `flights.manage` + `self.read` esistenti).
- **Ambiente/gate**: come 5.3 (postgres attivo; Mailpit 127.0.0.1:1025/8025, rilancio SOLO `run_in_background: true`; reset DB pre-e2e; MAI `playwright install`). Gate: lint / typecheck / `npx vitest run` (>= 573 + nuovi) / `npx next build` / `npx playwright test` (>= 92 + nuovi; flaky noti → isolamento su DB fresco). UN commit (`Story 5.4: <sintesi>`, nessun riferimento AI). NON push.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-17, NFR-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-5, #AD-8]
- [Source: src/server/services/flights.service.ts#listFlights] — la funzione da aprire/estendere
- [Source: src/server/services/accounts.service.ts#assertReadAccess, #listAccountMovements] — pattern own-access + actorEmail condizionale (3.2)
- [Source: src/app/[locale]/dashboard/nav-items.ts] — visibilità nav per ruolo (union OR)
- [Source: src/app/[locale]/dashboard/flights/] — pagina/manager da estendere
- [Source: _bmad-output/implementation-artifacts/5-1-flight-logging-charges.md, 5-3-flight-reversal.md] — DTO/azioni esistenti

## Dev Agent Record

### Agent Model Used

_(da compilare dal dev agent)_

### Debug Log References

### Completion Notes List

### File List

## Review Record

_(da compilare dopo la review)_

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
