# Audit avversariale della logica di business finanziaria (ledger)

**Data**: 2026-09-10 · **Perimetro**: contabilità (conti prepagati, cassa, tariffe, compensi istruttori, quota associativa, addebiti volo, export, aggregati) · **Mandato**: trovare e PROVARE difetti logici, e dichiarare cosa è stato verificato corretto. Nessuna modifica al codice, nessun commit, nessun reset del DB, nessuna suite e2e.

**Esito sintetico**: nessun BLOCKER. **6 MAJOR**, **6 MINOR**, **7 LOW**, **4 domande al PO**. Il nucleo del ledger (append-only, saldo sempre `SUM`, centesimi interi, RBAC, unicità dello storno, ordinamento dei lock) è solido e ben difeso; i difetti stanno tutti **al bordo**: due calendari diversi per la stessa data valuta, due formule diverse per lo stesso arrotondamento, una tariffa payout non storicizzata, un totale stampato che non coincide con quello a schermo, e una chiave di idempotenza rigenerata nel punto in cui è obbligatoria.

---

## 1. Metodo e perimetro

Letti integralmente: `prisma/schema.prisma` (modelli monetari), `accounts.service.ts`, `transactions.service.ts`, `cash.service.ts`, `billing-summary.service.ts`, `instructor-compensation.service.ts`, `instructor-rates.service.ts`, `rates.service.ts`, `membership.service.ts`, `exports.service.ts`, `stats.service.ts`, `me.service.ts`, `flights.service.ts`, `src/lib/api/handler.ts` (idempotenza), `src/lib/{money,date-only,zoned-time,period-presets}.ts`, `src/server/auth/rbac.ts`, gli schemi Zod dei write monetari, tutte le route `/api/v1/**` del perimetro, e i loro test unitari. Due sweep di lettura delegati hanno coperto (a) le superfici UI che mostrano aggregati monetari e (b) l'inventario di cosa i test unitari/e2e fissano come invariante e cosa non copre nessun test; **ogni loro affermazione riportata qui sotto è stata riverificata da me sul codice**, e quelle non riproducibili sono marcate PLAUSIBILE.

**Prove prodotte** (tutte fuori dal repo, in `…/scratchpad/ledger-audit/`):

| File | Cosa prova | Esito |
|---|---|---|
| `rounding.mjs` | divergenza fra le due formule di arrotondamento | 19 769 coppie su 11 700 300 |
| `tz-boundary.probe.test.ts` | confine Roma/UTC nei percorsi monetari | 3 test, 3 passed |
| `adjustment-chain.probe.test.ts` | rettifica libera su `FLIGHT_CHARGE`, catena a profondità 3 | 3 test, 3 passed |

Comando: `npx vitest run --config …/ledger-audit/vitest.audit.config.mjs` → **6 passed / 6**.

**Sonde SQL** in sola lettura sul DB di lavoro (`docker compose exec -T postgres psql`), nessuna scrittura. **Nessuna chiamata API** effettuata, quindi nessuna fixture `audit_` creata.

Il codice porta commenti di progetto molto densi: dove un comportamento è **dichiarato** intenzionale nel commento, lo dico e classifico il finding come DOMANDA DI DESIGN invece di difetto, anche quando il commento non mi convince — la scelta è del PO, non mia. Dove il commento **motiva** una scelta con una ragione che il lettore che esiste oggi smentisce (finding 1), lo dico esplicitamente.

---

## 2. Invarianti del dominio, come li ho ricostruiti

| # | Invariante | Chi lo impone |
|---|---|---|
| I1 | **Il saldo non esiste come colonna**: è sempre `SUM(AccountMovement.amountCents)` | `schema.prisma:624-631` (`Account` senza colonna saldo); `accounts.service.ts:153-156`, `:638-642`, `:740-746`; `billing-summary.service.ts:130-133`; `membership.service.ts:103`, `:171`; `flights.service.ts:976-980` |
| I2 | **Append-only (AD-3)**: nessun movimento è mai modificato o cancellato; si corregge con un movimento nuovo | 6 siti `accountMovement.create`, tutti dentro un `tx`; **zero** `accountMovement.update/delete` e zero `cashMovement.delete` in `src/` (solo la doc generata di Prisma) |
| I3 | **Al massimo uno storno per movimento** | `reversalOfId @unique` su `AccountMovement` (`schema.prisma:659`) e `CashMovement` (`:730`), più pre-check + backstop `P2002` a ogni sito di scrittura (`accounts.service.ts:657-661`, `cash.service.ts:433-436`, `flights.service.ts:1344-1351`, `:1480-1486`) |
| I4 | **Centesimi interi (AD-2)**, mai float né decimali | nessun `Float`/`Decimal` in `schema.prisma`; ogni colonna `*Cents` è `Int`; `money.ts:23-25` solleva `TypeError` su un non-intero |
| I5 | **Snapshot della tariffa al volo (AD-4)**: il volo congela tariffa e importi, una modifica successiva del listino non riscrive la storia | `Flight.aircraftRateCentsPerHour/aircraftAmountCents/instructorRateCentsPerHour/instructorAmountCents` (`schema.prisma:1035-1048`); `flights.service.ts:869-882`, `:985-986` |
| I6 | **Tariffa efficace = massimo `validFrom <= D`, confine INCLUSIVO**, tabelle append-only senza update/delete | `rates.service.ts:227-237`, `:253-277`; `instructor-rates.service.ts:199-218` |
| I7 | **Lo storno automatico è la negazione esatta del valore MEMORIZZATO**, mai un ricalcolo | `flights.service.ts:1335` e `:1471` (`0 - originalMovement.amountCents`) |
| I8 | **Gemello di cassa**: ogni movimento di conto che muove anche contante ha un `CashMovement` creato nella STESSA transazione | `accounts.service.ts:238-261` (ricarica), `instructor-compensation.service.ts:485-507` (payout), `ppr.service.ts:660-694` (tassa di atterraggio) |
| I9 | **Un evento economico = una riga** nel ledger unificato (dedup del gemello) | `transactions.service.ts:216`, `:243-245` |
| I10 | **Lo storno appartiene al libro del suo originale, con segno opposto, nel mese in cui avviene** | `transactions.service.ts:130-153`; `billing-summary.service.ts:84-94` |
| I11 | **Ordinamento deterministico dei lock**: tutti gli `Aircraft` in un solo `IN (…) ORDER BY id FOR UPDATE`, poi tutti gli `Account`; velivoli sempre prima dei conti | `flights.service.ts:1439-1457`; stesso ordine in `registerFlight` (`:1101`, `:1121`) e `cancelFlight` (`:1308`, `:1319`) |
| I12 | **Ogni scrittura a DEBITO prende il lock `FOR UPDATE` sul conto** | `accounts.service.ts:636`, `membership.service.ts:101`, `flights.service.ts:1121`, `:1457`. La ricarica non lo prende, deliberatamente e correttamente (`accounts.service.ts:198-202`) |
| I13 | **Solo ADMIN tocca i soldi** | `rbac.ts:106-112`: `finance.manage`/`payouts.manage`/`settings.manage`/`flights.manage` esistono solo in `ALL_PERMISSIONS` |
| I14 | **Il titolare vede solo il proprio conto** | `accounts.service.ts:97-103` (`assertReadAccess`); i due lettori self-service non hanno affatto un parametro `personId` (`:417-423`, `:433-442`) |

---

## 3. Findings

### MAJOR-1 — La tariffa payout non è storicizzata, e il lettore che esiste la applica retroattivamente a tutte le ore già liquidate

**Stato**: CONFIRMED (lettura del codice + la motivazione dello schema che non regge) · **Severità**: MAJOR

**File**: `prisma/schema.prisma:129-138` · `instructor-compensation.service.ts:166-176`, `:532-543`

`InstructorProfile.payoutRateCents` è una singola colonna mutabile. Il commento dello schema motiva così la scelta:

