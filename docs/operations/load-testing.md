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
| `shm_size` | `1gb` | `docker compose exec -T postgres df -h /dev/shm` |
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
instances point at the same database). Allow about 20 MB of dynamic shared
memory per concurrent
parallel query when sizing for a mixed API/page burst. With the 1 GiB
container limit, 40 connections at pool 20 leave less headroom for other
processes than 20 connections at pool 10. Measure both pools with the
same data and CPU budget before raising the default. Story 17.5 requires
a 10-way burst below 3 s on each hot target and peak shared memory below
80% at pool 20 before selecting 20 to remedy a failing pool 10.

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

Browser cost at load (`render.mjs`, 1280 px): Overview **43 417 nodes**,
`domInteractive` **7 917 ms**, 19 long tasks / **5 724 ms**, scroll **14
fps**; Bookings 42 754 nodes / 2 714 ms / 29 fps; Billing 15 202 nodes /
3 081 ms; Reports 16 158 nodes / 2 703 ms.

**Epic 17's actual "before" reference is the post-17.1 run**, produced by
the committed harness (`PERSON`/`AIRCRAFT` explicit) against the retuned
container: story 17.1's Dev Agent Record §C (and its Review Record for the
corrected numbers). Story 17.2 onward measures its own prima/dopo against
that run, not against the table above.

### Story 17.5 on the integrated 17.2–17.4 base

Before and after used production builds, base `151d51d`, on the same
fresh synthetic `airmanager_load` snapshot (5,007 people, 1,501 aircraft,
60,018 flights, 40,000 bookings and 102,899 account movements). The
dedicated PostgreSQL 16 container used the §2 settings on a four-CPU
quota. Both runs used the same explicit person and aircraft, an empty
METAR fixture, and an empty AppSetting table exercising the ICAO fallback.

| Pool 10, five iterations then ten concurrent requests | Before p50 (ms) | After p50 (ms) | Before burst wall (ms) | After burst wall (ms) |
|---|---:|---:|---:|---:|
| Page overview | 343 | 300 | 2,949 | 2,226 |
| Page reports | 104 | 113 | 1,172 | 1,030 |
| Page billing | 368 | 487 | 2,139 | 2,411 |
| API stats year | 71 | 87 | 745 | 703 |
| API stats month | 75 | 68 | 554 | 636 |

All five bursts had zero HTTP errors before and after. The login probe
started a fresh credentials session 25 ms after issuing ten parallel
overview requests. Authentication and `/api/v1/me` succeeded in 394 ms
before and 465 ms after, with all ten page responses HTTP 200 each time.
The application logs contained zero occurrences of `P2028` and `53100`
in all four runs.

| Simultaneous 10 year API + 10 reports page | API wall (ms) | Page wall (ms) | HTTP errors | Sampled /dev/shm peak (KiB) |
|---|---:|---:|---:|---:|
| Before, pool 10 | 1,673 | 1,904 | 0 | 1,052 |
| Before, pool 20 | 3,822 | 4,059 | 0 | 1,052 |
| After, pool 10 | 2,862 | 3,087 | 0 | 1,052 |
| After, pool 20 | 2,121 | 2,423 | 0 | 1,052 |

Two bench processes warmed their own target and synchronized before the
timed bursts. Container `df -k /dev/shm` sampling captured 10, 23, 15 and
22 observations respectively. The 3 s criterion applies to each target
under ten concurrent requests. Pool 10 met it for all five endpoints,
and the login write succeeded with the existing 2,000 ms maxWait.

On a quiet server, the warmed admin dashboard request executed **82 → 53
SQL statements**, including **5 → 0 BEGIN** and **5 → 0 COMMIT**. Counts
include the layout and count each execution once, excluding parse and
bind events. AppSetting reads fell **7 → 3**. The updated page performed
one read covering all ten keys. The layout contributed the two remaining
reads, including its ICAO fallback.

## 6. Rule [I-a]

Every epic 17 story measures prima/dopo on `airmanager_load` with this
harness and reports the numbers in its own Dev Agent Record. A story that
claims a performance improvement without a before/after pair produced by
`scripts/perf/` has not met that story's acceptance criteria, regardless of
what else it changed.


## Story 17.4: report and ledger checkpoint (2026-11-25)

On the same synthetic load snapshot before and after 17.4, with pool 10
and the integrated 17.2 and 17.3 branches, the annual stats API p50 was
195 → 83 ms (110,356 → 4,739 bytes); the reports page response was
1,242,760 → 124,702 bytes. Both 10-way bursts completed without errors.
The mobile report kept 492 nodes, down from 16,162. The filtered ledger
kept the same exact total, 2,071, with p50 22 → 25 ms. Both effective-date
indexes were selected for the primary date filters in the actual Prisma
statements. The annual stats service fell from 105 to 18 SQL statements,
including the elimination of 15 BEGIN and 15 COMMIT statements.

## Story 17.8: expiry alert batches (2026-11-25)

All writes below used `airmanager_load_178_pre`, `_post`, or `_final`, made by
`pg_dump airmanager_load | psql <isolated database>` inside the local Postgres
container. The shared synthetic `airmanager_load` remained at **6,731**
`SentAlert` rows throughout. SMTP went only to a dedicated Mailpit at local
ports **1125/8125**; the shared e2e Mailpit was not used. A fresh clone is
required for each series because every job run consumes thresholds. The source
snapshot had 10,792 expiries. An independent SQL `EXISTS`/`NOT EXISTS` check
using the Europe/Rome date found **2,005** active, unarchived expiries with a
due threshold. The older story estimate of 2,013 referred to another seed
snapshot and date, not this copy.

