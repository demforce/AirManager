---
baseline_commit: b6c3ae5
---

# Story 5.3: Correzione e annullamento volo con storno

Status: ready-for-dev

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

- [ ] Task 1: Modello + migrazione (AC 1/2)
  - [ ] Enum `AccountMovementType`: aggiungere **`FLIGHT_CHARGE_REVERSAL`** (additivo, stessa procedura/avvertenze di 4.4/5.1).
  - [ ] `Flight`: aggiungere `cancelledAt DateTime?`, `cancelReason String?`, `correctionOfId String? @unique` + self-FK (`correctionOf Flight? @relation("FlightCorrection", ...)`, `correctedBy Flight? @relation("FlightCorrection")`). Aggiornare doc-comment del modello (lifecycle REGISTERED→CANCELLED, correzione = catena).
  - [ ] Migrazione a mano (timestamp dopo `20260707160000`), `migrate deploy` + `generate`. Verificare ALTER TYPE, ADD COLUMN, unique su `correctionOfId`, self-FK.
- [ ] Task 2: Service (AC 1/2/3/4)
  - [ ] Refactor: estrarre `registerFlightCore(tx, actor, input, rates, …)` da `registerFlight` (guardie di dominio pre-tx restano in `registerFlight`/`correctFlight` secondo il punto del Contesto; il core in-tx fa: consumo pacchetti → Flight.create → movimento → contaore, con saldo-prima/banda). `registerFlight` resta identico all'esterno (nessun cambio di contratto API; i test 5.1/5.2 devono restare verdi con al più aggiornamenti di mock).
  - [ ] `cancelFlight(actor, flightId, { reason })`: `authorize('flights.manage')`; volo esiste (con il suo movimento FLIGHT_CHARGE via relazione) → 404; già CANCELLED → 409; UNA tx: lock Aircraft (ordinato) → `Flight.update` (status CANCELLED, cancelledAt now, cancelReason) → movimento `FLIGHT_CHARGE_REVERSAL` (`+|amountCents originale|`, `reversalOfId`, `flightId`, effectiveDate oggi, description con motivo, actorUserId) con catch P2002 → 409 → contaore `max(0, − minutes)`. Nessun alert. Ritorna DTO volo aggiornato + overview conto.
  - [ ] `correctFlight(actor, flightId, input /* registerFlight fields + reason */)`: `authorize`; guardie: volo esiste → 404, già CANCELLED → 409; guardie 5.1 complete sui DATI NUOVI (404/422 specifici, tariffe alla NUOVA flightDate lette pre-tx); UNA tx nell'ordine del Contesto (lock ordinati su tutti gli Aircraft/Account coinvolti → storno completo del volo originale → saldo-prima del conto della persona NUOVA → `registerFlightCore` con `correctionOfId` = volo originale) → alert post-commit se banda peggiorata. Ritorna volo nuovo + overview conto (persona nuova).
  - [ ] Consumo: aggiornare le DUE groupBy esistenti (in-tx `registerFlight`/core e `listPersonPackages`) con `flight: { status: { not: 'CANCELLED' } }`; aggiornare i doc-comment 5.2 che rimandavano la decisione.
  - [ ] DTO `FlightListItem`: aggiungere `cancelledAt`, `cancelReason`, `correctionOfId`, `correctedByFlightId` (dalla relazione inversa, `null` se nessuna).
- [ ] Task 3: API + OpenAPI (AC 3/4)
  - [ ] `POST /api/v1/flights/[id]/cancel` e `POST /api/v1/flights/[id]/correct` (apiRoute, person-scoped params come le route `[id]` esistenti). `cancelFlightSchema { reason: min 1 max 500 }`; `correctFlightSchema = registerFlightSchema.extend({ reason })`. Registry (tag `Flights`) + coverage test.
- [ ] Task 4: UI (AC 1/2) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE**, stile minimalista editoriale
  - [ ] `/dashboard/flights` (flights-manager.tsx): nella tabella voli recenti, badge di stato (ANNULLATO in tono muted/rosso sobrio; REGISTERED senza badge o neutro) e, per i voli REGISTERED, azioni "Annulla" (chiede motivo, conferma, mostra esito) e "Correggi" (riapre il form di registrazione precompilato coi dati del volo + campo motivo; submit → correct API; esito col breakdown nuovo). Voli annullati: mostrare motivo/quando (tooltip o riga secondaria) e link/chip "corretto da"/"correzione di" quando presenti. UX sobria, niente modali barocche — coerenza col pannello esistente.
  - [ ] Estratto conto: case `FLIGHT_CHARGE_REVERSAL` (+ chiavi i18n `flightChargeReversal`) nei due switch tipo-movimento + `accountMovementTypeSchema`; il badge "rettifica di..." esistente (reversalOfId) deve funzionare anche per questo tipo (verificare, era per ADJUSTMENT).
  - [ ] Packages panel: il residuo risale dopo un annullo (automatico via SUM filtrata — verificare in UI).
  - [ ] i18n simmetrici it/en.
- [ ] Task 5: Test (AC tutti)
  - [ ] Unit (mock prisma, estendere `flights.service.test.ts` + `packages.service.test.ts`): cancel — 403 non staff, 404 volo, 409 già cancellato, P2002 → 409, movimento +totale con reversalOfId/flightId/description, status+cancelledAt+cancelReason, contaore −minuti e clamp a 0, NESSUN alert; correct — 403/404/409, 422 sui dati nuovi (almeno un caso: velivolo nuovo archiviato), tx unica con ordine storno→saldo-prima→core, `correctionOfId` settato, minuti ripristinati riusabili nella stessa correzione (mock della groupBy con filtro status), alert se banda peggiora col saldo-prima POST-storno; groupBy: filtro `status not CANCELLED` presente in entrambe (query-shape assertion); `listPersonPackages` residuo risalito dopo cancel.
  - [ ] e2e (`e2e/flight-reversal.spec.ts`): flusso completo — vendi pacchetto, registra volo scuola (pacchetto + istruttore), annulla con motivo → saldo tornato al valore pre-volo (estratto: FLIGHT_CHARGE negativo + STORNO positivo collegato), residuo pacchetto ripristinato nel panel, contaore ridotto (pagina aircraft), volo ANNULLATO con motivo nel registro; secondo annullo → 409 envelope; correzione minuti (es. 60'→30') → volo vecchio ANNULLATO + nuovo REGISTERED collegati, saldo netto coerente, pacchetto consumato 30'; pilota → 403 su entrambe le API. Nomi run-unique.
  - [ ] Regressione: tutte le suite 5.1/5.2 verdi (il refactor core non cambia il contratto).

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

_(da compilare dal dev agent)_

### Debug Log References

### Completion Notes List

### File List

## Review Record

_(da compilare dopo la review)_

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
