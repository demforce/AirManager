---
baseline_commit: 4a79b2a
---

# Story 11.1: Campi logbook e durata derivata

Status: ready-for-dev

## Story

As a staff,
I want registrare per ogni volo aeroporti e orari reali di decollo e atterraggio,
so that il registro sia un logbook fedele e la durata non sia più un dato battuto a mano (FR-43; epics.md «Epic 11», change-request-flight-log-2026-07-10.md — decisioni RATIFICATE dall'utente).

## Acceptance Criteria

1. **Given** il form di registrazione volo, **When** lo apro, **Then** partenza e arrivo sono precompilati col nome dell'aviosuperficie (settings `airfield.name` via `getAirfieldBranding()`, fallback `'AirManager'` già nel service) e decolli/atterraggi valgono 1.
2. **Given** data del volo + orario di decollo + orario di atterraggio (input `type="date"` + due `type="time"` HH:MM), **When** compilo il form, **Then** la durata è mostrata auto-calcolata (`formatMinutes`, read-only) come atterraggio−decollo; se atterraggio ≤ decollo l'atterraggio è interpretato come giorno successivo (attraversamento mezzanotte). L'addebito usa ESATTAMENTE quella durata: pro-rata, pacchetti e importo istruttore INVARIATI a parità di `minutes`.
3. **Given** un volo nuovo via API, **Then** il body richiede `departureAirfield`/`arrivalAirfield` (stringhe non vuote) e `takeoffAt`/`landingAt` (`z.iso.datetime()`, ISO 8601 UTC — AD-8, pattern bookings); `flightDate` e `minutes` NON sono più input: il server deriva `flightDate` = giorno di `takeoffAt` in Europe/Rome (`dateOnlyInZone`) e `minutes` = differenza in minuti (arrotondata, ≥ 1). 422 `FLIGHT_TIMES_INVALID` se `landingAt ≤ takeoffAt` o durata > 1440; resta 422 `FLIGHT_DATE_IN_FUTURE` sulla data DERIVATA.
4. **Given** la migrazione, **Then** i voli storici restano validi: colonne nuove nullable (`departureAirfield`, `arrivalAirfield`, `takeoffAt`, `landingAt`); `landings` è backfillato NULL→1 e diventa NOT NULL DEFAULT 1; nasce `takeoffs` INT NOT NULL DEFAULT 1. Nessun dato esistente perso o alterato oltre al backfill.
5. **Given** un volo annullato, **When** lo correggo (form o `POST /[id]/correct`), **Then** la correzione richiede gli stessi campi logbook, prefillati dall'originale quando presenti (originale storico senza orari → campi vuoti da compilare).
6. Il contaore resta alimentato dai `minutes` derivati (FR-9 invariato); `hourMeterStart/End` restano input OPZIONALI in coppia (solo informativi — mai più sorgente della durata): 422 `HOUR_METER_INVALID` se coppia incompleta o end ≤ start. I DTO di lista/breakdown espongono i campi nuovi sul wire (`takeoffAt`/`landingAt` ISO datetime, aeroporti string|null, `takeoffs`/`landings` int).

## Contesto e decisioni di design (vincolanti)

- **Schema Prisma** (`Flight`, schema.prisma:788-880): `departureAirfield String?`, `arrivalAirfield String?`, `takeoffAt DateTime?`, `landingAt DateTime?`, `takeoffs Int @default(1)`, `landings Int? → Int @default(1)`. Migrazione HAND-WRITTEN `*_add_flight_logbook_fields` col pattern backfill di `20260709120000_add_booking_expiry_block/migration.sql` (ADD COLUMN + commento rationale + UPDATE + SET NOT NULL); deve ordinare DOPO `20260710120000`.
- **Zod** (`src/lib/schemas/flights.ts`): in `registerFlightSchema` RIMUOVERE `flightDate` e `minutes` e l'intero `superRefine` minutes-XOR-hourMeter (:81-129); aggiungere `departureAirfield`/`arrivalAirfield` (`z.string().trim().min(1).max(120)`), `takeoffAt`/`landingAt` (`z.iso.datetime()`), `takeoffs`/`landings` (`z.number().int().min(0).max(500).optional()` — default 1 AL PUNTO D'USO nel service, MAI `.default()` Zod: lezione 10.1 sui call-site server-side). Confronti tra istanti con `new Date(a).getTime()` (pattern `bookings.ts:33-51`, MAI string-compare). `correctFlightSchema` = `.extend({ reason })` invariato come meccanica. `flightListItemSchema` e la zona breakdown: aggiungere i campi wire nuovi.
- **Service** (`flights.service.ts`): in `resolveFlightInput` (:392-519) sostituire i rami flightDate/minutes (:435-454): `takeoffAt/landingAt = new Date(...)`; `FLIGHT_TIMES_INVALID` (ValidationError nuova) se `landingAt ≤ takeoffAt` o `minutes > 1440`; `minutes = Math.round((landingAt−takeoffAt)/60000)` con minimo 1 (durata < 30s → arrotonda a 0 → 422); `flightDate = parseDateOnlyUtc(dateOnlyInZone(takeoffAt, APP_TIMEZONE))` — il giorno ROMA, non UTC (decollo 00:30 Roma = 22:30Z del giorno prima: il logbook deve dire il giorno di Roma). Regola not-in-future ESISTENTE applicata alla data derivata (codice `FLIGHT_DATE_IN_FUTURE` invariato). `HOUR_METER_INVALID` resta per la coppia contaore (ora solo-informativa; end−start NON deve più coincidere con minutes — divergenza legittima motore vs blocchi, NIENTE validazione incrociata). Threading: `ResolvedFlightInput` → `RegisterFlightCoreInput` (:521-553) → `Flight.create` (:660-682) → `FLIGHT_SELECT` (:223-263) + `SelectedFlight` (:265-291) + `FlightListItem` (:186-214) + `toListItem` (:302-349). `registerFlight` :825 e `correctFlight` :1151 passano i campi nuovi (default `takeoffs/landings ?? 1`).
- **Addebito INVARIATO**: `registerFlightCore` (:591-739) non cambia di UNA riga nella logica di pricing/pacchetti/contaore — riceve `minutes` già risolto come oggi. Le transazioni FOR UPDATE (:774-853, :1060-1173) NON si toccano.
- **Form** (`flights-manager.tsx`): eliminare il toggle `durationMode` (:1030, :1120-1136, :1389-1429) e l'input Minuti; nuovi campi RHF string-based nello `flightFormSchema` locale (:949-957): `flightDate` (resta, = data di decollo), `takeoffTime`/`landingTime` (`type="time"`), `departureAirfield`/`arrivalAirfield` (text), `takeoffs` (number). Composizione istanti al submit col PATTERN BOOKINGS (`new-booking-form.tsx:255-256`): `new Date(\`${flightDate}T${takeoffTime}\`)` → `.toISOString()` (wall-time del browser; per l'atterraggio, se ≤ decollo, comporre su `flightDate`+1 — riusare/derivare `addDaysDateOnly` da `zoned-time` NON è importabile client-side se server-only: fare l'addizione sul Date object locale). Durata visualizzata live con `formatMinutes` quando entrambi gli orari sono validi. Contaore: due input opzionali senza radio/mode. Prefill correzione: estendere `flightFormDefaults` (:962-983) — da `takeoffAt` ISO ricavare date/time LOCALI del browser (coerente con la composizione); originale senza orari → stringhe vuote.
- **Prefill aeroporti** (AC 1): `flights/page.tsx` (server component) chiama `getAirfieldBranding()` (`app-settings.service.ts:164-174`, NESSUN gate — già così per i PDF) e passa `branding.name` come nuova prop a `FlightsManager`; il form la usa come default di entrambi i campi SOLO in registrazione (in correzione vince il prefill dall'originale, se presente).
- **i18n**: nuove chiavi in `FlightsPage.form` (departure/arrival/takeoffTime/landingTime/takeoffs/computedDuration) + `errors.FLIGHT_TIMES_INVALID`, in ENTRAMBI `messages/it.json` (:890+) e `messages/en.json`, wiring in `flights/page.tsx:270-401` E nel tipo `FlightsManagerLabels` (:99-226) — TUTTI E TRE i punti o il typecheck fallisce.
- **OpenAPI**: si rigenera dagli schema Zod (`zod-with-openapi`) — nessun edit manuale; il POST /flights cambia contratto (breaking DELIBERATO, ratificato: nessun consumer esterno prima dell'app Flutter).
- **Fuori scope (dichiarato)**: colonne nuove nella TABELLA registro e date DD/MM/YYYY (story 11.2); export xlsx/pdf (story 11.3); colonna PIC (11.2); qualsiasi cambio a bookings; seed (non crea voli).

## Tasks / Subtasks

- [ ] **T1 (AC 4)** — Schema Prisma + migrazione hand-written con backfill `landings` NULL→1; `npx prisma migrate dev` su DB locale; verifica con un volo pre-esistente fittizio (INSERT prima della migrazione in un test manuale o assert nel review).
- [ ] **T2 (AC 2, 3, 6)** — Zod schemas (register/correct/list-item/breakdown) + `resolveFlightInput` (derivazione minutes/flightDate, `FLIGHT_TIMES_INVALID`, hourMeter informativo) + threading fino a `toListItem`. Unit test: derivazione Roma-day vs UTC-day (decollo 00:30 Europe/Rome), attraversamento mezzanotte, durata 0 → 422, cap 1440, giorno DST (2026-03-29), addebito invariato a parità di minutes, contaore avanzato dei minutes derivati, correzione con campi nuovi.
- [ ] **T3 (AC 1, 2, 5)** — Form: campi nuovi, durata computata live, rimozione durationMode, prefill branding (page.tsx + prop) e prefill correzione; i18n IT/EN nei tre punti. Verifica interattiva Playwright MCP (workaround credenziali sanzionato se il guard blocca il login).
- [ ] **T4 (AC tutti)** — e2e: aggiornare `flight-log.spec.ts` (helper `registerFlight` API → takeoffAt/landingAt/aeroporti), `flight-reversal.spec.ts` (form + API), `flights.spec.ts` (fill orari al posto di Minuti/contaore-mode; test "contaore deriva minuti" → sostituito da "orari derivano durata"; test HOUR_METER_INVALID → coppia incompleta/end≤start su campi ora opzionali). Aggiungere: registrazione con atterraggio oltre mezzanotte, 422 FLIGHT_TIMES_INVALID via API.
- [ ] **T5** — `npm run gates`; Dev Agent Record + File List in questo file; sprint-status `11-1` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; story con UI (form): `design-taste-frontend` + `ui-ux-pro-max` + coerenza `minimalist-ui` (il form esiste già — MODIFICA chirurgica, niente redesign); verifica Playwright MCP.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`; MAI eseguire i 4 comandi verbosi separatamente.
- UN commit di implementazione (`Story 11.1: ...`); `git commit --amend --no-edit --reset-author`; NON pushare.
- Baseline attesa pre-story: 192 e2e / 1207 unit / 29 migrazioni (dopo T1: 30). Flake noti: `ppr-register:206` (~1 run su 2-3), `cash-report` ECONNRESET sotto load.
- Utenti seed: admin@ / staff@ / pilot@ / instructor@ / student@airmanager.local (password SEED_ADMIN_PASSWORD — MAI materializzarla nel transcript).
- ATTENZIONE regressioni non ovvie: `exports.service.ts` legge le righe di `listFlights` (:221-249 xlsx, :516-556 pdf) — le colonne export NON cambiano in questa story ma il DTO sì: verificare che compili e che l'export resti verde negli e2e. Idem breakdown panel (risposta POST) e `home-dashboard` widget "ultimi voli".
- Selettori e2e: convenzione post-103-F1 — scope al landmark o `exact: true`, MAI `getByRole('link',{name})` page-level substring.

### Project Structure Notes

- File toccati attesi: `prisma/schema.prisma`, `prisma/migrations/<ts>_add_flight_logbook_fields/migration.sql` (nuova), `src/lib/schemas/flights.ts`, `src/server/services/flights.service.ts` (+ test), `src/app/[locale]/dashboard/flights/flights-manager.tsx`, `src/app/[locale]/dashboard/flights/page.tsx`, `messages/it.json`, `messages/en.json`, `e2e/flight-log.spec.ts`, `e2e/flight-reversal.spec.ts`, `e2e/flights.spec.ts`.
- NESSUNA env var nuova, nessun servizio nuovo, nessuno step CI nuovo (env contract invariato).

### References

- [Source: _bmad-output/planning-artifacts/epics.md «Story 11.1»; change-request-flight-log-2026-07-10.md (decisioni ratificate: durata SEMPRE derivata, campi obbligatori sui voli nuovi, PIC mai memorizzato)]
- [Source: prisma/schema.prisma:788-880 (Flight); prisma/migrations/20260709120000_add_booking_expiry_block/migration.sql (pattern backfill); 20260710120000_rename_flight_types_add_solo_flag (precedente hand-written)]
- [Source: src/lib/schemas/flights.ts:63-130 (registerFlightSchema + superRefine da rimuovere), :251-253 (correct), :182-207 (list item); src/lib/schemas/bookings.ts:33-51 (pattern z.iso.datetime + refine su istanti); src/lib/schemas/common.ts (AD-8)]
- [Source: src/server/services/flights.service.ts:392-519 (resolveFlightInput; :435-438 not-in-future, :440-454 minutes/hourMeter da sostituire), :521-553 (RegisterFlightCoreInput), :591-739 (core INVARIATO; :660-682 create), :774-853 (registerFlight), :1060-1173 (correctFlight), :223-349 (SELECT/DTO/toListItem)]
- [Source: src/lib/zoned-time.ts (dateOnlyInZone :165, zonedMidnightUtc); src/lib/date-only.ts (parseDateOnlyUtc, todayDateOnlyUtc); src/lib/time.ts (formatMinutes, APP_TIMEZONE)]
- [Source: src/server/services/app-settings.service.ts:164-174 (getAirfieldBranding senza gate)]
- [Source: src/app/[locale]/dashboard/flights/flights-manager.tsx:949-995 (flightFormSchema/defaults), :1030 (durationMode), :1106-1209 (onSubmit), :1229-1442 (campi), :99-226 (labels type); flights/page.tsx:270-401 (wiring labels); bookings/new-booking-form.tsx:255-256 (composizione istanti)]
- [Source: e2e/flight-log.spec.ts:167-172 (helper API), e2e/flight-reversal.spec.ts:194-199/:283-294/:323, e2e/flights.spec.ts:238-276 (test contaore→minuti da sostituire)]
- [Source: messages/it.json:890-1027 (FlightsPage); exports.service.ts:221-249/:516-556 (superfici a rischio regressione compilazione)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
