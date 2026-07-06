---
baseline_commit: cb9fe916c8411ffa7c3d74f6ac467908d9a9ee6b
---

# Story 3.3: Rettifiche e alert saldo negativo

Status: review

## Story

As a staff,
I want correggere errori con rettifiche motivate e vedere subito i saldi negativi,
so that la contabilità resti pulita e i debiti visibili (FR-27, FR-28).

## Acceptance Criteria

1. **Given** un movimento errato, **When** registro una rettifica (positiva o negativa) con motivo obbligatorio, **Then** nasce un movimento ADJUSTMENT collegato con autore e timestamp; il movimento originale resta intatto (AD-3).
2. **Given** un conto che scende sotto zero o sotto la soglia configurabile (default −200 €), **When** il movimento che causa il passaggio viene registrato, **Then** il titolare riceve una email (Mailpit in dev) e il conto è evidenziato nella lista "saldi negativi" dello staff.
3. **And** l'email non viene reinviata a ogni movimento successivo se il saldo resta nella stessa fascia.

## Tasks / Subtasks

- [x] Task 1: Modello e migrazione (AC: 1)
  - [x] Enum `AccountMovementType`: aggiungere `ADJUSTMENT` (migrazione additiva). NIENTE nuovi modelli: il collegamento al movimento originale usa `reversalOfId` già esistente (3.1) — `@unique`, quindi al più UNA rettifica collegata per movimento originale (una seconda sullo stesso originale → `ConflictError` con messaggio chiaro)
  - [x] Soglia: riusare `AppSetting` (key `negativeBalanceAlertThresholdCents`, default `-20000` se assente — letto nel service con fallback; la UI admin per modificarla è fuori scope, epic 10/impostazioni)
- [x] Task 2: Service (AC: tutte)
  - [x] `accounts.service.ts`: `recordAdjustment(actor, personId, {amountCents (int firmato ≠ 0, range ±INT_MAX), reason (obbligatoria, 1..500), originalMovementId?})` — `authorize('finance.manage')`; persona/conto inesistente → `NotFoundError` (il conto DEVE già esistere: una rettifica senza conto non ha senso, non crearlo); se `originalMovementId` presente: deve appartenere allo STESSO conto (altrimenti `NotFoundError` — mai rivelare movimenti altrui) e non avere già una rettifica collegata (P2002 sul `@unique` → `ConflictError`); crea `AccountMovement` ADJUSTMENT (reason in `description`, `actorUserId`, `reversalOfId`), NIENTE CashMovement automatico (le correzioni di cassa sono la story 3.4 col suo storno — documentare)
  - [x] **Alert fascia saldo (AC 2/3), logica stateless nel service**: helper `balanceBand(balanceCents, thresholdCents)` → `'ok' | 'negative' | 'belowThreshold'` (`>= 0`; `< 0 && >= threshold`; `< threshold`). In `recordAdjustment` E `recordTopUp`: nella STESSA transazione del movimento, leggere il saldo con lock (`SELECT ... FOR UPDATE` sulla riga `Account` via `tx.$queryRaw`, pattern review 2.5 F1 — due movimenti concorrenti non devono leggere lo stesso saldo "prima") e calcolare saldo prima/dopo; se la fascia PEGGIORA (ok→negative, ok→belowThreshold, negative→belowThreshold) → inviare email al titolare DOPO il commit (mai dentro la transazione: un SMTP lento/rotto non deve tenere il lock né far fallire il movimento — try/catch con log, il movimento resta valido). Fascia uguale o migliorata → nessuna email (AC 3, dedup stateless: niente tabella SentAlert qui — quella è per i job schedulati AD-9, epic 6)
  - [x] Email: estendere `src/server/adapters/mail/templates.ts` (pattern 1.4) con template bilingue "saldo negativo" (locale del `User` collegato, AD-7; importo formattato col locale giusto — pattern M1); destinatario `person.email`; se la persona non ha email → skip silenzioso con log
  - [x] `listNegativeBalances(actor)` — `authorize('finance.manage')`: conti con saldo < 0 ordinati dal più negativo, con nome persona e saldo (GROUP BY/aggregate su AccountMovement — SEMPRE SUM, mai colonne; va bene una query raw o groupBy Prisma + join, documentare la scelta)
