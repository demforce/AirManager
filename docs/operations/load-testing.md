# Load testing: environment and reference numbers

This page answers **how the load environment is reproduced and what the
reference numbers are**. For how to run the measurement tool itself, see
`scripts/perf/README.md` — no number here is repeated there, and no
invocation there is repeated here.

Source of the method and the full analysis: `_bmad-output/planning-artifacts/audit-2026-09-10/perf-load-report.md`
(§1 method/seed, §2 baseline tables, §3 F4/F10 findings). This page carries
only what a future story needs to reproduce the environment and compare
against: the story-17.1 "fondamenta" (rule **[I-a]**, below).

## 1. The load database

`airmanager_load` is a disposable Postgres database, separate from the
shared e2e database (`airmanager`), filled by `prisma/seed-load.ts` to
stress-test the app at realistic volume. It is **never** created or touched
by CI (`.github/workflows/ci.yml` never invokes the seed).

To create it from scratch (inside the `postgres` container — the local
compose setup has no `psql` and no system Postgres, only the compose
container):

```bash
docker compose exec -T postgres psql -U airmanager -d airmanager -c \
  "SELECT 1" # confirm the container answers first

docker compose exec -T postgres createdb -U airmanager airmanager_load
DATABASE_URL='postgresql://airmanager:airmanager@localhost:5432/airmanager_load?schema=public' \
  npx prisma migrate deploy
DATABASE_URL='postgresql://airmanager:airmanager@localhost:5432/airmanager_load?schema=public' \
  npx prisma db seed   # base seed: creates the demo ADMIN + catalogues seed-load.ts reads by name

set -a && . ./.env && set +a
DATABASE_URL='postgresql://airmanager:airmanager@localhost:5432/airmanager_load?schema=public' \
  LOAD_SEED_TARGET_DB=airmanager_load npm run seed:load
```

The `LOAD_SEED_TARGET_DB` guard (`prisma/seed-load.ts`) refuses to run
unless it names the exact database in `DATABASE_URL` — this script is
destructive-by-volume and must never point at the e2e/dev database.

Measured on 2026-09-10 (scale 1, default): the seed takes **~192 s**
(~3.2 minutes) and leaves:

| Metric | Value |
|---|---|
| Aircraft | 1 501 |
| Persons | 5 007 |
| Flights | 60 487 |
| Bookings | 40 000 |
| Account movements | 104 612 |
| `airmanager_load` size | 121 MB (`AccountMovement` 36 MB, `Flight` 27 MB, `Booking` 18 MB, `CashMovement` 11 MB) |
| `airmanager` (e2e) size, for comparison | 12 MB |

Row counts vary slightly run-to-run in the organic/derived phases (see the
per-phase comments in `prisma/seed-load.ts`); the fixed-target phases are
exactly reproducible.

## 2. Postgres tuning (`docker-compose.yml`, `postgres` service)

Two changes, both dev-machine tuning (assumes 4-8 GB RAM):

| Setting | Value | Verify |
|---|---|---|
| `shm_size` | `512mb` | `docker compose exec -T postgres df -h /dev/shm` |
| `shared_buffers` | `512MB` | `docker compose exec -T postgres psql -U airmanager -d airmanager_load -Atc "SHOW shared_buffers"` |
| `work_mem` | `16MB` | `... -Atc "SHOW work_mem"` |
| `effective_cache_size` | `3GB` | `... -Atc "SHOW effective_cache_size"` |

Why: Postgres's parallel query workers allocate their shared hash tables in
`/dev/shm` (dynamic shared memory, `posix` backend) — Docker's 64 MB default
makes concurrent parallel queries fail with `53100 could not resize shared
memory segment`, surfacing as HTTP 500 on `/dashboard` and `/reports` under
load (perf report findings F4/F10). `shared_buffers` does **not** live in
`/dev/shm` (`shared_memory_type = mmap`) — it is raised separately so the
whole load DB (121 MB) plus the e2e DB (12 MB) fit in cache. Full reasoning
and the exact arithmetic behind each value: `docker-compose.yml`'s own
comments (the values are the contract, not this prose).

`max_parallel_workers_per_gather` is deliberately left at its default (`2`,
verify with `SHOW max_parallel_workers_per_gather`) — the `shm_size` fix
must be proven by giving parallel queries room, not by disabling
parallelism (which is what the audit had to do to measure anything at all
before this story).

