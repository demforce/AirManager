# Review adversarial — Story 17.1 «Fondamenta di misura e configurazione»

**Data**: 2026-09-27 · **Reviewer**: subagent Opus 5.5 (unico layer adversarial)
**Commit sotto review**: `a6e2a39` (feat, 13 file) + `24c9e2b` (Dev Agent Record)
**HEAD all'inizio e alla consegna**: `24c9e2b` (nessun commit intervenuto; albero invariato salvo le cartelle untracked dell'utente, non toccate)
**Contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` §«Story 17.1» · story file `_bmad-output/implementation-artifacts/17-1-fondamenta-misura-configurazione.md` (18 AC)
**Finding dell'audit coinvolti**: `perf-load-report.md` §3 F4, F10 (+ §5 righe 5-6)
**Skill applicate**: `bmad-code-review` (flusso adversarial), `karpathy-guidelines` (ogni riga ricondotta alla richiesta; nessuna proposta speculativa).

---

## Verdetto

### SHIPPABLE-WITH-FIXES (condizionato alla decisione PO sull'AC 9)

La metà «configurazione» è **corretta e verificata sul vivo**: il pool rispetta davvero `max` (provato da
Postgres, non dal codice), `transactionOptions` coincide coi default runtime di Prisma 7.8 (letti nel
sorgente installato, non nel `.d.ts`), l'env contract è protetto da asserzioni nominate **discriminanti**
(4 derive simulate, 4 rossi), il container gira coi valori dichiarati e i dati sono intatti, i gate passano
(1880 unit) e l'**arbitro e2e è 537/537 verde, 0 flaky, sul container ri-tarato** (prima suite completa dopo
il ricreo). Nessuna regressione di runtime: [I-c] regge.

Ma quattro cose non reggono:

1. **L'AC 9 non è soddisfatto alla lettera, e il record lo copre con un numero sbagliato.** Il burst di 10 su
   `stats?period=year` dà **8/10 × 500** (`P2028`) — riprodotto — e il record afferma che il target in burst
   del harness committato «non ha questo problema». Falso: `page reports` è **la stessa lettura
   `period=year`** (default della pagina) e nei file grezzi del dev dà **10/10 errori** dopo il fix; il
   record §C scrive **0/10**. Il mio run col harness committato: **9/10**.
2. **Il `53100` è riproducibile sul compose nuovo.** Con `DATABASE_POOL_MAX=20` (la manopola che questa
   story introduce) 20 richieste Statistiche concorrenti riempiono `/dev/shm` (**522 320 kB su 512 MB**) e
   il log riporta **7 × `53100`**. L'aritmetica del commento del compose è sbagliata nel meccanismo: il
   consumo di DSM scala con le **query parallele concorrenti (= connessioni)**, non con
   `max_parallel_workers`.
3. **`render.mjs` conta i long task k volte** sulla k-esima pagina misurata (prova deterministica: stessa
   pagina con UN long task da 150 ms → 1, 2, 3 … 8 long task). Una delle metriche browser dell'harness —
   il deliverable di [I-a] — è sbagliata per 13 righe su 14.
4. Il pool è **per layer di Next, non per processo**: 2 pool per processo (misurato: 6 connessioni con
   `DATABASE_POOL_MAX=3`, 40 con 20). La formula documentata in 4 punti sottostima di 2×.

| # | Sev | Sostanza | File |
|---|---|---|---|
| MAJOR-1 | major | AC 9 non soddisfatto (burst `year` 8/10 × 500); il record lo sostituisce con `stats month` e riporta `page reports` a 0/10 contro il 10/10 dei suoi stessi file grezzi | record §B AC 9, §C, §D, §K; `scripts/perf/targets-hot.json:12` |
| MAJOR-2 | major | `53100` riproducibile col compose nuovo a `DATABASE_POOL_MAX=20` (shm pieno, 7 errori); commento del compose con meccanismo e «worst case measured» falsi | `docker-compose.yml:9-14` |
| MAJOR-3 | major | `render.mjs`: `addInitScript` dentro il loop → long task e loro totale moltiplicati per l'indice della pagina | `scripts/perf/render.mjs:44-48` |
| MINOR-1 | minor | Meccanismo del `P2028` attribuito male: lo lancia la `$transaction` interattiva di `listAircraft`, raggiunta 15 volte per richiesta da `listAllActiveAircraft`; il perimetro pianificato della 17.5 non la contiene | record §B/§D/§F/§K; `aircraft.service.ts:212`, `stats.service.ts:132-138` |
| MINOR-2 | minor | Pool per layer (route + pagine), non per processo: formula «× istanze ≤ max_connections» sottostimata di 2×; doc-comment di `prisma.ts` non conforme all'AC 11 e record che lo dice «byte-per-byte» | `src/lib/env.ts:17-26`, `.env.example:6-11`, `docs/operations/load-testing.md:99-105`, `src/server/db/prisma.ts:18-22` |
| MINOR-3 | minor | `load-testing.md` §5: «numbers this story's harness reproduced» è falso; la tabella di riferimento è pre-tuning e fa accreditare alle story 17.x i guadagni della 17.1 | `docs/operations/load-testing.md:119-143` |
| LOW-1 | low | Fail-fast dei placeholder DOPO login + 2 richieste di risoluzione (AC 3 «nessuna richiesta inviata» non rispettato; README e record lo affermano) | `scripts/perf/bench.mjs:160-173`, `scripts/perf/README.md:104` |
| LOW-2 | low | Placeholder risolto a stringa vuota non intercettato → misura silenziosa di `/api/v1/people//account` | `scripts/perf/bench.mjs:95-100`, `:113-114` |
| LOW-3 | low | Ricetta query lente non funzionante: `grep 'db=…'` con `log_line_prefix` di default (`%m [%p] `), `$START_TS` mai impostato | `scripts/perf/README.md:142-156` |
| LOW-4 | low | Ricetta `seed:load` del README punta al `DATABASE_URL` di `.env` (il DB e2e); la guardia è solo un'uguaglianza | `scripts/perf/README.md:120-125` |
| LOW-5 | low | Censimenti e numeri del record imprecisi (36 transazioni interattive, non 31; `transactionOptions` governa anche i batch; «108» occorrenze; «due righe»; «0 righe» createRequire; AC 4 eseguito solo a 1280) | record §A/§B/§I, `src/server/db/prisma.ts:26-34` |
| NIT | nit | README rimanda a `load-testing.md` «for which ports are in use» (non c'è); «no system Postgres on this host» in un doc di repo; `BASE` di default 3000 vs 3001; flag `burst` di `page billing` incoerente fra i due file target; `TMPDIR=''` → output relativo | vari |

**Decisione PO richiesta**: una (AC 9, §«Decisione PO»). MAJOR-2 contiene una scelta di valore
(`shm_size`) che la story delega al dev ma che richiede un secondo ricreo del container (sessione principale).

---

## Arbitro — suite e2e completa su DB fresco (priorità zero, lanciato per primo)

Pre-condizioni verificate prima dello start (01:29): `SELECT count(*) FROM "Person"` = **4**,
`"Flight"` = **0** sul DB `airmanager`; nulla in ascolto su `:3000`/`:3001` (`ss -ltnp`); nessun run vivo.
Ambiente: `set -a && . ./.env && set +a`, `export JOBS_SECRET=local-dev-not-a-placeholder-0123456789abcdef`,
`CI=1 scripts/e2e.sh start` (suite completa, detached, build di produzione dentro il webServer). Durante il
run: nessuna build, nessun server, nessun benchmark. Esito letto **solo** con `scripts/e2e.sh status`:

```
log: /tmp/airmanager-e2e/last-run.log
args: <full suite>
state: DONE — E2E_EXIT=0
--- summary ---
  537 passed (12.5m)
--- last 6 lines ---
[AC 13] active aircraft before: 177, filler created: 0, active now: 177
  ✓  537 [aog-overview-count] › e2e/aog-overview-count.spec.ts:70:7 › Panoramica fleet-wide AOG count (story AOG-1a, AC 13) › the Panoramica and the Flotta announce the SAME number of grounded aircraft, past the first OPTIONS_PAGE_SIZE by registration (1.3s)

  537 passed (12.5m)
=== e2e end: 2026-09-27T01:42:18+02:00 ===
E2E_EXIT=0
```

**537 passed, 0 flaky, 0 failed** = il conteggio atteso (536 + 1 flaky dell'arbitro su `4521c80`; questa
story non aggiunge e2e). Nessuna delle tre classi di flake note si è presentata. È la **prima suite completa
sul container con `shm_size` 512 MB e `shared_buffers`/`work_mem`/`effective_cache_size` nuovi**: parte
dell'AC 18 è quindi provata anche sul lato «il tuning non rompe la suite».

---

## Findings

### MAJOR-1 — AC 9 non soddisfatto, e il record lo copre con un numero sbagliato

**AC 9 (testo)**: `GET /api/v1/stats?period=year` su `:3001` contro `airmanager_load` risponde **200,
sequenzialmente e in un burst di 10, con zero 5xx e zero `53100`**.

**Riproduzione** (server di produzione su `:3001`, build della suite = HEAD `24c9e2b`, pool di default,
script di burst con un solo login e lo stesso flusso Auth.js di `bench.mjs`; campionamento di
`pg_stat_activity` e `/dev/shm` ogni 100/50 ms):

```
SEQ /api/v1/stats?period=year: 200/605ms/109944B 200/472ms/109944B 200/569ms/109944B 200/567ms/109944B 200/496ms/109944B
BURST 10 /api/v1/stats?period=year: wall 4043ms, errors 8/10: 500/2267ms/INTERNAL_ERROR 500/2547ms/INTERNAL_ERROR 500/2878ms/INTERNAL_ERROR 500/3208ms/INTERNAL_ERROR 200/3971ms 200/4042ms 500/2081ms/INTERNAL_ERROR 500/2083ms/INTERNAL_ERROR 500/2085ms/INTERNAL_ERROR 500/2086ms/INTERNAL_ERROR
[y10] conn samples: 93 max_active=10 max_total=10
[y10] shm samples: 150 peak_kB=219400 baseline_kB=1052
   log: 53100=0 P2028=8 unhandled_api=8
```

Pool 20 (`DATABASE_POOL_MAX=20`): burst **7/10** (`P2028` ×7), identico al record §D. Sequenziale: 200 in
entrambi i casi. `53100`: **0** in entrambi. Quindi: la metà «`53100`» dell'AC è vera, la metà «zero 5xx
in burst» è **falsa**. Il record non dichiara l'AC 9 come non soddisfatto: apre la riga dell'AC con
«target committato con `"burst": true`, `api stats month`» (un target diverso) e confina il `year` in una
«nota onesta».

**Il numero sbagliato.** Il record §C scrive per `page reports` (burst) *dopo*: **`200 / 570ms / 0/10`**, e
§B AC 9: «Lo stesso per `page overview`/`page reports` (500→200, burst 10/10→0/10 errori)». I file grezzi
del dev dicono il contrario:

```
$ cat /tmp/airmanager-perf/bench-after.md | grep 'page reports'
| page reports | 200 | 564 | 570 | 580 | 580 | 1257512 |  | 4327 | 4326 | 10 |
$ python3 … after/targets-hot.results.json   →   page reports 200 570 4327 10
$ grep -v '^\s' /tmp/airmanager-perf/server-after.log | sort | uniq -c
     10 ⨯ Error [PrismaClientKnownRequestError]: Transaction API error: Unable to start a transaction in the given time.
      9 Unhandled /api/v1 error Error [PrismaClientKnownRequestError]: Transaction API error: …
```

I 10 `⨯ … digest` sono errori di **rendering SSR** (il burst di `page reports`), i 9 `Unhandled /api/v1`
sono il burst ad-hoc su `stats?period=year`. Il mio run del harness committato, col comando del README
(`PERSON`/`AIRCRAFT` espliciti, `targets-hot.json 5 10`), conferma:

```
| page reports | 200 | 578 | 573 | 578 | 578 | 1257512 |  | 4356 | 4354 | 9 |
log: P2028 +9 (tutti SSR)
```

**Perché conta doppio**: `page reports` **è** la lettura `period=year`
(`src/app/[locale]/dashboard/reports/page.tsx:48-51`: `isYear = sp.period !== 'month'`, default `year`).
Quindi l'affermazione del record «Il target committato che il harness esercita in burst (`api stats month`)
**non** ha questo problema» è falsa due volte: il harness committato esercita **già** il burst `year` (via
SSR) e lo vede fallire al 90-100 %. Ed è la riga su cui la story 17.5 leggerà il suo «prima».

**Sulla domanda «swap del target»**: nessuno swap. I flag `burst` di `targets-hot.json` coincidono con
quelli dell'audit (§2.1: `stats month` in burst, `stats year` «—»; story §3.2 idem). È la story ad aver
scritto nell'AC 9 un burst che il harness dell'audit non misurava sull'API. Il harness, andando avanti,
misura il burst `year` attraverso `page reports` — **se** il suo risultato viene riportato per quello che è.

**Fix (record)**: §B AC 9 → «**NON soddisfatto alla lettera**: `53100` = 0 sequenziale e in burst (soddisfatto);
burst 10 su `year` = 8/10 × 500 (`P2028`) a pool 10, 7/10 a pool 20 — v. decisione PO»; §C `page reports`
dopo = **10/10** (e questa review: 9/10); §D aggiungere `page reports`; §K idem. Nessuna riga di codice.

### MAJOR-2 — Il `53100` è riproducibile col compose nuovo; il commento del compose ha il meccanismo sbagliato

**Commento sotto accusa** (`docker-compose.yml:9-13`): «512 MB covers the worst case **measured** on the
load DB: one gather can hold work_mem × hash_mem_multiplier(2) × participants(3) ≈ 96 MB, and
**max_parallel_workers(8) allows ~4 concurrent gathers** -> ~384 MB».

Due errori: (a) nulla è stato misurato — è un conto; (b) il tetto dei gather concorrenti **non** è
`max_parallel_workers`. Il contesto parallelo (DSM) e l'hash table condivisa di un `Parallel Hash` si
allocano per ogni query con piano parallelo **anche quando i worker non vengono lanciati** (il leader esegue
da solo): il consumo scala con le **query parallele concorrenti**, cioè con le connessioni attive.

**Evidenza** (stesso server, stessa query, `max_parallel_workers` = 8 fisso; colonna «worker visti» = max di
`backend_type='parallel worker'` in `pg_stat_activity`):

| Carico | Connessioni client max | Worker paralleli max | Picco `/dev/shm` | `53100` |
|---|---|---|---|---|
| pool 3, 6 burst misti (API+pagine) | **6** | 6 | 115 676 kB | 0 |
| pool 10, burst 10 `stats year` (API) | 10 | — | 219 400 kB | 0 |
| pool 10, 10 API + 10 pagina `reports` concorrenti | 20 | 7 | 361 696 kB | 0 |
| pool 20, burst 10 `stats year` (API) | 20 | 7 | 387 968 kB | 0 |
| **pool 20, 10 API + 10 pagina `reports` concorrenti** | **40** | **7** | **522 320 kB (pieno)** | **7** |

Con i worker fermi a 7, lo shm passa da 116 a 522 MB seguendo le connessioni (~18-20 MB per query
parallela attiva). Verbatim dal log del server (pool 20):

```
Unhandled /api/v1 error Error [DriverAdapterError]: could not resize shared memory segment "/PostgreSQL.448504482" to 4194304 bytes: No space left on device
    at F.onError (.next/server/chunks/_1xdnb0a._.js:466:39924)
  [cause]: { originalCode: '53100', … }
$ grep -c "originalCode: '53100'" srv-pool20.log   →   7
```

**Perché è major e non un dettaglio**: (1) `DATABASE_POOL_MAX=20` è esattamente il valore che la story
misura come opzione per la 17.5 (§D del record); (2) oggi il `P2028` **fa fallire in fretta** 7-9 richieste
su 10, riducendo la concorrenza reale sul DB: quando la 17.5 lo toglierà, tutte le richieste arriveranno alle
query parallele e il margine a pool 10 (362 MB su 512 nel caso 10+10) si assottiglia; (3) l'obiettivo di
record della story è «nessuno rincontri i 500 da `53100`», e il commento lo presenta come un tetto.

**Fix** (una delle due, scelta tecnica che la story delega al dev — AD-4: «se cambia i valori, cambia anche
la motivazione e la misura»):
- **(raccomandato)** `shm_size: '1gb'` + commento riscritto: consumo ≈ 20 MB × query parallele concorrenti
  (≈ `DATABASE_POOL_MAX` × 2 layer × processi — v. MINOR-2), picchi misurati di questa tabella, «tmpfs è un
  tetto, non un'allocazione» (già vero). Richiede un secondo `docker compose up -d --force-recreate postgres`
  (sessione principale, stessa procedura dell'AC 8) e la ri-esecuzione della riga «pool 20, 10+10».
- oppure tenere `512mb` e correggere il commento dichiarando il limite: «≈ 25 query parallele concorrenti;
  `DATABASE_POOL_MAX` ≥ 13 con traffico API+pagine lo supera».

In ogni caso va rimosso «measured» e la frase su `max_parallel_workers(8)`. Nota di contorno: `temp_bytes`
di `airmanager_load` è rimasto **fermo** (117 696 934) in tutti i burst → a `work_mem` 16MB nessuno spill.
La motivazione «4MB spills them to disk» non l'ho potuta verificare (le mie approssimazioni SQL delle query
Prisma non spillano nemmeno a 4MB: `HashAggregate … Batches: 1 Memory Usage: 977kB`); non la sollevo come
finding, ma resta un'affermazione non misurata.

### MAJOR-3 — `render.mjs` moltiplica i long task per l'indice della pagina

`scripts/perf/render.mjs:44-48`: `page.addInitScript(...)` è chiamato **dentro** il loop sulle pagine.
Gli init script di Playwright **si accumulano** sulla pagina e girano tutti a ogni navigazione: alla k-esima
misura girano k copie, ognuna registra un `PerformanceObserver` che fa `push` sullo stesso `window.__lt`,
quindi ogni long task viene contato **k volte** (e `longTaskTotal` moltiplicato per k).

**Prova deterministica** (server finto locale che serve una pagina con **un solo** long task da 150 ms,
nessun contatto con l'app o col DB):

```
$ PASSWORD=x BASE=http://127.0.0.1:3998 PAGES=/p,/p,/p,/p node scripts/perf/render.mjs 1280 375
| /p | 1280 | 6 | 0 | 6 | 6 | 1 | 150 | 59 |
| /p | 1280 | 6 | 0 | 7 | 7 | 2 | 300 | 41 |
| /p | 1280 | 6 | 0 | 7 | 7 | 3 | 450 | 60 |
| /p | 1280 | 6 | 0 | 7 | 7 | 4 | 600 | 57 |
| /p | 375  | 6 | 0 | 8 | 8 | 5 | 750 | 61 |
| /p | 375  | 6 | 0 | 7 | 7 | 6 | 900 | 51 |
| /p | 375  | 6 | 0 | 7 | 7 | 7 | 1050 | 58 |
| /p | 375  | 6 | 0 | 7 | 7 | 8 | 1200 | 10 |
```

Sull'app vera (`render.mjs 1280 375`, 14 righe) **ogni** valore non nullo di `longTasks` è multiplo
dell'indice della pagina: Pianificazione 1280 = 10 (k=2), Contabilità 1280 = 12 (k=3), Statistiche 1280 = 8
(k=4), Pianificazione 375 = 9 (k=9), Contabilità 375 = 30 (k=10). Stessa firma nelle tabelle del record
(§C: 5/10/6/8 per k=1..4). Le colonne `nodes`, `html KB`, `domInteractive`, `load` non sono toccate.

**Impatto**: il P1 chiede «nodi/long task/fps per pagina»; la metrica long task è sbagliata per 13 righe su
14 e cambia se si cambia l'ordine o il numero di pagine (`PAGES`) — un prima/dopo con liste diverse è
inconfrontabile. I numeri di long task della baseline dell'audit potrebbero avere lo stesso difetto (lo
scratchpad originale non esiste più: non verificabile).

**Fix** (2 righe): registrare l'init script **una volta**, prima dei due loop (gira comunque a ogni
navigazione e azzera `window.__lt` a ogni documento). Verifica: il comando qui sopra deve dare `1` su tutte
le righe.

