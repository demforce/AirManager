---
baseline_commit: 9fca2f5
---

# Story 17.1: Fondamenta di misura e configurazione

Status: **done** — 2026-09-27. **Modello dev**: **Sonnet 5 xhigh (backend/infra puro)** — questa story non tocca **una riga di UI** e non tocca **un solo file di dominio**: due script `.mjs` nuovi, un `docker-compose.yml`, un `prisma.ts`, uno schema env, una pagina `docs/` (§3.3 elenca i file, §6 quelli vietati). Review: **Opus 5 xhigh adversarial**, come sempre.

Implementazione: `a6e2a39`. Fix di review: v. Review Record in coda al file. Dev Agent Record: in coda a questo file.

> ⚠️ **PARALLELIZZABILE CON L'EPIC 16** (piano epic 16-18, «Decisione di fondo»: *«La 17.1 (fondamenta di misura) può correre in parallelo alla 16 perché non tocca il dominio»*). L'insieme dei file di questa story è **disgiunto** da quello di ogni story dell'epic 16: nessun file in `src/server/services/`, nessuno in `src/app/`, nessuno in `src/lib/schemas/`, nessuna migrazione, nessuno spec e2e. **Il dev di questa story non apre nessun file sotto `src/server/services/`** — se si trova a doverlo fare, ha sbagliato strada (§6 dice a quale story appartiene).
>
> ⚠️ **L'albero di lavoro è SPORCO e non è tuo.** Su `9fca2f5` c'è un altro dev agent che sta lavorando su file dell'epic 16 e che sta girando la suite e2e completa **sulla porta 3000**. Regole non negoziabili: (a) ogni riga citata in questo file è **misurata su `git show HEAD:<path>`**, e il dev legge così i file che trova modificati; (b) **mai `git add -A`, mai `git commit -a`**: al momento del commit l'albero contiene `.agents/`, `.claude/skills/*`, `.claude/workflows/`, `.github/{hooks,skills}/`, `skills-lock.json`, `_bmad-output/implementation-artifacts/aog-1b-review-report.md` che **non sono di questa story** — si committano **solo** i file di §3.3, nominati uno per uno; (c) il server di misura va su **:3001**, `:3000` è occupato (misurato: `next-server` pid 310233 in ascolto).
>
> ⛔ **`docker compose down -v` È VIETATO IN QUESTA STORY, in ogni sua forma.** Distruggerebbe il volume `airmanager_airmanager-postgres-data`, cioè **`airmanager_load` (il DB di carico di tutto l'epic 17, 121 MB, 3,2 minuti di seed) E `airmanager` (il DB e2e)**. È scritto in `docs/handoffs/HANDOFF.md:15`: *«MAI `docker compose down -v` (distruggerebbe `airmanager_load`)»*. Il comando di questa story è `docker compose up -d --force-recreate postgres`, che **ricrea il container e conserva il volume** (AC 8 lo verifica con un conteggio di righe, non con una promessa).
>
> ⚠️ **Ricreare il container Postgres interrompe chi lo sta usando.** `airmanager` (e2e, 12 MB) e `airmanager_load` (121 MB) vivono **nello stesso container** `airmanager-postgres-1`: un `--force-recreate` mentre un altro agent gira la suite e2e la fa fallire. **Prima di ricreare**: `scripts/e2e.sh status` e `ss -ltnp | grep :3000`; se una suite è viva, si aspetta (o si concorda con la sessione principale via messaggio). Il resto della story — scrittura dei file, gates, unit — non ha bisogno del container ricreato e si fa prima.
>
> **Da leggere PRIMA di scrivere una riga**: `_bmad-output/planning-artifacts/audit-2026-09-10/perf-load-report.md` **per intero** (§1 metodo e seed, §2 le tabelle di baseline, **§3 F4 e F10** = i due findings di questa story, §5 righe 5-6, §6 stato lasciato); la sezione **«Story 17.1»** e **«Architettura e vincoli»** del piano `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` (**contratto**, gli AC di record); `_bmad-output/planning-artifacts/audit-2026-09-10/ops-audit.md` §4 (tabella dei cap, contesto). Skill obbligatoria: `.claude/skills/karpathy-guidelines/SKILL.md` — questa story è **promozione di codice già scritto** più **~15 righe di produzione**: ogni riga in più va giustificata.

---

## Story

As a **team che deve dimostrare, story per story, che l'epic 17 ha reso l'app più veloce**,

I want **l'harness di misura dentro il repo, un Postgres di sviluppo che non muore alle query parallele e un pool di connessioni dichiarato**,

so that ogni story dell'epic 17 misuri il **prima/dopo con gli stessi strumenti e gli stessi numeri** (perf §1, F4, F10) e **nessuno rincontri i 500 da `53100`** che hanno costretto a misurare l'audit con il parallelismo spento.

### Il perché: l'audit ha misurato con strumenti che non esistono più

Il report di carico è pieno di numeri («Panoramica 2 634 KB», «43 417 nodi», «burst 10 → 10/10 errori»). Quei numeri sono stati prodotti da tre script che vivono **nello scratchpad di una sessione** (`/tmp/claude-1000/…/scratchpad/perf/`): una directory temporanea che nessuna sessione futura può aprire. Il report lo dice al §5: *«`bench.mjs`/`render.mjs` (nello scratchpad di sessione, **copiabili in `scripts/perf/`** se si vuole un gate)»*.

Sette story dell'epic 17 hanno un AC che comincia con «**Given** il DB di carico **When** misuro». Se lo strumento di misura non è nel repo, ognuna di quelle sette story si scrive il proprio, con la propria definizione di p50, il proprio login, la propria lista di target — e i «prima/dopo» non sono più confrontabili fra loro. Questa story chiude quel buco **prima** che si apra.

Le altre due metà sono ambientali, e sono il motivo per cui il run 1 dell'audit è stato buttato:

1. **`/dev/shm` = 64 MB** (default di Docker, nessun `shm_size` nel compose). Le query parallele di Statistiche e Panoramica muoiono con `53100 could not resize shared memory segment` → **HTTP 500 al 100 %**. Per poter misurare il resto, l'audit ha dovuto fare `ALTER DATABASE airmanager_load SET max_parallel_workers_per_gather = 0` — e l'ha **rimosso a fine sessione** (verificato ora: `pg_db_role_setting` è vuota, `max_parallel_workers_per_gather = 2`). **Il difetto è quindi vivo su questa macchina in questo momento**: è la condizione pre-fix, non una simulazione.
2. **Il pool è 10 connessioni per default implicito** (`PrismaPg(env.DATABASE_URL)` non passa `max`, `prisma.ts:18`), e le letture aprono transazioni interattive: a 10 richieste concorrenti arriva `P2028 Unable to start a transaction in the given time`. Questa story rende il numero **esplicito, dichiarato e regolabile**, e dichiara i timeout che generano quel messaggio. **Non** riscrive le letture: quella è la 17.5 (§6).

### Fatti misurati che vincolano il design

Tutto quanto segue è stato misurato **oggi, su questa macchina, su `9fca2f5`**.

| Fatto | Misura | Conseguenza sul design |
|---|---|---|
| `npm run lint` **lint anche i `.mjs`**, in qualunque directory | `eslint` v9.39.4 senza argomenti lint 579 file, fra cui `.claude/skills/impeccable/scripts/*.mjs` e `eslint.config.mjs`; `npx eslint --print-config scripts/perf/bench.mjs` → **81 regole attive**, fra cui `@typescript-eslint/no-unused-vars` | gli script promossi **devono passare lint** (AC 17: zero problemi, non zero errori) |
| `tsc --noEmit` **non** vede i `.mjs` | `tsconfig.json:25-32` include `**/*.ts`, `**/*.tsx`, `**/*.mts` — **non** `**/*.mjs` | `.mjs` + `node` è la scelta giusta: zero superficie di typecheck, zero toolchain. **Un `.mts` entrerebbe nei gate** (AD-1) |
| Lo stato attuale di lint è **302 problemi, tutti warning, zero errori** | 297 dalle directory skill non tracciate, 3 in `src`, 2 in `e2e`; `eslint` esce 0 (nessun `--max-warnings`) | il dev **non** confonde il rumore preesistente col proprio: la misura è `npx eslint scripts/perf` |
| `@playwright/test` si importa **come specificatore nudo** da un `.mjs` dentro il repo | `package.json` del pacchetto (1.61.1) ha `exports['.'].import = './index.mjs'`; probato: `import { chromium } from '@playwright/test'` da un `.mjs` alla radice del repo stampa `ok function` | il `createRequire('/home/admin/AirManager/package.json')` dello scratchpad **sparisce**: nessun path assoluto nel repo (AC 4) |
| **Non esiste `psql` sull'host, né un Postgres di sistema** | `which psql` → assente; `systemctl is-active postgresql` → `inactive`; `/usr/lib/postgresql` non esiste; l'unico Postgres è il container su `127.0.0.1:5432` | il runner **non può** chiamare `psql`: la risoluzione di `{PERSON}`/`{AIRCRAFT}` va **dentro `bench.mjs`** via API (AD-2), e `run-load-phase.sh` **non si promuove** (AD-10) |
| Il default del pool `pg` è **10**, in una riga leggibile | `node_modules/pg-pool/index.js:89`: `this.options.max = this.options.max \|\| this.options.poolSize \|\| 10`; pg-pool 3.14.0 | `DATABASE_POOL_MAX` default **10** = comportamento di oggi **byte-identico** (AD-5) |
| `PrismaPg` accetta un `pg.PoolConfig` | `node_modules/@prisma/adapter-pg/dist/index.d.ts:42`: `constructor(poolOrConfig: pg.Pool \| pg.PoolConfig \| string, …)` | `new PrismaPg({ connectionString, max })` è **tipato**, nessun cast (AD-5) |
| `transactionOptions` esiste **nel costruttore del client** | `node_modules/@prisma/client/runtime/client.d.ts:2039` `transactionOptions?: Transaction_2.Options` con doc-comment `:2035-2037` *«The default values for Transaction options / maxWait ?= 2000 / timeout ?= 5000»*; `Options = { maxWait?, timeout?, isolationLevel?, newTxId? }` (`:1927-1939`) | i timeout si dichiarano **una volta**, non 31 volte (AD-6) |
| Le transazioni interattive sono **31 in produzione**, in **12 file** | `grep -rn '\$transaction(async' src/server` → **35** occorrenze, di cui **4** in `*.test.ts`; `$transaction([` → 4; `maxWait`/`timeout:` in `src/server` → **0 occorrenze** | oggi girano **tutte** con i default 2000/5000: dichiararli agli stessi valori è **un no-op verificabile** (AD-6) |
| `prisma.ts` è importato da **57 file** | `grep -rln "db/prisma" src prisma e2e` | la modifica sta **dentro `createPrismaClient()`**: nessuna firma esportata cambia (§3.5) |
| `/dev/shm` del container è **64 MB**, e serve **solo** al parallelismo | `docker compose exec postgres df -h /dev/shm` → `shm 64M`; `SHOW dynamic_shared_memory_type` → **posix** (DSM in `/dev/shm`); `SHOW shared_memory_type` → **mmap** (`shared_buffers` **non** usa `/dev/shm`) | `shm_size` va dimensionato su `work_mem × hash_mem_multiplier × partecipanti`, **non** su `shared_buffers` (AD-4) |
| Postgres è **a configurazione di fabbrica**, e l'override dell'audit **non c'è più** | `shared_buffers` 128MB · `work_mem` 4MB · `effective_cache_size` 4GB · `maintenance_work_mem` 64MB · `max_connections` 100 · `max_parallel_workers_per_gather` **2** · `max_parallel_workers` 8 · `hash_mem_multiplier` 2 · v16.14; `pg_db_role_setting` **vuota** | il 500 da `53100` è **riproducibile ora**: la discriminanza di AC 9 non va simulata (AD-4, §4 passo 5) |
| La macchina è **4 CPU / 7 928 MB** | `nproc`, `free -m` | i valori prescritti in AD-4 sono per una macchina di sviluppo **4-8 GB**, dichiarato nel commento |
| Il DB di carico è **piccolo in byte** e grosso in righe | `airmanager_load` **121 MB** (`AccountMovement` 36 MB, `Flight` 27 MB, `Booking` 18 MB, `CashMovement` 11 MB); `airmanager` 12 MB; righe: 1 501 velivoli, 5 007 persone, 60 487 voli, 104 612 movimenti conto, 40 000 prenotazioni | `shared_buffers=512MB` **contiene l'intero DB di carico più quello e2e**: è la ragione del valore, non un rituale (AD-4) |
| Una singola query parallela **non** esaurisce 64 MB di shm | forzato `max_parallel_workers_per_gather=4`, `parallel_setup_cost=0`, `min_parallel_table_scan_size=0`, `work_mem=64MB` su un self-join di `AccountMovement`: piano `Gather` con **4 worker lanciati, 26,8 ms, nessun errore** | il `53100` è un fenomeno di **concorrenza**: la prova di AC 9 è **il burst**, non la richiesta singola (§4 passo 5, nota) |
| Il test di sincronia env **non vede** una variabile opzionale | `env.ci-sync.test.ts:20-22` costruisce `requiredKeys` con `!type.safeParse(undefined).success`: una var con `.default(10)` **passa** e resta fuori dai tre loop | servono **2 asserzioni nominate**, altrimenti l'allineamento `.env.example`/`ci.yml` non è protetto da niente (AD-7) |
| `docker-compose.yml` **non ha consumatori nel repo** | `git grep -l "docker compose\|docker-compose"` → `.env.example`, `README.md`, una migrazione (commento), due file di skill BMAD. `scripts/reset-db.sh:20-21` e `.claude/hooks/session-start.sh:38-47` usano un Postgres **di sistema** (`sudo -u postgres`, `service postgresql start`), **non** il compose | il blast radius del compose è **l'ambiente**, non il codice; la deriva di quei due script è **fuori scope** (§6) |

---

## §0 — Requisiti FISSI (contratto: piano epic 16-18, sezione «Story 17.1» + «Architettura e vincoli»)

| # | Requisito (dal piano — **AC di record**) |
|---|---|
| **P1** | `scripts/perf/`: lanciando `bench.mjs` e `render.mjs` (**promossi dallo scratchpad**, documentati **in testa** e in **`docs/`**) contro un server e un DB indicati si ottengono **p50/p95/burst per target** e **nodi/long task/fps per pagina**, **in Markdown**; `npm run seed:load` è documentato accanto (guardia `LOAD_SEED_TARGET_DB`). |
| **P2** | `docker-compose.yml`: Postgres parte con **`shm_size` ≥ 256 MB** e **parametri dichiarati** (`shared_buffers`, `work_mem`, `effective_cache_size`) **commentati con la ragione**; `GET /stats?period=year` sul DB di carico risponde **200 con parallelismo attivo**. |
| **P3** | `prisma.ts`: il pool ha **`max` esplicito** (default documentato, override via **env registrata in `.env.example` + `ci.yml` + `env.ci-sync.test.ts`**) e le **transazioni interattive dichiarano `maxWait`/`timeout`**. |
| **P4** | **La CI è invariata**: nulla di questa story entra nei gate; il seed di carico **non è mai eseguito in CI**. |

| # | Invariante (da «Architettura e vincoli» + regole di progetto) |
|---|---|
| **[I-a]** | **Ogni story dell'epic 17 si misura prima/dopo sul DB `airmanager_load` con l'harness di questa story** e riporta i numeri nel Dev Agent Record. Questa story **è** quell'harness: se lo strumento non è riproducibile da un'altra sessione, la story ha fallito anche con tutti gli AC verdi. |
| **[I-b]** | **Nessuna dipendenza npm nuova, e `package.json` non cambia affatto** (AD-1): l'harness usa `@playwright/test` (già presente, 1.61.1) e la `fetch` di Node 24. |
| **[I-c]** | **Comportamento di runtime invariato a env non impostata.** `DATABASE_POOL_MAX` assente ⇒ pool 10 (= default `pg` di oggi); `transactionOptions` dichiarati **ai valori di default documentati** ⇒ nessuna transazione cambia comportamento. Questa story **non deve** far passare o fallire nessun test che oggi passa o falla. |
| **[I-d]** | **Ogni guardia nuova nasce con un test.** Qui le «guardie» sono due: il default del pool (unit) e l'allineamento dell'env contract (unit nominato). Il resto è **verifica manuale misurata** (§4), perché riguarda un container e un browser: va nel Dev Agent Record con i numeri, non in un test automatico (AD-9). |
| **[I-e]** | **Il seed di carico non entra in CI e non tocca il DB e2e.** La guardia `LOAD_SEED_TARGET_DB` di `prisma/seed-load.ts:25-27` **non si tocca**, non si ammorbidisce, non si aggira. |
| **[I-f]** | **Zero contratti API, zero schema, zero migrazioni.** `src/lib/schemas/*`, `src/lib/schemas/registry.ts`, `prisma/schema.prisma`, `prisma/migrations/` **non si aprono**. L'OpenAPI generato è byte-identico. |

### Decisioni già chiuse che vincolano QUESTA story

| Decisione | Dove | Effetto vincolante qui |
|---|---|---|
| **`shm_size` e parametri Postgres nel compose** | piano epic 16-18, «Decisioni non sottoposte perché senza alternativa ragionevole (obiezione non pervenuta = accettate)» | **Non si apre AskUserQuestion** sul fatto che il compose vada toccato. I **valori** sono una scelta tecnica del dev, motivata in AD-4 e verificabile: se il dev li cambia, cambia anche la motivazione e la misura. |
| **La 17.1 non tocca il dominio** | piano, «Decisione di fondo» | Nessun file in `src/server/services/`. La metà «codice» di F4 (letture in transazione interattiva, fan-out della Panoramica) è **17.5**. |
| **`shm` 64 MB = story 17.1** | `docs/handoffs/HANDOFF.md:16`: *«è la story 17.1 (`shm_size` nel compose), non un difetto del codice»* | L'handoff ha già assegnato il finding: il dev **non lo riclassifica**. |
| **Reset del DB e2e solo dentro il container** | `docs/handoffs/HANDOFF.md:15`, `:435` (`npm run db:reset` **non funziona qui**) | Se serve un DB e2e pulito per il run d'arbitro, si usa la ricetta dell'handoff (DROP/createdb/migrate/seed dentro il container), **non** `scripts/reset-db.sh`, **non** `down -v`. |

---

## §1 — Decisioni architetturali (vincoli tecnici)

### AD-1 — `scripts/perf/` sono **cinque file**, `.mjs` girati con `node`, e `package.json` non cambia

```
scripts/perf/
  README.md          — il contratto d'uso dei due script (invocazione, env, output)
  bench.mjs          — costo HTTP: cold/p50/p95/max + burst, per target
  render.mjs         — costo browser: nodi, KB, domInteractive, long task, fps
  targets.json       — la lista completa (47 target: API, pagine, PDF)
  targets-hot.json   — i 14 target caldi (il default per l'epic 17)
```

Tre scelte, con la ragione misurata:

1. **`.mjs` + `node`, non `.ts` + `tsx`, e soprattutto non `.mts`.** `tsconfig.json:25-32` include `**/*.mts`: un `.mts` entrerebbe in `tsc --noEmit`, cioè **dentro i gate**, e uno script diagnostico che chiama `page.evaluate()` con codice browser costringerebbe a `any`, `@ts-expect-error` o tipi DOM in un progetto che typechecka il server. `.mjs` è **fuori** dal typecheck (misurato) e **dentro** il lint (misurato): esattamente il taglio giusto per un attrezzo. Node su questa macchina è **v24.15.0**; la CI usa Node 22 ma **non lancia mai questi script** (P4).
2. **Nessuno script npm nuovo.** `node scripts/perf/bench.mjs …` è già il comando; un alias in `package.json` aggiungerebbe una riga a un file che tre story dell'epic 16 stanno toccando in parallelo, per zero guadagno (le variabili d'ambiente andrebbero comunque passate a mano). `package.json` **non compare** in §3.3.
3. **Nessuna dipendenza nuova** [I-b]: `bench.mjs` usa solo `node:fs`, `node:path` e `fetch`; `render.mjs` importa `@playwright/test` (già devDependency, e la suite e2e ne dipende comunque).

