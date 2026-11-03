---
baseline_commit: e951960
---

# Story 17.4: Statistiche e ledger mensile in SQL, classifiche cappate dal server

Status: **ready-for-dev** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Opus 5 xhigh** (UI + backend: console Statistiche, `RankBars`, elenco completo nuovo, CSS, i18n). Review: Opus 5 xhigh adversarial. **Ordine**: DOPO 16.5 (snapshot dei compensi dentro il `Promise.all` di `getStats`, `stats.service.ts`/`.test.ts`), **16.6b** (sostituisce i self-join `reversalOf` con la colonna `reversalRootType`: la 17.4 va scritta sul predicato della 16.6b) e 16.9 (`reports/page.tsx:57-59`). Il «prima» si misura sullo sha di partenza della 17.4, con le migrazioni 16.x applicate al DB di carico (lo fa la sessione principale). Righe da rileggere su HEAD al momento del dev.

## Story

As an **admin che apre Statistiche e Contabilità**,
I want serie e classifiche calcolate dal database,
so that `stats?period=year` non carichi 20 000 righe di volo (perf F3), i ricavi mensili non siano 26 aggregati con self-join (F8), il registro transazioni abbia gli indici che gli servono (F7), e le classifiche desktop siano cappate per rango come su mobile (ui D4).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.4»; `perf-load-report.md` F3, F7, F8; `ui-review.md` D4; 17.1 Review Record MINOR-1 (causa del P2028); lezione 15.8b (cap per RANGO, mai per posizione DOM).

## Stato su HEAD (misurato il 2026-11-03 su `airmanager_load`)

