---
baseline_commit: 9d7442a
---

# Story 7.4: Blocco prenotazione per scadenze critiche

Status: ready-for-dev

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

- [ ] Task 1: Modello + migrazione + seed (AC 1/2)
  - [ ] `ExpiryType.blocksBooking Boolean @default(false)` (doc-comment FR-21); `Booking.forcedAt/forcedByUserId/forceReason` + FK/relazione nominata + back-relation `User.bookingsForced`; migrazione `prisma/migrations/20260709120000_add_booking_expiry_block/migration.sql` (diff a mano + UPDATE di backfill dei 4 tipi bloccanti coi nomi esatti del Contesto, banner rimosso); `prisma/seed.ts`: `STANDARD_EXPIRY_TYPES` con `blocksBooking` (create-only, `update: {}` invariato); `npx prisma migrate deploy` + `generate`; verifica in psql del backfill (4 righe true, 2 false).
- [ ] Task 2: Helper + service (AC 1/2)
  - [ ] `src/lib/zoned-time.ts`: `dateOnlyInZone(instant, timeZone)` puro (refactor: `todayDateOnlyInZone` lo riusa) + unit test (istante serale UTC che cade nel giorno DOPO a Roma; CET vs CEST; invarianza del comportamento esistente di `todayDateOnlyInZone`).
  - [ ] `bookings.service.ts#createBooking`: dopo i check persona, `flightDateOnly = dateOnlyInZone(startsAt, APP_TIMEZONE)`; fetch `expiry.findMany({ where: { personId }, include: { type: ... } })` (campi minimi); scadute = `toDateOnlyString(expiresAt) < flightDateOnly`; bloccanti → 422 `EXPIRED_DOCUMENTS` (message coi nomi, details coi documenti) SALVO force staff valido; non bloccanti → `warnings`. `force` senza `manage.any` → 403 PRIMA di ogni query scadenze. Return type `{ booking, warnings }`; stamp force fields solo-se-bypass (Contesto). Ordine complessivo: authorize → own-rules → force-403 → persona (404/409/422) → **scadenze (422/force)** → `BOOKING_IN_PAST` → tx lock/overlap/create.
- [ ] Task 3: API + OpenAPI (AC 1/2)
  - [ ] `schemas/bookings.ts`: `createBookingSchema` + `force`/`forceReason` con refine; nuovo `createBookingResponseSchema = { booking: bookingItemSchema, warnings: z.array({ typeName, expiresAt }) }`; item schema Booking + `forcedAt` nullable (esporre il tracking in lettura è gratis e utile alla PR review — `forceReason`/`forcedByUserId` NO, restano DB-only per ora, doc-comment). Registry: POST /bookings response aggiornata (401,403,404,409,422 invariati); schemi tipi scadenza (`expiry-types`): `blocksBooking` su create/update/item. `registry.test.ts`.
- [ ] Task 4: UI (AC 1/2) — stile `minimalist-ui`, skill obbligatorie (vedi Dev Notes)
  - [ ] `new-booking-form.tsx`: gestione 422 `EXPIRED_DOCUMENTS` (messaggio coi nomi dei documenti dai details); per `canManageAny` sezione "Forza prenotazione" condizionale (motivo obbligatorio, submit con force, annulla che torna al form pulito dallo stato force); successo con `warnings` → banner `role="status"` di variante warning (palette amber esistente `#FBF3DB`/`#956400`) che elenca i documenti in warning; successo senza warnings invariato.
  - [ ] `types-manager.tsx` (+ pagina tipi): checkbox "Blocca prenotazioni" su create/edit + badge in lista; errori/i18n coerenti.
  - [ ] i18n `messages/{it,en}.json` simmetrici: `BookingsPage.form.errors.EXPIRED_DOCUMENTS` (con interpolazione lista), `BookingsPage.form.force.*`, `BookingsPage.form.warnings.*`, `ExpiryTypes*.blocksBooking.*`.
- [ ] Task 5: Test (AC 1/2)
  - [ ] Unit `bookings.service.test.ts`: pilota con medica scaduta (tipo bloccante) → 422 `EXPIRED_DOCUMENTS` con typeName nel message e nei details; rating scaduto (non bloccante) → 201 con `warnings` popolati e senza force stamp; entrambi → 422 (il blocco vince) e i warning NON compaiono nei details del 422 (solo i bloccanti — decisione: details = SOLO documenti bloccanti); documento assente → nessun blocco; **boundary data volo**: `expiresAt` == giorno del volo → VALIDO (niente blocco/warning), giorno prima → scaduto; scadenza scaduta oggi ma volo... (già coperto dal boundary); prenotazione scuola: scadenza dell'ALLIEVO target blocca l'istruttore che prenota; staff senza force → 422; staff con force+motivo → 201 con `forcedAt/forcedByUserId/forceReason` stampati; staff force senza motivo → 422 (refine); pilota con force → 403 prima delle query scadenze; force senza blocco → 201 senza stamp; ordine: scadenze valutate PRIMA di `BOOKING_IN_PAST`? NO — decisione da rispettare: l'ordine del Contesto (scadenze PRIMA di BOOKING_IN_PAST) va asserito con un caso combinato; `dateOnlyInZone` boundary (21:30Z estivo = giorno dopo a Roma → flight date corretta).
  - [ ] Unit tipi: schema `blocksBooking` su create/update, default false.
  - [ ] e2e `bookings.spec.ts` esteso (run-unique; riusare gli helper esistenti + `expiries` API di 6.2 per registrare le scadenze: staff `POST /api/v1/expiries`): pilota run-unique con login e medica scaduta (tipo bloccante run-unique creato via API tipi con `blocksBooking: true`, scope ALL per semplicità) → form UI → errore coi nomi del documento; stesso pilota con SOLO un tipo warning run-unique scaduto → prenotazione creata + banner warning visibile; admin sul form per la stessa persona bloccata → 422 → sezione Forza → motivo → 201 e riga in lista (verifica `forcedAt` via API GET? il campo è nell'item → assert non-null se esposto); pilota tenta force diretto via API → 403 envelope; boundary: scadenza `expiresAt` = giorno del volo → si prenota senza warning.
- [ ] Task 6: Story file aggiornato (Dev Agent Record, File List, Status: review) + `sprint-status.yaml` → `7-4-booking-expiry-block: review`, tutto NEL commit di implementazione.

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

### Debug Log References

### Completion Notes List

### File List

## Review Record

## Change Log

- 2026-07-09: Story file created (Fable 5 main session via bmad-create-story), ready-for-dev.
