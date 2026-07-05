# Story 3.3: Rettifiche e alert saldo negativo

Status: ready-for-dev

## Story

As a staff,
I want correggere errori con rettifiche motivate e vedere subito i saldi negativi,
so that la contabilità resti pulita e i debiti visibili (FR-27, FR-28).

## Acceptance Criteria

1. **Given** un movimento errato, **When** registro una rettifica (positiva o negativa) con motivo obbligatorio, **Then** nasce un movimento ADJUSTMENT collegato con autore e timestamp; il movimento originale resta intatto (AD-3).
2. **Given** un conto che scende sotto zero o sotto la soglia configurabile (default −200 €), **When** il movimento che causa il passaggio viene registrato, **Then** il titolare riceve una email (Mailpit in dev) e il conto è evidenziato nella lista "saldi negativi" dello staff.
3. **And** l'email non viene reinviata a ogni movimento successivo se il saldo resta nella stessa fascia.

## Tasks / Subtasks

- [ ] Task 1: Modello e migrazione (AC: 1)
  - [ ] Enum `AccountMovementType`: aggiungere `ADJUSTMENT` (migrazione additiva). NIENTE nuovi modelli: il collegamento al movimento originale usa `reversalOfId` già esistente (3.1) — `@unique`, quindi al più UNA rettifica collegata per movimento originale (una seconda sullo stesso originale → `ConflictError` con messaggio chiaro)
  - [ ] Soglia: riusare `AppSetting` (key `negativeBalanceAlertThresholdCents`, default `-20000` se assente — letto nel service con fallback; la UI admin per modificarla è fuori scope, epic 10/impostazioni)
- [ ] Task 2: Service (AC: tutte)
  - [ ] `accounts.service.ts`: `recordAdjustment(actor, personId, {amountCents (int firmato ≠ 0, range ±INT_MAX), reason (obbligatoria, 1..500), originalMovementId?})` — `authorize('finance.manage')`; persona/conto inesistente → `NotFoundError` (il conto DEVE già esistere: una rettifica senza conto non ha senso, non crearlo); se `originalMovementId` presente: deve appartenere allo STESSO conto (altrimenti `NotFoundError` — mai rivelare movimenti altrui) e non avere già una rettifica collegata (P2002 sul `@unique` → `ConflictError`); crea `AccountMovement` ADJUSTMENT (reason in `description`, `actorUserId`, `reversalOfId`), NIENTE CashMovement automatico (le correzioni di cassa sono la story 3.4 col suo storno — documentare)
  - [ ] **Alert fascia saldo (AC 2/3), logica stateless nel service**: helper `balanceBand(balanceCents, thresholdCents)` → `'ok' | 'negative' | 'belowThreshold'` (`>= 0`; `< 0 && >= threshold`; `< threshold`). In `recordAdjustment` E `recordTopUp`: nella STESSA transazione del movimento, leggere il saldo con lock (`SELECT ... FOR UPDATE` sulla riga `Account` via `tx.$queryRaw`, pattern review 2.5 F1 — due movimenti concorrenti non devono leggere lo stesso saldo "prima") e calcolare saldo prima/dopo; se la fascia PEGGIORA (ok→negative, ok→belowThreshold, negative→belowThreshold) → inviare email al titolare DOPO il commit (mai dentro la transazione: un SMTP lento/rotto non deve tenere il lock né far fallire il movimento — try/catch con log, il movimento resta valido). Fascia uguale o migliorata → nessuna email (AC 3, dedup stateless: niente tabella SentAlert qui — quella è per i job schedulati AD-9, epic 6)
  - [ ] Email: estendere `src/server/adapters/mail/templates.ts` (pattern 1.4) con template bilingue "saldo negativo" (locale del `User` collegato, AD-7; importo formattato col locale giusto — pattern M1); destinatario `person.email`; se la persona non ha email → skip silenzioso con log
  - [ ] `listNegativeBalances(actor)` — `authorize('finance.manage')`: conti con saldo < 0 ordinati dal più negativo, con nome persona e saldo (GROUP BY/aggregate su AccountMovement — SEMPRE SUM, mai colonne; va bene una query raw o groupBy Prisma + join, documentare la scelta)
- [ ] Task 3: API + UI (AC: tutte)
  - [ ] Route: `POST /api/v1/people/[id]/account/adjustments`; `GET /api/v1/accounts/negative-balances`. Schemi in `accounts.ts` (z da zod-with-openapi!), registry + coverage
  - [ ] UI estratto conto (3.2): per `finance.manage`, azione "Rettifica" in testata (pannello: importo firmato in EUR — parseCents accetta il segno, review 3.1 —, motivo obbligatorio, remount `key`, ''→null dove serve) e azione per riga "Rettifica questo movimento" che precompila `originalMovementId` (visibile solo su righe senza rettifica già collegata, se il dato è disponibile; altrimenti gestire il 409 con messaggio chiaro); badge "rettifica di ..." sulle righe ADJUSTMENT collegate
  - [ ] Prima pagina finanze: `/{locale}/dashboard/finance` con sezione "Saldi negativi" (tabella: persona linkata alla scheda, saldo rosso, data ultimo movimento se comodo); repuntare la voce nav `finance` da `/finance` a `/dashboard/finance` (pattern repoint 2.1/2.4)
  - [ ] Stile skill `minimalist-ui`; stringhe `messages/{it,en}.json` simmetriche
- [ ] Task 4: Test (AC: tutte)
  - [ ] Unit: recordAdjustment (motivo obbligatorio, ≠0, collegamento valido/altrui/duplicato, originale intatto — nessun update, pilota → Forbidden); balanceBand (boundary: 0, -1, threshold, threshold-1); transizioni fascia → email inviata/non inviata (mock MailSender; peggioramento sì, stessa fascia no, miglioramento no, doppio peggioramento in un colpo ok→belowThreshold una sola email); persona senza email → skip; listNegativeBalances (solo negativi, ordine, permessi)
  - [ ] e2e (`e2e/account-adjustments.spec.ts`): staff rettifica −250 € con motivo su conto a 0 → saldo −250 €, riga ADJUSTMENT in estratto, email in Mailpit (API `http://127.0.0.1:8025/api/v1/messages`, pattern e2e 1.4), conto nella lista saldi negativi in /dashboard/finance; seconda rettifica −10 € (resta belowThreshold) → NESSUNA nuova email (conteggio messaggi invariato); rettifica collegata a un movimento → badge; pilota su POST adjustments → 403 envelope

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

### Debug Log References

### Completion Notes List

### File List

## Change Log
