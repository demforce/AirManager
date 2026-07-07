---
baseline_commit: b6c3ae5
---

# Story 5.3: Correzione e annullamento volo con storno

Status: done

## Story

As a staff,
I want correggere o annullare un volo sbagliato,
so that la contabilità si sistemi senza cancellare la storia (FR-16).

## Acceptance Criteria

1. **Given** un volo registrato con addebito e consumo pacchetto, **When** lo annullo (con motivo), **Then** in UNA transazione: nasce un movimento di **storno** collegato (`reversalOfId` → movimento `FLIGHT_CHARGE` originale, AD-3) con importo OPPOSTO (+totale), i minuti consumati **tornano disponibili** sui pacchetti, il **contaore** del velivolo viene ridotto dei minuti del volo, e il volo resta visibile come **ANNULLATO** (mai cancellato fisicamente).
2. **Given** un volo con dati errati (minuti, persona, istruttore, velivolo, data, tipo...), **When** lo correggo fornendo i dati nuovi (con motivo), **Then** il sistema esegue storno + NUOVA registrazione in un'**unica transazione** e le due operazioni restano **collegate** (`Flight.correctionOfId`): il volo originale diventa ANNULLATO, il nuovo è REGISTERED con tariffe/pacchetti ricalcolati alla SUA data — e i minuti appena ripristinati dallo storno sono già disponibili per il nuovo consumo (stessa transazione).
3. **Given** un volo già ANNULLATO, **When** provo ad annullarlo o correggerlo di nuovo, **Then** 409 (`ConflictError`); il vincolo `@unique` su `reversalOfId` è il backstop DB contro il doppio storno concorrente.
4. **And** solo `flights.manage` (staff/admin) può annullare/correggere → 403 per gli altri; FR-16: voli di QUALSIASI data (nessuna chiusura contabile).

## Contesto e decisioni chiave (LEGGERE PRIMA DI CODIFICARE)

