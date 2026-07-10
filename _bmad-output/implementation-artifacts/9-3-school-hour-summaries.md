---
baseline_commit: 20e8907
---

# Story 9.3: Riepiloghi ore scuola

Status: review

## Story

As a gestore (staff/admin),
I want i totali ore di allievi (doppio comando/solista, totali e per periodo) e le ore di volo scuola erogate da ciascun istruttore per periodo con drill-down sui voli,
so that monitori il percorso degli allievi e le ore da retribuire agli istruttori (FR-34; il compenso è calcolato FUORI dal sistema — solo conteggio ore, PRD §383).

## Acceptance Criteria

1. **Given** voli scuola registrati (Epic 5), **When** il gestore apre il riepilogo allievi con un periodo scelto, **Then** vede per ogni allievo ATTIVO (profilo attivo, persona non archiviata — convenzione 9.1): **ore doppio comando** e **ore solista** SEPARATE nel periodo, totale del periodo e totale storico (all-time); i voli CANCELLED sono sempre esclusi; i totali tornano con i dati (provato con voli costruiti ad hoc: SCHOOL, senza istruttore, PRIVATE con istruttore, stornati).
2. **Given** un periodo scelto, **When** il gestore apre il riepilogo istruttori, **Then** vede per ogni istruttore ATTIVO le ore di volo SCHOOL erogate nel periodo, con **drill-down** che apre il registro voli prefiltrato su quell'istruttore e quel periodo; un istruttore loggato vede SOLO la propria riga (`school.manage.own`, FR-2 "proprie ore"); pilota/allievo → 403 sulle API riepilogo.
3. Il filtro periodo usa i preset esistenti (mese/trimestre/anno correnti + intervallo libero, `period-presets.ts`), bounds date-only INCLUSIVI su `flightDate` (pattern `listFlights` `gte/lte` con `parseDateOnlyUtc` — MAI raw timestamp, lezione 3.5 F1).
4. Il registro voli supporta il filtro nuovo `instructorPersonId` (API + pagina): staff/admin filtrano liberamente; un attore non-staff può usarlo SOLO sul proprio personId (403 altrimenti, coerente con la guardia `personId` di 5.4); il drill-down di AC 2 lo usa.
5. API `GET /api/v1/school/summaries/students` e `GET /api/v1/school/summaries/instructors` (query `from`/`to` obbligatorie, `z.iso.date()` + refine `from <= to` — pattern `cashReportQuerySchema`) registrate in OpenAPI; query BATCHED (groupBy, MAI N+1); NESSUNA migrazione (nessun cambio schema); unit + e2e.

## Contesto e decisioni di design (vincolanti)