Applying the tuning: `docker compose up -d --force-recreate postgres`
recreates the **container** (picks up `shm_size` and `command`), not the
named volume (`airmanager_airmanager-postgres-data`), so both databases
survive. Never `docker compose down -v` — it destroys that volume.

## 3. Connection pool (`DATABASE_POOL_MAX`)

`src/server/db/prisma.ts` passes `max: env.DATABASE_POOL_MAX` to the `pg`
adapter (`PrismaPg`). Default **10** — unchanged from the implicit `pg-pool`
default, so a deployment that never sets the var behaves exactly as before
this story. Raise it with the env var when a deployment can afford more
connections, subject to:

```
DATABASE_POOL_MAX × 2 × (number of Node processes serving this DATABASE_URL) <= max_connections - reserved
```

`max_connections` defaults to 100 (`SHOW max_connections`, `reserved` =
`superuser_reserved_connections`, 3 by default). The `× 2` is not one pool
per process: a production build opens it **per Next layer** — route
handlers and page rendering each instantiate `src/server/db/prisma.ts` in
their own layer, so one `next start` opens up to 2 × `DATABASE_POOL_MAX`
connections (measured: 6 client backends at `DATABASE_POOL_MAX=3` under one
API+page burst; multiply further by however many `next start`/container
instances point at the same database). This story does not change the
default or fix the `P2028 Unable to start a transaction in the given time`
that shows up under contention — see the harness's pool-10-vs-20 comparison
in story 17.1's Dev Agent Record for the numbers that inform story 17.5,
which fixes the underlying cause (read-only interactive transactions
holding a connection).

## 4. The measurement harness

Lives in `scripts/perf/` (`bench.mjs`, `render.mjs`, `targets.json`,
`targets-hot.json`) — see `scripts/perf/README.md` for how to run it. Every
epic 17 story measures its prima/dopo against `airmanager_load` with this
same tool (rule **[I-a]**, below).

## 5. Reference numbers (baseline vs. load DB)

**Baseline audit 2026-09-10, factory Postgres (`shared_buffers` 128 MB /
`work_mem` 4 MB / `effective_cache_size` 4 GB, `shm_size` 64 MB) — NOT
comparable to a post-17.1 measurement.** Full method in
`perf-load-report.md` §1-§2. These numbers were produced by the audit's own
scratchpad scripts, not by `scripts/perf/` (story 17.1 promoted and fixed
that harness afterwards — see its Dev Agent Record for what changed). A
story that diffs its own numbers against this table would credit itself
with story 17.1's container-tuning gains on top of its own.

| Target | Baseline (e2e DB) p50 | Load DB p50 (quiet run) | Burst of 10 on load DB |
|---|---|---|---|
| `api stats month` | 233 ms | 822 ms | 5.5 s, 1 error |
| `api stats year` | 277 ms | 1 125 ms | — |
| `api transactions` | 123 ms | 210 ms | — |
| `api negative balances` | 96 ms (10.7 KB) | 172 ms (643 KB, 3 996 rows) | — |
| `page overview` | 818 ms (761 KB) | 926 ms (2 683 KB) | 5.6 s, 9 errors |
| `page bookings` | 710 ms (629 KB) | 463 ms (2 584 KB) | 4.1 s, 0 errors |
| `page billing` | 359 ms (245 KB) | 1 693 ms (2 199 KB) | 14.7 s, 0 errors |
| `page reports` | 330 ms (247 KB) | 1 570 ms (1 257 KB) | 10.9 s, 10 errors |
| `pdf ppr` | 1.4 s | 3.8 s | — |

Browser cost at load (`render.mjs`, 1280 px): Overview **43 417 nodes**,
`domInteractive` **7 917 ms**, 19 long tasks / **5 724 ms**, scroll **14
fps**; Bookings 42 754 nodes / 2 714 ms / 29 fps; Billing 15 202 nodes /
3 081 ms; Reports 16 158 nodes / 2 703 ms.

**Epic 17's actual "before" reference is the post-17.1 run**, produced by
the committed harness (`PERSON`/`AIRCRAFT` explicit) against the retuned
container: story 17.1's Dev Agent Record §C (and its Review Record for the
corrected numbers). Story 17.2 onward measures its own prima/dopo against
that run, not against the table above.

## 6. Rule [I-a]

Every epic 17 story measures prima/dopo on `airmanager_load` with this
harness and reports the numbers in its own Dev Agent Record. A story that
claims a performance improvement without a before/after pair produced by
`scripts/perf/` has not met that story's acceptance criteria, regardless of
what else it changed.