### MINOR-1 — Il `P2028` lo lancia la `$transaction` di `listAircraft`, non il `Promise.all` annidato

Il record (§B AC 9, §D, §F, §K) attribuisce il residuo al «`Promise.all` annidato di `stats.service.ts:172-173`»
che «tiene più connessioni». Ma un `Promise.all` di query semplici **non può** produrre `P2028`: le query
fuori transazione aspettano il pool senza timeout (`pg-pool`, `connectionTimeoutMillis` = 0). `P2028` nasce
solo dall'avvio di una transazione che non ottiene una connessione entro `maxWait` (runtime
`@prisma/client/runtime/client.js`: `Qa(()=>n.abort(), t.maxWait)` in gara con
`driverAdapter.startTransaction`).

**Prova** (frame dello stack del log mappati sui chunk della build della suite, stessi hash di chunk del dev):
- API: `at async y (.next/server/chunks/src_server_services_0m5elms._.js:1:2444)` → `y` =
  `async function y(t,e){(0,s.authorize)(t,"aircraft.manage"); … await c.prisma.$transaction(async t=>{…findMany…count…})` = **`listAircraft`** (`aircraft.service.ts:212`);
  `at async w (…_1thh9i1._.js:1:1219)` → `w` = `for(let n=1;;n+=1){let r=await (0,d.listAircraft)(e,{page:n,pageSize:100,…})` = **`listAllActiveAircraft`** (`stats.service.ts:132-138`); `E` = `getStats`.
