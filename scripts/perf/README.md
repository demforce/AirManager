# Performance harness (`scripts/perf/`)

Two `.mjs` scripts, run with `node` (no build step, no new dependency —
`.mjs` stays outside `tsc --noEmit`, see story 17.1 AD-1), plus two target
lists. This page answers **how to run the tool**. For the numbers it has
already produced (baseline vs. load-DB) and the environment it measures
against, see `docs/operations/load-testing.md` — no number is duplicated
between the two pages.

## 1. Build once, start a server against the `DATABASE_URL` you want to measure

```bash
env -u NODE_ENV npm run build   # NODE_ENV from .env breaks `next build` — always unset it
set -a; . <(grep -vE '^DATABASE_URL=' .env); set +a
export DATABASE_URL='postgresql://airmanager:airmanager@localhost:5432/airmanager_load?schema=public'
export JOBS_SECRET='<a real value, NOT the .env.example placeholder>'   # production NODE_ENV rejects the placeholder at boot
env -u NODE_ENV npx next start -p 3001   # pick a free port — check with `ss -ltnp` first
```

Reusing an already-running server for a whole series of measurements (rather
than rebuilding per run) is the same rule as the e2e suite (`CLAUDE.md`
"Build una volta per ciclo").

## 2. `bench.mjs` — HTTP cost per target

```bash
BASE=http://localhost:3001 EMAIL=admin@airmanager.local PASSWORD=... \
  node scripts/perf/bench.mjs scripts/perf/targets-hot.json [iterations=5] [concurrency=10]
```

Env vars:

| Var | Default | Meaning |
|---|---|---|
| `BASE` | `http://localhost:3000` | server to hit |
| `EMAIL` | `admin@airmanager.local` | login used for the whole run |
| `PASSWORD` | — (required) | that user's password (`SEED_ADMIN_PASSWORD` in `.env`) |
| `OUT` | `${TMPDIR:-/tmp}/airmanager-perf/` | where the results JSON is written — never inside the repo |
| `DUMP` | off | when set (any value), also saves each target's raw response body under `OUT/dump/` |
| `PERSON` | — | id substituted for `{PERSON}`; if unset, resolved from the API (see §4) |
| `AIRCRAFT` | — | id substituted for `{AIRCRAFT}`; if unset, resolved from the API (see §4) |

Output: a Markdown table on stdout and a JSON file at
`OUT/<targets-file-basename>.results.json` with the same rows plus the
resolved `{PERSON}`/`{AIRCRAFT}` and their provenance (`personFrom`/
`aircraftFrom`: `"env"` or `"api"`).

### Columns

| Column | Meaning |
|---|---|
| `status` | HTTP status of the **last** iteration (`redirect: 'manual'` — a redirect shows as 3xx, not followed) |
| `cold_ms` | first request (warm-up), before the timed loop |
| `p50_ms` / `p95_ms` / `max_ms` | over `iterations` sequential requests after warm-up |
| `bytes` | response body size of the last iteration |
| `count` | `total`/`items.length` extracted from a JSON body, when present |
| `burst_wall_ms` | wall-clock time for `concurrency` parallel requests, targets flagged `"burst": true` only |
| `burst_p95_ms` | p95 of the individual request times inside that burst |
| `burst_errors` | how many of the burst responses were >= 400 (the `53100`/`P2028` discriminant — story 17.1 AC 9) |

## 3. `render.mjs` — browser cost per page

```bash
BASE=http://localhost:3001 PASSWORD=... node scripts/perf/render.mjs 1280 375
```

One login for the whole run (`EMAIL`/`PASSWORD` env, same defaults as
`bench.mjs`), then one Markdown row per (page, width) pair: DOM node count,
serialized HTML size, `domInteractive`/`load` from the Navigation Timing
API, long tasks (count + total duration) and a 600ms scroll fps sample.
Widths are positional args (default `1280` alone if none given); the page
list is `/it/dashboard`, `/dashboard/{bookings,billing,reports,fleet,pilots,logbook}`
by default, overridable with a comma-separated `PAGES` env var.

## 4. Representative `{PERSON}`/`{AIRCRAFT}`

Left unset, `bench.mjs` resolves both from the first page of the API
(`items[0].id`) — alphabetically first, **not** the heaviest account. For a
measurement meant to be compared against the numbers in
`docs/operations/load-testing.md`, pass the same representative ids that
baseline used explicitly:

```sql
-- person with the most account movements (not archived)
select a."personId" from "Account" a join "Person" p on p.id = a."personId"
where p."archivedAt" is null
order by (select count(*) from "AccountMovement" m where m."accountId" = a.id) desc
limit 1;

-- aircraft with the most flights
select "aircraftId" from "Flight" group by 1 order by count(*) desc limit 1;
```

