---
baseline_commit: 5ebe87f
---

# Story 12.3: Pianificazione + Prenotazioni — UI AirOps

Status: done

## Story

As a staff / pilota / istruttore,
I want la pagina Pianificazione nel design AirOps — timeline giorno/settimana per aeromobile e tabella prenotazioni con le azioni del workflow (approva/rifiuta/effettuato/assente/riapri) —
so that la gestione prenotazioni avvenga nel nuovo linguaggio visivo con il flusso di approvazione della 12.2.

**Riferimenti vincolanti**: spec §3 (riga Pianificazione) + D7/D13; piano Task 3; prototipo `docs/design-reference/airops/src/Schedule.jsx`, `Ops.jsx#BookingsTable`, `Forms.jsx#NewBookingForm`; story 12.2 (API transition + param `status`).

## Acceptance Criteria

1. **(Shim opt-out — meccanismo nuovo)** Il layout dashboard smette di applicare il light-backdrop shim alle pagine AirOps-native: flag `airopsNative: boolean` sul route-registry (`src/components/shell/route-registry.ts`) + componente client `LegacyBackdrop` (pathname-aware via `usePathname` + registry lookup) che avvolge `{children}` SOLO per route non-native. Questa story marca `bookings` come nativa; le altre pagine legacy restano avvolte identiche (verifica smoke su expiries/settings in dark mode).
2. **(Timeline)** `/dashboard/bookings` rende il card "Programma" del prototipo: righe = aeromobili bookable (OUT_OF_SERVICE renderizzato come riga AOG con blocco `aog-block` a tutta giornata e motivo), blocchi = prenotazioni APPROVED del giorno (riuso delle proiezioni server esistenti `projectDayBlocks`/`projectWeekChips` di `page.tsx` — finestra 06:00–22:00 INVARIATA — ripresentate con le classi del prototipo `.schedule/.sched-row/.sched-track/.flight`), now-line SOLO su oggi (Europe/Rome), navigazione data con `CalendarPopover` (primitive 12.1) + prev/next/oggi, toggle Giorno/Settimana (week = griglia `.week-grid` con conteggi reali per giorno, click → day view di quel giorno), filtri popover su aeromobile e istruttore (il filtro "tipo volo" del prototipo NON esiste sul dominio Booking — omesso, D13). Le convenzioni URL esistenti (`?view`/`?date`/`?page` con sanitizzazione e default) restano IDENTICHE (e2e crosstalk L822 deve continuare a passare con i nuovi testid).
3. **(Tabella prenotazioni)** Sotto la timeline, il card "Prenotazioni" del prototipo con dati reali: colonne Pilota (nome + istruttore/note sub), Inizio, Fine (formato `formatDateOnly` + orario locale), Aereo (marche mono), Stato (badge nuovi stati IT: in attesa/approvato/rifiutato/effettuato/assente/annullato; `denyReason` mostrato sotto il badge sui rifiutati), Azioni per stato:
   - PENDING (solo `bookings.manage.any`): Approva (POST transition APPROVED), Rifiuta (mini-modal `.mini-modal` con textarea motivazione OBBLIGATORIA → POST transition DENIED), Modifica;
   - APPROVED: Modifica, Effettuato, Assente (staff), Annulla (flusso cancel esistente, two-step confirm preservato);
   - DENIED/FLOWN/NO_SHOW (staff): Riapri (POST transition PENDING).
   La lista carica TUTTI gli stati rilevanti via il param `status` della 12.2 (default UI: tutti; pending ordinati prima o evidenziati come nel prototipo "N in attesa · M totali" nel card-sub). Paginazione esistente preservata. Own-user (pilota/istruttore) vede le proprie con Modifica/Annulla sole (nessuna azione decisionale).