| Measurement | Before, uncapped | After, batches of 200 |
|---|---:|---:|
| First HTTP run, `bench.mjs` cold sample | 123,294 ms | 12,003 ms |
| First run on final claim-ID source/build | — | **12,403 ms** |
| Holder emails in first run | 2,119 | 200 |
| Admin digests in first run | 4 | 4 |
| SQL executions in measured full run | 10,604 (5.00/holder) | 826 (4.13/holder) |
| Full batches, median / max | one unbounded run | 11,528 / 12,003 ms |
| Full-batch median per holder | 58.2 ms | 57.6 ms |

`scripts/perf/bench.mjs` was run with a one-target POST JSON and **zero timed
iterations**, so its `cold_ms` is the one destructive run; the zero-valued
`p50_ms` in its table is intentionally not a latency measurement. The final
source/build repeated the first full batch and returned `candidates=200`,
`alertsCreated=800`, `holderEmailsSent=200`, `digestEmailsSent=4`,
`remaining=1805`, with HTTP 200. The final source's first run used a direct
cron HTTP POST on a fresh `_final2` copy. A second 200-holder run on this
final claim-ID build returned HTTP 200 in **12,821 ms**, `remaining=1605`,
with **426 execute + 400 statement = 826 SQL executions** (4.13/holder).
PostgreSQL statement logging enabled **only
for each isolated database** supplied the SQL counts; the window excludes
benchmark login and counts each `execute` or `statement` once, including
`BEGIN`/`COMMIT`. A separate SQL list of the first 200 pending expiries on
the unchanged source copy, sorted by `(expiresAt, id)`, matched exactly the
200 distinct expiry IDs whose alerts were newly written in the final run
(`diff -q` exit 0). The same 200-ID comparison on `_final2` after explicit
claim IDs also returned `diff -q` exit 0; its marker set was selected by the
first-run `sentAt` window because the load seed already contains UUID IDs.

The full post-fix series used ten 200-person runs and one five-person run:
2,005 holder messages, 44 admin digests and 6,244 new `SentAlert` rows; each
full run was below the declared **20-second ceiling with healthy local SMTP**.
Three 10-second connection timeouts could exceed that ceiling during an
outage; the stop-after-three rule bounds the attempt count, not absolute time.
`remaining` stepped
1805, 1605, …, 5, 0. A twelfth run returned six zero counters, including
`remaining=0`; independent SQL confirmed zero eligible pending rows, while
114 due rows excluded by archive/inactive filters remained untouched. The
dedicated Mailpit reported 2,049 SMTP accepts and zero rejects; it retains
only a bounded mailbox, so `SMTPAccepted` is the count, not its current
`Messages` size.

A 30-recipient component probe using the same settings getter, template and
Nodemailer options measured p50 **settings 1.60 ms**, **template 1.13 ms**,
**transport construction 0.06 ms**, and **`sendMail` 49.15 ms**. `sendMail`
includes TCP connection, SMTP handshake and DATA; those phases are not
separable without changing the mail adapter. The first settings query was
cold (mean 13.53 ms), so these p50 figures describe warmed components and do
not sum exactly to the end-to-end HTTP cost.

An outage probe on the `_post` copy with three new synthetic expiries and
Mailpit stopped returned HTTP 200, `candidates=3`, `alertsCreated=0`,
`remaining=3`, and zero `SentAlert` rows for them. With the same dedicated
Mailpit restored, the next run sent three holder messages and four digests,
created three `SentAlert` rows and returned `remaining=0`. This proves retry
after a clear transport failure; it cannot prove whether an SMTP server
accepted a message immediately before a connection failure.
The final claim-ID build repeated this definite-outage probe on three new
synthetic expiries: zero markers remained after three refused sends; after
restoring the dedicated Mailpit, the next HTTP run wrote three markers and
sent three holder emails plus four digests. Claim IDs are generated before
`createMany`, and failure cleanup deletes by those IDs so a concurrently
replaced claim cannot be removed by an older failing attempt.

A concurrent HTTP probe on the drained `_post` clone inserted one new pending
expiry and issued two job POSTs simultaneously. Both returned HTTP 200; one
sent the holder email and four admin digests, and the other sent nothing.
Independent SQL found one `SentAlert` for the expiry, while the dedicated
Mailpit counted five SMTP accepts and zero rejects. This exercises the
database claim under overlapping requests; it does not cover an ambiguous
SMTP acceptance followed by a transport error.
The final claim-ID build repeated this overlap probe on another new expiry:
the two responses sent one holder email in total, SQL found one marker, and
Mailpit's accept counter advanced by five (one holder, four digests).

For aircraft email fan-out, 21 distinct synthetic APPROVED holders were
attached to each of two aircraft on the isolated `_post` copy. Real
authenticated HTTP requests returned in **58 ms** for grounding and **26 ms**
for archiving, while all 21 messages per request reached the dedicated Mailpit
about 1.1 seconds later. These local measurements exercise the self-hosted
Node process; in-process best-effort mail is not a durable queue across a
process crash or shutdown.
