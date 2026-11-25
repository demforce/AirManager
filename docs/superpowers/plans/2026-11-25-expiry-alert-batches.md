# Expiry Alert Batches Implementation Plan

> **For agentic workers:** Execute natively with one development agent. Independent adversarial review follows separately.

**Goal:** Process at most 200 due expiry reminders per run, retry failed deliveries, and move aircraft email fan-out beyond request completion.

**Architecture:** Query only pending, active candidates with a deterministic `(expiresAt, id)` keyset; claim thresholds before delivery and release only this attempt's claims on a failed send. Count pending rows after the run. Keep the existing route guards and mail templates, extending only result/UI copy. Aircraft writes dispatch existing best-effort mail after commit without awaiting it.

**Tech Stack:** Next.js 16, Prisma/PostgreSQL 16, Vitest, Playwright, Mailpit.

**Spec:** `_bmad-output/implementation-artifacts/17-8-alert-job-a-lotti.md` including ratified §PO.

## Global Constraints

- One developer, synthetic data only; never run the job against shared `airmanager_load`.
- Dedicated Mailpit and isolated load DB for performance runs; no production mail.
- Preserve `@@unique([expiryId, threshold])`, ACL, route auth, admin digest behavior, and `main`.
- Before commit: green `npm run gates` and full `scripts/e2e.sh` on final candidate.

## Review Focus

- Two concurrent runs claim one threshold: P2002 loser sends no email.
- A failed delivery releases just its own thresholds and remains pending on the next run.
- Same-day expiries use Rome's date boundary while the keyset remains stable.
- P2003 from a concurrently deleted expiry is skipped.
- A nonresolving aircraft mail promise cannot delay the HTTP response, including archive.

## Tasks

### Task 1: Pending query and capped job

**Files:** `src/server/services/expiry-alerts.service.ts`, `src/server/services/expiry-alerts.service.test.ts`.

**Interface:** `runExpiryAlertsJob()` returns `ExpiryAlertsJobResult` with `remaining`; `EXPIRY_ALERTS_MAX_PER_RUN = 200` exported.

- [x] Add failing unit cases for query OR clauses, active person/type, order, cap, keyset, remaining, no N+1, P2002, P2003, failed send release, and three consecutive transport failures.
- [x] Run focused Vitest and confirm the new assertions fail on pre-fix code.
- [x] Implement pending query, capped keyset, batched locale lookup, targeted release, and final pending count.
- [x] Run focused Vitest without exported app env and confirm pass.

### Task 2: Contract, copy, and fan-out

**Files:** `src/lib/schemas/expiry-alerts.ts`, `src/lib/schemas/registry.ts`, `src/app/api/v1/jobs/expiry-alerts/route.test.ts`, `src/app/[locale]/dashboard/expiries/{scadenze-console,page}.tsx`, `messages/{it,en}.json`, `src/server/services/aircraft.service{,.test}.ts`.

- [x] Add failing contract and nonresolving-fan-out tests; verify red.
- [x] Add `remaining`, explain `candidates`, show queued count in the existing status/toast, update digest retry copy, and dispatch aircraft mail without awaiting either write path.
- [x] Verify focused tests and the existing UI flows.

### Task 3: Isolated performance and discriminants

**Files:** story Dev Agent Record and `docs/operations/load-testing.md`.

- [x] Clone the synthetic load DB via `pg_dump | psql` into uniquely named isolated DBs; start dedicated Mailpit on unused ports.
- [x] Measure pre-fix and post-fix HTTP runs with `scripts/perf/bench.mjs` on fresh copies, collect duration, per-recipient costs, SQL query counts, pending parity, and 200 cap.
- [x] Run each requested discriminant on an isolated source copy, hash original tracked files before and after, and record red/green evidence.

### Task 4: Final verification and local commit

- [x] Run `npm run gates` and full `scripts/e2e.sh` against synthetic fixtures on the final candidate.
- [x] Document commands, exits, sanitized diagnostics, measurements and limitations in story and load-testing page.
- [x] Commit with explicit pathspec; leave BMAD in review, without publishing or marking done.