- **Volumi**: Flight 60 018 (2023-11-04 → 2026-11-02; 18 971 nella finestra della serie a 12 mesi, 17 781 nel 2026); AccountMovement 102 888 (FLIGHT_CHARGE 60 018, TOP_UP 25 000, ADJUSTMENT 14 870 di cui 9 783 negative, PACKAGE_PURCHASE 3 000); **`reversalOfId` = 0 su entrambi i libri** (il seed-load dopo la 19.6 non crea storni: serve un gemello con catene per la parità); CashMovement 29 708; velivoli 1 460 non archiviati (1 378 OPERATIONAL); InstructorProfile 401 (400 con voli Scuola nel 2026); 4 144 piloti volati nel 2026. Sessione Postgres `Etc/UTC`, collation `en_US.utf8`, PG 16.14. I conteggi di `load-testing.md` §1 (60 487 / 104 612) sono vecchi: aggiornarli.
- **Serie ore**: `stats.service.ts:171` legge con `flight.findMany` tutti i voli della finestra (18 971 righe) e raggruppa per mese in JS (`:207-211`). Già fatto: 19.1 ha tolto le query PPR, 19.6 il filtro `status`, 16.1 l'idioma Roma (`currentMonthRef` `:99`).
- **Ricavi**: **non esiste una serie dei costi**; i «24 aggregati» del piano sono 12 × (conto + cassa) dei soli ricavi — serie `:164-169`, KPI `:170`, ognuno via `getLedgerRevenueCents` (`transactions.service.ts:499`) → `computeRevenueCents` (`:457-484`): **26 aggregati per richiesta `year`**, 14 per `month`. I costi esistono solo per il mese di Contabilità (`billing-summary.service.ts:84-94`, chiamata `:165`). Predicati, una definizione sola: `ACCOUNT_REVENUE_OR` `transactions.service.ts:129-138` (riscritto dalla 16.6b), `CASH_REVENUE_OR` `:143-146`, `CASH_COST_OR` `:148-151`, `CASH_NOT_ALREADY_ON_ACCOUNT` `:241-243`, classificatore `accountBookType` `:178-189`.
- **Indici**: AccountMovement solo `@@index([accountId, effectiveDate, createdAt, id])` (`schema.prisma:630`, 19.11) → il conteggio del mese fa seq scan; CashMovement nessun indice su `effectiveDate`; Flight ha `@@index([flightDate])` (`:978`).
- **Classifiche**: il cap della 15.8b esiste solo in CSS ≤ 640 px (`airops.css:3399` `.ranked-rows-capped .ranked-row-overflow{display:none}`, `:3308`; `rank-bars.tsx:81-83,110`; `reports-console.tsx:101` `rankedTopIndexes`, `:137-155` flotta, `:203-229` istruttori; `mobile-reports.ts:20,40,65`); la 15.8b AD-10 aveva deciso «il server non entra in gioco» (`mobile-reports.ts:59`): **questa story ribalta quella scelta**. DOM sul carico: la flotta (1 378 righe) è disegnata **due volte** («Utilizzo flotta» e «Per velivolo»), istruttori 400 righe; `topPilots` già limitato dal server ai primi 10 (`stats.service.ts:255-262`) ma senza totale, e «Spesa» riordina i primi 10 per ore invece di mostrare i 10 che spendono di più.
- **P2028**: `listAllActiveAircraft` (`stats.service.ts:126-133`) chiama fino a 15 volte `listAircraft`, che apre una `$transaction` interattiva (`aircraft.service.ts:137`). Con la flotta classificata dal server `getStats` non ne ha più bisogno (basta un `aircraft.count`, 0,4 ms): **la causa sparisce qui** e la nota di perimetro della 17.5 va aggiornata.
- **Baseline post-17.1** (§C del record 17.1): `api stats year` p50 463 ms (target < 300); `api stats month` 242 ms, burst 0/10; **`api transactions` 59 ms** (target < 150: già sotto, il baseline 210-460 del piano non vale più → AC di non regressione); `page reports` 570 ms, burst **8-10/10 `P2028`**, 16 158 nodi (i byte non sono nella §C; i long task della §C sono inaffidabili, MAJOR-3 della 17.1: rieseguire `render.mjs`).
- **Tempi DB in isolamento** (`EXPLAIN ANALYZE`): ricavi conto un mese 34 ms × 13, cassa 15 ms × 13 (≈ 640 ms di DB per richiesta `year`); raggruppati: conto per mese con CASE 47 ms o per giorno col predicato Prisma 63 ms; cassa 20-26 ms; serie ore per giorno 8 ms; flotta primi 8 con LEFT JOIN 18 ms.
- ⚠️ **La formula del piano `date_trunc('month', … AT TIME ZONE 'Europe/Rome')` è SBAGLIATA su colonne `@db.Date`**: `flightDate`/`effectiveDate` sono già date-only del calendario di Roma; su un `date`, `AT TIME ZONE` passa per un timestamptz nel fuso della sessione (misurato: con `SET LOCAL TIME ZONE 'Pacific/Kiritimati'` il 2026-08-01 cade in `2026-07`; idem Europe/Moscow d'estate). Formule corrette: raggruppamento per giorno, `to_char(col,'YYYY-MM')` o `date_trunc('month', col::timestamp)`.

## Acceptance Criteria

1. **Serie ore**: *Given* `getStats(period, ref)` *When* calcola `series.flightMinutes` *Then* UNA query aggregata su Flight raggruppata sulla colonna date-only (giorno o mese), **senza `AT TIME ZONE`**, e nessun `flight.findMany`. Unit: mesi vuoti a 0, serie a cavallo dell'anno (`ref=2026-02`), una sola chiamata.
2. **Serie ricavi e KPI**: una query per libro (AccountMovement, CashMovement) sull'**unione** di finestra serie e finestra KPI (per `year` 13 mesi, dicembre compreso: il KPI dell'anno include righe future legacy); la classificazione è **lo stesso** predicato del filtro registro (dopo la 16.6b); per richiesta `year` da 26 aggregati a 2; Contabilità ha le stesse cifre di oggi.
3. **Indici**: migrazione forward con `@@index([effectiveDate])` su AccountMovement e CashMovement, senza `CONCURRENTLY` (precedente 19.11), timestamp dopo le migrazioni della 16.5 e della 16.6b, poi `npx prisma generate`; su un gemello la catena da zero è verde e `prisma migrate diff` è vuoto; l'`EXPLAIN` di `transactions?from={MONTH_START}&to={TODAY}` sul DB di carico usa l'indice.
4. **Classifiche dal server**: *Given* le 4 liste (Utilizzo flotta, Per velivolo, Ore istruttori, Per pilota) *Then* la risposta porta i primi **8** per la metrica scelta (pareggi per etichetta crescente, criterio dichiarato una volta) più `total`; a 1280 **e** a 375 il DOM contiene esattamente `min(8, total)` righe per lista e `.ranked-row-overflow` non esiste più; «Mostra tutti» apre l'elenco completo (§PO Q-17.4-b) la cui pagina 2 comincia dalla riga 9 dello stesso ordine; endpoint API paginato (envelope `paginate`) registrato in OpenAPI. Conseguenza visibile già decisa dal piano («come su mobile»): «Per pilota» passa da 10 a 8 righe e il sottotitolo «primi 10» cambia. Metrica «Spesa»: §PO Q-17.4-a.
5. **Utilizzo flotta**: `fleetUtilization` usa il conteggio degli OPERATIONAL non archiviati; unit: `getStats` non chiama mai `listAircraft` e non apre transazioni; `listAllActiveAircraft` (`:108-133`) rimossa se orfana.
6. **Registro transazioni**: `total` resta esatto (lo usano `billing/page.tsx:98-103` per `totalPages` ed `exports.service.ts:401-402` per il tetto); non regressione p50 < 150 ms.
7. **Misure** su `airmanager_load` con `scripts/perf`, pool 10: `api stats year` p50 < 300 ms; `page reports` < 400 KB; burst 10 su `api stats year` **e** su `page reports` con 0 errori; `render.mjs 1280 375` su reports e billing, nodi e KB prima/dopo; numero di query per richiesta prima (26+ aggregati + `findMany` + 15 transazioni) e dopo (≈ 7-8), misurato con il log query di Prisma o la ricetta README §7.
8. **Parità e discriminanza**: zero differenze sulla matrice del §Dev Notes; i mutanti (a)-(d) rendono rossa la parità.
9. **Gate**: `npm run gates` verde; e2e via `scripts/e2e.sh` verde; i18n con parità.