> «Deliberately a single mutable column, NOT historicized like `InstructorRate` … the payout ledger (`InstructorPayout` below) already carries its own dated rows, so there is **no "what was the rate on date D" question** to answer for this field the way AD-4 answers it for `InstructorRate`.»

**La motivazione non regge per il lettore che esiste oggi.** `computeOwed` fa esattamente quella domanda, e la fa su TUTTE le ore di sempre:

```
instructor-compensation.service.ts:167-176
  computeGrossCents(minutes, payoutRateCents) = Math.round((minutes / 60) * payoutRateCents)
  computeOwed(minutes, payoutRateCents, paidCents) = gross - paidCents
```

con `minutes` = `totalMinutes` non delimitato (`sumMinutesByProfile(ids, null)`, `:122-140`, variante `total` con `bounds: null`) e `paidCents` = somma di tutti i payout di sempre (`:148-164`).

**Scenario**: un istruttore vola 100 h a 20,00 €/h, riceve 2 000,00 € di payout, `owedTotalCents` = 0. L'admin aggiorna la tariffa a 25,00 € tramite `setPayoutRate` (un `prisma.instructorProfile.update` secco, `:537-541`). Alla ricarica della pagina `owedTotalCents` diventa **+500,00 €** per ore già saldate. Nel verso opposto (18,00 €/h) diventa **−200,00 €**: un «dovuto» negativo, per il quale lo schema dichiara che non esiste rimedio — «`amountCents` is the amount paid (always positive … there is no reversal concept for this MVP ledger)» (`schema.prisma:174-177`).

**Portata**: la cifra compare in quattro posti: la riga del roster e il KPI «Totale dovuto» (`dashboard/instructors/page.tsx:51`), l'export xlsx (`exports.service.ts:483`), i KPI di `/dashboard/reports` (`stats.service.ts:209`) e la pagina self-service dell'istruttore «Residuo dovuto» (`my-compensation/page.tsx:120`). Nel DB di lavoro 9 istruttori hanno una tariffa impostata e 8 payout sono registrati.

**Rimedio proposto**: storicizzare `payoutRateCents` con la stessa forma append-only di `InstructorRate` (`@@unique([instructorProfileId, validFrom])`, AD-4) e accumulare per periodo alla tariffa efficace, OPPURE — molto più economico — congelare la tariffa applicata **su ogni `InstructorPayout`** e calcolare il maturato solo sul periodo non ancora coperto da payout. La seconda opzione non richiede migrazione dei dati esistenti.

**Test mancanti**: nessuno. `grep -niE "setPayoutRate|retroact" instructor-compensation.service.test.ts e2e/instructor-compensation.spec.ts` trova solo RBAC (`:160`), 404 (`:546`), 409 (`:551`), «sets a positive rate» (`:555`), «clears the rate back to null» (`:567`). Nessun test registra un payout, poi cambia la tariffa, poi rilegge il dovuto.

---

### MAJOR-2 — Disattivare o archiviare un istruttore nasconde il denaro che il campo di volo gli deve ancora

**Stato**: CONFIRMED (lettura del codice) · **Severità**: MAJOR

**File**: `instructor-compensation.service.ts:97-119`, `:213-218`, `:361-381` · `dashboard/instructors/page.tsx:44`, `:50-51`

`getCompensationSummary` passa per `listActiveInstructors`, che filtra:

```
instructor-compensation.service.ts:99-103
  where: { archivedAt: null, instructorProfile: { deactivatedAt: null }, … }
```

Il KPI e il sottotitolo della pagina sommano solo quel sottoinsieme:

```
dashboard/instructors/page.tsx:50-51
  const totalMinutes = summary.reduce((sum, row) => sum + row.totalMinutes, 0);
  const totalOwedCents = summary.reduce((sum, row) => sum + (row.owedTotalCents ?? 0), 0);
```

etichettati «Totale dovuto» e «{active} attivi · {owed} da liquidare» (`messages/it.json`, `InstructorsPage.kpi.owed`/`sub`). Il `reduce` in sé è corretto — l'insieme non lo è. E il dettaglio del singolo istruttore non offre una via d'uscita: `resolveActiveInstructorRow` risponde 404 su un profilo disattivato (`:371-373`).

**Contraddizione interna**: il lettore gemello di questo, sulla stessa area, dichiara la regola opposta e la motiva:

> `accounts.service.ts:730-735` — «ARCHIVED people are deliberately NOT filtered out (review 3.3 F1, conscious deviation …): a debtor who left the airfield is exactly who staff must still see here — **archiving must never hide money owed**.»

Due liste di denaro su schermate adiacenti, politiche opposte, e solo una delle due argomentata. Qui il debito è del campo verso l'istruttore invece che del pilota verso il campo, ma il principio è lo stesso.

**Portata**: le righe `InstructorPayout` e i voli SCHOOL sopravvivono in DB (nessuna cancellazione fisica), quindi il dato non è perso — è **irraggiungibile da qualsiasi superficie**. Sonda SQL: oggi 0 istruttori disattivati/archiviati hanno payout o voli SCHOOL, quindi l'esposizione è latente, non attiva.

Effetto collaterale della stessa riga: `(row.owedTotalCents ?? 0)` collassa «nessuna tariffa configurata» (dovuto **ignoto**, `null`) in 0, mentre la cella della tabella per lo stesso istruttore mostra «—». Il KPI si legge come una cifra completa quando è incompleta.

**Rimedio**: allineare la politica a quella di `listNegativeBalances` — includere gli istruttori disattivati/archiviati che hanno un residuo ≠ 0 (eventualmente in una sezione «non più attivi»), e distinguere nel KPI il dovuto ignoto dal dovuto zero.

**Test mancanti**: nessun test copre un istruttore disattivato con residuo.

---

### MAJOR-3 — Due calendari per la stessa data valuta: cinque writer usano UTC, due usano Europe/Rome

**Stato**: CONFIRMED (riprodotto, `tz-boundary.probe.test.ts`) · **Severità**: MAJOR

**File**: `date-only.ts:37-40` (`todayDateOnlyUtc`) vs `zoned-time.ts:176-178` (`todayDateOnlyInZone`)

Chi stampa `effectiveDate` con il calendario **UTC**:

| Writer | Riga |
|---|---|
| `recordAdjustment` (rettifica di conto) | `accounts.service.ts:651` (copia privata a `:706-709`) |
| `reverseCashMovement` (storno di cassa) | `cash.service.ts:425` (copia privata a `:287-290`) |
| `chargeMembershipFee` (quota associativa, e la scadenza a 12 mesi) | `membership.service.ts:90`, `:133`, `:156`, `:164` |
| `cancelFlight` (storno volo) | `flights.service.ts:1338` |
| `correctFlight` (storno volo) | `flights.service.ts:1474` |

Chi lo stampa con il calendario **Europe/Rome**:

| Writer | Riga |
|---|---|
| `recordPayout` (compenso istruttore) | `instructor-compensation.service.ts:482` |
| `completePprRequest` (tassa di atterraggio) | `ppr.service.ts:655` |

E tutti gli aggregati che leggono `effectiveDate` delimitano il periodo sul calendario **Roma**: `period-presets.ts:43-48` (`currentMonthRange`, usato da `getBillingSummary` a `billing-summary.service.ts:161` e dalla pagina billing a `dashboard/billing/page.tsx:116`).

**Prova**. Orologio fissato a `2026-08-31T22:30:00.000Z`, cioè **00:30 del 1° settembre a Roma** (CEST):

```
A.  dateOnlyInZone(now, 'Europe/Rome')        → '2026-09-01'   (il giorno reale)
    toDateOnlyString(todayDateOnlyUtc())      → '2026-08-31'   (quello che si stampa)
B.  currentMonthRange(now)                    → { from: '2026-09-01', to: '2026-09-30' }
    stamped >= month.from                     → false          (fuori dal mese corrente)
```

