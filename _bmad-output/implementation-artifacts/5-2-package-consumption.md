---
baseline_commit: 8fdd207
---

# Story 5.2: Consumo pacchetti nel calcolo del volo

Status: ready-for-dev

## Story

As a pilota con un pacchetto ore,
I want che i miei voli scalino prima dal pacchetto,
so that lo sconto acquistato venga applicato da solo (FR-13 consumo).

## Acceptance Criteria

1. **Given** una persona con un pacchetto valido per il velivolo (residuo 60'), **When** lo staff registra un volo di 70' su quel velivolo, **Then** 60' vengono scalati dal pacchetto (righe **`PackageConsumption`** per-volo, AD-6), 10' addebitati a tariffa piena **pro-rata** (`round(rate × 10 / 60)`), e la scomposizione (minuti coperti, per-pacchetto, importo residuo) è leggibile dal movimento/DTO del volo.
2. **Given** due pacchetti idonei non esauriti, **When** registro un volo, **Then** scala PRIMA quello con acquisto più vecchio (AD-6), poi il successivo; i pacchetti scaduti, esauriti o per altri velivoli non vengono toccati.
3. **And** la tariffa istruttore non è MAI coperta dal pacchetto (AD-6); il residuo mostrato ovunque (`computeRemainingMinutes`) ora sottrae il consumo.
4. **And** unit test coprono: pacchetto esatto, eccedenza, multi-pacchetto, pacchetto scaduto, velivolo non idoneo (AC espliciti dell'epica) — più esaurito, copertura totale (movimento a 0), ordine FIFO.

## Contesto e decisioni chiave (LEGGERE PRIMA DI CODIFICARE)

- **AD-6 è la regola cardine**: un volo idoneo scala minuti dal pacchetto non esaurito e non scaduto con acquisto più vecchio, poi dai successivi; l'eccedenza va a tariffa piena; il pacchetto copre SOLO il costo velivolo, mai l'istruttore; il consumo è registrato per-volo (`PackageConsumption`: volo, pacchetto, minuti) per rendere reversibile lo storno (story 5.3).
- **Idoneità di un pacchetto per un volo** (tutte e quattro, calcolate dentro la transazione — vedi sotto):
  1. appartiene alla persona del volo (`HourPackage.personId === flight.personId`);
  2. il tipo include il velivolo del volo (`PackageTypeAircraft` con `aircraftId` del volo — la relazione va guardata sul TIPO del pacchetto venduto; un velivolo archiviato DOPO l'associazione resta idoneo, decisione 4.3 F1);
  3. non scaduto ALLA DATA DEL VOLO: `expiresAt == null || expiresAt >= flightDate` (il giorno di scadenza è valido — stessa boundary di `isExpired`; il confronto è vs `flightDate`, NON vs oggi: un volo retrodatato a quando il pacchetto era valido consuma legittimamente);
  4. già acquistato alla data del volo: `effectiveDate <= flightDate` (un volo retrodatato a PRIMA dell'acquisto non può consumare un pacchetto che non esisteva);
  e ovviamente residuo > 0 (calcolato, mai colonna).
- **Ordine di consumo (AD-6 "purchasedAt più vecchio")**: `effectiveDate asc, createdAt asc, id asc` (la data valuta della vendita è il "purchased", `createdAt` e `id` sono i tie-break deterministici — pattern review 3.1 F3). Allocazione greedy FIFO: per ogni pacchetto `take = min(residuo, minutiRimanenti)`, finché i minuti del volo sono coperti o i pacchetti finiscono.
- **Il calcolo si SPOSTA dentro la transazione**: in 5.1 gli importi si calcolano prima della tx (dipendono solo dalle tariffe append-only). Ora `aircraftAmountCents` dipende dal residuo pacchetti, che è stato concorrente: la lettura dei pacchetti idonei + SUM consumi e l'allocazione devono avvenire DENTRO la `$transaction`, DOPO il lock `FOR UPDATE` sulla riga `Account` — i pacchetti appartengono alla stessa persona del conto, quindi quel lock (già preso in 5.1) è il punto di serializzazione anche per il consumo: due voli concorrenti della stessa persona non possono sovra-consumare lo stesso pacchetto. Documentarlo nel doc-comment. I lookup TARIFFE restano fuori dalla tx (append-only, come 5.1). Il confronto bande saldo usa il totale calcolato in-tx (la struttura post-commit di 5.1 non cambia).
- **Pro-rata (AC 1, PRD FR-13)**: `chargedMinutes = minutes − coveredMinutes`; `aircraftAmountCents = Math.round(rate × chargedMinutes / 60)` (mai "sconto percentuale" sull'importo pieno). Istruttore INVARIATO: `instructorAmountCents = round(instructorRate × minutes / 60)` sui minuti PIENI del volo, mai ridotti dal pacchetto.
- **Copertura totale**: se i pacchetti coprono tutti i minuti e non c'è istruttore, il totale è 0 → il movimento `FLIGHT_CHARGE` nasce COMUNQUE con `amountCents: 0` (riga di estratto che documenta il volo e la copertura; saldo invariato — analogo consapevole del `PACKAGE_PURCHASE` a 0 di 4.4). Il movimento non è mai omesso.
- **Snapshot (AD-4)**: nuova colonna `Flight.packageCoveredMinutes Int @default(0)` (default per i voli 5.1 esistenti) + le righe `PackageConsumption` come dettaglio per-pacchetto. `aircraftAmountCents` resta lo snapshot dell'IMPORTO ADDEBITATO (ora = pro-rata sull'eccedenza). La scomposizione nel DTO/UI si legge SOLO da questi snapshot, mai ricalcolando.
- **Residuo (AD-3, punto unico)**: `computeRemainingMinutes` (packages.service.ts) si estende: `includedMinutes − consumedMinutes` dove `consumedMinutes = SUM(PackageConsumption.minutes)` del pacchetto — la firma cambia per ricevere il consumo (es. `{ includedMinutes, consumedMinutes }`); `listPersonPackages`/`sellPackage` alimentano la SUM via query aggregata (un pacchetto appena venduto ha consumo 0). MAI una colonna contatore. In 5.2 si somma su TUTTE le righe di consumo (lo storno 5.3 deciderà come ripristinare — non anticipare qui).
- **Consumo e voli retrodatati**: l'allocazione consuma dal residuo DISPONIBILE AL MOMENTO DELLA REGISTRAZIONE, in ordine di acquisto — non si riscrive la storia dei consumi già registrati se arriva un volo con data precedente (le registrazioni reali sono quasi sempre cronologiche; il registro non implementa un re-play). Documentare questa scelta nel doc-comment del service.
- **Nessuna scelta manuale**: lo staff non sceglie il pacchetto — l'applicazione è automatica ("venga applicato da solo", FR-13). Nessun input API nuovo: `registerFlightSchema` NON cambia (se non per la response).
- **Tipo di volo irrilevante per l'idoneità**: PRIVATE/SCHOOL/OTHER consumano tutti (il PRD non restringe; la scuola con istruttore consuma per il velivolo e paga l'istruttore per intero — è l'UJ-4 del PRD, Luca+Anna).

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/2)
  - [ ] Nuovo modello `PackageConsumption`: `id String @id @default(cuid())`; `flightId` + FK `Flight` (back-relation `Flight.packageConsumptions PackageConsumption[]`); `hourPackageId` + FK `HourPackage` (back-relation `HourPackage.consumptions PackageConsumption[]`); `minutes Int` (interi, > 0 — AD-2); `createdAt`. `@@unique([flightId, hourPackageId])` (un volo consuma da un pacchetto al più una volta — e rende deterministico lo storno 5.3), `@@index([hourPackageId])`. FK RESTRICT (default Prisma) su entrambe. Doc-comment: registro per-volo AD-6, reversibilità 5.3, mai update/cancellazione in 5.2.
  - [ ] `Flight`: aggiungere `packageCoveredMinutes Int @default(0)` (snapshot totale minuti coperti; default 0 corretto per i voli 5.1 pregressi). Aggiornare il doc-comment del modello.
  - [ ] Migrazione a mano (procedura consolidata, timestamp dopo `20260707150000`), `migrate deploy` + `generate`. Verificare CREATE TABLE, unique, FK, ADD COLUMN con default.
- [ ] Task 2: Service — consumo dentro la transazione (AC 1/2/3)
  - [ ] `flights.service.ts#registerFlight`: dentro la `$transaction`, DOPO il lock `FOR UPDATE` su `Account`: caricare i pacchetti CANDIDATI della persona (filtro DB: `personId`, `effectiveDate <= flightDate`, `expiresAt null || >= flightDate`, tipo con `eligibleAircraft` contenente `aircraftId`) in ordine `effectiveDate asc, createdAt asc, id asc`, con la SUM dei consumi esistenti per ciascuno (aggregata in una query — `groupBy` su `hourPackageId` o include equivalente, NON una query per pacchetto). Allocazione greedy FIFO sui residui > 0; creare le righe `PackageConsumption` (solo `take > 0`); `packageCoveredMinutes = Σ take`; `chargedMinutes = minutes − coveredMinutes`; `aircraftAmountCents = Math.round(rate × chargedMinutes / 60)`; istruttore sui minuti pieni (INVARIATO); movimento `FLIGHT_CHARGE` a `−(aircraftAmountCents + instructorAmountCents)` (può essere 0). `Flight.create` con `packageCoveredMinutes`; il calcolo importi esce dal pre-tx e entra in-tx (le TARIFFE restano lette pre-tx). Il saldo-prima/banda (alert 3.3) non cambia struttura.
  - [ ] DTO `FlightListItem.breakdown`: aggiungere `packageCoveredMinutes`, `chargedMinutes`, e `packageConsumptions: [{ hourPackageId, typeName, minutes }]` (typeName via `hourPackage.packageType.name`). `listFlights` carica la relazione (select annidata, niente N+1).
  - [ ] Descrizione movimento: quando `coveredMinutes > 0`, appendere ` (H:MM da pacchetto)` via `formatMinutes` — es. `Volo I-ABCD 2026-07-07 — 1:10 (1:00 da pacchetto)`.
  - [ ] `packages.service.ts`: estendere `computeRemainingMinutes({ includedMinutes, consumedMinutes })` (resta il punto UNICO); `listPersonPackages` e `sellPackage` alimentano `consumedMinutes` con la SUM aggregata (groupBy su `hourPackageId in [...]`, una query); il DTO `HourPackageListItem.remainingMinutes` ora riflette il consumo (aggiungere anche `consumedMinutes` al DTO per trasparenza UI). Aggiornare doc-comment (la promessa "epic 5 estenderà" si realizza qui).
- [ ] Task 3: Schemi/OpenAPI (AC 1)
  - [ ] `src/lib/schemas/flights.ts`: response schema del volo con i nuovi campi breakdown; `src/lib/schemas/packages.ts`: `consumedMinutes` nel list item. Registry: aggiornare i componenti registrati (nessun path nuovo). Coverage test invariati/estesi.
- [ ] Task 4: UI (AC 1/3) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE** (regola utente), stile minimalista editoriale esistente
  - [ ] `/dashboard/flights` (flights-manager.tsx): il pannello scomposizione post-registrazione mostra, quando presente, la riga "Da pacchetto: H:MM" (per-pacchetto se più d'uno, col nome tipo) e i minuti addebitati pro-rata; la tabella voli recenti mostra la copertura (es. colonna durata con badge o nota "di cui H:MM pacchetto" — decidere resa pulita e sobria).
  - [ ] `packages-panel.tsx` (scheda persona + estratto conto): il residuo mostrato ora scende col consumo (già automatico via DTO); mostrare anche i minuti consumati se aiuta la leggibilità (giudizio del dev, coerenza visiva).
  - [ ] i18n `messages/{it,en}.json` simmetrici (chiavi nuove `FlightsPage.*`/`HourPackagesPanel.*` minime necessarie).
- [ ] Task 5: Test (AC 1/2/3/4)
  - [ ] Unit (`flights.service.test.ts` esteso, mock prisma): pacchetto ESATTO (60' su 60' → covered 60, charged 0, movimento = −(0 + eventuale istruttore)); ECCEDENZA (70' con 60' → covered 60, charged 10, importo `round(rate×10/60)`); MULTI-PACCHETTO (60'+30' residui, volo 80' → 60 dal più vecchio, 20 dal secondo, due righe consumo, FIFO per `effectiveDate`); SCADUTO alla data volo (non toccato) e boundary `expiresAt === flightDate` (idoneo); VELIVOLO NON IDONEO (tipo non associato → nessun consumo, tariffa piena); ESAURITO (residuo 0 → salta); acquisto DOPO la data volo (`effectiveDate > flightDate` → non idoneo); copertura TOTALE senza istruttore → movimento a 0 (creato comunque); istruttore MAI coperto (covered pieno + istruttore intero); descrizione con "da pacchetto". `computeRemainingMinutes` esteso: 0 consumo, parziale, esaurito. `listPersonPackages` con consumi aggregati.
  - [ ] e2e (`e2e/flights.spec.ts` esteso o spec dedicato `package-consumption.spec.ts`): via API/UI — vendi pacchetto (tipo associato al velivolo seed), registra volo eccedente → scomposizione UI mostra copertura + pro-rata, estratto conto: movimento col solo importo eccedenza, packages panel: residuo sceso; secondo volo → consuma il residuo rimanente; volo su velivolo NON idoneo → tariffa piena e residuo intatto. Nomi/date run-unique.
- [ ] Task 6: Regressione
  - [ ] I test 5.1 esistenti restano verdi (nessun pacchetto → covered 0, percorso identico a prima). Gate completi come da Dev Notes.

## Dev Notes

- **AD-2**: minuti/centesimi interi; pro-rata con `Math.round` half-up. **AD-3**: residuo SEMPRE derivato (`includedMinutes − SUM`), righe consumo append-only in 5.2. **AD-4**: `packageCoveredMinutes` + consumi = snapshot; mai ricalcolare. **AD-5**: nessun nuovo permesso (tutto dentro `registerFlight`/`listFlights` esistenti). **AD-6**: la regola completa è nel Contesto. **AD-8**: nessun nuovo codice errore (il consumo non fallisce mai il volo — al peggio copre 0).
- **Lezioni review**: lock già in essere (Account) come serializzatore — documentare; query aggregate (no N+1); tie-break deterministici; date-only UTC (`parseDateOnlyUtc`, confronti tipizzati su `@db.Date`); i18n simmetrica; `key={id}`.
- **Cosa NON fare**: niente storno/ripristino minuti (5.3); niente filtri registro (5.4); niente scelta manuale del pacchetto; niente colonna residuo; NON toccare `sellPackage`'s transazione di vendita; NON cambiare la firma dell'API `POST /flights` (input); niente "sconto" sull'istruttore.
- **Ambiente/gate**: come 5.1 (postgres attivo; Mailpit su 127.0.0.1:1025/8025 — se il processo non risponde, rilanciare `/root/go/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025` SOLO con Bash `run_in_background: true`; reset DB prima del run e2e finale; MAI `playwright install`). Gate: lint (warning benigno noto), typecheck, `npx vitest run` (>= 530 + nuovi), `npx next build`, `npx playwright test` (>= 89 + nuovi; flaky noti → re-run in isolamento su DB fresco). UN commit di implementazione (`Story 5.2: <sintesi>`, nessun riferimento AI). NON push.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-13, UJ-4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #AD-6]
- [Source: _bmad-output/implementation-artifacts/5-1-flight-logging-charges.md] — la story su cui questa si innesta (transazione, lock, snapshot, DTO)
- [Source: src/server/services/flights.service.ts#registerFlight, #listFlights] — IL file da estendere
- [Source: src/server/services/packages.service.ts#computeRemainingMinutes, #listPersonPackages] — il punto unico del residuo da estendere
- [Source: prisma/schema.prisma#HourPackage, #PackageTypeAircraft, #Flight] — relazioni per l'idoneità
- [Source: _bmad-output/implementation-artifacts/4-3-package-types.md#Review Record F1] — velivolo archiviato dopo l'associazione resta idoneo

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
