---
baseline_commit: e951960
---

# Story 17.3: Saldi negativi aggregati

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Opus 5 xhigh** (card, pagina nuova, link, i18n, misure a 375). Review: Opus 5 xhigh adversarial. **Ordine**: DOPO il commit della 16.5 (tocca `billing/page.tsx:192`, `billing-console.tsx:62`, `:1152`, vicine alla card) e della 16.6a (che vuole `billing-summary.service.ts` byte-identico per tutta la sua durata, e tocca `billing-panels*.tsx:105-114`, `billing/page.tsx:128`, `:150`). Il passo 0 di misura va fatto su quel HEAD; le righe qui sotto vanno rilette.

## Story

As a **tesoriere**,
I want un colpo d'occhio sui saldi in rosso e una lista completa cercabile quando serve,
so that Contabilità e Panoramica non stampino 4 002 righe (perf F2).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.3»; `perf-load-report.md` F2.

## Stato su HEAD (misurato il 2026-11-03)

- **Servizio** `accounts.service.ts:812-872` `listNegativeBalances`: `groupBy` su tutta `AccountMovement` (`having` SUM < 0, `orderBy` SUM asc, **senza `take` e senza secondo criterio di ordinamento**), poi `account.findMany({ id: { in: <tutti gli id> } })`, array semplice; include volutamente gli archiviati (review 3.3 F1, doc `:831-835`). DTO `src/lib/schemas/accounts.ts:238-265` (il doc `:258-262` «la lista resta piccola» è falso). API `src/app/api/v1/accounts/negative-balances/route.ts:1-6` senza query; OpenAPI `registry.ts:9`, `:264`, `:704-716` (path anche in `registry.test.ts:40`, `arrayContaining`). **Nessuna pagina per l'elenco completo**: «Vedi tutte le persone» porta a `/dashboard/pilots` (`billing-console.tsx:1170`), che è alfabetica, non filtra i conti in rosso ed esclude gli archiviati.
- **Già fatto e riusabile**: Billing-2 `5fed728` — `billing-summary.service.ts:128-149` `computeDeposits` calcola già `inRedCount` ed `exposureCents` sullo stesso perimetro, mostrati in «Acconti piloti» (`billing-panels.tsx:144-161`, foglio mobile `billing-panels-mobile.tsx:98-111`) → parità a costo zero. 19.7b `450a0f6` — idioma da copiare: un solo `$queryRaw` paginato con `COUNT(*) OVER ()` e ricerca `ILIKE … ESCAPE` (`expiries.service.ts:448` `escapeLikePattern`, `:563-597`). 19.11 `0556850` — somme `::bigint`, window function, nessuna transazione interattiva (`accounts.service.ts:395-430`); mock di `$queryRaw` già in `accounts.service.test.ts:38`, `:79`, `:318-325`. 15.3 `99d6453` — il feed «Avvisi» mobile consuma la lista in `src/lib/overview-alerts.ts:132-176`.
- **Conteggi su `airmanager_load`**: 4 251 conti (1 senza movimenti); **4 002 in negativo** (203 di persone archiviate, 2 016 con utente); esposizione **940 392 367 cent** (≈ 9,4 M€, 44 % del massimo int4 → `::bigint`); 248 in positivo; 12 gruppi di saldi negativi uguali → serve un secondo criterio di ordinamento; ricerca `ros` = 78 risultati; istruttori attivi 374. Il `groupBy` attuale costa 56 ms; la query unica con window (CTE + JOIN Account/Person + `COUNT(*) OVER()` + `SUM() OVER()` + `ORDER BY bal, p.id LIMIT 20`) **40 ms**: il problema sono payload e DOM, non il DB.
- **Due baseline del piano non valgono più**: (1) **«la Panoramica perde ≥ 600 KB» non è raggiungibile**: in `dashboard/page.tsx` la lista va solo a `buildOverviewAlerts` lato server e `MobileAlertsCard` (server, senza JS) rende al massimo 5 voci (`mobile-alerts-card.tsx:1-15`, `page.tsx:607-616`): le 4 002 righe non arrivano mai nell'HTML (il −650 KB dell'audit era ricavato dai 643 KB dell'API). Il guadagno reale lì è solo lato server (una query da 40 ms invece di `groupBy` + IN-list di 4 002 id). (2) **«Contabilità < 300 KB» è a rischio** (stima dal codice, da verificare al passo 0): il widget «Compensi istruttori» (`billing-console.tsx:1133-1160`, `compensation.map` senza tetto) rende 374 righe (≈ 250-300 KB da solo); le 4 002 righe del saldo ≈ 1,6 MB; dopo il taglio a 20 Contabilità ≈ 0,5 MB. `domInteractive` < 1 s invece sembra raggiungibile (spariscono ≈ 12 000 dei 15 202 elementi). Nessuna misura «prima» valida a 375 px su HEAD (la §C della 17.1 ha solo `page billing` 200 / 441 ms, 0/10 burst, 15 202 nodi a 1280; i 2,1 MB / 4,8 s dell'audit sono con Postgres di fabbrica, `load-testing.md:113-140` «NOT comparable»).

