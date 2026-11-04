---
baseline_commit: 9272129
---

# Story 16.6a: Il ledger non conta domani, e i due libri si dichiarano

> Titolo originale (2026-09-10): «… e il PDF non conta gli annullati» — dopo la 19.6 i voli annullati non esistono più (§R).

## §R — Riallineamento su `dev@56c6664` (2026-11-03, sessione principale) — **PREVALE su tutto il resto del file**

Baseline del file: `9272129`. La 19.6 (`6651ec1`) ha eliminato `FlightStatus` e i voli annullati; la 19.12b ha già titolato il PDF «Report di cassa». Dove il resto del file contraddice questa sezione, vale questa sezione.

**OBSOLETE (non fare)**: P3 e AC 7-10 (`getFlightTotals` `flights.service.ts:1467-1493` e la somma del PDF `exports.service.ts:685-686` usano lo stesso `buildFlightsWhere` `:1351-1370` senza filtro di stato: entro il tetto del PDF i numeri coincidono per costruzione; audit 11-02 `business-logic.md:33` «SUPERSEDED»), P4 e AC 11-12 (nessun filtro di stato: `registry.ts:945`, `logbook/page.tsx:223-226`), AD-4, AD-5, la riga «Ratifica 3», §3.6 (DB di carico cancellato), §4.4 (probe nello scratchpad spariti), la modifica al mock `exports.service.test.ts:19`, i blocchi §4.2 per `pdf-exports` e registro voli, le righe §6 `seed-load.ts:1351` e `registry.ts:961`, intestazione e §5.11 («un reviewer sulla 3000»).

**VALID**: P1 (nessuna guardia su HEAD, `grep EFFECTIVE_DATE src/` = 0; writer con data utente `accounts.service.ts:229`, `cash.service.ts:387`; rotte `top-ups/route.ts:13`, `cash-movements/route.ts:33`, `transactions.service.ts:525,542`), P2, P6, P7, AC 1-5, 15, 17 (delta su e2e 606 / unit 2211), AD-3 (`billing-summary.service.ts:99`, `:129`), AD-9.

**NEEDS CHANGE**:
- **AD-1 (posto)**: precedente su HEAD `rates.service.ts:75-79` (`assertRateValidFromNotPast`, 422 `RATE_VALID_FROM_IN_PAST`, 19.3). Esportare la guardia da `cash.service.ts` (non importa `mail`, quindi non trascina `@/lib/env`) e importarla in `accounts.service.ts` — o file nuovo `src/server/services/effective-date.ts`; scelta del dev, dichiarata. Posizione: `recordTopUp` dopo `:229`, prima della `$transaction` `:232`; `recordCashMovement` dopo la guardia della categoria di sistema `:374-379`, prima della `create` `:381`. Guardia nel service (non nello Zod): precedente 19.3/R-19-f, da dichiarare nel record (chiude §7 Q1).
- **AD-2**: la motivazione (b) è superata (`@/lib/zoned-time` è già nel bundle client dalla 19.3); restano codice dedicato e purezza di schema/OpenAPI.
- **AC 6**: il censimento su HEAD conta 9 scritture: 3 con data utente (`accounts:240`, `:253`, `cash:381`) e **6 derivate dal server** (`recordAdjustment` `accounts:752` con oggi Roma `:758`; quota `membership:127`; storno `cash:456`/`:467`; gemello di cassa del compenso `instructor-compensation:496` data `:481`; `FLIGHT_CHARGE` `flights:945`; riscrittura del `FLIGHT_CHARGE` in `updateFlight` `flights:1287`, data = `flightDate` già limitata da `FLIGHT_DATE_IN_FUTURE`). Testo: «6 writer derivati». Spariti la chiusura PPR (19.1) e i due storni del volo (19.6).
- **AC 13 / AD-6 / P5**: i fatti di AD-6 erano sbagliati — in «Per categoria» `byCategory.in/out/net` sono solo `title` (tooltip, `billing-console.tsx:1108-1116`); «Risultato» sta in `.billing-panels` (`billing-panels.tsx:105-114`, foglio mobile `billing-panels-mobile.tsx:63-71`); il PDF si dichiara già «di cassa». Testo visibile: v. ratifica Q-16.6a-a in §R-PO.
- **AC 14**: `CashReportPage` è letto solo dal PDF (`exports.service.ts:592`); `/dashboard/reports` usa `ReportsPage`; titolo PDF già «Report di cassa»/«Cash report» (`66fd139`).
- **AC 16 / AD-8 (banda di date)**: la banda 2014-07..2019-12 collide con dati in DB (cassa del seed 2019-06-15/16 `prisma/seed.ts:271-274`; addebito a 0 € 2019-12-18 `e2e/flights.spec.ts:1112-1113`) e il test `billing.spec.ts:172-188` asserisce `toHaveCount(2)` sul libro globale filtrato per data. Banda libera: **2004-2009** (es. conto alla rovescia da `Date.UTC(2009,11,31)` su 2 000 giorni; 2010 e 2012 occupati da `account-statement-period`, 2020-2022 da `uniquePastDateOnly`). Resta la trappola `day1 < day2`. Il commento `billing-global.spec.ts:40` diventa falso: correggerlo.
- **AD-7**: nessun DTO OpenAPI né rotta per `getOwnCompensationOverview` (unico chiamante `my-compensation/page.tsx:72`): `payoutsTotal` va solo nel tipo TS, niente `registry.ts`.
- **AD-10**: 16.2 done; la **16.5 atterra prima** e tocca `instructor-compensation.service.ts` (`computeSummaryRows`) — ripartire dal suo HEAD; la 16.9 riscrive i precompilati «oggi» dei tre form (`16-9-…md:146-152`).
- **AD-11**: decisione invariata (niente `max`: `DateInput` gestisce solo `min`, `date-input.tsx:98-101,158`; servirebbe un `maxDate` nel `CalendarPopover`; la 16.9 riscrive le stesse righe). TD-16.6a-b resta.
- **AD-12**: namespace del form ricarica `PersonDetailPage.accountPanel.topUp` (`people/[id]/page.tsx:247-263`), non `PersonPage`. Nessuno dei tre form ha una mappa `errors.*`: chiave piatta come `AccountStatementPage.adjustments.flightChargeError` (19.6). Leggere il codice con `parseApiError` (`src/lib/api-field-errors.ts:31`; precedente `account-section.tsx:1008-1012`). Testo coerente con `it.json:1064` («La data del volo non può essere nel futuro.»).
- **AC 18**: restano le discriminanze di P1 e P6, **solo su copia isolata con sha256**.
- **§3.2**: aggiungere in `registry.test.ts` (modello `:202-213`) `toContain('EFFECTIVE_DATE_IN_FUTURE')` sulle 3 rotte.

**Righe spostate**: `cash.service.ts` `recordCashMovement` :361 (categoria di sistema anche «Compensi istruttori» `:54`); `instructor-compensation.service.ts` tipo `:263-275`, limite `:277`, `Promise.all` `:332-339`, `return` `:341-357`; `registry.ts` description top-ups `:613-616`, cash-movements `:830-833`, transactions `:925-928`; rami d'errore `account-section.tsx:887-890`, `pilots-console.tsx:812-815`, `transaction-editor.tsx:191-194`; «Pagamenti ricevuti» `my-compensation/page.tsx:125-127`, desktop `:134`, mobile `:171`; idioma della nota `billing-console.tsx:724` (`card-sub`, stringa calcolata nel server `billing/page.tsx:220`); «Per categoria» `billing-console.tsx:1081-1131`, etichette da `billing/page.tsx:155` e `:207-213`; PDF di cassa `exports.service.ts:580-604`; `e2e/billing.spec.ts` `dateAt`/`uniqueDatePair` `:26-34`, call-site `:176/:194/:212/:229/:245/:413/:439`.

**Fatti nuovi**: il check BALANCE dei requisiti (R-19-g) somma tutti i movimenti senza limite di data (`requirements.service.ts:143`): oggi una ricarica futura fa passare il check — ragione in più per P1; l'aggregato non si tocca (AD-3). L'estratto conto 19.11 finisce oggi Roma: una ricarica futura resta fuori dal periodo ma conta nel «Saldo attuale» (D-2) — nessuna modifica alla 19.11. **Nessuna deroga** (R-16-h rifiuto secco; avviso + «Procedi comunque» vale solo per voli/prenotazioni; i form di ricarica/cassa non sono editor a Salva unico). Copy: glossario, `BANNED` `/payout/i`, mai «card» in UI; «Ultimi {shown} di {total}» senza ICU (compare solo con 50, come `ReportsPage.mobile.capNote`); parità con `src/i18n/messages.test.ts` (lo script python di §4.5 non serve). e2e: `todayRome()`/`addDaysIso()`; persone run-unique; nessun project serializzato; caso «> 50 compensi» con fixture SQL in `e2e/db-fixtures.ts` invece di 51 POST; `billing.spec.ts:53`, `cash-report.spec.ts:47`, `mobile-billing.spec.ts:58` restano ≤ oggi Roma; le date future di `cash-report.spec.ts:91-92` sono parametri di query, non toccarle.

**Stima**: ~15 file, ~+300/−40, ~11 AC (≈ 1/6 della 19.7a). Nessuno split. Dev **Opus**.

### §R-PO — Ratifica PO del 2026-11-03 (AskUserQuestion, prima del dispatch)

- **Q-16.6a-a — i due libri si dichiarano** (AC 13, sostituisce AD-6 e la tabella delle etichette): `BillingPage.byCategory.title` «Per categoria» → **«Cassa per categoria»** (EN «Cash by category»); `panels.result.revenue` «Ricavi» → **«Ricavi maturati»** (EN «Earned revenue»). **«Costi» resta invariato**: `costCents` sono le uscite di cassa (`billing-summary.service.ts:21-22`, `computeCostCents`), quindi coincidono col libro di cassa. Il PDF non si tocca (è già «Report di cassa»); i tooltip `byCategory.in/out/net` non si toccano. Applicare la stessa etichetta su desktop (`billing-panels.tsx:105-114`) e sul foglio mobile (`billing-panels-mobile.tsx:63-71`); misurare «Ricavi maturati» a 375 px nel foglio mobile. Glossario: aggiungere i due termini in `docs/i18n/glossario-it.md` se la tabella dei termini contabili li prevede. Motivazione registrata col PO: «Per categoria» conta i soldi entrati in cassa, ricariche comprese; i Ricavi del Risultato contano i voli addebitati nel mese, pagati o no, ricariche escluse (sono acconti).

Status: **review** — dev 2026-11-04 (`a6be2da`, v. «Dev Agent Record» in fondo); creata 2026-09-10, riallineata e ratificata il 2026-11-03 (§R, §R-PO). **Modello dev: Opus 5 xhigh** (la story tocca UI: 5 etichette KPI condizionate al filtro di stato, 4 etichette dei due libri in due locale su schermo E su carta, una nota «ultimi 50 di N» nuova in una card con **due facce**. È UI di TESTO, nessun layout nuovo — ma la regola utente 2026-07-29 è esplicita: se una story scrive UI, il dev è Opus). Review: **Opus 5 xhigh adversarial**.