- [x] Task 3: API + UI (AC: tutte)
  - [x] Route: `POST /api/v1/people/[id]/account/adjustments`; `GET /api/v1/accounts/negative-balances`. Schemi in `accounts.ts` (z da zod-with-openapi!), registry + coverage
  - [x] UI estratto conto (3.2): per `finance.manage`, azione "Rettifica" in testata (pannello: importo firmato in EUR — parseCents accetta il segno, review 3.1 —, motivo obbligatorio, remount `key`, ''→null dove serve) e azione per riga "Rettifica questo movimento" che precompila `originalMovementId` (visibile solo su righe senza rettifica già collegata, se il dato è disponibile; altrimenti gestire il 409 con messaggio chiaro); badge "rettifica di ..." sulle righe ADJUSTMENT collegate
  - [x] Prima pagina finanze: `/{locale}/dashboard/finance` con sezione "Saldi negativi" (tabella: persona linkata alla scheda, saldo rosso, data ultimo movimento se comodo); repuntare la voce nav `finance` da `/finance` a `/dashboard/finance` (pattern repoint 2.1/2.4)
  - [x] Stile skill `minimalist-ui`; stringhe `messages/{it,en}.json` simmetriche
- [x] Task 4: Test (AC: tutte)
  - [x] Unit: recordAdjustment (motivo obbligatorio, ≠0, collegamento valido/altrui/duplicato, originale intatto — nessun update, pilota → Forbidden); balanceBand (boundary: 0, -1, threshold, threshold-1); transizioni fascia → email inviata/non inviata (mock MailSender; peggioramento sì, stessa fascia no, miglioramento no, doppio peggioramento in un colpo ok→belowThreshold una sola email); persona senza email → skip; listNegativeBalances (solo negativi, ordine, permessi)
  - [x] e2e (`e2e/account-adjustments.spec.ts`): staff rettifica −250 € con motivo su conto a 0 → saldo −250 €, riga ADJUSTMENT in estratto, email in Mailpit (API `http://127.0.0.1:8025/api/v1/messages`, pattern e2e 1.4), conto nella lista saldi negativi in /dashboard/finance; seconda rettifica −10 € (resta belowThreshold) → NESSUNA nuova email (conteggio messaggi invariato); rettifica collegata a un movimento → badge; pilota su POST adjustments → 403 envelope

## Dev Notes

