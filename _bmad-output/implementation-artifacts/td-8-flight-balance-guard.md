---
baseline_commit: 9a048a3
---

# TD-8: Guardie alla registrazione volo — saldo insufficiente (override admin) + aereo fuori servizio (change request utente 2026-07-13)

Status: done

## Story

As a gestore dell'aviosuperficie,
I want che un volo NON si possa registrare quando il suo importo supera il saldo disponibile del titolare, salvo forzatura motivata di un admin,
so that i conti prepagati non vadano mai in negativo per un addebito volo senza una decisione esplicita e tracciata (change request utente 2026-07-13; ratifiche: override SOLO admin; blocco se il saldo andrebbe sotto zero) — e che un volo su un aereo FUORI SERVIZIO non sia registrabile affatto (ratifica: blocco secco per tutti, simmetrico alle prenotazioni, NESSUNA deroga).

## Acceptance Criteria

1. **Blocco pre-addebito** — **Given** la registrazione di un volo (`registerFlight`) il cui **importo finale addebitato** (componente velivolo DOPO la copertura pacchetti + componente istruttore) è **maggiore del saldo disponibile** del titolare addebitato (pilota o allievo), **Then** la registrazione fallisce con **422 AD-8 `INSUFFICIENT_BALANCE`** e `details: { balanceCents, amountCents }`; NESSUNA scrittura (niente volo, niente movimento, niente consumo pacchetti, contaore invariato). Il confronto avviene DENTRO la transazione, dopo il calcolo dell'importo effettivo e sotto il lock `FOR UPDATE` già esistente sull'Account (race-safe con ricariche/rettifiche concorrenti). `amountCents == balanceCents` PASSA (saldo a zero esatto è lecito); un volo interamente coperto da pacchetti (`amountCents == 0`) passa SEMPRE, anche a saldo già negativo.
2. **Override admin-only** — **Given** `force: true` + `forceReason` (non vuota) nell'input, **Then**: un actor SENZA la nuova permission `flights.force.balance` (solo ADMIN via `ALL_PERMISSIONS`; STAFF esplicitamente NO) riceve **403** PRIMA di ogni side-effect (stesso ordine del force di 7.4); un admin registra il volo anche a saldo insufficiente e il volo viene stampato con `balanceForcedAt` / `balanceForcedByUserId` / `balanceForceReason` (settati INSIEME, mai parziali — stesso pattern `Booking.forcedAt`). `force: true` quando NON c'è nulla da forzare (saldo capiente) = no-op dichiarato: il volo si registra normale SENZA stamping (coerente con 7.4). Lo schema Zod rifiuta `force` senza `forceReason` (refine, come `createBookingSchema`).
3. **Stessa regola sulla correzione** — **Given** `correctFlight` (storno + ri-registrazione), **Then** il NUOVO addebito è soggetto allo stesso check: il confronto usa il saldo COME RISULTA DOPO lo storno del movimento originale (lo storno rimette i soldi sul conto prima del nuovo addebito — dichiarare l'ordine nel codice); stesso 422 / stesso override admin con stessi campi.
4. **Alert email invariato** — l'email di saldo negativo (banda peggiorata) resta e continua a scattare sui voli FORZATI che portano il conto sotto soglia; per i voli bloccati non parte nulla (nessuna scrittura).
4-bis. **Blocco aereo fuori servizio (AOG)** — **Given** la registrazione (o correzione) di un volo su un velivolo con `status == OUT_OF_SERVICE`, **Then** fallisce con **422 AD-8 `AIRCRAFT_OUT_OF_SERVICE`** e `details: { reason: statusReason }` — STESSO code e stesso shape delle prenotazioni (bookings.service.ts:412-413), simmetria completa. Il check vive in `resolveFlightInput` accanto ad `AIRCRAFT_ARCHIVED` (:451). **NESSUNA deroga, nemmeno admin** (ratifica: blocco secco — `force` NON lo bypassa; ordine operativo dichiarato: prima si registra il volo, poi si mette l'aereo fuori servizio; un volo arretrato richiede il rientro in servizio temporaneo). Vale anche per `correctFlight` (stessa risoluzione input). Il dialog mostra l'errore col motivo del fermo (nuova chiave `AIRCRAFT_OUT_OF_SERVICE` in `FlightsPage.form.errors`, it/en).
5. **Migrazione** — i 3 campi su `Flight` sono l'UNICA modifica di schema (migrazione nuova, nullable, nessun backfill: i voli storici non erano forzati). `OpenAPI`/schemi Zod aggiornati (input `force`/`forceReason`; il DTO lista/dettaglio espone i campi forced SOLO a chi ha `flights.manage`, stessa regola di `actorEmail`).
6. **UI dialog registrazione/correzione** — **Given** il 422 `INSUFFICIENT_BALANCE`, **Then** il dialog mostra un errore che NOMINA saldo e importo (nuova chiave in `FlightsPage.form.errors`, it/en, formattazione monetaria esistente); **solo se l'actor è admin** (prop derivata server-side da `hasPermission(actor,'flights.force.balance')`, pattern `readOnly` 2.3) compare l'affordance "Forza registrazione" con campo motivazione obbligatorio che ri-sottomette con `force`+`forceReason` — STESSO pattern UI del "Forza prenotazione" di 7.4 (inclusa la scelta visiva corrente, decisione 121-N1 ancora pendente non toccata). Per staff: solo l'errore, nessuna forzatura. Lo sheet dettaglio volo mostra la deroga (motivazione) sui voli forzati, visibile solo a `flights.manage`.
7. **Test** — unit (`flights.service.test.ts`): blocco esatto al centesimo, pass a saldo esatto, copertura pacchetti che azzera l'importo, force senza permission → 403, force admin → stamping, correzione con saldo post-storno, no-op force a saldo capiente; AOG: registrazione E correzione bloccate 422 anche con `force: true` da admin. e2e (file più pertinente, es. `package-consumption.spec.ts` o nuovo spec piccolo): staff bloccato con 422 e messaggio nel dialog; admin forza con motivazione e il volo appare nel registro; API diretta 403 per staff con force; volo su aereo fuori servizio → errore col motivo nel dialog.
8. **Given** la suite, **Then** `npm run gates` passa e gli e2e mirati (flights, flight-log, flight-reversal, package-consumption, bookings se toccato, nuovo spec) sono verdi su DB fresco.

## Contesto e decisioni di design (vincolanti)

- **Ratifiche utente 2026-07-13 (sera)**: (1) override SOLO admin — lo staff è bloccato e basta; (2) soglia del blocco = saldo sotto ZERO (non la soglia di alert configurabile, che resta solo per l'email); (3) aereo AOG = blocco SECCO per tutti (l'utente ha scelto consapevolmente il tradeoff dell'ordine operativo: l'opzione con deroga admin è stata proposta e rifiutata).
- **Stato attuale AOG (recon)**: le PRENOTAZIONI bloccano già `OUT_OF_SERVICE` (creazione E spostamento, anche staff — bookings.service.ts:412/:716); la REGISTRAZIONE volo no (solo `AIRCRAFT_ARCHIVED`/`PERSON_ARCHIVED`, flights.service.ts:451-454). Il fix è un check in più in `resolveFlightInput`, riusando ValidationError con lo stesso code delle prenotazioni.
- **Stato attuale (recon su `registerFlight`, flights.service.ts:839-923)**: NESSUN check — l'addebito passa sempre; a banda peggiorata parte solo `sendNegativeBalanceAlert` (fire-and-forget, post-commit). Il saldo è leggibile dentro la transazione (l'Account è già lockato `FOR UPDATE` a :873); l'importo finale (post-pacchetti FIFO + istruttore) è calcolato in `registerFlightCore` — il check va DOPO quel calcolo, PRIMA delle scritture dei movimenti.
- **Pattern di riferimento (story 7.4, bookings)**: input `force`/`forceReason` con refine Zod; 403 per force senza permission PRIMA di ogni verifica (bookings.service.ts:301-306); 422 con code + details; stamping `forcedAt`/`forcedByUserId`/`forceReason` set-together (schema.prisma:970, doc :942-943). Massima simmetria di naming: `balanceForcedAt`/`balanceForcedByUserId`/`balanceForceReason` (prefisso balance: su Flight potranno esistere altre forzature in futuro).
- **Permission nuova `flights.force.balance`** nel catalogo `rbac.ts`: ADMIN la eredita da `ALL_PERMISSIONS`, STAFF NON la riceve (ratifica). Niente check di ruolo hardcoded nei service — sempre `authorize`/`hasPermission`.
- **Titolare addebitato** = la persona del volo (pilota o allievo nei voli scuola): il check vale per chiunque venga addebitato, nessuna distinzione.
- **Fuori scope (dichiarato)**: blocco a livello PRENOTAZIONE (esiste già il blocco scadenze 7.4 — il saldo si valuta solo alla registrazione, dove l'importo è noto); soglia configurabile per il blocco; sblocco/deroga per staff; UI di riepilogo deroghe; 121-N1 (decisione visiva bottone force pendente — NON cambiarne lo stile qui).

## Tasks / Subtasks

- [x] **T1 (AC 5)** — Migrazione: 3 campi nullable su `Flight`; schemi Zod input (`force`/`forceReason` + refine) e DTO (campi forced gated `flights.manage`); OpenAPI.
- [x] **T2 (AC 1, 2, 3, 4-bis)** — `rbac.ts` permission nuova; check saldo in `registerFlightCore`/`correctFlight` (dopo calcolo importo, saldo post-storno per la correzione), 422 `INSUFFICIENT_BALANCE` con details; 403 force non-admin; stamping set-together; no-op force dichiarato; check AOG in `resolveFlightInput` (422 `AIRCRAFT_OUT_OF_SERVICE`, mai bypassabile).
- [x] **T3 (AC 4)** — Verifica che l'alert email resti invariato (nessun cambio atteso — dichiarare).
- [x] **T4 (AC 6)** — Dialog registrazione/correzione: errore con saldo/importo; affordance force admin-only (prop server-side); sheet dettaglio con la deroga; i18n it/en.
- [x] **T5 (AC 7, 8)** — Unit + e2e; `npm run gates`; run e2e mirati su DB fresco.
- [x] **T6** — Dev Agent Record + File List; sprint-status `td-8` → `review`.

## Dev Notes

- Leggere e seguire `karpathy-guidelines`; per la parte UI: `impeccable`, `design-taste-frontend`, `ui-ux-pro-max`; contratto `DESIGN.md` + Addendum Palette v2 (Ember SOLO error/distruttivo — il messaggio 422 è un errore, l'affordance force segue il pattern 7.4 esistente).
- Il rischio n.1 è l'ordine dentro la transazione della CORREZIONE (storno prima, check sul saldo risultante, poi nuovo addebito) — coprirlo con un unit test dedicato al centesimo. Il rischio n.2 è esporre i campi forced nel DTO own-access: gated `flights.manage` come `actorEmail`, con test.
- Ambiente: DB fresco fornito dalla sessione principale (NON resettare); prima di ogni run e2e `curl localhost:3000` deve FALLIRE (`fuser -k 3000/tcp`); gates SOLO `npm run gates`; MAI `playwright install`; MAI stash; MAI `git add -A`; niente screenshot committati; password seed SOLO da env.
- Baseline: DOPO TD-7 (fusione Piloti+Utenti) — contare migrazioni/test correnti a inizio dev e riportarli nel Record.

### Project Structure Notes

- Modifiche attese: `prisma/schema.prisma` + migrazione nuova, `src/server/auth/rbac.ts`, `src/server/services/flights.service.ts` (+ test), `src/lib/schemas/flights.ts`, route flights se serve il code mapping, dialog voli (`flights-manager.tsx` + `flight-detail-sheet.tsx`), `messages/{it,en}.json`, e2e. NESSUNA env var o dipendenza nuova.

### References

- [Source: change request utente 2026-07-13 («check sul balance del pilota prima di creare ed addebitare un volo … override dell'admin») + 2 ratifiche AskUserQuestion (solo admin; blocco sotto zero)]
- [Source: recon in sessione — flights.service.ts:839-923 (nessun check, lock Account :873, alert :909-917), bookings.service.ts:301-306 + schema.prisma:942-970 (pattern force 7.4), rbac.ts (catalogo permission)]
- [Source: story 7.4 (force prenotazioni), 5.2 (consumo pacchetti FIFO), 3.3 (soglia alert e bande)]

## Dev Agent Record

### Agent Model Used

Sonnet 5 (dev subagent, xhigh)

### Debug Log References

- Baseline (HEAD 9a048a3, dopo TD-7): 30 migrazioni Prisma esistenti, 1283 test vitest esistenti nella suite completa.
- `npx prisma migrate dev --name flight_balance_force_tracking`: `ALTER TABLE "Flight" ADD COLUMN "balanceForceReason"/"balanceForcedAt"/"balanceForcedByUserId"` + 1 FK verso `User` — UNICA modifica SQL (la rinomina dei due relation-name su `Flight.actorUser`/`User.flightsRecorded`, necessaria perché `Flight` ha ora una seconda relazione verso `User`, è puramente a livello Prisma-client, zero diff SQL — verificato nel file di migrazione).
- Rilevato (e risolto) durante la verifica Playwright MCP su build di produzione: il client Prisma generato da `migrate dev` non conteneva i 3 nuovi campi (`Unknown field 'balanceForcedAt'` a runtime, non intercettato da tsc per via dell'excess-property-check loophole su un oggetto `select` aliasato con `as const`) — fix: `npx prisma generate` esplicito, poi `npm run gates` rieseguito con esito verde prima e dopo il fix. Questo conferma il valore della verifica interattiva richiesta per le story UI: i 4 gate automatici (lint/typecheck/test/build) non avrebbero MAI intercettato questo bug (typecheck bypassato dal loophole, build/test non toccano un DB reale).
- Introdurre il guard ha reso 0,00€ un saldo insufficiente per QUALSIASI addebito reale — questo ha rotto 2 unit test pre-esistenti (l'alert "ok→negative" su registerFlight/correctFlight, ora raggiungibile solo via force admin) e ~16 e2e pre-esistenti in flights/flight-log/flight-reversal/package-consumption.spec.ts (piloti freschi con saldo 0 che registravano un volo reale). Fix dichiarato: `createPilotWithLogin`/`createPilotPerson` in questi 4 spec ora fanno un top-up di 50.000.000 cent subito dopo la creazione (ancora da admin); le asserzioni sul "nuovo saldo"/saldo estratto conto sono state ricalcolate di conseguenza (il TOTALE del singolo movimento resta invariato). NON toccati (fuori dallo scope T5 dichiarato dalla story): altri e2e che registrano voli via API (`exports.spec.ts`, `home-dashboard.spec.ts`, `login.spec.ts`, `pdf-exports.spec.ts`, `person-detail.spec.ts`, `school.spec.ts`) — probabilmente hanno lo stesso problema, segnalato al reviewer/sessione principale, non corretto qui.

### Completion Notes List

- AC 1/2/3: guardia saldo insufficiente implementata in `registerFlightCore` (condiviso da `registerFlight`/`correctFlight`), DOPO il calcolo di `totalAmountCents`, PRIMA di ogni scrittura — blocco `totalAmountCents > 0 && totalAmountCents > balanceBeforeCents` (l'AND con `> 0` è ciò che garantisce l'esenzione "pacchetto pieno passa sempre anche a saldo negativo", altrimenti `0 > saldo-negativo` bloccherebbe erroneamente). Per `correctFlight` il check legge lo stesso `balanceBeforeCents` che `registerFlightCore` calcola DOPO lo storno, nella stessa transazione (read-your-own-writes) — coperto da 2 unit test dedicati al centesimo sul saldo post-storno.
- AC 2: 403 per `force` senza `flights.force.balance` controllato SUBITO dopo `authorize(actor,'flights.manage')`, PRIMA di `resolveFlightInput` (stesso ordine/stile del force 7.4). Stamping `balanceForcedAt`/`balanceForcedByUserId`/`balanceForceReason` set-together via uno spread condizionale nello stesso `tx.flight.create`. No-op dichiarato verificato con test dedicato (`not.toHaveProperty`).
- AC 4-bis: check AOG aggiunto in `resolveFlightInput` subito dopo `AIRCRAFT_ARCHIVED`, PRIMA di ogni altro controllo — vale automaticamente sia per `registerFlight` che `correctFlight` (entrambi chiamano la stessa funzione), MAI bypassabile da `force` (nessun percorso di forzatura tocca questo check).
- AC 5: unica modifica di schema reale = i 3 campi (vedi Debug Log per la nota sul relation-rename senza diff SQL). DTO: nuovo parametro `includeForcedFields` su `toListItem`, gated `flights.manage` (permission DIVERSA da `people.read` di `actorEmail` — la story chiedeva "stessa tecnica", non "stessa permission").
- AC 6: nuova sezione "Forza registrazione" in `flights-manager.tsx` (`RegisterFlightForm`), copiata VERBATIM (classi/colori) da `new-booking-form.tsx` (decisione 121-N1 non toccata) — condivisa da registrazione E correzione (stesso componente). Sheet dettaglio: nuovo campo "Deroga saldo insufficiente" gated `canManage && flight.balanceForceReason`.
- AC 7/8: 24 nuovi unit test in `flights.service.test.ts` (guardia saldo su registerFlight: 6; su correctFlight: 4; AOG: 2; schema force/forceReason: 11; DTO gating: 1) + 2 assert aggiornate in `rbac.test.ts`; nuovo e2e `flight-balance-guard.spec.ts` (4 scenari, esattamente quelli elencati in AC 7); 4 e2e pre-esistenti adattati (vedi Debug Log). Verifica interattiva Playwright MCP su build di produzione (`next build` + `next start`, `AUTH_TRUST_HOST=true` — necessario SOLO per l'avvio manuale di verifica, non è un requisito nuovo della story: CI lo imposta già per il proprio run e2e su build di produzione) con cookie injection (`.playwright-mcp/inject-admin.js`, password mai stampata) — coperti: admin bloccato+forza con successo, sheet con deroga, staff bloccato senza affordance, staff 403 via API diretta, AOG blocca sia registrazione che correzione.
- `npm run gates`: PASS (lint/typecheck/test/build) — eseguito 2 volte (prima e dopo il fix del client Prisma stale, vedi Debug Log).

### File List

- `prisma/schema.prisma`
- `prisma/migrations/20260713210400_flight_balance_force_tracking/migration.sql`
- `src/server/auth/rbac.ts`
- `src/server/auth/rbac.test.ts`
- `src/lib/schemas/flights.ts`
- `src/server/services/flights.service.ts`
- `src/server/services/flights.service.test.ts`
- `src/app/[locale]/dashboard/flights/page.tsx`
- `src/app/[locale]/dashboard/flights/flights-manager.tsx`
- `src/app/[locale]/dashboard/flights/flight-detail-sheet.tsx`
- `messages/it.json`
- `messages/en.json`
- `e2e/flight-balance-guard.spec.ts` (nuovo)
- `e2e/flights.spec.ts`
- `e2e/flight-log.spec.ts`
- `e2e/flight-reversal.spec.ts`
- `e2e/package-consumption.spec.ts`
- `e2e/exports.spec.ts` (review fix F1 — top-up nei creator + pilota SEED del test own-rows)
- `e2e/home-dashboard.spec.ts` (review fix F1)
- `e2e/pdf-exports.spec.ts` (review fix F1)
- `e2e/person-detail.spec.ts` (review fix F1)
- `e2e/school.spec.ts` (review fix F1 — `createStudentPerson`, copre anche `createStudentWithLogin`)
- `e2e/typeahead-pickers.spec.ts` (review fix F1 — pilota target, NON i 105 buffer mai addebitati)

## Review Record (Opus 4.8 adversarial, 2026-07-13)

- **Verdetto: fixes-required → fixed.** La LOGICA delle guardie è passata TUTTI gli 8 fronti empirici della review senza difetti: boundary al centesimo (0 vs 15000 → 422 con zero scritture verificate via psql; 15000 vs 15000 → 201; 14999 → 422), race-safety (read sotto il lock FOR UPDATE), semantica force (staff 403 pre-side-effect, refine Zod, stamping set-together, no-op a saldo capiente, AOG vince sul force admin), ordine storno-prima-del-check in correzione (provato con correzioni 60→60 pass e 60→120 422), esposizione DTO solo `flights.manage` (il pilota non vede i campi force del proprio volo), UI in entrambe le modalità su build di produzione, igiene migrazione (3 colonne + FK, client generato allineato, zero drift), alert email intatto (i 2 unit test ri-premessi sul force preservano l'intento).
- **F1 (BLOCKER, fixato)**: blast radius e2e — 12 test in 6 spec creavano piloti/allievi a saldo zero e incassavano il nuovo 422 dove aspettavano 201 (`exports`, `home-dashboard`, `pdf-exports`, `person-detail`, `school`, più `typeahead-pickers:36` che il dev NON aveva censito; `login.spec` era un falso sospetto — solo GET). Fix: top-up 50M cents nei creator di ogni spec (pattern del dev), incluso il caso del **pilota seed** in `exports:190` (unico volo registrato a una persona non creata dagli helper); in `pdf-exports` il top-up da 5000 esistente era anche DOPO il POST del volo.
- **F2 (NIT, nessun cambio)**: il check AOG vive in `resolveFlightInput` fuori dal lock (TOCTOU teorico) — identico al pre-esistente `AIRCRAFT_ARCHIVED`, non è un invariante monetario, ordine operativo ratificato.
- **F3 (NIT, nessun cambio)**: il picker velivoli non disabilita/suffissa gli AOG (a differenza delle prenotazioni) — gap dichiarato, la story non lo richiedeva; candidato UX-parity futuro (deferred TD8-N1).
- Post-fix: gates PASS (1307 unit); i 6 spec fixati 46/48 al primo giro (2 residui: `exports:190` = pilota seed, fixato; `person-detail:129` = ECONNRESET ambientale) poi 13/13 verdi; full suite CI-mode su DB fresco: esito nel Change Log.

## Change Log

- 2026-07-13: Implementata la story (dev subagent) — guardia saldo insufficiente (admin-only force) + guardia AOG su registrazione/correzione volo. Vedi Dev Agent Record per dettagli e deviazioni dichiarate.
- 2026-07-13: Review adversarial (Opus) fixes-required → F1 fixato dalla sessione principale (top-up nei 6 spec del blast radius). Full suite CI-mode su DB fresco POST-fix: **217 passed / 7 flaky (classi note) / 1 failed = command-palette:95 (deferred TD6-N1 pre-esistente)** — persino bookings:636/:690 verdi in questo run. Status → done.
