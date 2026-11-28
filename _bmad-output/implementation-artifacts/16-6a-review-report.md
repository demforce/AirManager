# Review adversariale — Story 16.6a (il ledger non conta domani, e i due libri si dichiarano)

- **Reviewer**: adversarial-reviewer (Opus 5.5), 2026-11-04 11:38 → 12:25.
- **Commit in review**: `a6be2da` (feat) + `76c7eba` (docs) su `dev`, base `f1234e9`. Nessun file di `src`, `messages`, `e2e` o `prisma` modificato nel working tree durante la review (`git status --porcelain` vuoto su quei path).
- **Metodo**: lettura di §R, §R-PO e del Dev Agent Record; revisione statica del diff (24 file, +372/−29); censimento AC 6 rifatto da zero su HEAD; unit, typecheck e lint rieseguiti; 9 mutanti propri su una copia isolata; arbitro e2e completo sul DB fresco; poi sonde API/DB/UI con fixture run-unique su un server di produzione a :3100 (build dell'arbitro, `JOBS_SECRET` non segnaposto). Le sonde sono script `playwright-core` + `pg` nello scratchpad della sessione: `probe-api.mjs`, `probe-ui.mjs`, `probe-head.mjs`; output in `probe-api.out` e `probe-ui.out`, screenshot in `shots/`. Server :3100 spento a fine sonda, porte 3000/3100 libere.

## Verdetto: **SHIPPABLE-WITH-FIXES**

Nessun difetto nel codice di produzione. La guardia fa quello che §R e R-16-h chiedono, verificato sulla catena reale:
- **422 `EFFECTIVE_DATE_IN_FUTURE`** con `details.effectiveDate` sulle tre rotte (top-ups, cash-movements, transactions `TOP_UP`/`CASH`);
- bordo **inclusivo** e calendario **Roma**;
- 403, 404 e 409 vincono sul 422;
- un 422 **libera** l'`Idempotency-Key`;
- le corse non scrivono nulla;
- dopo l'arbitro e le sonde, **0** righe di ledger datate dopo oggi in tutto il DB.

Le etichette ratificate dal PO sono a posto su desktop e sul foglio mobile a 375 e 320 px. «Ultimi 50 di N» compare una volta sola e solo quando serve. Le parti OBSOLETE non sono state implementate e `billing-summary.service.ts` è byte-identico.

Restano tre findings **Low**, tutti in test o documenti, da chiudere nel commit di fix della review (stima: meno di mezz'ora in totale):
- **F1**: la banda di isolamento e2e si è ristretta di 4,5 volte e il commento promette un isolamento che non c'è;
- **F2**: il ramo d'errore nel pannello Piloti non ha nessun test;
- **F3**: il glossario non registra i due termini ratificati.

Poi due Info e un rilievo preesistente (contrasto e maiuscolo dei messaggi d'errore), che è la sostanza della domanda PO n. 1.

## Arbitro e2e

| | |
|---|---|
| Comando | `export JOBS_SECRET=<non segnaposto>; scripts/e2e.sh start`: suite completa `CI=1`, build di produzione dentro il run, HEAD `76c7eba`, DB `airmanager` appena resettato dalla sessione principale (verificato prima del lancio: 4 utenti, 0 prenotazioni, 0 `LoginAttempt`) |
| Finestra | 11:40:20 → 12:04:15 (2026-11-04) |
| Esito | **605 passed + 8 flaky · 0 failed · 0 skipped · `E2E_EXIT=0`** (24,1 min) |
| Conteggio | `npx playwright test --list` → **613 test in 69 file** = 610 di baseline + 3 nuovi. Coincide con il conteggio del dev (610 + 1 flaky + 2 skipped = 613). Su DB fresco i 2 skip del dev (`mobile-billing.spec.ts:352`, `:526`) girano e passano: la sua spiegazione (movimento «non attribuito» già consumato da un run mirato precedente) è confermata |
| Log | `/tmp/airmanager-e2e/last-run.log` (copia: `<scratchpad>/arbiter-16-6a.log`) |

I **8 flaky** sono tutti verdi al retry e appartengono alle due classi d'infrastruttura note. Nessuno tocca un'asserzione della story.
- **ECONNRESET / socket hang up** in una POST di setup (4): `bookings.spec.ts:602`, `mobile-billing.spec.ts:678` (alla `createCategory`, riga 83), `mobile-registries.spec.ts:903`, `person-save.spec.ts:107`.
- **Login-timeout** (`toHaveURL(/dashboard$/)` scaduto a 5 s, ancora su `/it/login`), 4 test: `flight-no-charge.spec.ts:178`, `flight-requirements.spec.ts:140`, `person-save.spec.ts:295` e `:335`. Gli ultimi due sono andati rossi due volte e verdi al retry #2.
- Non è il lock anti-brute-force: dopo l'arbitro, `SELECT identifier, count(*), sum(CASE WHEN succeeded THEN 0 ELSE 1 END) FROM "LoginAttempt" GROUP BY 1` dà admin 600 tentativi / **0 falliti** e pilot 72 / 0. Sono risposte lente del server sotto carico, non rifiuti.

Lo spec mirato rosso che il dev cita (`mobile-billing.spec.ts:1096`, run mirato su DB parziale) è verde nell'arbitro.

## Gate e test unit

- `npx vitest run` (repo): **2250/2250** (baseline 2242, +8). Coincide con il dev.
- Senza env esportato (`env -i PATH HOME npx vitest run` sui 6 file toccati, `messages.test.ts` compreso): 351/351. La nuova dipendenza `accounts.service → cash.service` non trascina `@/lib/env`: `cash.service.ts` non importa `mail`.
- `npx tsc --noEmit`: exit 0. `npx eslint`: exit 0, 0 errori. Fra i file toccati, l'unico warning è preesistente (`transactions.service.test.ts:47`, fuori dal diff).
- **Build**: non rieseguita in place per non riscrivere il `.next` condiviso. L'ha fatta l'arbitro alle 11:40 sullo stesso HEAD (`BUILD_ID` `AJli_VnIuB7KTXl1pQJjk`), e quel build è servito alle sonde.
- **9 mutanti propri** su una copia isolata (`<scratchpad>/iso`: `cp -r src messages` + config, `node_modules` in symlink). Dopo ogni mutante, ripristino con `sha256sum -c`; alla fine `sha256sum -c` su tutto `src`+`messages` della copia contro il repo: identico. Nessun mutante è stato applicato al repo.

| # | Mutante | Esito |
|---|---|---|
| R1 | bordo esclusivo (`>=`) | **2 failed** (00:30 Roma; «records today») |
| R2 | «oggi» UTC invece di Roma | **1 failed** (00:30 Roma del 15 gennaio) |
| R3 | `details` rimosso | **3 failed** |
| R4 | codice generico `VALIDATION_ERROR` | **3 failed** |
| R5 | chiamata rimossa da `recordTopUp` | **1 failed** («expected error to be instance of ValidationError») |
| R6 | `count()` su tutti i profili | **1 failed** («expected vi.fn() to be called with arguments …») |
| R7 | `payoutsTotal: payouts.length` | **1 failed** («expected 50 to be 73») |
| R8 | guardia spostata PRIMA della lettura della categoria in `recordCashMovement` (il 422 vincerebbe su 404/409) | **sopravvive**: 77/77 verdi. V. Info I-1 |
| R9 | stesso spostamento in `recordTopUp` | non applicato: pattern ambiguo, 3 occorrenze. R8 basta a mostrare che l'ordine non è fissato da nessun test |

Le discriminanze dichiarate dal dev (M0-M6) sono coerenti con R1-R7.

## Verifiche empiriche (sonde su :3100, DB dopo l'arbitro)

### API e DB (`probe-api.out`)

Data della sonda: oggi Roma = 2026-11-04, domani = 2026-11-05.

| Sonda | Esito |
|---|---|
| A1: top-up con domani | `422 {"code":"EFFECTIVE_DATE_IN_FUTURE","message":"effectiveDate cannot be in the future.","details":{"effectiveDate":"2026-11-05"}}` |
| A2: top-up con `9999-12-31` | 422, stesso codice |
| A3: persona inesistente + domani | **404** `NOT_FOUND`: lo stato vince sull'input |
| A4: `2026-02-30` | 422 `VALIDATION_ERROR` di Zod (`fieldErrors.effectiveDate`): il controllo del calendario resta allo schema |
| A5: oggi | **200**, bordo inclusivo |
| A6: `2003-03-03` | 200, nessun bordo inferiore |
| A7: top-up con `Idempotency-Key` + domani | 422 |
| B1/B4: cassa, entrata e uscita con domani | 422 |
| B2: categoria di sistema «Ricariche» + domani | **409**: vince sul 422 |
| B3: categoria disattivata + domani | **409** |
| B5: cassa con oggi | 201 |
| C1: `POST /transactions` `TOP_UP` con domani, chiave K1 | 422 |
| C2: **stessa chiave K1**, `TOP_UP` con oggi | **201**: il 422 ha liberato il record (`freeIdempotencyRecord`), nessun `IDEMPOTENCY_KEY_MISMATCH` |
| C3: K1 con lo stesso body | 201 `Idempotency-Replayed: true` |
| C4: `CASH` con domani | 422 |
| C5/C6: `ADJUSTMENT`, anche con un `effectiveDate` futuro in più nel body | 201: il ramo non ha data, il campo in più viene scartato da Zod |
| D1: 8 top-up concorrenti con domani sulla stessa chiave | `422,409,409,422,409,409,422,422` (409 = `IDEMPOTENCY_IN_PROGRESS`), nessuna riga scritta |
| D2: 8 movimenti di cassa concorrenti con domani su chiavi distinte | 8 × 422, nessuna riga scritta |
| E: RBAC con domani | pilota, istruttore e allievo: `403/FORBIDDEN` su top-up (sul proprio conto), cassa e transactions. Mai il 422, quindi nessuna informazione trapela. Anonimo: 401 |
| F1/F2: righe della persona e della categoria di sonda | solo quelle datate oggi o `2003-03-03` |
| F3: righe di ledger datate dopo oggi Roma, **tutto il DB** | `AccountMovement` **0**, `CashMovement` **0** (dopo l'intera suite e le sonde) |

### UI (`probe-ui.out`, `probe-head.mjs`, `shots/`)

- **Contabilità desktop.**
  - A 1280, IT/EN: titolo «**Cassa per categoria**» / «**Cash by category**»; nel Risultato «**Ricavi maturati** 7.236,84 €» / «**Earned revenue** €7,236.84». «Costi» invariato.
  - A 1024 e 768: la riga Ricavi alta 18 px, come quella di Costi; nessun overflow orizzontale.
- **Foglio mobile «Risultato».**
  - A 375 e 320, IT/EN: «RICAVI MATURATI» 99×15 px, su una riga, come «COSTI». La riga è larga 341 px (375) e 286 px (320). `scrollWidth == clientWidth`.
  - Le misure del dev (99 px, 341, 286) sono confermate.
- **«Cassa per categoria» a 320 px IT.** La `card-head` passa da **49 a 73 px**: il mese va a capo sotto il titolo. Con il titolo pre-story «Per categoria» resta a 49; a 360/375 e in EN a 320 resta a 49. È il wrap sanzionato di `.card-head` (`flex-wrap`): nessun taglio, nessun overflow (`shots/u3-bycat-head-it-320.png`). Non è dichiarato nel Dev Agent Record. V. Info I-2.
- **Piloti, pannello «Registra ricarica», con domani.** «LA DATA VALUTA NON PUÒ ESSERE NEL FUTURO.» / «THE VALUE DATE CANNOT BE IN THE FUTURE.», con `text-transform: uppercase`, JetBrains Mono 10,5 px, colore `--bad` = rgb(222,78,75) su bianco, cioè **3,96:1** (`shots/u4-pilots-topup-it.png`).
- **Scheda persona, form ricarica, con domani.** «La data valuta non può essere nel futuro.» in `.fld-error`, Inter Tight 12 px, rosso scuro (`shots/u5-scheda-topup-*.png`).
- **«Nuova transazione», ramo Pagamento (`TOP_UP`), con domani.** «La data non può essere nel futuro.» / «The date cannot be in the future.», 13 px, `--bad`, **3,96:1** (`shots/u6-newtx-payment-it.png`). Il ramo `TOP_UP` del form non è coperto da e2e (lo è quello `CASH`), ma passa per la stessa riga di codice (`transaction-editor.tsx:196`): verificato qui.
- Dopo i 6 tentativi rifiutati dalla UI (3 form × 2 lingue), il saldo della persona di sonda è **0**.
- **«I miei compensi».** Istruttore run-unique con login via invito su Mailpit, 1 234 compensi da SQL (periodo 2020-01-15):
  - una sola `my-compensation-payouts-cap` a 1280, 375 e 320, IT/EN: «Ultimi 50 di 1234» / «Latest 50 of 1234»;
  - 50 righe desktop e 50 card mobile; «Residuo dovuto» −1.234,00 € (il netto di tutti);
  - nota sulla riga del titolo a 1280 e 375, sotto il titolo a 320; nessun overflow.
  - Il numero non è formattato («1234» accanto a «−1.234,00 €»): è il comportamento di ogni `{total}` dell'app (`BillingPage.table.shown`) e irraggiungibile in pratica (massimo 10 compensi per profilo sul DB di carico). Non è un finding.

### Censimento AC 6 (rifatto su HEAD)

Le scritture del ledger in `src` (`grep -rnE "(accountMovement|cashMovement)\.(create|createMany|upsert|update|updateMany)\b" src`, esclusi i test e il codice generato) sono **10**.

Prendono la data dall'utente solo **tre**, tutte guardate:
- `accounts.service.ts:244` e `:257` (`recordTopUp`, ricarica e gemello), guardia a `:232`;
- `cash.service.ts:402` (`recordCashMovement`), guardia a `:400`.

Le altre derivano la data dal server o dal volo:
- `accounts.service.ts:756`, rettifica: oggi Roma (`:762`);
- `membership.service.ts:127`, quota: `today`;
- `cash.service.ts:477`, storno di cassa: oggi Roma (`:488`);
- `instructor-compensation.service.ts:616`, gemello del compenso: oggi Roma (`:599`);
- `flights.service.ts:985`, `FLIGHT_CHARGE`, e `:1335`, riscrittura in `updateFlight`: `flightDate`, limitata da `FLIGHT_DATE_IN_FUTURE` (`:616-618`) dentro `resolveFlightInput`, che `updateFlight` chiama (`:1273`);
- `cash.service.ts:527` (`reclassifyCashMovement`): tocca solo `paymentMethod`, mai la data.

Nessuna rotta raggiunge `recordTopUp`/`recordCashMovement` senza passare dalla guardia (chiamanti: le due rotte e `transactions.service.ts:525/542`). Nessun percorso di deroga: `grep -rn "EFFECTIVE_DATE" src` trova solo la guardia, i tre form, la registry e i test.

### Parti OBSOLETE (§R): non implementate

Byte-identici a `f1234e9` (sha256):
- `billing-summary.service.ts` `d36789d3…`;
- `exports.service.ts`, `exports.service.test.ts`, `flights.service.ts`;
- `logbook/page.tsx`, `logbook-console.tsx`;
- `transactions.service.ts` (quindi anche `computeRevenueCents`), `membership.service.ts`, `src/lib/api/handler.ts`;
- `prisma/schema.prisma` `db18706e…`.

Nessuna migrazione. Nessuna chiave `LogbookPage.*Registered`. Nessuna modifica a `CashReportPage` o al PDF.

## Findings

### F1 — Low (igiene e2e): la banda di isolamento di `billing.spec.ts` si è ristretta di 4,5 volte, e il commento promette un isolamento su DB sporco che non c'è

- **Dove**: `e2e/billing.spec.ts:26-43` (`dateAt`/`uniqueDatePair`).
- **Fatto**:
  - `uniqueDatePair` pesca fra **2 000** giorni (2004-07-10 … 2009-12-31; il commento dice «2004-06»). Prima della story pescava fra **9 000**.
  - Sei dei sette test filtrano il libro **globale** per data e asseriscono conteggi esatti: `:181` `toHaveCount(2)`, `:199`, `:216`, `:234`, `:251`, `:419`. Due test che pescano lo stesso giorno si vedono a vicenda e uno dei due va rosso.
  - Il commento promette «a re-run against a dirty DB does not collide», ma non è vero.
- **Misura** (simulazione Monte Carlo dei 7 call-site, 10⁵ run):

| | Banda pre-story (9 000 giorni) | Banda attuale (2 000 giorni) |
|---|---|---|
| DB fresco | 0,32 % | **1,38 %** |
| Dopo 5 run sullo stesso DB | 3,3 % | **14,1 %** |
| Dopo 15 run sullo stesso DB | 9,2 % | **35,2 %** |

- **Conseguenza reale**:
  - con `CI=1` i retry ripescano la data, quindi il risultato è un *flaky*, non un rosso;
  - nei cicli dev/review su DB riusato (`E2E_REUSE_SERVER=1`), dopo qualche run diventa una flake ricorrente, in un file che misura proprio il libro globale.
- **Causa**: §R prescriveva «2 000 giorni». Il dev l'ha seguito alla lettera.
- **Fix proposto** (diff minimo):
  - allargare la banda a tutto lo spazio libero sopra `SAFE_OPENING_DATE = '2000-01-01'` (`e2e/treasury-settings.spec.ts:52`, «no e2e fixture … is dated before this»), cioè `Math.random() * 3_650` da `2009-12-31` (2000-01-02 … 2009-12-31): ≈ 0,75 % su DB fresco;
  - correggere il commento: niente promessa sul DB sporco, banda esatta.
  - L'isolamento vero (un filtro run-unique in più nei 6 test) cambierebbe la semantica di `:181` (dedup sul libro globale): non lo propongo in questa story.

### F2 — Low (copertura): il ramo `EFFECTIVE_DATE_IN_FUTURE` del pannello Piloti non ha nessun test

- **Dove**: `src/app/[locale]/dashboard/pilots/pilots-console.tsx:816-817` (ramo), `pilots/page.tsx:184` (cablaggio dell'etichetta), `messages/*.json` `PilotsPage.topUp.futureDateError`.
- **Prova**: `grep -rn "topup-form-error\|futureDateError" e2e src --include=*.test.ts` → **0** riferimenti.
  - L'e2e della ricarica usa il form della **scheda** (`accounts-topups.spec.ts:174-178`). Quello della cassa usa «Nuova transazione» (`cash-register.spec.ts:169-178`).
  - Riportare la riga 817 a `setFormError(labels.genericError)`, o togliere la chiave da `page.tsx`, passa unit, gate ed e2e.
  - Il comportamento oggi è giusto (sonda U4, e la verifica a mano del dev): manca solo il test.
- **Fix proposto**: un blocco nel test nuovo di `accounts-topups.spec.ts`, che già ha la persona run-unique e la data di domani.
  - Aprire `/it/dashboard/pilots?q=<cognome>`, cliccare `pilot-topup-<id>`, compilare con domani e asserire `getByTestId('topup-form-error')` con `toHaveText('La data valuta non può essere nel futuro.')`. `toHaveText` legge `textContent` (senza `useInnerText`), quindi il maiuscolo applicato dal CSS non conta.
  - Va verificato rosso col ramo rimosso, su una copia isolata.

### F3 — Low (documentazione): il glossario non registra i due termini che il PO ha ratificato

- **Dove**: `docs/i18n/glossario-it.md`, tabella «Termini».
- **Fatto**:
  - D-d dice che il glossario «non ha righe di termini contabili (c'è solo «Contabilità»)». In realtà la tabella ne ha almeno tre: «Conto personale» `:13`, «Contabilità» `:27`, «Ricarica» `:28`.
  - §R-PO chiedeva di aggiungere i due termini «se la tabella dei termini contabili li prevede». Li prevede.
- **Perché conta**:
  - la domanda PO n. 2 mostra che lo **stesso numero** (`getLedgerRevenueCents`) ha ora tre nomi in tre pagine: «Ricavi maturati» in Contabilità, «Ricavi del mese» in Panoramica, «Ricavi» in Statistiche;
  - senza una riga di glossario la scelta del PO non sopravvive alla prossima copy.
- **Fix proposto**: una riga, per esempio:
  - concetto «Ricavi del Risultato (competenza: voli addebitati, quote, rettifiche, entrate di cassa non da ricarica) vs entrate di cassa per categoria (ricariche comprese)»;
  - termini **«Ricavi maturati»**, **«Cassa per categoria»**;
  - fonte «PO Q-16.6a-a»;
  - con la decisione della domanda 2 quando arriva.

### Info I-1: l'ordine degli errori dichiarato dal dev non è fissato da nessun test

L'ordine «stato prima dell'input» (403 → 404 → 409 → 422) è corretto sul filo: sonde A3, B2, B3. Ma il mutante R8 (guardia spostata prima della lettura della categoria) sopravvive a tutti i 77 test di `cash.service.test.ts`. Un test unit di due righe (categoria di sistema + domani → `ConflictError`) lo fisserebbe. Non è richiesto dagli AC: va deciso dal fix commit.

### Info I-2: la testata di «Cassa per categoria» va su due righe a 320 px in italiano

Da 49 a 73 px, con il mese sotto il titolo. È il wrap previsto da `.card-head` e non taglia nulla, ma il Dev Agent Record misura solo «Ricavi maturati» e la nota dei compensi, non questa testata. Basta dichiararlo.

### Info I-3: igiene degli aggregati globali sotto `fullyParallel` (rischio preesistente, ora più frequente)

I due e2e nuovi scrivono movimenti datati **oggi** nei libri globali durante la fase parallela:
- `accounts-topups.spec.ts:183`: ricarica `CASH` da 100 €, sul conto di una persona nuova, quindi Acconti +100 € e cassa +100 €;
- `cash-register.spec.ts:181`: entrata di cassa da 50 €, che conta nei **Ricavi maturati** del mese (`CASH_REVENUE_OR`) e in «Cassa per categoria».

Il test dei tre riquadri (`billing.spec.ts:303`) asserisce delta su revenue/cost/net/bank/deposits in una finestra che contiene tre scritture e un reload. Se una delle due scritture nuove cade in quella finestra, il delta è sbagliato e il test fallisce.

La classe esisteva già: `billing.spec.ts` «Nuova transazione», `cash-report.spec.ts:59` e `mobile-billing.spec.ts:92/100` scrivono anch'essi «oggi». La story aggiunge due scrittori; la scrittura «oggi» è intrinseca alla prova del bordo inclusivo. Nell'arbitro il test è verde. Nessuna azione richiesta in questa story; resta un argomento in più per portare il test dei riquadri nella catena serializzata, se in futuro flakka.

### Preesistente, da rimandare (sostanza della domanda PO n. 1): messaggi d'errore sotto il contrasto AA e in maiuscolo

- Il pannello Piloti (`pilots-console.tsx:850`, `fld-label` + `color: var(--bad)` inline) e «Nuova transazione» (`transaction-editor.tsx:369`, `var(--bad)` inline a 13 px) mostrano il messaggio a **3,96:1** su bianco: sotto la soglia WCAG AA di 4,5:1 per testo normale.
- Il pannello Piloti in più lo mostra **in maiuscolo mono da 10,5 px**.
- La scheda persona usa `.fld-error`: rosso scuro, il commento `account-section.tsx:920-923` lo misura 9,82:1.
- Lo stesso idioma `fld-label` + `--bad` sta in **11 punti**: `instructor-editor.tsx:265,482`, `aircraft-editor.tsx:627`, `expiry-editor.tsx:212`, `instructors-console.tsx:687,881`, `pilot-editor.tsx:330,541,1168,1318`, `pilots-console.tsx:850`.
- È preesistente: `genericError` era già reso così, e AD-12 imponeva di aggiungere un ramo senza rifattorizzare. Quindi non è un difetto della story, ma la story ci fa passare un messaggio che l'utente deve poter leggere.

## Risposte del reviewer alle 3 domande del dev per il PO (con le prove)

1. **Errori in maiuscolo nel pannello «Registra ricarica» di Piloti.**
   - **Parere: sì, una story piccola, e più larga di quanto chiesto.** Non è solo il maiuscolo: quel testo è anche sotto il contrasto minimo (3,96:1, v. sopra).
   - Lo stesso vale per il messaggio di «Nuova transazione» in Contabilità, che è in minuscolo ma dello stesso rosso chiaro.
   - Allineare gli 11 punti più `transaction-editor.tsx:369` sullo stile `.fld-error` della scheda persona è una modifica di classe CSS per punto, senza testo nuovo.
2. **«Ricavi» in Panoramica e Statistiche.**
   - **Fatto**: è lo stesso numero, dalla stessa funzione (`transactions.service.ts#getLedgerRevenueCents`, usata da `stats.service.ts:170/173` per Panoramica `dashboard/page.tsx:547` e Statistiche `reports/page.tsx:135`).
   - **Parere: allinearle, ma non è urgente.** Il motivo dell'etichetta nuova, cioè due libri affiancati, lì non c'è, quindi nessuno oggi legge male quelle pagine. Però un numero con tre nomi è il tipo di incoerenza che il glossario esiste per evitare (F3).
   - In Statistiche è un cambio di due stringhe (KPI e titolo del grafico). In Panoramica, «Ricavi maturati del mese» va misurato nella tessera KPI a 320 px prima di adottarlo.
3. **Compenso per un periodo non ancora concluso.**
   - **Fatto**: lo schema controlla solo `periodStart ≤ periodEnd` (`schemas/instructor-compensation.ts:105`). Il movimento di cassa è datato **oggi** (`instructor-compensation.service.ts:599`), quindi la liquidità non mente.
   - Il compenso viene attribuito al mese della **fine del periodo** (`sumPayoutsByProfile`, `:197-208`). Effetto visibile: un anticipo per dicembre registrato a novembre abbassa subito il «Residuo dovuto», non tocca il «Dovuto nel mese» di novembre, e a dicembre farà comparire il «Dovuto nel mese» in negativo finché i voli non lo coprono.
   - **Parere: lasciarlo permesso.** Gli anticipi sono una pratica normale, l'integrità del ledger non è in gioco e l'effetto è solo di lettura.

## Domande per il PO (in italiano semplice, quello che l'utente vede)

1. Nel pannello «Registra ricarica» della pagina Piloti, e in «Nuova transazione» della Contabilità, i messaggi d'errore (per esempio «La data valuta non può essere nel futuro.») sono in un rosso chiaro che si legge male; in Piloti sono anche tutti in MAIUSCOLO piccolo. Nella scheda della persona lo stesso messaggio è in un rosso scuro, normale e leggibile. **Vuoi una story piccola che porti tutti i messaggi d'errore dei pannelli laterali allo stile della scheda persona?** Il consiglio è sì.
2. In Contabilità il numero dei ricavi del mese ora si chiama «Ricavi maturati». Lo stesso identico numero in Panoramica si chiama «Ricavi del mese» e in Statistiche «Ricavi». **Vuoi che si chiami «Ricavi maturati» dappertutto, o va bene così perché in quelle pagine non c'è la cassa accanto?** Il consiglio è allinearle, senza urgenza.
3. Oggi si può pagare un istruttore in anticipo, per un periodo che non è ancora finito (per esempio dicembre, pagato a novembre). I soldi escono dalla cassa nel giorno in cui li registri, quindi la liquidità resta giusta. L'istruttore però vedrà quel pagamento nel mese di dicembre, e a dicembre il suo «Dovuto nel mese» partirà in negativo finché non vola. **Va bene lasciarlo possibile?** Il consiglio è sì.

## Riepilogo per il commit di fix

| Finding | Severità | Azione | Dove |
|---|---|---|---|
| F1 | Low | banda a 3 650 giorni (2000-01-02 … 2009-12-31) e commento corretto (banda esatta, nessuna promessa sul DB sporco) | `e2e/billing.spec.ts:26-43` |
| F2 | Low | blocco e2e sul pannello Piloti con domani → `topup-form-error`; provarlo rosso col ramo rimosso su copia isolata | `e2e/accounts-topups.spec.ts` (test nuovo) |
| F3 | Low | riga di glossario «Ricavi maturati» / «Cassa per categoria» (PO Q-16.6a-a) | `docs/i18n/glossario-it.md` |
| I-1 | Info | facoltativo: unit «categoria di sistema + domani → 409» | `cash.service.test.ts` |
| I-2 | Info | dichiarare il wrap a 320 px nel Record | file story |
| I-3 | Info | nessuna | — |
| Contrasto/maiuscolo | preesistente | story piccola se il PO dice sì (domanda 1) | 11 punti + `transaction-editor.tsx:369` |
