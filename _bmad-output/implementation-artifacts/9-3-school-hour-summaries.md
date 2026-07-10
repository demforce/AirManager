---
baseline_commit: 20e8907
---

# Story 9.3: Riepiloghi ore scuola

Status: ready-for-dev

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

- [ ] **T1 (AC 1, 2, 3, 5)** — Service: `getStudentHourSummaries` + `getInstructorHourSummaries` (batched, bounds inclusivi, platee attive/non-archiviate, doc-comment della derivazione DC/solista e dell'edge checkride) + schemi Zod `from`/`to`.
- [ ] **T2 (AC 4)** — Filtro `instructorPersonId` in `listFlights` (schema+service, guardia own per non-staff) + pagina flights (param, drop non-staff salvo own, pageHref, indicazione filtro attivo) + OpenAPI.
- [ ] **T3 (AC 5)** — Route `school/summaries/students` + `school/summaries/instructors`, registry + test.
- [ ] **T4 (AC 1, 2, 3)** — UI landing school due-facce: sezione Riepiloghi gestore (filtri periodo, tabella allievi, tabella istruttori con drill-down), card "Le mie ore scuola" istruttore; nav + test nav; i18n; verifica Playwright MCP desktop+mobile.
- [ ] **T5 (AC tutti)** — Unit (matrice permessi due-vie, derivazione DC/solista con fixture miste incl. CANCELLED e checkride escluso, bounds periodo inclusivi, batching, guardia instructorPersonId own/non-own) + e2e (gestore vede DC/solista corretti con voli costruiti; istruttore vede solo la propria riga e il drill-down apre il registro filtrato; pilota 403; param instructorPersonId altrui da non-staff → 403).
- [ ] **T6** — `npm run gates`; e2e nuovi + regressione school + flights; story file (Dev Agent Record) + sprint-status.yaml (9-3 → review).

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

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — terza e ultima story Epic 9. Decisione di dominio DC/solista derivata dai dati esistenti (assumption da ratificare, segnalata nell'handoff); nessuna migrazione.
