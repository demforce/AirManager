# Story 3.1: Conto prepagato e ricariche

Status: ready-for-dev

## Story

As a staff,
I want registrare ricariche sul conto di una persona,
so that il credito sia aggiornato e tracciato (FR-25).

## Acceptance Criteria

1. **Given** una Persona con profilo pilota o allievo, **When** viene attivato il profilo, **Then** la persona ha un Conto (uno solo per persona, AD-11) con saldo calcolato come SUM dei movimenti — mai un campo saldo scritto a mano (AD-3).
2. **Given** il permesso staff, **When** registro una ricarica (importo in centesimi, metodo contanti/bonifico/POS, data, note), **Then** nasce un `AccountMovement` immutabile di tipo TOP_UP e un `CashMovement` automatico in entrata con categoria "Ricariche" (seed).
3. **And** i movimenti non hanno API di update/delete; il saldo della scheda persona si aggiorna.

## Tasks / Subtasks

- [ ] Task 1: Modelli e migrazione (AC: tutte)
  - [ ] `Account`: `id`, `personId String @unique` (1-a-0/1 su Person, AD-11 — il conto appartiene alla PERSONA, mai al profilo: la transizione allievo→pilota non lo tocca), `createdAt`/`updatedAt`. **NESSUNA colonna saldo** (AD-3: saldo = `SUM(amountCents)`, sempre calcolato)
  - [ ] `AccountMovement` (ledger, append-only): `id`, `accountId` FK (`@@index`), `type AccountMovementType` (enum: per ora solo `TOP_UP` — `ADJUSTMENT` arriva in 3.3, addebiti volo in epic 5: l'enum cresce per migrazione, non pre-popolare valori non usati), `amountCents Int` (FIRMATO: ricarica positiva; AD-2 centesimi interi), `paymentMethod PaymentMethod?` (enum `CASH | BANK_TRANSFER | POS`, valorizzato per TOP_UP), `description String?`, `effectiveDate DateTime @db.Date` (data valuta, pattern courseStartDate 2.2), `actorUserId` FK su User (chi ha registrato — servirà alla vista staff di 3.2), `reversalOfId String? @unique` self-FK (storno AD-3 — usato da 3.3, il campo nasce ora perché è l'ossatura del ledger), `createdAt`
  - [ ] `CashCategory`: `id`, `name String @unique`, `isActive Boolean @default(true)`, timestamps. Seed COMPLETO (3.4 lo dà per assunto): Ricariche, Pacchetti, PPR, Carburante, Assicurazione, Manutenzione, Utenze, Altro (idempotente)
  - [ ] `CashMovement` (ledger cassa, append-only): `id`, `categoryId` FK, `amountCents Int` (FIRMATO: entrata +, uscita −), `description String?`, `effectiveDate @db.Date`, `actorUserId` FK, `accountMovementId String? @unique` FK (aggancia il CashMovement automatico alla ricarica che l'ha generato — tracciabilità e idempotenza), `reversalOfId String? @unique` self-FK, `createdAt`
  - [ ] Migrazione col workaround sandbox; seed: Account per la Person di `pilot@airmanager.local` (ha già PilotProfile attivo)
- [ ] Task 2: Service + API (AC: tutte)
  - [ ] NUOVO `accounts.service.ts` (spine: `services/accounts`): `getAccountOverview(actor, personId)` → `{ account: {id, createdAt} | null, balanceCents }` — lettura con la STESSA regola own-access di `getPerson` 2.3 (`people.read` OPPURE `self.read`+`actor.personId===personId`, ownership check PRIMA della query); saldo con `prisma.accountMovement.aggregate({ _sum: { amountCents } })`, mai colonne; `recordTopUp(actor, personId, {amountCents (int >0, cap INT max), paymentMethod, effectiveDate, description?})` con `authorize(actor,'finance.manage')` — in **UNA transazione**: get-or-create `Account` (upsert su personId), crea `AccountMovement` TOP_UP e il `CashMovement` gemello (categoria "Ricariche" cercata per nome nel seed, `accountMovementId` collegato, stesso importo positivo, stesso actor/data)
  - [ ] Creazione conto all'attivazione profilo (AC 1): in `upsertProfile` (people.service), quando `type` è `pilot` o `student`, upsert `Account` nella STESSA operazione (estendere a `$transaction` se serve) — idempotente, mai due conti (unique su personId); il profilo istruttore NON crea conto
  - [ ] NESSUNA API di update/delete sui movimenti (AC 3) — nemmeno admin
  - [ ] Route con `apiRoute()`: `GET /api/v1/people/[id]/account` (overview: saldo + esistenza conto), `POST /api/v1/people/[id]/account/top-ups`. Schemi in NUOVO `src/lib/schemas/accounts.ts` (import `z` da `zod-with-openapi`!), component schemas + paths nel registry, coverage assertion estesa
- [ ] Task 3: UI (AC: 2, 3)
  - [ ] Scheda persona 2.3: il segnaposto **Saldo conto** diventa reale — saldo formattato EUR (da `src/lib/money.ts` — verificare gli helper esistenti e riusarli) o "Nessun conto attivo" se null; visibile a staff e al titolare (own)
  - [ ] Per chi ha `finance.manage`: azione "Registra ricarica" nella sezione saldo (pannello con importo in EUR convertito a centesimi SOLO al submit — l'input utente è in euro con 2 decimali, il wire format resta centesimi interi; metodo select contanti/bonifico/POS; data default oggi; note opzionali ''→null via setValueAs; `key` di remount; cap INT max) + ultimi 5 movimenti (tipo, data, importo firmato) come anteprima — l'estratto conto completo è la 3.2, NON costruirlo
  - [ ] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche (nuova sezione o estensione `PersonDetailPage`)
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit service: saldo = somma firmata (zero movimenti → 0); own-access matrix su getAccountOverview (staff ok, titolare ok, pilota su conto altrui → Forbidden PRIMA della query, personId null → Forbidden); recordTopUp: transazione completa (Account upsert + AccountMovement + CashMovement con categoria Ricariche e accountMovementId), importo ≤0 rifiutato dallo schema, pilota → ForbiddenError; upsertProfile pilot/student crea Account, instructor no, riattivazione non duplica
  - [ ] e2e (`e2e/accounts-topups.spec.ts`): staff apre scheda del pilota seed → saldo 0,00 €; registra ricarica 100 € contanti → saldo 100,00 € e movimento in anteprima; pilota vede il PROPRIO saldo nella propria scheda; pilota su `POST .../account/top-ups` → 403 envelope

## Dev Notes

- **AD-3 è il vincolo cardine**: ledger append-only, saldo SEMPRE `SUM`, correzioni future via storno (`reversalOfId`) — mai update/delete. `AccountMovement`/`CashMovement` nascono qui: sbagliare l'ossatura ora costa caro negli epic 4/5/8.
- **AD-2**: `amountCents Int` firmato. `src/lib/money.ts` esiste (story 1.1) — verificare helper (formattazione EUR, parsing) e riusarli; MAI float nel dominio: l'input EUR della UI si converte in centesimi con aritmetica intera (es. `Math.round(euros * 100)` va bene SOLO alla boundary UI, documentare).
- **AD-11**: `Account.personId` unique — il conto sopravvive a ogni transizione di profilo (già garantito: 2.2 non tocca Person/Account).
- **Pattern consolidati**: own-access 2.3 (ownership PRIMA della query); transazione con lock 2.5 se serve leggere-poi-scrivere (qui l'upsert Account è atomico di suo; il saldo è una aggregate, niente lock); guardie/`key`/`setValueAs`/cap dalle review 2.2-2.5 (vedi Review Record nei rispettivi story file).
- **`finance.manage` esiste già** (1.3, staff+admin) — NON aggiungere permessi.
- La categoria "Ricariche" viene dal seed: `recordTopUp` la cerca per nome; se manca (DB non seedato) → errore esplicito, non crearla al volo silenziosamente.
- `effectiveDate`: solo data (`@db.Date`), wire `YYYY-MM-DD` — stesso round-trip TZ-safe di `courseStartDate` (2.2, verificato in review).
- e2e flaky su DB sporco → reset (drop/recreate + migrate deploy + seed).
- Nessuna dipendenza npm nuova prevista.
- Ambiente: PostgreSQL su, Mailpit su 1025/8025; MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto), typecheck, Vitest (224+ attesi), `next build`, e2e Playwright (49+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-25]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-5, #AD-8, #AD-11, ERD]
- [Source: _bmad-output/implementation-artifacts/2-3-person-detail.md] — scheda persona (segnaposto saldo), own-access
- [Source: _bmad-output/implementation-artifacts/2-5-aircraft-status-hours.md#Review Record] — pattern transazioni e review-lessons

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