4. **(Form nuova prenotazione)** `NewBookingForm` ricostruito dentro `SlideOver` (primitive 12.1) con `.form-grid`/`Field`/`Input`/`Select`: STESSI campi, modi (staff/instructor/pilot), validazioni RHF+zod, datetime-local, UX EXPIRED_DOCUMENTS con sezione "Forza prenotazione" staff-only e banner warning/success — parità funzionale COMPLETA col form legacy (i testid `force-booking-*`, `booking-form-*` possono restare per minimizzare il churn e2e). Select nativi con classe `.input` (il prototipo usa select nativi — NIENTE typeahead nuovo). Bottone Export xlsx preservato (`buildExportHref`).
5. **(SlideOver F3)** Il listener Escape di `slide-over.tsx` fa early-return quando `!open` (finding F3 della review 12.1 — questa story è il primo consumer).
6. **(e2e)** `e2e/bookings.spec.ts`: i test UI-strutturali riscritti sui nuovi selettori (inventario in Contesto); i test comportamentali/API (L587 concurrency, L744 403, L767/L797 race, L969 force-403, L995 boundary) INVARIATI e verdi; test NUOVI per il workflow UI: staff approva una PENDING (badge cambia), rifiuto con motivazione visibile in tabella, riapri, effettuato/assente. Convenzioni selettori invariate (landmark-scoped, exact, mai hasText con orari).
7. **(Gates)** `npm run gates` verde; `e2e/bookings.spec.ts` completo verde in locale (--retries=2 per il cold-start noto); pagina verificata interattivamente in entrambi i temi (light/dark) — la pagina è AirOps-nativa: NESSUNO shim, dark mode pieno.

## Contesto e decisioni di design (vincolanti — ricognizione 2026-07-14)

- **Pagina legacy** (`src/app/[locale]/dashboard/bookings/page.tsx`): server component con chiamate service dirette — `listBookableAircraft` L234, `getOwnInstructorProfileId` L242, staff: `listPeople` (≤100 non-archiviati) L252 + `listActiveInstructors` L256, instructor: `listBookableStudents` L259, lista `listBookings({from: nowIso, pageSize:20, page})` L267 con clamp pagina L272, calendario `listCalendarBookings({from,to})` L288. Proiezioni: `projectDayBlocks` L110-148 (top/height %, clamp, MIN 8%), `projectWeekChips` L160-183 (chip per giorno, id composito). URL: `sanitizeView` L44, `sanitizeDate` L58, `calendarHref` L298 / `pageHref` L321 che si preservano a vicenda. RIUSARE le proiezioni e le sanitizzazioni: cambia la PRESENTAZIONE, non la meccanica.
- **Form legacy** (`new-booking-form.tsx`): select nativi (NON SearchCombobox), RHF + `buildFormSchema(mode, bookingTarget)` L118-146, POST `/api/v1/bookings` L260 con datetime-local→ISO, error envelope L266-296 (409 overlap, AIRCRAFT_OUT_OF_SERVICE con reason, BOOKING_IN_PAST, PERSON_NOT_BOOKABLE, EXPIRED_DOCUMENTS), force UX 7.4 L280-344 (`force-booking-section`/`force-booking-reason`, resend stesso body + force/forceReason), success `router.refresh()` + banner warnings L298-304/566-575. Toggle istruttore "per me/per un allievo" L410-434 (useState, non RHF — nota React-Compiler L108-116). PRESERVARE tutta questa meccanica sotto la nuova pelle.
- **Shim**: `dashboard/layout.tsx` L109-120 — wrapper `<div style={{background:'#FBFBFA',…}}>` incondizionato su {children}. Meccanismo opt-out da creare (AC 1): flag nel registry + client component; NESSUN altro modo esiste oggi (verificato).
- **Timeline data**: SOLO APPROVED occupano la timeline (semantica overlap 12.2); le PENDING vivono nella tabella con le azioni. NON aggiungere PENDING alla timeline.
- **Export**: `ExportButton` + `buildExportHref('/api/v1/bookings', {from: nowIso, status: LEGACY_LIST_STATUSES.join(',')}, locale)` (post-fix F2 review 12.2) — preservare, allineando gli status a quelli mostrati dalla nuova lista (tutti gli stati se la lista li mostra tutti).
- **e2e inventario** (`e2e/bookings.spec.ts`): UI-strutturali da riscrivere: L290 (pilota prenota, overlap, back-to-back), L326 (staff picker), L378 (instructor toggle allievo), L470 (day-blocks/week-chips/nav), L516 (mobile 375px), L612 (sposta+cancel two-step), L666 (409 su sposta), L822 (crosstalk href ?page/?view/?date), L887 (warning banner), metà UI di L345/L413/L918. Comportamentali da NON toccare: L587, L744, L767, L797, L969, L995. Fixture: `FUTURE_DAY='2031-03-10'` L248 condivisa (nota L265-267: per test nuovi usare date future run-unique). Testid calendario esistenti: `calendar-prev/today/next/view-day/view-week/aircraft-column/block/week-table` — mantenerli o aggiornarli coerentemente nei test riscritti.
- **12.2 API (CONFERMATA in review, 203/203 CI-mode)**: `POST /api/v1/bookings/[id]/transition` body `{to, reason?}` (422 `BOOKING_TRANSITION_INVALID`/`BOOKING_DENY_REASON_REQUIRED`, 403 senza `bookings.manage.any`, 409 su race); `bookingItemSchema` espone `denyReason`/`decidedAt`; `listBookings` accetta `status` come array (query string comma-separated: `?status=PENDING,APPROVED`). ATTENZIONE: i numeri di riga dell'inventario e2e qui sotto sono pre-12.2 — la 12.2 ha riscritto 2 test overlap e aggiunto un blocco in api-v1.spec.ts, quindi i line number sono INDICATIVI: cercare per titolo.
- **i18n**: namespace `bookings.*` nuovo (IT dal prototipo); riusare le stringhe workflow della 12.2 dove già esistono (badge stati).
- **Ambiente locale**: identico alle story precedenti (docker compose, DB fresco al dispatch, port 3000 libero, cold-start login flake → --retries=2, MAI playwright install).
- **Commit**: `feat(12.3): pianificazione timeline + prenotazioni workflow UI`. Niente push.