## Acceptance Criteria

1. **Servizio**: *Given* `airmanager_load` *When* le pagine chiedono il riepilogo *Then* UN `$queryRaw`, senza `$transaction` interattiva, restituisce `{ count, exposureCents, top }`; `top` è lungo `min(20, count)`, ordinato per saldo crescente e a parità per `personId`, archiviati inclusi; somme `::bigint` → `Number()`; `count`, `exposureCents`, `top` coincidono con la SQL di controllo; zero conti in rosso → `{0, 0, []}`.
2. **Lista paginata**: pagine da 20 calcolate lato server, stesso ordinamento; ricerca su nome e cognome case-insensitive con `%`/`_` alla lettera (`escapeLikePattern`); totale dichiarato; API con la busta paginata standard AD-8 (`page`, `pageSize` ≤ 100, `q`) sullo stesso servizio paginato del riepilogo (pagina 1, 20, senza `q`); `finance.manage`: 403 dall'API, redirect dalla pagina. Dove si apre: §PO Q-17.3-a.
3. **Contabilità**: *Given* N conti in rosso *When* la pagina rende *Then* il DOM contiene esattamente `min(20, N)` righe `negative-balance-row` (oggi N: test rosso sul pre-fix), il conteggio N e il collegamento all'elenco completo; con N = 0 la card resta nascosta; desktop e mobile restano una sola struttura DOM.
4. **Panoramica**: *Given* il DB di carico *When* apro `/it/dashboard` a 375 *Then* il blocco `mobile-overview-alerts` è identico prima e dopo (stesse 5 voci, stesso «+N», stesso «Vedi tutti» salvo §PO Q-17.3-b); la Panoramica non carica più l'elenco (una query invece di due); p50 di `page overview` nel record **senza obiettivo in KB** (baseline invalida).
5. **Misura** (`scripts/perf`, DB di carico): Contabilità a 375 `domInteractive` < 1 s; HTML < 300 KB oppure l'obiettivo emendato secondo §PO Q-17.3-c; `api negative balances` da ≈ 643 KB a pochi KB; prima/dopo nel Dev Agent Record (regola [I-a]).
6. **Parità aggregati** (e2e nel project serializzato `billing-global`): *Given* ≥ 21 debitori run-unique *Then* la card ha 20 righe; conteggio della card = «Conti in negativo» (`billing-panel-deposits-inred`) = `count` della SQL di controllo; importi delle 20 righe = top 20 della SQL; rosso sul pre-fix.
7. **i18n**: chiavi nuove con parità it/en, plurali ICU per i conteggi (mai `count === 1 ?`, niente `t.raw` sui plurali), glossario («primi N», «Persona», «Successiva», «…»), `BANNED` pulito.
8. **Test e contratto**: unit su forma SQL, conversione BigInt, caso vuoto e `authorize`; `buildOverviewAlerts` riceve il totale (`hiddenCount` += `total − top.length`; invariante: limite 5 ≤ `top.length` 20); OpenAPI aggiornato; `npm run gates` verde; e2e via `scripts/e2e.sh`.

## Tasks / Subtasks

