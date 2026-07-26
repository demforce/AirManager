---
baseline_commit: 973485f
---

# Story Billing-1: Fondamenta — metodo di pagamento, saldi di apertura, gemello payout, servizio di calcolo

Status: review (implementazione completa, branch `billing-rework`, dev 2026-07-26 — in attesa di review adversarial)

## Story

As a gestore dell'aviosuperficie,
I want che il sistema distingua ricavi, costi, liquidità (cassa/banca) e acconti dei piloti su basi contabili corrette,
so that la pagina Contabilità (Story Billing-2) possa mostrarli senza mescolarli in un'unica colonna firmata.

**Riferimenti vincolanti**: design approvato `docs/superpowers/specs/2026-07-26-billing-rework-design.md` (§3 aggiunte dati, §4 regole di calcolo, §7 scomposizione). Questa è la Story 1 (Fondamenta): backend + servizio, **invisibile all'utente** salvo il campo metodo nei form di registrazione.

**Ratifiche PO (AskUserQuestion 2026-07-26)**:
1. Il gemello di denaro dei compensi istruttori va sotto una categoria dedicata **"Compensi istruttori"** (seminata come "Ricariche"/"PPR").
2. Saldi di apertura = **due valori (cassa, banca) + una data**, in `AppSetting`.
3. (dal brainstorming) La categoria dice *di cosa*, il movimento dice *in che direzione*: entrate/uscite/netto per categoria, MAI etichetta ricavo/costo sulla categoria.

## Acceptance Criteria

1. **(`CashMovement.paymentMethod`)** Nuovo campo `paymentMethod PaymentMethod?` (enum esistente `CASH | BANK_TRANSFER | POS`), nullable per lo storico. Migrazione additiva (pattern `prisma/migrations/`). **Backfill deterministico nella stessa migrazione** (o in uno step SQL della migrazione): i gemelli delle ricariche (`accountMovementId IS NOT NULL`, categoria "Ricariche") ereditano il metodo dal loro `AccountMovement.paymentMethod`; ogni altro movimento resta `null` (= "non attribuito", gestito in UI dalla Story 2). Aggiornare `seed.ts` e `seed-demo.ts` perché i nuovi movimenti abbiano un metodo plausibile.
2. **(Metodo obbligatorio sulle nuove registrazioni)** I due writer che creano `CashMovement` diretti — `recordCashMovement` (movimento manuale di cassa) e il ramo PPR di `completePprRequest` — accettano/impostano `paymentMethod`. Il gemello di `recordTopUp` continua a ereditarlo dal `TOP_UP` (già valorizzato). Schema Zod del form movimento manuale esteso col metodo obbligatorio; wire/OpenAPI aggiornati (`registry.ts` + `registry.test.ts`). NON cambiare la semantica di importo/segno.
3. **(Saldi di apertura tesoreria)** Tre chiavi `AppSetting`: `treasury.openingCashCents` (int), `treasury.openingBankCents` (int), `treasury.openingDate` (`YYYY-MM-DD`). Getter/setter in `app-settings.service.ts` gated `settings.manage` (pattern identico a `getMembershipFeeCents`/`setMembershipFeeCents`), con parsing robusto (valore mancante/non valido → default 0 / null, loggato, mai throw — stesso pattern degli altri getter finanziari). Card in Impostazioni: NON in questa story (è UI → Story 2), MA getter/setter + endpoint `PUT /api/v1/settings/treasury` registrato in OpenAPI, testati.
4. **(Gemello di denaro dei compensi istruttori)** `recordPayout` (`instructor-compensation.service.ts:337`) crea, **nella stessa transazione**, un `CashMovement` gemello sotto la categoria "Compensi istruttori": importo **negativo** (uscita), `paymentMethod` = `input.method`, `effectiveDate` = data del pagamento, descrizione col periodo. La categoria è risolta PRIMA della transazione (fail-fast se il seed manca, come fa `recordTopUp` con "Ricariche"). Serve un link di tracciabilità: aggiungere `CashMovement.instructorPayoutId String? @unique` + relazione (pattern `accountMovementId`), così il gemello è riconoscibile e lo storno futuro è possibile. Semina "Compensi istruttori" in `seed.ts` e `seed-demo.ts` (+ un payout demo con gemello).
5. **(Servizio di calcolo dei tre blocchi)** Nuovo `getBillingSummary(actor, ref)` in `transactions.service.ts` (o nuovo `billing-summary.service.ts` se più pulito), gated `finance.manage`, che ritorna per il mese di `ref` (Europe/Rome):
   - **`result`**: `revenueCents`, `costCents`, `netCents`. Ricavi = addebiti conto (`FLIGHT_CHARGE`, `ADJUSTMENT` a debito, netti dei `FLIGHT_CHARGE_REVERSAL`) **+** entrate di denaro con `accountMovementId IS NULL` (PPR contante, rivendite). Costi = uscite di denaro per categoria (compensi inclusi via gemello AC4). **Regola anti-doppio-conteggio**: un `CashMovement` con `accountMovementId` valorizzato è già contato dal lato conto → NON ricontarlo tra i ricavi/costi di cassa. Coprire con unit test ESPLICITO incluso il caso storno.
   - **`treasury`**: `cashCents` = openingCash + Σ movimenti `CASH` da openingDate; `bankCents` = openingBank + Σ (`BANK_TRANSFER`|`POS`) da openingDate; `unattributedCents` = Σ movimenti senza metodo (il "secchiello"); `availableCents` = cash + bank − deposits.
   - **`deposits`** (acconti): `totalCents` = Σ saldi conto positivi; `exposureCents` = Σ saldi conto negativi (valore assoluto); `inRedCount` = n. conti negativi.
   - **`byCategory`**: riuso di `getCashReport` (entrate/uscite/netto per categoria) — NON reimplementare.
