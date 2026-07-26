---
baseline_commit: TBD-alla-partenza (dopo la chiusura di TD-7)
---

# Story Billing-1: Fondamenta — metodo di pagamento, saldi di apertura, gemello payout, servizio di calcolo

Status: draft (NON parte finché TD-7 non è chiusa — tiene i diff di review puliti; branch dedicato `billing-rework`)

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

_(da compilare)_

## Review Record

_(compilato dopo la review adversarial)_
