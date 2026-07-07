---
baseline_commit: (set at dev launch — after 4.3 review fixes)
---

# Story 4.4: Vendita pacchetti e residui

Status: ready-for-dev

## Story

As a staff,
I want vendere un pacchetto a una persona,
so that il pagamento e il residuo ore siano tracciati (FR-13 vendita).

## Acceptance Criteria

1. **Given** un `PackageType` **attivo** e una persona con conto, **When** registro la vendita (metodo di pagamento come per le ricariche: CASH/BANK_TRANSFER/POS), **Then** nascono in UNA transazione: un `HourPackage` con **residuo = minuti inclusi** e **scadenza calcolata** (se il tipo prevede `validityMonths`), un `AccountMovement` **`PACKAGE_PURCHASE`**, un `CashMovement` **in entrata** nella categoria **"Pacchetti"**.
2. **And** il titolare vede i **propri** pacchetti con residuo e scadenza nell'estratto conto; lo staff li vede nella **scheda persona**.
3. **And** (completamento AC 2 di 4.3) un `PackageType` con pacchetti venduti NON è eliminabile: `deletePackageType` ora ha il pre-check esplicito → **409** con messaggio chiaro, il backstop P2003 resta; e2e lo prova.

## Contesto e decisioni chiave (LEGGERE PRIMA DI CODIFICARE)

- **Il pagamento è ESTERNO al conto prepagato** (contanti/bonifico/POS, come una ricarica): la cassa incassa il prezzo (`CashMovement` +prezzo, categoria "Pacchetti"), ma il **saldo del conto NON cambia**. L'`AccountMovement PACKAGE_PURCHASE` è la **riga di estratto conto** che rende visibile l'acquisto al titolare (AC 2): ha **`amountCents = 0`** (partita chiusa: pagamento ricevuto e pacchetto consegnato si compensano; il prezzo/metodo vivono sul movimento come `paymentMethod` + sullo snapshot `HourPackage`). Documentare questo nel doc-comment del service E del modello. NON addebitare il saldo: comprare un pacchetto pagato in POS non deve mandare il conto in rosso.
- **Residuo = CALCOLATO, mai contatore mutabile** (AD-3, lezione "totali sempre SUM"): non esiste una colonna `remainingMinutes`. In 4.4 il consumo non esiste ancora (arriva con epic 5), quindi `remainingMinutes` esposto nel DTO = `includedMinutes - 0`. Il service espone il punto unico di calcolo (`computeRemainingMinutes(pkg)` o equivalente) che epic 5 estenderà sottraendo i minuti consumati (SUM sui futuri movimenti di consumo). NON creare il modello di consumo adesso.
- **Snapshot alla vendita (AD-4)**: `HourPackage` copia `includedMinutes` e `pricePaidCents` dal tipo AL MOMENTO della vendita, e materializza `expiresAt` (data-only) = `effectiveDate + validityMonths` (se presente). Modifiche successive del `PackageType` non toccano MAI i pacchetti venduti. Il nome del tipo si mostra via relazione (il tipo non è eliminabile una volta venduto → FK RESTRICT, AC 3).

## Tasks / Subtasks