> ⚠️ **Questa story è la METÀ «letture e stampe» della 16.6 del piano.** L'altra metà è `16-6b-quota-rettifiche-catene.md` (guardie di scrittura sul ledger conto: quota annuale, rettifica su addebito volo, catene di storno). Il piano descriveva **una** story; la divido perché tocca **sei superfici indipendenti** (soglia di progetto: >4 superfici non correlate o >20 AC) e perché le due metà non condividono **nessun file di produzione**: la verifica dell'una non dice niente sull'altra. **Nessuna dipendenza fra le due**: possono essere sviluppate in qualunque ordine, anche in parallelo, e nessuna delle due tocca `src/lib/api/handler.ts` (solo la 16.6b lo fa).
>
> ⚠️ **Baseline**: `9272129` è il HEAD su cui **ho misurato** ogni `file:riga` di questo file. La 16.1 (`1a57609`) è **già committata** e le sue modifiche sono dentro queste righe: `todayDateOnlyUtcInZone(APP_TIMEZONE)` è l'helper vivo, `todayDateOnlyUtc` è quello UTC da NON usare. I `file:riga` dell'audit sono misurati su `b7b8d13`: dove divergono, **vale questo file** (la tabella §3.1 dice quali ho riverificato). Se il dev parte da un HEAD più avanzato: `git log --oneline -3`, rileggere ogni riga citata, **correggere questo file** dove è slittata.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` §**MAJOR-4**, §**MAJOR-5**, §**MINOR-4**, §**MINOR-5**, §5 **DQ-2**/**DQ-3**/**DQ-4**; `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 16.6» (contratto), §«Architettura e vincoli», **R-16-h**; `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md` §1 (l'idioma «un solo calendario», che questa story **riusa** e non reinventa). Skill obbligatorie: `.claude/skills/karpathy-guidelines/SKILL.md`; per la parte UI `design-taste-frontend` e la skill di progetto `ui-ux-pro-max`.
>
> 🧹 **Il DB di lavoro va resettato PRIMA di qualunque run e2e** e **un reviewer sta usando la porta 3000 e il DB e2e in questo momento**: coordinarsi con la sessione principale prima di prendere il DB. Reset (macchina locale, `HANDOFF.md`): `fuser -k 3000/tcp; docker compose down -v && docker compose up -d && sleep 5 && set -a && . ./.env && set +a && npx prisma migrate deploy && npx prisma db seed`.

---

## Story

As **il tesoriere che stampa il registro e legge la liquidità di oggi**,

I want che **ciò che stampo coincida con ciò che vedo** e che **nessuna data valuta futura** entri nel ledger,

so that il PDF del registro voli non sommi gli annullati che il KPI esclude (MAJOR-5), la Banca di oggi non contenga 590,00 € datati fra il 2035 e il 2055 (MAJOR-4), e le due carte «denaro entrato» dello stesso mese dicano di essere **due libri** invece di sembrare due errori (MINOR-4, DQ-3).

### Il perché: tre volte lo stesso difetto — un numero che afferma più di quello che sa

Non sono tre bug diversi. Sono **tre punti in cui una cifra viene mostrata senza il perimetro che la definisce**:

1. **Il perimetro temporale.** `effectiveDate` è un `z.iso.date()` nudo (`schemas/accounts.ts:41`, `schemas/cash.ts:93`) — nessun bordo superiore — mentre la data del **volo** ha il suo bordo da sempre (`FLIGHT_DATE_IN_FUTURE`, `flights.service.ts:763`). E i due aggregati di tesoreria non delimitano in alto (`billing-summary.service.ts:101-102`, `:129-133`). Il risultato misurato dall'audit: il pannello «Liquidità» dichiara una Banca di **−542,27 €** quando la posizione vera a oggi è **−1 132,27 €**.
2. **Il perimetro di stato.** Il totale a schermo passa da `getFlightTotals`, che **forza** `status: 'REGISTERED'` per Ratifica 3 (`flights.service.ts:1719`). Il PDF, dalla stessa intestazione, **risomma le righe** che `listFlights` gli ha restituito, dove `status` è un filtro **opzionale** (`flights.service.ts:1609`) — quindi somma anche gli annullati (`exports.service.ts:676-677`).
3. **Il perimetro contabile.** «Per categoria · Entrate» (cassa incassata, gemelli di ricarica inclusi) e «Risultato · Ricavi» (ricavo di competenza, gemelli esclusi) stanno **sui due lati dello stesso `.billing-split`**, entrambe sottotitolate `{month}`, e su agosto differiscono di **611,33 €**. Nessuna delle due è sbagliata. Nessuna delle due lo dice.

Lo stesso vale per le due liste tagliate senza dirlo: il registro voli filtrato su «Annullato» mostra **KPI a zero sopra righe con importi reali** (DQ-4), e «Pagamenti ricevuti» mostra **gli ultimi 50** sotto un KPI che netta **tutti** (MINOR-5).

### Fatti misurati che vincolano il design

| Fatto | Misura (oggi, su questo HEAD) | Conseguenza |
|---|---|---|
| **Solo DUE writer** del ledger prendono una `effectiveDate` dall'utente | censimento completo delle 11 `create` di ledger (§3.3): `recordTopUp` (`accounts.service.ts:229`) e `recordCashMovement` (`cash.service.ts:342`). Gli altri 9 la derivano dall'orologio o dal volo | la guardia ha **due call-site**, non undici — e `POST /api/v1/transactions` la eredita **gratis** perché delega a questi due (`registry.ts:926`) |
| Le due `create` sono già dentro le rispettive validazioni di dominio | `recordTopUp` fa persona → categoria → transazione; `recordCashMovement` fa categoria → categoria di sistema → create | il posto della guardia è **prima** di quel lavoro, non dentro la transazione: non c'è niente da serializzare (una data non è una risorsa contesa) |
| Il PDF è **cappato** e il cap si valuta sul totale filtrato | `exports.service.ts:597-598`: `listFlights({...query, page:1, pageSize: PDF_EXPORT_MAX_ROWS})` poi `assertWithinPdfExportCap(result.total)`; `PDF_EXPORT_MAX_ROWS = 2_000` (`:66`) | in un export **riuscito** le righe portate **sono** l'insieme filtrato ⇒ `getFlightTotals(actor, query)` sullo **stesso** `query` è la parità esatta, non un'approssimazione |
| `getFlightTotals` condivide **RBAC e WHERE** con `listFlights` | `flights.service.ts:1714` (`authorizeFlightsQuery`) e `:1721` (`buildFlightsWhere` + `status:'REGISTERED'`) | il PDF non deve ricostruire nulla: **chiama** la funzione. È la prima delle due opzioni dell'audit, quella che «chiude la classe di difetto» |
| Il mock del test dell'export espone **solo** `listFlights` | `exports.service.test.ts:19`: `vi.mock('./flights.service', () => ({ listFlights: vi.fn() }))` | l'import nuovo **rompe quel file** finché il mock non elenca anche `getFlightTotals`: è una modifica **obbligatoria**, non opzionale (misurata: v. §4.4) |
| La striscia KPI del registro voli è **una sola**, condivisa desktop/mobile | `logbook-console.tsx:855-856` (doc-comment: *«The "Totali" row is NOT repeated here: the KPI strip above the card already shows the same four numbers»*) | DQ-4 su mobile si chiude **da sé** cambiando i 4 KPI in `logbook/page.tsx:233-237`; la riga «Totali» è **solo desktop** |
| Il filtro di stato è già letto nella **stessa** funzione che rende i KPI | `logbook/page.tsx:95` (`const status = sanitizeFlightStatus(sp.status)`), KPI a `:233-237`, label «Totali» passata a `:278` | DQ-4 è **due modifiche in un file** più le chiavi i18n: nessun prop nuovo attraverso il confine server/client |
| «Entrate» e «Ricavi» hanno **etichette diverse su schermo e su carta** | schermo: `BillingPage.byCategory.in`/`out` e `BillingPage.panels.result.revenue`; carta: namespace **diverso** `CashReportPage.categories.in`/`summary.totalIn` (`exports.service.ts:578-589`) | MINOR-4 tocca **due namespace i18n**, non uno: una correzione solo a schermo lascia la carta a mentire (lezione AOG-1a MINOR-1: *misurare la PAGINA*, qui *misurare anche il PDF*) |
| «Pagamenti ricevuti» non sa quanti sono | `instructor-compensation.service.ts:278` (`OWN_PAYOUT_HISTORY_LIMIT = 50`), `:338` (`take:`) — nessun `count` | per dire «ultimi 50 di N» serve **una** `count` nella `Promise.all` già presente (`:333`) e **un** campo DTO nuovo: non una paginazione |
| La card «Pagamenti ricevuti» ha **due facce** che mappano lo stesso array | `my-compensation/page.tsx:134-141` (desktop) e `:171-173` (mobile) | la nota va **una volta sola**, nella `card-head` come `card-sub` (idioma `scadenze-console.tsx:395`) — mai duplicata in entrambe le facce |
| Una `effectiveDate` futura **arriva già dall'API reale** | l'audit ha trovato in DB ricariche datate 2035-11-13, 2047-08-24, 2051-02-26 (×2), 2053-06-05, 2055-05-23 — **entrate dallo schema reale** | il difetto non richiede malizia: è un operatore che digita 2035 invece di 2025 |
| **UNA** sola spec e2e scrive date future, e lo fa per isolarsi | `e2e/billing.spec.ts:26` `dateAt` (base `Date.UTC(2033,0,1)` + fino a 9 000 giorni) usata da `uniqueDatePair()` in **7** test (§3.5) | è la sola fixture da spostare. Il file **ha già** il pattern giusto due funzioni più sotto: `uniquePastDateOnly()` (`:46-49`), scritta per lo stesso motivo quando il volo ha imposto la stessa regola |
| Il DB di **carico** ha 1 riga di cassa datata domani, e non passa dall'API | `2026-09-11`, +2 500, «Diritti di atterraggio PPR-2026-0030» (misura §3.6); `seed-load.ts:1351` la scrive con `createMany` da `closedAt` | il seed **non** è toccato da questa story (la guardia è API-side) — dichiarato in §6 |

---

## §0 — Requisiti FISSI (contratto)

Dagli AC di contratto del piano (§«Story 16.6»), qui numerati per essere citabili. **Le tre righe di contratto della 16.6b non sono in questo file.**

| # | Requisito di contratto |
|---|---|
| **P1** | Una ricarica o un movimento di cassa con `effectiveDate` **> oggi Europe/Rome** → **422** (R-16-h). Vale su **ogni** rotta che raggiunge quei due writer. |
| **P2** | Le fixture e2e che usavano date **future** per isolarsi sono **adattate**, mantenendo l'isolamento. |
| **P3** | I totali del **PDF** del registro voli **escludono gli annullati esattamente come il KPI a schermo**, usando **la stessa funzione di totale** (`flights.service.ts#getFlightTotals`) — non una seconda somma corretta. |
| **P4** | Con `?status=CANCELLED` i **KPI** e la riga **Totali** dichiarano «**registrati**» (DQ-4), in **entrambi** i locale. |
| **P5** | «Per categoria · Entrate» e «Risultato · Ricavi» hanno etichette che dicono di essere **due libri** (cassa incassata vs competenza) — **nessuna riconciliazione forzata**, **nessun cambio di calcolo** (DQ-3/MINOR-4). |
| **P6** | «Pagamenti ricevuti» **dichiara** il taglio a 50 (MINOR-5). |
| **P7** | Ogni guardia/parità nuova nasce con un test che la prova **ROSSA** sul pre-fix simulato (vincolo d'architettura dell'epic). |

**Ratifica che vincola questa story** — **R-16-h** (piano, 2026-09-10): *«una `effectiveDate` futura (oltre oggi Europe/Rome) su ricariche e movimenti di cassa è rifiutata al bordo Zod (422), come già la data del volo; le fixture e2e che usavano date future per isolarsi vanno adattate nella stessa story»*. La ratifica ha scelto l'opzione (a) di **DQ-2**: **rifiutare**, non delimitare gli aggregati. ⇒ `computeTreasuryTotals`/`computeDeposits` **NON si toccano** (v. AD-3). Nessuna ratifica PO **nuova** è necessaria: tutte le decisioni di questo file sono scelte di implementazione dentro il perimetro ratificato. Una sola deviazione dalla **lettera** di R-16-h («al bordo Zod») è motivata e misurata in **AD-2** — la sottopongo all'attenzione del PO in §7 ma **non** blocco la story su di essa (il comportamento osservabile — 422, stessa regola del volo — è identico).

**Invarianti che questa story deve lasciare intatte:**

| # | Invariante | Qui significa |
|---|---|---|
| **[L-1]** | Ledger **append-only**: nessun update/delete, ogni correzione è una riga nuova | le **6 righe già in DB** con data 2035-2055 **restano**: la guardia vale sulle scritture **nuove**. Nessun backfill, nessuna migrazione |
| **[L-2]** | Saldo = `SUM(AccountMovement)`, mai denormalizzato | nessun aggregato cambia definizione in questa story (§AD-3) |
| **Ratifica 3** | Un volo annullato **resta visibile in tabella**, mai conteggiato nei totali | il PDF continua a **stampare la riga** dell'annullato (colonna «Stato», `exports.service.ts:667-671`) e smette solo di **sommarla** |
| **AD-1 (progetto)** | Una regola di dominio vive in **una** funzione | la guardia della data valuta ha **una** implementazione e **due** call-site; il totale del registro voli ha **una** implementazione e **due** lettori (schermo e carta) |
| **16.1** | Ogni «oggi» si calcola in Europe/Rome con gli helper esistenti | la guardia usa `todayDateOnlyUtcInZone(APP_TIMEZONE)` — **mai** `todayDateOnlyUtc()`, **mai** un `new Date()` confrontato con una data-only |

---

## §1 — Decisioni architetturali

**AD-1 — La guardia della data valuta è UNA funzione con DUE call-site, modellata riga per riga su quella del volo.**

L'esemplare da copiare esiste e sta a 40 righe di distanza dal codice che lo cita:

```ts
// flights.service.ts:762-765 (post-16.1) — il modello
const flightDate = deriveFlightDate(input.takeoffAt);
if (flightDate.getTime() > todayDateOnlyUtcInZone(APP_TIMEZONE).getTime()) {
  throw new ValidationError('Flight date cannot be in the future.', undefined, 'FLIGHT_DATE_IN_FUTURE');
}
```

Firma proposta (il dev può cambiarne il nome, **non** la forma né il codice d'errore):

```ts
/**
 * Data valuta (`effectiveDate`) nel futuro -> 422 (R-16-h, ledger MAJOR-4 /
 * DQ-2). Stesso confronto della data del volo
 * (`flights.service.ts#resolveFlightInput`): due `Date` a mezzanotte UTC che
 * rappresentano due giorni CALENDARIO Europe/Rome, mai un istante contro una
 * data-only. Il bordo e' INCLUSIVO: oggi Roma e' accettato.
 * Un solo posto, due call-site (`recordTopUp`, `recordCashMovement`) — mai
 * due implementazioni (AD-1 di progetto).
 */
export function assertEffectiveDateNotInFuture(effectiveDate: Date): void {
  if (effectiveDate.getTime() > todayDateOnlyUtcInZone(APP_TIMEZONE).getTime()) {
    throw new ValidationError(
      'Value date cannot be in the future.',
      { effectiveDate: toDateOnlyString(effectiveDate) },
      'EFFECTIVE_DATE_IN_FUTURE',
    );
  }
}
```

**Dove vive la funzione**: `src/server/services/errors.ts` è la gerarchia degli errori, non il posto per una regola di dominio. I due chiamanti sono `accounts.service.ts` e `cash.service.ts`, e non c'è oggi un modulo condiviso fra i due. **Scelta: `src/lib/effective-date.ts`** (nuovo, ~15 righe, puro, nessun import di `@/server/db/prisma` né di `@/lib/env` — importa solo `@/lib/date-only`, `@/lib/time`, `@/lib/zoned-time` e `ValidationError`). Motivo: un modulo nuovo minuscolo batte l'alternativa (esportare da `accounts.service.ts` e importarlo in `cash.service.ts`, che accoppierebbe due service fra loro per **una** riga di confronto — e `cash.service.ts` oggi **non** importa `accounts.service.ts`, verificato).
⚠️ **Trappola CLAUDE.md**: `ValidationError` vive in `@/server/services/errors.ts`, che **non** importa Prisma né l'env — verificato leggendo il file (nessun import). Quindi `src/lib/effective-date.ts` resta importabile in un unit senza `.env`. **Verifica obbligatoria** prima del commit: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/effective-date.test.ts`.

**Posizione dei due call-site** — **prima** del lavoro che la richiesta farebbe invano:
- `recordTopUp` (`accounts.service.ts:197`): subito **dopo** `const effectiveDate = new Date(input.effectiveDate)` (`:229`) e **prima** della `$transaction`. La `authorize` e la `findUnique` della persona restano dove sono (una 403/404 vince su una 422: è l'ordine già usato da `resolveFlightInput`).
- `recordCashMovement` (`cash.service.ts:316`): **prima** della `prisma.cashMovement.create` di `:336`, dopo la guardia della categoria di sistema di `:329` (una categoria riservata è un 409 sullo *stato*, che vince su una 422 sull'*input*: stesso ordine «stato prima di input» del volo).

**AD-2 — Guardia nel SERVICE con un codice stabile, NON in un `.refine` Zod. Deviazione dichiarata dalla lettera di R-16-h, con tre misure.**

R-16-h dice «al bordo Zod». Il comportamento osservabile che chiede — **422**, stessa regola del volo — è identico nelle due implementazioni. Scelgo il service per tre ragioni **misurate**:

1. **Un `.refine` perde il codice.** `validationErrorResponse` (`src/lib/api/handler.ts:46-50`) emette **sempre** `VALIDATION_ERROR` con `z.flattenError(error)`. Un client non può distinguere «data futura» da «importo zero» e non può mostrare un messaggio dedicato — mentre l'app fa esattamente il contrario da 5 epic: `MEMBERSHIP_FEE_INSUFFICIENT_BALANCE`, `FLIGHT_DATE_IN_FUTURE`, `BOOKING_IN_PAST`, `ETA_IN_PAST` sono tutti codici di dominio **nei service**, e le UI ci si ramificano (`scadenze-console.tsx:822`, `dashboard/page.tsx:837`).
2. **Un `.refine` con l'orologio dentro rende lo schema impuro.** `src/lib/schemas/accounts.ts`, `cash.ts` e `transactions.ts` sono importati da **componenti client** (`account-section.tsx`, `billing-console.tsx`, `dashboard/billing/page.tsx` — misurato) e da `registry.ts`, che **genera l'OpenAPI**. Un refine che legge `new Date()` (a) trascina `@/lib/zoned-time` nel bundle client, e quel modulo si dichiara **SERVER-SIDE only** nel proprio doc-comment; (b) rende **ogni** unit di schema dipendente dalla data di esecuzione (oggi `recordTopUpSchema.safeParse({ effectiveDate: '2026-03-01' })` è verde in `accounts.service.test.ts:1135` e diventerebbe **rosso il 2 marzo 2026 → passato** — no, peggio: resterebbe verde ma un domani un fixture con data futura ereditata romperebbe un test che non parla di date).
3. **Il perimetro è più piccolo nel service.** 4 siti Zod (`accounts.ts:41`, `cash.ts:93`, `transactions.ts:186`, `transactions.ts:201`) contro **2** siti service — e i due branch di `recordTransactionSchema` sono **pura delega** ai due writer (`registry.ts:926`), quindi nel service la copertura è automatica e nel Zod va duplicata.

**Contratto dichiarato**: `422` con codice **`EFFECTIVE_DATE_IN_FUTURE`** e `details: { effectiveDate }`. Il codice è **nuovo** (verificato: `grep -rn "EFFECTIVE_DATE" src/` → 0 occorrenze). Va documentato nelle **4** description di `registry.ts` (v. AD-6).

**AD-3 — `computeTreasuryTotals`/`computeDeposits` NON si toccano, e questo è un requisito, non un'omissione.**

DQ-2 offriva due opzioni **alternative** («non cumulative», parole dell'audit): rifiutare al bordo **oppure** delimitare gli aggregati a oggi. R-16-h ha scelto la prima. Cumularle sarebbe un difetto nuovo: le **6 righe future già in DB** e quelle di un futuro import legittimo diventerebbero invisibili in Liquidità **senza** che nessuna schermata lo dica — cioè lo stesso difetto di «lista tagliata senza dichiararlo» che questa story chiude altrove. `billing-summary.service.ts:99-149` resta **byte-identico**; il dev lo verifica con `sha256sum` (§4.3).

**AD-4 — Il PDF CHIAMA `getFlightTotals`; non aggiunge un `status` al `reduce`.**

```ts
// exports.service.ts, al posto di :676-677
// Story 16.6a (ledger MAJOR-5): i totali del PDF sono GLI STESSI della
// striscia KPI, non una seconda somma — `getFlightTotals` condivide
// `authorizeFlightsQuery` e `buildFlightsWhere` con la `listFlights` qui
// sopra e forza `status: 'REGISTERED'` (Ratifica 3). L'export riuscito porta
// TUTTE le righe filtrate (`assertWithinPdfExportCap` sopra), quindi i due
// numeri sono la stessa cosa per costruzione, non per coincidenza.
const totals = await getFlightTotals(actor, query);
```
e poi `formatMinutes(totals.minutes)` / `formatCents(totals.revenueCents, locale)` nel blocco `totals` di `:682-683`.

| Perché così | |
|---|---|
| **Chiude la classe, non l'istanza** | è la prima delle due opzioni dell'audit. Un `status: 'REGISTERED'` nel `reduce` funzionerebbe **oggi** e tornerebbe a divergere al primo stato nuovo o alla prima definizione di «ricavo» che cambia in `getFlightTotals` |
| **`query` è lo stesso oggetto** | `exports.service.ts:597` passa a `listFlights` `{...query, page:1, pageSize: PDF_EXPORT_MAX_ROWS}`; a `getFlightTotals` va **`query`** nudo (la paginazione è irrilevante per un `aggregate` e `getFlightTotals` la ignora) |
| **RBAC gratis e non aggirabile** | `getFlightTotals` ri-autorizza da sé (`:1714`). Un `PILOT` che esporta il proprio registro ottiene i **propri** totali: nessuna via nuova ai dati di terzi |
| **Costo: una query in più per export** | un `aggregate` su `Flight` con lo stesso WHERE dell'export. Su un export al massimo di 2 000 righe è rumore; da dichiarare nel Dev Agent Record, non da ottimizzare |
| **`import` nuovo** | `exports.service.ts:27` diventa `import { getFlightTotals, listFlights } from './flights.service';` — e il **mock** di `exports.service.test.ts:19` deve elencare `getFlightTotals`, altrimenti 14 test di quel file falliscono (misurato: v. §4.4) |

⚠️ **Non toccare la colonna «Stato» né le righe.** Ratifica 3 dice *visibile in tabella*: l'annullato **continua** a comparire, con il suo importo nella propria riga, e a non essere sommato. È esattamente la stessa asimmetria dello schermo, ed è **voluta**.

**AD-5 — DQ-4: il qualificatore compare SOLO col filtro «Annullato», su TUTTI E CINQUE i numeri della schermata.**

Il difetto che DQ-4 descrive è **una contraddizione interna a una schermata**: «Voci 0 · Ore 0:00 · Ricavo 0,00 €» sopra righe che mostrano importi reali. Correggere due etichette su cinque la lascerebbe in piedi in forma ridotta (lezione della review AOG-1a, MINOR-1: *«il fix parziale di un numero cappato puo' aprire una contraddizione interna sulla stessa schermata — misurare la PAGINA»*). Quindi: **4 KPI + la riga Totali**, tutti o nessuno.

```tsx
// logbook/page.tsx:233-237, forma proposta
const onlyCancelled = status === 'CANCELLED';
// ...
<KPI label={onlyCancelled ? t('kpi.entriesRegistered') : t('kpi.entries')} value={totals.count} />
```
e `totals: onlyCancelled ? t('table.totalsRegistered') : t('table.totals')` a `:278`.

**Chiavi i18n nuove** (5 × 2 locale = 10 stringhe; testi proposti, il dev può migliorarli restando dentro il senso):

| Chiave | it | en |
|---|---|---|
| `LogbookPage.kpi.entriesRegistered` | Voci registrate | Registered entries |
| `LogbookPage.kpi.hoursRegistered` | Ore registrate | Registered flight hours |
| `LogbookPage.kpi.movementsRegistered` | Decolli / Atterraggi registrati | Registered takeoffs / landings |
| `LogbookPage.kpi.revenueRegistered` | Ricavo registrato | Registered revenue |
| `LogbookPage.table.totalsRegistered` | Totali registrati | Registered totals |

**Perché varianti di etichetta e non una frase in più**: una nota accanto alla striscia sarebbe un nodo nuovo, con il suo spazio, il suo contrasto e la sua faccia mobile da misurare — per dire una cosa che l'etichetta può dire da sé. Le 4 etichette esistenti restano **byte-identiche** quando il filtro non c'è (AC 9): il caso normale non cambia di un pixel.
**Mobile è coperto senza toccare `logbook-console.tsx`**: la striscia KPI è unica per le due facce (`logbook-console.tsx:855-856`). La riga «Totali» è solo desktop. Nessun testid nuovo, quindi **nessuna** questione di convenzione `-mobile`/`mobile-`.

**AD-6 — MINOR-4: due parole in più su ciascuna delle due carte, in DUE namespace i18n, zero cambi di calcolo.**

DQ-3 è stata decisa dal piano in favore di «no riconciliazione, etichette che lo dicano». Quindi `getCashReport` (`cash.service.ts:590-602`) **non si tocca**: continua a includere i gemelli di ricarica, perché **il cassetto ha davvero incassato quei 960,00 €**.

| Superficie | Chiave | it (oggi → proposto) | en (oggi → proposto) |
|---|---|---|---|
| Schermo, carta «Per categoria» | `BillingPage.byCategory.in` | Entrate → **Entrate di cassa** | In → **Cash in** |
| Schermo, carta «Per categoria» | `BillingPage.byCategory.out` | Uscite → **Uscite di cassa** | Out → **Cash out** |
| Schermo, carta «Risultato» | `BillingPage.panels.result.revenue` | Ricavi → **Ricavi di competenza** | Revenue → **Accrued revenue** |
| Schermo, carta «Risultato» | `BillingPage.panels.result.cost` | Costi → **Costi di competenza** | Cost → **Accrued cost** |
| **PDF** «Report finanziario» | `CashReportPage.categories.in`/`out` e `CashReportPage.summary.totalIn`/`totalOut` | Entrate/Uscite → **Entrate di cassa**/**Uscite di cassa** | Inflows/Outflows → **Cash in**/**Cash out** |

⚠️ **`CashReportPage` è un namespace diverso e serve DUE superfici**: il PDF (`exports.service.ts:578-589`) **e** la pagina `/dashboard/reports`. Cambiare quelle 4 chiavi cambia entrambe — che è corretto (sono lo stesso libro), ma va **verificato con lo screenshot** su `/dashboard/reports` oltre che sul PDF, e va dichiarato.
⚠️ **`BillingPage.mobile.kpiResult` («Risultato») NON si tocca**: è il titolo del riquadro, non l'etichetta di una cifra. Il perimetro è **le etichette dei numeri**, non i titoli delle carte.
**Nessuna riga «di cui acconti» nuova** in «Per categoria»: era la seconda opzione dell'audit, e il piano ha scelto la prima. Aggiungere entrambe sarebbe speculativo (karpathy §2).

**AD-7 — MINOR-5: un `count` nella `Promise.all` che c'è già, un campo DTO, una `card-sub`.**

```ts
// instructor-compensation.service.ts:333-341, terzo elemento della Promise.all
prisma.instructorPayout.count({ where: { instructorProfileId } }),
```
`OwnCompensationOverview` (`:265-275`) prende **`payoutsTotal: number`** con doc-comment; `OWN_PAYOUT_HISTORY_LIMIT` resta **50** e resta il `take`. Il KPI «Residuo dovuto» resta `row!.owedTotalCents` — **non delimitato**, corretto oggi e corretto dopo (`:348`).

Il DTO OpenAPI (`schemas/instructor-compensation.ts`) prende il campo nello stesso commit (regola di progetto: OpenAPI e registry nello stesso commit della rotta).

Resa, **una volta sola** per le due facce, nella `card-head` di `my-compensation/page.tsx:125-127`:
```tsx
{overview.payoutsTotal > overview.payouts.length ? (
  <span className="card-sub" data-testid="my-compensation-payouts-cap">
    {t('table.cap', { shown: overview.payouts.length, total: overview.payoutsTotal })}
  </span>
) : null}
```
Chiavi nuove: `MyCompensationPage.table.cap` = it «Ultimi {shown} di {total}» / en «Latest {shown} of {total}». **Idioma preso da `scadenze-console.tsx:395`** (`<span className="card-sub">{labels.shown...}</span>`) e dalla famiglia `RankedCapFoot` («Prime {shown} di {total}», `charts/ranked-cap-foot.tsx:65`) — **non** si riusa `RankedCapFoot`: quel componente porta un bottone «Mostra tutte» che qui **non esiste** (nessuna espansione: la paginazione è fuori scope, v. §6).
**Nessuna paginazione, nessun cambio di `orderBy`**: il difetto adiacente che l'audit nomina (ordine per `createdAt` vs accumulo per `periodEnd`, `:337` vs `:154`) è **fuori scope dichiarato** (§6).

**AD-8 — e2e: `dateAt` cambia base, non forma. La spec porta già il pattern giusto.**

`billing.spec.ts:26` conta **avanti** da `Date.UTC(2033,0,1)` su 9 000 giorni (⇒ 2033-2057). Dopo la guardia, i 7 test che ne dipendono prendono **422** nei loro helper, che asseriscono `200`/`201` (`:112`, `:117`) — quindi **fallirebbero al setup**, prima di ogni asserzione.

Il file **ha già** la risposta, scritta quando il volo impose la stessa regola:
> `billing.spec.ts:34-50` — *«A run-unique isolation date SAFELY IN THE PAST (unlike `dateAt`/`uniqueDatePair`'s own far-future scheme) — `registerFlight` rejects a future `takeoffAt` … so any scenario involving a real flight charge needs a past isolation date instead.»*

**Modifica prescritta** — una funzione, il resto invariato:
```ts
/**
 * Run-unique day, SAFELY IN THE PAST (story 16.6a, R-16-h: il ledger rifiuta
 * una data valuta futura, esattamente come `registerFlight` rifiuta un volo
 * futuro — v. `uniquePastDateOnly` qui sotto, scritta per lo stesso motivo).
 * Conta INDIETRO da 2019-12-31 su ~2 000 giorni (⇒ 2014-07 .. 2019-12): una
 * banda DISGIUNTA da quella di `uniquePastDateOnly` (2020-2022) e dal
 * `PAST_DATE = '2020-01-01'` che altre spec condividono, quindi due fixture
 * non si incontrano mai. Nessun tasso in gioco qui (ricariche e movimenti di
 * cassa non guardano `AircraftRate.validFrom`), quindi non serve il pavimento
 * al 2020 che `uniquePastDateOnly` deve rispettare.
 */
function dateAt(daysBeforeBase: number): string {
  return new Date(Date.UTC(2019, 11, 31) - daysBeforeBase * 86_400_000).toISOString().slice(0, 10);
}

function uniqueDatePair(): { day1: string; day2: string } {
  const dayOffset = Math.floor(Math.random() * 2_000);
  // day1 < day2: `dateAt` conta indietro, quindi l'offset MAGGIORE e' il giorno PRIMA.
  return { day1: dateAt(dayOffset + 1), day2: dateAt(dayOffset) };
}
```
⚠️ **`day1` deve restare il giorno PRIMA di `day2`**: il test di `:174` asserisce l'ordinamento `effectiveDate desc` e commenta *«day1 (earlier) … day2 (later)»*. Invertire il verso di `dateAt` **senza** scambiare l'ordine dentro `uniqueDatePair` romperebbe quel test in modo silenzioso (l'asserzione passa o no a seconda della riga, non del codice) — è la trappola numero uno di questa modifica.

**Effetto collaterale, positivo e da dichiarare**: le nuove date cadono **prima** dell'`openingDate` della tesoreria, quindi quelle righe **escono** dal saldo corrente (`billing-summary.service.ts:101-102`, filtro `effectiveDate >= openingDate`) invece di entrarci come fanno oggi le date 2033+. I 7 test in questione non asseriscono **nessun** aggregato di tesoreria (verificato uno per uno, §3.5): sono test di **tabella e filtri**. La modifica quindi **riduce** l'accoppiamento fra `billing.spec.ts` e la catena serializzata (`billing-global.spec.ts`), non lo aumenta.

**`billing-global.spec.ts:41` NON si tocca**: il suo `dateAt(50_000)` (⇒ ~2170) è usato **solo come parametro di query** (`emptyDay`, `:71`) per costruire un intervallo che esclude tutto — nessuna scrittura, e `from`/`to` **non** hanno bordo superiore (né lo prendono in questa story, v. §6).

**AD-9 — Nessuna migrazione, nessun indice, nessun cambio di schema.** La story aggiunge una guardia, cambia un chiamante e sposta delle etichette. `prisma/schema.prisma` resta **byte-identico** (verificato con `sha256sum` in §4.3).

**AD-10 — Ortogonalità con le altre story in volo.**

| Story | Confine |
|---|---|
| **16.6b** (l'altra metà) | non condivide **nessun** file di produzione con questa. L'unico contatto è concettuale: entrambe aggiungono un codice d'errore nuovo. `src/lib/api/handler.ts` lo tocca **solo** la 16.6b |
| **16.9** (le 7 copie client di `todayDateOnly()`) | i tre form che inviano `effectiveDate` (`account-section.tsx:639`/`:686`, `pilots-console.tsx:739`/`:792`, `billing/transaction-editor.tsx`) precompilano con una `todayDateOnly()` **client, in UTC** — una delle 7 copie censite e assegnate alla **16.9**. Il dev di questa story apre almeno uno di quei file: **non la tocchi**, e **non aggiunga `max={todayDateOnly()}`** al `DateInput` (v. AD-11) |
| **16.5** (payout istruttori) | tocca `instructor-compensation.service.ts` come questa story. Il perimetro qui è **`getOwnCompensationOverview` (`:311-360`) e nient'altro**: il `count` nuovo e il campo DTO. Se la 16.5 è in volo, coordinarsi con la sessione principale **prima** di aprire il file |
| **16.2** (guardie registro voli) | tocca `flights.service.ts`. Questa story **legge** `getFlightTotals` e non lo modifica |

**AD-11 — Il `max` client-side sui tre campi data NON si aggiunge, ed è una scelta misurata.**

Un `max={todayDateOnly()}` sul `DateInput` sarebbe l'ovvio specchio client della guardia. Ma `todayDateOnly()` client **è** la copia UTC che la 16.9 deve correggere: fra le **00:00 e le 02:00 di Roma** calcola **ieri**. Un `max` costruito su quel valore renderebbe il client **più restrittivo del server** per due ore al giorno — bloccherebbe una ricarica datata **oggi** che il server accetta. Cioè: si trasformerebbe un difetto di *prefill* in un difetto di *validazione*. ⇒ in questa story il feedback è **il 422 con il suo messaggio**; il `max` è un TD che la 16.9 potrà chiudere in una riga **dopo** aver corretto l'helper (§6, TD-16.6a-b).

**AD-12 — Il messaggio d'errore nei tre form: una chiave per famiglia, ramificata sul codice.**

I tre form leggono oggi un `labels.genericError` su qualunque `!response.ok`. Con un codice stabile a disposizione (AD-2), ognuno mostra una frase che **nomina la regola**:

| File | Riga del ramo d'errore | Chiave nuova |
|---|---|---|
| `people/[id]/account-section.tsx` | il `catch`/`!ok` della `TopUpForm` (`:664-667`) | `PersonPage.accountPanel.topUp.errors.EFFECTIVE_DATE_IN_FUTURE` |
| `pilots/pilots-console.tsx` | `:765-768` | `PilotsPage.topUp.errors.EFFECTIVE_DATE_IN_FUTURE` |
| `billing/transaction-editor.tsx` | il ramo `!ok` (`:191-194`) | `BillingPage.newTransactionForm.errors.EFFECTIVE_DATE_IN_FUTURE` |

Testo proposto: it «La data valuta non può essere nel futuro.» / en «The value date cannot be in the future.». Il dev **legge** la forma esatta del ramo d'errore in ciascun file e **aggiunge** il caso, senza riscrivere il blocco (karpathy §3: si aggiunge un ramo, non si rifattorizza la gestione errori). Se un form non ha già una mappa `errors.*`, si aggiunge **una** chiave piatta accanto a `genericError` — mai una mappa nuova per una voce.

⚠️ **I tre rami non sono uguali fra loro** (misurato): `account-section.tsx:664-667` e `pilots-console.tsx:765-768` fanno `setFormError(labels.genericError)` **senza leggere il body**; `transaction-editor.tsx:191-194` si ramifica **sullo status** (`response.status === 409 ? labels.conflictError : labels.genericError`), non sul codice. Per mostrare la frase nuova serve **leggere il body** (`await response.json().catch(() => null)` e guardare `error.code`), come fa già `scadenze-console.tsx:820-829` per il proprio 422 — che è l'esemplare da copiare, anche se vive in un altro file.

---

## §2 — Acceptance Criteria

### La data valuta (R-16-h / MAJOR-4 / DQ-2)

1. **Given** `POST /api/v1/people/{id}/account/top-ups` con `effectiveDate` = oggi Roma **+1 giorno** **When** lo invio **Then** **422 `EFFECTIVE_DATE_IN_FUTURE`**, `details.effectiveDate` = la data rifiutata, e **nessuna** riga scritta (né `AccountMovement` né il gemello `CashMovement`): la `$transaction` non si apre nemmeno.
2. **Given** `POST /api/v1/cash-movements` con `effectiveDate` futura **Then** stesso 422, stesso codice, nessuna riga.
3. **Given** `POST /api/v1/transactions` nei branch `TOP_UP` e `CASH` con `effectiveDate` futura **Then** lo stesso 422 per **delega** — nessuna guardia duplicata nel dispatcher (un unit per branch prova che il 422 arriva e che il writer non ha scritto).
4. **Given** `effectiveDate` = **oggi Roma** **When** lo invio **Then** **accettato**: il bordo è **inclusivo**. Un unit con orologio fittizio alle **00:30 di Roma** (quando «oggi UTC» è ancora **ieri**) prova che la guardia usa il calendario **Roma** e non quello UTC — la stessa finestra che la 16.1 ha chiuso su `FLIGHT_DATE_IN_FUTURE`.
5. **Given** `effectiveDate` nel **passato**, anche remoto **Then** accettata (nessun bordo inferiore: una data valuta storica è legittima, ed è quello che le fixture e2e useranno).
6. **Given** i **9 writer** di ledger la cui `effectiveDate` è derivata dal server (rettifica, quota, storno di cassa, payout, PPR, addebito e storni del volo — censimento §3.3) **Then** nessuno di essi cambia: `git diff --stat` non li nomina, e `sha256sum` di `billing-summary.service.ts` è **invariato** (AD-3).

### La parità schermo/carta del registro voli (MAJOR-5)

7. **Given** un insieme filtrato che contiene voli `REGISTERED` **e** `CANCELLED` **When** esporto il PDF **Then** «Durata totale» e «Totale addebiti» sono **esattamente** i numeri della striscia KPI per gli **stessi** filtri, calcolati da **`getFlightTotals`** (una chiamata, non una somma nuova).
8. **Given** lo stesso export **Then** la riga del volo annullato **compare ancora** nella tabella del PDF, con il suo importo nella propria cella e «Annullato» in colonna Stato (Ratifica 3 intatta).
9. **Given** un `PILOT` che esporta **Then** i totali sono i **suoi**: `getFlightTotals` ri-autorizza con `authorizeFlightsQuery` e l'unit lo prova passando l'attore.
10. **Given** un filtro che supera il cap **Then** `EXPORT_TOO_LARGE` **prima** di qualunque totale — l'ordine di `exports.service.ts:597-598` non cambia.

### Le liste e i libri che si dichiarano (DQ-4, DQ-3/MINOR-4, MINOR-5)

11. **Given** `/dashboard/logbook?status=CANCELLED` **Then** i **4** KPI **e** la riga «Totali» portano il qualificatore «registrati», in **it** e in **en**; i numeri restano quelli di oggi (zero, per Ratifica 3).
12. **Given** `/dashboard/logbook` **senza** filtro di stato (o con `status=REGISTERED`) **Then** le 5 etichette sono **byte-identiche** a quelle di oggi — il caso normale non cambia (verifica: `git diff` sui 4 valori i18n esistenti = vuoto).
13. **Given** `/dashboard/billing` **When** leggo «Per categoria» e «Risultato» **Then** le etichette dei numeri dicono **quale libro** è (cassa incassata vs competenza), in due locale; **`getCashReport` e `computeRevenueCents` sono invariati** (`sha256sum`) e le cifre a schermo non si muovono.
14. **Given** il PDF «Report finanziario» **e** la pagina `/dashboard/reports` **Then** portano lo **stesso** qualificatore delle carte a schermo (namespace `CashReportPage`), verificato con uno screenshot per superficie.
15. **Given** un istruttore con **più di 50** payout **When** apro «I miei compensi» **Then** la card dichiara «Ultimi 50 di N» **una volta** (non una per faccia), il KPI «Residuo dovuto» resta il netto di **tutti**, e con ≤ 50 payout la nota **non c'è**.

### e2e, non-regressione, prove

16. **Given** `e2e/billing.spec.ts` **Then** i **7** call-site di `uniqueDatePair()` girano su date **passate** (banda 2014-2019, disgiunta da quelle di `uniquePastDateOnly` e di `PAST_DATE`), `day1` resta **anteriore** a `day2`, e i test passano; `uniquePastDateOnly` e i test che usano `todayDateOnly()` sono **invariati**.
17. **Given** la suite completa **Then** `CI=1` su DB fresco: **0 failed**, e il conteggio finale è ≥ baseline + i test nuovi (esiti verbatim nel Dev Agent Record, `scripts/e2e.sh status`).
18. **Given** il pre-fix simulato **Then** le **tre** discriminanze della tabella §4.3 sono **ROSSE** con l'output citato, e verdi col fix; `sha256sum` dei file ripristinati verificato.

---

## §3 — Dev Notes: blast radius (misurato su `9272129`)

### 3.1 File da modificare

| File | Cosa | Righe misurate |
|---|---|---|
| `src/lib/effective-date.ts` | **NUOVO** — `assertEffectiveDateNotInFuture` (AD-1) | — |
| `src/server/services/accounts.service.ts` | 1 import + 1 chiamata dopo `:229` | `:197`, `:229` |
| `src/server/services/cash.service.ts` | 1 import + 1 chiamata prima di `:336` | `:316`, `:329`, `:336`, `:342` |
| `src/server/services/exports.service.ts` | import di `getFlightTotals` (`:27`), sostituzione di `:676-677`, uso a `:682-683` | `:27`, `:596-598`, `:676-683` |
| `src/server/services/instructor-compensation.service.ts` | `count` nella `Promise.all`, campo `payoutsTotal` nel tipo e nel return | `:265-275`, `:333-341`, `:352-360` |
| `src/lib/schemas/instructor-compensation.ts` | `payoutsTotal` nel DTO di risposta | v. §3.2 |
| `src/lib/schemas/registry.ts` | 4 description: top-ups (`:611`), cash-movements (`:828`), transactions (`:923`), flights/pdf (`:958`); + `payoutsTotal` dove il DTO è descritto | `:611`, `:828`, `:923`, `:958` |
| `src/app/[locale]/dashboard/logbook/page.tsx` | KPI condizionati (`:233-237`), label «Totali» (`:278`) | `:95`, `:233-237`, `:278` |
| `src/app/[locale]/dashboard/my-compensation/page.tsx` | `card-sub` nella `card-head` | `:125-127` |
| `src/app/[locale]/dashboard/people/[id]/account-section.tsx` | ramo d'errore del form ricarica | `:664-667` |
| `src/app/[locale]/dashboard/pilots/pilots-console.tsx` | ramo d'errore del form ricarica | `:765-768` |
| `src/app/[locale]/dashboard/billing/transaction-editor.tsx` | ramo d'errore | `:191-194` |
| `messages/it.json`, `messages/en.json` | 5 (DQ-4) + 4-6 (MINOR-4) + 1 (MINOR-5) + 3 (errori form) chiavi, **simmetriche** | — |
| `e2e/billing.spec.ts` | `dateAt` + `uniqueDatePair` (AD-8) | `:26-32` |

### 3.2 Test da modificare (obbligatori, non opzionali)

| File | Perché |
|---|---|
| `src/server/services/exports.service.test.ts:19` | `vi.mock('./flights.service', () => ({ listFlights: vi.fn() }))` non espone `getFlightTotals`: l'import nuovo fa fallire **ogni** test del file. Aggiungere `getFlightTotals: vi.fn()` e mockarlo nei test dell'export voli |
| `src/server/services/accounts.service.test.ts` | le fixture di `recordTopUp` usano `effectiveDate: '2026-03-01'` (`:518`, `:528`) — **passato** oggi, ma il file va riletto: se il dev lavora con un orologio reale, ogni fixture di data va o nel passato o sotto `vi.setSystemTime` |
| `src/server/services/cash.service.test.ts` | idem per `recordCashMovement` |
| `src/server/services/instructor-compensation.service.test.ts` | il `count` nuovo va mockato o `getOwnCompensationOverview` restituisce `undefined` in `payoutsTotal` |
| `src/lib/schemas/registry.test.ts` | se asserisce sulle description, va riallineato |

### 3.3 Censimento completo: chi scrive una `effectiveDate` (11 `create`, misurato)

| Writer | Sorgente della data | Input utente? |
|---|---|---|
| `accounts.service.ts:240` `recordTopUp` → `AccountMovement` | `:229` `new Date(input.effectiveDate)` | **SÌ** → guardia |
| `accounts.service.ts:253` gemello `CashMovement` della ricarica | la stessa variabile | **SÌ** (coperto dalla stessa guardia) |
| `cash.service.ts:336` `recordCashMovement` | `:342` `new Date(input.effectiveDate)` | **SÌ** → guardia |
| `accounts.service.ts:648` `recordAdjustment` | `todayDateOnlyUtcInZone(APP_TIMEZONE)` | no |
| `membership.service.ts:129` `chargeMembershipFee` | `:92` `today` | no |
| `cash.service.ts:411` `reverseCashMovement` | `todayDateOnlyUtcInZone` | no |
| `instructor-compensation.service.ts:497` `recordPayout` | `:482` `todayDateOnlyUtcInZone` | no (`periodStart`/`periodEnd` sono input, ma **non** sono la data valuta — v. §6) |
| `ppr.service.ts:682` chiusura PPR | `:655` `closedAt` in Roma | no |
| `flights.service.ts:1024` `FLIGHT_CHARGE` | `params.flightDate` | già delimitato da `FLIGHT_DATE_IN_FUTURE` |
| `flights.service.ts:1331`, `:1470` storni del volo | `todayDateOnlyUtcInZone` | no |

⇒ **la guardia ha esattamente due call-site.** Nessun altro percorso di dominio accetta una data valuta dall'esterno.

### 3.4 UI: cosa fanno oggi le tre superfici (misurato)

| Superficie | Oggi |
|---|---|
| Striscia KPI del registro voli | `logbook/page.tsx:233-237`, 4 `<KPI>` con `t('kpi.*')`; **condivisa** desktop/mobile |
| Riga «Totali» del registro | `logbook-console.tsx:823-843`, label da `labels.table.totals` (passata a `page.tsx:278`); **solo desktop** |
| Carte «Per categoria» / «Risultato» | `dashboard/billing/page.tsx`, `.billing-split`; etichette da `BillingPage.byCategory.*` e `BillingPage.panels.result.*` |
| Card «Pagamenti ricevuti» | `my-compensation/page.tsx:124-190`: `card-head` con solo `card-title` (**nessun** `card-sub` oggi), poi **due** facce (`:134` desktop, `:171` mobile) sullo stesso `overview.payouts` |
| I tre form con campo data | `DateInput` + `register('effectiveDate')`, prefill `todayDateOnly()` client (**16.9**, non toccare) |

### 3.5 I 7 call-site e2e che prenderebbero il 422 (censimento completo)

| `e2e/billing.spec.ts` | Test | Asserisce aggregati di tesoreria? |
|---|---|---|
| `:178` | ordinamento `effectiveDate desc` + dedup del gemello (AC 1) | no — **⚠️ dipende da `day1 < day2`** |
| `:196` | filtro `bookType` DEPOSIT/REVENUE | no |
| `:214` | filtro per categoria | no |
| `:231` | filtro Pilota free-text | no |
| `:247` | la cella pilota non mostra l'id | no |
| `:415` | «Rettifica» su un `TOP_UP` + 409 sulla seconda | no |
| `:441` | «Storna» su un movimento di cassa manuale | no |

Non toccati nello stesso file: `:261` (usa già `uniquePastDateOnly()`), `:303` (usa `todayDateOnly()`, asserisce i tre riquadri del mese corrente).
**Nessun'altra spec** scrive date future: censimento su tutte le 35 occorrenze di `effectiveDate` in `e2e/` — le altre usano `'2026-07-01'`, `'2026-01-15'`, `todayDateOnly()` o `dateAt(0)` con base **2021** (`pdf-exports.spec.ts:29`), tutte **passate**.

### 3.6 Misure sul DB di carico (`airmanager_load`, oggi, read-only)

```
Flight REGISTERED : 59 287 voli · 1 546 872 786 cent · 5 341 379 min
Flight CANCELLED  :  1 200 voli ·    32 017 066 cent ·   110 806 min
CashMovement con effectiveDate > oggi : 1 riga (2026-09-11, +2 500, «Diritti di atterraggio PPR-2026-0030»)
AccountMovement con effectiveDate > oggi : 0
InstructorPayout, massimo per profilo : 10  (profili con > 50 : 0)
```
⇒ (a) la divergenza PDF/schermo è del **2 %** in numero di voli ma **320 170,66 €** in importo su questo insieme; (b) l'unica riga futura del DB di carico **non passa dall'API** (`seed-load.ts:1351`, `createMany`), quindi la guardia non la riguarda; (c) MINOR-5 è **irraggiungibile** su questi dati (max 10 payout): è una guardia in avanti, e va **dichiarato** nel Dev Agent Record.

---

## §4 — Piano di test

### 4.1 Unit

| File | Test |
|---|---|
`src/lib/effective-date.test.ts` (**nuovo**) | oggi Roma → **accettato**; oggi+1 → `ValidationError` con `code === 'EFFECTIVE_DATE_IN_FUTURE'` e `details.effectiveDate`; **alle 00:30 di Roma il 15 gennaio** (`vi.setSystemTime('2026-01-14T23:30:00Z')`, CET): `2026-01-15` **accettato** — la stessa asserzione di `zoned-time.test.ts:217-253`, dal lato della data valuta; data remota nel passato → accettata
`accounts.service.test.ts` | `recordTopUp` con data futura → 422 col codice, e `transactionMock` **non** chiamato
`cash.service.test.ts` | `recordCashMovement` con data futura → 422, e `cashMovement.create` **non** chiamato
`transactions.service.test.ts` | i due branch di `recordTransaction` (`TOP_UP`, `CASH`) propagano il 422 del delegato; il branch `ADJUSTMENT` (che **non ha** `effectiveDate`) **non** è toccato
`exports.service.test.ts` | fixture con **3** righe (2 `REGISTERED` + 1 `CANCELLED`): i `totals` passati a `renderReportPdf` sono quelli del mock di `getFlightTotals`, **non** la somma delle righe; la **tabella** contiene ancora 3 righe e la cella Stato dell'annullato dice «Annullato»; `getFlightTotals` chiamato con **`(actor, query)`**, senza `page`/`pageSize` forzati; `EXPORT_TOO_LARGE` ancora prima di tutto
`instructor-compensation.service.test.ts` | `payoutsTotal` = il `count`, indipendente dal `take`; `totalOwedCents` invariato

### 4.2 e2e

| Spec | Blocco |
|---|---|
`e2e/accounts-topups.spec.ts` | una ricarica con `effectiveDate` = domani → **422** con `error.code === 'EFFECTIVE_DATE_IN_FUTURE'`; la stessa con **oggi** → 200 (il bordo inclusivo, dal lato API) |
`e2e/cash-register.spec.ts` | idem per `POST /api/v1/cash-movements` |
`e2e/pdf-exports.spec.ts` | un velivolo fresco, **2 voli registrati + 1 annullato** nello stesso giorno; l'export PDF risponde 200 e il **`GET /api/v1/flights/totals`** (o la striscia KPI a schermo) dà gli stessi minuti/importo che il PDF stampa. Se il testo del PDF non è ispezionabile nella suite, la parità si asserisce **fra le due API** (schermo e export condividono `query`) e il PDF si verifica **una volta** a mano con Playwright MCP, con la misura nel Dev Agent Record |
`e2e/logbook.spec.ts` (o la spec del registro) | `?status=CANCELLED` → i 4 KPI e la riga Totali mostrano le etichette «registrati»; **senza** il filtro mostrano quelle di prima |
`e2e/my-compensation.spec.ts` | ≤ 50 payout → **nessun** `my-compensation-payouts-cap`. Il caso > 50 **non** si crea in e2e (51 POST idempotenti: costo assurdo per una nota) → coperto **unit** e dichiarato |
`e2e/billing.spec.ts` | le 7 fixture spostate (AD-8) — **modifica**, non aggiunta |

⚠️ **Nessuno** di questi blocchi scrive `AppSettings` globali ⇒ **niente** project serializzato nuovo in `playwright.config.ts`. Verificare prima di scegliere un testid: `grep -rn 'data-testid\^=' e2e/`.

### 4.3 Tabella guardia → discriminanza (ognuna provata ROSSA sul pre-fix simulato, con ripristino `sha256`)

| Guardia | Discriminanza | Esito sul pre-fix, **misurato oggi** |
|---|---|---|
| Data valuta futura rifiutata (P1) | `future-value-date.probe.test.ts` → `recordTopUp` e `recordCashMovement` con data +1 anno | **2 failed**: *«promise resolved "{ account: { id: 'account_1' }, …(2) }" instead of rejecting»* e *«promise resolved "{ id: 'cash_1', …(10) }" instead of rejecting»*. Misura di baseline: la riga scritta porta `effectiveDate` **2027-09-10** verbatim |
| Parità PDF/schermo (P3) | `pdf-totals.probe.test.ts` → 2 `REGISTERED` (60'+30', 100+50 €) + 1 `CANCELLED` (90', 200 €) | **1 failed**: atteso `1:30` / `150,00 €`, ottenuto **`3:00` / `350,00 €`** |
| Etichette DQ-4 (P4) | e2e con `?status=CANCELLED` che asserisce l'etichetta «registrati» | rosso per assenza della chiave i18n (da provare dopo aver scritto il test, prima del fix) |

**Metodo del pre-fix simulato** (prassi di progetto): `sha256sum` dei file **prima**, si annulla il fix con un `git stash`/patch inversa, si esegue la discriminanza, si ripristina, si **riverifica il `sha256`** e si cita l'esito **verbatim** nel Dev Agent Record.

### 4.4 Le discriminanze di partenza sono già scritte ed ESEGUITE (pre-fix, oggi)

`/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/story-16-6/`:
- `future-value-date.probe.test.ts` — R-16-h, 2 discriminanti + 1 misura di baseline
- `pdf-totals.probe.test.ts` — MAJOR-5, 1 discriminante
- `vitest.probe.config.mjs` — config usa-e-getta (`root` = repo, `include` = lo scratchpad) che **non** entra nel glob di `vitest.config.ts` (`src/**/*.test.ts`) ⇒ **non** influenza `npm run gates`

Esecuzione di oggi, verbatim:
```
Test Files  3 failed (3)
     Tests  4 failed | 2 passed (6)
```
```
PDF totals actually rendered: [{"label":"Durata totale","value":"3:00"},{"label":"Totale addebiti","value":"350,00 €"}]
BASELINE top-up effectiveDate written: 2027-09-10T00:00:00.000Z (requested 2027-09-10 )
```
⇒ **da promuovere** a test veri nei file di §4.1 (i probe sono già discriminanti; il dev li porta dentro `src/`, adattandone lo scaffolding di mock a quello del file di destinazione).

### 4.5 Gate

`npm run gates` (lint + typecheck + vitest + build, **mai** i 4 comandi separati) → verde. Suite e2e: **solo** via `scripts/e2e.sh start` + `scripts/e2e.sh status`, **mai** `playwright test` in foreground. Per una serie di run: build una volta, poi `E2E_REUSE_SERVER=1`. `export JOBS_SECRET=<non-placeholder>` prima di ogni suite `CI=1` (memoria di sessione). **Parità i18n**: `python3 -c` che confronta gli insiemi di chiavi di `messages/it.json` e `messages/en.json` → **0/0** differenze, citato nel Dev Agent Record.

---

## §5 — Trappole note

1. **`day1` deve restare anteriore a `day2`** dopo l'inversione del verso di `dateAt` (AD-8). Il test di `:174` lo assume nel commento e nell'asserzione di ordinamento.
2. **Il mock di `./flights.service` in `exports.service.test.ts:19`** non espone `getFlightTotals`: senza toccarlo, **tutto il file** diventa rosso e il dev può credere di aver rotto l'export. È la prima modifica da fare, non l'ultima.
3. **`getFlightTotals` prende `query`, non `{...query, page:1, pageSize: PDF_EXPORT_MAX_ROWS}`.** Passargli la paginazione non cambia il risultato (la ignora) ma nasconde l'intenzione e rende il test dell'argomento inutile.
4. **Non delimitare gli aggregati di tesoreria** (AD-3): DQ-2 offriva due opzioni **alternative**, il piano ha scelto una. Farle entrambe nasconde le 6 righe già in DB senza dirlo.
5. **Non toccare `todayDateOnly()` client** nei tre form: è 16.9 (`sprint-status.yaml`). E **non** aggiungere `max=` costruito su quell'helper (AD-11).
6. **`zoned-time.ts` si dichiara SERVER-SIDE only** nel proprio doc-comment: non importarlo in un modulo che finisce nel bundle client (motivo tecnico di AD-2).
7. **`CashReportPage` serve due superfici** (PDF + `/dashboard/reports`): cambiando le sue 4 chiavi si cambiano entrambe. Verificarle **entrambe** con uno screenshot.
8. **La nota «Ultimi 50 di N» va scritta UNA volta** nella `card-head`, non una per faccia: `my-compensation/page.tsx` ha **due** liste sullo stesso array.
9. **Il DB e2e è condiviso**: dopo ~10 login lo stesso spec fallisce sempre alla riga di login (TD-6, cap anti-brute-force per identifier). Prima di attribuirlo a una flake: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1`.
10. **Mai `Escape` per chiudere un popover** in un test (CLAUDE.md): `SlideOver` chiude l'intero pannello.
11. **Un reviewer sta usando la porta 3000 e il DB e2e adesso**: coordinarsi con la sessione principale prima del primo reset.

---

## §6 — Fuori scope DICHIARATO

| Cosa | Perché | Dove finisce |
|---|---|---|
| **Delimitare `computeTreasuryTotals`/`computeDeposits` a oggi** | DQ-2 offre due opzioni **alternative**; R-16-h ha scelto il rifiuto al bordo. Cumularle nasconderebbe le righe già in DB | dichiarato (AD-3) |
| **Ripulire le 6 righe con data 2035-2055 già in DB** | ledger **append-only** [L-1]: una guardia vale sulle scritture nuove. Se il PO vuole ripulire, è un reset del DB o una serie di **storni** | dichiarato; TD se il PO lo chiede |
| **Bordo superiore su `from`/`to`** delle query (`listCashMovementsQuerySchema`, `cashReportQuerySchema`, `listTransactionsQuerySchema`) | sono **filtri di lettura**, non date valuta: un intervallo che si estende nel futuro è legittimo (e `billing-global.spec.ts:71` lo usa deliberatamente per costruire un giorno vuoto) | dichiarato |
| **`periodStart`/`periodEnd` del payout istruttore** nel futuro | **non** sono la data valuta (che è `todayDateOnlyUtcInZone`, `:482`): sono i bordi del periodo liquidato. R-16-h nomina «ricariche e movimenti di cassa». Un periodo futuro è discutibile ma **non ratificato** | domanda PO (§7) |
| **`seed-load.ts:1351`** che scrive 1 riga di cassa datata domani | usa `createMany`, **bypassa** il service: nessun percorso di dominio ci passa. Il DB di carico è lo strumento di misura dell'epic 17 | dichiarato; TD se l'epic 17 lo richiede |
| **`max=` client-side sui tre campi data** | dipende dall'helper client UTC che la **16.9** deve correggere: costruirlo ora renderebbe il client più restrittivo del server per 2 ore al giorno (AD-11) | **TD-16.6a-b**, chiudibile dalla 16.9 in una riga |
| **Paginare «Pagamenti ricevuti»** | MINOR-5 chiede «paginare **oppure** dichiarare»; dichiarare è il diff minimo e allinea la pagina alle altre liste tagliate dell'app | dichiarato |
| **L'ordine `createdAt desc` vs accumulo per `periodEnd`** (difetto adiacente di MINOR-5) | preesistente, non riconducibile a questa richiesta | segnalato nel Dev Agent Record |
| **Riconciliare «Per categoria» con «Risultato»** | DQ-3 deciso: sono due libri, si etichettano. Escludere i gemelli da `getCashReport` lo farebbe smettere di essere un report di **cassa** | dichiarato |
| **`getCashReport` senza dedup e senza regola di verso dello storno** (MINOR-4, parte tecnica) | è **corretto** per un report di cassa (l'audit lo dice: *«Il registro di cassa ha ragione a includerle»*) | dichiarato |
| **La riga «di cui acconti» in «Per categoria»** | seconda opzione dell'audit; il piano ha scelto la prima. Farne due è speculativo | dichiarato |
| **`MEMBERSHIP_FEE_*`, `recordAdjustment`, catene di storno, `handler.ts`** | sono la **16.6b** | story **16.6b** |
| **Il testo morto in `registry.ts:961`** (*«Totals line: … computed here, never in `flights.service.ts`»*) | diventa **falso** con questa story ⇒ **va corretto**, non è fuori scope: è la description della rotta che la story cambia | AC 7 / §3.1 |

---

## §7 — Domande aperte per il PO (nessuna blocca la story)

1. **La deviazione di AD-2** — guardia nel service con codice `EFFECTIVE_DATE_IN_FUTURE` invece di un `.refine` Zod. Comportamento osservabile identico (422, stessa regola del volo); il guadagno è un codice su cui i client si ramificano e schemi che restano puri. Se il PO preferisce la lettera di R-16-h, il fallback è un `.refine` in **4** punti e i tre form perdono il messaggio dedicato.
2. **`periodStart`/`periodEnd` di un payout nel futuro**: liquidare in anticipo un periodo non ancora concluso è lecito? Oggi sì, e la data valuta del movimento resta **oggi** (quindi la liquidità non mente). Non ratificato ⇒ lasciato com'è.
3. **Testi delle etichette MINOR-4**: «Ricavi di competenza» / «Entrate di cassa» sono la mia proposta. Se il PO ha il lessico di casa (il tesoriere è un utente reale), vince il suo.

---

## §8 — Riferimenti

- `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md` — §MAJOR-4 (`:172-200`), §MAJOR-5 (`:200-239`), §MINOR-4 (`:398-433`), §MINOR-5 (`:433-455`), §5 DQ-2/DQ-3/DQ-4
- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` — §«Story 16.6», §«Architettura e vincoli», **R-16-h**
- `_bmad-output/implementation-artifacts/16-1-un-solo-calendario.md` — l'idioma «un solo calendario» (`todayDateOnlyUtcInZone`), che questa story riusa
- `_bmad-output/implementation-artifacts/16-6b-quota-rettifiche-catene.md` — l'altra metà della 16.6
- `CLAUDE.md` — regole e2e (`scripts/e2e.sh`, project serializzati, testid), trappola env eager negli unit, gates

---

## Dev Agent Record (2026-11-04, dev Opus 5 xhigh — un solo subagent)

**Commit**: `a6be2da` `feat(16.6a): …` (implementazione + test, pathspec). Questo record: commit `docs(16.6a): …` (solo questo file). `sprint-status.yaml` e `HANDOFF.md` NON toccati (li aggiorna la sessione principale). Partito da `dev@f1234e9` (16.5 chiusa): ogni `file:riga` di §R riletto su quell'HEAD, nessuno slittato oltre quanto §R dichiara. Skill applicate: `bmad-dev-story`, `karpathy-guidelines`, `design-taste-frontend` (design read: «testo dentro un gestionale AirOps già stabilito — fuori dallo scope landing della skill, §13; valgono solo il self-audit della copy, gli stati d'errore inline e zero linguaggio visivo nuovo»), `ui-ux-pro-max` (`error-clarity`: la frase nomina il campo e la regola; `aria-live-errors`: i tre messaggi stanno nei `role="alert"` già esistenti; `horizontal-scroll`/`truncation-strategy` misurati a 375 e 320 px).

### File toccati

| File | Cosa |
|---|---|
| `src/server/services/cash.service.ts` | `assertEffectiveDateNotInFuture(effectiveDate: string)` esportata (422 `EFFECTIVE_DATE_IN_FUTURE`, `details: { effectiveDate }`, bordo inclusivo, calendario Roma); chiamata in `recordCashMovement` dopo la guardia della categoria di sistema, prima della `create` |
| `src/server/services/accounts.service.ts` | import della guardia; chiamata in `recordTopUp` dopo persona e categoria «Ricariche», prima della `$transaction` |
| `src/server/services/instructor-compensation.service.ts` | `OwnCompensationOverview.payoutsTotal` + `count` nella `Promise.all` di `getOwnCompensationOverview` (il `take: 50` resta) |
| `src/lib/schemas/registry.ts` | description di `POST /people/{id}/account/top-ups`, `POST /cash-movements`, `POST /transactions` |
| `src/app/[locale]/dashboard/people/[id]/account-section.tsx` + `people/[id]/page.tsx` | ramo `EFFECTIVE_DATE_IN_FUTURE` nel form ricarica (via `parseApiError`), etichetta `futureDateError` |
| `src/app/[locale]/dashboard/pilots/pilots-console.tsx` + `pilots/page.tsx` | idem nello slide-over «Registra ricarica» |
| `src/app/[locale]/dashboard/billing/transaction-editor.tsx` + `billing/page.tsx` | idem in «Nuova transazione» (il ramo 409 resta com'era) |
| `src/app/[locale]/dashboard/my-compensation/page.tsx` | `card-sub` «Ultimi {shown} di {total}» nella `card-head` di «Pagamenti ricevuti», una sola volta, solo se il totale supera la lista |
| `messages/it.json`, `messages/en.json` | +4 chiavi per locale (`PilotsPage.topUp.futureDateError`, `PersonDetailPage.accountPanel.topUp.futureDateError`, `BillingPage.newTransactionForm.futureDateError`, `MyCompensationPage.table.cap`), 2 valori cambiati (`BillingPage.byCategory.title`, `BillingPage.panels.result.revenue`) |
| Test unit | `cash.service.test.ts` (+3), `accounts.service.test.ts` (+1), `transactions.service.test.ts` (+2), `instructor-compensation.service.test.ts` (+1, e `count` nel mock / `payoutsTotal` nel `toEqual` esistente), `registry.test.ts` (+1) |
| Test e2e | `accounts-topups.spec.ts` (+1), `cash-register.spec.ts` (+1), `my-compensation.spec.ts` (+1), `db-fixtures.ts` (`seedInstructorPayouts`), `billing.spec.ts` (banda 2004-2009, AD-8 §R), `billing-global.spec.ts` (solo il commento `:40`, diventato falso) |

Non toccati, verificato: `billing-summary.service.ts` sha256 `d36789d3…dfa4eedf5` identico a HEAD (AD-3); `prisma/schema.prisma` `db18706e…eedf5` identico (AD-9); `transactions.service.ts` (dunque `computeRevenueCents`) senza diff; in `cash.service.ts` i soli hunk sono import, guardia e chiamata (`getCashReport`, `reverseCashMovement` invariati); `membership.service.ts`, `flights.service.ts`, `exports.service.ts` senza diff.

### AC per AC (con la lettura di §R/§R-PO)

| AC | Esito | Evidenza |
|---|---|---|
| 1 | ✅ | U `accounts.service.test.ts` «rejects a value date after today (Roma) …»: `ValidationError`, `code`/`details.effectiveDate`, `$transaction`, `accountMovement.create` e `cashMovement.create` mai chiamati. e2e `accounts-topups.spec.ts:150`: 422 + `details.effectiveDate` = domani Roma, saldo `^0,00 €$` dopo tre tentativi |
| 2 | ✅ | U `cash.service.test.ts` «recordCashMovement rejects tomorrow …» (create mai chiamata); e2e `cash-register.spec.ts:146`: 422 + `details`, la lista della categoria run-unique contiene solo la riga di oggi |
| 3 | ✅ | nessuna guardia nel dispatcher (`transactions.service.ts` senza diff). U `transactions.service.test.ts` (2, `TOP_UP`/`CASH`): il 422 del delegato passa, la data arriva invariata. Prova della catena vera: i due e2e chiamano `POST /api/v1/transactions` con domani → 422 `EFFECTIVE_DATE_IN_FUTURE`, e non resta nessuna riga |
| 4 | ✅ | U con orologio alle **00:30 di Roma del 15 gennaio** (`2026-01-14T23:30Z`, CET): `2026-01-15` accettata, `2026-01-16` rifiutata. e2e: oggi Roma accettata da form (ricarica) e da «Nuova transazione» (cassa) |
| 5 | ✅ | U `2004-02-29` accettata; le 7 fixture di `billing.spec.ts` scrivono nel 2004-2009 |
| 6 | ✅ | censimento §R: 3 scritture con data utente (`recordTopUp` ×2, `recordCashMovement`), 6 derivate dal server non toccate (v. «Non toccati») |
| 7-12 | OBSOLETE (§R) | — |
| 13 | ✅ (§R-PO) | «Per categoria» → **«Cassa per categoria»** / «Cash by category»; «Ricavi» → **«Ricavi maturati»** / «Earned revenue» (desktop `billing-panels.tsx` e foglio mobile `billing-panels-mobile.tsx` leggono la stessa chiave); «Costi», tooltip `byCategory.in/out/net` e PDF invariati; cifre invariate (nessun service toccato). Misura nel foglio mobile: «Ricavi maturati» **99 px** su una riga di **341 px a 375** e **286 px a 320**, una sola riga, nessun overflow del documento |
| 14 | ✅ (§R) | nulla da fare: `CashReportPage` è letto solo dal PDF, già «Report di cassa» |
| 15 | ✅ | U «reports payoutsTotal from a count …» (lista 50, `count` 73, `take` 50, residuo −7 300 c). e2e `my-compensation.spec.ts:326` «History cap»: 1 payout → nessuna nota; +72 da fixture SQL → 50 righe, **«Ultimi 50 di 73»**, «Residuo dovuto» −73,00 €, a 375 px 50 card mobile e **una** nota visibile. Misura a mano: nota sulla riga del titolo a 1280 e 375, va a capo sotto il titolo a 320 (la `card-head` è `flex-wrap`), nessun overflow |
| 16 | ✅ | `dateAt` conta indietro da `2009-12-31` su 2 000 giorni; `day1 = dateAt(offset + 1)` < `day2 = dateAt(offset)` (commento nel codice); `uniquePastDateOnly` e `todayDateOnly()` invariati (solo la prima riga del commento di `uniquePastDateOnly`, che citava lo «schema far-future», e il commento dello storno `:453`) |
| 17 | ✅ (DB non fresco, v. «e2e») | completo `CI=1`: **0 failed**, 610 passed + 1 flaky + 2 skipped = **613** = baseline 610 + 3 test nuovi | |
| 18 | ✅ | v. «Discriminanze» |

### Discriminanze (copia isolata `scratchpad/iso`: `cp -r src messages` + config, `node_modules` in symlink; sha256 dei file ripristinati verificato = repo)

| # | Mutante | Esito |
|---|---|---|
| M0 | **pre-fix**: `cash.service.ts` e `accounts.service.ts` di HEAD | **4 failed** / 158: i 3 test di cash (`assertEffectiveDateNotInFuture is not a function`; `recordCashMovement` → «expected TypeError … to match object { code: 'EFFECTIVE_DATE_IN_FUTURE' }») e quello di accounts («expected error to be instance of ValidationError» — la ricarica a un anno viene scritta) |
| M1 | senza la chiamata in `recordTopUp` | 1 failed (il test di accounts) |
| M2 | senza la chiamata in `recordCashMovement` | 1 failed |
| M3 | «oggi» UTC invece di Roma | 1 failed (il test delle 00:30 di Roma) |
| M4 | bordo esclusivo (`>=`) | 2 failed (00:30 e «records today») |
| M5 | `payoutsTotal: payouts.length` | 1 failed: «expected 50 to be 73» |
| M6 | description di `POST /cash-movements` senza il codice | 1 failed: «post /api/v1/cash-movements: expected 'Append-only …' to contain 'EFFECTIVE_DATE_IN_FUTURE'» |

Ripristino: sha256 di `cash.service.ts` `8886e0f6…`, `accounts.service.ts` `7e6034bc…`, `instructor-compensation.service.ts` `2d80b618…`, `registry.ts` `8e9f3279…` identici fra copia e repo dopo ogni mutante. Nessun mutante è mai stato applicato al repo. I due test di `transactions.service.test.ts` NON sono discriminanti per costruzione (delegati mockati: provano la propagazione, verdi anche sul pre-fix — dichiarato); la catena vera è discriminata dagli e2e.

### Gate

`npm run gates`: lint, typecheck, test, build **PASS** (due volte: prima dei mutanti e, dopo l'ultimo ritocco a un commento di test, prima del commit). Unit **2242 → 2250** (+8). Verifica env: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run` sui 5 file unit toccati → verde (`cash.service.ts` non importa `mail`: la nuova dipendenza `accounts → cash` non trascina `@/lib/env`). Parità i18n: `src/i18n/messages.test.ts` verde (chiavi, argomenti `{shown}`/`{total}`, `BANNED`).

### e2e

Server di produzione costruito una volta dai gate e avviato una volta (`JOBS_SECRET` non segnaposto), poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …`; il DB `airmanager` era stato appena resettato dalla sessione principale (io non ho resettato nulla). Server spento a fine lavoro, porte 3000/3100 libere.

1. **Mirato** (6 spec: `accounts-topups`, `cash-register`, `billing`, `my-compensation`, `cash-report`, `mobile-billing`): 63 passed, **1 failed** = `mobile-billing.spec.ts:1096` (v. «Note per il reviewer»: dato, non codice). I 3 test nuovi e le 7 fixture spostate di `billing.spec.ts` verdi.
2. **Completo** `CI=1` (tutti i project, catena serializzata compresa), verbatim di `scripts/e2e.sh status`:
```
  1 flaky
  2 skipped
  610 passed (22.6m)
E2E_EXIT=0
```
Flaky: `bookings.spec.ts:1158` (pilota sposta e annulla la propria prenotazione; verde al retry #1, nessun file della story coinvolto). Skipped: `mobile-billing.spec.ts:352` e `:526`, che si saltano da sé quando il movimento «non attribuito» del seed è già stato consumato — lo aveva consumato il run mirato del punto 1 sullo stesso DB; su DB fresco girano. Conteggio: 610 + 1 + 2 = **613** = 610 di baseline + 3 nuovi. `mobile-billing.spec.ts:1096` verde nel completo.

### Verifica UI interattiva (script `playwright-core` usa-e-getta nello scratchpad, server di produzione su :3000)

- Scheda persona, ricarica con domani: «La data valuta non può essere nel futuro.» (IT) / «The value date cannot be in the future.» (EN), in `.fld-error` sotto i campi.
- Piloti, «Registra ricarica»: il messaggio esce **in maiuscolo** («LA DATA VALUTA NON PUÒ ESSERE NEL FUTURO.»): quel form rende OGNI suo errore con `fld-label` + `var(--bad)` (idioma condiviso con `instructors-console.tsx:687`, `pilot-editor.tsx:1168`, `aircraft-editor.tsx:627`), già così per «Impossibile registrare la ricarica». Non toccato (fuori perimetro) — v. domande.
- «Nuova transazione», cassa con domani: «La data non può essere nel futuro.» sotto i campi, slide-over resta aperto; con oggi → pannello «Transazione registrata».
- Contabilità desktop IT/EN: «Ricavi maturati»/«Earned revenue», «Cassa per categoria»/«Cash by category»; foglio «Risultato» a 375/320 come in AC 13.
- «I miei compensi»: «Ultimi 50 di 73» / «Latest 50 of 73» come `card-sub` mono accanto al titolo.

### Deviazioni dichiarate

- **D-a — posto della guardia**: esportata da `cash.service.ts` e importata in `accounts.service.ts` (prima opzione di AD-1 §R), non un file nuovo. Motivo: precedente `rates.service.ts#assertRateValidFromNotPast` (la regola vive nel service che possiede il libro, gli altri la importano); entrambi i writer finiscono nel libro di cassa (la ricarica scrive il gemello «Ricariche»); `cash.service.ts` non importa `accounts.service.ts` (nessun ciclo) né `mail` (nessuna catena env). Guardia nel service e non nello Zod: precedente 19.3/R-19-f, chiude §7 Q1 (AD-2 §R).
- **D-b — testo del messaggio in «Nuova transazione»**: «La data non può essere nel futuro.» / «The date cannot be in the future.» invece di «La data valuta …», perché in quel form il campo si chiama «Data»/«Date»; i due form di ricarica, dove il campo è «Data valuta»/«Value date», usano «La data valuta non può essere nel futuro.» / «The value date cannot be in the future.». Un messaggio che nomina il campo che l'utente vede.
- **D-c — e2e del caso «> 50 compensi»** (§R «Fatti nuovi», al posto di §4.2 «coperto unit»): `seedInstructorPayouts` in `e2e/db-fixtures.ts` scrive 72 `InstructorPayout` SENZA il gemello di cassa — 72 gemelli datati oggi entrerebbero nel libro di cassa globale che altre spec aggregano; la pagina sotto test legge solo quella tabella (dichiarato nel doc-comment della fixture).
- **D-d — glossario non toccato**: §R-PO chiede di aggiungere i due termini «se la tabella dei termini contabili li prevede»; `docs/i18n/glossario-it.md` non ha righe di termini contabili (c'è solo «Contabilità»), quindi niente riga nuova.
- **D-e — nessun messaggio 404/409 nuovo nei form**: il ramo nuovo è solo `EFFECTIVE_DATE_IN_FUTURE`; tutto il resto resta su `genericError`/`conflictError` come prima (karpathy §3).

### Note per il reviewer

- Ordine delle risposte: `recordTopUp` = 403 → 404 persona → 500 «Ricariche» mancante → **422**; `recordCashMovement` = 403 → 404 → 409 categoria inattiva/di sistema → **422**. Lo «stato prima dell'input» di AD-1.
- `count` e `findMany` di «Pagamenti ricevuti» sono due query nella stessa `Promise.all`, non una transazione: un payout registrato in mezzo può dare per un caricamento «Ultimi 50 di 51» con la riga nuova non in lista (o, al contrario, nessuna nota con 51). Il ricaricamento successivo è esatto; nessuna scrittura dipende da quel numero.
- Rischio noto, non nuovo: i due e2e nuovi scrivono movimenti datati oggi (una ricarica CASH da 100 €, un'entrata di cassa da 50 €) nel libro globale, come già fanno `cash-report.spec.ts:59` e `mobile-billing.spec.ts:92/100`; il test dei tre riquadri (`billing.spec.ts:302`) misura delta prima/dopo nello stesso mese ed è esposto a questa classe come prima.
- Run mirato (6 spec, DB appena resettato): `mobile-billing.spec.ts:1096` rosso 3/3 su `/it/dashboard/reports` — `utilBarWidths` atteso `[281, 0]`, ottenuto `[281]`: lo `0` sono le righe classificate oltre il tetto, che esistono solo quando altre spec hanno fatto volare abbastanza velivoli nell'anno. Dipende dai dati, non da questa story (nessun file della pagina Statistiche toccato); nel run completo è verde.
- `billing-global.spec.ts`: solo il commento di `dateAt` (`:40`), che diceva «stesso schema far-future di `billing.spec.ts#dateAt`»; la funzione resta (parametro di query, `:71`). Non eseguito da solo (catena serializzata: mai `--no-deps`).

### Domande per il PO (in italiano semplice)

1. **Errori in maiuscolo nel form ricarica di Piloti.** Nella pagina Piloti, il messaggio «La data valuta non può essere nel futuro.» compare tutto in maiuscolo, perché quel form (come quelli di Istruttori e Velivoli) scrive tutti i suoi errori con lo stile delle etichette. Nella scheda persona lo stesso messaggio è in minuscolo normale. Vuoi una story piccola che uniformi gli errori dei pannelli laterali allo stile della scheda persona?
2. **«Ricavi» altrove.** In Panoramica («Ricavi del mese») e in Statistiche («Ricavi») la parola indica lo stesso numero che in Contabilità ora si chiama «Ricavi maturati». Le lasciamo così (sono pagine diverse, senza un «libro di cassa» accanto) o le allineiamo?
3. **Periodo di un compenso nel futuro** (§7 Q2, ancora aperta): liquidare un istruttore per un periodo non ancora concluso oggi è permesso; la data del movimento resta comunque oggi, quindi la liquidità non mente. Va bene così?

### Change Log

- 2026-11-04 — dev (Opus 5 xhigh): guardia `EFFECTIVE_DATE_IN_FUTURE` su ricariche e cassa, rami d'errore nei tre form, `payoutsTotal` + nota «Ultimi 50 di N», etichette «Cassa per categoria» / «Ricavi maturati», banda e2e 2004-2009 (`a6be2da`); Status → review.

## Decisioni PO sulla review (2026-11-04, AskUserQuestion, prima del fix)

Report: `16-6a-review-report.md` (SHIPPABLE-WITH-FIXES, nessun difetto nel codice di produzione; arbitro del reviewer su DB fresco 605 + 8 flaky = 613, `E2E_EXIT=0`).

- **Domanda 1 — messaggi d'errore dei pannelli laterali** (Piloti «Registra ricarica», «Nuova transazione»: `--bad` 3,96:1 sotto AA, in Piloti anche maiuscolo mono) = **sì, subito in questa story**: portarli allo stile leggibile della scheda persona (`.fld-error`: rosso scuro, Inter Tight, nessun maiuscolo), ≥ 4,5:1 nei due temi, desktop e mobile; guardia di contrasto.
- **Domanda 2 — «Ricavi maturati» dappertutto** = **sì**: anche Panoramica («Ricavi del mese») e Statistiche («Ricavi") prendono l'etichetta «Ricavi maturati» / EN «Earned revenue» per lo stesso numero (`getLedgerRevenueCents`), con l'eventuale indicazione del periodo già presente sulla card.
- **Domanda 3 — liquidare un istruttore per un periodo non ancora finito** = **sì, resta possibile** (comportamento attuale, dichiarato).
- **Domanda 2-bis (dal fix, 2026-11-04)** — il KPI della Panoramica con «Ricavi maturati del mese» va su due righe a 1280 px (card 94 px contro 79): il PO sceglie **«Ricavi maturati» / EN «Earned revenue»** senza periodo (come in Statistiche), sempre su una riga.

## Fix Record della review (2026-11-04, fix Opus 5.5 — un solo subagent)

**Commit**: `dea21d5` `fix(16.6a): …` (codice, test, glossario), `7a9ec4e` `chore(e2e): …` (solo `playwright.config.ts`) e `dcad37e` `fix(16.6a): …` (solo il test dell'ordine degli errori), tutti con pathspec; questo record: `docs(16.6a): …` (solo questo file). Partito da `dev@d543c1a`. La riga «Domanda 2-bis» qui sopra l'ha scritta la sessione principale, non committata, mentre il fix girava: entra in questo commit. `sprint-status.yaml` e `HANDOFF.md` NON toccati. Skill: `karpathy-guidelines`; `design-taste-frontend` (design read: «restyle dei messaggi d'errore dentro un gestionale AirOps già stabilito, fuori dallo scope landing della skill (§13): valgono solo form contrast check, stati d'errore inline e copy self-audit, nessun linguaggio visivo nuovo»); `ui-ux-pro-max` (`color-contrast`/`contrast-feedback` ≥ 4,5:1 nei due temi, `error-placement` invariato sotto i campi, `aria-live-errors`: restano i `role="alert"` esistenti, `horizontal-scroll`/`truncation-strategy` misurati da 320 a 1280 px).

### Findings e decisioni PO: cosa è cambiato

| Voce | Esito | Dove | Evidenza |
|---|---|---|---|
| **F1** | ✅ | `e2e/billing.spec.ts` `dateAt`/`uniqueDatePair` | coppie pescate in **2000-01-02 … 2009-12-31** (`Math.random() * 3_651`, `day1 = dateAt(offset + 1)` < `day2`: il primo `day1` possibile è 2000-01-02, dopo la data di apertura della tesoreria `2000-01-01`). Il commento ora dice «bassa probabilità di collisione, non isolamento» e spiega perché (i test filtrano il libro globale). Banda verificata libera: nessuna data 2000-2009 in `prisma/seed.ts` né negli e2e, a parte `2000-01-01` (`helpers.ts:14` `ALL_TIME_STATEMENT`, `settings.spec.ts:147/424` e `treasury-settings.spec.ts:52`: è la data di apertura della tesoreria, fuori dalla banda); `pdf-exports` parte dal 2021, `account-statement-period` dal 2010. `billing-global.spec.ts:40`: il commento l'aveva già corretto il dev, verificato e non toccato |
| **F2** | ✅ | `e2e/accounts-topups.spec.ts:150` | blocco nuovo nel test 16.6a: `/it/dashboard/pilots?q=<cognome>` → `pilot-topup-<id>` → domani → `topup-form-error` `toHaveText('La data valuta non può essere nel futuro.')`. «tre tentativi» → «quattro» nel commento del saldo. Rosso col ramo rimosso (E1) |
| **F3** | ✅ | `docs/i18n/glossario-it.md`, dopo «Ricarica» | due righe: **Ricavi maturati** (EN «Earned revenue»: competenza, `getLedgerRevenueCents`; varianti vietate «Ricavi», «Ricavi del mese» per questo numero; fonte PO Q-16.6a-a + domande 2 e 2-bis) e **Cassa per categoria** (EN «Cash by category»; vietato «Per categoria» da solo). Il glossario non ha una colonna EN: l'equivalente sta fra parentesi |
| **PO 1** | ✅ | 15 punti in 10 file (sotto) | `className="fld-error"` al posto di `fld-label` + `color: var(--bad)` (o di `var(--bad)` inline), `textTransform: 'none'` tolto dove c'era, i margini restano. Guardia `e2e/mobile-ink-targets.spec.ts:526` (2 test, chiaro/scuro × 375/1280): rapporto ≥ 4,5, `text-transform: none`, `font-family` Inter Tight, classe `fld-error`, nessun colore inline, su Piloti «Registra ricarica» e «Nuova transazione» con il 422 vero (domani: non scrive nulla) |
| **PO 2 + 2-bis** | ✅ | `messages/{it,en}.json` | `DashboardPage.overview.kpis.revenue` «Ricavi del mese» → **«Ricavi maturati»** («Revenue this month» → «Earned revenue»), `ReportsPage.kpi.revenue` e `ReportsPage.charts.revenue.title` «Ricavi» → **«Ricavi maturati»** («Revenue» → «Earned revenue»). Non toccati, perché sono altri numeri: `ReportsPage.rankAircraft.metrics.revenue` «Ricavo» (addebiti per velivolo), `BillingPage.table.bookTypes.REVENUE`, `LogbookPage.kpi.revenue` «Addebiti». Nessun e2e asseriva quelle etichette: asserzioni aggiunte in `home-dashboard.spec.ts:145` e `reports.spec.ts:243-244`. Parità e `BANNED`: `messages.test.ts` verde |
| **I-1** | ✅ | `cash.service.test.ts` (+1) | «lo stato della categoria vince sulla data»: domani su categoria di sistema e su categoria disattivata → `ConflictError`, su categoria inesistente → `NotFoundError`. Il mutante R8 del reviewer ora è rosso (U1) |
| **Ordine degli errori** (richiesta della sessione principale, dopo il primo giro) | ✅ (`dcad37e`) | `accounts.service.test.ts` (+1) | lato ricarica: domani per una persona inesistente → `NotFoundError` (404), mai il 422, e la `$transaction` non si apre. Lato cassa lo fissa I-1. `recordTopUp` non ha un 404 «conto»: il conto viene creato con un upsert dentro la transazione. Mutante R9 rosso (U2) |
| **I-2** | dichiarato | — | «Cassa per categoria» a 320 px in italiano: la `card-head` passa da 49 a 73 px, col mese sotto il titolo. È il wrap previsto da `.card-head` (`flex-wrap`), senza tagli né overflow (misura del reviewer, `shots/u3-bycat-head-it-320.png`; non rimisurato qui) |
| **I-3** | nessuna azione | — | come da report |
| **TD-19.10-g** | ✅ (commit a parte) | `playwright.config.ts` `webServer.command` | `npm run start -- --keepAliveTimeout 75000` sotto `CI=1`, v. «Keep-alive» |

**I 15 punti di PO 1** (tutti dentro uno `SlideOver`, desktop e foglio a tutto schermo su telefono):
- Piloti «Registra ricarica»: `pilots-console.tsx:850`;
- «Nuova transazione»: `transaction-editor.tsx:369`;
- editor del pilota: `pilot-editor.tsx:330` (`SectionError`), `:541` (profili non caricati), `:1168` (`pilot-identity-error`), `:1318` (errore del form di creazione);
- editor dell'istruttore: `instructor-editor.tsx:265` (`SectionError`) e `:482` (anagrafica non caricata);
- `instructors-console.tsx:687` (`instructor-pay-form-error`) e `:881` (`add-instructor-error`);
- velivolo: `aircraft-editor.tsx:627`;
- scadenze: `expiry-editor.tsx:212`;
- prenotazioni: `new-booking-form.tsx:638` e `edit-booking-form.tsx:366` (`fld-label req-error-banner`: il focus di `.req-error-banner` resta);
- volo: `flight-editor.tsx:990` (`req-error-banner` + `var(--bad)` inline a 13 px, lo stesso idioma di «Nuova transazione»).

Dopo il fix, `grep` di `fld-label` con `var(--bad)` in `src`: **0**.

### Discriminanze (copia isolata `scratchpad/iso-fix`: `cp -r src messages prisma` + config, `node_modules` in symlink; manifest sha256 di 419 file `src`+`messages`)

| # | Mutante (solo nella copia) | Esito |
|---|---|---|
| U1 | R8 del reviewer: guardia spostata prima della lettura della categoria in `recordCashMovement` | **1 failed** / 78: il test I-1 («expected error to be instance of ConflictError») |
| U2 | R9 (il reviewer non l'aveva applicato): guardia spostata prima della lettura della persona in `recordTopUp` | **1 failed** / 86: il test dell'ordine («expected error to be instance of NotFoundError») |
| E1 | pre-fix combinato: `pilots-console.tsx` e `transaction-editor.tsx` di HEAD, messaggi di HEAD, e in più il ramo F2 rimosso (`setFormError(labels.genericError)`) | **4 failed**, ognuno per il suo motivo: `accounts-topups:150` riceve «Impossibile registrare la ricarica. Riprova.»; `home-dashboard:137` riceve «Ricavi del mese»; `mobile-ink-targets:526` chiaro: Piloti **3,96** (`fld-label`, mono, `uppercase`, colore inline); scuro: 6,61 ma `uppercase`, `fld-label`, colore inline |
| E2 | solo `transaction-editor.tsx` di HEAD (E1 si fermava su Piloti, che viene prima) | **2 failed**: «Nuova transazione» **3,96** in chiaro; in scuro 6,61 ma niente `fld-error` e colore inline |

Come sono girati E1 ed E2: build Turbopack della copia, servita su :3000, con `E2E_REUSE_SERVER=1 scripts/e2e.sh start … -g …`. Turbopack rifiuta un `node_modules` in symlink che punta fuori dalla root del progetto, quindi **solo nel `next.config.ts` della copia** c'è `turbopack: { root: '/' }`. Dopo ogni mutante, ripristino e `sha256sum -c` della copia contro il manifest del repo: identica. Il repo non è mai stato mutato: il manifest, ricontrollato dal repo, è pulito. Il server della copia è stato spento prima di riavviare quello del repo.

### Gate

`npm run gates`: lint, typecheck, test, build **PASS**, tre volte (dopo il fix, dopo la 2-bis, dopo il test dell'ordine). Unit **2250 → 2252** (+1 I-1, +1 ordine degli errori). `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/server/services/cash.service.test.ts`: 78/78.

### e2e

Server di produzione della build dei gate (`next start --keepAliveTimeout 75000`, `JOBS_SECRET` non segnaposto, `NODE_ENV` tolto), poi `E2E_REUSE_SERVER=1 scripts/e2e.sh start …`. DB `airmanager` com'era stato lasciato dalla sessione principale: **non** l'ho resettato.
1. **Mirato**, 18 spec: `accounts-topups`, `billing`, `mobile-ink-targets`, `home-dashboard`, `cash-register`, e i file che asseriscono i nodi d'errore toccati: `aircraft-management`, `aircraft-out-of-service-until`, `aircraft-rates`, `bookings`, `flight-delete-update`, `flight-requirements`, `flights`, `instructor-compensation`, `instructor-rates`, `mobile-logbook`, `person-profiles`, `person-save`, `people-management`. Esito: **258 passed, 0 flaky, 0 failed** = i 258 listati, `E2E_EXIT=0` (7,5 min). Girato con l'etichetta pre-2-bis.
2. **Dopo la 2-bis**: `home-dashboard`, `mobile-overview`, `mobile-ink-targets` → **41 passed** = 41 listati, `E2E_EXIT=0`.
3. **Non eseguiti da me**:
   - `reports.spec.ts` (catena serializzata: da solo trascina 589 test come dipendenze), e così `booking-window`/`booking-requirements` (catena; asseriscono solo il testo di `booking-form-error`, che non è cambiato). Le due asserzioni nuove di `reports.spec.ts` le ho verificate sul DOM della build: un solo `.card-title` «Ricavi maturati», primo `.kpi-label` «Ricavi maturati». Restano all'arbitro.
   - Conteggio della suite: **615 test in 69 file** (613 + i 2 nuovi di `mobile-ink-targets`).

### Verifica UI (script `playwright-core` usa-e-getta nello scratchpad, build di produzione)

- **Errori dei pannelli**, Piloti «Registra ricarica» e «Nuova transazione», chiaro/scuro × 1280/375 × IT/EN.
  - Testo: 12 px, Inter Tight, `innerText` in minuscolo («La data valuta non può essere nel futuro.» / «The value date cannot be in the future.»; «La data non può essere nel futuro.» / «The date cannot be in the future.»).
  - Colore: in chiaro il letterale `oklch(0.4 0.17 25)`, in scuro `var(--bad)`.
  - Layout: nessun salto, il messaggio sta sotto i campi come nella scheda persona.
  - Screenshot: `shots/fix-pilots-error-*`, `shots/fix-newtx-error-*`.
- **KPI «Ricavi maturati»** a 1280/1024/768/375/320 px, IT/EN, Panoramica e Statistiche: una riga, card tutte alte uguali (79 px desktop, 77 telefono), nessun overflow del documento. Con «Ricavi maturati del mese» (prima della 2-bis) a 1280 la card andava a 94 px contro 79, e anche fra 901 e ~920 px (`shots/fix-kpirow-it-1280.png`): da qui la domanda 2-bis.

### Keep-alive (TD-19.10-g)

`npx next start --help` (Next 16.2.10) espone `--keepAliveTimeout`, e `start-server.js:249-250` lo assegna a `server.keepAliveTimeout`. Misure con un socket grezzo su `localhost`:
- senza il flag (server temporaneo su :3100, poi spento), un socket keep-alive inattivo si chiude a **6,1 s**;
- con `75000` è ancora aperto a 7 s;
- inattivo per 66 s, cioè oltre `headersTimeout` = 60 s, risponde ancora **200** a una seconda richiesta sullo stesso socket (Node 24.15).

Il resto del comando non cambia: build, porta, `reuseExistingServer` e `npm run dev` fuori da CI.

### Deviazioni dichiarate

- **F-a: il perimetro di PO 1 è di 15 punti**, non gli «11 + `transaction-editor`» del report. Il censimento del report non vedeva tre punti, tutti in pannelli laterali: i due form di prenotazione (`fld-label req-error-banner`, lo stesso idioma) e l'editor del volo (`var(--bad)` inline a 13 px, lo stesso di «Nuova transazione»).
- **F-b: fuori dai pannelli laterali, non toccati.** Hanno lo stesso 3,96:1 in chiaro e la stessa correzione di una riga; candidati a un TD.
  - Mini-modali: `membership-fee-error` (`scadenze-console.tsx:1050`), `flight-cancel-error` (`logbook-console.tsx:837`), `transaction-adjust-error` e `transaction-reverse-error` (`billing-console.tsx:1238`, `:1278`).
  - Feedback di stato: `smtp-test-email-feedback` (`smtp-card.tsx:97`), `billing-reclassify-feedback` (`billing-console.tsx:743`).
  - Il saldo negativo nella lista Piloti (`pilots-console.tsx:421`): è una cifra, non un messaggio.
- **F-c**: `.fld-error` è a 12 px, quindi «Nuova transazione» e l'editor del volo scendono da 13 a 12 px, come la scheda persona.
- **F-d**: la banda F1 è di 3 651 coppie, non 3 650. Con `* 3_650` il primo giorno sarebbe 2000-01-03, non il 2000-01-02 che il report dichiara: ho reso esatta la banda dichiarata.
- **F-e: la guardia di contrasto misura i due pannelli nominati dal PO.** Gli altri 13 punti hanno la stessa classe, senza colore inline: lo dice il diff. Non li ho misurati uno per uno, perché ognuno vuole un errore del server diverso per comparire.
- **F-f**: per il KPI della Panoramica vale la **decisione PO del 2026-11-04** (domanda 2-bis, opzione B): «Ricavi maturati» / «Earned revenue», senza periodo, come in Statistiche. Il PO l'ha presa sulla misura del fix: «Ricavi maturati del mese» andava su due righe a 1280 px, con la card a 94 px contro 79. Le opzioni scartate erano «Ricavi maturati (mese)» e accettare le due righe.
- **F-g, incidente**: la terza `npm run gates` (13:15:50 → 13:17:23) ha ricostruito `.next` mentre girava un run della suite completa avviato alle 13:13:53 da un altro agente. Avevo controllato le porte prima della build, ma non la presenza di un run in corso (`scripts/e2e.sh status`). Il sorgente costruito è quello dei commit (il solo file in più era un test unit), ma il server vivo aveva in memoria un altro BUILD_ID, e nel log c'erano già dei fallimenti in quella finestra (`billing.spec.ts:185`, `:203`). La sessione principale è stata avvisata subito: quel run va considerato non valido. Da lì in poi nessuna build e nessun e2e da parte mia.

### Note per l'arbitro finale

- Su DB fresco ci si aspettano **615** test.
- Test nuovi o estesi:
  - `mobile-ink-targets.spec.ts:526` ×2 crea una persona pilota run-unique («Inchiostro-…») e un 422 senza scritture: nessuno stato globale, progetto di default;
  - `accounts-topups.spec.ts:150` esteso;
  - `home-dashboard.spec.ts:145`, `reports.spec.ts:243-244` (catena).
- Con `7a9ec4e` il webServer `CI=1` parte con `--keepAliveTimeout 75000`: da guardare se spariscono i flaky ECONNRESET / «socket hang up» (4 su 8 nell'arbitro della review).
  - Se l'arbitro riusa un server (`E2E_REUSE_SERVER=1`), va avviato con `npm run start -- --keepAliveTimeout 75000`, altrimenti l'effetto non si misura.
  - La ricetta di CLAUDE.md (`env -u NODE_ENV npm run build && npm run start &`) non ha il flag: non l'ho toccata (fuori dal mio perimetro). Da allineare se l'arbitro conferma.
- Persone di sonda lasciate nel DB (run-unique, inerti): due «Sonda-…» della verifica UI, oltre a quelle dei test.
- Porte 3000 e 3100 libere, nessun server avviato da me ancora vivo.

### Change Log

- 2026-11-04: fix della review (Opus 5.5).
  - Ordine degli errori della ricarica fissato da un test (`dcad37e`).
  - Errori dei pannelli laterali allo stile `.fld-error`, 15 punti, con guardia di contrasto.
  - «Ricavi maturati» anche in Panoramica e Statistiche (2-bis: senza periodo).
  - Banda F1 a 2000-2009, e2e del pannello Piloti, glossario, unit I-1 (`dea21d5`).
  - Keep-alive del server e2e (`7a9ec4e`).