- [ ] Passo 0 su HEAD (dopo 16.5/16.6a): build una volta, `next start -p 3001` (verificare `ss -ltnp`), `PERSON=`/`AIRCRAFT=` espliciti, `bench.mjs targets-hot.json 5 10` anche con `DUMP=1`; nel dump di `page billing` contare `negative-balance-row` (atteso 4 002) e `billing-instructor-compensation-row` (atteso 374) e attribuire i byte; `PAGES=/it/dashboard/billing,/it/dashboard render.mjs 1280 375`; estrarre il blocco `mobile-overview-alerts` per il diff dell'AC 4. **Se il passo 0 conferma i > 300 KB per i Compensi, segnalarlo alla sessione principale prima di procedere** (§PO Q-17.3-c).
- [ ] Lettore paginato unico + riepilogo (AC 1, 2), route, OpenAPI.
- [ ] Card di Contabilità, Panoramica, `overview-alerts`, collegamenti (AC 3, 4); elenco completo secondo §PO.
- [ ] Unit, e2e (AC 6, 8), discriminanze, misura «dopo», Dev Agent Record.

## Dev Notes

**Decisioni tecniche della sessione principale**: un solo lettore paginato (CTE, `COUNT(*) OVER()`, `SUM() OVER()`, ordinamento saldo poi `personId`, `escapeLikePattern`); il riepilogo è la sua pagina 1 da 20 senza `q`. `GET /accounts/negative-balances` passa alla busta paginata AD-8 con `q` (rottura dichiarata nella descrizione OpenAPI; nel repo c'è solo il consumatore perf); nuovo `GET /accounts/negative-balances/summary`. La card mostra conteggio, primi 20 e collegamento (niente esposizione duplicata: c'è già in Acconti). Ricerca su nome e cognome come `expiries`. Pagina server con form GET oppure ricerca con debounce come `pilots-console.tsx:215-228`: la più semplice. Pagina oltre la fine: seconda query di conteggio come in `expiries`, o pagina portata all'ultima come il registro (`billing/page.tsx:96-101`).

**Blast radius**: `accounts.service.ts:812-872` (+ tipo `:812-818`; preservare il doc sugli archiviati, `authorize('finance.manage')`, il saldo come somma mai colonna); `schemas/accounts.ts:238-265`; `registry.ts:9`, `:264`, `:704-716`; route; `billing/page.tsx:9`, `:93`, `:200`, `:216`; `billing-console.tsx:63`, `:109`, `:204`, `:261`, `:1164-1189` (preservare `.billing-negative-card`, `-list`, `-row`: scroller e 44 px `airops.css:3056`, `:3219-3224`, `:3255`, inchiostro `:3643-3644`); `dashboard/page.tsx:22`, `:278`, `:302-307`, `:438`, `:475-481`; `overview-alerts.ts:47-67`, `:99-105`, `:148-173`; `billing-panels.tsx:152-160` e `billing-panels-mobile.tsx:106-110` solo se Q-17.3-b = A; `messages/{it,en}.json` (`BillingPage.negativeBalances`; `empty` oggi passato ma mai reso). Nuovi: pagina dell'elenco (es. `src/app/[locale]/dashboard/billing/negative-balances/page.tsx`; fuori da `route-registry` che usa match esatto `route-registry.ts:177-180` → nessuna voce illuminata, breadcrumb generico, come `people/{id}`: **aggiornare la riga «Fuori registry» di CLAUDE.md nello stesso commit**), eventuale route `summary`, `e2e/negative-balances.spec.ts`, helper SQL di controllo in `e2e/db-fixtures.ts` (pool `pg` esistente). Target perf da aggiungere: `api negative balances q` (`?q=ros`), `page negative balances`, `api negative balances summary` (nessun placeholder nuovo; `bench.mjs:152` estrae `total`: il conteggio del riepilogo apparirà vuoto, solo estetica). Commenti che diventano falsi: `cash.ts:64`, `billing-summary.service.ts:128` (non toccare il file durante la 16.6a), `overview-alerts.ts:8`, `:51`, `:99`, `instructor-compensation.service.ts:35`. Le KPI strip mobile e gli export **non** sono consumatori.