## Tasks / Subtasks

- [ ] Passo 0: misura «prima» (AC 7) sullo sha di partenza, server su porta libera (mai :3000 sotto un arbitro), `PERSON`/`AIRCRAFT` espliciti, `JOBS_SECRET` reale; target nuovi in `targets*.json`: `"burst": true` su `api stats year`, `api stats rankings <lista> p2`, la pagina dell'elenco.
- [ ] Serie ore e ricavi (AC 1, 2) con T1; indici (AC 3).
- [ ] Classifiche server (AC 4, 5) con T3/T4; UI console + `RankBars` + elenco completo; via il cap CSS e gli orfani (`rankedTopIndexes`, `useRankedExpansion` se sparisce l'espansione sul posto).
- [ ] Unit e parità (AC 8) su copia isolata; e2e adeguati; misura «dopo»; aggiornare `load-testing.md` e la nota della 17.5 in `sprint-status.yaml` tramite la sessione principale (segnalarlo nel record).

## Dev Notes

**Decisioni tecniche della sessione principale**:
- **T1** serie e ricavi con `groupBy` Prisma per giorno (`by: ['effectiveDate']` / `['flightDate']`, ≤ ~400 righe) e raggruppamento per mese in JS su stringhe date-only: **una sola definizione** dei predicati (lezione Billing-1 F5/F6), nessun SQL grezzo, nessun rischio di fuso. Se il dev dimostra con la misura che non basta per il target, `$queryRaw` con CASE è ammesso solo con le trappole sotto coperte dai mutanti.
- **T2** il KPI dei ricavi esce dalla stessa query sull'unione delle finestre.
- **T3** classifiche: flotta con `$queryRaw` LEFT JOIN Aircraft→Flight + `ORDER BY` metrica, marca, `LIMIT/OFFSET` (gli aerei mai volati restano nel totale); piloti e istruttori con `ORDER BY` + `COUNT`; le due metriche sono due elenchi di N righe nel DTO.
- **T4** contratto `/stats` cambiato apertamente nella forma `{ total, items }` e dichiarato in OpenAPI.
- **T5** registro transazioni: solo indici, conteggio esatto invariato. **T6** la Panoramica resta alla 17.5 (`dashboard/page.tsx:287` chiama `getStats(month)` solo per `kpis.revenueCents` `:547`: ne beneficia da sola).

**Blast radius**: `stats.service.ts` (serie `:164-171`, flotta `:213-220`, `fleetUtilization` `:226-234`, istruttori `:244-252`, piloti `:255-262`; preservare 422 su `ref` futuro, finestre `rollingMonths`, `owedCents` solo nel periodo corrente + ex istruttori della 16.5); `transactions.service.ts` (lettore mensile accanto a `computeRevenueCents`; i predicati restano la sola definizione); `billing-summary.service.ts:84-94,163-165` solo se si riusa il lettore; `src/lib/schemas/stats.ts:68-108`, `registry.ts:1899-1915` (+ `:305`); `src/app/api/v1/stats/route.ts` + route nuova per le classifiche; `reports/page.tsx:48-51,97-100` (`t.raw` del cap); `reports-console.tsx`, `components/charts/rank-bars.tsx`, `ranked-cap-foot.tsx`; `src/lib/mobile-reports.ts` (+ test); `airops.css:3308,3396-3401`; `messages/{it,en}.json` (`ReportsPage.mobile.capNote`/`showAll`, `rankPilots.sub`); `schema.prisma`; `aircraft.service.ts:575` (doc che cita `getStats`); `scripts/perf/targets*.json` + README. Nuovi: migrazione indici, elenco completo (fuori da `route-registry`, come `people/{id}`: aggiornare la riga «Fuori registry» di CLAUDE.md nello stesso commit), test. Consumatori: `/api/v1/stats` (contratto Flutter, oggi senza client), `/dashboard/reports`, `getLedgerRevenueCents` usato anche da `getBillingSummary` (`billing/page.tsx:91`).

**Test che fissano il comportamento attuale**: `stats.service.test.ts` (mock di `flight.findMany`/`groupBy`; `listAircraft` 2 volte `:235-251`; 7 chiamate a `getLedgerRevenueCents` `:284-294`; chiavi esatte del DTO `:140-144`); `transactions.service.test.ts:538-569` (forma letterale del `where`, Billing-1 F4, da riscrivere) e `:571-628` (casi F3 su mock: non provano il SQL); `billing-summary.service.test.ts:111-158`; `mobile-reports.test.ts` (10 test su `rankedCap`/`rankedTopIndexes`); e2e `reports.spec.ts` (project serializzato `reports`, `playwright.config.ts:92-94`; `:189-252` cerca le righe di fixture in `after.fleet`/`instructors`/`topPilots`: con i primi 8 la fixture da 90 minuti rischia di non entrare → cercarla nell'elenco completo o con delta; `:254-272` 6 e 12 punti della serie); `mobile-reports.spec.ts` (project principale `fullyParallel`: AC 3 `:372-467` «a 1280 ci sono TUTTE», espansione sul posto, «Primi 8 di {total}», `fleet.length` globale; `:469-490`; AC 11 `:552-600` discriminanza sulla regola CSS del cap; AC 9 `:602-617` prefissi `^=`).

**Parità** (script tsx throwaway su **copia isolata**): `getStats` prima/dopo su `period ∈ {month, year}` × `ref ∈ {corrente, −1, gennaio, dicembre dell'anno prima, 2023-11}` + `getBillingSummary` del mese; classifiche contro il vecchio elenco completo ordinato (minuti decrescenti, marca crescente) con totale = vecchia lunghezza; sul DB di carico per il volume **più un gemello con catene costruite** (rettifica di ricarica, storno della rettifica, storni di cassa in entrata e uscita, gemello zero di PACKAGE_PURCHASE, riga futura a dicembre) — `createdb -T airmanager_load` richiede zero connessioni al template; i DB gemelli li crea/cancella la sessione principale se il classifier blocca il subagent. **Mutanti** (solo su copia isolata, sha256 prima/dopo): (a) `<>`/`NOT` al posto di `IS DISTINCT FROM` su `reversalRootType` (le 9 783 rettifiche standalone a debito escono dai ricavi); (b) `AT TIME ZONE` sulla data con sessione `Europe/Moscow`; (c) bind di un `Date` JS invece di testo `::date` (se raw SQL); (d) ordinamento per posizione (le 8 marche prime in ordine alfabetico: lezione 15.8b).

**Trappole**: testid — le famiglie `reports-fleet-row-`, `reports-rank-aircraft-row-`, `reports-rank-pilot-row-`, `reports-instructor-row-` sono lette con `^=` (`mobile-reports.spec.ts:266,389-461,568-613`): le righe dell'elenco completo vanno su un prefisso nuovo; i piedi `mobile-reports-*-cap` sono nomi da superficie solo mobile: se diventano visibili a desktop vanno rinominati (convenzione 15.1). Aggregati globali (`total` 1 378, «la fixture è fra i primi N») nel project `fullyParallel` sono flaky → delta-assert o project serializzato; persone run-unique. Env eager: `stats.service.test.ts:27-42` mocka già `aircraft`, `instructor-compensation`, `transactions`, `app-settings`; ogni import nuovo va mockato (verifica `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`). i18n: «top N» è in `BANNED` (`messages.test.ts:234`) → «primi N»; `capNote`/`showAll` oggi con `t.raw` + `.replace`: se diventano plurali ICU, risolverli con `t()` lato server col totale dal server; «Precedente»/«Successiva». Nessuna transazione interattiva in lettura (direzione 17.5); serie e KPI non sono transazionali fra loro neanche oggi: non aggiungerle. Raw SQL: `SUM` → `bigint` → `Number()`; date legate come testo `::date` (doc `cash.service.ts:603-612`, 19.11 D-4); placeholder di `bench` in UTC (README §8). Collation `en_US.utf8` ≠ `localeCompare` di Node sui pareggi: dichiarare il criterio. I login ripetuti di `bench` fanno scattare il lock anti-brute-force.

**Dimensione**: ~25-30 file, ~+1 200/−600 (sotto la 19.7a). Nessuno split: serie e classifiche convergono su `getStats`, e il burst dipende dalla rimozione di `listAllActiveAircraft`, che nasce dalle classifiche.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.4; `perf-load-report.md` F3/F7/F8; `ui-review.md` D4; `17-1-fondamenta-misura-configurazione.md` §C e Review Record; `15-8b-statistiche-impostazioni-mobile.md` (AD-10, MAJOR cap per rango); `16-6b-quota-rettifiche-catene.md` §R (riga 362: la 17.4 sul predicato della 16.6b)

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Primi 8 anche su computer** (già deciso dal piano, comunicato al PO): «Per pilota» passa da 10 a 8 righe.
- **Q-17.4-a — «Per pilota» con «Spesa»** = A: i primi 8 per spesa (stessa regola di «Per velivolo · Ricavo»), non i primi per ore riordinati.
- **Q-17.4-b — «Mostra tutti»** = A: pagina a parte con l'elenco completo, «Precedente»/«Successiva», stesso periodo e link per tornare alle Statistiche; sul telefono la scheda non si allunga più sul posto.


## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