- SSR (`page reports`): `l` → stesso `listAircraft` con `$transaction`, `u` = `listAllActiveAircraft`, `v` = `getStats`.

Con 1 447 velivoli non archiviati (`SELECT count(*) … "archivedAt" IS NULL` = 1447) ogni richiesta apre
**15 transazioni interattive in sequenza**, mentre il `Promise.all` di ~22 query satura il pool: la
transazione aspetta > 2 s e muore. Il fan-out è la **pressione**, la transazione di lettura è il **punto di
rottura**. Stessa cosa sul DB e2e (audit F4: 10/10 su Statistiche già sul DB piccolo).

**Mascheramento** (domanda del team lead): sì, era mascherato. Nel «prima» del dev (shm 64 MB) i `53100`
facevano fallire le query in ~200 ms, liberando il pool: 0 `P2028` nel log. Quando il `53100` non c'è,
il `P2028` emerge: lo mostrano i run 2-3 dell'audit (parallelismo spento sul DB di carico → nessun `53100`
possibile) con Statistiche a 10/10 errori `P2028`.

**Perché è un finding e non un dettaglio**: la 17.5 pianificata (piano, §«Story 17.5», AC 1) nomina **solo**
`listPeople` e `listExpiries`. Con quel perimetro la sua AC 3 («zero errori sul burst di Statistiche»)
fallirebbe. Le letture interattive in produzione sono almeno **8** liste `const [items, total] = await
prisma.$transaction(async …)`: `aircraft.service.ts:212` (`listAircraft`), `:694`
(`listHourMeterAdjustments`), `flights.service.ts:1901` (`listFlights`), `ppr.service.ts:349`,
`expiries.service.ts:470`, `people.service.ts:231`, `accounts.service.ts:385` (`listAccountMovements`),
`cash.service.ts:503`, più `accounts.service.ts:181` (`readOverview`). **Fix**: correggere il record e
consegnare alla sessione principale questa lista come input della 17.5 (azione: story file 17.5).

