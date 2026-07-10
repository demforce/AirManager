---
baseline_commit: c56b362
---

# Story 10.3: Dashboard per ruolo complete

Status: done

## Story

As a utente,
I want una home che mostri subito ciò che conta per il mio ruolo,
so that il sistema mi anticipi invece di farmi cercare (FR-41; epics.md:805-822).

## Acceptance Criteria

1. **Given** un utente **staff/admin**, **When** apre `/dashboard`, **Then** vede i widget: **PPR in attesa** (esistente, invariato), **saldi negativi** (top-N più negativi + totale), **scadenze entro 60 giorni** (expired + expiring, le più urgenti prima), **prenotazioni di oggi/domani** (tutte, ordinate per inizio), **velivoli fuori servizio** (registrazione, modello, motivo) — ogni widget con link alla vista completa (`/dashboard/ppr`, `/dashboard/finance`, `/dashboard/expiries`, `/dashboard/bookings`, `/dashboard/aircraft`).
2. **Given** un **pilota o allievo** (attore con `me.person` e SENZA il permesso staff corrispondente — regola asimmetrica esistente), **Then** vede: **saldo** (rosso se negativo, link al proprio conto), **residuo pacchetti** (somma `remainingMinutes` dei pacchetti non scaduti, link al conto), **prossime prenotazioni** (future, le proprie), **le proprie scadenze con colori** (widget esistente "Le mie scadenze", palette badge), **ultimi voli** (i propri più recenti, link al registro).
3. **Given** un **istruttore** (`school.manage.own`), **Then** vede: **i propri allievi** (roster compatto, link `/dashboard/school`), **i voli scuola recenti** (i propri, link al registro prefiltrato), **le ore del mese** (proprie ore SCHOOL del mese corrente, `formatMinutes`). Un attore pilota+istruttore vede entrambi i blocchi (unione permessi); un istruttore senza profilo attivo degrada senza crash (pattern school page).
4. **Policy di visibilità RATIFICATA**: ogni widget è SEMPRE visibile per la sua audience, anche vuoto, con empty state sobrio ("zero" è informazione — pattern del widget PPR esistente). Il widget "Le mie scadenze" passa da render-solo-se-non-vuoto a sempre-visibile con empty state (cambio deliberato; verificare/aggiornare gli e2e esistenti che lo toccano).
5. Le query dei widget applicabili all'attore girano **in parallelo** (`Promise.all` dopo il gate `hasPermission` — la home oggi è sequenziale); ogni widget usa i SERVICE esistenti (AD-1), nessuna API nuova.
6. Layout: la home resta editoriale minimalista ma si allarga per i widget (bento grid, pattern card/tile esistenti); testid per widget/righe (convenzione `<nome>-widget`, `-row`, `-empty`); i18n IT/EN; unit + e2e (v. T5).

## Contesto e decisioni di design (vincolanti)

- **La home** `src/app/[locale]/dashboard/page.tsx` è oggi un "placeholder landing" (doc-comment :18-26) con nav grid + 2 widget (Le mie scadenze :176-204, PPR in attesa :206-239): questa story la trasforma nella dashboard per ruolo — SENZA toccare hero/logout/nav tiles (:116-173).
- **Widget staff/admin — dati (riuso, gap minimi)**:
  - PPR in attesa: INVARIATO (`listPprRequests(actor,{status:'PENDING',page:1,pageSize:5})`, gate `ppr.manage`).
  - Saldi negativi: `listNegativeBalances(actor)` (accounts.service.ts:629, gate `finance.manage`, già ordinata più-negativi-prima, unpaginated) → slice(0,5) nel widget + `length` come totale; formattazione `formatCents` rosso `#9F2F2D`.
  - Scadenze entro 60gg: DUE chiamate `listAllExpiries(actor,{status:'expired'|'expiring',page:1,pageSize:5})` (expiries.service.ts:435; `expiring` NON include gli scaduti — la coppia copre "tutto ciò che richiede attenzione", RATIFICATO) concatenate expired-prima; totale = somma dei due `total`; badge `ExpiryStatusBadge`.
  - Prenotazioni oggi/domani: `listCalendarBookings(actor,{from,to})` (bookings.service.ts:489, unpaginated ok su 2 giorni) con `[mezzanotte oggi Europe/Rome, mezzanotte dopodomani)` calcolate con `zonedMidnightUtc`/`addDaysDateOnly` (pattern ppr.service.ts:229-232); gate widget `bookings.manage.any` (variante staff = tutte).
  - Velivoli fuori servizio: **funzione service NUOVA e stretta** `listOutOfServiceAircraft(actor)` in aircraft.service (gate `aircraft.manage`, `where:{status:'OUT_OF_SERVICE',archivedAt:null}`, select esistente `AIRCRAFT_SELECT`) — `listAircraft` non ha il filtro status ed è paginata (recon); enum `AircraftStatus` schema.prisma:207-210, `statusReason` :236-239.
