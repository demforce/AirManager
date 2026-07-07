---
baseline_commit: 764f654
---

# Story 4.4: Vendita pacchetti e residui

Status: done

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

- [x] Task 1: Modello + migrazione (AC 1/3)
  - [x] Enum `AccountMovementType`: aggiungere **`PACKAGE_PURCHASE`** (migrazione additiva `ALTER TYPE ... ADD VALUE`; ATTENZIONE: il nuovo valore NON può essere usato nella stessa migrazione/transazione che lo aggiunge — la migrazione aggiunge solo il valore, l'uso è a runtime).
  - [x] Nuovo modello `HourPackage`: `id String @id @default(cuid())`; `personId String` + FK `Person` (AD-11: il pacchetto appartiene alla PERSONA, mai al profilo — sopravvive alla transizione allievo→pilota) + back-relation `Person.hourPackages HourPackage[]`; `packageTypeId String` + FK `PackageType` (**onDelete RESTRICT**, back-relation `PackageType.soldPackages HourPackage[]` — è la FK che rende reale il backstop P2003→409 di 4.3); snapshot `includedMinutes Int` e `pricePaidCents Int` (AD-2/AD-4); `paymentMethod PaymentMethod` (obbligatorio, riuso enum 3.1); `effectiveDate DateTime @db.Date` (data valuta vendita, convenzione `AccountMovement.effectiveDate`); `expiresAt DateTime? @db.Date` (snapshot calcolato, `null` = senza scadenza); `accountMovementId String @unique` + FK al `PACKAGE_PURCHASE` gemello (traccia, pattern `CashMovement.accountMovementId`); `actorUserId String` + FK `User` (+ back-relation `User.hourPackagesSold HourPackage[]`); `createdAt`. `@@index([personId])`, `@@index([packageTypeId])`. Doc-comment: append-only nello spirito (nessun update/delete API in 4.4; storno vendita = epic 5+ se servirà), residuo mai persistito.
  - [x] Migrazione a mano (stessa procedura Prisma 7 di 4.3, timestamp dopo `20260707130000`), poi `migrate deploy` + `generate`. Verificare `ALTER TYPE`, `CREATE TABLE "HourPackage"`, FK RESTRICT su `packageTypeId`, unique su `accountMovementId`.
- [x] Task 2: Helper data (AC 1)
  - [x] In `src/lib/date-only.ts`: nuovo `addMonthsClampUtc(date, months)` — somma mesi in UTC **clampando al fine mese** (31 gen + 1 mese = 28/29 feb, MAI overflow al mese successivo). Unit test dedicati (fine mese, anno bisestile, dicembre→gennaio).
- [x] Task 3: Service (AC 1/2/3)
  - [x] `sellPackage(actor, personId, input { packageTypeId, paymentMethod, effectiveDate, description? })` in nuovo `packages.service.ts` — `authorize(actor, 'finance.manage')` (operazione di sportello come `recordTopUp`, NON `settings.manage`). Ordine guardie: persona esiste → 404; persona archiviata → 409; `PackageType` esiste → 404; tipo `isActive: false` → 409 `ConflictError('This package type is inactive.')`; categoria cassa **"Pacchetti"** `isActive: true` risolta PRIMA della transazione (fail-fast `Error` operazionale se manca/disattivata — pattern "Ricariche" di `recordTopUp`). Poi UNA `prisma.$transaction`: upsert `Account` su `personId` (get-or-create, come top-up) → `AccountMovement` (`type: PACKAGE_PURCHASE`, **`amountCents: 0`**, `paymentMethod`, `description`, `effectiveDate`, `actorUserId`) → `HourPackage` (snapshot `includedMinutes`/`pricePaidCents` dal tipo, `expiresAt = validityMonths ? addMonthsClampUtc(effectiveDate, validityMonths) : null`, `accountMovementId`) → `CashMovement` (**`amountCents: +pricePaidCents`**, categoria "Pacchetti", stessa `effectiveDate`, `description` es. `Pacchetto <nome> — <cognome nome>`, `actorUserId`; NB: `accountMovementId` del CashMovement resta legato al movimento conto come nel top-up). Ritorna il pacchetto creato + overview conto.
  - [x] `listPersonPackages(actor, personId)` — access: `people.read` OPPURE own-access (`self.read` + `actor.personId === personId`, check PRIMA della query — pattern estratto conto 3.2). DTO `HourPackageListItem`: `id`, `typeName` (via relazione), `includedMinutes`, `remainingMinutes` (**calcolato**, oggi `= includedMinutes`), `pricePaidCents`, `paymentMethod`, `effectiveDate`, `expiresAt`, `isExpired` (calcolato vs oggi UTC date-only), `createdAt`, e `actorEmail` SOLO se il caller ha `people.read` (condizionale come 3.2). Ordine `effectiveDate desc, id desc`, `take: 500`.
  - [x] **Aggiornare `deletePackageType` (4.3, AC 3)**: pre-check esplicito `_count.soldPackages > 0` → 409 `ConflictError('This package type has sold packages — deactivate it instead.')` PRIMA del delete; il catch P2003 resta come backstop di concorrenza (vendita che si infila tra check e delete). Aggiornare i unit test di 4.3 di conseguenza (mock `_count`).
  - [x] Statement 3.2: verificare che le righe `PACKAGE_PURCHASE` (amount 0) compaiano correttamente nell'estratto conto esistente (nessun filtro per tipo); la label del tipo movimento va aggiunta alle traduzioni dell'estratto se le mostra per-tipo.
- [x] Task 4: API + OpenAPI (AC 1/2)
  - [x] `POST /api/v1/people/{id}/packages` (201, body `sellPackageSchema`) e `GET /api/v1/people/{id}/packages` — person-scoped come `.../account/...` e `.../instructor-rates`. `sellPackageSchema`: `packageTypeId` string min 1; `paymentMethod` enum (riuso schema top-up); `effectiveDate` `z.iso.date()`; `description` `.max(500).optional()`. Registrare componenti + path in `registry.ts` (tag `['People']` o `['Finance']` — coerente con l'account: guardare il tag di `/people/{id}/account` e usare lo stesso; POST `errorResponses(401,403,404,409,422)`, GET `(401,403,404,422)`) + coverage in `registry.test.ts`.
- [x] Task 5: UI (AC 2) — **skill `design-taste-frontend` + `ui-ux-pro-max` OBBLIGATORIE** (regola utente), coerenza con lo stile minimalista editoriale esistente
  - [x] **Scheda persona** (`/dashboard/people/[id]/page.tsx`): sostituire il segnaposto `hoursPackages` ("Pacchetti ore", story 2.3) con un vero `packages-panel.tsx` client component: lista pacchetti (tipo, residuo `H:MM` via `formatMinutes`, prezzo pagato, scadenza o "—", badge "scaduto" se `isExpired`), e form "Vendi pacchetto" visibile solo con `finance.manage`: select dei `PackageType` **attivi** (da `listPackageTypes`), metodo di pagamento, data valuta (default oggi), descrizione opzionale; successo → refresh lista + saldo. 409 (tipo disattivato) mappato a messaggio chiaro; `key={personId}`. NON toccare gli altri segnaposto.
  - [x] **Estratto conto** (`/dashboard/people/[id]/account/page.tsx`): sezione "I miei pacchetti" sopra/accanto ai movimenti con residuo e scadenza (visibile al titolare E allo staff, dati da `listPersonPackages` — il service è già il guardiano). Le righe `PACKAGE_PURCHASE` nello statement mostrano la descrizione e importo 0 senza rompere il layout.
  - [x] i18n `messages/{it,en}.json` simmetrici (`PersonDetailPage.packages.*`, chiavi statement se servono).
- [x] Task 6: Test (AC 1/2/3)
  - [x] Unit (`packages.service.test.ts`, mock prisma): permessi (`sellPackage` pilota/istruttore → Forbidden; `listPersonPackages` own ok, altrui senza `people.read` → Forbidden, check prima della query); persona 404/archiviata 409; tipo 404/inattivo 409; categoria "Pacchetti" mancante/disattivata → Error operazionale; transazione crea i 3 record con snapshot corretti e `amountCents: 0` sul movimento conto / `+prezzo` sulla cassa; `expiresAt` con e senza `validityMonths`; `actorEmail` condizionale; `isExpired` boundary (scade oggi = non scaduto? decidere: scaduto se `expiresAt < oggi`, il giorno di scadenza è ancora valido — documentare); `deletePackageType` pre-check 409. `addMonthsClampUtc`: fine mese/bisestile/rollover anno. Schema 422 (paymentMethod invalido, data malformata, description > 500).
  - [x] e2e (`e2e/package-sale.spec.ts`): admin/staff crea tipo (o riusa da API), vende a una persona con metodo POS → scheda persona mostra il pacchetto con residuo pieno e scadenza; estratto conto del titolare (login pilota seed se ha personId, o utente creato ad hoc) mostra pacchetto + riga PACKAGE_PURCHASE a importo 0 e saldo INVARIATO; registro cassa mostra l'entrata "Pacchetti" col prezzo; **DELETE del tipo venduto → 409** con messaggio chiaro (AC 3); vendita con tipo disattivato → 409; pilota tenta `POST /packages` → 403 envelope. Nomi/date run-unique.

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

Sonnet 5 (single dev agent, xhigh)

### Debug Log References

- Read the whole story file, the 4.3 review record (F1 lesson on archived-retained vs newly-added checks, deferred M1/M2) and every referenced pattern (`accounts.service.ts#recordTopUp`/`#listAccountMovements`, `package-types.service.ts`, `instructor-rates.service.ts`, `date-only.ts`, `time.ts`, `money.ts`) before writing any code.
- Prisma 7 migration: edited `schema.prisma`, ran `npx prisma format` (auto-aligned field columns) and `npx prisma validate`, then generated the migration with `npx prisma migrate diff --from-config-datasource prisma/schema.prisma --to-schema prisma/schema.prisma --script` against the live dev DB, stripped the `Loaded Prisma config...` banner line, and hand-wrote `prisma/migrations/20260707140000_add_hour_packages/migration.sql`. Confirmed Prisma's DEFAULT referential action for a required relation is already `ON DELETE RESTRICT` in Postgres (same as `PackageTypeAircraft.packageTypeId` in 4.3) — no explicit `onDelete` needed in the schema field itself. Applied with `migrate deploy` + `generate`; re-verified on a full `DROP DATABASE` + recreate + `migrate deploy` + `db seed` reset later (all 13 migrations apply cleanly in order, including this one).
- OpenAPI tag decision (Task 4 ambiguity): the story lists `['People']` or `['Finance']` as options but also says "look at `/people/{id}/account`'s tag and use the same" — that endpoint is actually tagged `['Accounts']`, not either listed option. Resolved by choosing `['Finance']`: it groups `POST/GET /people/{id}/packages` in the OpenAPI doc together with `PackageType`'s own CRUD (already `['Finance']`, story 4.3) — a developer looking for "how to sell a package" finds it next to the listino it sells from, not scattered under the generic `People` tag (used mostly for anagrafica/profile endpoints). Documented as a deliberate choice, not a literal reading of the (self-contradictory) Dev Notes sentence.
- `sellPackage`'s post-transaction overview re-read calls the exported `getAccountOverview(actor, personId)` (re-authorizing) rather than a guard-free `accounts.service.ts#buildOverview`-style shortcut, to avoid touching `accounts.service.ts` at all (Dev Notes: "NON toccare `recordTopUp`" — extended, conservatively, to not touching that file's internals for an unrelated story). Documented in the service doc-comment that every actor with `finance.manage` today (STAFF/ADMIN) also holds `people.read`, so this never 403s in practice; flagged as needing revisiting if that ever decouples (same caveat pattern as `buildOverview`'s own doc-comment).
- `next build` + `npm run lint` + `npx tsc --noEmit` all clean on the first pass after wiring the new files (only the pre-existing benign `data-table.tsx` compiler warning appears).
- Playwright: ran the new `package-sale.spec.ts` in isolation first (2/2 green), then `person-detail.spec.ts`/`package-types.spec.ts`/`account-statement.spec.ts`/`accounts-topups.spec.ts` in isolation to confirm the removed `hoursPackages` placeholder and the new always-rendered `PackagesPanel` don't regress story 2.3's "5 structural placeholders" assertion (it still finds an "Pacchetti ore" heading — now the real panel's, not the placeholder's — so no test text change needed). Then ran the full suite on a freshly reset+reseeded DB three times: run 1 hit a pre-existing `user-management.spec.ts` failure (unrelated story 1.4, `Disattivo` badge not appearing within timeout) that passed 7/7 in isolation; run 2 (after another full reset) hit a pre-existing `package-types.spec.ts` failure (`ECONNRESET` on a `POST /api/v1/users` call under 2-worker load) that passed 2/2 in isolation; run 3 (after another full reset+reseed) was fully green, 83/83. Both flakes matched the documented "under parallel load" category and touched code unrelated to 4.4's own changes (auth/session and an unrelated user-invite race, not `packages.service.ts`/`package-types.service.ts`'s new pre-check).

### Completion Notes List

- Implemented every task: `HourPackage` model + additive `PACKAGE_PURCHASE` enum value + hand-written migration (Task 1); `addMonthsClampUtc` end-of-month-clamping helper in `date-only.ts` (Task 2); `packages.service.ts` (`sellPackage`, `listPersonPackages`, `computeRemainingMinutes`) plus the AC 3 explicit `_count.soldPackages` pre-check added to `package-types.service.ts#deletePackageType` (Task 3); `POST`/`GET /api/v1/people/{id}/packages` thin routes + `src/lib/schemas/packages.ts` + registry/OpenAPI registration + coverage assertion (Task 4); UI (Task 5, see below); unit + e2e tests (Task 6).
- **The payment-is-external design (Contesto)**: `sellPackage` never touches the account balance — `AccountMovement` is always `amountCents: 0` (a closed transaction, unit-tested explicitly with a before/after balance-equality assertion in both the unit suite and the e2e spec); the price/method live on `HourPackage.pricePaidCents`/`paymentMethod` and on the `CashMovement` twin instead. Documented in both the Prisma model doc-comment and the service doc-comment, per the story's instruction.
- **Residuo**: no `remainingMinutes` column exists anywhere; `computeRemainingMinutes(pkg)` is the single computation point (today `= includedMinutes`, no consumption model until epic 5) and is the only place `listPersonPackages`/`sellPackage` read it from.
- **Snapshot + materialized expiry (AD-4)**: `HourPackage` copies `includedMinutes`/`pricePaidCents` from the `PackageType` at sale time; `expiresAt` is computed once via `addMonthsClampUtc(effectiveDate, validityMonths)` (or `null` when the type has no `validityMonths`) and never recomputed — a later edit to the `PackageType` (4.3) never touches an already-sold package.
- **`isExpired` boundary decision** (explicitly left open in Dev Notes): chose "expired only if `expiresAt` is STRICTLY before today" — the expiry day itself still reads as valid/not-expired. Documented in the DTO/schema doc-comments and covered by 4 boundary unit tests (`< today`, `=== today`, `> today`, `null`).
- **AC 3 (4.3 completion)**: `deletePackageType` now does the explicit `_count.soldPackages > 0` pre-check → 409 with the same clear message the P2003 backstop already used in 4.3; the backstop itself is unchanged (still catches the check-then-delete race). Updated 4.3's own unit tests (`package-types.service.test.ts`) for the new `_count` shape in the `findUnique` mock, and added a new dedicated test for the pre-check path itself. Proven end-to-end in `package-sale.spec.ts` (sell a package, then `DELETE` the type → 409 with a message matching `/deactivate/i`).
- **Statement/preview integration (Task 3's last bullet)**: extended `accountMovementTypeSchema` (`src/lib/schemas/accounts.ts`) with `PACKAGE_PURCHASE` (needed so `AccountStatementRow.type`/`AccountMovementListItemDto.type` stay accurately typed — without it, TypeScript would still compile since the switch statements have a `default` fallback, but the UI would show the raw enum string instead of a translated label) and added the `PACKAGE_PURCHASE` case + a new `packagePurchase` i18n key to BOTH `account-panel.tsx`'s preview switch and `account-statement-table.tsx`'s full-statement switch (mirrored IT/EN). No filter-by-type logic exists anywhere in the statement (Dev Notes: "nessun filtro per tipo") so the new rows simply show up.
- **UI (Task 5)**: invoked `design-taste-frontend` (confirmed dashboards/admin panels are explicitly OUT OF SCOPE for that skill's landing-page ruleset, Section 13 — used it only to steer away from over-designing a small dashboard addition) and queried `ui-ux-pro-max`'s guideline DB (`44px touch targets`, `form labels`, `focus states`, `error feedback`/`loading indicators`) before building `packages-panel.tsx`. Applied `min-h-[44px]` to every new interactive control (buttons, select, inputs, date input) introduced in the new panel/form while keeping the exact existing visual language (colors, radii, fonts, `focus:border-[#2F3437]` focus style) so it stays visually coherent with `account-panel.tsx`/`instructor-rates-panel.tsx` (mirrored: fetch-on-mount client panel, `role="status"` success banner, `role="alert"` form error, `key={person.id}` remount, disabled+spinner-free `isSubmitting` gating). `packages-panel.tsx` is a SINGLE shared component reused in two places: the scheda persona (`canSell={canManageFinance}`) and the account statement page (`canSell={false}`, read-only "I miei pacchetti", per Task 5's second bullet) — same data source (`listPersonPackages`) and same guardian (the service), no duplicated markup.
- **Deferred/out-of-scope (documented, not fixed)**: `cash.service.ts#reverseCashMovement`'s guard message ("This is an automatic top-up movement...") is technically slightly inaccurate for a package-sale's linked `CashMovement` (it also can't be reversed, for the same `accountMovementId != null` reason, but the message only mentions "top-up") — left unchanged since fixing generic ledger-guard copy is out of scope for this story and the underlying block is correct (same "accepted deferral" reasoning as 4.3's F2). The 409-collapsing-to-one-generic-message pattern in `packages-panel.tsx`'s sell form (`response.status === 409 ? inactiveTypeError : genericError`) mirrors the same established, accepted convention as `packages-manager.tsx`/`rates.service.ts` forms (4.3 review F2 accepted-deferral) rather than distinguishing the type-inactive 409 from an archived-person 409 with two separate messages.

### File List

- `prisma/schema.prisma` (modified — `HourPackage` model; `AccountMovementType.PACKAGE_PURCHASE`; back-relations on `Person`, `PackageType`, `User`, `AccountMovement`)
- `prisma/migrations/20260707140000_add_hour_packages/migration.sql` (new)
- `src/lib/date-only.ts` (modified — `addMonthsClampUtc`)
- `src/lib/date-only.test.ts` (modified — `addMonthsClampUtc` unit tests)
- `src/server/services/packages.service.ts` (new)
- `src/server/services/packages.service.test.ts` (new)
- `src/server/services/package-types.service.ts` (modified — `deletePackageType` explicit `_count.soldPackages` pre-check)
- `src/server/services/package-types.service.test.ts` (modified — `_count` mock shape + new pre-check test)
- `src/lib/schemas/packages.ts` (new)
- `src/lib/schemas/accounts.ts` (modified — `accountMovementTypeSchema` gains `PACKAGE_PURCHASE`)
- `src/lib/schemas/registry.ts` (modified — packages schemas + 2 new paths registered, tag `Finance`)
- `src/lib/schemas/registry.test.ts` (modified — coverage assertion for the new path)
- `src/app/api/v1/people/[id]/packages/route.ts` (new — GET/POST)
- `src/app/[locale]/dashboard/people/packages-panel.tsx` (new)
- `src/app/[locale]/dashboard/people/[id]/page.tsx` (modified — removed `hoursPackages` placeholder, embeds `PackagesPanel`)
- `src/app/[locale]/dashboard/people/[id]/account/page.tsx` (modified — embeds read-only `PackagesPanel`, `packagePurchase` movement-type label)
- `src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx` (modified — `PACKAGE_PURCHASE` case in the movement-type switch)
- `src/app/[locale]/dashboard/people/account-panel.tsx` (modified — `PACKAGE_PURCHASE` case in the preview movement-type switch)
- `messages/it.json`, `messages/en.json` (modified — new `HourPackagesPanel.*` namespace; `packagePurchase` movement-type keys; removed the now-dead `PersonDetailPage.placeholders.hoursPackages` key)
- `e2e/package-sale.spec.ts` (new)

## Review Record

Reviewer: subagent **Opus 4.8 (extra-high)**, adversarial. **Verdict: clean pass — nessuna modifica al codice richiesta.**

Verificato e trovato corretto (review con verifica empirica su DB + introspezione):
- **AC 1 / atomicità**: upsert `Account` + `AccountMovement(PACKAGE_PURCHASE, amountCents: 0)` + `HourPackage` + `CashMovement(+prezzo, "Pacchetti")` in UNA `$transaction`; categoria risolta fail-fast (attiva) PRIMA della transazione; nessun percorso di fallimento parziale. **Saldo provabilmente invariato** (unica scrittura conto = 0; assert in unit e e2e), cassa correttamente +prezzo, doppio link `accountMovementId` (HourPackage e CashMovement, ciascuno `@unique`) coerente.
- **Snapshot AD-4**: minuti/prezzo copiati alla vendita, `expiresAt` materializzato una volta sola; edit/disattivazione successivi del tipo non toccano il venduto. `addMonthsClampUtc` validato empiricamente su 8 casi limite (31 gen→28 feb, bisestile, rollover dicembre→gennaio, +12, identità +0) — tutto UTC date-only, `@db.Date` solo via query tipizzate.
- **`isExpired` boundary**: strettamente `expiresAt < oggi` (UTC midnight) — il giorno di scadenza è ancora valido, 4 test di confine.
- **Ordine guardie e own-access**: `authorize` → persona 404 → archiviata 409 → tipo 404 → inattivo 409 → categoria; `listPersonPackages` con check own-access PRIMA della query (niente enumeration), `actorEmail` condizionale su `people.read`; pilota non vende (403 pre-DB).
- **AC 3**: pre-check `_count.soldPackages > 0` → 409 "deactivate it instead" + backstop P2003 intatto; e2e prova il DELETE su tipo venduto → 409.
- **Residuo**: `computeRemainingMinutes` unico punto di calcolo, nessuna colonna persistita.
- **Statement/preview**: `PACKAGE_PURCHASE` renderizzato in preview e estratto (IT/EN); gemello cassa correttamente NON stornabile (blocco `accountMovementId != null`).
- **Migrazione** `20260707140000`: `ALTER TYPE ADD VALUE` (mai usato nella stessa tx, PG16-safe) + `HourPackage` con 4 FK RESTRICT verificate live (`confdeltype=r`), unique su `accountMovementId`; 13 migrazioni pulite su DB fresco.
- **OpenAPI/Zod/UI**: endpoint registrati + coverage; tag `Finance` (judgment call del dev) accettato; 44px touch target su tutti i controlli nuovi, `key={person.id}`, feedback `role=status/alert`, i18n 100% simmetrica, select solo tipi attivi.

Deferrals (non bloccanti, nessuna azione):
- **D1** — l'overview conto ritornata da `sellPackage` non è consumata dal `PackagesPanel` (sibling `AccountPanel` non refresha la preview movimenti fino al reload; il saldo mostrato resta comunque corretto perché invariato). Da valutare in un refactor UI futuro.
- **D2** — `recordAdjustment` (3.3) può puntare una rettifica a un movimento `PACKAGE_PURCHASE` a importo 0: affordance semanticamente strana ma pre-esistente (valeva già per TOP_UP), nessuna corruzione; eventuale guard sui tipi rettificabili in futuro. Lo storno vendita vero resta scope epic 5+.
- **D3** — scadenza mostrata come ISO `YYYY-MM-DD` grezzo (non locale-aware come il denaro); cosmetico, coerente con l'assert e2e. Nota anche il commento impreciso su `todayDateOnly` client-side (usa UTC, il commento dice local).

### Final gates (review run)

typecheck pulito, **479/479 unit**, lint 0 errori (warning benigno noto), `next build` verde, `prisma migrate status` 13/13, introspezione DB conforme; e2e 83/83 nel run dev su DB resettato (review statica dello spec: assert su saldo invariato, entrata cassa, 409 tipo venduto/inattivo, envelope 403, riga amount-0).

## Change Log

- 2026-07-07: Story file created (Fable 5 main session), ready-for-dev.
- 2026-07-07: Implemented (Sonnet 5, single dev agent, xhigh) — commit `Story 4.4: package sale and residuals`. Status → review.
- 2026-07-07: Review Opus 4.8 xhigh — clean pass (D1/D2/D3 deferred, non bloccanti). Status → done; Epic 4 chiuso.
