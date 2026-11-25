---
baseline_commit: e951960
---

# Story 17.5: Letture senza transazione interattiva, Panoramica con meno query

Status: **review** — 2026-11-03 (file creato dalla sessione principale con `bmad-create-story`, ricognizione in sola lettura su `e951960`). **Dev: Sonnet 5 xhigh** (backend puro: `dashboard/page.tsx` cambia solo nella lettura dei dati, vincolo zero differenze di markup; se il dev deve toccare il JSX → Opus). Review: Opus 5 xhigh adversarial. **Ordine (decisione della sessione principale, è quello del piano)**: dopo 17.2 → 17.3 → 17.4 (l'AC del `Promise.all` dice «dopo 17.2-17.4»; i 3 s di Contabilità e Statistiche dipendono da 17.3 e 17.4; la 17.4 elimina `listAllActiveAircraft`, causa del P2028 di `stats?period=year`). Tutte le righe vanno rilette su HEAD al momento del dev.

## Story

As a **gruppo di dieci admin che aprono la Panoramica insieme**,
I want che il pool non si esaurisca,
so that non compaia più `P2028` a 10 richieste concorrenti (perf F4).

Fonte: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.5»; `perf-load-report.md` F4; **perimetro esteso dalla 17.1** (decisione PO A, 2026-09-27, in `sprint-status.yaml`): la transazione interattiva di `listAircraft`, raggiunta ~15 volte per richiesta da `listAllActiveAircraft`, causa il residuo P2028; decidere qui `DATABASE_POOL_MAX` col fattore 2× (due pool per processo) e il vincolo shm misurato (~20 MB per query parallela concorrente). `17-1-review-report.md:122/134`, `:404-410`.

## Stato su HEAD (misurato il 2026-11-03)

**Censimento delle `$transaction` di produzione**: 35 chiamate in 17 file (34 interattive + 1 batch).

Letture in transazione ancora aperte:

| # | Funzione | Transazione | Consumatori |
|---|---|---|---|
| R1 | `listAircraft` | `aircraft.service.ts:137` (funzione `:118`, commento `:134-136`) | `api/v1/aircraft/route.ts:20`, `stats.service.ts:129`, `dashboard/page.tsx:258`, `fleet/page.tsx:61-62` (due concorrenti), `logbook/page.tsx:113`, `exports.service.ts:190` |
| R2 | `listPeople` | `people.service.ts:227` (funzione `:181`, commento `:219-226`) | `dashboard/page.tsx:259`, `bookings/page.tsx:168`, `expiries/page.tsx:88`, `billing/page.tsx:85`, `logbook/page.tsx:114-115`, `api/v1/people/route.ts:22`, `exports.service.ts:152`, `people.service.ts:283` |
| R3 | `listFlights` | `flights.service.ts:1425` (funzione `:1409`) | `people/[id]/page.tsx:157`, `logbook/page.tsx:137/141`, API, `exports.service.ts:220/615` |
| R4 | `listCashMovements` | `cash.service.ts:547` (funzione `:528`) | API, `exports.service.ts:372` |
| R5 | `buildOverview` (`readOverview` su `prisma`) | `accounts.service.ts:181` | `getAccountOverview` (`:117/:136`) → `page.tsx:1000`, `people/[id]/page.tsx:109`, API account, `flights.service.ts:1104/:1345` dopo il commit; `recordAdjustment` `:786` dopo il commit, in try/catch (H3) |
| R6 | `listBookings` — **batch** `$transaction([findMany, count])` | `bookings.service.ts:976` | `page.tsx:286/294/299/1002`, `bookings/page.tsx:218/223/230`, API, `exports.service.ts:269/742` |

Scritture che **tengono** la transazione (29: lock, guardie atomiche o più scritture insieme): `login-throttle.ts:94`; `accounts.service.ts:232` (`recordTopUp`, legge l'overview dentro la tx, fix H3) e `:698`; `aircraft.service.ts:223/288/388`; `app-settings.service.ts:192/256/441/544`; `auth-tokens.service.ts:98/202`; `bookings.service.ts:871/1263/1547`; `expiries.service.ts:281`; `expiry-types.service.ts:214`; `flights.service.ts:1008/1152/1239`; `instructor-compensation.service.ts:483`; `instructor-rates.service.ts:142`; `membership.service.ts:107`; `people.service.ts:493/650/930`; `rates.service.ts:200`; `settings.service.ts:209`; `users.service.ts:140`.

Già fatto: `listAllExpiries` con `COUNT(*) OVER ()` (19.7b `450a0f6`, `expiries.service.ts:563-596`); `listAccountMovements` in una istruzione (19.11 `0556850`, unit `accounts.service.test.ts:427` «NEVER a $transaction»); `listHourMeterAdjustments` (19.2) e `ppr.service.ts` (19.1) eliminate; 17.1: pool esplicito (`prisma.ts:28`, `DATABASE_POOL_MAX` default 10), `transactionOptions: {maxWait: 2000, timeout: 5000}` (`prisma.ts:43`, il commento affida `maxWait` alla 17.5), `shm_size: '1gb'`, `shared_buffers=512MB`, `work_mem=16MB`, `effective_cache_size=3GB`; 19.10 `761bf92` (requisiti letti fuori dalla tx sulle approvazioni).

**Panoramica admin** (stima dal codice, da misurare): 11 letture di `AppSetting` per richiesta (layout `layout.tsx:82-86` branding/ICAO/METAR con fallback a 2 query; pagina `page.tsx:282-284` ICAO/branding/scheduling + card METAR mobile `:228`; `getStats` scheduling `stats.service.ts:178`; `listAllExpiries` currency `expiries.service.ts:567`); `Promise.all` di 16 voci (`page.tsx:281-317`) preceduto da `listAircraft` e `listPeople` in sequenza (`:255-259`); ≈ 91 istruzioni e 20 transazioni per richiesta, di cui ≈ 58 e 15 da `getStats(month)` usato per **un solo campo** (`monthStats.kpis.revenueCents`, `page.tsx:547`).

**Due fatti che cambiano la lettura del piano**: (1) **la forma batch non toglie il P2028**: in Prisma 7.8.0 il batch «multi» apre comunque una transazione con `maxWait` (`@prisma/client/runtime/client.js:58`), e l'avvio scaduto prende la connessione più tardi e fa rollback, occupando il pool; solo le query senza transazione (`pool.query`, `connectionTimeoutMillis` = 0) sono immuni. (2) **La transazione di oggi non garantisce coerenza elenco/totale**: `default_transaction_isolation` = `read committed` (misurato), nessun `isolationLevel` in `src/server` → ogni istruzione ha il suo snapshot; il commento «one consistent snapshot» di `people.service.ts:225-226` è falso. Togliere la tx non toglie garanzie.

**`COUNT(*) OVER ()` costa caro sulle tabelle grandi** (`EXPLAIN ANALYZE`): Flight pagina 0,46 ms + count 11 ms contro **203 ms** con window; CashMovement 16 ms + count contro 47 ms; Person 5,1 + 1,6 contro 7,9 ms; tutti i velivoli attivi 0,7 ms in una query (1 460 righe) contro 15 transazioni da 2 query.

**Baseline** (post-17.1, pool 10; da rimisurare: il DB di carico è stato ricaricato): `page overview` e `page billing` 0/10 errori; `page reports` 8-10/10 `P2028`, wall ~4,3 s; `api stats year` 8/10 a pool 10, 7/10 a 20, wall 4,0 s; zero `53100`. Il baseline del piano («5-15 s con 9-10 errori») è dell'audit su Postgres di fabbrica e non vale più. Mancano i wall dei burst di Panoramica e Contabilità.

## Acceptance Criteria

1. **Nessuna transazione nelle letture**: *Given* R1-R6 *When* `git grep -n '\$transaction(' src/server` (esclusi test e commenti) *Then* restano solo le scritture elencate (35 → 29, meno quelle che la 17.4 ha già tolto); nessun percorso di sola lettura apre transazioni, nemmeno batch (forma T1).
2. **Coerenza elenco/totale provata da un unit**: per ognuna di R1-R6 un unit asserisce zero chiamate a `$transaction`, lo stesso `where` (deep-equal) passato a `findMany` e `count`, `total` = risultato di `count`; rosso sul codice pre-fix (copia isolata); i commenti dichiarano il perché (read committed, nessuno snapshot perso). `readOverview` resta dentro la tx di `recordTopUp` (unit H3 `accounts.service.test.ts:646`); il try/catch dopo il commit di `recordAdjustment` (`:786`) resta.
3. **Statistiche**: con 1 460 velivoli attivi `getStats` legge la flotta con al più 1 query (0 se la 17.4 l'ha già tolta); lo scopo dell'unit 15.4 F3 (`stats.service.test.ts:264-278`, nessun cap silenzioso sulla flotta) resta.
4. **Panoramica**: richiesta admin a `/it/dashboard` su server quieto, istruzioni contate col log degli statement: le letture di settings **della pagina** sono 1 query, dalla pagina parte zero `BEGIN`, il record riporta istruzioni e transazioni per richiesta prima/dopo; con T3 il KPI dei ricavi è identico (unit di parità + e2e `kpi-revenue` `home-dashboard.spec.ts:132`).
5. **Burst**: server di produzione su `airmanager_load` al `DATABASE_POOL_MAX` scelto, `bench.mjs targets-hot.json 5 10` con `burst: true` anche su `api stats year` → `burst_errors` = 0 su `page overview`, `page reports`, `page billing`, `api stats year`, `api stats month`; nel log del server `grep -c P2028` = 0 e `grep -c 53100` = 0; `burst_wall_ms` < 3000 su ciascuno. Prima di dichiararlo il record verifica il «prima» sul proprio HEAD.
6. **Pool e shm**: burst misto (10 `api stats year` + 10 `page reports`, due processi bench) a pool 10 e 20: errori, wall e picco di `/dev/shm` nel record; default scelto con la regola T5 (se resta 10 l'env contract non cambia).
7. **Scrittura durante il burst**: durante un burst di 10 Panoramiche un login (`reserveLoginAttempt`, transazione in scrittura) → zero `P2028`, altrimenti si applica §PO Q-17.5-a.
8. **Non regressione**: `npm run gates` verde; arbitro e2e completo su DB fresco exit 0; OpenAPI identico byte per byte; nessuna modifica a schema, migrazioni, `src/lib/schemas`; nessuna differenza di markup.

## Tasks / Subtasks

- [x] Rileggere il censimento su HEAD (dopo 17.2-17.4 ed Epic 16); misura «prima» (AC 4-7).
- [x] R1-R6 con T1; `listAllActiveAircraft` con T2 se esiste ancora; Panoramica con T3/T4; commenti con T7.
- [x] Unit AC 2-4 con discriminanza su copia isolata (mutanti: `prisma.$transaction` rimesso in `listPeople`; `where` diverso a `count`; paginazione a 100 senza ciclo in `listAllActiveAircraft` → rosso il test 15.4 F3).
- [x] Misura «dopo», pool (T5), `maxWait` (T6), `load-testing.md` §3/§5, `targets*.json` (`burst: true` su `api stats year` allineato nei due file, NIT 17.1); Dev Agent Record.

## Dev Notes

**Decisioni tecniche della sessione principale**:
- **T1** elenco e totale con **due query semplici senza transazione** (stesso `where`); niente batch (P2028) e niente `COUNT(*) OVER ()` su Flight e CashMovement (×18 e ×3); si tiene la singola istruzione dove c'è già (scadenze, estratto conto). `readOverview`: due query semplici fuori dalle scritture.
- **T2** `listAllActiveAircraft`: se la 17.4 non l'ha già eliminata, una sola lettura senza paginazione dei 3 campi usati (id, immatricolazione, stato), come `listBookableAircraft`/`listOutOfServiceAircraft`, mantenendo il test 15.4 F3.
- **T3** la Panoramica sostituisce `getStats(month)` con `getLedgerRevenueCents` sullo stesso intervallo `currentMonthRange(now)`, più un unit di parità (≈ −58 istruzioni e −15 transazioni per richiesta).
- **T4** settings: un `findMany({ key in [...] })` per le 4 chiavi della pagina, riusando i parser; il layout resta com'è e viene dichiarato nel conteggio; niente `React.cache` (non usato nel progetto).
- **T5** pool: default **resta 10** salvo misura contraria; vincoli `2·P·istanze ≤ 97` (`max_connections` 100 − 3 riservate, condivise col DB e2e), shm 1 GB a ~20 MB per query parallela → `2·P ≤ ~50`; 20 è il massimo misurato senza `53100`; 4 CPU. Si passa a 20 solo se 10 fallisce i 3 s e 20 li rispetta con picco shm < 80 %.
- **T6** `maxWait` resta 2000 salvo AC 7 rosso e §PO Q-17.5-a = A → 5000 in un solo punto (`prisma.ts:43`).
- **T7** i commenti «Sequential (NOT Promise.all)» si correggono (il motivo del warning `pg` «client already executing a query» riguardava transazioni concorrenti sullo stesso client) senza riordinare il codice.

**Blast radius**: servizi `aircraft.service.ts` (`:134-146`), `people.service.ts` (`:219-235`), `flights.service.ts` (`listFlights`), `cash.service.ts` (`:544-555`), `accounts.service.ts` (`:146-182`), `bookings.service.ts` (`listBookings`); `stats.service.ts:108-132` (commento `:113-125` della 15.4 F3); `dashboard/page.tsx:255-317` (solo lettura dati, nessun JSX); `app-settings.service.ts` (lettore multi-chiave); `prisma.ts:31-42` (commento «36 interactive…», «belongs to story 17.5»); `scripts/perf/targets*.json`; `docs/operations/load-testing.md`; commenti di pagina falsi `page.tsx:255-257`, `logbook/page.tsx:100-102`, `:145-150`, `billing/page.tsx:81-84`, `expiries/page.tsx:85-87`. **Solo se cambia il default del pool**: `env.ts:29`, `env.ci-sync.test.ts:69-72` (`toBe(10)`), `.env.example:5-13`, `ci.yml:73-76`, `prisma.ts:18-27`, `load-testing.md` §3, commento shm di `docker-compose.yml` — tutti nello stesso commit. Da preservare: `aircraftResult.total` come totale flotta della Panoramica (`page.tsx:338`, AOG-1a MINOR-1), `readOverview` dentro le scritture (H3), cap e totale degli export, mascheramento di `listBookings`, ordine con tie-break su `id`.

**Test che fissano il comportamento attuale**: `people.service.test.ts` (7 × `transaction.mockResolvedValue([[…], n])`, es. `:295`, `:320`; `:253` e `:602` sulle scritture); `aircraft.service.test.ts` (`mockInteractiveTransaction` 16 usi, 2 `mockResolvedValue`); stand-in di `flights.service.test.ts:174`, `cash.service.test.ts:74`, `accounts.service.test.ts:110-125`; `stats.service.test.ts:264-278`; `env.ci-sync.test.ts:68-86`. e2e: `aog-overview-count.spec.ts`, `home-dashboard.spec.ts`, `reports.spec.ts`, `mobile-reports.spec.ts`, `people-management.spec.ts`, `typeahead-pickers.spec.ts` (`/people?q=`), spec di paginazione di logbook e flotta.

**Misura**: una build per ciclo, `next start -p 3001` su `airmanager_load` (controllare la porta), `JOBS_SECRET` reale, `PERSON`/`AIRCRAFT` espliciti; prima/dopo `bench.mjs targets-hot.json 5 10` a pool 10 con `grep -c 'P2028\|53100'` sul log; burst misto a pool 10 e 20 campionando `docker compose exec -T postgres df /dev/shm`; probe di login durante il burst; conteggio query per richiesta con la ricetta README §7 (`log_min_duration_statement = 0` sul solo DB di carico, server quieto, una richiesta per pagina; righe `duration:` e `BEGIN`; poi `ALTER SYSTEM RESET`) — è una modifica di configurazione del container condiviso: concordarla con la sessione principale. `AppSetting` è vuota sul DB di carico (il fallback METAR costa 2 query: dichiararlo).

**Trappole**: env eager nei unit (verifica `env -u DATABASE_URL -u AUTH_SECRET npx vitest run <file>`); togliere il P2028 fa arrivare in fondo richieste che oggi falliscono in ~2 s → cresce la domanda di shm (692 MB misurati a pool 20 col burst misto) e cresce il wall (`page reports` dura 4,3 s *grazie* ai fallimenti rapidi); una transazione che legge col `prisma` globale dentro la callback chiede una seconda connessione e si autoblocca quando N ≥ pool (19.10 F2): nessuna scrittura che resta in tx deve aggiungere letture col client globale; login ripetuti dei bench → lock anti-brute-force (controllare `LoginAttempt`); commit con pathspec, mai `git stash`; e2e solo via `scripts/e2e.sh`.

**Dimensione**: ~14-18 file, +350/−200 (≈ 1/6 della 19.7a); nessuna migrazione, nessun cambio di API. Nessuno split.

### References

- `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §Story 17.5; `perf-load-report.md` F4; `17-1-fondamenta-misura-configurazione.md` e `17-1-review-report.md`; `docs/operations/load-testing.md` §3 e §5; `scripts/perf/README.md` §7

## §PO — Ratifiche

Ratificate dal PO il 2026-11-03 in un solo giro (AskUserQuestion: «Sì, tutte» sulle raccomandazioni presentate in linguaggio semplice).

- **Ordine** (comunicato al PO): dopo 17.2-17.4, come da piano.
- **Q-17.5-a — un salvataggio sotto carico** = A (condizionale all'AC 7): aspetta fino a circa 5 secondi e va a buon fine invece di fallire dopo 2 → `maxWait` 5000 in un solo punto (`prisma.ts:43`), T6.


## Dev Agent Record

### Ambiente e verifiche

Lavoro su Codex Cloud, ramo locale `story/17-5`, base `151d51db7023cae8c1fa3f0df234bda4085cc852`. Il checkout iniziale era pulito.

- R1–R4 e R6 eseguono pagina e conteggio in sequenza sul client ordinario con lo stesso filtro. I cinque test AC 2 falliscono sulla base isolata perché rilevano una chiamata a `$transaction`. Il mutante di `listPeople` che conta con `where: {}` fallisce sul confronto del filtro. Dopo la modifica passano tutti i 793 test dei cinque servizi.
- R5 passa il client ordinario a `readOverview` nelle letture autonome, e il client della scrittura in `recordTopUp`. Il test sul saldo e sul filtro delle due letture falliva sul codice precedente (una transazione aperta). Dopo la modifica passano tutti i 91 test del servizio conti, inclusi H3 e il recupero post-commit di `recordAdjustment`.
- Su questa base il censimento delle chiamate di produzione passa da 36 a 30. Restano le transazioni di scrittura, inclusa l’archiviazione dei velivoli aggiunta dopo il censimento iniziale.
- La Panoramica admin condivide una lettura di branding, ICAO, METAR, pianificazione e valuta delle scadenze. Il layout conserva le sue letture. Il KPI usa il totale del libro contabile sul mese di Roma; il test di parità include il cambio mese alle 22:30 UTC del 31 luglio. Passano 231 test delle quattro suite interessate. Sulla base isolata i tre test del lettore settings e il test del riuso nelle scadenze falliscono. I mutanti che limitano la flotta a 100 o troncano il mese al primo giorno sono stati rilevati.
- Il confronto dei 586 nodi JSX della pagina (struttura, attributi e letterali, escluse le espressioni dinamiche) sulla base e sul ramo produce lo stesso SHA-256 `066509a930de1c838bb28fb0ce9430ae5fc5419d5adb0127bad7401b8c52a4a2`. Nessuna differenza in schema Prisma, migrazioni o `src/lib/schemas`.
- Benchmark su PostgreSQL 16 sintetico con 60.018 voli e 102.899 movimenti. Panoramica: 82 → 53 statement, 5 → 0 BEGIN, 7 → 3 query AppSetting (1 nella pagina, 2 nel layout). A pool 10 i wall prima → dopo dei burst da dieci sono 2949 → 2226 ms (Panoramica), 1172 → 1030 (report), 2139 → 2411 (contabilità), 745 → 703 (API anno), 554 → 636 (API mese). Tutti con zero errori.
- Burst misto anno/report dopo la modifica: 2862/3087 ms a pool 10 e 2121/2423 ms a pool 20. Picco shm campionato 1052 KiB su 1 GiB, zero P2028 e 53100. Login con sessione nuova durante dieci Panoramiche: 465 ms, dieci HTTP 200. I criteri T5 e T6 mantengono pool 10 e maxWait 2000 ms. Metodo e misure precedenti in `docs/operations/load-testing.md`, §§3 e 5.
- OpenAPI: HTTP 200, 393.522 byte prima e dopo; confronto byte per byte riuscito, SHA-256 `ab19f90c7916940453aceebc019f84f71e1dbf13c883aa62aedd07b4cb20d537`.
- Gate integrato `npm run gates` exit 0: lint, typecheck, 2293 test in 85 file e build production. Al primo ciclo i validator Next generati prima del checkout riferivano route eliminate; rigenerati i tipi e ripetuto l'intero gate.
- Arbitro browser su database fresco sintetico, SMTP Mailpit e METAR da fixture: 624 casi, 617 passati al primo tentativo e 7 dopo retry, zero falliti o saltati. E2E_EXIT=0 in 28,9 minuti. Casi con retry: account-adjustments:94, bookings:1103 e :1208, mobile-logbook:1223 e :1266, mobile-reports:420, session-identity:138.
