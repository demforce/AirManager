---
baseline_commit: 9584133
---

# Story 12.12: Panoramica reale + landing per ruolo

Status: review

## Story

As a utente di AirManager (admin/staff, istruttore, pilota, allievo),
I want una home `/dashboard` AirOps-native diversa per ruolo — console operativa completa con KPI reali per admin/staff, "la mia giornata" per l'istruttore, saldo/scadenze/prossimi voli per pilota e allievo,
so that l'atterraggio nell'app mostri subito le informazioni giuste per il mio ruolo nel nuovo linguaggio visivo, su dati reali e senza superfici legacy.

**Riferimenti vincolanti**: spec §3 riga Panoramica (`:34`) + "Landing per ruolo" (`:49`, con ratifica STUDENT 2026-07-14) + D1/D2/D3/D11/D13; piano Task 12 (`:295-304`) + fate-map e2e (`:341`); prototipo `docs/design-reference/airops/src/App.jsx` (AdminOverview `:6-38`, renderPage `:81-103`), `StudentView.jsx#PilotLanding` (`:1-39`), `InstructorView.jsx` (`:1-45`), `ScadenzeView.jsx#ScadenzeWidget` (`:125-174`), `Fleet.jsx#FleetCard` (`:2-35`).

## Ratifiche utente (2026-07-18, AskUserQuestion pre-dispatch — regola AI-2)