## Fuori scope dichiarato

- "Nuovo volo" slide-over (arriva col form voli della 12.8 — il bottone del prototipo non si monta finché non esiste).
- Filtro "tipo volo" del prototipo (nessun campo kind sul dominio Booking — D13).
- Badge conteggio sidebar "Pianificazione" (wiring badge in 12.12).
- Finestra di disponibilità da settings (12.11) — la validazione orari resta quella odierna.

## Dev Agent Record

(compilato dal dev agent)

## Dev Agent Record (Sonnet 5 xhigh — 2026-07-15; completamento meccanico a cura della sessione principale)

- **AC1**: flag `airopsNative` sul route-registry + nuovo `src/components/shell/legacy-backdrop.tsx` (client, pathname-aware) montato in `dashboard/layout.tsx`; `bookings` marcata nativa, le altre pagine legacy restano avvolte.
- **AC2**: `schedule.tsx` — day view a righe-aeromobile con asse ORIZZONTALE 06:00–22:00 (stesse percentuali delle proiezioni 7.2, top/height → left/width), riga AOG a tutta giornata, now-line su oggi, filtri popover aeromobile/istruttore, nav Link-driven che preserva `?view/?date/?page`; week view = griglia 7 celle con conteggi reali per giorno.
- **AC3**: `bookings-table.tsx` — badge stati IT, azioni per stato sui endpoint transition/cancel 12.2, mini-modal rifiuto con motivazione obbligatoria, feedback via `useToast`. Default lista = TUTTI e 6 gli stati con `from: nowIso` INVARIATO (assunzione dichiarata in page.tsx: una DENIED/FLOWN/NO_SHOW con endsAt del tutto trascorso esce naturalmente dalla lista — "Riapri" resta visibile solo nella finestra operativa).
- **AC4**: `new-booking-form.tsx` ricostruito in SlideOver (parità completa: modi, force-booking, banner) + NUOVO `edit-booking-form.tsx` (l'ex "Sposta" inline, ora SlideOver; RHF `values` per il reset per-prenotazione senza effect). `booking-calendar.tsx` e `bookings-list.tsx` ELIMINATI.
- **AC5**: early-return su `!open` nel listener Escape di `slide-over.tsx` (+ ritocco toast.tsx).
- **Deviazioni dichiarate**: (1) testid rinominati `schedule-aircraft-row`/`schedule-block`/`schedule-section`, drop `calendar-week-table`/`calendar-chip` (sanzionato dallo story file); (2) bottone "Oggi" aggiunto (classe `.today-btn` che il prototipo definisce ma non usa); (3) toggle giorno/settimana con link/router.push, NON la primitive `Segmented` (onChange-only, incompatibile con nav URL-driven — doc-comment in schedule.tsx); (4) submit dentro il `<form>` testid-ato anziché nel footer dello SlideOver (stabilità locator e2e); (5) l'annullamento lascia la riga con badge "Annullato" (conforme AC3, cambio visibile vs legacy che la rimuoveva); (6) assert 44px touch-target RIMOSSA dal test mobile (gli `.iconbtn` AirOps sono 26px per design — trade-off dichiarato, da scrutinare in review); (7) `list.table.instructor` chiave usata solo dalla colonna xlsx.
- **Verifica interattiva** (script Playwright throwaway, poi eliminati): approve/deny-con-motivo/riapri/effettuato/assente, annulla two-step, force-booking end-to-end, riga AOG, popover filtri e calendario, mobile 375px senza overflow, dark mode — tutti confermati con screenshot e ispezione risposte di rete.
- **Gates**: PASS (lint, typecheck, 1310/1310 unit, build). e2e completati dalla sessione principale su DB fresco (v. Review Record).

## Review Record (adversarial, Opus 4.8 xhigh — 2026-07-15)

**Verdetto**: fixes-required → fixed. Prima run full e2e CI-mode (build produzione, DB fresco): 191 pass / **16 fail** — tutte in bookings.spec.ts. Il reviewer ha separato empiricamente (re-run isolati su DB fresco + repro live): ~11 TEST rotti/fragili vs **3 bug di prodotto reali** + 1 giudizio di dominio. Audit inventario test: NESSUNA perdita di copertura (22→26 test, +4 workflow); l'app stessa funzionava (approve/deny+email/riapri/effettuato/assente/force→201 tutti guidati live dal reviewer).

**Findings e risoluzione (fix del subagent dedicato, commit 5ea86b0):**
- **F1 (blocker, FIXED)**: 10 test create/edit riscritti non aprivano MAI lo SlideOver (`new-booking-button`) — pannello chiuso = `aria-hidden` = submit fuori dall'albero a11y → timeout. Aggiunto il click di apertura; l'apertura ha SMASCHERATO 3 bug pre-esistenti dei test (scrim che intercetta il click post-create → Escape; accessible-name del select Allievo concatenato dalle option per il label-wrapping di `Field` → selettore by-name SOLO nel test; `toBeDisabled()` inaffidabile su `<option>` → `toHaveAttribute('disabled','')`).
- **F2 (major, FIXED)**: crosstalk rotto — i Link di paginazione perdevano `?view/?date` e il toggle giorno/settimana era `<button>` senza href. Ora la paginazione porta view/date non-default (pageHref speculare a calendarHref) e il toggle è `<a>` locale-prefixed (CSS `.segmented` esteso agli anchor).
- **F3 (major, FIXED)**: il pilota non poteva annullare la PROPRIA prenotazione PENDING (Annulla renderizzato solo su APPROVED; il backend lo permetteva già). Ora Annulla su own-row PENDING|APPROVED.
- **F4 (major, FIXED)**: `formError` dell'EditBookingForm sopravviveva tra righe diverse (chiuso→riaperto su B mostrava il 409 di A). Clear su ogni chiusura + su cambio booking (adjust-state-during-render, niente effect).
- **F5 (minor, FIXED)**: `setupPendingBookingAsStaff` senza clearCookies (redirect da /login già autenticati); test fragili su DB sporco → helper `findBookingRow` page-indipendente (walk ?page=N via goto diretto), giorni run-unique, week-count scopato per aeromobile, re-locate della riga dopo OGNI mutazione, timeout 60s sul test doppio-ciclo.
- **F6 (minor, FIXED)**: titoli stantii rinominati (44px rimosso; "resta in lista come Annullato, assente dal calendario").
- **F7 (RATIFICATO UTENTE → FIXED)**: finestra lista = **now − 48h** (Effettuato/Assente marcabili dopo l'atterraggio per 2 giorni; prima la riga spariva a slot concluso). Export allineato a listFrom+status della lista. Nota dichiarata: il conteggio "N in attesa" resta ancorato a now (fuori dal perimetro ratificato — eventuale allineamento su richiesta).
- **F8 (note, FIXED)**: `model` aggiunto ad `AircraftOption`, cast `as ScheduleAircraftRow[]` rimosso.

**Verifica finale**: gates verdi (1310 unit) e full suite CI-mode **207/207 su DUE run consecutive a DB fresco** (7.8m / 7.0m). Nota ambiente: MCP Playwright rotto in locale (path container) — verifica interattiva sostituita da script Playwright diretti + suite (workaround sanzionato, v. HANDOFF).
