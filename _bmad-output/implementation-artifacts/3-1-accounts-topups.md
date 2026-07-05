---
baseline_commit: 4ea93e05689bcd16f1d21a670c39033a2297035b
---

# Story 3.1: Conto prepagato e ricariche

Status: review

## Story

As a staff,
I want registrare ricariche sul conto di una persona,
so that il credito sia aggiornato e tracciato (FR-25).

## Acceptance Criteria

1. **Given** una Persona con profilo pilota o allievo, **When** viene attivato il profilo, **Then** la persona ha un Conto (uno solo per persona, AD-11) con saldo calcolato come SUM dei movimenti — mai un campo saldo scritto a mano (AD-3).
2. **Given** il permesso staff, **When** registro una ricarica (importo in centesimi, metodo contanti/bonifico/POS, data, note), **Then** nasce un `AccountMovement` immutabile di tipo TOP_UP e un `CashMovement` automatico in entrata con categoria "Ricariche" (seed).
3. **And** i movimenti non hanno API di update/delete; il saldo della scheda persona si aggiorna.

## Tasks / Subtasks

- [x] Task 1: Modelli e migrazione (AC: tutte)
  - [x] `Account`: `id`, `personId String @unique` (1-a-0/1 su Person, AD-11 — il conto appartiene alla PERSONA, mai al profilo: la transizione allievo→pilota non lo tocca), `createdAt`/`updatedAt`. **NESSUNA colonna saldo** (AD-3: saldo = `SUM(amountCents)`, sempre calcolato)
  - [x] `AccountMovement` (ledger, append-only): `id`, `accountId` FK (`@@index`), `type AccountMovementType` (enum: per ora solo `TOP_UP` — `ADJUSTMENT` arriva in 3.3, addebiti volo in epic 5: l'enum cresce per migrazione, non pre-popolare valori non usati), `amountCents Int` (FIRMATO: ricarica positiva; AD-2 centesimi interi), `paymentMethod PaymentMethod?` (enum `CASH | BANK_TRANSFER | POS`, valorizzato per TOP_UP), `description String?`, `effectiveDate DateTime @db.Date` (data valuta, pattern courseStartDate 2.2), `actorUserId` FK su User (chi ha registrato — servirà alla vista staff di 3.2), `reversalOfId String? @unique` self-FK (storno AD-3 — usato da 3.3, il campo nasce ora perché è l'ossatura del ledger), `createdAt`
  - [x] `CashCategory`: `id`, `name String @unique`, `isActive Boolean @default(true)`, timestamps. Seed COMPLETO (3.4 lo dà per assunto): Ricariche, Pacchetti, PPR, Carburante, Assicurazione, Manutenzione, Utenze, Altro (idempotente)
  - [x] `CashMovement` (ledger cassa, append-only): `id`, `categoryId` FK, `amountCents Int` (FIRMATO: entrata +, uscita −), `description String?`, `effectiveDate @db.Date`, `actorUserId` FK, `accountMovementId String? @unique` FK (aggancia il CashMovement automatico alla ricarica che l'ha generato — tracciabilità e idempotenza), `reversalOfId String? @unique` self-FK, `createdAt`
  - [x] Migrazione col workaround sandbox; seed: Account per la Person di `pilot@airmanager.local` (ha già PilotProfile attivo)
- [x] Task 2: Service + API (AC: tutte)
  - [x] NUOVO `accounts.service.ts` (spine: `services/accounts`): `getAccountOverview(actor, personId)` → `{ account: {id, createdAt} | null, balanceCents }` — lettura con la STESSA regola own-access di `getPerson` 2.3 (`people.read` OPPURE `self.read`+`actor.personId===personId`, ownership check PRIMA della query); saldo con `prisma.accountMovement.aggregate({ _sum: { amountCents } })`, mai colonne; `recordTopUp(actor, personId, {amountCents (int >0, cap INT max), paymentMethod, effectiveDate, description?})` con `authorize(actor,'finance.manage')` — in **UNA transazione**: get-or-create `Account` (upsert su personId), crea `AccountMovement` TOP_UP e il `CashMovement` gemello (categoria "Ricariche" cercata per nome nel seed, `accountMovementId` collegato, stesso importo positivo, stesso actor/data)
  - [x] Creazione conto all'attivazione profilo (AC 1): in `upsertProfile` (people.service), quando `type` è `pilot` o `student`, upsert `Account` nella STESSA operazione (estendere a `$transaction` se serve) — idempotente, mai due conti (unique su personId); il profilo istruttore NON crea conto
  - [x] NESSUNA API di update/delete sui movimenti (AC 3) — nemmeno admin
  - [x] Route con `apiRoute()`: `GET /api/v1/people/[id]/account` (overview: saldo + esistenza conto), `POST /api/v1/people/[id]/account/top-ups`. Schemi in NUOVO `src/lib/schemas/accounts.ts` (import `z` da `zod-with-openapi`!), component schemas + paths nel registry, coverage assertion estesa
- [x] Task 3: UI (AC: 2, 3)
  - [x] Scheda persona 2.3: il segnaposto **Saldo conto** diventa reale — saldo formattato EUR (da `src/lib/money.ts` — verificare gli helper esistenti e riusarli) o "Nessun conto attivo" se null; visibile a staff e al titolare (own)
  - [x] Per chi ha `finance.manage`: azione "Registra ricarica" nella sezione saldo (pannello con importo in EUR convertito a centesimi SOLO al submit — l'input utente è in euro con 2 decimali, il wire format resta centesimi interi; metodo select contanti/bonifico/POS; data default oggi; note opzionali ''→null via setValueAs; `key` di remount; cap INT max) + ultimi 5 movimenti (tipo, data, importo firmato) come anteprima — l'estratto conto completo è la 3.2, NON costruirlo
  - [x] Stile skill `minimalist-ui`; stringhe in `messages/{it,en}.json` simmetriche (nuova sezione o estensione `PersonDetailPage`)
- [x] Task 4: Test (AC: tutte)
  - [x] Unit service: saldo = somma firmata (zero movimenti → 0); own-access matrix su getAccountOverview (staff ok, titolare ok, pilota su conto altrui → Forbidden PRIMA della query, personId null → Forbidden); recordTopUp: transazione completa (Account upsert + AccountMovement + CashMovement con categoria Ricariche e accountMovementId), importo ≤0 rifiutato dallo schema, pilota → ForbiddenError; upsertProfile pilot/student crea Account, instructor no, riattivazione non duplica
  - [x] e2e (`e2e/accounts-topups.spec.ts`): staff apre scheda del pilota seed → saldo 0,00 €; registra ricarica 100 € contanti → saldo 100,00 € e movimento in anteprima; pilota vede il PROPRIO saldo nella propria scheda; pilota su `POST .../account/top-ups` → 403 envelope

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

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- `prisma migrate dev` non disponibile in sandbox → workaround consolidato: `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `prisma/migrations/20260705190000_add_accounts_topups/migration.sql` → `migrate deploy` → `prisma generate`. Applicata pulita al primo colpo.
- PostgreSQL e Mailpit erano giù a metà sessione (riavvio del container): riavviati con `service postgresql start` e `/root/go/bin/mailpit` su 1025/8025; nessun impatto sui dati.
- Primo run del nuovo spec e2e: 2 falliti per timeout di login (cold start del dev server con hashing argon2 concorrente) — rerun: 6/6 verdi.
- Suite e2e completa, primo run: 1 fallito preesistente (`people-management.spec.ts`, archiving — DB sporco di run precedenti). Reset da Dev Notes (drop/recreate + `migrate deploy` + seed) → rerun: 55/55 verdi.
- `tsc` inizialmente rosso sui 2 test service per l'overload typing del mock di `$transaction` → stesso cast-narrowing già usato da aircraft.service.test.ts.

### Completion Notes List

- **Task 1** — Nuovi modelli `Account`, `AccountMovement`, `CashCategory`, `CashMovement` + enum `AccountMovementType` (solo `TOP_UP`) e `PaymentMethod` (`CASH|BANK_TRANSFER|POS`). Nessuna colonna saldo da nessuna parte (AD-3); `amountCents Int` firmato (AD-2); `effectiveDate @db.Date` (pattern courseStartDate); `reversalOfId` self-FK `@unique` su entrambi i ledger (ossatura storno per 3.3/3.4); `CashMovement.accountMovementId @unique` (idempotenza/tracciabilità del gemello automatico). Seed esteso: 8 categorie cassa complete (idempotente, upsert su `name`) + `Account` per la Person del pilota demo.
- **Task 2** — Nuovo `accounts.service.ts`: `getAccountOverview` (own-access identica a `getPerson` 2.3, ownership PRIMA di ogni query; saldo SEMPRE `aggregate _sum.amountCents`, `null→0`; anteprima ultimi 5 movimenti inclusa nell'overview così la UI non fa una seconda chiamata) e `recordTopUp` (`authorize finance.manage`; categoria "Ricariche" risolta per nome PRIMA della transazione, errore esplicito se manca; UNA `$transaction` interattiva: upsert `Account` + create `AccountMovement` TOP_UP + create `CashMovement` gemello collegato). `upsertProfile` (people.service): i rami pilot/student ora upsertano profilo e `Account` nella stessa `$transaction` batch; instructor invariato (nessun conto). Route: `GET /api/v1/people/[id]/account`, `POST /api/v1/people/[id]/account/top-ups` via `apiRoute()`; nessun handler di update/delete (metodi non gestiti → 405). Schemi in `src/lib/schemas/accounts.ts` (z da `zod-with-openapi`); registry: componenti `AccountOverview`/`RecordTopUpRequest` + 2 path, coverage assertion estesa in registry.test.ts.
- **Task 3** — Nuovo `account-panel.tsx` (client) integrato nella scheda persona al posto del segnaposto "balance" (rimosso da `PLACEHOLDER_SECTIONS`): saldo formattato con il `formatCents` esistente o "Nessun conto attivo"; per `finance.manage` (prop derivata server-side; la guardia vera resta il service, AD-5) pannello "Registra ricarica" — importo in EUR come stringa (validata client-side con lo stesso `parseCents` + cap INT max del server), conversione a centesimi SOLO nel submit (boundary AD-2), select metodo, data default oggi, note `''→null`; anteprima ultimi 5 movimenti con importo firmato (nuovo helper `formatSignedCents` in money.ts, testato). Il POST restituisce l'overview aggiornata → il saldo si aggiorna senza reload (AC 3). i18n IT/EN simmetrica (`PersonDetailPage.accountPanel`). Nota: il `key` di remount del pannello non è necessario qui — il form di ricarica è sempre create-mode (mai precompilato da una riga) e viene smontato/rimontato dallo stato `formOpen`.
- **Task 4** — Unit: 20 nuovi test in `accounts.service.test.ts` (own-access matrix con Forbidden PRIMA della query, saldo somma/zero-movimenti/null-aggregate, transazione completa con categoria Ricariche e `accountMovementId`, categoria mancante → errore esplicito senza aprire la transazione, schema: 0/negativo/non-intero/oltre INT max/metodo ignoto rifiutati), 4 in `people.service.test.ts` (pilot/student creano Account, instructor no, riattivazione idempotente senza duplicati), 4 in `money.test.ts` (`formatSignedCents`). e2e: 6 scenari in `accounts-topups.spec.ts` (saldo 0,00 € alla creazione con profilo pilota; ricarica 100 € contanti → saldo 100,00 € e movimento `+100,00 €` in anteprima; "Nessun conto attivo" senza profili; il pilota vede il PROPRIO saldo senza azione ricarica; 403 envelope su top-ups da pilota; PATCH/DELETE sui movimenti → 405).
- **Gate finali**: lint 0 errori (solo il warning benigno noto su data-table.tsx), `tsc --noEmit` pulito, Vitest **252/252** (224 preesistenti + 28 nuovi), `next build` ok, Playwright **55/55** (49 preesistenti + 6 nuovi, dopo il reset DB previsto dalle Dev Notes per un flaky preesistente).

### File List

- `prisma/schema.prisma` (M — modelli Account/AccountMovement/CashCategory/CashMovement, enum AccountMovementType/PaymentMethod, relazioni su Person/User)
- `prisma/migrations/20260705190000_add_accounts_topups/migration.sql` (A)
- `prisma/seed.ts` (M — seed categorie cassa complete + Account del pilota demo)
- `src/lib/schemas/accounts.ts` (A)
- `src/lib/schemas/registry.ts` (M — componenti + 2 path Accounts)
- `src/lib/schemas/registry.test.ts` (M — coverage assertion estesa)
- `src/lib/money.ts` (M — nuovo `formatSignedCents`)
- `src/lib/money.test.ts` (M)
- `src/server/services/accounts.service.ts` (A)
- `src/server/services/accounts.service.test.ts` (A)
- `src/server/services/people.service.ts` (M — upsertProfile: Account in transazione per pilot/student)
- `src/server/services/people.service.test.ts` (M)
- `src/app/api/v1/people/[id]/account/route.ts` (A)
- `src/app/api/v1/people/[id]/account/top-ups/route.ts` (A)
- `src/app/[locale]/dashboard/people/account-panel.tsx` (A)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (M — AccountPanel al posto del segnaposto balance)
- `messages/it.json` (M — `PersonDetailPage.accountPanel`)
- `messages/en.json` (M — idem, simmetrico)
- `e2e/accounts-topups.spec.ts` (A)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M — 3-1-accounts-topups: review)

## Change Log

- 2026-07-05 — Story 3.1 implementata (claude-sonnet-5 via BMAD dev-story): ledger prepagato append-only (AD-3) con Account/AccountMovement/CashCategory/CashMovement, ricarica transazionale con CashMovement gemello "Ricariche", conto creato all'attivazione profilo pilota/allievo, saldo reale nella scheda persona con pannello ricarica per finance.manage. Gate: lint / tsc / Vitest 252 / build / Playwright 55 tutti verdi. Status → review.