**Conseguenza 1 (contabile)**: una rettifica, uno storno di cassa, una quota associativa o uno storno di volo registrati fra le 00:00 e le 02:00 di Roma (01:00-02:00 in inverno) finiscono **nel mese contabile precedente**, cioè in un periodo per cui il report è già stato tirato. Nella stessa notte, un payout o una tassa PPR finiscono nel mese giusto. Dentro un singolo volo l'incoerenza è visibile a occhio nudo: l'addebito è datato sul giorno **Roma** (`registerFlightCore` usa `params.flightDate`, `flights.service.ts:1033`) e il suo storno sul giorno **UTC** (`:1338`).

**Conseguenza 2 (operativa, riprodotta)**: nella stessa finestra `registerFlight` **rifiuta un volo appena atterrato**. `flightDate` è il giorno Roma del decollo (`deriveFlightDate`, `:484-486`) mentre la guardia confronta con `todayDateOnlyUtc()` (`:761`):

```
A2. decollo 22:00Z (00:00 Roma), atterraggio 22:10Z (00:10 Roma), ora corrente 22:30Z
    registerFlight(...) → 422 FLIGHT_DATE_IN_FUTURE, e $transaction non viene mai aperta
```

Il test esistente che copre quella guardia si intitola, correttamente, «for a flight date after today (**server UTC clock**)» (`flights.service.test.ts:528`) — il difetto è che il resto della catena non è UTC.

**Rimedio**: un'unica funzione «oggi contabile» in `Europe/Rome` per tutti e sette i writer, e la guardia `FLIGHT_DATE_IN_FUTURE` confrontata contro lo stesso giorno Roma. `todayDateOnlyInZone(APP_TIMEZONE)` esiste già ed è la scelta giusta; `todayDateOnlyUtc` va ritirato dai percorsi monetari (resta legittimo dove la data è pura aritmetica di calendario).

**Test mancanti**: solo tre file monetari falsificano l'orologio, e `membership.service.test.ts:89` fissa deliberatamente mezzogiorno (`2027-03-10T12:00:00Z`), lontano da ogni confine. Nessun test a 22:30Z per `recordAdjustment`, `reverseCashMovement`, `chargeMembershipFee`, `cancelFlight`, `correctFlight`.

---

### MAJOR-4 — Una data valuta futura è accettata e conteggiata nella liquidità di oggi

**Stato**: CONFIRMED (sonda SQL su dati reali) · **Severità**: MAJOR

**File**: `src/lib/schemas/accounts.ts:41` · `src/lib/schemas/cash.ts` (`recordCashMovementSchema.effectiveDate`) · `billing-summary.service.ts:99-126` · `:129-149`

`effectiveDate` è un `z.iso.date()` nudo, senza limite superiore, sia per la ricarica sia per il movimento di cassa manuale — mentre un **volo** con data futura è respinto con `FLIGHT_DATE_IN_FUTURE` (`flights.service.ts:761`). E i due aggregati di tesoreria non hanno limite superiore di data: `computeTreasuryTotals` filtra solo `effectiveDate >= openingDate` (`:101-110`), `computeDeposits` non filtra affatto per data (`:130-133`).

**Prova sul DB di lavoro** (`openingDate` = `2000-01-01`):

| Voce | Centesimi |
|---|---|
| Cassa mostrata oggi | 945 414 |
| di cui datata nel futuro | 8 000 |
| Banca mostrata oggi | −54 227 |
| di cui datata nel futuro | 59 000 |
| Righe di cassa con data futura | 11 |

Le ricariche future in DB portano date 2035-11-13, 2047-08-24, 2051-02-26 (×2), 2053-06-05, 2055-05-23. Il pannello «Liquidità» di `/dashboard/billing` mostra quindi una Banca di −542,27 € quando la posizione vera a oggi è **−1 132,27 €**: 590,00 € di quella cifra sono soldi datati fra il 2035 e il 2055. Le stesse righe gonfiano `deposits.totalCents` e quindi abbassano `availableCents` (`:173`).

Quelle righe sono residuo di fixture e2e — ed è esattamente il punto: **sono entrate dall'API reale, attraverso lo schema reale**. Nulla distingue quel percorso da un operatore che digita 2035 invece di 2025.

**Rimedio**: rifiutare al bordo Zod una `effectiveDate` futura per ricarica e movimento di cassa (stessa regola del volo), oppure — se una data valuta futura ha un senso di dominio — delimitare superiormente `computeTreasuryTotals`/`computeDeposits` a oggi. Le due opzioni sono alternative, non cumulative: va scelta con il PO (v. §5).

**Test mancanti**: nessun test asserisce né l'accettazione né il rifiuto di una data valuta futura.

---

### MAJOR-5 — Il PDF del registro voli somma i voli ANNULLATI; il totale a schermo, per gli stessi filtri, no

**Stato**: CONFIRMED (lettura del codice + quantificazione SQL) · **Severità**: MAJOR

**File**: `exports.service.ts:596-598`, `:673-684` vs `flights.service.ts:1710-1735`

Il totale a schermo passa per `getFlightTotals`, che **forza** lo stato a prescindere dal filtro, per ratifica esplicita:

```
flights.service.ts:1719
  const where = { ...buildFlightsWhere(actor, query, canManage), status: 'REGISTERED' };
```

> `:1705-1707` — «but ALWAYS forces `status: 'REGISTERED'` regardless of `query.status` (Ratifica 3: a CANCELLED flight stays visible in the table, never counted in totals)».

Il PDF esportato dalla stessa intestazione calcola i propri totali sommando le righe di `listFlights`, dove `status` è un filtro **opzionale** (`buildFlightsWhere`, `:1606`: `...(query.status ? { status: query.status } : {})`):

```
exports.service.ts:676-677
  const totalMinutes = result.items.reduce((sum, row) => sum + row.minutes, 0);
  const totalAmountCents = result.items.reduce((sum, row) => sum + row.breakdown.totalAmountCents, 0);
```

**Quantificazione sul DB di lavoro**:

| Insieme | Voli | Importo (centesimi) |
|---|---|---|
| REGISTERED (il KPI «Ricavo» a schermo) | 116 | 1 531 702 |
| CANCELLED (in più nel PDF) | 15 | 256 917 |
| Totale stampato dal PDF | 131 | 1 788 619 |

Sulla vista predefinita del registro (nessun filtro di stato) lo schermo dice **15 317,02 €** e il PDF stampato da quel bottone dice **17 886,19 €**. Non è una deviazione dichiarata: è la Ratifica 3 violata su una superficie che nessuno ha ricontrollato.

**Rimedio**: far calcolare al PDF gli stessi totali di `getFlightTotals` (chiamarlo, non risommare), oppure aggiungere `status: 'REGISTERED'` al `reduce`. La prima chiude la classe di difetto, la seconda solo l'istanza.

**Test mancanti**: la fixture dell'unico test dei totali PDF (`exports.service.test.ts:647`) contiene due righe entrambe `REGISTERED` — nessun volo annullato, quindi la divergenza non è misurabile da lì. Nessun test di parità schermo/export in tutta la suite (l'xlsx non porta totali affatto).

---

### MAJOR-6 — Quota associativa: la chiave di idempotenza è rigenerata a ogni tentativo, proprio dove il server la esige

**Stato**: CONFIRMED (lettura del codice + doppio addebito già presente in DB) · **Severità**: MAJOR

**File**: `dashboard/expiries/scadenze-console.tsx:810-814` · contratto in `src/lib/use-idempotency-key.ts:32-61`

Il contratto ratificato (story TD-2, AC 6) è documentato senza ambiguità:

> `use-idempotency-key.ts:38-45` — «The key **survives a NETWORK failure** (the `fetch` call itself throws — offline, DNS, a dropped connection mid-request — exactly the retry this protects: the caller must reuse the SAME key so the server-side wrapper can replay instead of re-executing) but is regenerated after ANY HTTP response arrives».