### MINOR-2 — Due pool per processo: la formula documentata sottostima di 2×

`src/lib/env.ts:20` («Per Node PROCESS»), `.env.example:6` («per Node process»),
`docs/operations/load-testing.md:100-105` e la richiesta dell'AC 11 descrivono un pool per processo. La build
di produzione compila `src/server/db/prisma.ts` in **più layer** (route handler e rendering delle pagine
hanno ciascuno la propria istanza del modulo: `grep -rl "transactionOptions:{maxWait:2e3" .next/server` →
4 chunk, fra cui `chunks/ssr/_15bsln-._.js`), e in produzione il singleton su `globalThis` è
deliberatamente spento (`prisma.ts:41-42`). Misurato da Postgres:

```
DATABASE_POOL_MAX=3,  6 burst misti su 3 API + 3 pagine   →  max client backends = 6
DATABASE_POOL_MAX=20, 10 API + 10 pagina concorrenti      →  max client backends = 40
default,              10 API + 10 pagina concorrenti      →  max client backends = 20
default,              solo API                            →  max client backends = 10
```

Il `max` è **rispettato per pool** (AC 11 provato), ma un processo apre fino a **2 × `DATABASE_POOL_MAX`**
connessioni (più layer se un giorno altre superfici toccano il DB). Con la formula scritta, chi imposta
`DATABASE_POOL_MAX=50` su «2 istanze ≤ 100» apre fino a 200 connessioni. Preesistente come architettura,
ma **la formula è un'affermazione nuova di questa story**.