```bash
docker compose exec -T postgres psql -U airmanager -d airmanager_load -Atc "<query above>"
```

Then export `PERSON=<id>` / `AIRCRAFT=<id>` before running `bench.mjs`.

## 5. Placeholders in `targets.json`/`targets-hot.json`

A committed target list can never contain a literal date — a month from now
it would measure an empty window and look like a win. Six placeholders are
substituted inside `bench.mjs` before any request is sent (nothing else may
be added without updating this table):

| Placeholder | Source | Used by |
|---|---|---|
| `{PERSON}` | `PERSON` env, else API (§4) | person-scoped API/PDF targets, `page person` |
| `{AIRCRAFT}` | `AIRCRAFT` env, else API (§4) | `api flights aircraft` |
| `{TODAY}` | date-only, UTC, at run time | `api transactions month`, `api cash report month` |
| `{MONTH_START}` | first of the current UTC month, date-only | idem |
| `{WEEK_FROM}` | UTC midnight, 3 days before run time | `api bookings calendar week` |
| `{WEEK_TO}` | `{WEEK_FROM}` + 7 days | idem |

If a target's `path` still contains `{...}` after substitution, `bench.mjs`
exits `2` naming the target and the unresolved placeholder — it never sends
a request for an unresolved path.

## 6. Load-test seed

```bash
set -a && . ./.env && set +a
# .env's own DATABASE_URL points at the e2e database (`airmanager`) — override
# it here, do not seed load data into it. See docs/operations/load-testing.md
# §1 for creating `airmanager_load` from scratch.
export DATABASE_URL='postgresql://airmanager:airmanager@localhost:5432/airmanager_load?schema=public'
LOAD_SEED_TARGET_DB=airmanager_load npm run seed:load
```

`prisma/seed-load.ts` refuses to run unless `LOAD_SEED_TARGET_DB` names the
exact database `DATABASE_URL` points at — it is destructive-by-volume and
must never target the shared e2e/dev database. Never run in CI (nothing in
`.github/workflows/ci.yml` calls it). Full seed shape, row counts and the
container tuning it exercises: `docs/operations/load-testing.md`.

## 7. Slow-query recipe (not a script)

The audit that produced this harness also ranked slow statements from the
Postgres log to find which query dominates a page (story 17.1 AD-10). That
aggregator is **not** promoted into the repo — it depends on
`log_min_duration_statement` and `log_line_prefix` set by hand, `docker
compose logs`, and `python3`, four environmental couplings for a one-off
question a future story can redo in five minutes:

```bash
# turn on statement logging for slow queries only, with the DB name in the
# log prefix (the container's default `log_line_prefix` is `%m [%p] `, with
# no `db=%d` — the grep below has nothing to match without this), then
# reset both afterwards
docker compose exec -T postgres psql -U airmanager -d airmanager_load \
  -c "ALTER SYSTEM SET log_min_duration_statement = 100;" \
  -c "ALTER SYSTEM SET log_line_prefix = '%m [%p] db=%d ';" \
  -c "SELECT pg_reload_conf();"

START_TS=$(date -Iseconds)
# ... run bench.mjs / exercise the app ...

docker compose logs postgres --since "$START_TS" | grep 'db=airmanager_load' | grep 'duration:' > slow.log

# reset when done — do not leave statement logging or the prefix change on
docker compose exec -T postgres psql -U airmanager -d airmanager_load \
  -c "ALTER SYSTEM RESET log_min_duration_statement;" \
  -c "ALTER SYSTEM RESET log_line_prefix;" \
  -c "SELECT pg_reload_conf();"
```

Then normalize/rank `slow.log` (group by statement with parameters
stripped, sum/max/avg duration) however suits the question at hand.

## 8. Known limits

- `render.mjs` logs in through the real login form (UI), not a cookie
  shortcut — it measures a page after a real navigation, at the cost of one
  extra page load per invocation.
- All computed dates/times are UTC. A benchmark window off by the local UTC
  offset does not change what these scripts measure.
- The API-resolved `{PERSON}`/`{AIRCRAFT}` (no `PERSON`/`AIRCRAFT` env) is
  whichever id sorts first from the API, not the heaviest account — pass
  the env vars explicitly (§4) for a measurement meant to be compared
  against a previous one.
- Repeated runs against the same admin login can trip the anti-brute-force
  lock (`CLAUDE.md` "Ripetere run e2e mirati..."): if every run suddenly
  fails at login, check `"LoginAttempt"` before suspecting the script.