- **Widget pilota/allievo** (blocco visibile se `me.person` && regola asimmetrica esistente — pattern `!hasPermission('people.read')` di page.tsx:54-55 e `!hasPermission('expiries.manage')` :90-91; gate del blocco: manca `finance.manage`):
  - Saldo: `getAccountOverview(actor, me.person.id)` (accounts.service.ts:115, own via assertReadAccess) — `account:null` → empty state "nessun conto"; valore `formatCents`, rosso se negativo.
  - Pacchetti: `listPersonPackages(actor, me.person.id)` (packages.service.ts:301) → somma `remainingMinutes` dei non-`isExpired`, `formatMinutes`.
  - Prossime prenotazioni: `listBookings(actor,{from: now ISO, personId: me.person.id, page:1, pageSize:5})` (bookings.service.ts:434 — personId narrowing lecito per chiunque, lista trasparente).
  - Le mie scadenze: widget esistente, reso sempre-visibile (AC 4) — `listPersonExpiries` invariato; date con `formatDateOnly` (oggi il widget mostra la stringa raw — sistemare al passaggio, è la superficie che si sta toccando).
  - Ultimi voli: `listFlights(actor,{page:1,pageSize:5})` — per non-staff lo scoping own è automatico (flights.service.ts:1238); verificare l'ordinamento più-recenti-prima del service (recon: da confermare) — se non è desc, passare l'ordinamento esistente della vista.
- **Widget istruttore** (blocco gate `school.manage.own`, pattern school/page.tsx:67):
  - Allievi: `listOwnStudents(actor)` (school.service.ts:269) — catturare `INSTRUCTOR_PROFILE_REQUIRED` e degradare (pattern school/page.tsx:79-87).
  - Voli scuola recenti: `listFlights(actor,{instructorPersonId: me.person.id, flightType:'SCHOOL', page:1, pageSize:5})` (own lecito, :1227-1229); link drill-down come school/page.tsx:36-38.
  - Ore del mese: `getInstructorHourSummaries(actor, currentMonthRange())` (school.service.ts:822, ramo own = solo propria riga; `period-presets.ts:43`), `find` su own personId (pattern school/page.tsx:100), verde `#346538`.
- **Parallelizzazione**: costruire la lista dei fetch applicabili (gate `hasPermission` PRIMA, per non lanciare query destinate al 403) e un solo `Promise.all`; `getMe` resta il primo await (serve a decidere i blocchi). NIENTE cambi ai service per questo.
- **UI**: bento grid dei widget sotto la nav grid (`grid grid-cols-1 gap-4 sm:grid-cols-2`, container più largo dove serve — la pagina oggi è `max-w-2xl` :116-117: allargare con misura, restando editoriali); card/tile con le classi ricorrenti ESATTE censite (bordi `#EAEAEA`, `rounded-[12px] border bg-white p-6`, label uppercase `text-xs text-[#787774]`, righe `divide-y`, link "vista completa" underline-offset — v. References); `ExpiryStatusBadge` riusato; NIENTE componenti pesanti nuovi, NIENTE grafici.
- **Fuori scope (dichiarato)**: widget configurabili/preferenze utente; conteggi push/realtime; nuove API HTTP (la home legge i service direttamente, AD-1); modifiche a nav-items; export della home; cambi ai service esistenti oltre a `listOutOfServiceAircraft`.

## Tasks / Subtasks