6. **(Sostituire, non affiancare, `getBillingKpis`)** `getBillingKpis` (Σ positivi = "Ricavi" con "Costi" alias della stessa cifra) è la vecchia definizione: va SOSTITUITO da `getBillingSummary`. Aggiornare `stats.service.ts` che riusa `getLedgerRevenueCents` (ratifica utente 4 "MAI reimplementarle"): la definizione di "ricavo" di stats DEVE restare allineata a quella nuova, o le due pagine divergono. Se il cambio di `getLedgerRevenueCents` impatta i test delle Statistiche, aggiornarli con i valori corretti (non indebolirli).
7. **(Test)** Unit esaustivi sul servizio di calcolo (AC5), con casi mirati: ricarica in contanti (entra in cassa e in acconti, NON nei ricavi), volo addebitato (ricavo, non tocca cassa finché non paga), PPR pagato in contanti da un transito (ricavo + cassa, `accountMovementId` null), storno di un addebito (annulla il ricavo), payout istruttore (costo + uscita banca/cassa secondo metodo), movimento senza metodo (finisce in `unattributedCents`, non in cash/bank). Test su getter/setter treasury e sul backfill della migrazione. **Nessun e2e nuovo in questa story** (è backend; la UI è Story 2) — ma la full suite CI=1 esistente DEVE restare verde (il cambio di `getBillingKpis`/`getLedgerRevenueCents` tocca `billing.spec.ts`/`cash-report.spec.ts`/stats: aggiornare gli assert ai valori corretti).

## Contesto (puntatori — ricognizione 2026-07-26)

- Modelli: `CashMovement` (`prisma/schema.prisma:679` — ha già `accountMovementId @unique`, `reversalOfId @unique`, `pprRequestId`); `AccountMovement` (`:617`, con `paymentMethod`); enum `PaymentMethod` (`:584`), `AccountMovementType` (`:573`).
- Writer: `recordTopUp` (`accounts.service.ts:195`, crea il gemello "Ricariche" — `TOP_UP_CASH_CATEGORY_NAME` const :12); `recordPayout` (`instructor-compensation.service.ts:337`, NON crea gemello oggi); `recordCashMovement`/`completePprRequest` (cash diretto); `getCashReport` (`cash.service.ts:538`, entrate/uscite/netto per categoria in SQL — il modello del §2 dello spec, già pronto).
- Aggregati attuali da sostituire: `getBillingKpis`/`getLedgerRevenueCents`/`sumPositive` (`transactions.service.ts:214-337`); `toAccountRow` (`:117`, il flip del segno `-row.amountCents` che confonde — resta per la tabella firmata finché la Story 2 non la sostituisce con le colonne entrate/uscite).
- AppSetting: pattern getter/setter finanziario in `getMembershipFeeCents`/`setMembershipFeeCents` (`app-settings.service.ts:440-490`); chiavi dotted (`treasury.*`).
- **Ambiente**: ciclo e regole come da `docs/handoffs/HANDOFF.md` (DB fresco al dispatch, gates prima del commit, `export JOBS_SECRET=<non-placeholder>` per la suite CI=1, e2e foreground su file, MAI push, MAI playwright install; **questa story TOCCA una migrazione Prisma** — pattern migrazioni recenti). Se la story introduce una env var: NO (solo AppSetting DB) → `env.ci-sync` non coinvolto. Commit: `feat(billing-1): fondamenta — metodo pagamento, saldi apertura, gemello payout, servizio di calcolo` — Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>.