- **AD-3**: la rettifica è un NUOVO movimento, l'originale non si tocca MAI. `reversalOfId @unique` limita a una rettifica per movimento: per correggere una rettifica sbagliata se ne fa un'altra non collegata (o collegata alla rettifica stessa) — documentare nel doc comment.
- **Alert = fascia che peggiora, stateless**: il saldo è sempre calcolabile (SUM), quindi il "non reinviare" è pura logica di transizione — nessuno stato alert da persistere. I job schedulati con SentAlert (AD-9) sono per le scadenze (epic 6), non qui.
- **Email fuori dalla transazione, dopo il commit** — MailSender può fallire senza invalidare il movimento (log e avanti). MailSender/Mailpit: pattern e template della story 1.4 (`src/server/adapters/mail/`).
- **Lock FOR UPDATE su Account** nella transazione di top-up e adjustment: senza, due movimenti concorrenti leggono lo stesso "saldo prima" e possono perdere o duplicare l'alert di fascia (stesso razionale review 2.5 F1). `"Account"` tabella, colonna `"id"` — Prisma senza select-for-update → `tx.$queryRaw`.
- **recordTopUp va esteso** (fascia può solo migliorare con importi positivi... NO: il top-up è sempre > 0 quindi non peggiora mai la fascia — valutare: se è dimostrabilmente impossibile, basta il check in recordAdjustment + un commento; non aggiungere codice morto. Gli addebiti volo dell'epic 5 riuseranno l'helper).
- Pattern consolidati: ownership-before-query, tie-break id, locale-aware money (M1), parseCents firmato, remount key, cap 500 sulle stringhe.
- e2e flaky su DB sporco → reset. Mailpit: gli e2e 1.4 mostrano come leggere i messaggi via API HTTP.
- Nessuna dipendenza npm nuova. MAI `playwright install`.
- **Gate**: lint (1 warning benigno noto), typecheck, Vitest (260+ attesi), `next build`, e2e Playwright (59+ attesi) tutti verdi prima del commit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3]
- [Source: _bmad-output/planning-artifacts/prds/prd-AirManager-2026-07-04/prd.md#FR-27, #FR-28]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-AirManager-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-5, #AD-7, #AD-8]
- [Source: _bmad-output/implementation-artifacts/3-1-accounts-topups.md#Review Record] — ledger, buildOverview, pattern M1/F3/F4
- [Source: _bmad-output/implementation-artifacts/1-4-user-management.md] — MailSender, templates, e2e Mailpit
- [Source: _bmad-output/implementation-artifacts/2-5-aircraft-status-hours.md#Review Record] — lock FOR UPDATE via $queryRaw

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 via BMAD dev-story

### Debug Log References

- Ambiente: PostgreSQL e Mailpit erano DOWN a inizio sessione (container riavviato) — riavviati (`service postgresql start`, `/root/go/bin/mailpit`); DB con dati residui di run precedenti → reset completo (drop/recreate + `migrate deploy` + `db seed`) PRIMA della suite e2e completa, come da regole operative.
- Migrazione scritta a mano (`prisma migrate dev` non funziona nel sandbox) e verificata identica all'output di `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`: un solo `ALTER TYPE "AccountMovementType" ADD VALUE 'ADJUSTMENT'`.
- Test template email: `Intl.NumberFormat` usa uno spazio non-breaking prima di `€` — assert con `toMatch(/-250,00\s€/)` invece di `toContain`.
- e2e badge: il filtro `hasText: 'Ricarica'` matchava anche la riga ADJUSTMENT perché il motivo del fixture conteneva la parola "Ricarica" — motivo cambiato in testo senza quella parola.
- Fire-and-forget dell'alert nei unit test: flush del microtask (`setImmediate`) dopo `recordAdjustment` prima degli assert su `sendMock`.

### Completion Notes List

- **Task 1**: enum `ADJUSTMENT` aggiunto (migrazione additiva `20260706090000_add_account_movement_adjustment_type`); nessun nuovo modello — link via `reversalOfId @unique` esistente. Soglia: `AppSetting` key `negativeBalanceAlertThresholdCents`, letta nel service con fallback a `-20000` (fallback anche su valore non numerico); niente UI admin (epic 10).
- **Task 2**: `recordAdjustment` — `authorize('finance.manage')`; persona → 404; conto inesistente → 404 (mai creato implicitamente, a differenza dell'upsert di `recordTopUp`); `originalMovementId` di un altro conto o inesistente → 404 (mai rivelare movimenti altrui), già rettificato → 409 (pre-check + backstop P2002 nel create per il TOCTOU concorrente); movimento ADJUSTMENT con reason in `description`, `actorUserId`, `reversalOfId`, `effectiveDate` = oggi (UTC, `@db.Date` — nessun input data nel contratto Task 2); NIENTE CashMovement (storno cassa = story 3.4, documentato nel doc comment). Alert: `balanceBand` esportato (riuso epic 5) + `BAND_ORDER` per il confronto "peggiora"; saldo prima letto con `SELECT ... FOR UPDATE` su `Account` via `tx.$queryRaw` NELLA transazione (pattern review 2.5 F1 — il lock è un mutex di serializzazione puro, non esiste colonna saldo); email inviata DOPO il commit, fire-and-forget con try/catch+log (SMTP rotto non invalida il movimento); persona senza email → skip con log; locale del destinatario da `User` linkato via `personId` (AD-7), fallback 'it'. `recordTopUp` NON esteso: il top-up è sempre > 0 (Zod `.positive()`), la fascia non può peggiorare — solo commento esplicativo, niente codice morto (Dev Notes). Template bilingue `buildNegativeBalanceAlertEmail` (`Emails.negativeBalanceAlert` in messages) con importo formattato col locale del destinatario (M1). `listNegativeBalances`: Prisma `groupBy` su `AccountMovement` con `having _sum < 0` e `orderBy _sum asc` (filtro e ordine spinti in Postgres — scelta documentata nel doc comment) + una `account.findMany` di arricchimento nomi (groupBy non joina relazioni); `_max(createdAt)` come data ultimo movimento.
- **Task 3**: `POST /api/v1/people/{id}/account/adjustments` (409 documentato nell'envelope) e `GET /api/v1/accounts/negative-balances` (array semplice, lista piccola — documentato nello schema); `recordAdjustmentSchema` (firmato ≠ 0, ±INT_MAX, reason 1..500) e `negativeBalance*Schema` in `accounts.ts` (z da zod-with-openapi), registrati nel registry + coverage test aggiornato. `AccountStatementItem` esteso con `reversalOfId`/`hasReversal` (select con la relazione `reversal`) per badge e visibilità dell'azione riga. UI estratto conto: azione "Registra rettifica" in testata (standalone) e "Rettifica questo movimento" per riga (nascosta se `hasReversal`; 409 concorrente → messaggio dedicato), pannello con importo firmato (`parseCents` accetta il segno, refine ≠ 0 e ±INT_MAX), motivo obbligatorio, remount `key={originalMovement?.id ?? 'standalone'}`, `originalMovementId: null` quando standalone; badge "Rettifica del movimento del {date}" (data risolta client-side dalle righe in pagina, fallback generico se l'originale è su un'altra pagina; template col placeholder passati con `t.raw` per non far fallire l'ICU server-side). `/dashboard/finance`: pagina server-rendered (AD-1, nessuna interattività necessaria) con tabella saldi negativi (persona linkata alla scheda, saldo in rosso, data ultimo movimento via `formatDateTime`); voce nav `finance` repuntata a `/dashboard/finance`. `AccountPanel` (scheda persona): label del tipo ADJUSTMENT aggiunta al preview movimenti (ora possono comparire rettifiche). Stringhe it/en simmetriche (verificate con confronto programmatico delle chiavi).
- **Task 4**: 37 unit test nuovi (297 totali, 260 preesistenti): recordAdjustment (Forbidden pilota anche sul proprio conto, 404 persona/conto/movimento altrui/inesistente, 409 duplicato + P2002, originale intatto — l'unica scrittura è il create, il mock non espone update/delete —, lock FOR UPDATE presente nella query, niente CashMovement), balanceBand (0/-1/threshold/threshold−1), transizioni fascia (ok→negative, ok→belowThreshold un solo invio, negative→belowThreshold, stessa fascia no, miglioramento no, soglia da AppSetting, skip senza email, SMTP rotto non fallisce il movimento, locale del destinatario), listNegativeBalances (permessi, vuota, query negativi+ordine, mapping nomi), recordAdjustmentSchema (motivo/zero/500 char/±INT_MAX/non-intero), template email it/en, registry coverage. 4 e2e nuovi (63 totali, 59 preesistenti) in `e2e/account-adjustments.spec.ts`, tutti gli scenari del Task 4 coperti.
- **Gate finali**: lint 0 errori (1 warning benigno noto su data-table.tsx), `tsc --noEmit` pulito, Vitest 297/297, `next build` ok, Playwright 63/63 su DB resettato.

### File List

- prisma/schema.prisma (M — enum `ADJUSTMENT`)
- prisma/migrations/20260706090000_add_account_movement_adjustment_type/migration.sql (A)
- src/lib/schemas/accounts.ts (M — `recordAdjustmentSchema`, `negativeBalance*`, `ADJUSTMENT` nel type enum, `reversalOfId`/`hasReversal` nello statement item)
- src/lib/schemas/registry.ts (M — 2 component schema + 2 path)
- src/lib/schemas/registry.test.ts (M — coverage dei 2 nuovi path)
- src/server/services/accounts.service.ts (M — `recordAdjustment`, `balanceBand`, `listNegativeBalances`, alert post-commit, statement esteso)
- src/server/services/accounts.service.test.ts (M — 37 test nuovi + fixture statement aggiornate)
- src/server/adapters/mail/templates.ts (M — `buildNegativeBalanceAlertEmail`)
- src/server/adapters/mail/templates.test.ts (M — 2 test template alert)
- src/app/api/v1/people/[id]/account/adjustments/route.ts (A)
- src/app/api/v1/accounts/negative-balances/route.ts (A)
- src/app/[locale]/dashboard/finance/page.tsx (A)
- src/app/[locale]/dashboard/nav-items.ts (M — repoint finance)
- src/app/[locale]/dashboard/people/[id]/account/account-statement-table.tsx (M — azioni rettifica, pannello, badge)
- src/app/[locale]/dashboard/people/[id]/account/page.tsx (M — nuove label/props)
- src/app/[locale]/dashboard/people/[id]/page.tsx (M — label adjustment nel panel)
- src/app/[locale]/dashboard/people/account-panel.tsx (M — label tipo ADJUSTMENT)
- messages/it.json (M)
- messages/en.json (M)
- e2e/account-adjustments.spec.ts (A)
- _bmad-output/implementation-artifacts/3-3-adjustments-negative-alerts.md (M — questo record)
- _bmad-output/implementation-artifacts/sprint-status.yaml (M — 3-3 → review)

## Change Log

- 2026-07-06: Story 3.3 implementata — rettifiche motivate (ADJUSTMENT collegato via `reversalOfId`, originale intatto, 409 su doppio collegamento), alert email stateless su peggioramento di fascia saldo (lock FOR UPDATE, invio post-commit, soglia AppSetting default −200 €), lista saldi negativi + prima pagina `/dashboard/finance` con repoint nav. Tutti i gate verdi (lint/tsc/vitest 297/build/e2e 63). Status → review.