- **DECISIONE DI DOMINIO (assumption ratificata in-story, da confermare col PM — segnalata nell'handoff)**: il modello dati NON ha un flag "solista" e i voli `SCHOOL` RICHIEDONO un istruttore (`schema.prisma:714-725`, `flights.service.ts:451-452`). Il PRD però definisce l'allievo come "vola solo in Voli scuola (o solista autorizzato dall'Istruttore)" (§glossario, prd.md:66). Derivazione SENZA cambi schema, per un allievo:
  - **Doppio comando** = SUM(`minutes`) dei voli `flightType = SCHOOL` (istruttore garantito dal vincolo) non-CANCELLED.
  - **Solista** = SUM(`minutes`) dei voli con `instructorProfileId IS NULL` non-CANCELLED, QUALUNQUE `flightType` (per definizione di ruolo, il volo senza istruttore di un allievo è il suo solista — oggi viene registrato come PRIVATE/OTHER).
  - **Totale** = doppio comando + solista. EDGE dichiarato nel doc-comment: un volo PRIVATE/OTHER dell'allievo CON istruttore (es. checkride, ammesso da 5.1) non rientra in NESSUNO dei due bucket (non è volo scuola né solista) — coerente col fatto che non è addestramento scuola; documentare.
  - La colonna "ore scuola totali" del roster 9.1 (solo SCHOOL) resta INVARIATA (vista diversa, non un bug — doc-comment).
- **Service (`school.service.ts`, si estende — niente file nuovi)**:
  - `getStudentHourSummaries(actor, {from,to})` — `authorize(actor,'school.manage.any')`; platea = tutti gli allievi con profilo ATTIVO e persona NON archiviata (stessa convenzione roster 9.1); 4 aggregati per allievo (DC periodo, solista periodo, DC storico, solista storico) via groupBy batched su `Flight` (2 groupBy per finestra: uno `flightType=SCHOOL`, uno `instructorProfileId=null`; periodo e storico = 4 groupBy totali, TUTTI batched su `personId IN (...)`); ordinamento cognome/nome.
  - `getInstructorHourSummaries(actor, {from,to})` — accesso a due vie: `school.manage.any` → tutti gli istruttori con profilo ATTIVO e persona non archiviata; altrimenti `authorize(actor,'school.manage.own')` + risoluzione del PROPRIO profilo (pattern `listOwnStudents`) → SOLO la propria riga. Aggregato: SUM(`minutes`) voli `SCHOOL` non-CANCELLED per `instructorProfileId` nel periodo, groupBy batched. DTO: personId, nome, minuti periodo (niente compensi: fuori sistema).
  - Bounds periodo: `flightDate: { gte: parseDateOnlyUtc(from), lte: parseDateOnlyUtc(to) }` (flightDate è `@db.Date`; NIENTE zoned-time/half-open — quello è per i timestamp).
- **Filtro registro voli `instructorPersonId` (AC 4)**: aggiungere a `listFlightsQuerySchema` (`src/lib/schemas/flights.ts:30-42`) e a `listFlights` (`flights.service.ts:1192-1249`): where su relazione `instructorProfile: { personId: ... }` (o risoluzione personId→profileId, a scelta del dev, dichiarata); guardia non-staff IDENTICA a quella di `personId` (:1200-1202): non-staff può passarlo solo se `=== actor.personId`, altrimenti 403. Pagina `/dashboard/flights/page.tsx`: accettare il param (`searchParams` :14-22), droppato per non-staff SALVO il proprio (coerente con :103-104), preservato in `pageHref`; UI minimale: nessun picker nuovo — quando il param è attivo mostrare un'indicazione filtro attivo con azione di rimozione (pattern chip/link "Azzera" coerente con la pagina; niente componenti nuovi). Aggiornare OpenAPI del path flights + registry test se contano i param.
- **API riepiloghi**: `GET /api/v1/school/summaries/students` (solo `school.manage.any`) e `GET /api/v1/school/summaries/instructors` (`school.manage.any` O `school.manage.own` self-scoped — il service decide, la route passa l'actor); query `from`/`to` OBBLIGATORIE (`z.iso.date()` + refine, pattern `cash.ts:162-167`); risposta array semplici (set piccoli, come 9.1 — non envelope). Schema in `school.ts`, registry tag `School`, test registry.
- **UI — la landing `/dashboard/school` diventa due-facce** (pattern landing expiries 6.4):
  - **Nav**: `nav-items.ts` voce `school` → `permissions: ['school.manage.own','school.manage.any']` (ora anche staff/admin vedono "Scuola"); aggiornare `nav-items.test.ts`.
  - **Gestore (staff/admin, `school.manage.any`)**: la pagina mostra la sezione **Riepiloghi** con filtro periodo (client, preset mese/trimestre/anno + custom — riuso ESATTO del pattern `ReportFilters` di `finance/report/page.tsx:87-98` e default server `currentMonthRange()`): tabella allievi (nome → link diario `/dashboard/school/{personId}`, DC periodo, solista periodo, totale periodo, totale storico) e tabella istruttori (nome, ore SCHOOL periodo, azione "Apri nel registro" → `/dashboard/flights?instructorPersonId=…&flightType=SCHOOL&dateFrom=…&dateTo=…`, pattern link `cash-report-open-register` di `report/page.tsx:131-138`). Lo staff NON vede il roster "I miei allievi" (non è istruttore).
  - **Istruttore (`school.manage.own`)**: roster "I miei allievi" INVARIATO + card/sezione "Le mie ore scuola" (stesso filtro periodo, la propria riga: ore SCHOOL erogate nel periodo) con lo stesso drill-down sul registro (il param `instructorPersonId` è il proprio → passa la guardia own).
  - Chi ha entrambi i permessi (admin con profilo istruttore: caso teorico) vede entrambe le facce; ore formattate `formatMinutes` esistente; i18n IT/EN simmetrici; stile minimalist-ui (card summary con la palette del report: verde `#346538` per i valori, niente rosso qui — non c'è segno negativo); verifica Playwright MCP desktop + mobile 375×812 (story con UI: `design-taste-frontend` + `ui-ux-pro-max`).
- **Fuori scope (dichiarato)**: export Excel/PDF dei riepiloghi (FR-34 "Esportabile" → Epic 10, mapping epics.md:102); flag "solista" persistito a schema (se il PM vorrà marcare esplicitamente i solisti, sarà una story futura — la derivazione qui è pura lettura); compensi/tariffe istruttore (fuori sistema); riepilogo self-service per l'ALLIEVO (FR-34 è del gestore; l'allievo ha già diario e — in futuro — export).
- **NESSUNA migrazione, NESSUN cambio schema.** Solo letture aggregate + un filtro nuovo.

## Tasks / Subtasks

- [x] **T1 (AC 1, 2, 3, 5)** — Service: `getStudentHourSummaries` + `getInstructorHourSummaries` (batched, bounds inclusivi, platee attive/non-archiviate, doc-comment della derivazione DC/solista e dell'edge checkride) + schemi Zod `from`/`to`.
- [x] **T2 (AC 4)** — Filtro `instructorPersonId` in `listFlights` (schema+service, guardia own per non-staff) + pagina flights (param, drop non-staff salvo own, pageHref, indicazione filtro attivo) + OpenAPI.
- [x] **T3 (AC 5)** — Route `school/summaries/students` + `school/summaries/instructors`, registry + test.
- [x] **T4 (AC 1, 2, 3)** — UI landing school due-facce: sezione Riepiloghi gestore (filtri periodo, tabella allievi, tabella istruttori con drill-down), card "Le mie ore scuola" istruttore; nav + test nav; i18n; verifica Playwright MCP desktop+mobile.
- [x] **T5 (AC tutti)** — Unit (matrice permessi due-vie, derivazione DC/solista con fixture miste incl. CANCELLED e checkride escluso, bounds periodo inclusivi, batching, guardia instructorPersonId own/non-own) + e2e (gestore vede DC/solista corretti con voli costruiti; istruttore vede solo la propria riga e il drill-down apre il registro filtrato; pilota 403; param instructorPersonId altrui da non-staff → 403).
- [x] **T6** — `npm run gates`; e2e nuovi + regressione school + flights; story file (Dev Agent Record) + sprint-status.yaml (9-3 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; UI → anche `design-taste-frontend` e `ui-ux-pro-max`.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); Mailpit attivo; prima di ogni run e2e `curl localhost:3000` deve FALLIRE; build SEMPRE `env -u NODE_ENV`; MAI `playwright install`. Baseline e2e: **161 test** (flake noti fuori diff: ppr-register anche isolato ~1 su 2-3 run, contention login sotto carico — criterio: fuori dal diff + verde in isolamento = non-regressione).
- UN commit di implementazione (`Story 9.3: ...`). Codice/commenti inglesi; UI IT/EN.
- Helper e2e: `e2e/school.spec.ts` (login, createInstructorWithLogin, createStudentPerson, createAircraftWithRate, registerSchoolFlight — estendere con un helper per voli senza istruttore/PRIVATE se serve); per i totali usare SEMPRE osservabili run-unique (persone nuove per test).
- `listFlights` è superficie epic-5 money-adjacent: il filtro nuovo NON deve toccare il calcolo costi né gli altri filtri — modifica chirurgica alla where + guardia; la full suite flights esistente è il canarino.

### References

- [Source: _bmad-output/planning-artifacts/epics.md:757-771 — story 9.3; :102 — export in Epic 10]
- [Source: prd.md:279-283 — FR-34 + assumption compensi; :66 — glossario Allievo (solista); :97 — FR-2 ruoli ("istruttore: proprie ore"); :52 — UJ-4 doppio comando]
- [Source: prisma/schema.prisma:714-725, :786-869 — FlightType/Flight; flights.service.ts:451-452 — SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR; :1192-1249 — listFlights e guardie]
- [Source: src/server/services/school.service.ts:269-345 — groupBy batched 9.1/9.2 da estendere]
- [Source: src/lib/schemas/cash.ts:162-167 — pattern query from/to; src/lib/period-presets.ts; finance/report/page.tsx:49-51,87-98,101-138 — filtri, summary cards, link registro]
- [Source: src/app/[locale]/dashboard/flights/page.tsx:14-22,94-104,187-189 — searchParams e sanitizzazione]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

- `npm run gates` (compact): PASS lint, PASS typecheck, PASS test (1156 passed, 40 files — 76 new: 6 unit for `getStudentHourSummaries`/`getInstructorHourSummaries` in `school.service.test.ts`, 4 unit for the `instructorPersonId` filter/guard in `flights.service.test.ts`), PASS build (`env -u NODE_ENV npx next build`).
- e2e targeted regression (not the full 161-baseline suite — see notesForReview): `e2e/school.spec.ts` (25 tests incl. 3 new for story 9.3), `e2e/flights.spec.ts`, `e2e/flight-log.spec.ts`, `e2e/flight-reversal.spec.ts` — all green, one pre-existing hydration console warning in `flights-manager.tsx` (money formatting `1.900,00 €` vs `1900,00 €`, file untouched by this story) observed but not a test failure.
- Interactive Playwright MCP verification: logged in as seeded admin, created fixtures via `fetch` (instructor, student, aircraft+rate, instructor rate, SCHOOL + solo flights spanning in/out of a fixed period), confirmed `/dashboard/school` desktop screenshot (gestore Riepiloghi tables with correct dual/solo/total/all-time values, "Le mie ore scuola" card, unchanged "I miei allievi" roster — admin holds `school.manage.any` AND `school.manage.own` via `ALL_PERMISSIONS`, confirming the "both faces" case is the ADMIN default, not just theoretical), the "Apri nel registro" drill-down (URL params, filter chip, exactly the expected flight row), the chip's "Rimuovi filtro istruttore" clear action, mobile 375×812 layout (chip wraps, tables scroll horizontally in their own `overflow-x-auto`, same pattern as the existing report/flights tables), and the EN locale.

### Completion Notes List

- Domain decision (Contesto, unchanged from the story file): dual-command = non-cancelled `SCHOOL` flights; solo = non-cancelled flights with no instructor, any `flightType`; a `PRIVATE`/`OTHER` flight WITH an instructor (checkride) falls in neither bucket — implemented exactly as specified and covered by both unit and e2e fixtures (e2e explicitly constructs and excludes the checkride + a CANCELLED SCHOOL flight).
- `getStudentHourSummaries`/`getInstructorHourSummaries` (`school.service.ts`): 4 batched `groupBy`s for the student summary (dual/solo × period/all-time, all on `personId IN (...)`), 1 batched `groupBy` for the instructor summary — no N+1 anywhere. `getInstructorHourSummaries` decides `school.manage.any` vs `.own` once at the top (AD-5); the "own" branch reuses `resolveOwnActiveInstructorProfile` (same 422 `INSTRUCTOR_PROFILE_REQUIRED` as `listOwnStudents`).
- `listFlights`'s `instructorPersonId` filter (`flights.service.ts`) mirrors the existing `personId` guard exactly (staff free, non-staff only their own id, checked before any query) — the where clause adds `instructorProfile: { personId }`, no change to cost calculation or the other filters (surgical per the Dev Notes' "canary" warning).
- `/dashboard/school` (`page.tsx`) now branches on `school.manage.any`/`school.manage.own` independently (previously `school.manage.own`-only): the gestore's Riepiloghi section, the instructor's unchanged roster, and a new "Le mie ore scuola" card. `getInstructorHourSummaries` is called exactly ONCE regardless of which permission(s) the actor holds — the own-row card is derived by filtering the `any`-branch's full result by `actor.personId` rather than issuing a second query (verified live: the seeded ADMIN account genuinely holds both permissions via `ALL_PERMISSIONS`, so this dual-permission path is exercised by every admin, not just a theoretical instructor-admin).
- `/dashboard/flights` (`page.tsx`) accepts `?instructorPersonId=`, drops it for non-staff unless it equals their own `personId` (same pattern as `aircraftId`/`personId`), keeps it in `pageHref`/the `FlightsManager` remount `key`, and shows a plain chip + "Rimuovi filtro istruttore" link when active — no new picker component (per Dev Notes), `FlightsManager`/`flights-manager.tsx` itself untouched.
- Nav: `school` now shows for `school.manage.own` OR `school.manage.any` (staff/admin gain the "Scuola" item); `nav-items.test.ts` updated.
- New client component `summary-filters.tsx` is an intentional near-duplicate of `finance/report/report-filters.tsx#ReportFilters` retargeted at `/dashboard/school` (Dev Notes: "riuso ESATTO del pattern") — not extracted into a shared component since the two report pages' filter state, target route and testids differ and neither existing component is a natural host for a third caller (kept surgical, no speculative shared abstraction).
- OpenAPI: 2 new paths (`/api/v1/school/summaries/students`, `/api/v1/school/summaries/instructors`) + 2 new component schemas registered; the `/api/v1/flights` path description updated to mention `instructorPersonId`; `registry.test.ts`'s path list updated.
- No Prisma migration — confirmed no `schema.prisma` changes.

### File List

- `src/lib/schemas/school.ts` — `schoolSummaryQuerySchema`, `studentHourSummaryItemSchema`/list, `instructorHourSummaryItemSchema`/list.
- `src/lib/schemas/flights.ts` — `instructorPersonId` added to `listFlightsQuerySchema`.
- `src/server/services/school.service.ts` — `getStudentHourSummaries`, `getInstructorHourSummaries` + private batched-sum helpers.
- `src/server/services/flights.service.ts` — `instructorPersonId` filter + non-staff guard in `listFlights`.
- `src/app/api/v1/school/summaries/students/route.ts` — new route.
- `src/app/api/v1/school/summaries/instructors/route.ts` — new route.
- `src/lib/schemas/registry.ts` — new schema registrations + 2 new paths; flights path description updated.
- `src/app/[locale]/dashboard/flights/page.tsx` — `instructorPersonId` param handling + active-filter chip.
- `src/app/[locale]/dashboard/school/page.tsx` — rewritten two-faced landing (Riepiloghi gestore, "Le mie ore scuola" card, unchanged roster).
- `src/app/[locale]/dashboard/school/summary-filters.tsx` — new client component (period filter).
- `src/app/[locale]/dashboard/nav-items.ts` — `school` nav item permissions extended to `school.manage.any`.
- `messages/it.json`, `messages/en.json` — new `SchoolPage.titleManage`/`descriptionManage`/`summaries`/`myHours` keys; `FlightsPage.filters.instructorActive`/`instructorClear`.
- `src/server/services/school.service.test.ts` — new `hour summaries (story 9.3, FR-34)` describe block (permission matrix, derivation, batching, bounds); `person.findMany` added to the prisma mock.
- `src/server/services/flights.service.test.ts` — `instructorPersonId` filter/guard tests; schema test updated.
- `src/lib/schemas/registry.test.ts` — 2 new paths added to the endpoint list.
- `src/app/[locale]/dashboard/nav-items.test.ts` — new test for `school`'s extended visibility.
- `e2e/school.spec.ts` — new `School hour summaries (Story 9.3, FR-34)` describe block (3 tests) + 2 new fixture helpers (`registerFlightNoInstructor`, `registerPrivateFlightWithInstructor`, `cancelFlight`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 9-3 → review.

## Review Record

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — terza e ultima story Epic 9. Decisione di dominio DC/solista derivata dai dati esistenti (assumption da ratificare, segnalata nell'handoff); nessuna migrazione.
- 2026-07-10: Implementazione completa (Sonnet 5 dev agent, xhigh) — T1-T6. Nessuna deviazione dal contratto della story; nessuna migrazione. Status → review.