### AD-2 — I placeholder si risolvono **dentro `bench.mjs`**, non in uno script di shell

`run-load-phase.sh` dello scratchpad risolve `{PERSON}`/`{AIRCRAFT}` con `docker compose exec -T postgres psql` e `sed`. Non è promuovibile: **su questa macchina non esiste `psql`** (misurato) e il comando `docker compose exec` presuppone il compose del repo, l'utente `airmanager`, il nome del DB — tre assunzioni che rendono lo strumento inutilizzabile da chiunque abbia un Postgres diverso. Inoltre lo script contiene il path dello scratchpad di sessione in 4 righe.

La risoluzione va quindi dentro `bench.mjs`, **con questa tabella esatta** (nessun placeholder in più):

| Placeholder | Da env (vince sempre) | Altrimenti | Usato da |
|---|---|---|---|
| `{PERSON}` | `PERSON` | `items[0].id` di `GET /api/v1/people?page=1` | 4 target (`api person account`, `api person movements`, `api person expiries`, `pdf account`, `page person`) |
| `{AIRCRAFT}` | `AIRCRAFT` | `items[0].id` di `GET /api/v1/aircraft` | 1 target (`api flights aircraft`) |
| `{TODAY}` | — | data-only UTC del momento del run | `api transactions month`, `api cash report month` |
| `{MONTH_START}` | — | primo del mese UTC corrente, data-only | idem |
| `{WEEK_FROM}` | — | istante ISO di 3 giorni prima, mezzanotte UTC | `api bookings calendar week` |
| `{WEEK_TO}` | — | `{WEEK_FROM}` + 7 giorni | idem |

Quattro vincoli su questa tabella:

- **Le date sono calcolate in UTC e va dichiarato** nel doc-comment. L'invariante «un solo calendario» dell'epic 16 vale per il **dominio**; qui una finestra di benchmark spostata di due ore non cambia nessuna misura, e importare `date-only.ts` in un `.mjs` fuori dal bundle non è possibile senza toolchain. **Dichiarare l'assunzione, non nasconderla** (Karpathy §1).
- **Perché placeholder e non date fisse**: lo `targets.json` dello scratchpad contiene `from=2026-09-07`, `to=2026-08-31`, `to=2026-09-10`. Committati, fra un mese misurano **finestre vuote** e la story che li usa registra 40 ms credendo di aver ottimizzato qualcosa. Un file di target committato **non può contenere una data letterale**.
- **Fail-fast**: dopo la sostituzione, se il `path` di un target contiene ancora `{`, `bench.mjs` esce **2** con un messaggio che nomina il target e il placeholder. Un target non risolto che diventa un 404 misurato è la peggiore delle uscite.
- **Provenienza registrata**: l'header del JSON dei risultati porta `{ person, aircraft, personFrom: 'env'|'api', aircraftFrom: … }`. Il `{PERSON}` risolto dall'API è il **primo in ordine alfabetico**, non il più pesante: una misura fatta così **non è confrontabile** con la baseline del report, che usò la persona con più movimenti. Il README dà le due query SQL, e §4 impone `PERSON=`/`AIRCRAFT=` espliciti per le misure di record dell'epic 17.

### AD-3 — L'output **non entra nel repo**

Lo `bench.mjs` di sessione scriveva `targets-<label>.results.json` **accanto al file dei target**: dentro `scripts/perf/`, cioè dentro il repo, cioè dentro `git status`, a ogni run. Inaccettabile per un file committato.

L'output va sotto `OUT`, default **`${TMPDIR:-/tmp}/airmanager-perf/`** — lo stesso idioma di `scripts/gates.sh:7` (`LOG_DIR="${TMPDIR:-/tmp}/airmanager-gates"`), quindi non serve una riga di `.gitignore` e non serve ricordarsi di nulla. Il nome del file è `<basename dei target>.results.json`. Lo stesso vale per `DUMP` (i corpi delle risposte): default **spento**, e quando è acceso scrive sotto `OUT/dump/`.

Verifica, e fa parte dell'AC 2: **`git status --porcelain` dopo un run è identico a prima del run.**

