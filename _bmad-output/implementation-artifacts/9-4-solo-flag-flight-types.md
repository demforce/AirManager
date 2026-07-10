---
baseline_commit: a74d978
---

# Story 9.4: Doppio comando/solista esplicito e tassonomia tipi volo (correzione di dominio FR-34)

Status: ready-for-dev

## Story

As a gestore/istruttore,
I want che i voli scuola distinguano esplicitamente doppio comando e solista (il solista è un volo SCUOLA con istruttore pagato, dove il PIC è l'allievo) e che i tipi di volo riflettano la tassonomia reale (Turismo / Scuola / Lavoro aereo),
so that i riepiloghi FR-34 contino le ore giuste e il modello sia pronto per logbook/QTB (chiarimento di dominio dell'utente 2026-07-10, che SOSTITUISCE l'assumption della 9.3).

## Contesto di dominio (dal chiarimento utente — vincolante)

- Tre tipologie di volo reali: **Lv** Lavoro aereo, **Sc** Scuola, **Tm** Turismo.
- Nei voli scuola: **in ENTRAMBI i casi (DC e solista) l'allievo paga l'istruttore**. Solista → PIC è l'allievo; doppio comando → PIC è l'istruttore. Il PIC firma logbook e QTB; sul logbook le ore si dividono PIC (solista) vs DUAL.
- Conseguenze: il solista è `SCHOOL` **con istruttore associato e pagato** (l'addebito istruttore dell'epic 5 resta corretto senza modifiche); la derivazione 9.3 "solista = volo senza istruttore" era SBAGLIATA e va sostituita; serve un flag persistito.
- Decisioni utente (AskUserQuestion 2026-07-10): correzione in questa PR (story 9.4); **rinomina completa dell'enum** `PRIVATE→TOURISM`, `OTHER→AERIAL_WORK` con migrazione dati; **ore istruttore da retribuire = DC + solisti supervisionati** (già il comportamento attuale: tutti i SCHOOL).

## Acceptance Criteria

1. **Given** la registrazione di un volo di tipo Scuola, **When** l'operatore compila il form, **Then** DEVE scegliere tra "Doppio comando" e "Solista" (radio, default Doppio comando, visibile SOLO con tipo Scuola); l'istruttore resta OBBLIGATORIO in entrambi i casi (422 `SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR` invariato) e viene addebitato all'allievo in entrambi i casi (nessuna modifica al calcolo costi — provato: stesso importo istruttore su DC e solista a parità di durata/tariffa); `isSolo=true` su un tipo NON Scuola → 422 `SOLO_REQUIRES_SCHOOL`; il registro voli mostra la distinzione (tipo "Scuola — solista" quando isSolo); la CORREZIONE volo (5.3) preserva/permette il flag come ogni altro campo ri-registrato.
2. **Given** l'enum `FlightType`, **Then** i valori diventano `TOURISM` / `SCHOOL` / `AERIAL_WORK` (migrazione HAND-WRITTEN `ALTER TYPE "FlightType" RENAME VALUE ...` — transazionale, nessun indice/constraint referenzia i valori, verificato in ricognizione; MAI la migrazione auto-generata da Prisma, che ricrea l'enum) e le etichette UI "Turismo / Scuola / Lavoro aereo" (EN: "Tourism / School / Aerial work"); TUTTE le superfici aggiornate (z.enum, switch label, option, default form = `TOURISM`, sanitize array, literal e2e); dopo `migrate deploy`, `prisma migrate diff` contro lo schema = NESSUN drift; i voli esistenti mantengono i loro dati (rename in-place). Breaking change del contratto API v1 documentato nello story file (nessun consumer esterno oggi; il futuro client Flutter leggerà i valori nuovi dall'OpenAPI).
3. **Given** i riepiloghi 9.3, **Then** la derivazione diventa: **DC = `SCHOOL && isSolo=false`**, **solista = `SCHOOL && isSolo=true`** (non-CANCELLED, come prima); totale = tutti i SCHOOL; il bucket "senza istruttore" SPARISCE (un volo Turismo/Lavoro aereo di un allievo non è più contato come solista); ore istruttore = tutti i SCHOOL dove è istruttore (DC + solisti — logica INVARIATA, ri-documentata); roster 9.1 "ore scuola totali" = tutti i SCHOOL (invariato, ora = DC+solista per costruzione). Gli e2e 9.3 riscritti sulla nuova semantica (fixture con voli solista REALI: SCHOOL+istruttore+isSolo).
4. Migrazione unica con timestamp DOPO `20260709235408` (rename valori + `ALTER TABLE "Flight" ADD COLUMN "isSolo" BOOLEAN NOT NULL DEFAULT false` — lo storico diventa tutto DC, assunzione corretta: i solisti non erano rappresentabili prima); OpenAPI aggiornato (valori enum nuovi + campo `isSolo` in request/response); unit + e2e; `npm run gates` verde; full suite senza regressioni.

## Contesto e decisioni di design (vincolanti)

- **Schema**: `Flight.isSolo Boolean @default(false)` + doc-comment che fissa il dominio: "solo meaningful on SCHOOL flights (422 otherwise); a solo flight still carries (and bills) the instructor — the student is PIC; on dual the instructor is PIC. PIC is DERIVED (solo→student, dual→instructor), not stored — future logbook/QTB stories will read it from here." Enum: rinominare i valori nello schema Prisma; doc-comment dell'enum (`schema.prisma:642-648`) riscritto con la tassonomia reale (Tm/Sc/Lv) e la regola istruttore invariata.
- **Migrazione (hand-written, pattern TD-2)**: un'unica dir `2026071(0|1)HHMMSS_rename_flight_types_add_solo_flag/migration.sql` con: 2× `ALTER TYPE "FlightType" RENAME VALUE`; `ALTER TABLE "Flight" ADD COLUMN "isSolo" BOOLEAN NOT NULL DEFAULT false`. Verifiche del dev: `npx prisma migrate deploy` su DB fresco (29 migrazioni), `npx prisma migrate diff` → no drift, `psql` conferma valori rinominati su dati esistenti. Ordinamento con `ls prisma/migrations | tail` PRIMA del commit.
- **Service voli (`flights.service.ts`)**: guardia nuova SUBITO DOPO `:451-453`: `if (input.isSolo && input.flightType !== 'SCHOOL') → ValidationError SOLO_REQUIRES_SCHOOL`. `isSolo` in `registerFlightSchema` (`schemas/flights.ts:56-70`, `z.boolean().optional().default(false)`), in `RegisterFlightParams`, persistito nel create e RIPORTATO nel path di CORREZIONE (5.3: `correctFlight` ri-registra — il flag deve viaggiare come `flightType`, vedi gli usi `input.flightType`/`flight.flightType` a `:303/:652/:805/:1130` circa); esposto in `FlightListItem`/`flightListItemSchema` (`:175` area). NIENTE altro cambia nel calcolo costi (karpathy: il flag è metadato, zero rami monetari).
- **Rinomina enum — inventario esaustivo (ricognizione 2026-07-10 su base epic-5; righe indicative, RIVERIFICARE col grep prima di ogni edit: `grep -rn "'PRIVATE'\|'OTHER'" src e2e` e zero occorrenze a fine lavoro)**:
  - `prisma/schema.prisma` enum + doc (`:642-653`).
  - `src/lib/schemas/flights.ts:8` `z.enum(['PRIVATE','SCHOOL','OTHER'])` → valori nuovi (usato da query `:36`, body `:62`, DTO `:175`).
  - `src/app/[locale]/dashboard/flights/flights-manager.tsx`: switch `flightTypeLabel` (`:246-257`), option filtro (`:746-748`), default form `'PRIVATE'`→`'TOURISM'` (`:912`), option form (`:1228-1230`).
  - `src/app/[locale]/dashboard/flights/page.tsx:40` array `FLIGHT_TYPES`.
  - i18n `messages/it.json`/`en.json` blocco `flightTypes` (`:719-724`): SOLO i VALORI ("Turismo/Scuola/Lavoro aereo", "Tourism/School/Aerial work") — le chiavi JSON `private/school/other` restano (disaccoppiate dai valori enum; rinominarle propagherebbe su label types senza beneficio — se il dev preferisce rinominarle in `tourism/school/aerialWork` per igiene, è ammesso MA dichiarato e completo).
  - e2e: `flight-log.spec.ts` (:163 type helper + literal :185-337), `flights.spec.ts:326`, `flight-reversal.spec.ts:192,324,338`; label UI nei `selectOption`.
  - Storia BMAD (`5-1-*.md` ecc.): NON toccare (artefatti chiusi).
- **Form (`flights-manager.tsx`)**: radio DC/Solista dopo il select tipo (`:1219-1232`), reso solo quando il tipo scelto è SCHOOL — il tipo oggi è `register`-only: per condizionare il render usare **plain state** locale come `durationMode` (pattern `:976-978` e fieldset `:1250-1276`, commento sul perché niente `watch()` col React Compiler); il valore entra nel body POST (`:1092-1102`) SOLO sul branch registrazione (la correzione ha il suo prefill); reset a default quando il tipo cambia via da SCHOOL. Nuova label + errore `SOLO_REQUIRES_SCHOOL` in i18n (blocco errors `:739-751`) e nel type `FlightsManagerLabels`.
- **Registro**: cella tipo (`:533`) mostra "Scuola — solista" quando `flight.isSolo` (concatenazione label esistente + suffisso i18n; EN "School — solo"); nessun filtro nuovo (fuori scope).
- **Riepiloghi (`school.service.ts`)**: `getStudentHourSummaries` — i groupBy del bucket solista passano da `instructorProfileId: null` (`:722` circa) a `flightType:'SCHOOL', isSolo:true`; quelli DC da `flightType:'SCHOOL'` a `flightType:'SCHOOL', isSolo:false` (`:706/:841` circa; periodo E storico); `getInstructorHourSummaries` INVARIATO nella logica (tutti i SCHOOL) ma doc-comment aggiornato ("DC + supervised solos — the student pays the instructor in both, user decision 2026-07-10"); doc-comment della derivazione riscritto (l'edge "checkride PRIVATE con istruttore" resta fuori dai bucket scuola — ora si chiama TOURISM/AERIAL_WORK con istruttore). Roster 9.1 (`:297`) invariato. La UI school (colonne DC/solista) non cambia struttura, solo i numeri tornano giusti.
- **9.2 non cambia**: `listStudentSchoolFlights` (select voli collegabili al diario) filtra `flightType:'SCHOOL'` — corretto anche per i solisti (sono voli scuola). Nessun edit.
- **e2e school 9.3** (`school.spec.ts:544/:606/:650` circa): riscrivere le fixture — il volo solista di test diventa SCHOOL+istruttore+`isSolo:true` (helper `registerSchoolFlight` esteso con param opzionale); aggiungere l'assert che un volo TOURISM senza istruttore dell'allievo NON conta più come solista (il vecchio bucket); il checkride resta escluso.
- **Fuori scope (dichiarato)**: logbook pilota e QTB (epics futuri — il PIC derivato è pronto qui); filtro solista nel registro; campo PIC persistito; export (Epic 10); rinomina delle CHIAVI i18n se il dev non la fa (v. sopra).

## Tasks / Subtasks

- [ ] **T1 (AC 2, 4)** — Schema Prisma (rename valori + `isSolo` + doc-comment) + migrazione hand-written unica; verifica deploy su DB fresco (29), no drift, dati preservati.
- [ ] **T2 (AC 1)** — `flights.service.ts`: guardia `SOLO_REQUIRES_SCHOOL`, persistenza e propagazione su correzione volo, DTO; `schemas/flights.ts` (z.enum nuovo + isSolo); prova a parità di tariffa che l'importo istruttore è identico su DC e solista.
- [ ] **T3 (AC 2)** — Rinomina esaustiva su UI/i18n/page/e2e (inventario sopra + grep finale ZERO occorrenze `'PRIVATE'`/`'OTHER'` in src/ ed e2e/); OpenAPI aggiornato.
- [ ] **T4 (AC 1)** — Form: radio DC/Solista condizionale (pattern durationMode), label/errore i18n, body POST; registro: label "Scuola — solista"; verifica Playwright MCP (desktop; mobile: markup/e2e se resize assente).
- [ ] **T5 (AC 3)** — `school.service.ts`: derivazioni nuove nei 4 groupBy studenti + doc-comment istruttori; unit aggiornati (fixture isSolo, il vecchio bucket senza-istruttore NON conta); e2e school riscritti.
- [ ] **T6 (AC 4)** — `npm run gates`; e2e mirati (school + flights + flight-log + flight-reversal) + full suite in modalità CI se il tempo lo consente (altrimenti dichiararlo: la fa il reviewer); story file (Dev Agent Record) + sprint-status.yaml (9-4 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; UI → `design-taste-frontend` + `ui-ux-pro-max`.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); Mailpit attivo; prima di ogni run e2e `curl localhost:3000` deve FALLIRE; build SEMPRE `env -u NODE_ENV`; MAI `playwright install`. Baseline: **164 e2e / 1156 unit / 28 migrazioni** (post-9.3).
- UN commit di implementazione (`Story 9.4: ...`).
- ATTENZIONE righe: la ricognizione ha mappato le superfici epic-5 su uno snapshot precedente — le righe possono essere slittate (es. `listFlights` ha guadagnato il filtro `instructorPersonId` in 9.3). Fidarsi dei grep, non dei numeri.
- Il rename enum tocca superfici money-adjacent SOLO come literal di tipo: nessun ramo monetario va modificato; la suite flights/account è il canarino.

### References

- [Chiarimento utente 2026-07-10 in sessione (Lv/Sc/Tm; solista = SCHOOL con istruttore pagato, PIC allievo; logbook PIC vs DUAL) + decisioni AskUserQuestion (9.4 in PR #13; rename completo; ore istruttore = DC+solisti)]
- [Source: prisma/schema.prisma:642-653 — enum; flights.service.ts:451-453 — guardia SCHOOL; schemas/flights.ts:8,36,62,175]
- [Source: flights-manager.tsx:246-257,746-748,912,976-978,1092-1102,1219-1232,1250-1276; flights/page.tsx:40; messages/*:719-724,739-751]
- [Source: school.service.ts:297,673,706,722,841 — groupBy da correggere; e2e/school.spec.ts:544,606,650 — test 9.3 da riscrivere]
- [Source: _bmad-output/implementation-artifacts/9-3-school-hour-summaries.md — assumption sostituita da questa story; td-2 — pattern migrazione hand-written]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — correzione di dominio dal chiarimento utente (solista = volo scuola con istruttore pagato, PIC derivato; tassonomia Turismo/Scuola/Lavoro aereo). Sostituisce l'assumption DC/solista della 9.3.