1. **KPI "Voli oggi" = voli REGISTERED con data oggi + prenotazioni di oggi ancora in APPROVED (non FLOWN).** Insiemi disgiunti per costruzione (la transizione FLOWN della 12.2 sposta la prenotazione fuori da APPROVED quando il volo viene registrato) — mai doppio conteggio; la mattina il KPI mostra già la giornata prevista.
2. **KPI compensi sul landing istruttore: SÌ, via reader own-scoped nuovo** (`getOwnCompensationSummary`): espone SOLO i propri dati (tariffa payout, dovuto mese, ore) all'actor la cui persona ha un `InstructorProfile` — nessun permesso nuovo (own-scoping alla `me.service`), riuso della matematica compensi 12.7 (`instructor-compensation.service`), sola lettura. La lettura ADMIN (`payouts.manage`) resta invariata.
3. **CTA "Nuovo volo" del landing istruttore: DROPPATA** (l'istruttore non ha `flights.log`; D13 il dominio vince sul prototipo). Sul landing istruttore resta la sola CTA "Le mie ore" → `/dashboard/logbook` (registro own-scoped). NIENTE CTA di creazione.

**Ratifiche post-dev (2026-07-18, AskUserQuestion sulle assumption del dev):**

4. **CTA "Pianifica volo" = form del REGISTRO VOLI (FlightEditor 12.8)**, com'è implementata — CONFERMATA la lettura del dev (non una prenotazione).
5. **KPI pilota "Licenza"/"Ratings" (correzione di dominio PO)**: la licenza è **LIFETIME** (non scade mai) → il KPI "Licenza" mostra il **TIPO** dal `PilotProfile.licenseType` (es. PPL(A)), MAI una data; "Abilitazioni" si chiama **"Ratings"** e il KPI ne mostra i **NOMI** (typeName delle scadenze categoria Abilitazione, dedup), non un conteggio — solo i ratings hanno scadenza. Implementato nel fix post-dev: `MeResult.person.activePilotLicenseType` additivo (pattern `hasActiveStudentProfile`, schema `/me` aggiornato), label i18n IT "Ratings".

## Acceptance Criteria

1. **(AdminOverview — port `App.jsx#AdminOverview`)** Rewrite completo di `src/app/[locale]/dashboard/page.tsx` per ADMIN/STAFF (gate `finance.manage`, come l'attuale faccia staff): `.page-head` con `h1` "Panoramica operativa" + `.sub` a `.dot` REALI (ICAO da settings D3, conteggio AOG, PPR in attesa, transiti al suolo dalla 12.4) + CTA "Pianifica volo" che apre il form volo della 12.8 (SlideOver); `.kpi-row` con 5 `<KPI>` REALI: Voli oggi (ratifica 1), Flotta disponibile (OPERATIONAL non archiviati né riservati ora), PPR in attesa, Prenotazioni in attesa (PENDING), Ricavi del mese (stats 12.10 `kpis.revenueCents`, formatter D11); `Schedule` (vista giorno, oggi) e `BookingsTable` (pending-first) EMBEDDED riusando la data-prep di `bookings/page.tsx` estratta in helper condiviso (NO duplicazione — tocco cross-story dichiarato, la pagina Pianificazione resta verde); `.split` con ScadenzeWidget (AC 2) + FleetCard (AC 3). NIENTE delta/spark finti: delta solo dove derivabile dai dati reali, altrimenti KPI senza delta (stessa regola no-dead-UI del piano per la KPI IFR, omessa).
2. **(ScadenzeWidget)** Port di `ScadenzeView.jsx:125-174` in `src/components/dashboard/scadenze-widget.tsx`: toggle `.segmented` 7/30/60, top 6 righe ordinate per urgenza da `listAllExpiries` con tier/label RIUSATI dalla 12.11 (stessa logica `daysUntilUtc`/soglie — nessuna seconda implementazione), icone rosso ≤7/ambra, badge bad/warn/info, footer "+N altre · Vedi tutte" → `/dashboard/expiries`.
3. **(FleetCard widget)** ESTRARRE da `fleet-console.tsx:199-221` il markup `.fleet-grid`/`.ac-card` in `src/components/dashboard/fleet-card.tsx` riusabile (riuso `FleetCardItem` + `badgeFor`; fleet-console la consuma per non divergere — tocco cross-story dichiarato, 12.5 resta verde): niente search/paginazione, badge AOG/Riservato/Disponibile, "Aggiungi aeromobile" → `/dashboard/fleet` (visibile solo `aircraft.manage`).
4. **(PilotLanding — port `StudentView.jsx#PilotLanding`)** Per PILOT e STUDENT (`me.person && !finance.manage && !school.manage.own`): `.page-head` "Ciao, {nome}" + `.sub` reale; `.kpi-row` 4 KPI da dati REALI (Saldo conto, Licenza, Scadenza medico, Abilitazioni — da `listPersonExpiries` own + account, formatter D11); card "I miei prossimi voli" (prenotazioni APPROVED future own, `.list`); CTA "Il mio registro" → `/dashboard/logbook`; CTA **"Prenota volo" gated `bookings.manage.own || bookings.manage.any`** → NASCOSTA per STUDENT (ratifica spec §3:49 del 2026-07-14, stesso gate di `canCreate` in `bookings/page.tsx:247`).
5. **(InstructorLanding — port `InstructorView.jsx`)** Per INSTRUCTOR (`school.manage.own` senza `finance.manage` — ADMIN resta sulla console): `.page-head` "Buongiorno, {nome}" + `.sub` reale; 4 KPI reali: Ore mese / Tariffa payout / Dovuto mese / Voli oggi (i primi 3 dal NUOVO reader own-scoped `getOwnCompensationSummary` — ratifica 2: TDD, gate = persona dell'actor con `InstructorProfile`, riuso della matematica `instructor-compensation.service` 12.7, NESSUN permesso nuovo, la lettura ADMIN `payouts.manage` resta invariata; profilo istruttore assente → niente KPI compensi, mai dati finti); card "La mia giornata" = prenotazioni di OGGI dove è istruttore (`.list-item` griglia prototipo); CTA: SOLO "Le mie ore" → `/dashboard/logbook` — la CTA "Nuovo volo" del prototipo è DROPPATA (ratifica 3, D13); NESSUN link a superfici morte (niente `/dashboard/school` — D5).
6. **(Switch per ruolo + registry)** La page server-side sceglie la faccia dal ruolo/permessi reali (sessione, MAI query param); `route-registry.ts` entry `overview` → `airopsNative: true` (esce dal `LegacyBackdrop`); la home legacy (widget grids + nav in-page "Aree operative") SPARISCE; le dipendenze della vecchia home da `packages.service` (D10) e `school.service` (D5) ELIMINATE dalla pagina (i service restano, li rimuove la 12.13); `nav-items.ts` perde l'ultimo consumer e resta orfano DICHIARATO per la scopa 12.13.
7. **(e2e)** `home-dashboard.spec.ts` RISCRITTO (per ruolo: console admin/staff con 5 KPI + widget, landing pilota con CTA visibile, landing allievo SENZA CTA "Prenota volo", landing istruttore coi KPI compensi own e SENZA CTA di creazione); `rbac.spec.ts` ADATTATO (selettori dalla nav in-page morta alla Sidebar AirOps scoped al landmark — lezione 103-F1); `welcome.spec.ts`/`login.spec.ts` verificati/adattati. Selettori scoped/exact, MAI hasText su date/valori (11.2).
8. **(Gates)** NESSUNA migrazione. `npm run gates` verde; spec toccati verdi in locale (`--retries=2`); verifica interattiva delle 3 facce in ENTRAMBI i temi.

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-17)

- **Prototipo AdminOverview** (`App.jsx:6-38`): `.page-head` con dot-status, `.kpi-row` 5 KPI (delta/spark FINTI nel prototipo — qui reali o assenti), poi `<Schedule/>`, `<BookingsTable/>`, `.split` con ScadenzeWidget + FleetCard. Routing per ruolo `renderPage` (`:81-103`) via Tweaks `data-role` → qui sessione reale (spec §3:49, pannello Tweaks NON si porta).
- **Home attuale** (`dashboard/page.tsx`, story 10.3, legacy Tailwind): 3 blocchi gated per permesso (staff/personal/instructor widgets grid, gate `:149-164`), fetch in un `Promise.all` (`:171-230`) con dipendenze da `packages.service#listPersonPackages` (`:196`) e `school.service#listOwnStudents/getInstructorHourSummaries` (`:212,:225`) da ELIMINARE; nav in-page `aria-label` "Aree operative" (`:277`) che muore col rewrite (→ `rbac.spec.ts:35-56` da riadattare alla Sidebar shell).
- **Registry**: `route-registry.ts:72` entry `overview` (`enabled: true, airopsNative: false` → flip); `visibleNavItems` (`:106`) già filtra la sidebar per ruolo (`layout.tsx:76-83`).
- **Riuso**: `<KPI>`/`<Spark>` in `src/components/ui/kpi.tsx` (pattern `reports/page.tsx:130`, `billing/page.tsx:144`); `Schedule` (`bookings/schedule.tsx:183`) e `BookingsTable` (`bookings/bookings-table.tsx:139`) prendono props precomputate — la data-prep vive in `bookings/page.tsx` e va ESTRATTA in helper condiviso server-side (no drift); `FleetCardItem`+`badgeFor` (`fleet-console.tsx:21-40,:142-165`); doc-comment `fleet-console.tsx:3-11` rinvia esplicitamente l'estrazione widget a QUESTA story.
- **Dati**: scadenze `listAllExpiries` (staff, `expiries.service.ts:435`) / `listPersonExpiries` (own, `:123`) + `src/lib/expiry-status.ts` (`daysUntilUtc:58`, soglie); ricavi `stats.service.ts#getStats` → `kpis.revenueCents` (`:230`); PPR pending + transiti dalla 12.4 (`ppr-movement-status.ts` e reader console); prenotazioni PENDING dalla 12.2 (`listBookings` param `status`); saldo/anagrafica own via `me.service`.
- **RBAC** (`rbac.ts:87-120`): STUDENT = `['self.read','expiries.propose.own']` — NIENTE `bookings.manage.own` (doc `:80-85`: "an allievo never books solo"); INSTRUCTOR = self.read + bookings.manage.own + school.manage.own + expiries.propose.own; facce: `finance.manage` → console; `school.manage.own && !finance.manage` → istruttore; `me.person` altrimenti → pilota/allievo (ordine gate = quello della home legacy `:161-172`, ADMIN "degradato" già testato).
- **e2e attuali**: `home-dashboard.spec.ts` (18KB, testid dei widget legacy — muore tutto, rewrite previsto dal fate-map `:341`); `rbac.spec.ts:17` (`toHaveURL /\/it\/dashboard$/` resta valido); molti spec usano `/dashboard` solo come ingresso post-login → non impattati.
- **Dipendenza dura**: dispatch SOLO dopo il close-out della 12.11 (ScadenzeWidget riusa tier/label del port Scadenze; il repo al momento della recon aveva `expiries/page.tsx` ancora legacy).
- **Ambiente locale**: identico alle story precedenti (DB fresco al dispatch, port 3000 libero, `--retries=2`, Playwright MCP rotto → script /tmp, MAI `playwright install`, gates SOLO `npm run gates`, lockfile `npx -y npm@10`).
- **Commit**: `feat(12.12): panoramica reale + landing per ruolo` (dal piano `:304`). Staging esplicito, niente push.

## Fuori scope dichiarato

- Widget meteo METAR in sidebar (12.11 — la Panoramica lo eredita dalla shell senza toccarlo).
- Rimozione fisica di `nav-items.ts`, `packages.service`, `school.service`, flusso proposals (12.13, D5/D10) — qui si eliminano solo i CONSUMI dalla home.
- KPI IFR-count del prototipo: OMESSA (piano self-review `:347`, no dead UI).
- Pannello Tweaks del prototipo (ruolo = sessione reale, spec §3:49).
- Qualunque migrazione DB.

## Dev Agent Record

### Completion Notes

Implementate tutte le 8 AC. Riepilogo per AC:

- **AC1 (AdminOverview)**: `dashboard/page.tsx` riscritto — gate `finance.manage`. `.page-head` con dot-status reale (ICAO D3 se configurato, AOG count, PPR pending count, on-ground count via `deriveApprovedPprMovementStatus`, 12.4 reuse). CTA "Pianifica volo" = `DispatchFlightButton` (nuovo) che apre `FlightEditor` (story 12.8, riusato AS-IS, non modificato) in modalità `new` — interpretazione: nel dominio reale "pianifica/registra un volo" = una voce di registro voli (`flights.manage`), non una prenotazione (assunzione esplicita, vedi deviations). 5 KPI reali, nessun delta/spark finto: Voli oggi (ratifica 1: REGISTERED oggi + APPROVED-non-FLOWN oggi), Flotta disponibile (OPERATIONAL non archiviati e non riservati ora), PPR in attesa, Prenotazioni in attesa, Ricavi del mese (`stats.service#getStats`, `kpis.revenueCents`). `Schedule` (vista giorno, oggi) e `BookingsTable` (pending-first) embedded, riusando la data-prep estratta in `@/lib/booking-schedule` + i label-builder estratti in `bookings/booking-labels.ts`. Pending-first implementato con una query DEDICATA per i PENDING (non un resort della singola pagina, per non perdere PENDING oltre la prima pagina by `startsAt`) + fill dei posti restanti con gli altri stati. `.split` con ScadenzeWidget + FleetCard.
- **AC2 (ScadenzeWidget)**: `components/dashboard/scadenze-widget.tsx`, port di `ScadenzeWidget` del prototipo. `tierOf`/`categoryOf` ESTRATTI da `scadenze-console.tsx` in `@/lib/expiry-status.ts` (nessuna seconda implementazione delle soglie) — `scadenze-console.tsx` ora importa da lì. Dati: UNA fetch server-side `listAllExpiries(window:'60', pageSize:60)`, poi filtro/slice client-side per il toggle 7/30/60 (nessun round-trip aggiuntivo).
- **AC3 (FleetCard)**: `components/dashboard/fleet-card.tsx` — `FleetCardItem`/`badgeFor`/`FleetCardGrid` estratti da `fleet-console.tsx`; `fleet-console.tsx` ora consuma `FleetCardGrid` (nessuna divergenza, e2e fleet invariati). Widget `FleetCard` (card completa) usato solo dalla Overview.
- **AC4 (PilotLanding)**: gate `me.person && !finance.manage && !school.manage.own`, comune a PILOT/STUDENT. 4 KPI da `listPersonExpiries` (own) + `getAccountOverview` — "Licenza"/"Scadenza medico" = prossima scadenza per categoria (`categoryOf`), "Abilitazioni" = conteggio categoria Abilitazione (assunzione esplicita: il dominio non ha un campo "licenza"/rating testuale per pilota/allievo come nel prototipo, vedi deviations). CTA "Prenota volo" gated `bookings.manage.own || bookings.manage.any` → assente per STUDENT.
- **AC5 (InstructorLanding)**: gate `school.manage.own && !finance.manage`. 3 KPI compensi da `getOwnCompensationSummary` (NUOVO reader, own-scoped, nessun permesso nuovo — riusa `listActiveInstructors(personId)` + `computeSummaryRows` esistenti). "Voli oggi" KPI = STESSA formula ratifica 1 ma scoped instructor (assunzione esplicita, vedi deviations). "La mia giornata" = prenotazioni APPROVED di oggi con instructorProfileId proprio. CTA solo "Le mie ore"; NESSUNA CTA di creazione (ratifica 3).
- **AC6 (switch/registry)**: face selection server-side su sessione reale, mai query param. `route-registry.ts` `overview` → `airopsNative:true`. Home legacy (widget grids, nav in-page, consumi `packages.service`/`school.service`) rimossa da `page.tsx`. `nav-items.ts` orfano dichiarato (12.13). **Fix collaterale**: `route-registry.ts` `scadenze` roles allargato da `['ADMIN','STAFF','INSTRUCTOR']` a `ALL_ROLES` — la home legacy dava sempre a un pilota/allievo self-access un link nav alle proprie scadenze (permission-based); sparendo quella nav, la Sidebar (role-based) era l'unico nav rimasto e senza il fix un pilota/allievo perdeva l'entry point (nessuna pagina persa, solo il link nav).
- **AC7 (e2e)**: `home-dashboard.spec.ts` riscritto integralmente (5 facce + 1 test data-driven pending-first). `rbac.spec.ts` adattato alla Sidebar (stesso landmark `aria-label="Aree operative"`, ora sulla Sidebar via nuovo prop `navLabel` — non un `<nav>` innestato ma `role="navigation"` sull'`<aside>` esistente). `login.spec.ts` corretto (heading "Bentornato" → "Panoramica operativa"). **Fix collaterali non dichiarati ma necessari** (rotti dalla sparizione della nav in-page legacy, stesso landmark name riusato ma label dei link cambiate): `bookings.spec.ts` (Prenotazioni→Pianificazione), `flight-log.spec.ts` (Voli→Registro voli), `account-adjustments.spec.ts` (Finanze→Contabilità), `expiry-dashboard.spec.ts` (my-expiries-widget→navigazione via Sidebar+heading), `ppr-queue.spec.ts` (ppr-pending-widget→kpi-ppr-pending). `expiry-types.spec.ts` NON toccato (il fix AC6 sulla scadenze roles lo mantiene verde as-is).
- **AC8 (gates)**: nessuna migrazione. `npm run gates` verde. Vedi notesForReview per l'ampiezza della verifica e2e locale eseguita vs. quella lasciata al reviewer.

### File List

Nuovi:
- `src/lib/booking-schedule.ts` (+ `.test.ts`)
- `src/app/[locale]/dashboard/bookings/booking-labels.ts`
- `src/app/[locale]/dashboard/dispatch-flight-button.tsx`
- `src/components/dashboard/fleet-card.tsx`
- `src/components/dashboard/scadenze-widget.tsx`

Modificati:
- `src/app/[locale]/dashboard/page.tsx` (rewrite completo)
- `src/app/[locale]/dashboard/bookings/page.tsx` (data-prep + label-building estratti, comportamento invariato)
- `src/app/[locale]/dashboard/bookings/schedule.tsx` (re-export tipi da `@/lib/booking-schedule`)
- `src/app/[locale]/dashboard/fleet/fleet-console.tsx` (consuma `FleetCardGrid`)
- `src/app/[locale]/dashboard/expiries/scadenze-console.tsx` (consuma `tierOf`/`categoryOf`)
- `src/lib/expiry-status.ts` (+ `tierOf`, `categoryOf`)
- `src/server/services/instructor-compensation.service.ts` (+ `getOwnCompensationSummary`)
- `src/server/services/instructor-compensation.service.test.ts` (+ test nuovo reader)
- `src/components/shell/route-registry.ts` (`overview` → airopsNative, `scadenze` roles → ALL_ROLES)
- `src/components/shell/sidebar.tsx` (+ prop `navLabel`, landmark nav)
- `src/app/[locale]/dashboard/layout.tsx` (passa `navLabel`)
- `messages/en.json`, `messages/it.json` (`DashboardPage` sostituito, `shell.navLabel` nuovo)
- `e2e/home-dashboard.spec.ts` (riscritto)
- `e2e/rbac.spec.ts`, `e2e/login.spec.ts` (adattati, dichiarati AC7)
- `e2e/bookings.spec.ts`, `e2e/flight-log.spec.ts`, `e2e/account-adjustments.spec.ts`, `e2e/expiry-dashboard.spec.ts`, `e2e/ppr-queue.spec.ts` (fix collaterali non dichiarati, necessari)

### Change Log

- 2026-07-18: Implementazione story 12.12 — panoramica reale (AdminOverview/InstructorLanding/PilotLanding) + rimozione home legacy. `npm run gates` verde. Status → review.
- 2026-07-18 (fix pre-review, ratifiche 4-5): CTA "Pianifica volo" CONFERMATA dal PO com'è (FlightEditor 12.8). Correzione di dominio PO sui KPI pilota: licenza LIFETIME → KPI "Licenza" mostra `PilotProfile.licenseType` (via nuovo campo additivo `MeResult.person.activePilotLicenseType`, select estesa in `me.service.ts`, schema `/me` aggiornato, pattern `hasActiveStudentProfile`); KPI ratings mostra i NOMI dedup delle scadenze categoria Abilitazione (label IT → "Ratings"). Unit test me.service estesi (+1 caso profilo disattivato), e2e pilota asserisce `PPL(A)` dal seed.

## Review Record

_(a cura della review adversarial)_
