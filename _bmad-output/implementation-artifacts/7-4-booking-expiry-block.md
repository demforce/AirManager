---
baseline_commit: 9d7442a
---

# Story 7.4: Blocco prenotazione per scadenze critiche

Status: done

## Story

As a gestore,
I want che chi ha medica o licenza scadute non possa prenotare,
so that nessuno voli irregolare (FR-21).

## Acceptance Criteria

1. **Given** un pilota con visita medica o licenza scaduta, **When** tenta di prenotare, **Then** 422 con messaggio che indica il documento scaduto; con rating scaduto (es. SEP) la prenotazione passa ma mostra un warning.
2. **Given** il permesso staff, **When** forza una prenotazione bloccata, **Then** la forzatura riesce e resta tracciata (chi, quando, motivo).

## Contesto e decisioni di design (vincolanti)

- **"Critico" è un attributo del TIPO di scadenza**: nuovo campo `blocksBooking Boolean @default(false)` su `ExpiryType` (FR-21 `[ASSUMPTION]` PRD: blocco su medica/licenza, warning su rating). Backfill nella MIGRAZIONE SQL (a mano, dopo l'ADD COLUMN): `UPDATE "ExpiryType" SET "blocksBooking" = true WHERE "name" IN ('Visita medica classe 1', 'Visita medica classe 2', 'Visita medica LAPL', 'Licenza');` — i nomi ESATTI del seed 6.1. Il seed (`STANDARD_EXPIRY_TYPES`) aggiunge `blocksBooking` ai create dei 4 tipi bloccanti mantenendo `update: {}` (le scelte admin non si sovrascrivono — pattern seed esistente). L'admin può cambiare il flag dal manager tipi (`settings.manage`): checkbox nel form create/edit di `types-manager.tsx` + badge "Blocca prenotazioni" in lista + estensione degli schemi Zod/registry dei tipi.
- **La regola guarda LA DATA DEL VOLO, non oggi**: un documento è bloccante/warning se `expiresAt < <giorno del volo>` dove il giorno del volo = date-only di `startsAt` in Europe/Rome. Coerente con l'idoneità pacchetti 5.2 (`expiresAt >= flightDate` = valido: il giorno di scadenza stesso è ancora valido) e strettamente più corretto del confronto con oggi (prenotare per dopodomani con la medica che scade stanotte DEVE bloccare). NUOVO helper puro `dateOnlyInZone(instant: Date, timeZone: string): string` in `src/lib/zoned-time.ts` (estrae anche la data, non solo hour/minute — `todayDateOnlyInZone` diventa/resta il caso `instant = now`; unit test CET/CEST/mezzanotte a cavallo). Confronto tra date-only string/UTC-midnight Date come in 5.2 — MAI istanti con time-of-day contro `@db.Date` (lezione 3.5 F1).
- **Documento ASSENTE ≠ scaduto**: si bloccano/segnalano SOLO `Expiry` REGISTRATE con `expiresAt` oltrepassata (FR-21 dice "scaduta" — un allievo senza riga "Licenza" non è bloccato; l'enforcement dei requisiti mancanti è fuori scope, il quadro reale lo tiene lo staff con la dashboard 6.4).
- **Dove si applica: SOLO `createBooking`** (FR-21 letterale: "blocca la NUOVA prenotazione"). `updateBooking` NON ri-valuta le scadenze — deferral dichiarato (loophole accettato per l'MVP: nessun ricontrollo esiste comunque tra creazione e volo; l'enforcement reale al volo è della registrazione voli/SM-3): doc-comment in `updateBooking` + voce nei deferred del handoff.
- **Semantica del blocco (AC 1)**: dopo i check persona esistenti (e PRIMA della tx col lock — le scadenze non partecipano all'invariante overlap), `createBooking` carica le `Expiry` della persona TARGET (`booking.personId` — vale anche per l'allievo di una prenotazione scuola e per il target dello staff, il documento scaduto è di chi vola) con `include type`, filtra le scadute alla data del volo: se ≥1 con `type.blocksBooking` → 422 `ValidationError(message, { documents: [{ typeName, expiresAt }] }, 'EXPIRED_DOCUMENTS')` col message inglese che ELENCA i nomi dei tipi scaduti (AC: "messaggio che indica il documento scaduto"); le scadute NON bloccanti diventano `warnings: [{ typeName, expiresAt }]` restituite nel RISULTATO della creazione riuscita.
- **Risposta di `createBooking` cambia forma**: da `BookingListItem` a `{ booking: BookingListItem, warnings: BookingExpiryWarning[] }` (additivo per il client: la route 201 risponde col nuovo envelope; aggiornare lo schema OpenAPI della POST e i consumer — `new-booking-form.tsx` legge `body.booking`/`body.warnings`; gli e2e/unit esistenti che leggono l'item vanno adeguati e DICHIARATI nel Debug Log). NIENTE campo warnings persistito: è un esito della richiesta.
- **Forzatura staff (AC 2)**: `createBookingSchema` + `force: z.boolean().optional()`, `forceReason: z.string().trim().min(1).max(500).optional()` con refine "forceReason richiesto se force" (422). Nel service: `force: true` con actor SENZA `bookings.manage.any` → 403 `ForbiddenError('Only staff can force a blocked booking.')` (own-path non forza MAI); con staff: il check bloccante viene BYPASSATO e la prenotazione nasce con i nuovi campi di tracciamento su `Booking`: `forcedAt DateTime?`, `forcedByUserId String?` + FK `User?` `@relation("BookingForcedBy")` (back-relation `User.bookingsForced`), `forceReason String?` — STAMPATI SOLO se c'era davvero un blocco da scavalcare: `force: true` senza documenti bloccanti crea normalmente SENZA stampare nulla (doc-comment: il tracking dice "ha scavalcato un blocco", non "ha spuntato una checkbox"); i warning non-bloccanti restano warning anche nel force. Flusso UI: il form riceve il 422 `EXPIRED_DOCUMENTS` → per `canManageAny` appare la sezione "Forza prenotazione" (motivo obbligatorio + submit con `force`) → 201; per gli altri solo il messaggio coi documenti.
- **Il calendario/lista NON cambiano** (una prenotazione forzata si vede come le altre; mostrare il badge "forzata" è un non-goal — il tracking è in DB, lo staff lo vede se serve via dati). Nessuna modifica a 7.2/7.3 UI oltre al form creazione.

## Tasks / Subtasks

- [x] Task 1: Modello + migrazione + seed (AC 1/2)
  - [x] `ExpiryType.blocksBooking Boolean @default(false)` (doc-comment FR-21); `Booking.forcedAt/forcedByUserId/forceReason` + FK/relazione nominata + back-relation `User.bookingsForced`; migrazione `prisma/migrations/20260709120000_add_booking_expiry_block/migration.sql` (diff a mano + UPDATE di backfill dei 4 tipi bloccanti coi nomi esatti del Contesto, banner rimosso); `prisma/seed.ts`: `STANDARD_EXPIRY_TYPES` con `blocksBooking` (create-only, `update: {}` invariato); `npx prisma migrate deploy` + `generate`; verifica in psql del backfill (4 righe true, 2 false).
- [x] Task 2: Helper + service (AC 1/2)
  - [x] `src/lib/zoned-time.ts`: `dateOnlyInZone(instant, timeZone)` puro (refactor: `todayDateOnlyInZone` lo riusa) + unit test (istante serale UTC che cade nel giorno DOPO a Roma; CET vs CEST; invarianza del comportamento esistente di `todayDateOnlyInZone`).
  - [x] `bookings.service.ts#createBooking`: dopo i check persona, `flightDateOnly = dateOnlyInZone(startsAt, APP_TIMEZONE)`; fetch `expiry.findMany({ where: { personId }, include: { type: ... } })` (campi minimi); scadute = `toDateOnlyString(expiresAt) < flightDateOnly`; bloccanti → 422 `EXPIRED_DOCUMENTS` (message coi nomi, details coi documenti) SALVO force staff valido; non bloccanti → `warnings`. `force` senza `manage.any` → 403 PRIMA di ogni query scadenze. Return type `{ booking, warnings }`; stamp force fields solo-se-bypass (Contesto). Ordine complessivo: authorize → own-rules → force-403 → persona (404/409/422) → **scadenze (422/force)** → `BOOKING_IN_PAST` → tx lock/overlap/create.
- [x] Task 3: API + OpenAPI (AC 1/2)
  - [x] `schemas/bookings.ts`: `createBookingSchema` + `force`/`forceReason` con refine; nuovo `createBookingResponseSchema = { booking: bookingItemSchema, warnings: z.array({ typeName, expiresAt }) }`; item schema Booking + `forcedAt` nullable (esporre il tracking in lettura è gratis e utile alla PR review — `forceReason`/`forcedByUserId` NO, restano DB-only per ora, doc-comment). Registry: POST /bookings response aggiornata (401,403,404,409,422 invariati); schemi tipi scadenza (`expiry-types`): `blocksBooking` su create/update/item. `registry.test.ts`.
- [x] Task 4: UI (AC 1/2) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [x] `new-booking-form.tsx`: gestione 422 `EXPIRED_DOCUMENTS` (messaggio coi nomi dei documenti dai details); per `canManageAny` sezione "Forza prenotazione" condizionale (motivo obbligatorio, submit con force, annulla che torna al form pulito dallo stato force); successo con `warnings` → banner `role="status"` di variante warning (palette amber esistente `#FBF3DB`/`#956400`) che elenca i documenti in warning; successo senza warnings invariato.
  - [x] `types-manager.tsx` (+ pagina tipi): checkbox "Blocca prenotazioni" su create/edit + badge in lista; errori/i18n coerenti.
  - [x] i18n `messages/{it,en}.json` simmetrici: `BookingsPage.form.errors.EXPIRED_DOCUMENTS` (con interpolazione lista), `BookingsPage.form.force.*`, `BookingsPage.form.warnings.*`, `ExpiryTypes*.blocksBooking.*`.
- [x] Task 5: Test (AC 1/2)
  - [x] Unit `bookings.service.test.ts`: pilota con medica scaduta (tipo bloccante) → 422 `EXPIRED_DOCUMENTS` con typeName nel message e nei details; rating scaduto (non bloccante) → 201 con `warnings` popolati e senza force stamp; entrambi → 422 (il blocco vince) e i warning NON compaiono nei details del 422 (solo i bloccanti — decisione: details = SOLO documenti bloccanti); documento assente → nessun blocco; **boundary data volo**: `expiresAt` == giorno del volo → VALIDO (niente blocco/warning), giorno prima → scaduto; scadenza scaduta oggi ma volo... (già coperto dal boundary); prenotazione scuola: scadenza dell'ALLIEVO target blocca l'istruttore che prenota; staff senza force → 422; staff con force+motivo → 201 con `forcedAt/forcedByUserId/forceReason` stampati; staff force senza motivo → 422 (refine); pilota con force → 403 prima delle query scadenze; force senza blocco → 201 senza stamp; ordine: scadenze valutate PRIMA di `BOOKING_IN_PAST`? NO — decisione da rispettare: l'ordine del Contesto (scadenze PRIMA di BOOKING_IN_PAST) va asserito con un caso combinato; `dateOnlyInZone` boundary (21:30Z estivo = giorno dopo a Roma → flight date corretta).
  - [x] Unit tipi: schema `blocksBooking` su create/update, default false.
  - [x] e2e `bookings.spec.ts` esteso (run-unique; riusare gli helper esistenti + `expiries` API di 6.2 per registrare le scadenze: staff `POST /api/v1/expiries`): pilota run-unique con login e medica scaduta (tipo bloccante run-unique creato via API tipi con `blocksBooking: true`, scope ALL per semplicità) → form UI → errore coi nomi del documento; stesso pilota con SOLO un tipo warning run-unique scaduto → prenotazione creata + banner warning visibile; admin sul form per la stessa persona bloccata → 422 → sezione Forza → motivo → 201 e riga in lista (verifica `forcedAt` via API GET? il campo è nell'item → assert non-null se esposto); pilota tenta force diretto via API → 403 envelope; boundary: scadenza `expiresAt` = giorno del volo → si prenota senza warning.
- [x] Task 6: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `7-4-booking-expiry-block: review`, tutto NEL commit di implementazione.

## Dev Notes

- **Perimetro**: SOLO il blocco/warning/forzatura alla CREAZIONE prenotazione + flag sul catalogo tipi. NIENTE ricontrollo su edit (deferral dichiarato, doc-comment), NIENTE badge "forzata" in lista/calendario, NIENTE blocco su registrazione voli (dominio epic 5, fuori scope), NIENTE nuove email.
- **Riuso epic 6 (nota handoff)**: la semantica "il giorno di scadenza è ancora valido" è quella di `computeExpiryStatus`/5.2 — qui la data di riferimento è il GIORNO DEL VOLO, quindi il confronto è diretto su date-only (`toDateOnlyString` di `date-only.ts` per l'`expiresAt` `@db.Date`), NON via `computeExpiryStatus` (che è ancorato a oggi — doc-comment che spiega perché non lo si riusa qui). `EXPIRY_WARNING_DAYS`/stato `expiring` NON c'entrano: il warning di 7.4 è "scaduto ma non bloccante", non "in scadenza".
- **AD-5**: authorize/own/force checks prima di ogni query; **AD-8**: codice stabile `EXPIRED_DOCUMENTS`, details strutturati, message inglese; **AD-1**: la UI consuma la stessa API.
- **ATTENZIONE consumer esistenti di `createBooking`**: il cambio di return type tocca `new-booking-form.tsx`, gli unit test 7.1/7.3 (fixture CREATED_BOOKING_ROW ecc.) e ogni e2e che legge il body della POST — aggiornarli e DICHIARARLI nel Debug Log. La route resta 201.
- **Lezioni review da rispettare**: istanti-non-stringhe (N1 7.1) nei refine nuovi; niente regressioni su F1/F2 7.2 (page.tsx non si tocca qui se non serve) e sull'atomicità 7.3; osservabili run-unique negli e2e (F1 6.3) — i TIPI scadenza degli e2e devono essere run-unique (il catalogo è condiviso e i test girano in parallelo: MAI riusare 'Licenza' del seed nei test, si inquinerebbero a vicenda); 404→409→422 senza state leak; i18n simmetrica contata; `.max()` su stringhe.
- **Il dev agent NON può resettare il DB** (arriva fresco); PRIMA del run e2e di gate: `curl localhost:3000` DEVE fallire (altrimenti `fuser -k 3000/tcp`). Classi flaky note (epic 5 + volume): procedura invariata.
- **Skill UI obbligatorie (regola utente)**: `design-taste-frontend` E `ui-ux-pro-max` (query es. `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form warning banner destructive action confirm"`); coerenza `minimalist-ui`; verifica interattiva Playwright MCP (blocco coi nomi, warning banner, flusso force staff, checkbox tipi) PRIMA degli e2e.
- **Ambiente**: Mailpit :8025/:1025; build SEMPRE `env -u NODE_ENV npx next build`; MAI `playwright install`.
- **Gate**: lint 0 errori (warning benigno noto), typecheck, `npx vitest run` (≥ 893 + nuovi), build, `npx playwright test` (≥ 123 + nuovi).
- Un commit di implementazione (`Story 7.4: <sintesi>`, nessun riferimento AI/modello), NON push. Verificare `git status` (branch `claude/handoff-resume-gcly8l`) prima del commit.
- **Questa è l'ULTIMA story dell'epic**: dopo la review, la sessione principale farà handoff + chiusura PR — nessuna azione extra richiesta al dev.

### Project Structure Notes

- Modifiche: `prisma/schema.prisma` + migrazione + `prisma/seed.ts`, `src/lib/zoned-time.ts`(+test), `bookings.service.ts`(+test), `schemas/bookings.ts`, `schemas/expiry-types.ts` (o dove vivono gli schemi tipi), `registry.ts`(+test), `new-booking-form.tsx`, `dashboard/expiries/types/types-manager.tsx`, `messages/{it,en}.json`, `e2e/bookings.spec.ts` (+ eventuale `expiry-types.spec.ts` per la checkbox).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#4.6 FR-21 + §379 assumption + SM-3]
- [Source: docs/handoffs/HANDOFF.md#Next Steps 4] — riuso dominio scadenze epic 6, tipi critici = medica/licenza da PRD
- [Source: _bmad-output/implementation-artifacts/6-1-expiry-types.md, 6-2-expiry-registration.md] — catalogo tipi, semantica expiresAt/date-only, seed idempotente
- [Source: prisma/seed.ts#STANDARD_EXPIRY_TYPES ~170-176] — nomi esatti per il backfill
- [Source: src/server/services/bookings.service.ts#createBooking] — ordine verifiche esistente da estendere
- [Source: src/lib/date-only.ts#toDateOnlyString, src/lib/zoned-time.ts] — confronti date-only, helper zona
- [Source: src/server/services/packages.service.ts / 5.2] — precedente `expiresAt >= flightDate` (il giorno stesso è valido)
- [Source: src/app/[locale]/dashboard/expiries/types/types-manager.tsx] — manager tipi da estendere

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev subagent, extra-high effort, via `bmad-dev-story`). This run RESUMED a prior dev-agent run of the same story that was interrupted mid-implementation by a container restart; the resumed session inventoried and verified the partial work already in the tree (it was correct and complete for Tasks 1-5's substance) before continuing with interactive verification, gate execution, and closing out the e2e-stability work below.

### Debug Log References

- **Module doc-comment fix**: `bookings.service.ts`'s "Creation matrix"/"Verification order" doc-comment (predates this story) still listed the OLD ordering (`authorize → own-rules → target person → BOOKING_IN_PAST → tx`) even though `createBooking`'s own doc-comment (added by this story) explicitly says "see the module doc-comment's ordine complessivo" for the force-403/scadenze steps. Updated the module comment to include both new steps in the correct position — inline with, not a change of, the actual (already-correct) code order.
- **`createBooking` response-shape migration — every consumer updated in this story, per Contesto's instruction to declare each one**:
  - `src/app/[locale]/dashboard/bookings/new-booking-form.tsx` — reads `body.booking`/`body.warnings` instead of the bare item.
  - `src/lib/schemas/bookings.ts` — new `createBookingResponseSchema`/`bookingExpiryWarningSchema`; `registry.ts`'s POST /bookings path now documents the new envelope.
  - `src/server/services/bookings.service.test.ts` — every existing `createBooking(...)` assertion changed from `result.id` to `result.booking.id` (7.1 own/staff/school paths, 7.3's cancelled-slot recreation test).
  - `e2e/bookings.spec.ts` — every existing direct `POST /api/v1/bookings` JSON-body read in the 7.3 describe block (`{ id }` → `{ booking: { id } }`, 4 call sites: single-booking recreate, cross-actor recreate, the two-booking concurrency race, the cancel-race setup booking).
- **E2E stability work (beyond the story's own scope, done to satisfy "le spec di questa story devono essere stabili")** — three iterations, each empirically verified before moving to the next:
  1. First full-suite run (129 tests) surfaced 12 failures, 2 of them in my own NEW tests (the warning-banner and staff-force tests) — both failing on `booking-row` visibility in "Prossime prenotazioni" after a successful creation.
  2. Root-caused via direct DB inspection (read-only `psql` — a DELETE was attempted to clean up one clearly-mislabeled test-debris row and was correctly BLOCKED by the sandbox's destructive-action classifier, confirming that path is closed and the right response is to document, not mutate): `listBookings`/the "Prossime prenotazioni" table orders `startsAt asc` GLOBALLY and shows only page 1 (`BOOKINGS_PAGE_SIZE = 20`); the shared `FUTURE_DAY` constant (2031-03-10, reused by every `createBooking` in this file across every session this long-lived, never-reset dev DB has ever run) had accumulated 60+ bookings, pushing anything dated there past page 1.
  3. First fix attempt (`uniqueFutureDay()`, a `Date.now() % 250`-derived offset day) still collided across repeated re-runs within the same session (a small modulo over milliseconds is not real entropy) — REPLACED with `Math.random()` over a wider window; this ALSO still failed, because the real constraint isn't "avoid one crowded day" but "outrank literally everything else in the GLOBAL sort", and this session's own repeated re-runs had by then scattered enough near-term bookings to blow past page 1 again on their own.
  4. Final fix: `soonestFutureSlot()` — a slot genuinely minutes from `Date.now()`, which (a) provably outranks every other booking in the table except other genuinely-imminent ones, and (b) self-cleans (`from: nowIso` drops it from the list once real time passes it, unlike a fixed/far date that accumulates forever). Verified stable across 3 consecutive isolated re-runs and clean inside the full-file run.
  5. A SEPARATE new failure then appeared in the force-flow test only: the staff-picked "Pilota o allievo" `<select>` (native, no search, capped at `OPTIONS_PAGE_SIZE = 100`, ordered `lastName asc`) no longer rendered the freshly-created pilot's option — root-caused to 169+ accumulated active `Person` rows (the exact same documented "volume flake" class 7.1's Dev Agent Record recorded for `people-management.spec.ts`, now crossing the threshold on THIS picker too). Fixed by adding an OPTIONAL `lastNamePrefix` parameter to the existing `createPilotPerson` helper (default unchanged — every other of its ~12 call sites across 7.1/7.3 is byte-for-byte unaffected) and passing an alphabetically-EARLY prefix (`'0Pilota'`) only from the new force-flow test, verified against Postgres's actual collation (`'0Pilota-x' < 'Allievo-x' < 'Pilota-x'`).
  - Net result: all 5 new `bookings.spec.ts` tests + the new `expiry-types.spec.ts` test are green and DETERMINISTIC (verified 3+ consecutive isolated runs, plus clean inside 2 different full-file runs). The remaining pre-existing 7.1/7.3 failures (below) are unrelated to this hardening and were left as-is — see Completion Notes/notesForReview for why they are out of this story's authority to fix.

### Completion Notes List

- Verified (did not re-derive from scratch) the pre-restart partial work against the story's binding Contesto/Tasks: migration backfill (psql-confirmed: exactly the 4 named types `true`, `Rating SEP`/`Inglese ICAO` `false`), seed create-only pattern, `dateOnlyInZone`/`todayDateOnlyInZone` refactor + boundary/CET/CEST unit tests, `createBooking`'s full check ordering (authorize → own-rules → force-403 BEFORE any further query → persona → scadenze/force → `BOOKING_IN_PAST` → tx), the force-stamp-only-on-real-bypass rule, the `{ booking, warnings }` response migration, the Zod schemas/registry/OpenAPI updates, and the UI (form force section, warning banner, types-manager checkbox+badge) — all matched the story file exactly; found and fixed one drift (the module doc-comment, see Debug Log) and completed the e2e-stability hardening above (Task 5 was substantively done but not yet proven stable).
- **Interactive Playwright MCP verification** (before the automated e2e run, per the mandatory UI skills instruction): logged in as admin, exercised (a) the types-manager "Blocca prenotazioni" checkbox/badge on the live catalogue, (b) a fresh pilot with a blocking expired document → red error banner naming the document, no force section (non-staff), (c) the SAME scenario as admin → error banner → "Forza prenotazione" section → validation on empty motivo → submit with motivo → green success banner → `forcedAt` non-null via API, (d) a fresh pilot with only a non-blocking expired document → amber warning banner naming it, booking created. All matched the Contesto exactly; screenshots reviewed, no console errors beyond a pre-existing, unrelated `pg` driver deprecation warning (reproduces on `/dashboard/bookings` independent of this story's diff — a Prisma/node-postgres library warning, not an application bug).
- **e2e stability hardening is scoped narrowly**: `soonestFutureSlot()` is used ONLY by the two new tests that needed it; `createPilotPerson`'s new parameter defaults to the exact prior behavior everywhere else. No pre-existing 7.1/7.2/7.3 test file logic was altered.
- **Known, root-caused, NOT-fixable-by-this-agent e2e failures (environmental, not regressions)** — present both before and after this story's diff, confirmed via direct DB inspection, explicitly out of reach because the sandbox correctly blocks destructive DB mutation and a full reset is forbidden by the story's own constraints:
  1. **Seed pilot (`pilot@airmanager.local` / "Piero Volante") carries a blocking expired document.** A `blocksBooking: true`-typed `Expiry` (name "MCP Bloccante Pilota mrcw7ht62", `expiresAt` 2020-06-01) is registered against the SHARED SEED PILOT, created by the PRIOR (pre-container-restart) dev-agent run's own interactive Playwright MCP verification — it used the shared seed account instead of a scratch person. Story 7.4's code is working exactly as specified (blocking a person with a genuinely registered, expired, blocking document) but this breaks every PRE-EXISTING 7.1/7.3 own-path test that books as `PILOT_EMAIL` and expects a plain 201 (`bookings.spec.ts:283/605/659/693`). A `DELETE FROM "Expiry"` for this one row was attempted and correctly BLOCKED by the sandbox's auto-mode classifier ("[Modify Shared Resources]... would clear if the user named this specific DB deletion"). **This needs either an explicit user-authorized single-row cleanup or a full DB reset before the next session; it will keep failing those 4 pre-existing tests until then.**
  2. **`OPTIONS_PAGE_SIZE`/list-pagination volume** (this session's DB has 169+ active `Person` rows and 80+ future `Booking` rows accumulated across every 7.1-7.4 dev+review session that has ever run against it, never reset) still intermittently affects OTHER pre-existing tests this story did not touch: `bookings.spec.ts:319` (person picker), `bookings.spec.ts:371` (list row visibility on the shared `FUTURE_DAY`). This is the SAME documented flaky class 7.1/7.2/7.3's own Dev Agent Records recorded for `people-management.spec.ts` — now also crossing the threshold on a second/third UI surface. Confirmed via 2 full-suite runs + repeated isolated `bookings.spec.ts`/`expiry-types.spec.ts` runs that ONLY pre-existing 7.1/7.3 tests are affected — zero occurrences of any NEW (7.4) test in any failure list, across every run.
  3. **Full-suite parallel run (129 tests, 2 workers): 108 passed / 21 failed.** Every failing spec file is one this story's diff never touches (`aircraft-management`, `aircraft-rates`, `aircraft-status-hours`, `expiry-registration`, `flight-log`, `flight-reversal`, `flights`, `package-consumption`, `people-management`, plus the `bookings.spec.ts` rows explained above) — this matches, file-for-file, the flaky class already documented in 7.1/7.2/7.3's own Dev Agent Records ("classe flaky epic 5 + volume: flights form-refresh, people-management sotto carico"), now more pronounced under 2 parallel workers straining the same long-lived, never-reset dev DB. `env -u NODE_ENV npx next build` and `npx vitest run` (927/927) show zero issues — this is exclusively an e2e/data-volume phenomenon.
- Deferred (declared, not implemented, per Contesto): `updateBooking` does NOT re-evaluate expiries (doc-commented on both the module and the function); no "forzata" badge on the list/calendar (non-goal); no enforcement of MISSING documents (only registered+expired ones block/warn).

### File List

- `prisma/schema.prisma`
- `prisma/migrations/20260709120000_add_booking_expiry_block/migration.sql`
- `prisma/seed.ts`
- `src/lib/zoned-time.ts`
- `src/lib/zoned-time.test.ts`
- `src/lib/schemas/bookings.ts`
- `src/lib/schemas/expiry-types.ts`
- `src/lib/schemas/registry.ts`
- `src/lib/schemas/registry.test.ts`
- `src/server/services/bookings.service.ts`
- `src/server/services/bookings.service.test.ts`
- `src/server/services/expiry-types.service.ts`
- `src/server/services/expiry-types.service.test.ts`
- `src/app/[locale]/dashboard/bookings/new-booking-form.tsx`
- `src/app/[locale]/dashboard/bookings/page.tsx`
- `src/app/[locale]/dashboard/expiries/types/types-manager.tsx`
- `src/app/[locale]/dashboard/expiries/types/page.tsx`
- `messages/it.json`
- `messages/en.json`
- `e2e/bookings.spec.ts`
- `e2e/expiry-types.spec.ts`
- `_bmad-output/implementation-artifacts/7-4-booking-expiry-block.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial via `bmad-code-review`, priorità zero sul full-suite e2e su DB fresco (che ha eliminato alla radice il detrito della sessione pre-riavvio). **Verdict: clean-pass — ZERO finding.**

- **Analisi regressione e2e (priorità zero)**: full suite su DB fresco = **121/129**, con TUTTE le 25 superfici della story verdi (`bookings.spec.ts` 21/21, `expiry-types.spec.ts` 4/4 — inclusi i 6 test 7.1/7.3 che nella sessione dev fallivano per il detrito del pilota seed, spariti col reset). Gli 8 fail (flights x3 incl. :210 baseline, flight-reversal, package x2, people-management x2) sono TUTTI in file fuori dal blast radius del diff (`git diff --stat` lo prova) e riconducibili alle classi baseline documentate: package-sale:112 passa in isolamento (load flake), people-management è il volume-pagination flake noto (71 persone accumulate DAL run stesso). **Nessuna regressione da 7.4.**
- **Boundary giorno-volo provato empiricamente**: `dateOnlyInZone` corretto sui casi 22:30Z→giorno-dopo (CEST) / 21:30Z→stesso giorno, e inverno 23:30Z/22:30Z; scadenza NEL giorno del volo = valida, il giorno prima = scaduta — esattamente la regola del Contesto (convenzione 5.2).
- **Matrice force ri-derivata dal sorgente e dai test**: force senza `manage.any` → 403 PRIMA di ogni query persona/scadenze (asserito sui mock); force staff senza motivo → 422 refine; force su blocco reale → 201 con `forcedAt/forcedByUserId/forceReason` stampati; **force senza nulla da scavalcare → 201 SENZA stamp** (la regola più sottile, confermata nel codice: stamp solo dentro `blockingDocuments.length > 0`); i warning restano anche nel force.
- **422 `EXPIRED_DOCUMENTS`**: message e `details.documents` elencano SOLO i bloccanti anche in presenza di warning simultanei (unit: 'Licenza' presente, 'Rating SEP' assente).
- **Migrazione risposta `{ booking, warnings }` verificata end-to-end**: wire body 201 corretto, form, fixture unit 7.1/7.3, 4 letture e2e dirette del blocco 7.3, `createBookingResponseSchema` nel registry + assert nel registry.test — nessun consumer dimenticato. `forcedAt` nel `BOOKING_SELECT` condiviso → sempre popolato su ogni DTO (lista/calendario/update/cancel).
- **Migrazione/seed**: solo ADD COLUMN + backfill + colonne force + FK; `migrate diff` zero drift; seed `update: {}` intatto (scelte admin preservate).
- Deviazioni del dev tutte ratificate: doc-comment stantio corretto (unico drift trovato nel lavoro ereditato dalla sessione interrotta — scrutinio pieno applicato comunque), helper e2e `soonestFutureSlot`/`lastNamePrefix` che RAFFORZANO le assert senza toccare gli altri call site; il tentativo di DELETE chirurgico del detrito (bloccato dal classifier) è stato gestito correttamente documentando invece di forzare.

### Final gates (re-run dal reviewer)

lint 0 errori (warning benigno noto), typecheck pulito, **927/927 unit**, `env -u NODE_ENV npx next build` verde, e2e **121/129** su DB fresco (8 fail = classi baseline/volume fuori dal diff, zero regressioni; superfici story 25/25), i18n 901/901 simmetrica.

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
- 2026-07-09: Implementation complete (resumed after a container restart interrupted the prior dev-agent run mid-story; verified and continued its correct partial work). Fixed a stale module doc-comment ordering description; hardened the new e2e tests against this long-lived dev DB's accumulated volume (soonest-slot booking placement, an opt-in early-sorting person name for the staff picker). Status: review.
- 2026-07-09: Review Opus 4.8 xhigh via bmad-code-review su DB fresco — clean pass, ZERO finding; boundary giorno-volo, matrice force e migrazione risposta provati empiricamente; 8 fail e2e = classi baseline fuori dal diff. Status → done. EPIC 7 COMPLETO.