Collegato: l'AC 11 chiede che **il doc-comment di `prisma.ts`** nomini `pg-pool/index.js:89`, la relazione
con `max_connections` e il «per processo»; il commento a `prisma.ts:18-22` cita solo «10 … (`pg-pool`
v3.14.0)» e rimanda a `env.ts` per il resto. Il record §A dice «byte-per-byte quanto prescritto in
AD-5/AD-6, doc-comment incluso» e §B AC 11 che il doc-comment «nomina» tutti e tre gli elementi: entrambe le
affermazioni sono false (il testo AD-6 è parafrasato, il contenuto AD-5 è in un altro file). **Fix**:
«per layer di Next (route handler e pagine hanno pool separati): una istanza `next start` apre fino a
2 × `DATABASE_POOL_MAX`» nei tre punti + formula `DATABASE_POOL_MAX × 2 × istanze ≤ max_connections − 3`
(`superuser_reserved_connections` = 3, misurato); correggere il record.

### MINOR-3 — `load-testing.md` §5: numeri «riprodotti» che non lo sono, e baseline pre-tuning come riferimento

`docs/operations/load-testing.md:121-122`: «these are the numbers **this story's harness reproduced**, to
compare epic 17's stories against». Sono i numeri dell'audit del 2026-09-10 (run 3, Postgres di fabbrica,
run 2-3 con `max_parallel_workers_per_gather = 0` sul DB di carico) — nessuno è stato prodotto dall'harness
committato. E sono presentati come riferimento per le story 17.x, ma dopo il tuning della 17.1 gli stessi
target sono molto diversi (misura mia, harness committato, `PERSON`/`AIRCRAFT` espliciti): `api stats year`
**485 ms** (tabella: 1 125), `page billing` **441 ms** (1 693), `page reports` **573 ms** (1 570). Una 17.3 o
17.4 che si confronti con questa tabella si accrediterebbe il guadagno del compose. **Fix**: dichiarare la
tabella «baseline audit 2026-09-10, Postgres di fabbrica, NON confrontabile»; indicare come «prima» dell'epic
17 il run post-17.1 del record (con `PERSON`/`AIRCRAFT` espliciti), corretto come da MAJOR-1.