**Test che fissano il comportamento attuale**: `accounts.service.test.ts:1075-1121` (4 test sulla forma del `groupBy`, da riscrivere); `overview-alerts.test.ts:12-153` (`:71-97` cap e «Vedi tutte»); **`account-adjustments.spec.ts:119-130`** (persona run-unique a −250 € deve comparire nella card: col tetto a 20, su un DB dopo la suite con ~61 conti in rosso, è rosso per ordine di esecuzione → **spostarlo sull'elenco completo con ricerca per cognome**); `mobile-ink-targets.spec.ts:463-493` (contrasto e sottolineatura dei link `negative-balance-row`, skip a 0 righe: valido se classi e testid restano); `mobile-billing.spec.ts:946` (esenzione scroller) e `:1040-1063` (riga iniettata, 44 px); `mobile-overview.spec.ts:422-455` (non toccato).

**SQL di controllo** (nel record e nell'helper e2e):
```sql
WITH b AS (SELECT "accountId", SUM("amountCents")::bigint bal FROM "AccountMovement" GROUP BY 1 HAVING SUM("amountCents") < 0)
SELECT count(*), -COALESCE(sum(bal),0) FROM b;   -- top: … JOIN "Account" a ON a.id=b."accountId" JOIN "Person" p ON p.id=a."personId" ORDER BY bal, p.id LIMIT 20
```

**Discriminanze** (rosse sul pre-fix; mutanti solo su copia isolata con sha256): senza `LIMIT` → e2e `billing-global` rosso; senza `HAVING` → il conteggio include i positivi; senza criterio di parità → paginazione API con token run-unique e `pageSize=1` mostra un duplicato o un salto (2 persone con lo stesso saldo); senza totale in `buildOverviewAlerts` → unit su «+N» rosso; unit con 4 002 conti e `top` di 20 → `hiddenCount` = 4 002 − visibili.

**Trappole**: la pagina nuova ha un solo DOM per entrambe le larghezze → niente `-mobile`; testid nuovi col prefisso `negative-balances-`; nessun selettore `^=` tocca `negative-`/`billing-` (verificato). Aggregati globali con uguaglianza solo in `billing-global`; i debitori enormi creati lì scivolano nei project a valle (`mobile-metar` → `mobile-overview-overflow` → …): gli Avvisi mettono i saldi al rango 1, verificare che nessuno di quei test asserisca sulle voci. Mai `Escape` sui pannelli; link scoped al landmark; lock TD-6 dopo ~10 login. Env eager: chi importa `accounts.service` continua a mockare `@/server/adapters/mail` e `templates` (`accounts.service.test.ts:43-50`). i18n: «primi 20», mai «top 20» (`BANNED /\btop\s+\d/`); elenco misto = «Persona» (allievi, istruttori, archiviati); apostrofo davanti a `{` in ICU. Nessuna `$transaction` interattiva nuova (P2028, 17.5). `lastMovementAt` è `createdAt`: resta nel DTO, non mostrarlo in UI. Commit con pathspec: il working tree è condiviso.

**Dimensione**: 22-26 file, ~+800/−150 (≈ 1/3 della 19.7a). Nessuno split.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.3; `perf-load-report.md` F2; `docs/operations/load-testing.md`; `17-1-fondamenta-misura-configurazione.md` §C

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Q-17.3-a — elenco completo** = A: pagina dedicata aperta da Contabilità, ricerca per nome, 20 per pagina, dal saldo più negativo, raggiungibile anche con link diretto; la card mostra conteggio e primi 20.
- **Q-17.3-b — collegamenti** = A: «Vedi tutte le persone» (Saldi negativi), «→ dettaglio» (Acconti piloti, anche nel foglio mobile) e «Vedi tutti» degli Avvisi mobile portano tutti all'elenco completo dei conti in rosso.
- **Q-17.3-c — Contabilità > 300 KB per «Compensi istruttori»** = A (condizionale al passo 0): si accetta la misura ottenuta in questa story e il tetto sui «Compensi istruttori» è rimandato (TD dichiarato nel record).


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