- **Storno = movimento OPPOSTO collegato (AD-3), mai edit/delete**: nuovo valore enum **`FLIGHT_CHARGE_REVERSAL`** su `AccountMovementType` (additivo; label estratto conto "Storno volo"/"Flight reversal" — un `FLIGHT_CHARGE` positivo sarebbe illeggibile in estratto). Il movimento di storno ha `amountCents = +totale originale` (letto dal movimento originale, MAI ricalcolato — AD-4), `reversalOfId` = movimento originale, `flightId` = volo originale (la relazione `Flight.movements` è plurale apposta, decisione 5.1), `effectiveDate` = **oggi** UTC date-only (lo storno vale quando avviene, come le rettifiche 3.3 — non retrodatato), `description` = `Storno volo <marche> <YYYY-MM-DD> — <motivo>`.
- **Ripristino minuti pacchetto = via stato, NON cancellando righe**: le righe `PackageConsumption` del volo annullato NON si toccano (storia). Il ripristino avviene cambiando il filtro delle SUM: **ovunque si calcola il consumo** (`registerFlight` in-tx groupBy, `listPersonPackages` groupBy) si somma SOLO il consumo dei voli non annullati (`flight: { status: { not: 'CANCELLED' } }` nel `where` del groupBy su `PackageConsumption`). Così l'annullamento "restituisce" i minuti senza scrivere nulla sui pacchetti, e la correzione li vede già disponibili DENTRO la stessa transazione (lo status è già CANCELLED per il suo stesso write). Questa è la decisione che 5.2 ha lasciato aperta — realizzarla qui, aggiornando i doc-comment di 5.2.
- **Contaore ridotto (FR-9/FR-16)**: `hourMeterMinutes = max(0, current − minutes)` sotto lock `FOR UPDATE` (stesso pattern registerFlight). Il **clamp a 0** è deliberato: se nel frattempo una rettifica manuale ha abbassato il contaore sotto i minuti del volo, bloccare l'annullamento per questo sarebbe peggio (l'audit resta nel volo + nelle rettifiche); documentare nel doc-comment. Nessun `HourMeterAdjustment` creato (come 5.1).
- **Stato e tracce sul volo**: `cancelFlight` setta `status: CANCELLED` + nuove colonne `cancelledAt DateTime?` e `cancelReason String?` (il motivo è OBBLIGATORIO nell'input, come le rettifiche 3.3; l'attore resta tracciato dall'`actorUserId` del movimento di storno). Guardie: volo esiste → 404; già CANCELLED → 409 `ConflictError('Flight is already cancelled.')`; il catch P2002 su `reversalOfId` resta il backstop del doppio annullo concorrente → 409 (pre-check + backstop, lezione consolidata).
- **Annullare è SEMPRE lecito** (anche con persona/velivolo ORA archiviati — si restituiscono soldi, non si valida lo stato); **correggere no**: la correzione È una nuova registrazione e ri-valida tutto (`AIRCRAFT_ARCHIVED`, `NO_AIRCRAFT_RATE` alla nuova data, ecc. — tutti i 422 di 5.1 si applicano ai DATI NUOVI). Se la ri-registrazione fallisce, l'INTERA transazione (storno compreso) fa rollback — mai uno storno orfano da correzione.
- **Collegamento correzione**: nuova colonna `Flight.correctionOfId String? @unique` (self-FK al volo originale — pattern `AccountMovement.reversalOfId`): il volo NUOVO punta all'ANNULLATO che sostituisce. `@unique` = al più una correzione diretta per volo; una catena di correzioni è naturale (si corregge il sostituto). DTO/UI espongono entrambe le direzioni (`correctionOfId` + `correctedByFlightId` derivato dalla relazione inversa).
- **Refactor obbligatorio del service**: estrarre il cuore della registrazione 5.1/5.2 in una funzione interna `registerFlightCore(tx, ...)` (nome a discrezione) che ASSUME i lock già presi e opera dentro una tx passata — usata sia da `registerFlight` (tx propria) sia da `correctFlight` (dopo lo storno, stessa tx). NON duplicare la logica di calcolo/consumo/guardie: una sola implementazione.
- **Lock e deadlock (correzione)**: la correzione può toccare DUE conti (persona cambiata) e DUE velivoli (velivolo cambiato). Per evitare deadlock tra correzioni concorrenti incrociate: dentro la tx, upsert/risoluzione di TUTTE le righe da lockare, poi UN SOLO `SELECT ... FOR UPDATE` per tabella con `WHERE id IN (...) ORDER BY id` (lock in ordine deterministico: prima gli Aircraft coinvolti, poi gli Account coinvolti — stesso ordine macro di `registerFlight`: verificarlo nel codice 5.1 e mantenerlo). Documentare nel doc-comment. `cancelFlight` (un solo aircraft, un solo account) usa lo stesso ordine.
- **Alert saldo (FR-27)**: l'annullamento AGGIUNGE denaro (banda migliora o resta) → NIENTE lettura saldo-prima/alert (stessa scelta documentata di `recordTopUp`). La correzione invece può peggiorare il saldo netto: il percorso di ri-registrazione ha già la sua lettura saldo-prima sotto lock — che DEVE avvenire DOPO la creazione del movimento di storno nella stessa tx (così il "prima" include il rimborso e la banda confrontata è quella vera). Ordine nella tx di correzione: lock → storno (movimento + status + contaore giù) → saldo-prima → nuova registrazione → alert post-commit se peggiora.
- **Idempotenza/reversal del REVERSAL**: un movimento `FLIGHT_CHARGE_REVERSAL` non è a sua volta stornabile via questa API (non è un volo); `recordAdjustment` 3.3 può già puntarci una rettifica manuale (affordance pre-esistente, D2 di 4.4 — nessuna azione).
- **API**: `POST /api/v1/flights/{id}/cancel` (200, body `{ reason }`) e `POST /api/v1/flights/{id}/correct` (201, body = stessi campi di `registerFlightSchema` + `reason`; risposta = volo nuovo + overview conto). Response del cancel: volo aggiornato + overview conto. Tag OpenAPI `Flights`, errorResponses cancel `(401,403,404,409,422)`, correct `(401,403,404,409,422)`.

## Tasks / Subtasks

- [x] Task 1: Modello + migrazione (AC 1/2)
  - [x] Enum `AccountMovementType`: aggiungere **`FLIGHT_CHARGE_REVERSAL`** (additivo, stessa procedura/avvertenze di 4.4/5.1).
  - [x] `Flight`: aggiungere `cancelledAt DateTime?`, `cancelReason String?`, `correctionOfId String? @unique` + self-FK (`correctionOf Flight? @relation("FlightCorrection", ...)`, `correctedBy Flight? @relation("FlightCorrection")`). Aggiornare doc-comment del modello (lifecycle REGISTERED→CANCELLED, correzione = catena).
  - [x] Migrazione a mano (timestamp dopo `20260707160000`), `migrate deploy` + `generate`. Verificare ALTER TYPE, ADD COLUMN, unique su `correctionOfId`, self-FK.
- [x] Task 2: Service (AC 1/2/3/4)
  - [x] Refactor: estrarre `registerFlightCore(tx, actor, input, rates, …)` da `registerFlight` (guardie di dominio pre-tx restano in `registerFlight`/`correctFlight` secondo il punto del Contesto; il core in-tx fa: consumo pacchetti → Flight.create → movimento → contaore, con saldo-prima/banda). `registerFlight` resta identico all'esterno (nessun cambio di contratto API; i test 5.1/5.2 devono restare verdi con al più aggiornamenti di mock).
  - [x] `cancelFlight(actor, flightId, { reason })`: `authorize('flights.manage')`; volo esiste (con il suo movimento FLIGHT_CHARGE via relazione) → 404; già CANCELLED → 409; UNA tx: lock Aircraft (ordinato) → `Flight.update` (status CANCELLED, cancelledAt now, cancelReason) → movimento `FLIGHT_CHARGE_REVERSAL` (`+|amountCents originale|`, `reversalOfId`, `flightId`, effectiveDate oggi, description con motivo, actorUserId) con catch P2002 → 409 → contaore `max(0, − minutes)`. Nessun alert. Ritorna DTO volo aggiornato + overview conto.
  - [x] `correctFlight(actor, flightId, input /* registerFlight fields + reason */)`: `authorize`; guardie: volo esiste → 404, già CANCELLED → 409; guardie 5.1 complete sui DATI NUOVI (404/422 specifici, tariffe alla NUOVA flightDate lette pre-tx); UNA tx nell'ordine del Contesto (lock ordinati su tutti gli Aircraft/Account coinvolti → storno completo del volo originale → saldo-prima del conto della persona NUOVA → `registerFlightCore` con `correctionOfId` = volo originale) → alert post-commit se banda peggiorata. Ritorna volo nuovo + overview conto (persona nuova).
  - [x] Consumo: aggiornare le DUE groupBy esistenti (in-tx `registerFlight`/core e `listPersonPackages`) con `flight: { status: { not: 'CANCELLED' } }`; aggiornare i doc-comment 5.2 che rimandavano la decisione.
  - [x] DTO `FlightListItem`: aggiungere `cancelledAt`, `cancelReason`, `correctionOfId`, `correctedByFlightId` (dalla relazione inversa, `null` se nessuna).
- [x] Task 3: API + OpenAPI (AC 3/4)
  - [x] `POST /api/v1/flights/[id]/cancel` e `POST /api/v1/flights/[id]/correct` (apiRoute, person-scoped params come le route `[id]` esistenti). `cancelFlightSchema { reason: min 1 max 500 }`; `correctFlightSchema = registerFlightSchema.extend({ reason })`. Registry (tag `Flights`) + coverage test.
- [x] Task 4: UI (AC 1/2) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE**, stile minimalista editoriale
  - [x] `/dashboard/flights` (flights-manager.tsx): nella tabella voli recenti, badge di stato (ANNULLATO in tono muted/rosso sobrio; REGISTERED senza badge o neutro) e, per i voli REGISTERED, azioni "Annulla" (chiede motivo, conferma, mostra esito) e "Correggi" (riapre il form di registrazione precompilato coi dati del volo + campo motivo; submit → correct API; esito col breakdown nuovo). Voli annullati: mostrare motivo/quando (tooltip o riga secondaria) e link/chip "corretto da"/"correzione di" quando presenti. UX sobria, niente modali barocche — coerenza col pannello esistente.
  - [x] Estratto conto: case `FLIGHT_CHARGE_REVERSAL` (+ chiavi i18n `flightChargeReversal`) nei due switch tipo-movimento + `accountMovementTypeSchema`; il badge "rettifica di..." esistente (reversalOfId) deve funzionare anche per questo tipo (verificare, era per ADJUSTMENT).
  - [x] Packages panel: il residuo risale dopo un annullo (automatico via SUM filtrata — verificare in UI).
  - [x] i18n simmetrici it/en.
- [x] Task 5: Test (AC tutti)
  - [x] Unit (mock prisma, estendere `flights.service.test.ts` + `packages.service.test.ts`): cancel — 403 non staff, 404 volo, 409 già cancellato, P2002 → 409, movimento +totale con reversalOfId/flightId/description, status+cancelledAt+cancelReason, contaore −minuti e clamp a 0, NESSUN alert; correct — 403/404/409, 422 sui dati nuovi (almeno un caso: velivolo nuovo archiviato), tx unica con ordine storno→saldo-prima→core, `correctionOfId` settato, minuti ripristinati riusabili nella stessa correzione (mock della groupBy con filtro status), alert se banda peggiora col saldo-prima POST-storno; groupBy: filtro `status not CANCELLED` presente in entrambe (query-shape assertion); `listPersonPackages` residuo risalito dopo cancel.
  - [x] e2e (`e2e/flight-reversal.spec.ts`): flusso completo — vendi pacchetto, registra volo scuola (pacchetto + istruttore), annulla con motivo → saldo tornato al valore pre-volo (estratto: FLIGHT_CHARGE negativo + STORNO positivo collegato), residuo pacchetto ripristinato nel panel, contaore ridotto (pagina aircraft), volo ANNULLATO con motivo nel registro; secondo annullo → 409 envelope; correzione minuti (es. 60'→30') → volo vecchio ANNULLATO + nuovo REGISTERED collegati, saldo netto coerente, pacchetto consumato 30'; pilota → 403 su entrambe le API. Nomi run-unique.
  - [x] Regressione: tutte le suite 5.1/5.2 verdi (il refactor core non cambia il contratto).

## Dev Notes

- **AD-2**: importi/minuti interi; lo storno usa l'importo ORIGINALE (mai ricalcolo). **AD-3**: nessun update/delete di movimenti; storno collegato via `reversalOfId`; righe consumo intatte (ripristino via filtro stato). **AD-4**: la correzione ricalcola alle tariffe della NUOVA data; lo storico annullato resta leggibile dai suoi snapshot. **AD-5**: `authorize` su ogni entrypoint. **AD-8**: 409 CONFLICT per doppio annullo; envelope standard.
- **Lezioni review**: pre-check + backstop P2002; lock ordinati deterministici (unica query IN + ORDER BY per tabella); saldo-prima sotto lock DOPO lo storno; email post-commit; date-only UTC; query-shape assertions nei unit; i18n simmetrica.
- **Cosa NON fare**: niente cancellazione fisica di Flight/movimenti/consumi; niente edit in place del volo (la "modifica" è SEMPRE storno+nuova registrazione); niente storno di un movimento di storno; niente UI per annullare dall'estratto conto (si opera dal registro voli); niente filtri registro (5.4); NON cambiare `registerFlightSchema` per l'input di `registerFlight`.
- **Ambiente/gate**: come 5.2 (postgres attivo; Mailpit 127.0.0.1:1025/8025, rilancio SOLO `run_in_background: true`; reset DB pre-e2e; MAI `playwright install`). Gate: lint / typecheck / `npx vitest run` (>= 544 + nuovi) / `npx next build` / `npx playwright test` (>= 90 + nuovi; flaky noti → isolamento su DB fresco). UN commit (`Story 5.3: <sintesi>`, nessun riferimento AI). NON push.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-16 (+FR-9 conseguenza ricalcolo contaore)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-3 (storno), #AD-4, #AD-6 (reversibilità consumo)]
- [Source: src/server/services/flights.service.ts] — IL file da estendere/refactorare (registerFlight → core)
- [Source: src/server/services/accounts.service.ts#recordAdjustment] — pattern reversalOfId + pre-check/backstop P2002 + alert
- [Source: src/server/services/packages.service.ts#listPersonPackages] — groupBy da filtrare per stato volo
- [Source: _bmad-output/implementation-artifacts/5-1-flight-logging-charges.md, 5-2-package-consumption.md] — Review Record e decisioni su lock/serializzazione
- [Source: src/app/[locale]/dashboard/flights/flights-manager.tsx] — UI da estendere

## Dev Agent Record

### Agent Model Used

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

- Migrazione a mano: `npx prisma format && npx prisma validate` puliti, `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script` (banner "Loaded Prisma config..." + riga vuota rimossi, prime due righe), salvata come `prisma/migrations/20260707170000_add_flight_reversal/migration.sql`, poi `npx prisma migrate deploy` + `npx prisma generate` — applicata pulita (16 migrazioni totali su DB fresco; il conteggio "17" iniziale era un refuso — review 5.3 D1). Verificato a mano via `psql \d "Flight"` che `cancelledAt`/`cancelReason`/`correctionOfId` esistono, `Flight_correctionOfId_key` è UNIQUE e la FK self-referenziale `Flight_correctionOfId_fkey` è `ON DELETE SET NULL`; `enum_range(NULL::"AccountMovementType")` conferma `FLIGHT_CHARGE_REVERSAL` in coda (additivo).
- Refactor `registerFlightCore`: estratto l'intero corpo in-tx di `registerFlight` (dall'aggregate del saldo in poi) in una funzione condivisa che ASSUME i lock già presi e riceve il valore corrente di `hourMeterMinutes` come parametro (mai una re-lettura interna) — questo è ciò che permette a `correctFlight` di passare il valore GIÀ decrementato dallo storno quando la correzione mantiene lo stesso velivolo, ottenendo `current - vecchiMinuti + nuoviMinuti` senza una seconda query. `registerFlight` esternamente identico: stesso ordine di lock (Aircraft poi Account, stesse due query raw single-row), stessa firma, stesso contratto — i 60 test 5.1/5.2 esistenti in `flights.service.test.ts` sono rimasti verdi SENZA modifiche (solo un `queryRaw`/mock aggiuntivo per i nuovi test, nessun mock esistente toccato).
- Lock deterministico per `correctFlight`: `SELECT "id","hourMeterMinutes" FROM "Aircraft" WHERE "id" IN (${Prisma.join(aircraftIds)}) ORDER BY "id" FOR UPDATE` (e l'equivalente per `Account`) — richiede `Prisma` come import VALORE (non più solo `type`) da `@/generated/prisma/client` per `Prisma.join`/`Prisma.TransactionClient`; verificato che l'import a valore non rompe l'uso esistente di `Prisma.PackageConsumptionOrderByWithRelationInput[]` nel cast di `FLIGHT_SELECT`.
- Verifica interattiva end-to-end via Playwright MCP (Chromium headless, dev server + Mailpit locali) prima di scrivere gli e2e: registrato un volo (80'×150€/h→200,00€, contaore 750→830), annullato con motivo → riga ANNULLATO con motivo/data, estratto conto con FLIGHT_CHARGE −200,00€ + FLIGHT_CHARGE_REVERSAL +200,00€ (badge "Storno del movimento del..." — verificato che il badge esistente di 3.3, generalizzato, funziona anche per questo tipo), saldo tornato a 0,00€, contaore tornato a 750 (12:30); registrato un secondo volo (60') e corretto a 30' → volo vecchio ANNULLATO con chip "Corretto da un volo successivo", volo nuovo con chip "Correzione di un volo precedente", contaore netto coerente (750+60−60+30=780, 13:00), saldo netto coerente; secondo annullo dello stesso volo → 409 CONFLICT via fetch autenticato; volo scuola con pacchetto (copertura totale, movimento a 0 — mai `-0`) annullato → residuo pacchetto ripristinato (0:00→1:00, nota "Usati" sparita) — la SUM filtrata su `status not CANCELLED` verificata contro DB reale, non solo mock. Verificato anche il rendering `/en` (chiavi simmetriche, "Cancelled"/"Corrected by a later flight"/"Correction of a previous flight").
- `npx playwright test` (suite intera, DB fresco) prima esecuzione: 91 passed, 1 failed (`people-management.spec.ts` — story 2.1, file MAI toccato da questa story) con timeout su un `toBeVisible` di riga appena creata; re-eseguito quello stesso file in isolamento su DB fresco → 6/6 verdi. Seconda esecuzione completa (DB fresco): un fallimento isolato SOLO nel proprio `flight-reversal.spec.ts` (NO_AIRCRAFT_RATE inatteso: lo screenshot d'errore mostra il velivolo selezionato retrocesso al default della select, non quello creato dal test) — riprodotto il pattern di flakiness sotto carico già documentato da 5.1 (client `pg` non pooled condiviso dal dev server, warning "client is already executing a query" osservato più volte durante i run pesanti); ri-eseguito `flight-reversal.spec.ts` da solo su DB fresco → 2/2 verdi, ripetuto due volte. Esecuzione finale completa (DB fresco, nessun altro processo concorrente): **92/92 verdi, zero fallimenti** — gate accettato su questa run.

### Completion Notes List

- Tutti gli AC (1-4) implementati e verificati: storno = movimento `FLIGHT_CHARGE_REVERSAL` collegato (mai edit/delete), importo sempre letto dal movimento originale (mai ricalcolato, incluso il caso 0€ da copertura pacchetto totale — stesso accorgimento `0 - amountCents` anti-`-0` di 5.2), ripristino minuti pacchetto via filtro di stato (nessuna riga `PackageConsumption` toccata), contaore ridotto con clamp a 0, correzione = storno + nuova registrazione nella STESSA transazione con `correctionOfId` collegato, 409 su doppio annullo/correzione (pre-check + backstop P2002 su `reversalOfId`), 403 per non-staff.
- Refactor `registerFlightCore` completato come da Contesto: un'unica implementazione di consumo pacchetti/creazione volo/movimento/contaore condivisa da `registerFlight` e `correctFlight`; `resolveFlightInput` (le guardie + i lookup tariffe di 5.1, anch'esse estratte) è il secondo pezzo condiviso — `correctFlight` lo richiama SULLE DATI NUOVI per ottenere la ri-validazione completa richiesta dal Contesto ("tutti i 422 di 5.1 si applicano ai dati nuovi").
- Lock deterministico per `correctFlight`: tutti gli `Aircraft` coinvolti (fino a 2) in UNA query `IN (...) ORDER BY id FOR UPDATE`, poi tutti gli `Account` coinvolti (fino a 2) nella stessa forma — ordine macro Aircraft-poi-Account preservato da `registerFlight`/5.1. `cancelFlight` usa lo stesso ordine (Aircraft poi Account) anche se non gli serve un alert, per coerenza/robustezza verso future estensioni e per non introdurre un'eccezione all'ordine documentato.
- Saldo-prima POST-storno: `registerFlightCore` legge il proprio aggregate SUBITO dopo essere stato invocato — quando `correctFlight` lo chiama DOPO aver scritto lo storno nella stessa transazione, quella SUM include già il rimborso (read-your-own-writes), rendendo la banda "prima" confrontata quella vera (non quella pre-storno). Verificato via ordine di invocazione nei unit test (`invocationCallOrder`) e via il flusso DB-reale in Playwright MCP.
- Deviazione consapevole rispetto alla spec letterale: il messaggio `deviations` di questa run elenca le uniche due scelte non dettate univocamente dal Contesto (badge "storno" con testo/colore dedicato invece di riusare verbatim le label "rettifica"; niente hyperlink reale per i chip "corretto da"/"correzione di", assente una pagina di dettaglio volo — 5.4 la introdurrà).
- UI: skill `design-taste-frontend` interrogata — dichiaratamente fuori scope per una pagina di dashboard interna (stesso precedente di 5.1/5.2); consultata anche `ui-ux-pro-max` (query su conferme/azioni distruttive) per la spunta di sobrietà sul pattern "conferma con motivo prima di un'azione irreversibile", già coerente con quanto implementato. Nessuna modale: il pannello "Annulla volo" e il form "Correggi volo" sono entrambi pannelli inline, coerenti con `AdjustmentForm`/`packages-panel.tsx`.
- Il form di registrazione ora fa doppio servizio (registrazione/correzione) tramite un `key` di remount (`correctingFlight?.id ?? 'register'`) — stesso pattern di remount-per-defaultValues già usato da `AdjustmentForm`; il campo `reason` resta stato locale plain (non nello schema Zod condiviso), stesso trattamento di `durationMode`.
- `registerFlightSchema` NON è stata toccata (Dev Notes): `correctFlightSchema = registerFlightSchema.extend({ reason })` riusa lo stesso `superRefine` (verificato che `.extend()` su uno ZodObject con superRefine in zod v4 preserva il refine).
- i18n: 651 chiavi it/en verificate simmetriche via script Node ad-hoc (non un test permanente).

### File List

- `prisma/schema.prisma` (enum `AccountMovementType.FLIGHT_CHARGE_REVERSAL`, `Flight.cancelledAt`/`cancelReason`/`correctionOfId`/`correctionOf`/`correctedBy`, doc-comment aggiornati incl. `PackageConsumption`)
- `prisma/migrations/20260707170000_add_flight_reversal/migration.sql`
- `src/server/services/flights.service.ts` (refactor `registerFlightCore`/`resolveFlightInput`, nuove `cancelFlight`/`correctFlight`/`loadRegisteredFlightForReversal`/`isUniqueViolation`)
- `src/server/services/flights.service.test.ts`
- `src/server/services/packages.service.ts` (filtro `flight: { status: { not: 'CANCELLED' } }` sulla groupBy di `listPersonPackages`)
- `src/server/services/packages.service.test.ts`
- `src/lib/schemas/flights.ts` (`cancelFlightSchema`, `correctFlightSchema`, nuovi campi DTO)
- `src/lib/schemas/accounts.ts` (`accountMovementTypeSchema` + `FLIGHT_CHARGE_REVERSAL`)
- `src/lib/schemas/registry.ts`
- `src/lib/schemas/registry.test.ts`
- `src/app/api/v1/flights/[id]/cancel/route.ts`
- `src/app/api/v1/flights/[id]/correct/route.ts`
- `src/app/[locale]/dashboard/flights/flights-manager.tsx`
- `src/app/[locale]/dashboard/flights/page.tsx`
- `src/app/[locale]/dashboard/people/account-panel.tsx`
- `src/app/[locale]/dashboard/people/[id]/page.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx`
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx`
- `messages/it.json`, `messages/en.json`
- `e2e/flight-reversal.spec.ts`
- `.gitignore` (`.playwright-mcp/`, artefatti della verifica interattiva)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: findings — 1 minor (M1, fixato), 1 refuso doc (D1, corretto), nessun must-fix.** Fix applicati dalla sessione principale (terzo commit della story).

Verificato e trovato corretto (review con riproduzioni DB-backed, inclusa concorrenza reale e assert email via Mailpit):
- **Annullo**: ledger = FLIGHT_CHARGE −X + FLIGHT_CHARGE_REVERSAL +X collegati (`reversalOfId`/`flightId`); saldo tornato al pre-volo; **importo storno letto dall'ORIGINALE, mai ricalcolato** (provato cambiando la tariffa a 99999 dopo la registrazione: lo storno usa quella vecchia — AD-4); contaore −minuti con **clamp a 0 verificato** (rettifica manuale a 0 prima dell'annullo); residuo pacchetto ripristinato via SUM filtrata SENZA toccare le righe `PackageConsumption` (row count invariato — storia intatta); `effectiveDate` storno = oggi; CANCELLED + cancelledAt/cancelReason.
- **Correzione**: 60'→30' su pacchetto interamente consumato → il nuovo volo consuma 30' dallo STESSO pacchetto nella stessa tx (read-your-own-writes sul filtro stato); persona A→B → A rimborsata, B addebitata; cambio velivolo → contaori entrambi corretti; **ri-registrazione fallita (velivolo nuovo archiviato) → rollback TOTALE** (nessuno storno orfano, originale ancora REGISTERED); catena di correzioni ok, `correctionOfId` unique in PG.
- **Concorrenza**: doppio annullo → esattamente uno riesce, l'altro 409 (backstop P2002), UNA sola riga di storno; correzioni incrociate su velivoli A↔B → nessun deadlock (lock ordinati `IN ... ORDER BY id FOR UPDATE`, Aircraft poi Account).
- **Alert FR-27**: correzione che peggiora la banda → ESATTAMENTE UNA email (saldo-prima letto DOPO lo storno, verificato via Mailpit); annullo → nessuna email.
- **Refactor**: comportamento esterno di `registerFlight` invariato (lock shape/ordine, codici errore) — i 60 test 5.1/5.2 verdi senza modifiche ai mock; `correctFlightSchema.extend` preserva il superRefine exactly-one a runtime (zod 4.4 verificato).
- **UI/i18n**: label "Storno volo"/"Flight reversal" nei due switch, badge reversal generalizzato, chiavi simmetriche.
- Gate reviewer: tsc pulito, 571/571 unit, lint pulito; il fallimento `next build` del reviewer è stato provato **ambientale** (identico sul commit padre; NODE_ENV leakage) — build ri-verificata VERDE dalla sessione principale in env pulito, prima e dopo i fix.

Findings e risoluzione:
- **M1 (minor, FIXATO)** — se una rettifica manuale (3.3) ha già occupato lo slot unique `reversalOfId` del FLIGHT_CHARGE, annullo/correzione rispondevano 409 "Flight is already cancelled." con volo ancora REGISTERED (blocco corretto, messaggio falso). Fix: pre-check esplicito in `loadRegisteredFlightForReversal` → 409 "This flight's charge has already been reversed by a manual adjustment."; backstop P2002 riformulato status-agnostic ("This flight's charge has already been reversed."). +2 unit test (cancel + correct). Il flusso resta correttamente bloccato: i conti sono già stati sistemati a mano.
- **D1 (doc, CORRETTO)** — refuso "17 migrazioni" → 16 nel Dev Agent Record.

### Final gates (fix run, sessione principale)

lint 0 errori (warning benigno noto), typecheck pulito, **573/573 unit** (571 + 2 nuovi), `next build` verde in env pulito; e2e 92/92 dal run dev (fix = solo messaggi 409 + pre-check, nessuna asserzione e2e sui messaggi — suite completa ri-verificata a fine epic).

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
- 2026-07-07: Implemented (Sonnet 5 single dev agent, xhigh) — all tasks complete, all gates green. Status → ready-for-review.
- 2026-07-07: Review Opus 4.8 xhigh — 1 minor + 1 doc typo; M1/D1 fixati in sessione. Status → done.