### LOW-1 — Il fail-fast dei placeholder parte dopo cinque richieste

`scripts/perf/bench.mjs:160-173`: `main()` esegue `login()` e `resolvePlaceholders()` **prima** del controllo.
AC 3: «esce 2 nominando target e placeholder **(nessuna richiesta inviata)**»; README `:104`: «substituted …
**before any request is sent**». Prova (server finto che registra le richieste):

```
unknown placeholder {NOTREAL} in target "bad target" (/x/{NOTREAL})
exit=2
--- requests received by fake server before exit:
GET /api/auth/csrf
POST /api/auth/callback/credentials
GET /api/v1/me
GET /api/v1/people?page=1
GET /api/v1/aircraft
```

La prova del record («nessuna riga aggiunta al log del server») non prova nulla: `next start` non logga le
richieste. **Fix**: validare `rawTargets` contro le sei chiavi note **prima** di `login()` (spostare il primo
loop; 0 righe nuove).

### LOW-2 — Un placeholder risolto a vuoto viene misurato in silenzio

`bench.mjs:95-100` + `:113-114` (`person ?? ''`): se `GET /api/v1/people?page=1` non restituisce `items`
(DB vuoto, 4xx, forma cambiata), `{PERSON}` diventa `''` e il target misurato è `/api/v1/people//account`;
il JSON registra `personFrom: "api"` **senza** `person`. Prova (server finto con lista vuota): exit 0,
`"path": "/api/v1/people//account"`, richiesta inviata due volte. È la «peggiore delle uscite» che AD-2
voleva escludere. **Fix**: exit 2 se un placeholder usato da almeno un target si risolve vuoto.

### LOW-3 — La ricetta delle query lente non trova nulla

`scripts/perf/README.md:150`: `grep 'db=airmanager_load'` — `SHOW log_line_prefix` sul container =
`%m [%p] ` (default, nessun `db=%d`): il grep è vuoto per costruzione. L'audit lo impostava (report §6:
«`log_min_duration_statement`, `log_line_prefix` ripristinate»). `$START_TS` non è mai assegnato. **Fix**:
aggiungere `ALTER SYSTEM SET log_line_prefix = '%m [%p] db=%d '` (e il suo `RESET`) e
`START_TS=$(date -Iseconds)`; «four environmental couplings» ne elenca tre.

### LOW-4 — La ricetta `seed:load` del README punta al DB e2e

`scripts/perf/README.md:122-125`: `set -a && . ./.env && set +a` poi `LOAD_SEED_TARGET_DB=<db-name-in-DATABASE_URL>`.
Il `DATABASE_URL` di `.env` è `airmanager` (il DB e2e) e la guardia è **solo un'uguaglianza**
(`prisma/seed-load.ts:82-88`): seguita alla lettera, la ricetta semina 5 000 persone nel DB e2e.
`load-testing.md` §1 fa la cosa giusta (sovrascrive `DATABASE_URL`). La stessa ricetta è nell'header
preesistente di `seed-load.ts:21-23`, ma il README è nuovo. **Fix**: una riga `export DATABASE_URL=…airmanager_load…`
o il solo rimando a `load-testing.md` §1.

### LOW-5 — Censimenti e numeri del record

- `prisma.ts:26`: «31 interactive `$transaction(async …)` call sites across 12 service files». Letterale per
  la forma `async`, ma le transazioni interattive sono **36 in 13 file**: la forma a callback non-`async`
  (`accounts.service.ts:181`, `people.service.ts:710/715/718`, `users.service.ts:140`) sfugge al grep. E
  `transactionOptions` governa **anche** i batch `$transaction([...])` (runtime: `kind:"batch" … maxWait:i?.maxWait??this._engineConfig.transactionOptions.maxWait`). Nessun effetto (valori = default).
- «108 occorrenze» di `53100` nel log *before*: il file su disco ha **72** eventi (`originalCode: '53100'`,
  36 API + 36 SSR), 144 righe con `53100`.
- AC 15: «`README.md` … due righe aggiunte»; il diff è **una** riga (la story ne chiedeva due; unirle va bene,
  dichiararlo no).
- AC 18: «unico diff in `ci.yml` è la riga …»: il diff è 3 righe (2 di commento). Accettabile, ma è un'altra
  affermazione letterale non vera.
- AC 4: `grep -n "createRequire\|/home/admin" render.mjs` → «0 righe»; è **1** (il commento `:13`). E l'AC 4
  (`render.mjs 1280 375`) è stato eseguito solo a 1280: l'ho eseguito io a 1280+375 → 14 righe, un login.

### NIT

`scripts/perf/README.md:17` rimanda a `load-testing.md` «for which ports are in use» (la pagina non nomina
porte); `load-testing.md:20-21` «there is no `psql` and no system Postgres on this host» — fatto di questa
macchina scritto in un doc di repo (falso nel container remoto di CLAUDE.md); `BASE` di default 3000 in
`bench.mjs:18`, 3001 in `render.mjs:18`; `page billing` ha `"burst": true` in `targets-hot.json` e no in
`targets.json`; `bench.mjs:21` usa `??` e con `TMPDIR=''` scrive in `./airmanager-perf` (lo `${TMPDIR:-/tmp}`
di shell tratta il vuoto come assente).

---

## Decisione PO — AC 9

