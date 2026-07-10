---
baseline_commit: c56b362
---

# Story 10.3: Dashboard per ruolo complete

Status: ready-for-dev

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

- [ ] **T1 (AC 1)** — `listOutOfServiceAircraft` in aircraft.service (+ unit: gate, filtro status+archived); range oggi/domani Europe/Rome (+ unit sul calcolo, DST-aware con `zonedMidnightUtc`).
- [ ] **T2 (AC 1, 2, 3, 4, 5)** — Home page: blocchi per ruolo, fan-out `Promise.all` gated, widget con empty state, "Le mie scadenze" sempre-visibile + `formatDateOnly`; i18n IT/EN.
- [ ] **T3 (AC 6)** — Stile bento coerente minimalist-ui; testid per ogni widget/riga/empty; verifica Playwright MCP desktop + mobile 375×812 per TUTTI e 5 i ruoli seed (admin, staff, instructor, pilot, student).
- [ ] **T4 (AC tutti)** — e2e `e2e/home-dashboard.spec.ts`: matrice per ruolo (staff/admin vedono i 5 widget staff e NON i blocchi self; pilota vede saldo/pacchetti/prenotazioni/scadenze/voli e NON i widget staff; allievo idem; istruttore vede allievi/voli scuola/ore mese; pilota+istruttore entrambi i blocchi se il seed lo consente — altrimenti costruire l'utente nel test); dati costruiti run-unique (volo nuovo → appare in "ultimi voli"; prenotazione domani → appare in oggi/domani; velivolo OUT_OF_SERVICE → appare nel widget; conto negativo → appare nei saldi); link dei widget navigano alle viste giuste; regressione: e2e esistenti che toccano la home (`ppr-queue.spec.ts:185-189`, `expiry-dashboard.spec.ts:161-182`) — aggiornarli SOLO se il cambio sempre-visibile li rompe, dichiarandolo.
- [ ] **T5** — `npm run gates`; story file (Dev Agent Record) + sprint-status (10-3 → review).

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-10: Story file created (Fable 5 main session) — terza e ultima story Epic 10. Decisioni chiave: policy widget sempre-visibili con empty state (ratificata, incluso il cambio del widget scadenze esistente); scadenze staff = expired+expiring (due chiamate); prenotazioni oggi/domani via listCalendarBookings su range zoned Europe/Rome; unica funzione service nuova `listOutOfServiceAircraft`; fan-out Promise.all gated lato pagina; nessuna API nuova.
