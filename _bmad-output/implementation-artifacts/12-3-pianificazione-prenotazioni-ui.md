---
baseline_commit: 5ebe87f
---

# Story 12.3: Pianificazione + Prenotazioni — UI AirOps

Status: ready-for-dev

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