**Domanda**: l'AC 9 chiede `stats?period=year` a 200 «sequenzialmente **e** in un burst di 10, con zero 5xx e
zero `53100`». Dopo la story: sequenziale 200 ✔, `53100` = 0 in sequenziale e in burst ✔ (a pool di default),
**burst 10 = 8/10 × 500 per `P2028`** ✘ (7/10 a pool 20), stessa cosa sulla pagina Statistiche (9-10/10).
Il `P2028` nasce dalla transazione interattiva di sola lettura di `listAircraft`, cioè dal perimetro «letture
senza transazione interattiva» che il piano assegna alla 17.5 (§6 della story lo esclude esplicitamente).
Il contratto del piano (P2) chiedeva solo «risponde 200 con parallelismo attivo»: il burst l'ha aggiunto la
story. Come si chiude?

| Opzione | Cosa | Costo / rischio |
|---|---|---|
| **A — Emendare l'AC 9** *(raccomandata)* | AC 9 → «200 sequenziale; zero `53100` in sequenziale e in burst di 10; il residuo `P2028` del burst (8/10 a pool 10, 7/10 a pool 20, pagina 9-10/10) è registrato e trasferito alla 17.5», e **la 17.5 riceve `listAircraft`/`listAllActiveAircraft` nel perimetro** (MINOR-1) con l'AC di burst su Statistiche invariato | Nessun codice; richiede la correzione del record (MAJOR-1) e l'aggiornamento del piano 17.5 |
| B — Mitigazione minima in 17.1 | (b1) alzare `transactionOptions.maxWait`; (b2) togliere la transazione da `listAllActiveAircraft` | (b1) viola [I-c]/AD-6 e scambia 500 con attese, **aumentando** la concorrenza sul DB e quindi la pressione su `/dev/shm` (MAJOR-2); (b2) apre `src/server/services/`, vietato da §0/§6 e in conflitto con l'epic 16 in parallelo |
| C — Tenere 17.1 aperta fino alla 17.5 | La story resta in review | Blocca l'harness (committato ma «non chiuso») che 17.2-17.4 devono usare; nessun beneficio tecnico |

**Raccomandazione: A**, a tre condizioni: (1) il record viene corretto con i numeri veri (MAJOR-1); (2) la
17.5 riceve il perimetro corretto (MINOR-1); (3) MAJOR-2 viene chiuso (commento corretto, e preferibilmente
`shm_size: 1gb`), perché togliere il `P2028` nella 17.5 aumenterà la concorrenza reale sulle query
parallele e riporterebbe il `53100` sotto `DATABASE_POOL_MAX` più alti.

---

## Verificato corretto (empiricamente)

- **Arbitro**: 537/537, 0 flaky, `E2E_EXIT=0`, DB fresco, container ri-tarato (sopra).
- **AC 8 (sola lettura, nessun ricreo)**: `pg_settings` → `shared_buffers` 65536×8kB = **512MB** (source
  `command line`), `work_mem` 16384 kB = **16MB**, `effective_cache_size` 393216×8kB = **3GB**,
  `max_parallel_workers_per_gather` **2** (source `default`), `max_parallel_workers` 8, `hash_mem_multiplier` 2,
  `dynamic_shared_memory_type` posix, `shared_memory_type` mmap, `max_connections` 100, v16.14;
  `SELECT count(*) FROM pg_db_role_setting` = **0**; `df -h /dev/shm` = `shm 512M 1.1M 511M 1%`;
  `docker inspect` → `ShmSize=536870912`, `Cmd=["postgres","-c","shared_buffers=512MB","-c","work_mem=16MB","-c","effective_cache_size=3GB"]`,
  creato `2026-09-26T23:16:06Z`, `RestartCount 0`; `docker volume inspect … CreatedAt` =
  **2026-08-07T16:16:50+02:00** (invariato); `airmanager_load`: 1 501 velivoli / 5 007 persone / 60 487 voli /
  104 612 movimenti (anche a fine review).
- **AC 7**: diff del compose = solo blocco `postgres` (+`shm_size`, +`command`, commenti); `mailpit`, volume,
  healthcheck invariati; `max_parallel_workers_per_gather` assente. L'aritmetica «16MB × 2 × 3 = 96 MB» è
  giusta; è il moltiplicatore dei gather a essere sbagliato (MAJOR-2).
- **AC 11**: `max` onorato, provato da Postgres (tabella MINOR-2: 6 connessioni a `DATABASE_POOL_MAX=3`).
  `PrismaPg(string)` ≡ `PrismaPg({ connectionString })` letto nel sorgente (`adapter-pg/dist/index.js:770-781`:
  la stringa diventa `{ connectionString: poolOrConfig }`); `pg-pool/index.js:89` `max || poolSize || 10`.
- **AC 13**: runtime `@prisma/client` 7.8.0 `client.js`: `transactionOptions:{maxWait:s.transactionOptions?.maxWait??2e3,timeout:s.transactionOptions?.timeout??5e3,…}`
  → i valori dichiarati sono i default effettivi, non solo quelli del `.d.ts`. Censimento forma `async`
  rifatto: **31 in 12 file** (per-file identico a §3.6); `maxWait`/`timeout:` in `src/server` = 0 fuori da
  `prisma.ts`; `git diff a6e2a39^ a6e2a39 --stat -- src/server/services src/app src/components src/lib/schemas e2e prisma CLAUDE.md docs/handoffs package.json package-lock.json playwright.config.ts vitest.config.ts eslint.config.mjs tsconfig.json scripts/{e2e,gates,reset-db}.sh` → **vuoto**.