Sei dei sette form monetari lo rispettano alla lettera (`pilots-console.tsx:729/:749-763`, `instructors-console.tsx:461/:488-504`, `transaction-editor.tsx:109/:178-189`, `flight-editor.tsx:358`, `account-section.tsx:630/:754`, `manual-ppr-form.tsx:177`): `useIdempotencyKey()`, `try { response = await fetch(...) } catch { return }` senza rigenerare, `regenerateIdempotencyKey()` solo **dopo** che una risposta è arrivata.

Il settimo — la quota associativa, **l'unica route dove `Idempotency-Key` è obbligatoria lato server** (`registry.ts:2011`: «422 `IDEMPOTENCY_KEY_REQUIRED` without it … a network retry of this addebito+renewal gesture must replay, never double-charge») — fa l'opposto:

```
scadenze-console.tsx:811-814
  const response = await fetch(`/api/v1/people/${personId}/membership-fee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomIdempotencyKey() },
    body: JSON.stringify({ amountCents: parsedAmount, override }),
  });
```

`randomIdempotencyKey()` è invocata **inline, dentro la chiamata**, e il `fetch` non è in `try/catch`. Due conseguenze:

1. **Il ritentativo dopo un guasto di rete raddoppia l'addebito.** Il server vede due chiavi distinte, crea due `IdempotencyRecord` distinti, esegue due volte. Non c'è replay: è esattamente il difetto che l'obbligatorietà della chiave doveva rendere impossibile su questa route.
2. Il rigetto non catturato del `fetch` lascia `submitting` a `true` (`setSubmitting(false)` a `:815` non viene mai raggiunto) e il bottone disabilitato (`:906`), senza messaggio d'errore — quindi l'operatore ricarica la pagina e riprova, che è precisamente il gesto che innesca il punto 1.

**Effetto del doppio addebito** (v. anche DQ-1): due righe `ADJUSTMENT` **indistinguibili** — la descrizione è `Quota associativa ${paymentYear}` (`membership.service.ts:132`), senza importo né discriminante — e la scadenza spinta a **24 mesi** dalla data del pagamento, perché il rinnovo è rotativo su `max(oggi, expiresAt)` (`:151-158`).

**Prova che la forma è raggiungibile**, dal DB di lavoro:

```
Quota associativa 2026 | 2026-08-07 | -3000 | Quota-…p32eqz | expiresAt 2028-08-07
Quota associativa 2026 | 2026-08-07 | -3000 | Quota-…p32eqz | expiresAt 2028-08-07
```

Due addebiti identici sullo stesso conto, stessa data, e la scadenza a **due anni** dal pagamento.

**Perché MAJOR e non BLOCKER**: entrambe le righe finiscono nell'estratto conto del titolare e il percorso di rettifica esiste, quindi la duplicazione non è *silenziosa* nel senso del rubric. Resta però la sola superficie monetaria dove il meccanismo di protezione è dichiarato obbligatorio e disinnescato dal chiamante.

**Rimedio**: usare `useIdempotencyKey()` come le altre sei, con `try/catch` attorno al `fetch` e `regenerateIdempotencyKey()` dopo la risposta. È il diff più piccolo di tutto questo audit.

**Test mancanti**: `e2e/membership-fee.spec.ts:137` copre il **replay** con la stessa chiave (che il server fa correttamente); nessun test copre il fallimento di rete lato client, né il fatto che il client non riusi la chiave.

---

### MINOR-1 — Due formule diverse per lo stesso arrotondamento, e quella del payout perde il «mezzo centesimo per eccesso»

**Stato**: CONFIRMED (`rounding.mjs`) · **Severità**: MINOR

**File**: `flights.service.ts:882` e `:985` vs `instructor-compensation.service.ts:169`

```
volo    : Math.round((rate * minutes) / 60)
payout  : Math.round((minutes / 60) * payoutRateCents)
```

Algebricamente identiche, in binario no: `minutes / 60` è inesatto per ogni `minutes` non multiplo di 60, e l'errore si propaga nel prodotto.

**Prova** (`rate ∈ [1000, 40000] × minutes ∈ [1, 300]`, 11 700 300 coppie):

| Misura | Valore |
|---|---|
| Coppie in disaccordo | **19 769** (0,17 %) |
| Scostamento | sempre 1 centesimo |
| Primo caso | `rate=1002, minutes=245` → volo **4092**, payout **4091** |
| Caso a mezzo centesimo | `rate=1510, minutes=69` → esatto **1736,5**, volo **1737**, payout **1736** |

Il secondo caso è il più serio: la regola di arrotondamento «half-up» è **provata** per l'addebito volo (`flights.service.test.ts:817`: 333 × 30′ → 167) e **tacitamente falsa** per il compenso istruttore, perché `(69/60) * 1510` vale `1736.4999999999998` e `Math.round` scende. Il progetto crede di avere una regola sola; ne ha due.

**Rimedio**: una sola funzione condivisa `centsForMinutes(rateCentsPerHour, minutes) = Math.round((rate * minutes) / 60)`, chiamata dai tre siti. La forma `(rate * minutes)` resta esatta fino a `rate * minutes < 2^53`, cioè sempre.

**Test mancanti**: nessun test confronta le due formule; l'unico test di arrotondamento del payout (`instructor-compensation.service.test.ts:339`) usa `4501 × 25′ = 1875,4166…`, lontano da `,5`.

---

### MINOR-2 — `recordAdjustment` accetta un `FLIGHT_CHARGE` come originale, con importo libero, e consuma per sempre lo slot di storno del volo

**Stato**: CONFIRMED (riprodotto, `adjustment-chain.probe.test.ts` test C) · **Severità**: MINOR

**File**: `accounts.service.ts:604-626` · `flights.service.ts:1248-1257` · `dashboard/people/[id]/account-section.tsx:245-248`

La guardia sull'originale esclude **solo** `PACKAGE_PURCHASE`:

```
accounts.service.ts:616-622
  if (original.type === 'PACKAGE_PURCHASE') { throw new ConflictError(…) }
  if (original.reversal) { throw new ConflictError(…) }
```

e l'azione di riga UI la offre su qualunque altro tipo:

```
account-section.tsx:246-248
  function rowIsAdjustable(row) { return !row.hasReversal && row.type !== 'PACKAGE_PURCHASE'; }
```

**Prova**: una rettifica di **+150,00 €** contro un `FLIGHT_CHARGE` di **−200,00 €** viene scritta senza obiezioni, con `reversalOfId` puntato all'addebito del volo:

```
created.data → { type: 'ADJUSTMENT', amountCents: 15000, reversalOfId: 'mov_flight_charge' }
charge + "storno" = -20000 + 15000 = -5000   (≠ 0)
```

Due effetti:

1. **`charge − reversal ≠ 0`** (la domanda esplicita della hunt list §1). Sul percorso automatico l'invariante I7 è strutturale; su questo percorso l'importo è digitato a mano, quindi un rimborso parziale o eccessivo è ammesso, ed entrambe le righe cadono sotto `ACCOUNT_REVENUE_OR` (`transactions.service.ts:130-140`) lasciando un residuo di ricavo che non corrisponde a nessun volo.
2. **Il volo diventa non annullabile e non correggibile per sempre.** Lo slot unico `reversalOfId` è occupato, quindi `loadRegisteredFlightForReversal` risponde 409 a ogni futuro `cancelFlight`/`correctFlight`:

```
flights.service.ts:1248-1257
  if (originalMovement.reversal) {
    throw new ConflictError("This flight's charge has already been reversed by a manual adjustment.");
  }