- [ ] Task 1: Modello + migrazione (AC 1/3)
  - [ ] Enum `AccountMovementType`: aggiungere **`PACKAGE_PURCHASE`** (migrazione additiva `ALTER TYPE ... ADD VALUE`; ATTENZIONE: il nuovo valore NON può essere usato nella stessa migrazione/transazione che lo aggiunge — la migrazione aggiunge solo il valore, l'uso è a runtime).
  - [ ] Nuovo modello `HourPackage`: `id String @id @default(cuid())`; `personId String` + FK `Person` (AD-11: il pacchetto appartiene alla PERSONA, mai al profilo — sopravvive alla transizione allievo→pilota) + back-relation `Person.hourPackages HourPackage[]`; `packageTypeId String` + FK `PackageType` (**onDelete RESTRICT**, back-relation `PackageType.soldPackages HourPackage[]` — è la FK che rende reale il backstop P2003→409 di 4.3); snapshot `includedMinutes Int` e `pricePaidCents Int` (AD-2/AD-4); `paymentMethod PaymentMethod` (obbligatorio, riuso enum 3.1); `effectiveDate DateTime @db.Date` (data valuta vendita, convenzione `AccountMovement.effectiveDate`); `expiresAt DateTime? @db.Date` (snapshot calcolato, `null` = senza scadenza); `accountMovementId String @unique` + FK al `PACKAGE_PURCHASE` gemello (traccia, pattern `CashMovement.accountMovementId`); `actorUserId String` + FK `User` (+ back-relation `User.hourPackagesSold HourPackage[]`); `createdAt`. `@@index([personId])`, `@@index([packageTypeId])`. Doc-comment: append-only nello spirito (nessun update/delete API in 4.4; storno vendita = epic 5+ se servirà), residuo mai persistito.
  - [ ] Migrazione a mano (stessa procedura Prisma 7 di 4.3, timestamp dopo `20260707130000`), poi `migrate deploy` + `generate`. Verificare `ALTER TYPE`, `CREATE TABLE "HourPackage"`, FK RESTRICT su `packageTypeId`, unique su `accountMovementId`.
- [ ] Task 2: Helper data (AC 1)
  - [ ] In `src/lib/date-only.ts`: nuovo `addMonthsClampUtc(date, months)` — somma mesi in UTC **clampando al fine mese** (31 gen + 1 mese = 28/29 feb, MAI overflow al mese successivo). Unit test dedicati (fine mese, anno bisestile, dicembre→gennaio).
- [ ] Task 3: Service (AC 1/2/3)
  - [ ] `sellPackage(actor, personId, input { packageTypeId, paymentMethod, effectiveDate, description? })` in nuovo `packages.service.ts` — `authorize(actor, 'finance.manage')` (operazione di sportello come `recordTopUp`, NON `settings.manage`). Ordine guardie: persona esiste → 404; persona archiviata → 409; `PackageType` esiste → 404; tipo `isActive: false` → 409 `ConflictError('This package type is inactive.')`; categoria cassa **"Pacchetti"** `isActive: true` risolta PRIMA della transazione (fail-fast `Error` operazionale se manca/disattivata — pattern "Ricariche" di `recordTopUp`). Poi UNA `prisma.$transaction`: upsert `Account` su `personId` (get-or-create, come top-up) → `AccountMovement` (`type: PACKAGE_PURCHASE`, **`amountCents: 0`**, `paymentMethod`, `description`, `effectiveDate`, `actorUserId`) → `HourPackage` (snapshot `includedMinutes`/`pricePaidCents` dal tipo, `expiresAt = validityMonths ? addMonthsClampUtc(effectiveDate, validityMonths) : null`, `accountMovementId`) → `CashMovement` (**`amountCents: +pricePaidCents`**, categoria "Pacchetti", stessa `effectiveDate`, `description` es. `Pacchetto <nome> — <cognome nome>`, `actorUserId`; NB: `accountMovementId` del CashMovement resta legato al movimento conto come nel top-up). Ritorna il pacchetto creato + overview conto.
  - [ ] `listPersonPackages(actor, personId)` — access: `people.read` OPPURE own-access (`self.read` + `actor.personId === personId`, check PRIMA della query — pattern estratto conto 3.2). DTO `HourPackageListItem`: `id`, `typeName` (via relazione), `includedMinutes`, `remainingMinutes` (**calcolato**, oggi `= includedMinutes`), `pricePaidCents`, `paymentMethod`, `effectiveDate`, `expiresAt`, `isExpired` (calcolato vs oggi UTC date-only), `createdAt`, e `actorEmail` SOLO se il caller ha `people.read` (condizionale come 3.2). Ordine `effectiveDate desc, id desc`, `take: 500`.
  - [ ] **Aggiornare `deletePackageType` (4.3, AC 3)**: pre-check esplicito `_count.soldPackages > 0` → 409 `ConflictError('This package type has sold packages — deactivate it instead.')` PRIMA del delete; il catch P2003 resta come backstop di concorrenza (vendita che si infila tra check e delete). Aggiornare i unit test di 4.3 di conseguenza (mock `_count`).
  - [ ] Statement 3.2: verificare che le righe `PACKAGE_PURCHASE` (amount 0) compaiano correttamente nell'estratto conto esistente (nessun filtro per tipo); la label del tipo movimento va aggiunta alle traduzioni dell'estratto se le mostra per-tipo.
- [ ] Task 4: API + OpenAPI (AC 1/2)
  - [ ] `POST /api/v1/people/{id}/packages` (201, body `sellPackageSchema`) e `GET /api/v1/people/{id}/packages` — person-scoped come `.../account/...` e `.../instructor-rates`. `sellPackageSchema`: `packageTypeId` string min 1; `paymentMethod` enum (riuso schema top-up); `effectiveDate` `z.iso.date()`; `description` `.max(500).optional()`. Registrare componenti + path in `registry.ts` (tag `['People']` o `['Finance']` — coerente con l'account: guardare il tag di `/people/{id}/account` e usare lo stesso; POST `errorResponses(401,403,404,409,422)`, GET `(401,403,404,422)`) + coverage in `registry.test.ts`.
- [ ] Task 5: UI (AC 2) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE** (regola utente), coerenza con lo stile minimalista editoriale esistente
  - [ ] **Scheda persona** (`/dashboard/people/[id]/page.tsx`): sostituire il segnaposto `hoursPackages` ("Pacchetti ore", story 2.3) con un vero `packages-panel.tsx` client component: lista pacchetti (tipo, residuo `H:MM` via `formatMinutes`, prezzo pagato, scadenza o "—", badge "scaduto" se `isExpired`), e form "Vendi pacchetto" visibile solo con `finance.manage`: select dei `PackageType` **attivi** (da `listPackageTypes`), metodo di pagamento, data valuta (default oggi), descrizione opzionale; successo → refresh lista + saldo. 409 (tipo disattivato) mappato a messaggio chiaro; `key={personId}`. NON toccare gli altri segnaposto.
  - [ ] **Estratto conto** (`/dashboard/people/[id]/account/page.tsx`): sezione "I miei pacchetti" sopra/accanto ai movimenti con residuo e scadenza (visibile al titolare E allo staff, dati da `listPersonPackages` — il service è già il guardiano). Le righe `PACKAGE_PURCHASE` nello statement mostrano la descrizione e importo 0 senza rompere il layout.
  - [ ] i18n `messages/{it,en}.json` simmetrici (`PersonDetailPage.packages.*`, chiavi statement se servono).
- [ ] Task 6: Test (AC 1/2/3)
  - [ ] Unit (`packages.service.test.ts`, mock prisma): permessi (`sellPackage` pilota/istruttore → Forbidden; `listPersonPackages` own ok, altrui senza `people.read` → Forbidden, check prima della query); persona 404/archiviata 409; tipo 404/inattivo 409; categoria "Pacchetti" mancante/disattivata → Error operazionale; transazione crea i 3 record con snapshot corretti e `amountCents: 0` sul movimento conto / `+prezzo` sulla cassa; `expiresAt` con e senza `validityMonths`; `actorEmail` condizionale; `isExpired` boundary (scade oggi = non scaduto? decidere: scaduto se `expiresAt < oggi`, il giorno di scadenza è ancora valido — documentare); `deletePackageType` pre-check 409. `addMonthsClampUtc`: fine mese/bisestile/rollover anno. Schema 422 (paymentMethod invalido, data malformata, description > 500).
  - [ ] e2e (`e2e/package-sale.spec.ts`): admin/staff crea tipo (o riusa da API), vende a una persona con metodo POS → scheda persona mostra il pacchetto con residuo pieno e scadenza; estratto conto del titolare (login pilota seed se ha personId, o utente creato ad hoc) mostra pacchetto + riga PACKAGE_PURCHASE a importo 0 e saldo INVARIATO; registro cassa mostra l'entrata "Pacchetti" col prezzo; **DELETE del tipo venduto → 409** con messaggio chiaro (AC 3); vendita con tipo disattivato → 409; pilota tenta `POST /packages` → 403 envelope. Nomi/date run-unique.

## Dev Notes

- **AD-2**: centesimi e minuti interi; saldo del conto INVARIATO dalla vendita (unit test esplicito: SUM movimenti prima == dopo). **AD-3**: `HourPackage` senza API di update/delete; residuo derivato. **AD-4**: snapshot + `expiresAt` materializzato. **AD-5**: `authorize()` prima di tutto; own-access nel service. **AD-8**: envelope errori standard.
- **Lezioni review**: pre-check + backstop (P2002/P2003); guardie di stato DOPO il 404 di esistenza; niente `Date` JS in raw SQL (solo query tipizzate qui); `key={id}`; i18n simmetrica; denaro locale-aware; date-only UTC via `src/lib/date-only.ts` (MAI `new Date(anno, mese, ...)` locale).
- **Cosa NON fare**: niente consumo/decremento minuti (epic 5); niente storno vendita (quando servirà sarà uno storno coordinato conto+cassa+pacchetto); niente acquisto "da saldo" (fuori scope, il pagamento è esterno); niente UI listino nuova (esiste da 4.3); non toccare `recordTopUp`.
- **Ambiente/gate**: come 4.3 (postgres attivo, Mailpit via Bash `run_in_background`, reset DB prima del run e2e finale; MAI `playwright install`). Gate: lint (warning benigno noto), typecheck, `npx vitest run` (>= 437 attesi), `npx next build`, `npx playwright test` (>= 81 attesi). UN commit di implementazione (`Story 4.4: <sintesi>`, nessun riferimento AI). NON push.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4]
- [Source: _bmad-output/implementation-artifacts/4-3-package-types.md] — listino, service/UI da estendere (deletePackageType, packages page)
- [Source: src/server/services/accounts.service.ts#recordTopUp] — IL pattern della vendita (categoria fail-fast, upsert account, transazione conto+cassa)
- [Source: src/server/services/accounts.service.ts#listAccountMovements] — own-access + actorEmail condizionale (3.2)
- [Source: prisma/schema.prisma#AccountMovement, #CashMovement, #PackageType] — enum, twin pattern, FK
- [Source: src/lib/date-only.ts, src/lib/time.ts, src/lib/money.ts] — helper da riusare/estendere
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4, #AD-5, #AD-8]

## Dev Agent Record

### Agent Model Used

_(da compilare dal dev agent)_

### Debug Log References

### Completion Notes List

### File List

## Review Record

_(da compilare in review)_

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