- **AC 12/14**: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts` → **11 passed**.
  Discriminanza su copia isolata (nessun file tracciato toccato): riga tolta da `.env.example` → 1 rosso;
  riga tolta da `ci.yml` → 1 rosso; riga commentata in `.env.example` → 1 rosso; default portato a 20 →
  1 rosso («defaults to 10 …»). Valori: `0`, `-1`, `abc`, `''`, `' '`, `10.5`, `99999999999999999999`,
  `Infinity` **rifiutati**; `1e3`→1000, `0x10`→16, `' 10 '`→10, `1000000` accettati (nessun `.max()`, per
  AD-5). Nota: il test nominato verifica la presenza, non che il valore in `ci.yml` resti uguale al default
  (AD-7 non lo chiedeva).
- **AC 1-3 statici**: `scripts/perf/` = esattamente i 5 file; `grep -rn "/home/admin\|/tmp/claude" scripts/perf`
  → 0; nessuna data letterale nei JSON; `git diff 9fca2f5 HEAD -- package.json package-lock.json` → vuoto;
  `npx eslint scripts/perf` → exit 0, nessun output; import nudo di `@playwright/test`.
- **AC 2**: comando del README su `:3001` → tabella a 11 colonne, JSON sotto `OUT`, `git status --porcelain`
  identico prima/dopo (anche dopo `render.mjs`).
- **AC 4**: `render.mjs 1280 375` → 14 righe (7 pagine × 2 larghezze), un solo login, nessun artefatto nel repo.
- **AC 5** (dagli artefatti del dev, `after-full/targets.results.json`): 44/47 2xx; `api expiries expired` 200
  con `count` **3 925** ≠ 13 612 di `api expiries` (il filtro funziona davvero); `page public ppr` 200; i 3
  `422` portano un `note` che dice il vero: è il comportamento documentato dall'audit (§2.1, F5), non un
  fallimento nascosto.
- **AC 15/16**: `load-testing.md` ha le sei sezioni; nessun numero di misura in comune fra i due documenti
  (intersezione: numeri di sezione, porta 5432, `1280` come parametro, `53100` come codice); `CLAUDE.md` e
  `HANDOFF.md` fuori dal diff.
- **AC 17**: `npm run gates` → `PASS lint (20s)` · `PASS typecheck (3s)` · `PASS test (6s) — Tests 1880 passed (1880)` · `PASS build (29s)`.
- **AC 18**: diff di `ci.yml` = righe d'env (1 + 2 di commento), nessuno step/job/comando; niente migrazioni,
  schema, spec e2e.
- **AD-4 (regressione > 20 %)**: sui target già 200 *prima*, nessuno peggiora (es. `api transactions` 89→58 ms,
  `page billing` 460→441 ms, `pdf ppr` 2 228→2 075 ms): `effective_cache_size` 3GB resta giustificato.
- **Record §D** (pool 10 vs 20): 8/10 e 7/10 su `api stats year`, 0/10 su overview/billing — riprodotti
  (8/10, 7/10).

---

## Residuo e azioni per la sessione principale (fuori dal diff della story)

- **HANDOFF.md:445** («Ciclo per story … INVARIATO, riusarlo tale e quale», passo 2 «DB fresco») prescrive
  ancora `docker compose down -v && docker compose up -d`: distruggerebbe `airmanager_load` (3,2 minuti di
  seed + ricreo) a **ogni** story dell'epic 17, e contraddice `HANDOFF.md:15` e il nuovo `load-testing.md`.
  Va sostituito con la ricetta DROP/createdb/migrate/seed dentro il container **prima** della 17.2.
- TD della story (§«Da registrare in sprint-status.yaml») **non ancora registrati**: `reset-db.sh`/`session-start.sh`
  su Postgres di sistema; `DATABASE_POOL_MAX` da decidere in 17.5 — ora con il fattore 2× di MINOR-2 e il
  vincolo shm di MAJOR-2.
- Input per lo story file 17.5: le 8+1 letture interattive di MINOR-1; il meccanismo `listAllActiveAircraft`
  (15 transazioni sequenziali per richiesta); la tabella shm/connessioni di MAJOR-2.

## Stato della macchina

- Server di misura su `:3001` (4 avvii: default, pool 20, default, pool 3) **tutti fermati** per PID;
  `:3000`/`:3001` liberi; nessuna connessione client residua su Postgres.
- Container `airmanager-postgres-1` **mai ricreato, riavviato né fermato** (Created/StartedAt invariati,
  `RestartCount 0`); nessun `docker volume *` eseguito; solo `docker compose exec` in lettura (`SHOW`, `df`,
  `du`, `pg_stat_activity`, `EXPLAIN ANALYZE` di SELECT con `SET work_mem` di sessione).
- `airmanager_load`: nessuna scrittura diretta; effetto collaterale inevitabile dei login applicativi =
  **20 righe `LoginAttempt` `succeeded=true`** (dalle 23:42Z; non contano per il lock). Conteggi di dominio
  invariati.
- `airmanager` (e2e): lasciato come l'ha lasciato la suite (405 persone), non resettato.
- `.next`: ricostruito da `npm run gates` a fine review (stesso HEAD).
- File tracciati: **nessuna modifica** (le prove di discriminanza sono state fatte su una copia isolata in
  scratchpad). Artefatti della review: `/tmp/claude-1000/-home-admin-AirManager/87e8c4a0-e70c-4ef9-934e-3d9b5a5f0be7/scratchpad/r171/`
  (log dei 4 server, campioni shm/connessioni, script di burst, server finti).