```

Il commento **riconosce** la conseguenza («such a flight can no longer be cancelled/corrected through this API — the books were already settled by hand»), quindi il rifiuto è intenzionale. Ciò che non è intenzionale, o comunque non è dichiarato, è che **l'UI offra il gesto senza avvertire**: l'operatore che clicca «Rettifica questo movimento» su una riga volo non sa che sta rinunciando allo storno del volo, e il volo resta `REGISTERED` con il suo contributo al contaore e ai totali del registro intatto.

**Rimedio (minimo)**: nascondere l'azione di riga sui tipi derivati (`FLIGHT_CHARGE`, `FLIGHT_CHARGE_REVERSAL`) come già si fa per `PACKAGE_PURCHASE` — il ledger unificato adotta già esattamente questa regola (`transactions.service.ts:289`: `actionable: (row.type === 'TOP_UP' || row.type === 'ADJUSTMENT') && …`). Le due superfici hanno regole diverse per lo stesso gesto: quella del ledger è la giusta.

**Test mancanti**: nessuna fixture in `accounts.service.test.ts` imposta `type` sull'originale (`:766`, `:786`, `:819` lo omettono); solo il ramo `PACKAGE_PURCHASE` è esercitato (`:801`). L'e2e collega una rettifica solo a un `TOP_UP` (`e2e/account-adjustments.spec.ts:149`, `:174`).

---

### MINOR-3 — Il classificatore risale l'antenato `TOP_UP` di due soli livelli: a profondità 3 nasce ricavo fantasma

**Stato**: CONFIRMED (riprodotto, `adjustment-chain.probe.test.ts` test D e D2) · **Severità**: MINOR

**File**: `transactions.service.ts:180-191` (classificatore di riga) e `:130-140` (predicato d'aggregato)

La correzione della review Billing-2 F3 guarda `reversalOf.type` e `reversalOf.reversalOf.type` — due livelli:

```
transactions.service.ts:187-189
  if (row.reversalOfId !== null) {
    return row.reversalOf?.type === 'TOP_UP' || row.reversalOf?.reversalOf?.type === 'TOP_UP' ? 'DEPOSIT' : 'REVENUE';
  }
```

Una catena `TOP_UP ← A1 ← A2 ← A3` mette il `TOP_UP` un livello oltre lo sguardo. Ogni `ADJUSTMENT` può essere l'originale del successivo — è dichiarato lecito (`accounts.service.ts:569-571`: «an `ADJUSTMENT` row can itself be `originalMovementId` for a later one») e raggiungibile dall'estratto conto.

**Prova**:

```
D.  A3 = +50,00 €, reversalOf = A2 (ADJUSTMENT), A2.reversalOf = A1 (ADJUSTMENT)
    → bookType 'REVENUE'      ← ricavo fantasma di 50,00 €
D2. A2 = +50,00 €, reversalOf = A1 (ADJUSTMENT), A1.reversalOf = TOP_UP
    → bookType 'DEPOSIT'      ← la correzione a profondità 2 funziona
```

D2 dimostra che non sto leggendo male: la difesa esiste ed è esatta, è solo **corta di un livello**. Il buco è lo stesso che F3 ha chiuso («Without this, correcting a wrong ricarica showed up as ghost ricavo — the reviewer's own measured case: +50,00 €»), riaperto un anello più in là. Ho verificato che il caso `FLIGHT_CHARGE` invece **netta correttamente** in entrambi i versi e a ogni profondità, perché la sua esclusione non dipende dall'antenato (v. §4, VC-9).

**Rimedio**: risolvere l'antenato per ricorsione (o memorizzare il tipo radice sulla riga) invece di srotolare N livelli — un terzo `reversalOf` annidato sposterebbe il buco a profondità 4.

**Test mancanti**: nessuna fixture imposta l'originale a `ADJUSTMENT` o `FLIGHT_CHARGE_REVERSAL`; la profondità della catena non è testata in nessun verso.

---

### MINOR-4 — «Per categoria · Entrate» e «Risultato · Ricavi» rispondono a due domande diverse sotto la stessa etichetta di mese

**Stato**: CONFIRMED (sonda SQL) · **Severità**: MINOR · vedi anche DQ-3

**File**: `cash.service.ts:590-602` vs `billing-summary.service.ts:84-94` e `transactions.service.ts:459-487` · resi insieme da `getBillingSummary` (`:163-176`) e affiancati in `dashboard/billing/page.tsx:91`

`getCashReport` è una SQL grezza **senza** dedup del gemello e **senza** la regola di verso dello storno:

```sql
cash.service.ts:597-599
  FROM "CashCategory" c JOIN "CashMovement" cm ON cm."categoryId" = c.id
  WHERE cm."effectiveDate" >= ${query.from}::date AND cm."effectiveDate" <= ${query.to}::date