- [x] **T1 (AC 1)** — `listOutOfServiceAircraft` in aircraft.service (+ unit: gate, filtro status+archived); range oggi/domani Europe/Rome (+ unit sul calcolo, DST-aware con `zonedMidnightUtc`).
- [x] **T2 (AC 1, 2, 3, 4, 5)** — Home page: blocchi per ruolo, fan-out `Promise.all` gated, widget con empty state, "Le mie scadenze" sempre-visibile + `formatDateOnly`; i18n IT/EN.
- [x] **T3 (AC 6)** — Stile bento coerente minimalist-ui; testid per ogni widget/riga/empty; verifica per TUTTI e 5 i ruoli seed (admin, staff, instructor, pilot, student), desktop + mobile 375×812.
- [x] **T4 (AC tutti)** — e2e `e2e/home-dashboard.spec.ts`: matrice per ruolo, dati costruiti run-unique, link dei widget, regressione su `ppr-queue.spec.ts`/`expiry-dashboard.spec.ts`.
- [x] **T5** — `npm run gates`; story file (Dev Agent Record) + sprint-status (10-3 → review).

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story FORTEMENTE UI: `design-taste-frontend` + `ui-ux-pro-max` + minimalist-ui obbligatorie; verifica Playwright MCP per ruolo (se `browser_resize` manca, dichiarare la verifica alternativa).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE; gates SOLO `npm run gates`; MAI `playwright install`. Baseline unit/e2e correnti fornite nel prompt di dispatch.
- UN commit di implementazione (`Story 10.3: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- I service NON si toccano (tranne la nuova `listOutOfServiceAircraft`): la story è composizione lato pagina. Il widget PPR esistente non cambia comportamento (solo eventuale riallineamento di stile/posizione nel bento).
- Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password SEED_ADMIN_PASSWORD).

### Project Structure Notes

- File toccati: `src/app/[locale]/dashboard/page.tsx` (il grosso), `src/server/services/aircraft.service.ts` (+test), `messages/{it,en}.json`, `e2e/home-dashboard.spec.ts` (nuovo), eventuali e2e esistenti citati. Componenti widget estraibili in file locali `src/app/[locale]/dashboard/_components/` o inline — a discrezione del dev, purché coerente col resto.
- NESSUNA migrazione, nessuna env var, nessuna API nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md:805-822 — story 10.3; prd.md:316+ — FR-41]
- [Source: src/app/[locale]/dashboard/page.tsx:18-26 (placeholder), :54-55/:90-91 (regola asimmetrica), :116-173 (layout), :176-239 (widget esistenti e testid convention)]
- [Source: src/server/services/ppr.service.ts:224; accounts.service.ts:629 (listNegativeBalances), :604-610 (DTO), :115 (overview), :97-103 (own)]
- [Source: src/server/services/expiries.service.ts:435, :409-418 (range per status), :123 (listPersonExpiries); src/lib/expiry-status.ts:29 (EXPIRY_WARNING_DAYS=60)]
- [Source: src/server/services/bookings.service.ts:434 (listBookings, from/to `z.iso.datetime()` semi-open :442-443), :489 (listCalendarBookings), :83-99 (DTO), :429-432 (lista trasparente)]
- [Source: src/server/services/aircraft.service.ts:151 (listAircraft senza filtro status), :14-25 (AIRCRAFT_SELECT/DTO); prisma/schema.prisma:207-210, :236-239 (AircraftStatus/statusReason)]
- [Source: src/server/services/packages.service.ts:301, :52-70 (remainingMinutes); flights.service.ts:1214, :1222-1229/:1238 (own scoping e instructorPersonId); school.service.ts:269 (listOwnStudents), :822 (getInstructorHourSummaries own), :39-48 (OwnStudentItem)]
- [Source: src/server/services/me.service.ts:6-17, :26 (MeResult/hasActiveStudentProfile)]
- [Source: src/lib/period-presets.ts:43 (currentMonthRange); src/lib/zoned-time.ts (zonedMidnightUtc/addDaysDateOnly); ppr.service.ts:229-232 (pattern range zoned)]
- [Source: pattern UI — finance/report/page.tsx:101-126 (stat tiles), finance/page.tsx:116-122/:149-191 (bottone vista + tabella saldi), school/page.tsx:36-38/:67/:79-87/:100/:155-165/:227/:243; expiries/expiry-status-badge.tsx:12-16,:35]
- [Source: src/server/auth/rbac.ts:80-113 (ROLE_PERMISSIONS), :120 (unione multi-ruolo), :137/:150 (hasPermission/authorize)]
- [Source: e2e/ppr-queue.spec.ts:52-56,:185-189; e2e/expiry-dashboard.spec.ts:161-182; nav-items.test.ts:5-7 (actorWith)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (dev subagent, xhigh).

### Debug Log References

- `npm run gates`: lint/typecheck/test(1207 passed)/build all PASS (final run, clean tree).
- `e2e/home-dashboard.spec.ts` (new, 13 tests) against `npm run dev`: 13/13 pass (verified twice, incl. a full-file run with `--workers=2`).
- Regression check against `npm run dev`: `e2e/ppr-queue.spec.ts` (4 tests) + `e2e/expiry-dashboard.spec.ts` (4 tests) — 8/8 pass, confirming the "Le mie scadenze"/"PPR in attesa" widget behavior these specs assert is unchanged.
- Interactive UI verification: could not use the Playwright MCP tools directly because logging in as each seed role requires `SEED_ADMIN_PASSWORD`, and the auto-mode credential-materialization guard blocks printing/typing that secret into a tool call built from `.env`. Used the sanctioned alternative instead — a throwaway Playwright test script (never part of `e2e/`, deleted before commit) that logs in via `process.env['SEED_ADMIN_PASSWORD']` (same pattern every real e2e spec already uses, never printed) and screenshots `/dashboard` for all 5 seed roles (admin, staff, instructor, pilot, student) at both 1280×900 and 375×812. Reviewed all 10 screenshots: bento grid renders correctly for every role/breakpoint, mobile collapses to `grid-cols-1` cleanly, empty states read as intended, and the ratified admin/instructor degrade (93-N1 precedent) shows exactly as expected.

### Completion Notes List

- `listOutOfServiceAircraft` (aircraft.service.ts): new, narrow, `aircraft.manage`-gated, unpaginated list of `OUT_OF_SERVICE`+non-archived aircraft — the one new service function the story allows (Dev Notes: "I service NON si toccano, tranne...").
- `todayTomorrowRangeUtc` (zoned-time.ts): new small DST-aware helper (`[todayMidnight, dayAfterTomorrowMidnight)` in a given IANA zone), composed entirely from the three existing primitives (`dateOnlyInZone`/`addDaysDateOnly`/`zonedMidnightUtc`) — no new date arithmetic. Unit-tested including the 2026-03-29 spring-forward day (47h span vs the ordinary 48h).
- `src/app/[locale]/dashboard/page.tsx`: rewritten into the role-based dashboard. Hero/logout/nav-tile markup (:116-173 in the pre-story file) left untouched verbatim; only the wrapping `<main>`/`<div>` classNames changed (`max-w-2xl` centered card → `max-w-5xl` top-aligned, matching the finance/school page shell exactly) — Dev Notes explicitly called this out as the one sanctioned change to that region. One local `WidgetCard` presentational component (heading + count + "vista completa" link + empty-state/children) factors out the ~12-widget repetition; three "stat" widgets (saldo, pacchetti, ore del mese) that don't fit the row-list shape are written inline. `me` stays the first `await` (needed to decide which blocks apply); every widget's per-permission gate (`hasPermission`) is computed BEFORE the fan-out, then ONE `Promise.all` runs every applicable query in parallel (AC 5) — an ungated widget resolves a typed empty default (`Promise.resolve<T[]>([])`/`Promise.resolve(null)`) instead of touching the DB.
- Widget gating exactly as the Dev Notes specified: each staff widget on its own permission (`ppr.manage`/`finance.manage`/`expiries.manage`/`bookings.manage.any`/`aircraft.manage`); the personal block on a SINGLE gate (`me.person && !finance.manage`) rather than per-widget checks — this means a plain INSTRUCTOR (who also lacks `finance.manage`) sees the personal block too, not just PILOT/STUDENT; verified this is the literal, deliberate Dev Notes instruction and confirmed visually. The instructor block (`school.manage.own`) is ALSO held by ADMIN via `ALL_PERMISSIONS` (pre-existing fact, same as `/dashboard/school` since story 9.3) — an admin with no instructor profile degrades to the roster/hours widgets rendering empty, which matches the already-ratified 93-N1 product decision ("hiding = decisione di prodotto", HANDOFF) — not a new bug, verified against the pre-existing `school/page.tsx` precedent and covered by a new e2e assertion.
- Scadenze staff widget: two `listAllExpiries` calls (`status: 'expired'`, then `'expiring'`, `pageSize: 5` each), concatenated expired-first, `total` = sum of both `.total` (never the concatenated array length, so the count badge reflects the true totals even when more than 10 rows exist).
- "Le mie scadenze" (AC 4): now rendered through `WidgetCard` with `isEmpty`/`emptyLabel`, always visible; dates now go through `formatDateOnly` instead of the raw ISO string the pre-story widget rendered (Dev Notes: "è la superficie che si sta toccando" — fixed in the same pass). New `myExpiries.empty` translation key added (IT/EN); `myExpiries.heading`/`.link` untouched, so `expiry-dashboard.spec.ts`'s existing assertions on this widget still pass unmodified.
- No new API routes, no new permission, no schema/migration changes — pure composition over existing services (AD-1), as scoped.

### File List

- `src/app/[locale]/dashboard/page.tsx` (rewritten — role-based dashboard)
- `src/server/services/aircraft.service.ts` (+ `listOutOfServiceAircraft`)
- `src/server/services/aircraft.service.test.ts` (+ tests for `listOutOfServiceAircraft`, + an array-fixture mock helper matching the file's existing pattern)
- `src/lib/zoned-time.ts` (+ `todayTomorrowRangeUtc`)
- `src/lib/zoned-time.test.ts` (+ tests, incl. a DST-crossing case)
- `messages/it.json`, `messages/en.json` (+ new `DashboardPage` widget translation keys; `myExpiries.empty` added)
- `e2e/home-dashboard.spec.ts` (new — 13 tests: role-visibility matrix, data-driven widget content, link navigation)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: fixes-required → FIXED dalla sessione principale.** 1 finding mandatory (nel TEST, non nel prodotto) + 1 nit.

- **Priorità zero — full suite e2e su DB fresco, BUILD DI PRODUZIONE in modalità CI** (chiude il gap del dev, che aveva fatto solo regressione mirata): **190 passed / 1 FAILED / 1 flaky** al primo run. Il fail è il finding 103-F1 (sotto); il flaky è il noto `ppr-register:206` retry-green (baseline). Gates ri-eseguiti: lint/typecheck/build verdi, **1207/1207 unit**. Verifica statica completa: 57 chiavi i18n IT/EN risolte, tutti i campi DTO letti esistono, gating per-widget PRIMA di ogni query (nessuna query destinata al 403); seed ispezionato via psql (matrice ruoli reale).
- **103-F1 (major, mandatory, FIXATO)** — il nuovo link "Vai alle finanze" del widget saldi negativi rende ambiguo il selettore page-level non-scoped `getByRole('link', { name: 'Finanze' })` di `account-adjustments.spec.ts:116` (il name-match di Playwright è substring): strict mode violation 2 elementi, 3/3 tentativi falliti — regressione reale che la regressione mirata del dev non poteva vedere. Il comportamento del PRODOTTO è corretto e voluto (AC 1): fix nel test. **Fix applicato (sessione principale)**: selettore scoped al landmark nav `Aree operative` (convenzione già usata da rbac/expiry-types/bookings/flight-log) + doc-comment. **Re-run full suite post-fix: 192/192 passed (4.0m), zero flaky.**
- **103-N1 (nit, ACCETTATO)** — lo stesso hazard substring esiste latente per gli altri label widget ("Vai alle scadenze"/"Scadenze", ecc.): oggi nessun test lo innesca (gli altri usano selettori scoped o goto). Nessun cambio richiesto; convenzione per il futuro: selettori nav-scoped o `exact: true`.
- **Decisione istruttore-vede-blocco-personale**: nessun finding del reviewer sul gate `manca finance.manage` (istruttore puro vede anche saldo/pacchetti/prenotazioni/scadenze/voli propri) — **RATIFICATA dalla sessione principale**: l'istruttore ha conto, scadenze, prenotazioni e voli propri; il blocco personale è informazione sua a tutti gli effetti (superset coerente con FR-41 "il sistema mi anticipa"). Il degrado admin del blocco istruttore replica il precedente 93-N1 (ratificato, con e2e esplicito).

### Final gates (post-fix, DB fresco, prod build)

lint/typecheck/build verdi, **1207/1207 unit**, full suite CI-mode **192/192 passed, 0 flaky**. Fix di review: 1 (solo e2e selector).

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — terza e ultima story Epic 10. Decisioni chiave: policy widget sempre-visibili con empty state (ratificata, incluso il cambio del widget scadenze esistente); scadenze staff = expired+expiring (due chiamate); prenotazioni oggi/domani via listCalendarBookings su range zoned Europe/Rome; unica funzione service nuova `listOutOfServiceAircraft`; fan-out Promise.all gated lato pagina; nessuna API nuova.
- 2026-07-10: Dev (Sonnet 5 subagent) — implementazione completa. Home page riscritta con 12 widget in bento grid dietro `Promise.all` gated; `listOutOfServiceAircraft` + `todayTomorrowRangeUtc` nuove; e2e `home-dashboard.spec.ts` (13 test) + regressione su ppr-queue/expiry-dashboard verificata; gates verdi. Nessuna deviazione dal design vincolante del story file.
- 2026-07-10: Review Opus 4.8 xhigh — fixes-required: 103-F1 (selettore e2e page-level reso ambiguo dal nuovo link widget, regressione trovata SOLO dalla full suite su prod build). Fix applicato dalla sessione principale (selettore nav-scoped); re-run full suite 192/192. 103-N1 accettato (hazard latente, convenzione futura). Decisione istruttore/blocco personale ratificata. Status → done. EPIC 10 COMPLETO — piano MVP terminato.