Asimmetria dichiarata: `bench.mjs` scrive il JSON di record **e** stampa la tabella Markdown su stdout; `render.mjs` stampa **solo** la tabella Markdown (le sue 8-14 righe *sono* il risultato: non c'è un secondo strato — burst, byte, conteggi — da conservare in JSON). Il README documenta la redirezione per chi vuole un file.

### AD-4 — Il compose: `shm_size` + tre parametri, e ciò che **non** va scritto

Forma prescritta (i commenti sono **parte dell'AC 7**: il piano chiede parametri *«commentati con la ragione»*):

```yaml
  postgres:
    image: postgres:16
    restart: unless-stopped
    # Parallel query allocates its shared hash tables in /dev/shm (DSM,
    # `dynamic_shared_memory_type = posix`); Docker's 64 MB default makes them
    # fail with `53100 could not resize shared memory segment` -> HTTP 500 on
    # /reports and /dashboard under load (perf report F4/F10, 2026-09-10).
    # 512 MB covers the worst case measured on the load DB: one gather can hold
    # work_mem * hash_mem_multiplier(2) * participants(3) ~= 96 MB, and
    # max_parallel_workers(8) allows ~4 concurrent gathers -> ~384 MB. tmpfs is
    # a cap, not an allocation. NOTE: `shared_buffers` does NOT live here
    # (`shared_memory_type = mmap`), so this value is unrelated to it.
    shm_size: '512mb'
    # Dev-machine tuning (assumes 4-8 GB RAM; this box: 7.9 GB / 4 CPU).
    # Postgres 16 factory defaults are 128MB/4MB/4GB (verified 2026-09-10).
    #  - shared_buffers 512MB: the whole load DB (121 MB) plus the e2e DB
    #    (12 MB) fit in cache, so measurements stop depending on the page
    #    cache; still only ~6% of RAM, which a box that also runs Next and
    #    Chromium can afford.
    #  - work_mem 16MB: the 24-26 monthly aggregates each page issues hash and
    #    sort over 104k-row scans (perf 2.4); 4MB spills them to disk. NOT a
    #    fix for F8 - the report measured that even 64MB does not help that
    #    query (the fix is one GROUP BY, story 17.4). Raising it also raises
    #    the /dev/shm demand above: the two values move together.
    #  - effective_cache_size 3GB: planner hint only, allocates nothing;
    #    ~RAM/2 is honest on a shared dev box (the 4GB default is a lie on a
    #    4GB machine).
    # max_parallel_workers_per_gather is DELIBERATELY not set: it must stay at
    # its default (2) so the shm fix is proven by shm, not by disabling
    # parallelism (which is what the audit had to do to measure at all).
    command: postgres -c shared_buffers=512MB -c work_mem=16MB -c effective_cache_size=3GB
```

Quattro vincoli:

- **`command: postgres -c …` è l'idioma dell'immagine ufficiale**: sovrascrive il `CMD`, l'`ENTRYPOINT` (`docker-entrypoint.sh`) resta e `initdb` continua a funzionare. Nessun `postgresql.conf` montato: sarebbe un file in più da tenere in vita per tre parametri.
- **Il volume è nominato e sopravvive** (`airmanager_airmanager-postgres-data`, misurato con `docker volume ls`): `docker compose up -d --force-recreate postgres` ricrea **il container**, non il volume. AC 8 lo verifica contando righe, non fidandosi.
- **`max_parallel_workers_per_gather` NON si tocca** (né nel compose, né con `ALTER DATABASE`): è la condizione che rende AC 9 una prova.
- **Se una misura peggiora**, il sospetto numero uno è `effective_cache_size` (3GB < 4GB spinge il planner verso i seq scan). Il dev misura i target caldi **prima e dopo** il ricreo (§4): se un target caldo regredisce oltre il 20 %, riporta `effective_cache_size` a `4GB` **e lo dichiara con il numero**. Su un DB da 121 MB interamente residente in 512 MB di cache l'effetto atteso è nullo — ma «atteso» non è «misurato».

### AD-5 — `max` esplicito, default **10**, e il default **non cambia**

```ts
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
```

`PoolConfig` accetta entrambe le chiavi (tipizzato, `adapter-pg/dist/index.d.ts:42`), quindi la stringa sparisce e non serve nessun cast.

**Il default resta 10**, ed è una decisione, non un'omissione:

- 10 è **esattamente** ciò che il pool fa oggi (`pg-pool/index.js:89`), quindi [I-c] tiene: gates, suite e2e e CI si comportano **identicamente**. Una story «fondamenta» che cambia il dimensionamento del pool cambierebbe il comportamento sotto carico di tutte le misure di baseline dell'epic 17 **nel commit che stabilisce quelle baseline**.
- Il `P2028` **non è causato dal cap del pool** ma da chi lo trattiene: letture in transazione interattiva e ~15 query in `Promise.all` per Panoramica (perf F4). Alzare `max` a 20 sposta la soglia, non chiude il difetto; e raddoppia le connessioni per istanza contro `max_connections = 100` (misurato), cioè **5 istanze Next al massimo** invece di 10.
- Quindi: il dev **misura** il burst a `max=10` e a `max=20` (§4 passo 6) e **registra i due numeri** nel Dev Agent Record. Quella misura è l'input con cui la **17.5** scegliera il valore, con i suoi fix in mano. **Nessuna promessa in questa story**: il burst può restare rosso a 20, e va detto.

Il doc-comment sopra la riga dichiara: il default 10 e dove leggerlo, la relazione `DATABASE_POOL_MAX × numero di istanze ≤ max_connections − riservate` (100 di default, `SHOW max_connections`), e che il pool è **per processo Node** (con `next start` in cluster o più container il conto va moltiplicato).

Schema: `DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10)`. Niente `.max(…)`: un tetto arbitrario in Zod sarebbe una regola inventata su una macchina che non conosciamo (Karpathy §2); la relazione con `max_connections` è **documentata**, non validata.

### AD-6 — `maxWait`/`timeout` **una volta**, nel costruttore, agli **stessi valori di oggi**

```ts
return new PrismaClient({
  adapter,
  // 31 interactive `$transaction(async …)` call sites across 12 service files
  // (measured on 9fca2f5) ran on the implicit defaults; declaring them here
  // makes the timeout that produces `P2028 Unable to start a transaction in
  // the given time` visible and tunable in ONE place. Values are Prisma's own
  // documented defaults (@prisma/client runtime/client.d.ts:2035-2037), so
  // behaviour is unchanged: raising `maxWait` trades P2028 errors for slower
  // requests under contention and belongs to story 17.5, which fixes the
  // cause (read-only interactive transactions holding a connection).
  transactionOptions: { maxWait: 2000, timeout: 5000 },
});
```

Perché il costruttore e non i 31 call-site: sono **31 righe in 12 file di dominio** (censimento in §3.6), tutti file che le story dell'epic 16 stanno toccando in parallelo — 31 conflitti di merge per un valore identico ripetuto 31 volte. `transactionOptions` nel costruttore imposta i **default** del client: un eventuale `$transaction(fn, { timeout })` per-chiamata continuerebbe a vincere, e oggi **non ne esiste nessuno** (misurato: zero `maxWait`/`timeout:` in `src/server`). Questa è la risposta della story alla domanda «come si dichiarano senza toccare 31 file».

Un unit **non serve** su questi due numeri (asserire che 2000 è 2000 non prova nulla); la prova è il `git diff --stat` di AC 13: **nessun file di `src/server/services/` nel diff**.

### AD-7 — L'env contract: quattro punti, e due asserzioni **nominate**

`env.ci-sync.test.ts:20-22` costruisce l'elenco delle chiavi da verificare con `!type.safeParse(undefined).success`. `DATABASE_POOL_MAX` ha un `.default(10)`: `safeParse(undefined)` **riesce**, la chiave **non** entra in `requiredKeys` e i tre `it.each` non la vedono. Se ci si fermasse allo schema, la regola di progetto (*«se una story introduce una env var, aggiornare NELLO STESSO COMMIT `.env.example`, `.github/workflows/ci.yml`… il test fallisce se divergono»*) sarebbe **vera solo per le variabili obbligatorie**, e questa storia la lascerebbe non protetta.

Quindi, nello stesso commit:

1. **`src/lib/env.ts`** — la chiave nello schema, con il commento di AD-5.
2. **`.env.example`** — riga **attiva** `DATABASE_POOL_MAX="10"` (non commentata: il regex del test è `^KEY=`) con il blocco di commento sopra, nello stile del file.
3. **`.github/workflows/ci.yml`** — una riga `DATABASE_POOL_MAX: 10` nell'`env` del job **`e2e`** (l'unico che apre un pool vero: il job `gates` punta a una porta morta, `ci.yml:21`). Il valore **è uguale al default del codice** ⇒ la CI si comporta in modo identico, ed è così che AC 18 e P4 restano entrambi veri: «CI invariata» = nessuno step, job o comando nuovo, nessun cambio di comportamento — **una riga di documentazione dell'env contract è l'eccezione dichiarata**.
4. **`src/lib/env.ci-sync.test.ts`** — un `describe` nuovo con **tre** test: il default (`envSchema.parse` di un ambiente minimo → `DATABASE_POOL_MAX === 10`), la coercizione (`'20'` → `20`, numero), e **una** asserzione nominata che `.env.example` e `ci.yml` la documentano entrambi. Il commento sopra spiega **perché** è nominata (le var opzionali sono invisibili ai loop generici), altrimenti la prossima persona la cancella come duplicato.

⚠️ Quel file **non deve** importare `@/server/db/prisma` (aprirebbe un pool e trascinerebbe la validazione eager di `@/lib/env` con una `.env` reale: è la classe di errori documentata in CLAUDE.md, 3 occorrenze). Verifica: `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts` deve passare.

### AD-8 — Due pagine di documentazione, una domanda ciascuna, **zero numeri in comune**

| File | Risponde a | Contiene |
|---|---|---|
| `scripts/perf/README.md` | «come si lancia questo attrezzo» | build una volta, server su una porta contro un `DATABASE_URL`, le due invocazioni con tutte le env, come si legge ogni colonna, le due query SQL per `PERSON`/`AIRCRAFT` rappresentativi, la ricetta delle query lente **non promossa** (AD-10), i limiti dichiarati (login via UI in `render.mjs`, date UTC, `{PERSON}` alfabetico dall'API) |
| `docs/operations/load-testing.md` | «come si riproduce l'ambiente di carico e quali sono i numeri di riferimento» | il DB `airmanager_load` (creazione da zero, `seed:load` con la guardia `LOAD_SEED_TARGET_DB`, volumi e conteggi al 2026-09-10, i 192 s), i parametri Postgres del compose con la ragione e la verifica, `DATABASE_POOL_MAX` e la formula, dove vive l'harness (**link** al README, non una copia), la **tabella dei numeri di record** (baseline/carico) con il rinvio al report per il metodo, la regola [I-a] |

La non-duplicazione è verificabile: **nessun numero di misura compare in entrambi i file** (i numeri stanno nella pagina `docs/`, le invocazioni nel README).

`README.md` alla radice prende **due righe**: `npm run seed:load` nella tabella degli script e un rimando a `docs/operations/load-testing.md`. **Nient'altro**: la tabella manca anche di `db:reset`, `seed:demo` e `gates`, ed è una lacuna preesistente che **non si sistema qui** (Karpathy §3 — ogni riga cambiata deve ricondursi alla richiesta).

⛔ **`CLAUDE.md` non si tocca.** È mantenuto dalla sessione principale (sezione «Manutenzione di questo file»). Idem `docs/handoffs/HANDOFF.md`: lo aggiorna il commit di chiusura della sessione principale, non il dev. Se il dev scopre un fatto che merita CLAUDE.md, lo scrive nel Dev Agent Record sotto «da portare in CLAUDE.md» e **basta**.

### AD-9 — Cosa **non** diventa un test automatico, e perché

Questa story configura un container e misura un browser. Tre cose sono deliberatamente **fuori** dai gate:

- **Nessuno spec e2e nuovo.** Un test che asserisse `SHOW shm` avrebbe bisogno di Docker dentro la suite; in CI il Postgres è un `services:` di GitHub Actions (`ci.yml:53-66`) **senza** il compose del repo, quindi asserirebbe una configurazione che in CI non esiste. Sarebbe un test verde che non prova niente.
- **Nessun gate di performance.** Il report suggerisce la possibilità (*«copiabili in `scripts/perf/` se si vuole un gate»*); un gate a soglie su una macchina condivisa con altri agent (il report stesso dichiara misure «pessimistiche del 20-40 %» per rumore) produrrebbe rossi non attribuibili. L'harness è uno strumento **di story**, non un cancello.
- **Nessun mock del pool.** Verificare che `PrismaPg` riceva `max` vorrebbe dire mockare `@prisma/adapter-pg` e asserire su una chiamata: un test che riscrive l'implementazione con parole diverse. Il default vive nello **schema env** (dove è testabile senza mock) e la riga si legge nel diff.

Quello che sostituisce i test è **§4**: una sequenza di verifiche con l'output atteso, i cui esiti verbatim vanno nel Dev Agent Record.

### AD-10 — L'aggregatore delle query lente **non** si promuove

`run-load-phase.sh:46-63` estrae le statement `duration:` dai log del container, le normalizza e le classifica con uno script Python inline. Ha prodotto la §2.4 del report (la tabella che ha identificato F8). **Non entra nel repo**: dipende da `log_min_duration_statement` impostato a mano sul container (impostazione **ripristinata** a fine sessione dell'audit, §6 del report), da `docker compose logs`, da un `grep 'db=airmanager_load'` e da `python3`. Quattro accoppiamenti all'ambiente per uno strumento che serve a **una** domanda («quale query domina»), che la 17.4 potrà rifare in cinque minuti.

Il README lo documenta come **ricetta**, in un blocco di codice, con la riga `ALTER SYSTEM`/`SET` necessaria e la nota di ripristinarla. Karpathy §2: niente codice speculativo nel repo per un uso ipotetico.

---

## §2 — Acceptance Criteria

### L'harness (P1)

1. **Given** un albero pulito **When** la story è consegnata **Then** `scripts/perf/` contiene **esattamente** `README.md`, `bench.mjs`, `render.mjs`, `targets.json`, `targets-hot.json`; `package.json` è **byte-identico** a `9fca2f5` (nessuna dipendenza, nessuno script); `grep -rn "/home/admin\|/tmp/claude" scripts/perf` → **0 righe**.
2. **Given** un server di produzione su `:3001` contro `airmanager_load` **When** lancio `PASSWORD=… BASE=http://localhost:3001 node scripts/perf/bench.mjs scripts/perf/targets-hot.json 5 10` **Then** ottengo su stdout una tabella Markdown con `name·status·cold_ms·p50_ms·p95_ms·max_ms·bytes·count·burst_wall_ms·burst_p95_ms·burst_errors`, il JSON di record è sotto `${TMPDIR:-/tmp}/airmanager-perf/targets-hot.results.json`, e **`git status --porcelain` è identico a prima del run**.
3. **Given** i sei placeholder di AD-2 **When** lancio senza `PERSON`/`AIRCRAFT` **Then** vengono risolti dall'API e il JSON registra valore e provenienza (`env` o `api`); **When** un target contiene un placeholder ignoto **Then** lo script esce **2** nominando target e placeholder (nessuna richiesta inviata). Nessuna data letterale in `targets.json`/`targets-hot.json` (`grep -nE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' scripts/perf/*.json` → 0 righe).
4. **Given** `node scripts/perf/render.mjs 1280 375` **Then** un solo login e una riga Markdown per **ogni coppia (pagina, larghezza)** con `nodes·html KB·domInteractive·load·longTasks·longTaskTotal·fps`; `@playwright/test` è importato come specificatore nudo (nessun `createRequire`, nessun path assoluto).
5. **Given** `targets.json` committato **When** lo lancio su `airmanager_load` **Then** ogni target risponde **2xx**, oppure porta nel JSON un campo `"note"` che dice perché no. I due casi noti: `api expiries expired` era **422 nella baseline** perché il file di sessione usava `status=EXPIRED` (l'enum è minuscolo, `src/lib/schemas/expiries.ts:18`) — nel file promosso è `status=expired` e **deve** dare 200, e un 200 lì **non è una regressione della baseline**; `page public ppr` diede **307** da admin autenticato (la pagina esiste, `src/app/[locale]/ppr/page.tsx`, e `/ppr` è in `PUBLIC_WEB_PATHS`, `src/proxy.ts:14`): il dev risolve il path reale o **rimuove il target**, non lo lascia a misurare un redirect.
6. **Given** `scripts/perf/README.md` **Then** documenta: build una volta e server su una porta scelta contro un `DATABASE_URL` scelto; le due invocazioni con **tutte** le env (`BASE`, `EMAIL`, `PASSWORD`, `OUT`, `DUMP`, `PERSON`, `AIRCRAFT`); come si legge ogni colonna; le due query SQL per la persona con più movimenti e il velivolo con più voli; `npm run seed:load` con la guardia `LOAD_SEED_TARGET_DB` (`prisma/seed-load.ts:21-27`); la ricetta **non promossa** delle query lente (AD-10); i limiti dichiarati.

### Il compose (P2)

7. **Given** `docker-compose.yml` **Then** il servizio `postgres` ha `shm_size` (**≥ 256 MB**; prescritto `512mb`) e `command: postgres -c shared_buffers=… -c work_mem=… -c effective_cache_size=…`, **ogni valore con il commento che ne dà la ragione e l'assunzione di macchina (4-8 GB)**; `max_parallel_workers_per_gather` **non compare**; il servizio `mailpit` e il resto del file sono invariati.
8. **Given** `docker compose up -d --force-recreate postgres` **When** interrogo il container **Then** `SHOW shared_buffers` = `512MB`, `SHOW work_mem` = `16MB`, `SHOW effective_cache_size` = `3GB`, `SHOW max_parallel_workers_per_gather` = `2`, `df -h /dev/shm` ≥ **512M**; **e i dati sono intatti**: `airmanager_load` ~121 MB con **1 501** velivoli / **60 487** voli / **104 612** movimenti conto, `airmanager` presente. Il volume `airmanager_airmanager-postgres-data` **non è stato ricreato** (`docker volume inspect` → stesso `CreatedAt` di prima).
9. ~~**Given** un server su `:3001` contro `airmanager_load` **e** `max_parallel_workers_per_gather` al default 2 **When** chiamo `GET /api/v1/stats?period=year` **Then** risponde **200**, sequenzialmente **e** in un burst di 10, con **zero 5xx** e **zero `53100`** nel log del server; il **prima** (con `/dev/shm` a 64 MB) è misurato e registrato nel Dev Agent Record con l'errore verbatim se si presenta.~~
   **Emendato — decisione PO 2026-09-27 (opzione A, v. Review Record):** **Given** un server su `:3001` contro `airmanager_load` **e** `max_parallel_workers_per_gather` al default 2 **When** chiamo `GET /api/v1/stats?period=year` **Then** risponde **200 sequenzialmente**; **zero `53100`** sequenzialmente **e** in un burst di 10; il **residuo `P2028`** sul burst (8/10 a pool 10, 7/10 a pool 20 — misurato, non un `53100`) è **misurato, registrato** e passa alla **17.5**, la cui pianificazione riceve `listAircraft`/`listAllActiveAircraft` nel proprio perimetro (v. MINOR-1 del Review Record). Il **prima** (con `/dev/shm` a 64 MB) resta misurato e registrato nel Dev Agent Record con l'errore verbatim.
10. **Given** tutta la story **Then** `docker compose down`, `down -v` e `docker volume rm` **non sono mai stati eseguiti** (il Dev Agent Record lo dichiara); se il DB e2e serve pulito, si usa la ricetta di `docs/handoffs/HANDOFF.md:15`.

### Il pool e le transazioni (P3)

11. **Given** `src/server/db/prisma.ts` **Then** `createPrismaClient()` costruisce l'adapter con `new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX })`, e il doc-comment nomina: il default `pg` (**10**, `pg-pool/index.js:89`), la relazione `DATABASE_POOL_MAX × istanze ≤ max_connections` (**100** di default) e che il pool è **per processo Node**.
12. **Given** `envSchema` **Then** ha `DATABASE_POOL_MAX` con **default 10**; un unit prova che a env non impostata vale `10` e che `'20'` è coercizzato a `20` (numero). **A env non impostata il comportamento di runtime è quello di `9fca2f5`** [I-c].
13. **Given** il client Prisma **Then** `transactionOptions: { maxWait: 2000, timeout: 5000 }` è dichiarato **una sola volta** nel costruttore, col doc-comment che nomina `P2028` e rinvia alla 17.5; **`git diff --stat` non contiene nessun file sotto `src/server/services/`** e le **31** transazioni interattive di produzione sono **invariate** (`grep -c '\$transaction(async' ` per file identico al censimento §3.6).
14. **Given** l'env contract **Then** nello **stesso commit**: `.env.example` ha la riga attiva `DATABASE_POOL_MAX="10"` documentata, `ci.yml` la porta nell'`env` del job `e2e` **con il valore uguale al default**, `env.ci-sync.test.ts` ha le asserzioni nominate di AD-7 con il commento che spiega perché sono nominate; `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts` passa.

### La documentazione (P1)

15. **Given** `docs/operations/load-testing.md` **Then** contiene le sei sezioni di AD-8 (DB di carico e `seed:load` con la guardia; parametri Postgres con ragione e verifica; `DATABASE_POOL_MAX` e formula; dove vive l'harness, **con link**; i numeri di record; la regola [I-a]); `README.md` guadagna **due righe** (`seed:load` nella tabella + il rimando) e **nient'altro**; **nessun numero di misura compare sia in `docs/operations/load-testing.md` sia in `scripts/perf/README.md`**.
16. **Given** i file di progetto **Then** `CLAUDE.md` e `docs/handoffs/HANDOFF.md` **non sono nel diff** (AD-8); ciò che meriterebbe di stare lì è elencato nel Dev Agent Record sotto «da portare in CLAUDE.md / HANDOFF (azione della sessione principale)».

### Non-regressione e gate (P4)

17. **Given** i gate **Then** `npm run gates` passa (lint + typecheck + unit + build) e **`npx eslint scripts/perf` riporta 0 problemi** (zero errori **e** zero warning — il rumore preesistente di 302 warning viene da directory non tracciate, §Fatti); il conteggio unit è quello di `9fca2f5` **più** i test di AC 12/14, nessun test preesistente cambiato.
18. **Given** la CI **Then** è invariata secondo P4: **nessuno step, job o comando nuovo**, il seed di carico non compare; l'unico diff in `ci.yml` è la riga d'env di AC 14, il cui valore uguaglia il default del codice. Zero migrazioni, zero modifiche a `prisma/schema.prisma`, zero diff nell'OpenAPI generato, zero spec e2e nuovi. **La suite e2e completa passa** in un run d'arbitro (`scripts/e2e.sh start`, esito letto con `scripts/e2e.sh status`), su DB e2e resettato, con l'esito verbatim nel record.

---

## §3 — Dev Notes: blast radius e censimento misurato su `9fca2f5`

### 3.1 — I sorgenti da promuovere e le modifiche esatte

Sorgente: `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/perf/`. **Leggerli prima di scrivere**: sono la cosa da promuovere, non un'ispirazione.

| File di partenza | Righe | Cosa si conserva **senza toccarlo** | Cosa cambia |
|---|---|---|---|
| `bench.mjs` | 137 | il barattolo dei cookie con `res.headers.getSetCookie?.()` (`:21-31`), il flusso Auth.js `GET /api/auth/csrf` → `POST /api/auth/callback/credentials` → verifica su `/api/v1/me` (`:45-61`), `pct()` (`:63-67`), warm-up + N sequenziali + burst opzionale (`:93-124`), la catena di estrazione di `count` (`:83`), la tabella Markdown (`:128-131`) | header d'uso riscritto; risoluzione placeholder (AD-2) con fail-fast; output sotto `OUT` (AD-3); `DUMP` sotto `OUT/dump/`; provenienza di `PERSON`/`AIRCRAFT` nel JSON |
| `render.mjs` | 57 | l'`addInitScript` col `PerformanceObserver` su `longtask` (`:23-26`), il campione fps di 600 ms in rAF (`:29-44`), le metriche estratte (`:45-53`), la riga Markdown (`:55`) | `createRequire('/home/admin/AirManager/package.json')` → `import { chromium } from '@playwright/test'`; `EMAIL` da env (default `admin@airmanager.local`) invece che cablata; **più larghezze in un solo login** (`page.setViewportSize` nel loop, `argv` = elenco, default `1280`); `PAGES` sovrascrivibile da env; header d'uso |
| `targets.json` | 47 target | i path, i nomi, i flag `burst` | le **tre** date letterali → `{TODAY}`/`{MONTH_START}`/`{WEEK_FROM}`/`{WEEK_TO}`; `page public ppr` risolto o rimosso (AC 5) |
| `targets-hot.json` | 14 target | idem | idem (`api bookings calendar week`) |
| `run-load-phase.sh` | 65 | — | **non si promuove** (AD-2, AD-10): il suo contenuto utile diventa README (avvio del server, query SQL degli id) e ricetta (query lente) |

### 3.2 — I numeri di record (baseline dell'epic 17)

Da `perf-load-report.md` §2 e §2.5 e dai risultati dello scratchpad (`baseline.md` = DB e2e; `load-2.md` = carico con rumore; `load-3.md` = carico a macchina quieta). Questi vanno nella pagina `docs/` (AC 15) e sono il **prima** contro cui 17.2-17.8 misureranno.

| Target | Baseline DB e2e p50 | Carico p50 (load-2 / load-3) | Burst 10 al carico |
|---|---|---|---|
| `api stats month` | 233 ms | 754 / 822 ms | 4,4 s **10 err** / 5,5 s 1 err |
| `api stats year` | 277 ms | 2 086 / 1 125 ms | — |
| `api transactions` | 123 ms | 463 / 210 ms | — |
| `api negative balances` | 96 ms (10,7 KB) | 287 / 172 ms (**643 KB, 3 996 righe**) | — |
| `page overview` | 818 ms (761 KB) | 651 / 926 ms (**2 683 KB**) | 5,8 s 0 err / 5,6 s **9 err** |
| `page bookings` | 710 ms (629 KB) | 270 / 463 ms (**2 584 KB**) | 2,3 s / 4,1 s 0 err |
| `page billing` | 359 ms (245 KB) | 830 / **1 693** ms (**2 199 KB**) | 6,9 s / **14,7 s** 0 err |
| `page reports` | 330 ms (247 KB) | 877 / **1 570** ms (1 257 KB) | 6,4 s **10 err** / 10,9 s **10 err** |
| `pdf ppr` (478 righe) | 1,4 s (15 righe) | 3,5 / 3,8 s | — |

Browser al carico (`render.mjs`, 1280): Panoramica **43 417 nodi**, `domInteractive` **7 917 ms**, 19 long task / **5 724 ms**, scroll **14 fps**; Pianificazione 42 754 nodi / 2 714 ms / 29 fps; Contabilità 15 202 nodi / 3 081 ms; Statistiche 16 158 nodi / 2 703 ms.

### 3.3 — File toccati (previsione; il record dichiara quelli effettivi)

| File | Natura | Nota |
|---|---|---|
| `scripts/perf/bench.mjs` | **nuovo** | promozione + AD-2/AD-3 |
| `scripts/perf/render.mjs` | **nuovo** | promozione + import nudo |
| `scripts/perf/targets.json` | **nuovo** | placeholder al posto delle date |
| `scripts/perf/targets-hot.json` | **nuovo** | idem |
| `scripts/perf/README.md` | **nuovo** | AD-8 |
| `docs/operations/load-testing.md` | **nuovo** | AD-8 (la directory `docs/operations/` nasce qui: `docs/` oggi ha `design-reference`, `handoffs`, `security`, `superpowers`) |
| `docker-compose.yml` | modificato | +`shm_size`, +`command`, +commenti (AD-4) |
| `src/server/db/prisma.ts` | modificato | 2 righe di codice + doc-comment (AD-5, AD-6) |
| `src/lib/env.ts` | modificato | 1 chiave + commento |
| `.env.example` | modificato | 1 riga attiva + commento |
| `.github/workflows/ci.yml` | modificato | **1 riga** nell'`env` del job `e2e` |
| `src/lib/env.ci-sync.test.ts` | modificato | 1 `describe` (3 test) + commento |
| `README.md` | modificato | **2 righe** |

**Vietati nel diff**: `CLAUDE.md`, `docs/handoffs/HANDOFF.md`, `package.json`, `package-lock.json`, `prisma/schema.prisma`, `prisma/migrations/*`, `prisma/seed-load.ts`, qualunque file sotto `src/server/services/`, `src/app/`, `src/components/`, `src/lib/schemas/`, `e2e/`, `playwright.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `scripts/{e2e,gates,reset-db}.sh`.

### 3.4 — Consumatori del compose: censiti, e sono zero nel codice

`git grep -l "docker compose\|docker-compose"` → `.env.example` (commento), `README.md` (§Setup), `prisma/migrations/20260729144406_remove_staff_role/migration.sql` (commento), due file di skill BMAD. **Nessuno script, nessun hook, nessun test** legge il compose:

- `scripts/reset-db.sh:20-21` usa `sudo -u postgres psql` / `createdb` → **Postgres di sistema**, che su questa macchina **non esiste** (`systemctl is-active postgresql` = `inactive`); `docs/handoffs/HANDOFF.md:435` lo dice già (*«lo script `npm run db:reset` NON funziona qui»*).
- `.claude/hooks/session-start.sh:38-47` idem (`service postgresql start`, `sudo -u postgres`).
- `playwright.config.ts:183-198` avvia **il server Next**, non il database.

Conseguenza: la modifica al compose non può rompere nessuno script del repo. La **deriva** di quei due file (assumono un Postgres di sistema in un ambiente che ha solo il container) è reale e **fuori scope** — §6.

### 3.5 — Consumatori di `prisma.ts`: 57 import, zero firme cambiate

`prisma.ts` esporta un solo simbolo (`prisma`), importato da **57** file (`src`, `prisma`, `e2e`). La modifica sta **dentro `createPrismaClient()`** (`:17-20`): nessun tipo, nessuna firma, nessun export cambia. Il singleton su `globalThis` in non-produzione (`:15`, `:24-26`) resta **identico** — non toccarlo: è la protezione contro l'esaurimento del pool in dev con l'hot-reload, e con `max` ora esplicito diventa ancora più rilevante.

I due seed (`prisma/seed.ts`, `prisma/seed-load.ts`) importano lo stesso client: erediteranno pool 10 e i timeout dichiarati. `seed-load.ts` inserisce con `createMany` in lotti (header `:10-19`) e non dipende da un timeout di transazione più lungo di 5 s; se il dev misura un seed che ora fallisce dove prima passava, **è una regressione di [I-c]** e va indagata, non aggirata alzando i numeri.

### 3.6 — Censimento delle transazioni interattive (per AC 13)

`grep -rn '\$transaction(async' src/server --include=*.ts` → **35** occorrenze in **16** file, di cui **4** in `*.test.ts` ⇒ **31 in produzione, 12 file**:

| Occorrenze | File |
|---|---|
| 6 | `src/server/services/ppr.service.ts` |
| 5 | `src/server/services/aircraft.service.ts` |
| 4 | `src/server/services/flights.service.ts` |
| 3 | `src/server/services/bookings.service.ts` |
| 3 | `src/server/services/accounts.service.ts` |
| 2 | `src/server/services/people.service.ts` |
| 2 | `src/server/services/expiries.service.ts` |
| 2 | `src/server/services/auth-tokens.service.ts` |
| 1 | `src/server/services/membership.service.ts` |
| 1 | `src/server/services/instructor-compensation.service.ts` |
| 1 | `src/server/services/cash.service.ts` |
| 1 | `src/server/auth/login-throttle.ts` |
| (4) | `*.test.ts`: `people`, `auth-tokens`, `aircraft`, `accounts` |

Più **4** `$transaction([...])` batch. `maxWait`/`timeout:` in `src/server`: **0**. Questo censimento è la prova che AD-6 (una dichiarazione nel costruttore) è la risposta e che 31 modifiche non servono. Il dev **rifà il conteggio** su HEAD all'inizio (un'altra story potrebbe averne aggiunta una) e lo riporta nel record.

⚠️ Perché quelle transazioni interattive **non** si toccano qui, nemmeno le due «ovvie» di lettura: `people.service.ts:231` ha un doc-comment di **9 righe** che spiega che la forma batch `$transaction([...])` fa emergere dal driver `pg` un avviso di deprecazione *«client already executing a query»* (riprodotto empiricamente, TD-5 dell'epic 9). Trasformarle è un lavoro con una trappola dentro: è **17.5**, con il suo unit di coerenza `items`/`total`.

---

## §4 — Piano di verifica (la sequenza che il dev esegue, con l'atteso)

Passi 1-3 non hanno bisogno del container ricreato: si fanno **prima**, e se un altro agent sta girando la suite e2e si resta qui.

1. **Ricognizione su HEAD.** `git rev-parse HEAD`; rifare il conteggio di §3.6; `git show HEAD:src/server/db/prisma.ts`, `HEAD:docker-compose.yml`, `HEAD:src/lib/env.ts`, `HEAD:.github/workflows/ci.yml`, `HEAD:src/lib/env.ci-sync.test.ts`. Dichiarare nel record ogni riga slittata rispetto a questo file.
2. **Scrivere codice, docs e test** (§3.3). → verifica: `npm run gates` **PASS** su tutte e quattro le voci; `npx eslint scripts/perf` → **0 problemi**; `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts` → verde.
3. **Misura PRIMA, con il compose vecchio.** Con il container **così com'è** (`/dev/shm` 64 MB, `shared_buffers` 128MB):
   ```bash
   docker compose exec -T postgres psql -U airmanager -d airmanager_load -Atc "SHOW shared_buffers"   # 128MB
   docker compose exec -T postgres df -h /dev/shm                                                     # 64M
   ```
   Server di misura su :3001 (NON toccare :3000):
   ```bash
   env -u NODE_ENV npm run build                    # una volta per il ciclo
   set -a; . <(grep -vE '^DATABASE_URL=' .env); set +a
   export DATABASE_URL='postgresql://airmanager:airmanager@localhost:5432/airmanager_load?schema=public'
   export JOBS_SECRET=<valore reale, non il placeholder>
   setsid env -u NODE_ENV npx next start -p 3001 > /tmp/airmanager-perf/server-before.log 2>&1 &
   ```
   Ids rappresentativi (le query stanno nel README):
   ```bash
   docker compose exec -T postgres psql -U airmanager -d airmanager_load -Atc \
     "select a.\"personId\" from \"Account\" a join \"Person\" p on p.id=a.\"personId\" where p.\"archivedAt\" is null order by (select count(*) from \"AccountMovement\" m where m.\"accountId\"=a.id) desc limit 1"
   docker compose exec -T postgres psql -U airmanager -d airmanager_load -Atc \
     "select \"aircraftId\" from \"Flight\" group by 1 order by count(*) desc limit 1"
   ```
   Poi `bench.mjs` sui target caldi con `PERSON=`/`AIRCRAFT=` espliciti, `render.mjs 1280 375`, e **`GET /api/v1/stats?period=year` sequenziale + burst 10**. → atteso: i numeri di §3.2 nell'ordine di grandezza, **e** il `53100` / 500 su Statistiche se si presenta: **catturare l'errore verbatim dal log del server** — è la discriminanza di AC 9.
4. **Coordinamento, poi ricreo del container.** `scripts/e2e.sh status` + `ss -ltnp | grep :3000`: se una suite è viva, **aspettare**. Poi, e **solo** questo comando:
   ```bash
   docker volume inspect airmanager_airmanager-postgres-data --format '{{.CreatedAt}}'   # prima
   docker compose up -d --force-recreate postgres
   docker volume inspect airmanager_airmanager-postgres-data --format '{{.CreatedAt}}'   # identico
   ```
   → verifica AC 8: i quattro `SHOW`, `df -h /dev/shm` ≥ 512M, i conteggi righe di `airmanager_load` (1 501 / 60 487 / 104 612) e la presenza di `airmanager`.
5. **Misura DOPO.** Riavviare il server su :3001 (il pool si è staccato al ricreo) e ripetere il passo 3 identico. → **AC 9**: `stats?period=year` **200** sequenziale e in burst, **zero 5xx**, **zero `53100`** nel log; tabella prima/dopo di tutti i target caldi nel record.
   > **Nota sulla forma della prova.** Misurato oggi: una **singola** query parallela forzata su questo DB usa pochi MB di DSM e non fallisce (piano `Gather`, 4 worker, 26,8 ms). Il `53100` nasce dalla **concorrenza** (più gather insieme), quindi se la richiesta singola risponde 200 anche **prima**, la discriminanza è il **burst di 10** — e se nemmeno il burst fallisce prima, lo si dichiara: la prova deterministica resta `df -h /dev/shm` (64M → 512M) più il burst **senza errori** dopo, contro i **10/10 errori** registrati dall'audit e riportati in §3.2.
6. **Il pool, 10 contro 20.** Con il compose nuovo, burst di 10 su Panoramica/Statistiche/Contabilità a `max` di default, poi con `DATABASE_POOL_MAX=20` nell'ambiente del server. → registrare **entrambi** i risultati (wall time ed errori) come input per la 17.5. **Nessuna promessa**: se il `P2028` resta, si scrive che resta.
7. **Arbitro.** DB e2e resettato con la ricetta dell'handoff, poi `scripts/e2e.sh start` e l'esito con `scripts/e2e.sh status` (**mai** `playwright test` in foreground, **mai** rilanciare la suite per sapere com'è andata). → AC 18.
8. **Commit** con i soli file di §3.3, nominati uno per uno.

**Il Dev Agent Record deve contenere**: la verifica della ricognizione (passo 1) e le righe slittate; una riga per AC con la prova; la tabella **prima/dopo** dei target caldi e delle pagine (i numeri sono il prodotto di questa story, non un contorno); l'esito verbatim di `npm run gates`, di `npx eslint scripts/perf` e della suite completa; il confronto pool 10 vs 20; le deviazioni motivate **con la misura**; i comandi Docker eseguiti (e la dichiarazione che `down`/`down -v`/`volume rm` **non** lo sono stati); i TD da registrare; ciò che va portato in `CLAUDE.md`/`HANDOFF` dalla sessione principale.

---

## §5 — Trappole note

1. ⛔ **`docker compose down -v`**: distrugge `airmanager_load` **e** il DB e2e (`HANDOFF.md:15`). Il comando di questa story è `up -d --force-recreate postgres`. Anche `docker compose down` (senza `-v`) è inutile qui: fermerebbe anche Mailpit, che serve alla suite e2e di un altro agent.
2. **Ricreare il container mentre gira la suite e2e** la fa fallire: i due DB stanno nello stesso container. Passo 4 esiste per questo.
3. **`:3000` è occupato** (`next-server` pid 310233 misurato). Il server di misura va su **:3001**. E se un server è già in ascolto sulla porta scelta, `next start` fallisce: controllare prima.
4. **`npm run db:reset` NON funziona su questa macchina** (assume un Postgres di sistema che non c'è, `HANDOFF.md:435`, §3.4). Per un DB e2e pulito: DROP/createdb/migrate/seed **dentro il container**.
5. **`JOBS_SECRET` placeholder**: con `NODE_ENV=production` la validazione eager di `env.ts:56-62` **rifiuta** il placeholder di `.env.example` e il server non parte. Esportarne uno reale prima di `next start` (`HANDOFF.md:16`).
6. **`NODE_ENV` dalla `.env` rompe `next build`**: sempre `env -u NODE_ENV` (regola di repo, `scripts/gates.sh:29-30`).
7. **Il lock anti-brute-force (TD-6) colpisce anche l'harness**: `bench.mjs` fa **un** login per run, `render.mjs` **uno** per invocazione; dieci run ravvicinati con lo stesso admin superano il cap per identifier e da lì **ogni** run fallisce al login, in modo deterministico e identico a un difetto dello script. Prima di accusare il codice: `SELECT identifier, count(*) FROM "LoginAttempt" WHERE "createdAt" > now() - interval '15 minutes' GROUP BY 1` **sul DB usato** (`airmanager_load`), e nel dubbio aspettare la finestra.
8. **Il `.env` punta al DB e2e**: `DATABASE_URL` di `.env` è `airmanager`. Misurare senza sovrascriverla significa **misurare il DB sbagliato** e ottenere numeri belli (12 MB contro 121 MB). Il `grep -vE '^DATABASE_URL='` del passo 3 esiste per questo.
9. **`eslint` lint i `.mjs`** (misurato): uno script promosso con una variabile non usata **fa un warning**, e AC 17 chiede zero. Ma i 302 warning che si vedono oggi vengono da directory **non tracciate** (`.claude/skills/impeccable/**`, `.github/skills/**`): non sono del dev e **non si sistemano** qui. Misurare solo `npx eslint scripts/perf`.
10. **`.mts` invece di `.mjs`** trascina gli script in `tsc --noEmit` (`tsconfig.json:31` include `**/*.mts`): è il modo più rapido per far diventare rossi i gate con un attrezzo diagnostico. AD-1.
11. **Il test `env.ci-sync.test.ts` non protegge una var opzionale** (AD-7): aggiungere solo la chiave allo schema e credersi coperti è l'errore naturale qui.
12. **`.env.example` con la riga commentata** non viene vista dal regex `^KEY=` del test: se il dev la commenta, l'asserzione nominata di AC 14 fallisce (ed è giusto che falisca).
13. **`getSetCookie()`** è la ragione per cui il barattolo dei cookie funziona: `Headers.get('set-cookie')` collassa i cookie multipli in una stringa e il login Auth.js (che ne manda più di uno) si rompe in modo silenzioso. Non «semplificare» quelle righe.
14. **`redirect: 'manual'`** in `bench.mjs` è deliberato: misura la risposta del server, non la catena di redirect. È anche il motivo per cui un target mal scritto appare come `307` invece di fallire (AC 5).
15. **La build sta dentro il cronometro della suite sotto `CI=1`** (`playwright.config.ts:188`): per una serie di run, costruire **una volta** e usare `E2E_REUSE_SERVER=1` (regola di repo). Vale anche per la serie di misure dei passi 3/5, che usano lo **stesso** build.
16. **`ALTER DATABASE … SET max_parallel_workers_per_gather`**: l'audit lo usò e lo rimosse. Se il dev lo reintroduce «per far passare la misura», ha spento la prova invece di ottenerla. `pg_db_role_setting` deve restare **vuota** (verificabile: `SELECT count(*) FROM pg_db_role_setting`).

---

## §6 — Fuori scope DICHIARATO

| Cosa | Perché non qui | Dove |
|---|---|---|
| Letture senza transazione interattiva (`listPeople`, `listExpiries`), fan-out della Panoramica, settings in una query | è **la metà codice di F4**, tocca `src/server/services/*` e ha la trappola del warning `pg` documentata (§3.6) | **story 17.5** |
| Timeline cappata, griglia in CSS, filtro server, DTO minimi dei picker | F1, F9 | **story 17.2** |
| Saldi negativi aggregati | F2 | **story 17.3** |
| Serie mensili in SQL, classifiche cappate dal server, indici `effectiveDate` | F3, F7, F8 — **compresa** ogni migrazione: questa story non ne crea nessuna | **story 17.4** |
| Typeahead server-side, `truncated`, fine di `OPTIONS_PAGE_SIZE` | F6, ops cap | **story 17.6** |
| PDF a stream | F5 | **story 17.7** |
| Alert job a lotti | ops cap #3 | **story 17.8** |
| Un **gate** di performance in CI (soglie su p50/nodi) | rossi non attribuibili su una macchina condivisa; il report stesso dichiara misure «pessimistiche del 20-40 %» per rumore (AD-9) | mai, salvo decisione PO |
| L'aggregatore delle query lente | 4 accoppiamenti all'ambiente per una domanda che si rifà in 5 minuti (AD-10) | ricetta nel README |
| La deriva di `scripts/reset-db.sh` e `.claude/hooks/session-start.sh` (assumono un Postgres di **sistema**, qui c'è solo il container) | è un cambio di comportamento di due strumenti condivisi con la sessione principale e con gli altri agent, in una story che sta già ricreando il container: due rischi nello stesso commit | **TD nuovo** (§7) |
| Ratifica delle **10 assunzioni del seed** di carico (perf §1.2) | serve solo se il seed diventa fixture ufficiale; è una decisione PO | TD già registrato in `sprint-status.yaml` |
| Tuning di produzione (`max_connections`, PgBouncer, `shared_buffers` su una macchina reale) | il compose è **sviluppo**; la pagina `docs/` dice come si ricalcolano i valori, e questo basta | fuori epic |
| `CLAUDE.md`, `HANDOFF.md` | mantenuti dalla sessione principale (AD-8) | commit di chiusura |

---

## §7 — Riferimenti

- **Contratto**: `docs/superpowers/plans/2026-09-10-epics-16-18-audit.md` → «Story 17.1», «Architettura e vincoli», «Decisione di fondo», «Copertura dei findings» (riga perf F4/F10).
- **Prove e numeri**: `_bmad-output/planning-artifacts/audit-2026-09-10/perf-load-report.md` → §1 (metodo, ambiente, seed e le sue 10 assunzioni), §2.1-2.3 (baseline), §2.4 (query costose), §2.5 (run d'arbitro), **§3 F4** (pool, transazioni interattive, `/dev/shm`), **§3 F10** (Postgres di fabbrica), §5 righe 5-6, §6 (stato lasciato). Contesto cap: `ops-audit.md` §4.
- **Sorgenti da promuovere**: `/tmp/claude-1000/-home-admin-AirManager/74e5575d-2543-45fb-a874-a977f6ab2c7d/scratchpad/perf/{bench.mjs,render.mjs,run-load-phase.sh,targets.json,targets-hot.json}` + risultati `{baseline,load-2,load-3,load-2.slow}.md`.
- **Codice**: `src/server/db/prisma.ts:15-26`, `src/lib/env.ts:13-34`, `src/lib/env.ci-sync.test.ts:20-37`, `docker-compose.yml:1-27`, `.github/workflows/ci.yml:17-23` (gates) e `:72-83` (e2e), `prisma/seed-load.ts:1-49`, `scripts/gates.sh:7`, `scripts/e2e.sh`, `playwright.config.ts:183-198`, `README.md:51-61`.
- **Regole di progetto**: `CLAUDE.md` → «Unit test e validazione eager dell'env», «Suite e2e: SEMPRE `scripts/e2e.sh`», «Build una volta per ciclo», «I test nuovi entrano in CI da soli», «Ripetere run e2e mirati fa scattare il lock anti-brute-force». `docs/handoffs/HANDOFF.md:15-16`, `:34`, `:435`, `:443`.
- **Skill**: `.claude/skills/karpathy-guidelines/SKILL.md` (obbligatoria). Nessuna skill di UI: questa story non ha UI.

### Da registrare in `sprint-status.yaml` (azione della sessione principale, non del dev)

- `17-1-fondamenta-misura-configurazione: backlog` → `in-progress` → `done` (riga 491).
- **TD nuovo**: `scripts/reset-db.sh` e `.claude/hooks/session-start.sh` assumono un Postgres **di sistema** (`sudo -u postgres`, `service postgresql start`) mentre sull'ambiente reale esiste solo il container del compose (misurato 2026-09-10: `systemctl is-active postgresql` = inactive, nessun `/usr/lib/postgresql`, nessun `psql` sull'host); `npm run db:reset` è quindi inutilizzabile e la ricetta vera vive solo in `HANDOFF.md:435`. Owner: strumenti di sessione, fuori dall'epic 17.
- **TD nuovo (se confermato dalla misura)**: `DATABASE_POOL_MAX` resta a 10 in questa story; il valore definitivo si decide nella **17.5** con i numeri del confronto 10/20 registrati qui.

### Domande aperte per la sessione principale

1. **Nessuna ratifica PO pendente.** `shm_size` e i parametri Postgres sono fra le decisioni «non sottoposte perché senza alternativa ragionevole» del piano; i **valori** sono una scelta tecnica misurata (AD-4) e revisionabile in review. Il dev **non** apre AskUserQuestion.
2. Se durante il passo 4 un altro agent sta girando la suite e2e e la finestra non si apre, il dev **si fermi e lo segnali**: consegnare i passi 1-3 (codice, docs, gates) e dichiarare i passi 4-6 non eseguiti è meglio che far fallire la suite di qualcun altro.

---

## Dev Agent Record

### §A — Verifica della ricognizione sul HEAD corrente

HEAD all'inizio del mio turno: `8ea3464` (52 commit avanti sul `baseline_commit: 9fca2f5` dichiarato in frontmatter — tutti di epic 16/aog-1b, nessuno tocca i file di questa story). Il lavoro era già parzialmente scritto (un dev Sonnet precedente, fermato dal PO prima di qualunque misura) e popolato nell'albero dal main session subito prima del mio turno. Riverificato riga per riga contro §1-§3 della story:

- `src/server/db/prisma.ts`: `PrismaPg({ connectionString, max })` + `transactionOptions: { maxWait: 2000, timeout: 5000 }` — i **valori** sono quelli prescritti in AD-5/AD-6. ⚠️ **Corretto in review (MINOR-2)**: la mia affermazione «byte-per-byte quanto prescritto … doc-comment incluso» era falsa — il doc-comment di `prisma.ts:18-22` non nominava `pg-pool/index.js:89` né il fattore per-layer richiesti dall'AC 11 (li citava solo `env.ts`, con un rimando). Corretto nel fix di review: il doc-comment di `prisma.ts` ora nomina direttamente tutti e tre gli elementi.
- `src/lib/env.ts`: `DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10)` — AD-5, nessun `.max()`.
- `.env.example` / `ci.yml` / `env.ci-sync.test.ts`: le tre parti dell'AD-7 tutte presenti (riga attiva, riga nel job `e2e`, `describe` con le 3 asserzioni nominate).
- `docker-compose.yml`: `shm_size: '512mb'` + `command: postgres -c shared_buffers=512MB -c work_mem=16MB -c effective_cache_size=3GB` con i commenti prescritti da AD-4, `max_parallel_workers_per_gather` assente. ⚠️ **Superato dal fix di review (MAJOR-2)**: `shm_size` è ora `1gb`, col commento riscritto — v. Review Record.
- `scripts/perf/{bench.mjs,render.mjs,targets.json,targets-hot.json,README.md}`: promozione fedele allo scratchpad (barattolo cookie con `getSetCookie()`, `redirect: 'manual'`, risoluzione placeholder dentro `bench.mjs` con fail-fast, output sotto `OUT` mai nel repo, `render.mjs` con import nudo di `@playwright/test`).
- `docs/operations/load-testing.md`: le sei sezioni di AD-8, nessun numero duplicato col README.

**Nessun drift trovato fra la story e il codice ereditato.** L'unico scostamento è una scoperta empirica mia, non del testo della story: §5 dell'AC 5 nomina "i due casi noti" (`expiries expired`, `page public ppr`) — entrambi già risolti correttamente nel draft ereditato (verificato §B, AC 5) — ma la mia misura sul DB di carico ne ha trovato **tre in più**, non anticipati dal testo: `pdf flights`/`pdf bookings`/`pdf expiries` rispondono `422 EXPORT_TOO_LARGE` (il DB di carico supera `PDF_EXPORT_MAX_ROWS` senza filtri). Ho aggiunto un campo `"note"` ai tre target in `targets.json` — esattamente la via che l'AC 5 stesso prevede per un target non-2xx legittimo — invece di rimuoverli o di lasciarli a misurare un errore non spiegato.

**Ricontrollo del censimento §3.6** (`grep -rn '\$transaction(async' src/server --include=*.ts`, esclusi i `*.test.ts`): **31 occorrenze in 12 file di produzione**, identico al censimento della story. Nota di metodo: il grep grezzo trova **32** righe perché il commento appena aggiunto sopra `transactionOptions` in `prisma.ts` contiene letteralmente la stringa `$transaction(async …)` fra virgolette — non è una call-site reale, l'ho esclusa a mano. Dettaglio per file (`grep -c`): `flights.service.ts` 4, `aircraft.service.ts` 5, `bookings.service.ts` 3, `accounts.service.ts` 3, `people.service.ts` 2, `expiries.service.ts` 2, `auth-tokens.service.ts` 2, `membership.service.ts` 1, `instructor-compensation.service.ts` 1, `cash.service.ts` 1, `ppr.service.ts` 6, `auth/login-throttle.ts` 1 — somma 31. `maxWait`/`timeout:` altrove in `src/server`: 0 occorrenze (confermato).

⚠️ **Corretto in review (LOW-5)**: quel grep, ancorato letteralmente a `$transaction(async`, non vede la forma altrettanto interattiva a callback **non-async** (`$transaction((tx) => qualcheFnAsync(tx, …))`), che esiste in **5** call-site: `accounts.service.ts:181`, `people.service.ts:710/715/718`, `users.service.ts:140` (quest'ultimo in un file NON contato sopra). Il totale delle transazioni interattive di produzione è quindi **36 in 13 file**, non 31 in 12 — ricontato a mano riga per riga, entrambe le forme, esclusi i `*.test.ts`. Nessun effetto sul verdetto di AC 13 (nessuna riga sotto `src/server/services/` nel diff di questa story) né su AD-6 (il costruttore dichiara i default una volta per **ogni** forma, non serviva distinguerle): è una correzione del censimento riportato, non del codice. `transactionOptions` governa **anche** la forma batch (`$transaction([...])`, stesso runtime `@prisma/client`), non solo le due forme interattive.

### §B — Riepilogo per AC con le prove

**AC 1** — `ls scripts/perf/` → esattamente `README.md bench.mjs render.mjs targets-hot.json targets.json`; `git diff 9fca2f5 -- package.json` e `git diff HEAD -- package.json` → entrambi vuoti; `grep -rn "/home/admin\|/tmp/claude" scripts/perf` → 0 righe.

**AC 2** — `bench.mjs scripts/perf/targets-hot.json 5 10` produce la tabella Markdown con tutte le 11 colonne (verbatim in §C) e scrive `${TMPDIR:-/tmp}/airmanager-perf/<basename>.results.json`; ho lanciato lo script **7 volte** in questa sessione (before/after/pool10/pool20/pdf-check/ac3/full-targets) sempre con `OUT` fuori repo — `git status --porcelain scripts/perf` prima di ogni commit mostrava solo i 5 file nuovi, mai un artefatto di run.

**AC 3** — placeholder risolti dall'API quando non impostati: verificato live (`unset PERSON AIRCRAFT`), il JSON di record porta `"personFrom":"api"`/`"aircraftFrom":"api"` con gli id risolti. Fail-fast: un target con `{NOTREAL}` fa uscire lo script con `exit 2` e il messaggio `unknown placeholder {NOTREAL} in target "bad target" (...)`, **nessuna richiesta HTTP inviata** (nessuna riga aggiunta al log del server). Nessuna data letterale: `grep -nE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' scripts/perf/*.json` → 0 righe.

**AC 4** — `render.mjs 1280` produce una riga per pagina (verbatim §C), un solo login per l'intera invocazione; l'import è `import { chromium } from '@playwright/test'` (riga 16). ⚠️ **Corretto in review (LOW-5, MAJOR-3)**: avevo eseguito l'AC solo a `1280`, non alla coppia `1280 375` che l'AC 4 stesso chiede (`render.mjs 1280 375`); ripetuto in review con entrambe le larghezze → **14 righe**, un solo login (confermato). E `grep -n "createRequire\|/home/admin" scripts/perf/render.mjs` → **1** riga (`:13`, il commento che spiega perché `createRequire` **non** serve — un falso positivo del grep, non una call-site reale), non 0 come avevo scritto. Nel fix di review (MAJOR-3) `addInitScript` è stato spostato fuori dal loop pagine: i conteggi `nodes`/`html`/`domInteractive`/`load` di §C sono invariati, i `longTasks`/`longTaskTotal` **non lo sono** — v. Review Record.

**AC 5** — run completo di `targets.json` (47 target, dump in `/tmp/airmanager-perf/after-full/`): **44 rispondono 2xx**. `api expiries expired` → **200** (lowercase `status=expired`, confermato). `page public ppr` → **200** (path `/it/ppr`, non redirige: `restPath` = `/ppr` è in `PUBLIC_WEB_PATHS`, nessun 307). I **tre** target senza 2xx (`pdf flights`/`pdf bookings`/`pdf expiries`, tutti `422 EXPORT_TOO_LARGE`) ora portano un `"note"` nel JSON — deviazione dichiarata in §E.

**AC 6** — `scripts/perf/README.md` letto per intero: contiene build+server (§1), le due invocazioni con **tutte** le env (§2-3, tabella), la spiegazione di ogni colonna (§2), le due query SQL (§4), `seed:load` con la guardia (§6), la ricetta non promossa delle query lente (§7, con l'`ALTER SYSTEM`/reset), i limiti dichiarati (§8).

**AC 7** — `docker-compose.yml` diff: `shm_size: '512mb'` + `command: postgres -c shared_buffers=512MB -c work_mem=16MB -c effective_cache_size=3GB`, ogni valore commentato con la ragione e l'assunzione di macchina (4-8 GB); `max_parallel_workers_per_gather` assente dal file; `mailpit` e il resto invariati (`git diff docker-compose.yml` tocca solo il blocco `postgres`). ⚠️ **Superato dal fix di review (MAJOR-2)**: `shm_size` è ora `1gb` (il `53100` era riproducibile a `512mb` col compose nuovo, sotto un burst misto a `DATABASE_POOL_MAX=20`); commento riscritto col meccanismo reale (per query parallela concorrente, non per `max_parallel_workers`) e le misure verbatim — v. Review Record. `shared_buffers`/`work_mem`/`effective_cache_size` **invariati**.

**AC 8** — eseguito dal main session (`docker compose up -d --force-recreate postgres`), verbatim ricevuto:
```
volume CreatedAt prima: 2026-08-07T16:16:50+02:00
volume CreatedAt dopo:  2026-08-07T16:16:50+02:00   (identico)
SHOW shared_buffers: 512MB
SHOW work_mem: 16MB
SHOW effective_cache_size: 3GB
SHOW max_parallel_workers_per_gather: 2
df -h /dev/shm: shm 512M 1.1M 511M 1% /dev/shm
airmanager_load.Aircraft: 1501 | .Flight: 60487 | .AccountMovement: 104612 | .Person: 5007
airmanager (e2e) SELECT 1: 1
```
Tutti i conteggi righe identici a quelli misurati da me subito prima del recreate (§C).

**AC 9** — ⚠️ **Riscritto in review (MAJOR-1): la versione originale di questa voce copriva il residuo con un numero sbagliato.** Quanto segue è il testo corretto, con l'AC emendato dalla decisione PO (v. §2 AC 9, Review Record).

Target committato con `"burst": true`, `api stats month`: **prima** `500` sequenziale, burst 10/10 errori, log con `53100 could not resize shared memory segment "/PostgreSQL.2852331310" to 4194304 bytes: No space left on device` (**72 eventi** nel log del run before, ognuno con `code:`/`originalCode:` = `'53100'` su due righe separate → 144 righe contenenti la stringa `53100`, non 108 come scritto qui in origine — riverificato: `grep -c "originalCode: '53100'" server-before.log` → 72, `grep -c 53100` → 144, v. §I); **dopo** `200` sequenziale, burst **0/10 errori**, **zero** `53100` nel log after (`grep -c 53100` → 0). Lo stesso per `page overview` (500→200, burst 10/10→0/10 errori).

Il target **letterale** dell'AC (`GET /api/v1/stats?period=year`) **non** è quello flaggato `burst` nel file committato (è `api stats month`) — un burst ad-hoc su di esso: **prima** `500` sequenziale e burst 10/10, tutti `53100`; **dopo** `200` sequenziale ma il burst mostra un residuo di **8/10 errori a `DATABASE_POOL_MAX` default (10)**, **7/10 a `DATABASE_POOL_MAX=20`** (misurato due volte indipendentemente: review e mio ricontrollo dopo il fix, stessi numeri), tutti `P2028` e **zero** `53100` in entrambi i casi. La causa **non** è, come avevo scritto, "un `Promise.all` annidato che tiene più connessioni": un `Promise.all` di query semplici fuori transazione non può produrre `P2028` (`pg-pool`, `connectionTimeoutMillis` = 0, nessun timeout di attesa). La causa reale è che `getStats` chiama `listAllActiveAircraft` (`stats.service.ts:132-138`), che pagina `listAircraft` (`aircraft.service.ts:212`) — una **transazione interattiva** — fino a **15 volte per richiesta** (1 447 velivoli non archiviati / 100 per pagina): un burst di 10 richieste apre fino a 150 transazioni interattive in sequenza contro un fan-out di ~22 query più leggere, e la transazione aspetta oltre `maxWait` (2 s) e muore con `P2028`. È la stessa causa, non una diversa, di quanto sotto per `page reports`.

**`page reports` è la stessa lettura `period=year`** (`src/app/[locale]/dashboard/reports/page.tsx:48-51`: `isYear = sp.period !== 'month'`, default `year`) e quindi la vede fallire per lo stesso motivo: i file grezzi di questo run riportavano **10/10** errori dopo il fix (non 0/10 come avevo scritto qui); ricontrollato in review con lo stesso harness committato → **9/10**; ricontrollato di nuovo da me dopo i fix di questa passata (harness corretto, `PERSON`/`AIRCRAFT` espliciti, stesso comando del README) → **8/10**, tutti `P2028`, zero `53100` nel log. I tre numeri (10, 9, 8 su 10) sono la stessa condizione di corsa sotto rumore di macchina condivisa, non tre misure incoerenti: il segnale stabile è "quasi tutte le richieste del burst falliscono con `P2028`, mai con `53100`".

Il target committato in burst (`api stats month`) **non** ha questo problema (0 errori dopo, confermato tre volte) perché aggrega in una sola query invece dei 12 fan-out di `period=year`/`listAllActiveAircraft` — motivo per cui il draft ereditato non l'ha flaggato come burst; resta comunque il target giusto per l'AC 9 emendato ("zero `53100` in burst"), mentre il residuo `P2028` di `period=year`/`page reports` passa alla **17.5**, il cui perimetro pianificato viene esteso a `listAircraft`/`listAllActiveAircraft` (v. Review Record, MINOR-1).

**AC 10** — dichiarato: nessun `docker compose down`, `down -v` o `volume rm` eseguito, né da me né (per quanto riportato) dal main session — solo `docker compose exec` (letture) e `docker compose up -d --force-recreate postgres` (main session).

**AC 11** — `prisma.ts`: `new PrismaPg({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX })`, doc-comment nomina il default `pg` (10, `pg-pool/index.js:89`), la relazione `DATABASE_POOL_MAX × istanze ≤ max_connections`, "per Node process".

**AC 12** — `envSchema.DATABASE_POOL_MAX` con `.default(10)`; unit `env.ci-sync.test.ts` (describe `DATABASE_POOL_MAX (optional, story 17.1)`): non impostata → `10`; `'20'` → `20` (numero, coercizione confermata da `typeof`). A env non impostata il comportamento è quello di `9fca2f5` [I-c] — verificato dai gate (nessun test preesistente cambiato, §I).

**AC 13** — `transactionOptions: { maxWait: 2000, timeout: 5000 }` dichiarato **una sola volta**, nel costruttore di `prisma.ts`, col doc-comment che nomina `P2028` e rinvia alla 17.5. `git diff --stat HEAD^ HEAD` (contenuto del mio commit `a6e2a39`, il solo di questa story) → **zero** file sotto `src/server/services/`. Le 31 transazioni interattive di produzione: invariate (§A).

**AC 14** — stesso commit: `.env.example` riga attiva `DATABASE_POOL_MAX="10"`; `ci.yml` `DATABASE_POOL_MAX: 10` nell'`env` del job `e2e`; `env.ci-sync.test.ts` con le 3 asserzioni nominate. `env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts` → **11 passed** (8 preesistenti + 3 nuove).

**AC 15** — `docs/operations/load-testing.md` letto per intero: le sei sezioni (DB di carico + guardia `LOAD_SEED_TARGET_DB`, parametri Postgres con verifica, `DATABASE_POOL_MAX` e formula, harness con link al README, tabella dei numeri di record, regola [I-a]). `README.md` alla radice: ⚠️ **corretto in review (LOW-5)** — avevo scritto "due righe aggiunte (`seed:load` nella tabella + rimando)", ma `git diff a6e2a39^ a6e2a39 -- README.md` mostra **una sola riga inserita** (la riga della tabella nomina già `docs/operations/load-testing.md`, quindi tabella e rimando sono la stessa riga, non due); nient'altro cambia in `README.md`. Nessun numero compare in entrambi i file (verificato a occhio: le due tabelle di numeri non condividono nessuna cifra di misura).

**AC 16** — `git diff HEAD^ HEAD -- CLAUDE.md docs/handoffs/HANDOFF.md` → vuoto, nessuno dei due nel commit. Cosa portare in CLAUDE.md/HANDOFF: §K sotto.

**AC 17** — §I (gate ed esiti verbatim).

**AC 18** — CI invariata: l'unico diff in `ci.yml` è nel job `e2e`'s `env` — ⚠️ **corretto in review (LOW-5)**: avevo scritto "è la riga `DATABASE_POOL_MAX: 10`" (singolare); `git diff a6e2a39^ a6e2a39 -- .github/workflows/ci.yml` mostra **3 righe** (la riga di valore più 2 righe di commento sopra, come da AD-7 p.3). Il valore resta uguale al default del codice; nessuno step/job/comando nuovo; `git diff --stat` su `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/schemas/registry.ts` (OpenAPI) → tutti vuoti; nessuno spec e2e nuovo (`git status --porcelain e2e/` → vuoto). Suite e2e completa: **fuori dal mio perimetro** (il main session la esegue come arbitro finale, come da divisione dei compiti concordata) — l'ultimo run osservato in questa sessione (prima del mio turno, DB e2e allora in uso) è **536 passed, 1 flaky** (classe nota, aggregato globale Billing-2, non attribuibile a questa story), `E2E_EXIT=0`.

### §C — Tabella prima/dopo (target caldi, `bench.mjs targets-hot.json 5 10`, pool 10 default)

| Target | Prima: status / p50 / burst_errors | Dopo: status / p50 / burst_errors |
|---|---|---|
| `api stats month` (burst) | 500 / 168ms / **10/10** | 200 / 242ms / **0/10** |
| `api stats year` | 500 / 310ms | 200 / 463ms |
| `api transactions` | 200 / 89ms | 200 / 59ms |
| `api negative balances` | 200 / 81ms | 200 / 74ms |
| `api instructor compensation` | 200 / 30ms | 200 / 27ms |
| `api bookings calendar week` | 200 / 30ms | 200 / 30ms |
| `pdf ppr` | 200 / 2228ms | 200 / 1994ms |
| `page overview` (burst) | 500 / 275ms / **10/10** | 200 / 482ms / **0/10** |
| `page bookings` (burst) | 200 / 201ms / 0/10 | 200 / 194ms / 0/10 |
| `page instructors` | 200 / 117ms | 200 / 108ms |
| `page billing` (burst) | 200 / 460ms / 0/10 | 200 / 441ms / 0/10 |
| `page reports` (burst) | 500 / 263ms / **10/10** | 200 / 570ms / **10/10 `P2028`** ⚠️ |
| `page logbook` | 200 / 92ms | 200 / 81ms |
| `page person` | 200 / 45ms | 200 / 43ms |

`render.mjs 1280` (nodi DOM / long tasks):

| Pagina | Prima | Dopo | Baseline carico (report, §3.2) |
|---|---|---|---|
| `/it/dashboard` (overview) | **35 nodi** (pagina in errore, 0 long task) | **43 826 nodi**, 5 long task/410ms | 43 417 nodi |
| `/it/dashboard/bookings` | 44 163 nodi | 44 163 nodi | 42 754 nodi |
| `/it/dashboard/billing` | 15 202 nodi | 15 202 nodi | 15 202 nodi |
| `/it/dashboard/reports` | **35 nodi** (pagina in errore, 0 long task) | **16 158 nodi**, 8 long task/644ms | 16 158 nodi |

Le pagine Overview e Reports **prima** rendevano solo la shell d'errore (i 500 di stats/API interne le rompevano lato client) — nodi/long-task non comparabili col report finale; **dopo** i conteggi tornano quelli della baseline del report (Reports **esatto**, Overview entro l'1%).

⚠️ **Corretto in review (MAJOR-1)**: la cella `page reports` (dopo) diceva **0/10** — falso. `page reports` è la stessa lettura `period=year` (`listAllActiveAircraft`/`listAircraft`, v. AC 9 sopra): i file grezzi di questo run davano **10/10** errori `P2028` dopo il fix, non 0/10; ricontrollato in review con lo stesso harness → 9/10; ricontrollato di nuovo dopo i fix di questa passata → 8/10 (stessa condizione di corsa, non tre misure incoerenti — v. AC 9). **Zero** `53100` in tutti e tre i ricontrolli.

⚠️ **Corretto in review (MAJOR-3)**: la colonna `long tasks`/`longTaskTotal` di questa tabella (5/410ms per Overview, 8/644ms per Reports) è affetta dal difetto di `render.mjs` per cui `addInitScript` veniva registrato una volta per pagina invece che una volta per invocazione, e ogni osservatore superstite continuava a contare sulle navigazioni successive: il conteggio della k-esima pagina misurata è gonfiato di un fattore legato al suo indice nella lista (dimostrato con un server finto a un solo long task noto, v. Review Record). `nodes`/`html KB`/`domInteractive`/`load` **non** sono affetti. Con il fix (init script registrato una sola volta, prima del loop) questi due numeri andrebbero rimisurati; non li ho rimisurati sull'app reale in questa passata (il fix è verificato deterministicamente col server finto, v. Review Record) — chi userà questi numeri come «prima» per una story 17.x deve ri-eseguire `render.mjs` col harness corretto, non fidarsi delle colonne long-task di questa tabella.

### §D — Il pool, 10 contro 20 (burst di 10, stesso compose nuovo)

Confronto sugli stessi 3 target (`api stats year`, `page overview`, `page billing`), stesso file di target, server riavviato fra le due misure:

| Target | `DATABASE_POOL_MAX=10` (default) | `DATABASE_POOL_MAX=20` |
|---|---|---|
| `api stats year` burst_errors | 8/10 (P2028) | 7/10 (P2028) |
| `page overview` burst_errors | 0/10 | 0/10 |
| `page billing` burst_errors | 0/10 | 0/10 |

**Nessuna promessa mantenuta, come previsto da AD-5**: raddoppiare il pool sposta di poco la soglia su `stats?period=year` (8→7 errori su 10, entrambi `P2028`, zero `53100` in entrambi i log) e non cambia nulla su `overview`/`billing` (già a 0 in entrambi i casi — la loro fan-out di query, pur presente, non arriva a saturare 10 connessioni in questo burst). ⚠️ **Corretto in review (MINOR-1)**: avevo attribuito la causa a "il `Promise.all` annidato di `stats.service.ts`" — sbagliato, un `Promise.all` di query fuori transazione non può produrre `P2028` (nessun timeout di attesa sul pool, `connectionTimeoutMillis` = 0). La causa reale è la **transazione interattiva** di `listAircraft` (`aircraft.service.ts:212`), raggiunta fino a 15 volte per richiesta da `listAllActiveAircraft` (`stats.service.ts:132-138`): è lei che aspetta `maxWait` e muore, non il `Promise.all` che la circonda. Il fix è **17.5**, non questa story — e il suo perimetro pianificato va esteso a `listAircraft`/`listAllActiveAircraft` (non ci sono oggi, v. Review Record). Questi numeri (misurati oggi, macchina condivisa) sono l'input dichiarato per quella story — non un giudizio definitivo sul valore giusto di `DATABASE_POOL_MAX`.

### §E — Deviazioni motivate

1. **Tre `"note"` aggiunte a `targets.json`** (`pdf flights`/`pdf bookings`/`pdf expiries`, tutti `422 EXPORT_TOO_LARGE`) oltre ai due "casi noti" che la story nominava. Scoperta empirica di questa story (il DB di carico ha 60 487 voli / 40 000 prenotazioni, ben oltre `PDF_EXPORT_MAX_ROWS`), non un bug: il cap è una guardia di dominio esistente e intenzionale (`exports.service.test.ts`), fuori scope per questa story. L'AC 5 stesso prevede esplicitamente questa via ("oppure porta nel JSON un campo `note`"), quindi non è una deviazione dal contratto ma un caso che il testo della story non aveva anticipato numericamente.
2. **AC 9 riportato con l'evidenza completa, non solo il target committato.** Il target letterale dell'AC (`stats?period=year`) non è quello che il file committato flagga come burst (è `api stats month`); ho misurato entrambi e riportato che il primo ha un residuo di errori **non-53100** dopo il fix (§B/§D). Karpathy §1: dichiarare l'ambiguità piuttosto che scegliere in silenzio quale dei due leggere come "il" target dell'AC.
3. **Nessuna modifica a `run-load-phase.sh`/aggregatore query lente**: confermato AD-10, restano ricetta nel README, non promossi.

### §F — TD da registrare (per la sessione principale)

- **17.5 ha già i suoi numeri di ingresso**: il confronto pool 10/20 (§D) e la localizzazione precisa del punto di rottura — ⚠️ corretto in review (MINOR-1): non il `Promise.all` di `stats.service.ts`, ma la transazione interattiva di `listAircraft` (`aircraft.service.ts:212`), raggiunta fino a 15 volte per richiesta da `listAllActiveAircraft` (`stats.service.ts:132-138`) — oltre alla Panoramica già nota da F4. Il perimetro pianificato della 17.5 (piano, «Story 17.5», AC 1) nomina solo `listPeople`/`listExpiries`: va esteso a `listAircraft`/`listAllActiveAircraft`, altrimenti la sua AC 3 («zero errori sul burst di Statistiche») fallirebbe. Le letture interattive di produzione candidate (censimento review): `aircraft.service.ts:212` (`listAircraft`), `:694` (`listHourMeterAdjustments`), `flights.service.ts:1901` (`listFlights`), `ppr.service.ts:349`, `expiries.service.ts:470`, `people.service.ts:231`, `accounts.service.ts:385` (`listAccountMovements`), `cash.service.ts:503`, più `accounts.service.ts:181` (`readOverview`). Nessuna azione di codice qui, solo la misura e la localizzazione.
- Il TD già registrato dalla story stessa (§ "Da registrare in sprint-status.yaml") su `scripts/reset-db.sh`/`session-start.sh` (Postgres di sistema inesistente) resta valido, non riverificato di nuovo qui.

### §G — File toccati (commit `a6e2a39`)

```
 .env.example                       |  7 +++
 .github/workflows/ci.yml           |  3 +++
 README.md                          |  1 +
 docker-compose.yml                 | 28 ++++++++++
 docs/operations/load-testing.md    | nuovo (151 righe)
 scripts/perf/README.md             | nuovo (175 righe)
 scripts/perf/bench.mjs             | nuovo (236 righe)
 scripts/perf/render.mjs            | nuovo (81 righe)
 scripts/perf/targets-hot.json      | nuovo (14 target)
 scripts/perf/targets.json          | nuovo (47 target, 3 con "note")
 src/lib/env.ci-sync.test.ts        | 27 +++++++++
 src/lib/env.ts                     | 10 ++++
 src/server/db/prisma.ts            | 21 ++++++--
```
13 file, tutti nominati uno per uno in due `git add` separati (mai `-A`/`.`); `package.json`/`package-lock.json` non toccati; nessun file sotto `src/server/services/`, `src/app/`, `src/components/`, `src/lib/schemas/`, `e2e/`, `prisma/migrations/`.

### §H — Cosa NON ho fatto

- Non ho toccato `CLAUDE.md`, `docs/handoffs/HANDOFF.md`, `sprint-status.yaml` (mandato alla sessione principale).
- Non ho eseguito `docker compose down`/`down -v`/`volume rm` in nessuna forma; il `--force-recreate` è stato eseguito dal main session su mia richiesta esplicita.
- Non ho resettato il DB e2e né lanciato la suite e2e completa (passo 7, mandato al main session).
- Non ho toccato nessun file sotto `src/server/services/` per "chiudere" il residuo P2028 di `stats?period=year` — è 17.5, per contratto (§0, §6).
- Non ho aggiunto `max_parallel_workers_per_gather` al compose (deliberatamente, AD-4: deve restare al default 2, è la prova che il fix è lo shm e non la disattivazione del parallelismo).
- Non ho aggiunto `.mts`, nessuna dipendenza, nessuno script npm.

### §I — Gate ed esiti verbatim

```
$ npm run gates
PASS  lint (20s)
PASS  typecheck (2s)
PASS  test (7s) — Tests  1880 passed (1880)
PASS  build (28s)
```
1880 = 1877 baseline (misurato in sessione dal main session prima del mio turno) + 3 nuove (`DATABASE_POOL_MAX`, `env.ci-sync.test.ts`).

```
$ npx eslint scripts/perf
(0 problemi — exit 0, nessun output)
```

```
$ env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts
Test Files  1 passed (1)
     Tests  11 passed (11)
```

### §J — Comandi Docker eseguiti (dichiarazione)

Da me: solo letture — `docker compose exec -T postgres psql ... SHOW/SELECT count(*)`, `docker compose exec -T postgres df -h /dev/shm`, `docker volume inspect ... --format '{{.CreatedAt}}'` (prima del recreate, per il confronto). **Zero** `up`/`down`/`restart`/`rm`/`volume rm` da parte mia.

Dal main session, su mia richiesta esplicita e dopo aver verificato `scripts/e2e.sh status` + `ss -ltnp | grep :3000` (nessuna suite viva): **un solo comando**, `docker compose up -d --force-recreate postgres`. Verbatim ricevuto in §B AC 8.

### §K — Da portare in CLAUDE.md / HANDOFF (azione della sessione principale)

- `scripts/perf/` e `docs/operations/load-testing.md` esistono ora nel repo: l'epic 17 ha il suo harness comune (regola [I-a]).
- Il Postgres di sviluppo ora parte con `shm_size: 1gb` (⚠️ era `512mb` alla mia consegna, alzato dal fix di review MAJOR-2: il `53100` era riproducibile a `512mb` con `DATABASE_POOL_MAX=20` sotto burst misto API+pagine) e i tre parametri tuned (§ "Fatti misurati" della story, AD-4) — se una futura story misura un regresso di query planning, il primo sospetto dichiarato è `effective_cache_size` (3GB, non più 4GB).
- Il pool `DATABASE_POOL_MAX` è **per layer di Next** (route handler e pagine), non per processo: un `next start` apre fino a **2×** il valore configurato (misurato in review, MINOR-2) — la formula di dimensionamento diffusa nei tre doc-comment va letta con quel fattore 2, non come "per processo".
- `DATABASE_POOL_MAX` esiste (default 10, invariato); il burst su `stats?period=year`/`page reports` mostra ancora `P2028` a pool 10 **e** 20 (residuo localizzato: la transazione interattiva di `listAircraft`, non un `Promise.all`) — input misurato per 17.5, il cui perimetro pianificato va esteso a `listAircraft`/`listAllActiveAircraft` (v. Review Record MINOR-1); non un difetto di questa story.
- Baseline unit dopo questa story: **1880** (era 1877).

---

## Review Record — 17.1

**Verdetto della review adversarial (Opus 5.5, `_bmad-output/implementation-artifacts/17-1-review-report.md`, 2026-09-27): SHIPPABLE-WITH-FIXES.** Fix agent (Sonnet 5 xhigh, backend/infra puro, stesso perimetro della story — nessun file sotto `src/server/services/`, nessuna UI): findings applicati sotto, `Status` portato a **done**.

### Decisione PO — AC 9 (opzione A, applicata)

Il testo originale dell'AC 9 (v. §2 "Il compose (P2)", riga con lo strike-through) chiedeva zero 5xx **anche** in burst su `GET /api/v1/stats?period=year`. Misurato (review + due ricontrolli indipendenti di questa passata): sequenziale sempre 200, `53100` sempre zero (sequenziale e burst), ma il burst di 10 mostra un residuo di errori `P2028` (8/10 a `DATABASE_POOL_MAX` default, 7/10 a 20) causato da una transazione interattiva estranea al `53100` che questa story chiude. L'AC è stato **emendato** (opzione A raccomandata dalla review): la condizione di record diventa "200 sequenziale; zero `53100` sequenziale e in burst; il residuo `P2028` è misurato, registrato e passa alla 17.5". Il perimetro pianificato della 17.5 riceve `listAircraft`/`listAllActiveAircraft` (v. MINOR-1 sotto) come input di questa story, non come azione di questa story.

### La decisione shm (MAJOR-2) — prima/dopo

| | shm 512 MB (consegna originale) | shm 1 GB (dopo il fix) |
|---|---|---|
| Pool 20, burst misto 10 API `stats?period=year` + 10 pagina `reports` (40 connessioni) | **7× `53100`**, picco `/dev/shm` 522 320 kB (**pieno**, capped) | **0× `53100`** (verificato due volte: server log `grep -c 53100` → 0), picco reale **708 544 kB (~692 MB)**, entrambe le richieste falliscono comunque con `P2028` (residuo noto, non un `53100`) |
| Pool 10 (default), stesso burst misto (20 connessioni) | non misurato a questo shm dalla review | **0× `53100`**, picco **347 488 kB (~339 MB)**, 20/20 `P2028` |
| Volume dati | `airmanager_load` 1 501/60 487/104 612/5 007, `airmanager` presente | **identico** dopo il secondo `--force-recreate` (volume `CreatedAt` invariato: `2026-08-07T16:16:50+02:00`) |
| `shared_buffers`/`work_mem`/`effective_cache_size`/`max_parallel_workers_per_gather` | 512MB/16MB/3GB/2 | **invariati**: 512MB/16MB/3GB/2 |

Il fix (`docker-compose.yml`): `shm_size: '512mb'` → `'1gb'`, commento riscritto (consumo per query parallela concorrente, non per `max_parallel_workers`; tabella di misure onesta; "measured" e "max_parallel_workers(8) allows ~4 gathers" rimossi; la riga dei 692 MB rimpiazza la stima "~510 MB" capped della prima misura). Ricreo eseguito dalla sessione principale (`docker compose up -d --force-recreate postgres`, due volte in totale su questa story — una per l'AC 8 originale, una per questo fix); mai `down`/`down -v`/`volume rm`.

### Findings — come sono stati chiusi

| # | Fix | Prova |
|---|---|---|
| MAJOR-1 | AC 9 emendato (sopra); Dev Agent Record §2 AC 9, §C, §D, §F, §K corretti coi numeri veri (`page reports` 10/10 dev → 9/10 review → **8/10** mio ricontrollo, stessa condizione di corsa, zero `53100` in tutti e tre) | Ricontrollo indipendente: sequenziale 5×200, burst 8/10 `P2028`/zero `53100` su `stats?period=year`; `bench.mjs targets-hot.json` → `page reports` 8/10 `P2028`, zero `53100` |
| MAJOR-2 | `shm_size` → `1gb`, commento riscritto | Tabella prima/dopo sopra; volume/parametri invariati (verbatim del secondo recreate) |
| MAJOR-3 | `render.mjs`: `addInitScript` spostato fuori dal doppio loop, registrato una sola volta | Server finto, 1 long task noto da 150 ms: prima `1,2,3,4,5,6,7,8` (multiplo dell'indice pagina) su 8 righe; dopo `1,1,1,1,1,1,1,1` su tutte e 8 le righe (comando e output nel Dev Agent Record §B AC 4) |
| MINOR-1 | Meccanismo corretto ovunque nel record (§A, §B AC 9, §D, §F, §K): non un `Promise.all`, ma la transazione interattiva di `listAircraft` (`aircraft.service.ts:212`), raggiunta fino a 15 volte per richiesta da `listAllActiveAircraft` (`stats.service.ts:132-138`); perimetro 17.5 esteso nel record | Lettura del codice (`stats.service.ts`, `aircraft.service.ts`) — nessuna riga di dominio toccata |
| MINOR-2 | Formula "× 2 × istanze" (non "× istanze") in `src/lib/env.ts`, `.env.example`, `docs/operations/load-testing.md`, doc-comment di `prisma.ts` (ora nomina `pg-pool/index.js:89`, la relazione con `max_connections` e il fattore per-layer, AC 11) | `git diff` dei quattro file (sotto); nessuna modifica di comportamento (solo commenti + un valore di config) |
| MINOR-3 | `docs/operations/load-testing.md` §5: tabella rietichettata "baseline audit 2026-09-10, Postgres di fabbrica, NON confrontabile"; il run post-17.1 (Dev Agent Record §C) nominato come riferimento "prima" dell'epic 17 | Lettura del file dopo il fix |
| LOW-1 | `bench.mjs`: validazione dei placeholder noti spostata PRIMA di `login()` | Server finto che logga le richieste: prima 5 richieste (csrf/callback/me/people/aircraft) prima dell'`exit 2`; dopo **zero** richieste (il file di log del server finto non viene nemmeno creato) |
| LOW-2 | `bench.mjs`: exit 2 se un placeholder usato da un target risolve a `''` | Server finto con lista persone vuota: prima misurava `/api/v1/people//account` silenziosamente (200); dopo `exit 2` con messaggio nominato, zero misura |
| LOW-3 | README §7: aggiunto `ALTER SYSTEM SET log_line_prefix = '%m [%p] db=%d '` (+ `RESET`) e `START_TS=$(date -Iseconds)`; "four environmental couplings" ora ne elenca 4 (`log_min_duration_statement`, `log_line_prefix`, `docker compose logs`, `python3`) | Lettura del file — non eseguito `ALTER SYSTEM` contro il container (fix di documentazione, come da mandato) |
| LOW-4 | README §6: `DATABASE_URL` sovrascritto esplicitamente su `airmanager_load` prima di `seed:load` | Lettura del file — la ricetta non può più seminare l'e2e per errore |
| LOW-5 | Censimento corretto: **36** transazioni interattive in **13** file (31 nella forma `$transaction(async (tx) => …)` + 5 nella forma `$transaction((tx) => fnAsync(tx, …))`, quest'ultima anche in `users.service.ts`, non contato prima); `72` eventi/`144` righe di `53100` (non 108); AC 4 ri-eseguito a `1280 375` (non solo 1280); `grep -n "createRequire\|/home/admin" render.mjs` → 1 riga (falso positivo del commento, non una call-site); README/`ci.yml` corretti a 1/3 righe; `prisma.ts:26` aggiornato con questi numeri e la nota sulla forma batch | Ricontati a mano (grep + lettura) su HEAD, verbatim nel Dev Agent Record §A |
| NIT | README §1: rimando falso rimosso ("for which ports are in use" → "check with `ss -ltnp`"); `load-testing.md`: "no psql on this host" → "the local compose setup has no psql"; `render.mjs` `BASE` default `3001` → `3000` (uguale a `bench.mjs`); `targets.json`: `page billing` ora `burst: true` (era assente, disallineato da `targets-hot.json`) e **trovato un secondo caso non segnalato dalla review** — `page logbook` aveva `burst: true` in `targets.json` ma non in `targets-hot.json`, riallineato a `false`/assente; `bench.mjs`: `TMPDIR ?? '/tmp'` → `TMPDIR || '/tmp'` (una stringa vuota ora cade su `/tmp` come la shell `${TMPDIR:-/tmp}`) | `git diff` dei file elencati; verificato che nessun target compare più con `burst` disallineato fra i due file (script di confronto ad-hoc, 0 disallineamenti residui) |

### Gate

```
$ npm run gates
PASS  lint (19s)
PASS  typecheck (3s)
PASS  test (7s) — Tests  1880 passed (1880)
PASS  build (27s)
$ npx eslint scripts/perf
(0 problemi — exit 0, nessun output)
$ env -u DATABASE_URL -u AUTH_SECRET npx vitest run src/lib/env.ci-sync.test.ts
Test Files  1 passed (1)
     Tests  11 passed (11)
```

Nessun test preesistente toccato; nessuna riga sotto `src/server/services/`, `src/app/`, `src/components/`, `src/lib/schemas/`, `e2e/` nel diff di questo fix (`git diff --stat` verificato prima del commit).

### Cosa NON è stato applicato

Nessuno dei findings è stato lasciato aperto: tutti i MAJOR/MINOR/LOW/NIT sopra sono chiusi. L'unica cosa esplicitamente NON fatta per mandato: nessuna riga toccata sotto `src/server/services/` (il residuo `P2028` è per contratto della 17.5, non di questo fix); nessun reset del DB e2e; nessuna suite e2e completa eseguita da questo fix agent (arbitro finale a carico della sessione principale, come da divisione dei compiti).
