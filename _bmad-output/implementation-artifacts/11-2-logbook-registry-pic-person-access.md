---
baseline_commit: TBD-set-at-dispatch
---

# Story 11.2: Registro logbook, PIC e voli dalla scheda persona

Status: ready-for-dev

## Story

As a gestore o pilota,
I want vedere nel registro tutti i campi logbook col PIC e raggiungere i voli di una persona in un click,
so that consultare il logbook di chiunque sia immediato (FR-44, FR-45; epics.md «Epic 11», change-request-flight-log-2026-07-10.md).

## Acceptance Criteria

1. **Given** il registro voli, **When** lo apro, **Then** la tabella mostra (oltre alle colonne attuali velivolo/persona/istruttore/tipo/durata/importo/stato/azioni): **data in DD/MM/YYYY** (`formatDateOnly`), **tratta** `partenza → arrivo`, **orari** `HH:MM–HH:MM` (decollo–atterraggio, Europe/Rome via `formatTimeOfDay`), **decolli/atterraggi** `N / N`, **PIC**. I voli storici senza dati logbook mostrano `—` (chiave `noValue` esistente) nelle celle tratta/orari.
2. **Given** un volo, **When** ne derivo il PIC (helper UI puro, MAI memorizzato — schema 9.4), **Then** vale: volo non-SCHOOL → la persona del volo; SCHOOL con `isSolo` → la persona (allievo); SCHOOL doppio comando → l'istruttore (fallback `—` se assente su dati storici anomali). Formato nome = `personLabel` esistente (`lastName firstName`).
3. **Given** le superfici voli che oggi mostrano date ISO raw, **Then** passano al formato italiano: colonna data, riga dettaglio annullamento (`cancelledAt`), sottotitolo del pannello di annullamento/correzione. NESSUN nuovo formatter: `formatDateOnly`/`formatDateTime`/`formatTimeOfDay` da `src/lib/time.ts` (client-safe, già importati altrove).
4. **Given** la scheda di una persona (`people/[id]`), **When** la apro come staff (`flights.manage`) o come titolare della scheda, **Then** il placeholder "Ultimi voli" diventa un pannello REALE: gli ultimi 5 voli della persona (data DD/MM/YYYY, tratta, durata, stato) + link "Vedi tutti" → `/dashboard/flights?personId=<id>` per lo staff, `/dashboard/flights` per il titolare (il registro own-scope ignora `personId`). Il pannello mantiene l'heading esistente "Ultimi voli"; per chi non è né staff né titolare il placeholder resta com'è oggi. Il placeholder "Prossime prenotazioni" NON si tocca.
5. Gli e2e restano verdi: `flight-reversal.spec.ts` aggiorna i filtri `hasText: '2020-01-02'` → `'02/01/2020'`; `person-detail.spec.ts` aggiorna le assertion del pannello reale (l'heading "Ultimi voli" sopravvive; `'Disponibile prossimamente.'` resta per il placeholder prenotazioni). Nuove assertion: colonne logbook e PIC nel registro, pannello voli sulla scheda (staff + titolare), link pre-filtrato.
6. i18n IT/EN completo per le nuove chiavi (tabella + pannello); selettori e2e nuovi conformi alla convenzione post-103-F1 (scoped al landmark o `exact: true`).

## Contesto e decisioni di design (vincolanti)

- **Tabella registro** (`flights-manager.tsx`, `<table>` hand-written dentro `overflow-x-auto`, NON TanStack): le nuove informazioni entrano come 4 colonne COMPATTE per non esplodere la larghezza — `tratta` (una colonna: `dep → arr`), `orari` (una colonna: `HH:MM–HH:MM`), `decolli/atterraggi` (una colonna: `takeoffs / landings`, sostituisce l'attuale colonna `landings`), `PIC`. La colonna data resta prima, formattata. `min-w-[860px]` va allargato con misura. Riga testid `flight-row` invariato.
- **Dati già sul wire** (post-11.1): `departureAirfield`/`arrivalAirfield` (string|null), `takeoffAt`/`landingAt` (ISO datetime|null), `takeoffs`/`landings` (int), più `isSolo`, `flightType`, `person {id,firstName,lastName}`, `instructor {personId,firstName,lastName}|null` — la story è SOLO presentazione + pannello, NESSUN cambio a schema/service/API del registro. Orari: `formatTimeOfDay(new Date(flight.takeoffAt), locale)` (helper prende un `Date`).
- **PIC**: helper module-scope in `flights-manager.tsx` accanto a `personLabel`/`flightTypeLabel` (stesso pattern): `flightType !== 'SCHOOL' || isSolo → flight.person`, altrimenti `flight.instructor` (fallback `noValue`). Riusare ANCHE nel pannello scheda persona se mostra il PIC — non duplicare: se serve in entrambi, estrarre in un modulo condiviso client-safe (es. `src/lib/flight-pic.ts` con unit test dei 3 rami + fallback).
- **Date italiane — SOLO superfici voli** (le altre — account panel/statement, expiries panel — sono della story 11.3, NON toccarle): colonna data (`{flight.flightDate}` raw), riga `cancelledAt.slice(0,10)` raw in `FlightStatusCell` → `formatDateOnly(flight.cancelledAt.slice(0,10), locale)`, sottotitolo pannello annulla/correggi (`{flight.flightDate}` raw). Il locale è già disponibile nel componente (prop esistente usata per `moneyLocale` — riusare la stessa fonte).
- **Pannello "Ultimi voli"** (`people/[id]/page.tsx`, server component): sostituire il placeholder `recentFlights` (array `PLACEHOLDER_SECTIONS` — lasciare `upcomingBookings`) con una sezione server-rendered: gate `canManageFlights = hasPermission('flights.manage')` o `isOwnPage` (pattern own-access già usato dalla pagina); dati `listFlights(actor, { personId: staff ? id : undefined, page: 1, pageSize: 5 })` — per il titolare NIENTE `personId` (own-scope automatico; un non-staff con personId altrui riceve 403 dal service, e2e flight-log lo prova). Righe compatte (data, tratta, durata, stato) + Link "Vedi tutti" con href per-ruolo (AC 4). Label: `getTranslations('PersonDetailPage')` server-side inline (pattern back-link) o labels prop se si fa un client component — preferire SERVER-rendered puro (niente interattività richiesta). Heading = stringa ESISTENTE `placeholders.recentFlights` ("Ultimi voli") spostata/riusata come heading del pannello reale — la chiave può migrare a un nome più pulito purché IT/EN restino allineati.
- **Fan-out**: la scheda persona fa già più fetch sequenziali — aggiungere `listFlights` SENZA ristrutturare la pagina (chirurgico); nessun nuovo endpoint HTTP (AD-1: si consuma il service direttamente nel server component).
- **Fuori scope (dichiarato)**: date italiane su account/expiries e ogni export xlsx/pdf (story 11.3); colonne PIC/logbook negli export (11.3); filtri nuovi nel registro; pannello prenotazioni sulla scheda; modifiche a flights.service/schemas (i dati ci sono già); QTB/libretto PDF (follow-up fuori epic).

## Tasks / Subtasks

- [ ] **T1 (AC 2)** — Helper PIC (`src/lib/flight-pic.ts` o module-scope se usato in un solo file) + unit test (3 rami + fallback istruttore mancante).
- [ ] **T2 (AC 1, 3)** — Colonne logbook + date italiane nelle superfici voli; i18n IT/EN + wiring labels (json → page.tsx → tipo `FlightsManagerLabels`); verifica larghezza/overflow con Playwright MCP (desktop + 375px).
- [ ] **T3 (AC 4)** — Pannello "Ultimi voli" reale su `people/[id]` con gate e link per-ruolo; i18n.
- [ ] **T4 (AC 5, 6)** — e2e: update `flight-reversal.spec.ts` (date DD/MM/YYYY) e `person-detail.spec.ts`; nuove assertion registro logbook/PIC e pannello scheda (staff + titolare + non autorizzato); convenzione selettori post-103-F1.
- [ ] **T5** — `npm run gates`; Dev Agent Record + File List; sprint-status `11-2` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story UI: `design-taste-frontend` + `ui-ux-pro-max` + coerenza `minimalist-ui` (tabella e pannelli ESISTENTI — modifiche chirurgiche, niente redesign); verifica Playwright MCP (workaround credenziali sanzionato se serve).
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE; gates SOLO `npm run gates`; MAI `playwright install`.
- UN commit di implementazione (`Story 11.2: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- Baseline post-11.1: 30 migrazioni; unit 1211+; e2e — il numero esatto è nel prompt di dispatch. Flake noti: `ppr-register:206`, `cash-report` ECONNRESET, login-redirect timeout su webServer freddo.
- I riferimenti :line di `flights-manager.tsx` nel recon sono PRE-11.1 — il file è stato modificato dalla story precedente: individuare i punti per nome (thead/tbody della tabella, `FlightStatusCell`, `personLabel`), non per riga.
- Voli storici: il DB fresco non ne ha (seed senza voli) — per testare i `—` della tratta/orari serve un volo con campi null: NON è creabile via API (obbligatori); crearlo negli e2e/unit via INSERT psql diretto o accettare la copertura solo-unit del rendering null (dichiarare la scelta).

### Project Structure Notes

- File toccati attesi: `src/app/[locale]/dashboard/flights/flights-manager.tsx`, `src/app/[locale]/dashboard/flights/page.tsx` (wiring labels), `src/app/[locale]/dashboard/people/[id]/page.tsx`, `src/lib/flight-pic.ts` (+ test, se estratto), `messages/it.json`, `messages/en.json`, `e2e/flight-reversal.spec.ts`, `e2e/person-detail.spec.ts`, `e2e/flights.spec.ts` (nuove assertion), eventuale `e2e/flight-log.spec.ts`.
- NESSUNA migrazione, env var, API nuova.

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 11.2»; change-request-flight-log-2026-07-10.md]
- [Source: recon 11.2 in sessione — flights-manager.tsx: tabella plain `<table>` (thead ~:561-573, tbody ~:576-628 PRE-11.1), `personLabel` ~:254, `FlightStatusCell` ~:649 (`cancelledAt.slice(0,10)` raw ~:666), pannello annulla ~:885; filtro personId gated `canManage` (~:339)]
- [Source: flights/page.tsx — `personId = canManage ? sp.personId : undefined` (~:105), banner filtro istruttore (~:232, pattern per eventuale banner persona); FLIGHTS_PAGE_SIZE=20, paginazione server-side]
- [Source: people/[id]/page.tsx — `PLACEHOLDER_SECTIONS = ['recentFlights','upcomingBookings']` (~:30), render ~:448-455; heading name da `getPerson`; pattern labels: `getTranslations('PersonDetailPage')` server-side]
- [Source: src/lib/time.ts — formatDateOnly/formatTimeOfDay/formatDateTime client-safe (nessun import server-only), già importati da packages-panel/training-notes-journal client components]
- [Source: src/lib/schemas/flights.ts — FlightListItemDto: person {id,firstName,lastName}, instructor {personId,firstName,lastName}|null, isSolo, flightType + campi logbook 11.1]
- [Source: e2e/person-detail.spec.ts ~:55-58 (heading 'Ultimi voli' + 'Disponibile prossimamente.'); e2e/flight-reversal.spec.ts ~:291-302 (hasText '2020-01-02'); e2e/flight-log.spec.ts ~:234 (403 personId altrui non-staff), ~:340 (?personId= navigation)]
- [Source: messages/it.json — FlightsPage.list.table ~:963-984; PersonDetailPage ~:210 (placeholders.recentFlights)]
- [Source: prisma/schema.prisma — commento Flight/isSolo (story 9.4): PIC derivato, mai memorizzato]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