```

`revenueCents` e `costCents` applicano entrambi `CASH_NOT_ALREADY_ON_ACCOUNT` (`billing-summary.service.ts:89`; `transactions.service.ts:479-480`). Quindi i gemelli di ricarica — 127 delle 190 righe di cassa in DB — entrano in `byCategory.inCents` e restano fuori da `revenueCents`, correttamente.

**Misura, agosto 2026, DB di lavoro**:

| Cifra | Centesimi | € |
|---|---|---|
| `byCategory.totalInCents` («Entrate», Report finanziario) | 296 337 | 2 963,37 |
| di cui gemelli di ricarica | 96 000 | 960,00 |
| `result.revenueCents` («Ricavi», Risultato) | 357 470 | 3 574,70 |
| `byCategory.totalOutCents` («Uscite») | −259 772 | −2 597,72 |

Due cifre di «denaro entrato» per lo stesso mese che differiscono di **611,33 €**, sui due lati dello stesso `.billing-split`, entrambe sottotitolate `{month}` (`messages/it.json`, `BillingPage.byCategory.sub`).

**Il registro di cassa ha ragione a includerle**: il cassetto ha davvero incassato 960,00 €. Il difetto non è il numero, è che le due carte non dicono al lettore di rispondere a domande diverse — e la stessa divergenza va in stampa nei totali del PDF «Report finanziario» (`exports.service.ts:588-590`), raggiungibile dal bottone su quella stessa pagina (`dashboard/billing/page.tsx:118`).

**Rimedio**: qualificare le etichette («Entrate di cassa» vs «Ricavi di competenza»), o esporre nel report per categoria una riga «di cui acconti» come già fa il pannello Liquidità.

**Test mancanti**: `getCashReport` è interamente mockato in `billing-summary.service.test.ts:30` con una fixture a zeri (`:92`), e `:257` asserisce solo che è un pass-through. `grep -n "Ricariche" cash.service.test.ts` trova solo test CRUD di categoria (`:141`, `:188`, `:310`, `:336`), mai una riga di report.

---

### MINOR-5 — «Pagamenti ricevuti» mostra gli ultimi 50 sotto un KPI che netta tutti, senza dirlo

**Stato**: CONFIRMED (lettura del codice) · **Severità**: MINOR

**File**: `instructor-compensation.service.ts:277-278`, `:335-341`, `:348` · `dashboard/my-compensation/page.tsx:120`, `:141`

```
instructor-compensation.service.ts:278   const OWN_PAYOUT_HISTORY_LIMIT = 50;
instructor-compensation.service.ts:338   take: OWN_PAYOUT_HISTORY_LIMIT,
instructor-compensation.service.ts:348   totalOwedCents: row!.owedTotalCents,   ← da sumPayoutsByProfile(ids, null), non delimitato
```

Il KPI «Residuo dovuto» resta **corretto** (netta tutti i payout di sempre); è la tabella che smette silenziosamente di spiegarlo. L'intestazione dice «Pagamenti ricevuti» e il sottotitolo «storico dei pagamenti ricevuti» (`messages/it.json`, `MyCompensationPage.table.heading`/`sub`) — non «ultimi 50», e la pagina non ha paginazione né una nota «50 di N», a differenza dei ranking (`RankedCapFoot`, «Prime 8 di N») e dello storico tariffe («Mostra tutte (N)»).

**Raggiungibilità**: oltre 50 payout per un istruttore, cioè circa 4 anni di pagamenti mensili o 1 anno di settimanali.

Difetto minore adiacente, stesso sito: l'elenco è ordinato per `createdAt desc` (`:337`) mentre l'accumulo attribuisce i payout per `periodEnd` (`:154`) — un payout retrodatato compare in testa alla tabella ma è nettato nel «Dovuto» di un altro mese.

**Rimedio**: paginare, o dichiarare il taglio come fanno le altre liste tagliate dell'app.

---

### MINOR-6 — La tassa di atterraggio PPR è stornabile in cassa, ma il registro movimenti continua a mostrarla

**Stato**: PLAUSIBILE (solo lettura del codice, non riprodotto) · **Severità**: MINOR

**File**: `ppr.service.ts:660-694` · `cash.service.ts:379-438` · `transactions.service.ts:300-302`, `:320`

Il gemello di cassa della tassa di atterraggio ha `accountMovementId = null` e `reversalOfId = null`, quindi è `actionable: true` nel ledger unificato (`:320`) e `reverseCashMovement` non guarda `pprRequestId` — scelta dichiarata:

> `transactions.service.ts:300-302` — «`pprRequestId` is irrelevant (`reverseCashMovement` never checks it)».

Dopo lo storno la cassa netta a zero, ma `PprRequest.landingFeeCents` resta valorizzato, ed è quello che la colonna «Tariffa» del registro movimenti e i due export PPR leggono (`exports.service.ts:331`, `:742`). Il registro dei transiti e il registro di cassa divergono in modo permanente, senza che nulla lo segnali.

**Rimedio**: o rifiutare lo storno del gemello PPR (come si fa per il gemello di conto), o derivare la colonna «Tariffa» dal movimento di cassa vivo invece che dal campo sul `PprRequest`.

---

### LOW

| # | Finding | File:riga | Stato |
|---|---|---|---|
| LOW-1 | **Il ricavo da snapshot volo e il ricavo da ledger non si riconciliano mai.** `getFlightTotals` (`revenueCents`) e `stats.service.ts` (`fleet[].revenueCents`, `topPilots[].spentCents`) sommano `Flight.aircraftAmountCents`/`instructorAmountCents`; `kpis.revenueCents` sulla stessa pagina viene da `getLedgerRevenueCents`. Una rettifica manuale su un `FLIGHT_CHARGE` (MINOR-2) abbassa la seconda e lascia intatta la prima: le due metà di `/dashboard/reports` divergono per sempre. La divergenza aircraft-only vs aircraft+instructor è invece **dichiarata** e motivata (`stats.service.ts:46-51`, ratifica utente 4). | `flights.service.ts:1721-1735`; `stats.service.ts:183-184` | CONFIRMED |
| LOW-2 | **`availableCents` esclude il secchiello stampato una riga sotto.** `cash + banca − acconti`, senza `unattributedCents` — che il pannello mostra subito dopo come «Non attribuiti (N)». Difendibile come spinta ad attribuirli, ma l'etichetta «Disponibile» non dice che sottostima la cassa esattamente dell'importo scritto sotto. | `billing-summary.service.ts:173`; `billing-panels.tsx:122-137` | CONFIRMED |
| LOW-3 | **`reclassifyCashMovement` è read-then-update senza guardia atomica**: due riclassificazioni concorrenti passano entrambe il controllo `paymentMethod === null` e l'ultima vince, invece del 409 che il pattern `updateMany` guardato di `deactivateCashCategory` (`:168`) otterrebbe. Effetto pratico nullo (l'ultimo valore è comunque valido), ma è l'unico write monetario che non segue la disciplina check-then-write del resto del file. | `cash.service.ts:454-471` | CONFIRMED |
| LOW-4 | **`IdempotencyRecord` non ha TTL né job di pulizia** (128 righe in DB, 0 pending). È dichiarato nello schema («why there is no cleanup job», `handler.ts:82-85`), quindi è debito accettato, non un difetto — lo registro perché la hunt list chiede esplicitamente del TTL. | `schema.prisma:1577-1589` | CONFIRMED |
| LOW-5 | **`getCashReport` casta a `::int` una `SUM`**: oltre 2 147 483 647 centesimi (21 474 836,47 €) per categoria e per periodo Postgres solleva «integer out of range» e la pagina risponde 500 invece di un numero. Irraggiungibile per un'aviosuperficie; la correzione è togliere il cast (`bigint` → `Number` lato JS). | `cash.service.ts:594-596` | CONFIRMED |
| LOW-6 | **La quota associativa è addebitabile a una persona archiviata via API.** `chargeMembershipFee` seleziona solo `{ id: true }` e non guarda `archivedAt`, a differenza di `registerFlight` (`PERSON_ARCHIVED`). Il picker UI esclude gli archiviati (`includeArchived: false`, `dashboard/expiries/page.tsx`), quindi serve una chiamata diretta. Coerente con la scelta «archiviare non nasconde i soldi» per il conto, incoerente con il rinnovo di una scadenza a una persona che non c'è più. | `membership.service.ts:85-88` | CONFIRMED |
| LOW-7 | **`InstructorPayout.periodEnd` non ha limite superiore.** Lo schema Zod vincola solo `amountCents > 0` e `periodStart <= periodEnd`; il servizio non aggiunge nulla. Un payout con periodo futuro entra nella variante `total` (senza limiti, `:93`) e resta fuori da `mtd`/`ytd` (tagliate a oggi, `:91-92`), quindi `owedMtdCents` e `owedTotalCents` divergono dell'intero importo. Il commento del servizio se ne accorge e lo assume via: «a payout's `periodEnd` is always in the past or present **in practice**» (`:83-84`). 0 casi in DB. | `src/lib/schemas/instructor-compensation.ts:90-100`; `instructor-compensation.service.ts:83-93` | CONFIRMED |

---

## 4. Verificato corretto

Questa sezione conta quanto i findings. Ogni voce è stata controllata, non assunta.

**VC-1 — Il saldo non è denormalizzato, e non può esserlo.** `Account` non ha una colonna saldo (`schema.prisma:624-631`, con la scelta motivata nel doc-comment). Tutti e cinque i lettori sono aggregati SQL sul ledger: `accounts.service.ts:153-156` (overview), `:638-642` (pre-movimento, sotto lock), `:740-746` (`groupBy` con `having` per i saldi negativi), `billing-summary.service.ts:130-133` (acconti), `membership.service.ts:103`/`:171` (prima/dopo), `flights.service.ts:976-980` (saldo-prima). **Non esiste percorso che scriva un movimento senza aggiornare il saldo, perché non esiste un saldo da aggiornare.** L'intera classe di difetto della hunt list §2 è chiusa per costruzione. Conseguenza collaterale verificata: l'estratto conto non ha colonna «saldo progressivo» (`AccountStatementItem`, `accounts.service.ts:286-298`), quindi la paginazione non può contraddire un saldo corrente.

**VC-2 — L'append-only è strutturale, non una convenzione.** Censimento completo: 6 siti `accountMovement.create` (`accounts.service.ts:238`, `:645`; `flights.service.ts:1022`, `:1328`, `:1467`; `membership.service.ts:127`), **tutti** dentro un `tx`. 5 siti `cashMovement.create` (`accounts.service.ts:251`; `cash.service.ts:340`, `:414`; `instructor-compensation.service.ts:497`; `ppr.service.ts:682`) — i tre che hanno un compagno sono nella stessa transazione del compagno, i due che non ne hanno scrivono una riga sola. **Zero** `accountMovement.update`, `accountMovement.delete`, `cashMovement.delete` in tutto `src/` (l'unico `cashMovement.update` è `reclassifyCashMovement`, e tocca solo `paymentMethod`).

**VC-3 — Centesimi interi in tutto il dominio, e nessuna IVA.** `grep -E "Float|Decimal" prisma/schema.prisma` → vuoto. Ogni colonna `*Cents` è `Int`. `grep -niE "\bvat\b|\biva\b|imponibile|aliquota"` su `src` e `prisma` → vuoto: non c'è imposta da arrotondare, quindi l'unico arrotondamento del dominio è quello di MINOR-1. `formatCents` solleva `TypeError` su un non-intero (`money.ts:23-25`), cioè fallisce forte invece di stampare centesimi frazionari.

**VC-4 — Lo storno automatico netta esattamente a zero, verificato sui dati.** `0 - originalMovement.amountCents`, mai un ricalcolo (`flights.service.ts:1335`, `:1471`), con la nota sul `-0` che spiega perché non è una negazione unaria (`:1026-1030`). Sonda SQL: **0 coppie** `FLIGHT_CHARGE`/`FLIGHT_CHARGE_REVERSAL` con `r.amountCents + o.amountCents <> 0` su 131 voli, 15 dei quali annullati. L'invariante `charge − reversal = 0` vale su tutti i dati esistenti; l'unico modo per romperlo è la rettifica manuale di MINOR-2.

**VC-5 — Confini di autorizzazione sul denaro: niente da segnalare.** `ROLE_PERMISSIONS` (`rbac.ts:106-112`) dà a INSTRUCTOR `['self.read','bookings.manage.own','bookings.read.names']`, a PILOT `['self.read','bookings.manage.own']`, a STUDENT `['self.read']`. Nessun ruolo non-ADMIN possiede `finance.manage`, `payouts.manage`, `settings.manage` o `flights.manage`. Quindi, alle domande della hunt list §10: **un istruttore non può registrare payout a sé stesso** (`recordPayout` esige `payouts.manage`, `:468`); **un non-admin non può creare rettifiche** (`recordAdjustment` esige `finance.manage`, `:589`); **un pilota non può leggere l'estratto di un altro** (`assertReadAccess`, `:97-103`, confronta `actor.personId` prima di qualunque query, e un id di movimento di un altro conto risponde 404 e non 403 — anti-enumerazione, `:613-615`).

**VC-6 — I due lettori self-service rendono l'IDOR impossibile per costruzione, non per controllo.** `getOwnAccountOverview` e `listOwnAccountMovements` (`accounts.service.ts:417-442`) non hanno un parametro `personId`: leggono `actor.personId` e basta. `getOwnCompensationOverview` risolve il proprio `instructorProfileId` da `getOwnInstructorProfileId(actor)` (`instructor-compensation.service.ts:327`), mai da un id fornito dal client. Non c'è nulla che «viaggi» da sostituire.

**VC-7 — Gli export non possono divergere dalle permission della vista JSON.** Ogni `export<Vista>Xlsx`/`Pdf` rieseque **il servizio di lista esistente** con lo stesso `actor` e gli stessi filtri, sovrascrivendo solo `page`/`pageSize` (`exports.service.ts:155`, `:224`, `:348`, `:374`, `:403`, `:524`, `:597`) — mai un `where` duplicato. Quindi lo scoping own-access e i 403 sono gli stessi per costruzione. E il tetto righe **rifiuta** invece di troncare (`assertWithinCap`, `:75-79`, 422 `EXPORT_TOO_LARGE`): un file mai silenziosamente parziale. La colonna «registrato da» è tolta due volte, nel DTO e nella colonna, per un attore senza `people.read` (`:358`, `:536`).

**VC-8 — Storicizzazione delle tariffe (AD-4) corretta, confine incluso, e a prova di fuso.** `validFrom <= onDate` con `orderBy validFrom desc` (`rates.service.ts:230-234`; `instructor-rates.service.ts:211-215`): il giorno stesso in cui una tariffa entra in vigore usa la nuova, cioè confine **inclusivo**, e i test lo fissano (`rates.service.test.ts:219`; `instructor-rates.service.test.ts:223`). Query tipizzate Prisma su `@db.Date`, mai SQL grezza — la lezione della review 3.5 F1 è rispettata dove conta. Nessuna API di update/delete su nessuna delle due tabelle: **una tariffa non può essere modificata né cancellata mentre è referenziata**, si corregge inserendone una nuova. `getEffectiveRates` (batch, `:253-277`) ha la stessa semantica del singolare via `distinct: ['aircraftId']`. E il volo **congela** tariffa e importi (I5), quindi una tariffa aggiunta o modificata retroattivamente non riscrive nessun volo già registrato — verificato leggendo tutti i writer di `Flight`.

**VC-9 — La regola «lo storno appartiene al libro del suo originale» è corretta per il `FLIGHT_CHARGE`, in entrambi i versi.** Ho verificato a mano i quattro casi: rettifica **positiva** di un addebito volo → clausola 4 di `ACCOUNT_REVENUE_OR` → sommata positiva → **abbassa** i ricavi del mese in cui avviene (giusto); rettifica **negativa** di quella rettifica → clausola 3 → **rialza** i ricavi (giusto); rettifica negativa di una ricarica → esclusa come `DEPOSIT` (giusto); suo storno positivo → escluso con il controllo a due livelli (giusto, ed è il test D2 della mia sonda). L'unico buco è la profondità 3 di MINOR-3, e riguarda solo la catena che parte da un `TOP_UP`.

**VC-10 — Ordinamento dei lock e concorrenza.** `correctFlight` risolve **tutti** gli id `Aircraft` coinvolti e li blocca in una sola `SELECT … WHERE id IN (…) ORDER BY id FOR UPDATE` (`flights.service.ts:1440-1441`), poi fa lo stesso per gli `Account` (`:1457`) — velivoli sempre prima dei conti, stesso ordine macro di `registerFlight` e `cancelFlight`. Due correzioni incrociate concorrenti non possono quindi entrare in un ciclo hold-and-wait. E **ogni** writer a debito prende il lock sul conto (I12), quindi la guardia di saldo insufficiente della quota associativa (`membership.service.ts:108-125`) **non è aggirabile da un debito concorrente**: l'unico writer senza lock è la ricarica, che può solo alzare il saldo, cioè rende la guardia conservativa e mai permissiva. Ho verificato esplicitamente questa catena perché la hunt list §9 la solleva.

**VC-11 — Unicità dello storno difesa a tre strati.** Vincolo DB (`reversalOfId @unique` su entrambi i ledger), pre-check applicativo, e backstop `P2002` mappato allo **stesso** 409 del pre-check a ogni sito di scrittura (`accounts.service.ts:656-663`, `cash.service.ts:432-437`, `flights.service.ts:1343-1352`, `:1479-1487`). In cassa, inoltre: **uno storno non è a sua volta stornabile** (`cash.service.ts:406-408`) e **un gemello automatico non è stornabile dal registro** (`:397-405`), perché conto e cassa divergerebbero. Le categorie di sistema («Ricariche», «Compensi istruttori», «PPR») non sono rinominabili né cancellabili né utilizzabili per movimenti manuali (`cash.service.ts:52`, `:122-127`, `:208-212`, `:333-338`), e una categoria in uso non è cancellabile né via pre-check né via FK `RESTRICT` (`:213-228`).

**VC-12 — La classe di difetto «aggregato su una pagina limitata» è chiusa.** Lo sweep ha controllato tutti i 13 siti `.reduce` di `src/`: **nessuno** somma le righe di un risultato paginato per mostrare un totale, tranne quello di `exportFlightsPdf` — che è protetto dal tetto (VC-7) e il cui difetto è di *scope*, non di *pagina* (MAJOR-5). `getFlightTotals` (una sola `aggregate`, `:1721`), `getLedgerRevenueCents` (due `aggregate`, `:463`, `:476`), `computeDeposits` (un `groupBy` senza `take`, `:130`), `listNegativeBalances` (`groupBy` + `having`, `:740`), `getCompensationSummary` (6 `groupBy` batchati, `:184-191`) e `listAllActiveAircraft` (che pagina fino a `total`, `:133-140`) non hanno limiti. I costanti `OPTIONS_PAGE_SIZE = 100` sopravvissuti (`billing/page.tsx:24`, `expiries/page.tsx:25`) alimentano solo il seed di un `SearchCombobox` che cerca lato server digitando: non delimitano nessuna somma. `ACCOUNT_PAGE_SIZE = 20` e `RECENT_MOVEMENTS_LIMIT = 5` convivono con l'aggregato di VC-1, non lo sostituiscono.

**VC-13 — Una sola definizione di ricavo, condivisa da tutti i lettori.** `getBillingSummary` (`billing-summary.service.ts:164`) e `stats.service.ts` (`:174-179` per la serie, `:179` per il KPI) chiamano entrambi `getLedgerRevenueCents`; il filtro `bookType` della console, la classificazione per riga e gli aggregati dei riquadri condividono le stesse costanti `ACCOUNT_REVENUE_OR`/`CASH_REVENUE_OR`/`CASH_COST_OR` (`transactions.service.ts:130-153`), esportate proprio per non avere una seconda copia. `ledgerClubAmountCents` (`src/lib/schemas/transactions.ts:105-108`) è l'unica regola di split Entrate/Uscite, con quattro consumatori (tabella desktop, card mobile, sheet, export xlsx) e zero copie. La lezione della review Billing-1 F5/F6 è applicata alla radice.

**VC-14 — I pacchetti ore ritirati non lasciano peso morto.** Sonda SQL: **0** righe `HourPackage`, **0** righe `PackageConsumption`. `flights.service.ts` non le legge né le scrive più (dichiarato a `:45-53`), quindi non esiste consumo di pacchetto da ripristinare in uno storno e nessuna delle domande della hunt list §5 (FIFO, scadenza, consumo parziale, gara fra voli concorrenti) ha oggi un soggetto. Le tabelle restano solo come storia.

**VC-15 — Il disegno dell'idempotenza è corretto lato server.** Chiave unica per `[userId, endpoint, key]` (`schema.prisma:1589`), quindi **scopata per attore**; impronta sha256 di metodo+endpoint+params+body (`handler.ts:183-185`) che risponde 422 `IDEMPOTENCY_KEY_MISMATCH` a una chiave riusata con un payload diverso, invece di rigiocare la risposta sbagliata; 409 `IDEMPOTENCY_IN_PROGRESS` su un record ancora pending, senza mai rischiare una seconda esecuzione; e un tentativo fallito **libera** la chiave (`:440-447`). Il gate corre **dopo** la validazione Zod, così una richiesta malformata non brucia la chiave (`:402-407`). Sei form monetari su sette lo usano come documentato (il settimo è MAJOR-6). I due percorsi post-commit che potrebbero liberare la chiave dopo una scrittura già committata sono stati chiusi esplicitamente (fix H3: `accounts.service.ts:668-683`, `flights.service.ts:1154-1167`) — degradano al saldo calcolato in transazione invece di propagare l'errore. `POST /flights/{id}/cancel` e `/correct` non hanno idempotenza di richiesta perché il vincolo `reversalOfId @unique` la fornisce già (`flights/[id]/cancel/route.ts:10`), e ho verificato che il backstop `P2002` è effettivamente presente su entrambi i siti.

---

## 5. Domande per il PO

**DQ-1 — La quota associativa deve essere idempotente per ANNO?** Oggi non c'è nessuna guardia: due addebiti nello stesso anno producono due righe `ADJUSTMENT` con descrizione **identica** (`Quota associativa <anno>`, `membership.service.ts:132`) e una scadenza spinta a **24 mesi** dal pagamento, perché il rinnovo è rotativo (`:151-158`). Nel DB di lavoro esiste già un conto in questo stato (v. MAJOR-6). L'e2e documenta il secondo addebito come «RENEWS rather than creating a duplicate» (`e2e/membership-fee.spec.ts:107`) senza mai controllare l'anno, quindi il comportamento è *testato* ma non *ratificato*. Tre opzioni: (a) rifiutare il secondo addebito dello stesso anno con un 409 dedicato; (b) accettarlo ma renderlo distinguibile nell'estratto conto; (c) confermare che il rollover a 24 mesi è la semantica voluta (chi paga due anni in una volta). Da MAJOR-6 dipende solo il caso accidentale; questa domanda riguarda quello deliberato.

**DQ-2 — Una data valuta futura è lecita?** Se sì, gli aggregati di tesoreria e acconti vanno delimitati a oggi; se no, va rifiutata al bordo Zod come si fa per il volo. Oggi vale la terza combinazione — accettata **e** conteggiata — che è l'unica sbagliata in ogni caso (MAJOR-4). Nota che l'attuale permissività è usata dalle fixture e2e come trucco per ottenere periodi non collidenti, quindi la scelta (b) richiede un ritocco a quelle fixture.

**DQ-3 — «Per categoria» deve riconciliarsi con «Risultato»?** Sono due libri diversi per costruzione (cassa incassata vs ricavo di competenza) e la differenza misurata su agosto è 611,33 € (MINOR-4). Se la risposta è sì, `getCashReport` deve escludere i gemelli di ricarica — ma allora smette di essere un report di cassa. Se è no, servono etichette che lo dicano. Il PDF «Report finanziario» stampa i totali della prima definizione, quindi la decisione ha un effetto su carta.

**DQ-4 — Il registro voli filtrato su «Annullato» deve mostrare totali a zero?** La Ratifica 3 dice «un volo annullato resta visibile in tabella, mai conteggiato nei totali» (`flights.service.ts:1705-1707`), che con `?status=CANCELLED` produce KPI «Voci 0 · Ore 0:00 · Ricavo 0,00 €» e una riga «Totali» a zeri **sopra** fino a 20 righe che mostrano ciascuna un importo reale (`dashboard/logbook/page.tsx:233-237`; `logbook-console.tsx:823`). Il sottotitolo di pagina è autodescrittivo («voci **registrate**»), le etichette dei KPI e la riga Totali no. È coerente con la ratifica, ma si legge come un difetto. (Indipendente da MAJOR-5, che è la stessa riga di codice vista dal lato opposto.)

---

## 6. Residui lasciati su DB e API

**Nessuno.**

- **DB**: solo `SELECT`. Nessun `INSERT`/`UPDATE`/`DELETE`, nessuna migrazione, nessun reset. Le sonde sono state eseguite con `docker compose exec -T postgres psql -U airmanager -d airmanager -Atc "<SELECT …>"`.
- **API**: **nessuna chiamata** a `http://localhost:3000`, quindi nessuna fixture `audit_` creata e nessun login consumato (0 dei 8 disponibili).
- **Processi**: nulla avviato, fermato o riavviato. Nessuna suite e2e eseguita.
- **Repo**: l'unico file scritto è questo report, in `_bmad-output/planning-artifacts/audit-2026-09-10/ledger-audit.md`. Nessun commit.
- **File fuori dal repo** (scratchpad di sessione, `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/ledger-audit/`): `rounding.mjs`, `tz-boundary.probe.test.ts`, `adjustment-chain.probe.test.ts`, `vitest.audit.config.mjs`. Sono usa-e-getta: **non** entrano nel glob di `vitest.config.ts` (`include: ['src/**/*.test.ts']`), quindi non influenzano `npm run gates`. Da promuovere a test veri, se il PO lo vuole, i due `*.probe.test.ts` — sono già discriminanti sul codice attuale.

**Sessione parallela rilevata (non mia)**: durante l'audit sono comparsi nel working tree `prisma/seed-load.ts` (seed di carico, ~70 KB, timestamp 15:39) e la riga `"seed:load"` in `package.json`. **Non li ho creati e non li ho toccati.** Li segnalo per due ragioni: (a) un'altra sessione sta lavorando sulla stessa working dir, quindi un commit epic-level va coordinato; (b) tutte le misure SQL di questo report sono state prese **prima** di quel timestamp, su un DB con 190 movimenti di cassa / 294 di conto / 131 voli — se quel seed di carico viene eseguito, le cifre assolute qui citate cambiano, mentre i difetti che dimostrano restano (sono proprietà delle definizioni, non dei dati).

**Nota di metodo sulle righe pre-esistenti**: i dati che ho citato dal DB di lavoro (6 ricariche datate 2035-2055, un doppio addebito di quota, 15 voli annullati con importo) **c'erano già** — sono residuo di fixture e2e. Non li ho creati e non li ho rimossi. Contano come prova perché sono entrati dalle API reali attraverso gli schemi reali; se il PO vuole ripulirli, va fatto con un reset del DB, che questo audit non era autorizzato a eseguire.