## Fuori scope dichiarato (→ Story Billing-2)

- La pagina: i tre riquadri, il registro a due colonne entrate/uscite, la colonna tipo e i filtri, il "secchiello" dei non attribuiti, la card Impostazioni tesoreria. Story 1 fornisce solo i numeri e gli endpoint.
- Riclassificazione dei movimenti storici senza metodo: la Story 2 offre la UI per attribuirli; qui restano `null` e il servizio li isola in `unattributedCents`.
- Estratto conto pilota-centrico della scheda persona: INVARIATO.

## Dev Agent Record

**Sviluppatore**: Claude Sonnet 5 (dev subagent, xhigh) — 2026-07-26.

### Scelte chiave

1. **AC5** — `getBillingSummary` in un nuovo `billing-summary.service.ts` (opzione esplicita dell'AC, scelta per pulizia). Riusa `getLedgerRevenueCents` (`transactions.service.ts`) per `result.revenueCents`, `getCashReport` (`cash.service.ts`) per `byCategory`, `getTreasuryOpeningInternal` (`app-settings.service.ts`) per i saldi di apertura — zero reimplementazioni (ratifica utente 4, "MAI reimplementarle").
2. **AC5/AC6** — `getLedgerRevenueCents` RIDEFINITO (stessa firma/export, "sostituito" per AC6): non più `sumPositive(fetchAllLedgerRows(...))` (bug: un addebito stornato nello STESSO mese contava comunque per intero come ricavo, perché lo storno finiva solo tra i "pagamenti", mai sottratto dai ricavi). Ora due aggregate Prisma: addebiti conto (`FLIGHT_CHARGE` + `FLIGHT_CHARGE_REVERSAL` + `ADJUSTMENT` a debito, sommati e nettati) + entrate di cassa non già contate lato conto (stesso predicate `NOT` già usato da `buildCashWhere` per il twin-dedup del ledger unificato, generalizzato — v. Deviazione D3). `getBillingKpis` ora chiama `getLedgerRevenueCents` per `revenueCents`/`chargesCents`/`prevMonthRevenueCents`; `paymentsCents`/`chargesCount`/`paymentsCount`/`revenueByKind` restano INVARIATI (fuori dal perimetro letterale dell'AC6, che parla solo della cifra Ricavi/Costi-alias). Rimossa `sumPositive` (diventata morta).
3. **AC4** — `recordPayout` ora apre una `$transaction`: crea l'`InstructorPayout` + il `CashMovement` gemello (categoria "Compensi istruttori", risolta PRIMA della transazione — stesso fail-fast di `recordTopUp` su "Ricariche"), `amountCents` negativo, `paymentMethod = input.method`, `effectiveDate` = oggi (Europe/Rome — nessun input esplicito di data sul payout, stessa scelta di `recordAdjustment`).
4. **AC3** — getter/setter treasury ENTRAMBI gated `settings.manage` (lettura letterale dell'AC), ma `getBillingSummary` legge tramite un reader interno SENZA `Actor` (`getTreasuryOpeningInternal`) — stesso precedente già in questo file di `getSmtpSettingsForMailer` vs `getSmtpSettings`: evita che il servizio di calcolo (gated il più ampio `finance.manage`) debba richiedere anche `settings.manage`.
5. Registrato SOLO l'endpoint `PUT /api/v1/settings/treasury` (l'AC3 cita esplicitamente solo "endpoint PUT", nessun GET) — `getBillingSummary` legge i valori con una chiamata diretta al servizio, senza round-trip HTTP.
6. Il campo "metodo" richiesto dalla riga di apertura della story ("invisibile all'utente salvo il campo metodo nei form di registrazione") è stato aggiunto al ramo cash della SlideOver "Nuova transazione" (`transaction-editor.tsx`) RIUSANDO il `<Select>`/stato `method` già esistente per il ramo TOP_UP (bastava allargare la condizione di render) — zero markup nuovo.

### Deviazioni dallo story file (motivate — da verificare in review)

- **D1 (AC6, la più rilevante)**: l'AC dice testualmente "`getBillingKpis` ... va SOSTITUITO da `getBillingSummary`". L'ho interpretato come "la sua DEFINIZIONE di Ricavi/Costi (il bug Σ-positivi) va sostituita", non "la funzione va cancellata e la pagina Contabilità va riscritta sullo shape di `getBillingSummary`" — perché i due DTO sono strutturalmente incompatibili (`getBillingKpis` alimenta i 5 KPI-tile della pagina `/dashboard/billing` già in produzione dalla story 12.9; `getBillingSummary` è `result`/`treasury`/`deposits`/`byCategory`, il nuovo modello a 3 libri che la Story 2 porterà in UI). Ho quindi mantenuto `getBillingKpis` con lo stesso export/shape, ma la sua cifra "Ricavi" ora delega a `getLedgerRevenueCents` — la STESSA funzione che `getBillingSummary.result.revenueCents` usa — così esiste UNA SOLA definizione di ricavo nel codebase (la vera sostanza del difetto AC6 voleva chiudere). La pagina `billing/page.tsx` resta INTATTA, zero righe toccate — coerente con l'apertura della story ("invisibile all'utente salvo il campo metodo") e con "Fuori scope: i tre riquadri ... Story 1 fornisce solo i numeri e gli endpoint". **Segnalo esplicitamente per la review**: se l'intento del PO era la cancellazione letterale di `getBillingKpis` con conseguente rework del KPI-row della pagina esistente, è una decisione di prodotto più ampia (impatterebbe anche la Story 2) da riconfermare, non qualcosa che ho deciso di silenziare.
- **D2 (AC2, `paymentMethod` su `completePprRequest`)**: reso OPZIONALE (non "obbligatorio" come su `recordCashMovementSchema`) — l'AC lo dice testualmente solo per "il form movimento manuale"; per il ramo PPR dice solo "accettano/impostano". Reso opzionale anche per non rompere `e2e/movements.spec.ts`/`e2e/reports.spec.ts` (POST diretti con solo `{ landingFeeCents }`, mai citati da AC7 tra gli spec da aggiornare) — un fee registrato senza metodo finisce con `paymentMethod: null` ("non attribuito"), stesso trattamento dei movimenti manuali storici. Nessuna UI aggiunta al pannello di completamento PPR (`movements-table.tsx`) — solo schema/servizio accettano il campo, pronti per un caller futuro.
- **D3 (AC5, anti-doppio-conteggio generalizzato)**: l'AC scrive testualmente "entrate di denaro con `accountMovementId IS NULL`". L'ho generalizzato al predicate GIÀ ESISTENTE in `buildCashWhere` (escludi il gemello SOLO se il movimento di conto collegato ha importo NON-zero) perché la lettura letterale avrebbe fatto SPARIRE dai ricavi le vendite di pacchetti ore (`PACKAGE_PURCHASE`, il cui lato conto è SEMPRE zero per costruzione — v. doc-comment del tipo in `schema.prisma`) rispetto al calcolo legacy, che le contava correttamente come ricavo. Stessa generalizzazione applicata anche al lato costi, per simmetria/difesa (oggi vacua: nessun `CashMovement` negativo ha `accountMovementId` valorizzato).
- **D4 (AC5, `unattributedCents` non delimitato da `openingDate`)**: l'AC non lo qualifica con una data ("Σ movimenti senza metodo"); letto come somma ALL-TIME — non ha senso legarlo alla data di apertura tesoreria, dato che rappresenta denaro di destinazione ignota, non un saldo corrente che quella data serve a rendere confrontabile.
- **D5 (nessuna route GET treasury)**: l'AC3 cita solo "endpoint PUT" — nessun GET registrato in questa story; Story 2 lo aggiungerà quando costruirà la card Impostazioni (se le servirà prefillare il form via HTTP invece che via server component).
- **D6 (5 e2e esistenti aggiornati, nessuno nuovo)**: AC2 rende `paymentMethod` obbligatorio su `recordCashMovementSchema` — questo rompe ogni test e2e che POSTa `/api/v1/cash-movements` direttamente senza il campo. Aggiornati aggiungendo `paymentMethod: 'CASH'` ai loro helper di fixture (nessun assert indebolito, solo il campo obbligatorio aggiunto): `e2e/billing.spec.ts`, `e2e/cash-register.spec.ts`, `e2e/cash-report.spec.ts`, `e2e/pdf-exports.spec.ts`, `e2e/settings.spec.ts`. Il test e2e della SlideOver "Nuova transazione" → cash (già in `billing.spec.ts`) non ha richiesto modifiche: il `<Select>` "Metodo" riusato dal ramo TOP_UP parte già selezionato su "CASH" di default.

### Risultati test (verbatim)

`npm run gates`:
```
PASS  lint (23s)
PASS  typecheck (3s)
PASS  test (9s) — Tests  1489 passed (1489)
PASS  build (35s)
```

Full suite `CI=1 npx playwright test` (build prod, DB fresco — `migrate deploy` + `prisma db seed`, `JOBS_SECRET` esportato non-placeholder):
```
Running 265 tests using 2 workers
...
265 passed (7.3m)
```
Exit code: `0`. Zero retry/flaky in questo run.

**Verifica manuale del backfill (AC1)** — nessun precedente di test automatico per un backfill di migrazione in questa codebase (nessuna storia precedente ne ha uno): dentro una transazione POI `ROLLBACK` (zero dati residui nel DB), inserito un `AccountMovement` TOP_UP con `paymentMethod=BANK_TRANSFER` + il suo `CashMovement` gemello sotto "Ricariche" con `paymentMethod=NULL` (a simulare lo stato pre-migrazione), ri-eseguita la STESSA `UPDATE` della migrazione: il gemello passa da `NULL` a `BANK_TRANSFER`, confermando la logica. Verificato anche `seed-demo.ts` (su un DB fresco dedicato): il payout demo crea correttamente il gemello `CashMovement` (`-7500`, `BANK_TRANSFER`, categoria "Compensi istruttori", `instructorPayoutId` valorizzato); i 13 top-up propagano il loro metodo al gemello cassa (8 `BANK_TRANSFER` + 3 `CASH` + 3 `POS` = 14 righe con metodo, la 14ª essendo il payout); 1 sola riga resta `NULL` (il landing fee PPR del seed demo, registrato senza metodo — D2).

### File List

- `prisma/schema.prisma`, `prisma/migrations/20260726090000_billing1_payment_method_payout_twin/` (nuova), `prisma/seed.ts`, `prisma/seed-demo.ts`
- `src/lib/schemas/{cash,ppr,transactions,settings}.ts`, `src/lib/schemas/registry.{ts,test.ts}`
- `src/server/services/transactions.service.ts` (+ `.test.ts`), `src/server/services/billing-summary.service.ts` (nuovo, + `.test.ts`), `src/server/services/cash.service.ts` (+ `.test.ts`), `src/server/services/accounts.service.ts` (+ `.test.ts`), `src/server/services/ppr.service.ts` (+ `.test.ts`), `src/server/services/instructor-compensation.service.ts` (+ `.test.ts`), `src/server/services/app-settings.service.ts` (+ `.test.ts`)
- `src/app/api/v1/settings/treasury/route.ts` (nuovo)
- `src/app/[locale]/dashboard/billing/transaction-editor.tsx`
- `e2e/{billing,cash-register,cash-report,pdf-exports,settings}.spec.ts` (fixture helper aggiornati, nessun assert indebolito)

## Review Record

_(compilato dopo la review adversarial)_
