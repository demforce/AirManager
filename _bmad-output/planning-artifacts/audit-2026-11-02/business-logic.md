# AirManager — business-logic audit (ledger + operations)

- **Date**: 2026-11-02 · **Code audited**: `dev` @ `a598b26` plus the uncommitted 19.8 work in the tree (every finding below was checked against `HEAD` too; none depends on the dirty files).
- **Mode**: read-only. No repo file written, no DB write, no server, no e2e. Evidence = code reading with `path:line`, 4 scratch vitest probes (mocked Prisma), read-only SQL on `airmanager_load`.
- **Scratch artefacts** (all in `/tmp/claude-1000/-home-admin-AirManager/3d06ddd1-b828-45ca-bf7a-109f0d9fa254/scratchpad/audit/`): `vitest.audit.config.mjs`, `payout-twin-reversal.probe.test.ts`, `booking-own-move-approved.probe.test.ts`, `giroconto-reversal-revenue.probe.test.ts`, `rounding.probe.test.ts`, `probes1.sql`, `probes2.sql`, `probes3.sql`. Run: `cd /home/admin/AirManager && npx vitest run --config <scratch>/vitest.audit.config.mjs` → **4 files, 5 tests, all passed** (each test asserts the defective behaviour, so "passed" = reproduced).

---

## 1. Executive summary

The accounting core is still sound by construction: balances are always `SUM(AccountMovement)`, money is integer cents everywhere, every flight charge equals the negated snapshot (60,487/60,487 on the load DB), every money writer now dates on the Europe/Rome calendar, and the booking overlap invariant holds on three subjects under a consistent lock order. Epics 16 and 19 closed 9 of the 31 prior MAJOR/MINOR findings outright and made 6 more moot by PO decision; 14 remain open, most of them already scheduled (16.5–16.9, 17.x) and not yet built.

New findings: **0 Critical · 1 High · 3 Medium · 10 Low · 2 Info** (16 items, BL-01…BL-16). They cluster at the edges between two ledgers that the code treats as one event:

- **High**: an instructor payout's cash twin can be reversed from the cash register while the payout row (which the "owed" figure nets) stays, so cash and compensation diverge silently. It is the only "undo" gesture the UI offers for a wrong payout.
- **Medium**: the flight registry has no person/instructor overlap guard (double charge and double instructor accrual across aircraft); a pilot can move an already-APPROVED booking anywhere without re-approval; a mistyped or refunded top-up cannot be corrected on both the account and the cash side without inventing a cost.
- The rest are label/attribution and edge-of-calendar issues, plus two open PO questions (instructor fee charged on TOURISM flights without payout accrual; scope-blind expired-document scan).

---

## 2. Status of prior findings (audit 2026-09-10)

Legend: **FIXED** · **STILL OPEN** · **SUPERSEDED** (by a ratified PO decision or a removed feature) · **PARTIAL**.

### 2.1 Ledger audit (`ledger-audit.md`)

| ID | Title (short) | Status | Evidence |
|---|---|---|---|
| MAJOR-1 | Payout rate not historicized, applied retroactively | **STILL OPEN** (story 16.5 ready-for-dev) | `instructor-compensation.service.ts:166-169` still `Math.round((minutes/60) * payoutRateCents)` over all-time minutes with the CURRENT rate. R-19-c widened it: deleting or editing a flight after a payout also drives `owed` negative, with no way to settle (payouts are `amountCents > 0` only). |
| MAJOR-2 | Deactivated/archived instructor's owed hidden | **STILL OPEN, aggravated** | `listActiveInstructors` `:97-104`; KPI `dashboard/instructors/page.tsx:58` still `?? 0`. New: `recordPayout` → `resolveActiveInstructorProfileId` `:437-443` answers 409 for a deactivated profile, so that money cannot even be paid through the app. Load DB: **27** deactivated/archived instructors with **69,633** SCHOOL minutes are invisible (probe P13). |
| MAJOR-3 | Two calendars (UTC vs Rome) for value dates | **FIXED server-side** (16.1) | Rome "today" in `accounts.service.ts:675`, `cash.service.ts:461`, `membership.service.ts:95`, `flights.service.ts:765`, `instructor-compensation.service.ts:481`. Residual (16.9 ready-for-dev): client form defaults are still UTC, e.g. the top-up value date `account-section.tsx:161-162,621`, `transaction-editor.tsx:73-74`, `flight-editor.tsx:245`, `instructors-console.tsx:444` — a top-up keyed at 00:30 Rome defaults to the previous day/month. Expiries domain still UTC (TD 16.1-a, not money). |
| MAJOR-4 | Future value date accepted and counted in treasury | **STILL OPEN** (16.6a) | `schemas/accounts.ts:40`, `schemas/cash.ts:93`, `schemas/transactions.ts:185,200` are bare `z.iso.date()`; `billing-summary.service.ts:99-126` has no upper bound. |
| MAJOR-5 | Flights PDF sums cancelled flights | **SUPERSEDED** (R-19-c) | No cancelled flight exists after 19.6; `exports.service.ts:651-652` now sums the same set as `getFlightTotals`. |
| MAJOR-6 | Membership fee Idempotency-Key regenerated per attempt | **STILL OPEN** (16.6b) | `scadenze-console.tsx:906-908` still `randomIdempotencyKey()` inline, `fetch` not in try/catch. See BL-06 for why this now also corrupts the membership date. |
| MINOR-1 | Two rounding formulas | **STILL OPEN** | Probe `rounding.probe.test.ts`: rate 1510 × 69′ → charge 1737, payout gross 1736. |
| MINOR-2 | Rettifica on a FLIGHT_CHARGE | **FIXED** (19.6 fix `2de0e8f`) | `accounts.service.ts:637-648` 422 `ADJUSTMENT_ORIGINAL_NOT_ADJUSTABLE` under the Account lock; UI `account-section.tsx:241-243` only offers TOP_UP/ADJUSTMENT rows. |
| MINOR-3 | Classifier looks two levels deep only | **STILL OPEN** (16.6b) — and broader, see BL-05 | `transactions.service.ts:136`, `:186`. |
| MINOR-4 | "Per categoria · Entrate" vs "Risultato · Ricavi" | **STILL OPEN** (accepted TD) | unchanged `cash.service.ts` report vs `billing-summary.service.ts`. |
| MINOR-5 | Payout history capped at 50, ordered by createdAt | **STILL OPEN** (accepted TD) | `instructor-compensation.service.ts:277,336`. |
| MINOR-6 | PPR fee twin reversible | **SUPERSEDED** (PPR removed, 19.1) | — but the same class survives on the payout twin: BL-01. |
| LOW-1 | Snapshot revenue vs ledger revenue diverge | **Mostly closed** | Divergence path (rettifica on a charge) is now refused; legacy rows only. |
| LOW-2 | `availableCents` excludes unattributed | STILL OPEN | `billing-summary.service.ts:173`. |
| LOW-3 | `reclassifyCashMovement` check-then-write | STILL OPEN | `cash.service.ts:492-503`. |
| LOW-4 | No IdempotencyRecord TTL | Accepted | — |
| LOW-5 | `SUM(...)::int` overflow | STILL OPEN | `cash.service.ts:630-631`. |
| LOW-6 | Membership fee chargeable to an archived person | STILL OPEN | `membership.service.ts:90` selects only `id`. |
| LOW-7 | Payout `periodEnd` unbounded | STILL OPEN | `schemas/instructor-compensation.ts:94-99`. See also BL-07. |

### 2.2 Ops audit (`ops-audit.md`)

| ID | Title (short) | Status | Evidence |
|---|---|---|---|
| F1 | Flight date Rome vs "today" UTC | **FIXED** (16.1) | `flights.service.ts:765` compares with `todayDateOnlyUtcInZone(APP_TIMEZONE)`. |
| F2 | Same person/instructor APPROVED on two aircraft | **FIXED** (16.3) | `findBookingConflict` `bookings.service.ts:385-431` + `lockBookingPeople` `:350-355`. Residual TD 16.3-a (same human as person of one booking and instructor of another) → 19.10 (R-19-o). |
| F3 | Flight registry duplicates/overlaps | **PARTIAL** | Same-aircraft overlap FIXED (16.2, `assertNoOverlappingFlight` `flights.service.ts:942-974`). Person and instructor dimensions still absent → BL-02. |
| F4 | Approval does not re-verify the person | **FIXED** (16.3) | `transitionBooking` `:1357-1363` (archived, profile, instructor). Past approval allowed by R-16-b. |
| F5 | Deactivated expiry type still blocks | **STILL OPEN** (half; TD-19.9-a) | Expired scan `findBlockingExpiredDocuments` `:482-504` reads `where: { personId }` with no `isActive` filter (bookings AND flights); the missing-document scan does filter (`flights.service.ts:385-388`). |
| F6 | Masked bookings still carry `personId` | **STILL OPEN** (16.7) | `bookings.service.ts:260`. |
| F7 | Archiving an aircraft has no AOG protections | **STILL OPEN** (16.8) | `aircraft.service.ts:313-331`; `setOutOfService` `:379` never reads `archivedAt`. |
| F8 | `personId` in JWT never refreshed on relink | **STILL OPEN** (16.7) | `users.service.ts:183-188` updates `personId` without bumping `tokenVersion`. |
| F9 | FLOWN on a future booking | **FIXED** (16.3) | `BOOKING_NOT_STARTED` `:1351-1353`. |
| F10 | "Riapri" erases the decision trail | STILL OPEN | `transitionUpdateData` `:1276-1278`. |
| F11 | `deleteExpiry` is a physical delete | STILL OPEN (accepted TD) | `expiries.service.ts:335`. |
| F12 | PPR rate limit check-then-write | **SUPERSEDED** (PPR removed) | — |
| F13 | Hour-meter clamp loses minutes | **SUPERSEDED** (R-19-b, no hour meter) | — |
| F14 | 20-second flight / 0 cycles | **FIXED** (16.2) | `flights.service.ts:753`; `schemas/flights.ts:105-106` `.min(1)`. |
| F15 | No booking duration limit without a window | STILL OPEN (accepted TD) | — |
| F16 | Alert job and counters include archived/deactivated | **PARTIAL** | Registry and counters now exclude archived persons (19.7b F1). Alert job unchanged, see BL-10. |
| F17 | Retroactive wrong rate / midnight crossing | Rates **SUPERSEDED** (R-19-f); midnight STILL OPEN (accepted) | — |
| §4 caps | Silent pickers caps | **PARTIAL** | Flight editor and transaction editor now have server typeahead (19.5). Still static: the ADMIN booking form's person picker `bookings/page.tsx:168-171` (first 100 people by name, then post-filtered by profile — fewer than 100 usable), dashboard pickers `dashboard/page.tsx:258-259`; calendar `take: 1000` `bookings.service.ts:912`. Story 17.6. |

---

## 3. New findings

### BL-01 — High · confidence high · **VERIFIED** — An instructor payout's cash twin can be reversed; the payout stays and keeps reducing "owed"

- **Location**: `src/server/services/cash.service.ts:433` (dirty tree; same guard at `HEAD:393`) · `src/server/services/transactions.service.ts:318` · `src/server/services/instructor-compensation.service.ts:496-506`
- **Rule violated**: one economic event = two consistent ledger rows; an automatic twin is never corrected on one side only (the module's own rule, `cash.service.ts` doc on `reverseCashMovement`: "correcting those goes through the account rettifica only … otherwise conto and cassa diverge").
- **Counterexample**: admin records a 500,00 € payout to instructor I by bank transfer (wrong instructor, or wrong amount). There is no payout delete/reversal API, so the admin opens the unified ledger, where the twin row shows the "Storna" action, and reverses it. Result: Banca +500 €, `costCents` −500 € for the month (the uscita is netted), while `InstructorPayout` still exists, so I's `owedTotalCents` stays 500 € lower than reality. I appears paid but was not. Nothing flags the divergence. The same reversal is reachable through `POST /api/v1/cash-movements/{id}/reverse`.
- **Evidence**:
  ```ts
  // cash.service.ts:433 — the ONLY twin guard
  if (original.accountMovementId !== null) { throw new ConflictError(...) }
  // the select (:418-426) does not even read instructorPayoutId
  // transactions.service.ts:318 — the ledger offers the action on the payout twin
  actionable: row.accountMovementId === null && row.reversalOfId === null && row.reversal === null,
  ```
  Probe `payout-twin-reversal.probe.test.ts`: a movement with `accountMovementId: null` (the payout twin's shape) is reversed (+50000), and the guard's `select` has no `instructorPayoutId`. Load DB: 0 such reversals today (probe P12), so latent.
- **Fix**: refuse the reversal when `instructorPayoutId !== null` (same 409 as the other twins) and set `actionable: false` for it in `toCashRow`; then decide with the PO how a wrong payout is corrected (a signed correcting payout row with its own twin, or a payout reversal that writes both sides in one transaction).

### BL-02 — Medium · confidence high · **VERIFIED (code)** — The flight registry lets the same instructor (or pilot) fly two overlapping flights on different aircraft: double charge, double instructor accrual

- **Location**: `src/server/services/flights.service.ts:942-974` (`assertNoOverlappingFlight`, keyed on `aircraftId` only; it is the only overlap predicate on `Flight` in `src/server`).
- **Rule violated**: R-16-a ratified a hard 409 for the same person/instructor on two overlapping APPROVED bookings; the registry that bills and pays has no equivalent. TD 16.2-a records the person half as "decided by 16.3", but 16.3 only touched bookings, and 19.9's plan has no overlap work. The instructor/payout half is tracked nowhere.
- **Counterexample**: SCHOOL flight 10:00–11:00 student S1 + instructor I on I-AAAA; the operator picks the wrong aircraft for the next entry, then enters the "same" lesson again for S2 + I 10:00–11:00 on I-BBBB without deleting the first. Both pass (aircraft differ). I accrues 2 h of payout for 1 h of work; two students each pay the instructor fee. Same for one pilot on two aircraft: two charges for one flight.
- **Evidence**: `where: { aircraftId: params.aircraftId, takeoffAt: { lt: ... }, landingAt: { gt: ... } }` (`:947-952`). Load DB (seeded through `createMany`, so this shows only that nothing in the DB forbids it): **85** overlapping REGISTERED instructor pairs on different aircraft (73 instructors, 4,422 overlapped minutes) and **118** person pairs (probes P6/P7).
- **Fix**: extend the guard to `personId` and `instructorProfileId` (409 `PERSON_BUSY`/`INSTRUCTOR_BUSY`, the bookings' codes), serialized by `FOR NO KEY UPDATE` locks on `Person`/`InstructorProfile` after the Aircraft lock, mirroring `lockBookingPeople`. Order Flight → Aircraft → Person → InstructorProfile → Account stays acyclic with the bookings' order.

### BL-03 — Medium · confidence high · **VERIFIED** — A pilot or instructor can move an already-APPROVED booking to another aircraft, day and duration, and it stays APPROVED

- **Location**: `src/server/services/bookings.service.ts:1052-1199` (`updateBooking`), guarded write `:1162-1171`; own-path gate `:962-985`.
- **Rule violated**: the approval workflow (story 12.2): only staff decide what occupies an aircraft. The own edit re-runs window, overlap and day-change expiry checks, but never the decision itself. It also never re-checks that the own actor's person is still active (archived/profile).
- **Counterexample**: pilot P's PENDING booking Tue 10:00–11:00 on I-AAAA is approved. P edits it to Sat 08:00–16:00 on I-BBBB. 200, `status: 'APPROVED'`, `decidedAt` still the Tuesday decision. The admin never saw the Saturday request.
- **Evidence**: probe `booking-own-move-approved.probe.test.ts` (PILOT actor, new aircraft, +7 days, 8 h): `updateMany.where = { id, status: 'APPROVED' }`, `data` has no `status`/`decidedAt`, result `APPROVED`. The existing unit test `bookings.service.test.ts:1046-1062` pins the same no-status write for a notes-only edit.
- **Fix** (needs a PO call, see §6 Q2): for a non-`bookings.manage.any` actor, a change of aircraft/startsAt/endsAt on an APPROVED booking writes `status: 'PENDING'` and clears `decidedAt/decidedByUserId`; notes-only edits keep the status.

### BL-04 — Medium · confidence high · **VERIFIED (code)** — A wrong or refunded top-up cannot be corrected consistently on account and cash

- **Location**: `src/server/services/cash.service.ts:433` (twin not reversible), `:368-373` (no manual entry in "Ricariche") · `src/server/services/accounts.service.ts:595-720` (`recordAdjustment` touches the account only) · `src/server/services/billing-summary.service.ts:99-126` (treasury reads `CashMovement` only) · `src/server/services/transactions.service.ts:148-151` (`CASH_COST_OR`).
- **Rule violated**: "uno storno appartiene al libro del suo originale" (Billing-1 ratification) and the twin rule quoted in BL-01.
- **Counterexample**: TOP_UP 100,00 € CASH keyed instead of 10,00 €. The prescribed correction is a rettifica −90,00 € linked to the top-up: the account is right (10 €) and it books as DEPOSIT. But Cassa still shows +100 €, so `availableCents` is 90 € too high. The only way to fix the drawer is a manual uscita −90 € in a non-system category, which `CASH_COST_OR` books as a **90 € cost** in the month's result. Same for a member who leaves and gets their deposit back: account rettifica plus manual cash uscita = phantom cost.
- **Evidence**: code path above; load DB has 0 rettifiche on top-ups (probe P14), so latent, but every departing member's refund takes this path.
- **Fix**: a dedicated "storno/rimborso ricarica" writer that, in one transaction, writes the account rettifica AND a linked cash twin (`reversalOfId` = the top-up's twin, same `paymentMethod`), so both ledgers and the DEPOSIT book move together; keep the generic twin reversal refused.

### BL-05 — Low · confidence high · **VERIFIED** — Reversing a standalone credit adjustment (giroconto) books phantom revenue, and the planned 16.6b fix would not catch it

- **Location**: `src/server/services/transactions.service.ts:131` (aggregate) and `:184` (row badge).
- **Rule violated**: a reversal belongs to its original's book. A standalone credit `ADJUSTMENT` is TRANSFER (no P&L role), so its reversal must be TRANSFER too.
- **Counterexample**: +50,00 € goodwill credit (TRANSFER), then a linked rettifica −50,00 € to undo it. The pair nets to 0 on the account, but the −50 row matches the clause `ADJUSTMENT, amount < 0, NOT reversalOf TOP_UP` and adds **+50 € "Ricavi"** in its month.
- **Evidence**: probe `giroconto-reversal-revenue.probe.test.ts`: badges `credit = TRANSFER`, `rev = REVENUE`; `ACCOUNT_REVENUE_OR[1]` excludes only a TOP_UP parent. The 16.6b design (`16-6b-quota-rettifiche-catene.md:254-260`) keys the exclusion on `reversalRootType === 'TOP_UP'`, so a root of type ADJUSTMENT stays REVENUE.
- **Fix**: when implementing 16.6b, classify by the ROOT's book, not only "root is TOP_UP": root standalone credit ADJUSTMENT → TRANSFER for the whole chain.

### BL-06 — Low · confidence high · **VERIFIED (code)** — Membership validity is decoupled from the ledger: refunding a fee does not shorten the membership

- **Location**: `src/server/services/membership.service.ts:132-181` (charge + rolling renewal in one transaction) · `src/server/services/accounts.service.ts:595-720` (a rettifica of the fee has no membership hook).
- **Rule violated**: R-19-k "12 months from the payment": a payment that is refunded should not leave 12 months of validity behind.
- **Counterexample**: with MAJOR-6 still open, a network retry charges the fee twice: two `-3000` rows and `expiresAt` = today + 24 months. The admin refunds the second with a +30,00 € linked rettifica: the account is right, the membership still runs 24 months, and nothing in the UI tells them the date must be fixed by hand (`POST/PATCH /api/v1/expiries` is the only, API-level correction path, `19-7a…md:338`). Minor wording issue in the same place: the row description is `Quota associativa ${paymentYear}` (`:137`) while validity is rolling, so a renewal paid in December 2026 that runs to December 2028 reads "2026".
- **Fix**: either revert the renewal when a fee row is reversed (link the `Expiry` change to the movement), or at minimum warn on the rettifica of a "Quota associativa" row and fix MAJOR-6 first.

### BL-07 — Low · confidence high · **VERIFIED (code + data shape)** — Month/year "owed" nets a whole payout in the month of `periodEnd`, while accrual is by flight date

- **Location**: `src/server/services/instructor-compensation.service.ts:86-95`, `:122-140` (minutes by `flightDate`), `:147-164` (payouts by `periodEnd`).
- **Rule violated**: a period figure must compare like with like. "Dovuto nel mese" on the roster, the instructor landing and "I miei compensi" is `accrual(month) − payouts whose periodEnd is in the month`.
- **Counterexample**: payout 2026-03-11 → 2026-09-08 of 157,02 € recorded on 8 September. September's `owedMtdCents` = September accrual − 157,02 € (negative); the six months it covers never show it. Same across a year boundary for YTD. The total is unaffected.
- **Evidence**: load DB: **2,254 of 2,254** payouts span more than one calendar month (probe P15; sample periods are semi-annual).
- **Fix**: prorate a payout over its period by days (or by accrued minutes) inside each variant, or label the month/year figures as "maturato − pagato nel periodo" so a negative value is self-explanatory.

### BL-08 — Low · confidence high · **VERIFIED (code)** — A flight that has not happened yet (later today) is accepted and charged

- **Location**: `src/server/services/flights.service.ts:744-767`.
- **Rule violated**: "never in the future" is enforced on the DATE only, not on the instants.
- **Counterexample**: at 09:00 Rome, admin registers takeoff 18:00, landing 19:00 today, or takeoff 23:30 today, landing 00:30 tomorrow (the Rome date of takeoff is today). Both are accepted, charged, and count for currency today.
- **Fix**: also require `landingAt <= now` (plus a small clock-skew tolerance).

### BL-09 — Low · confidence medium · **VERIFIED (code)** — A same-day edit re-prices a flight at a rate rewritten after registration

- **Location**: `src/server/services/flights.service.ts:852-871` (rate re-read on every `updateFlight`), `prisma/schema.prisma:338-360` (doc: "a flight already registered today keeps the price it froze").
- **Rule violated**: AD-4 as amended by R-19-f, on the edit path: Q-19.3-b freezes the price CATEGORY on edit, not the price.
- **Counterexample**: 10:00 flight registered at 150 €/h; at 11:00 the admin rewrites today's rate to 160 €/h; at 12:00 the admin fixes the landings count of the 10:00 flight. The charge silently moves to 160 €/h. Only flights dated today are exposed (past rate rows are immutable).
- **Fix**: on an edit that keeps aircraft, person and date, reuse the stored `aircraftRateCentsPerHour`/`instructorRateCentsPerHour`; re-read only when one of them changes.

### BL-10 — Low · confidence high · **VERIFIED (code)** — The expiry alert job still emails archived people, deactivated types, and medical visits already covered by a valid one

- **Location**: `src/server/services/expiry-alerts.service.ts:113-116` (`where: { expiresAt: { lte: horizon } }`, no person/type/kind filter).
- **Rule violated**: F16 (archived/deactivated) and, new since 19.7a, R-19-j "one valid visit of any class is enough": the Pilots chip already drops an expired class 2 beside a valid class 1 (`expiries.service.ts` `listBlockingExpiriesByPerson`, D-13), the alert job does not.
- **Counterexample**: pilot with class 1 valid until 2028 and class 2 expiring in 7 days receives "your Visita medica classe 2 expires in 7 days", and the admin digest lists them, although they are compliant. Archived members keep receiving reminders.
- **Fix**: filter `person.archivedAt: null` and `expiryType.isActive: true`, and for MEDICAL rows alert only on the person's best visit.

### BL-11 — Low · confidence high · **VERIFIED (code)** — A booking can name the booked person as their own instructor

- **Location**: `src/server/services/bookings.service.ts:678-683` (admin path resolves the instructor profile without comparing its person to `personId`).
- **Counterexample**: person P with Pilot and Instructor profiles; admin books P with instructor = P's own profile. 201. The flight later fails `INSTRUCTOR_SAME_AS_PILOT` (`flights.service.ts:787-789`). TD 16.3-a / R-19-o cover the two-booking variant, not this one.
- **Fix**: same check as flights, 422 `INSTRUCTOR_SAME_AS_PILOT`.

### BL-12 — Low · confidence high · **VERIFIED (code)** — Archiving a person or deactivating an instructor leaves their future APPROVED bookings in place

- **Location**: `src/server/services/people.service.ts:771-789` (`archivePerson`), `:982-992` (`deactivateProfileCore`).
- **Rule violated**: same principle the PO applied to aircraft (R-16-e: archiving warns and counts like AOG).
- **Counterexample**: instructor I is deactivated with 12 APPROVED school bookings next month. They stay on the timeline and keep the slots; every one of those flights will be refused (`INSTRUCTOR_NOT_FOUND`), and no one is told.
- **Fix**: on archive/deactivation, count the future PENDING/APPROVED bookings where the person is holder or instructor and show/return them (same shape as `computeAogImpact`).

### BL-13 — Low · confidence high · **VERIFIED (code)** — Fleet utilization divides flights of every aircraft by the hours of today's operational fleet

- **Location**: `src/server/services/stats.service.ts:172` (numerator: all flights in range), `:213-233` (denominator: current OPERATIONAL, non-archived aircraft).
- **Counterexample**: a past month in which a now-archived or now-grounded aircraft flew a lot: utilization is overstated and can exceed 100 %.
- **Fix**: restrict the numerator to the same aircraft set, or compute the denominator per aircraft that existed in the period.

### BL-14 — Info · open question — TOURISM flights with an instructor charge the instructor fee, but no payout accrues

- **Location**: `src/server/services/instructor-compensation.service.ts:122-140` (`flightType: 'SCHOOL'` at `:128`) vs `flights.service.ts` (instructor charged on any flight type, A5 checkride).
- **Facts**: the reader's SCHOOL filter is deliberate (16.5 story keeps it), but no PO ratification links "checkride = no instructor pay". Load DB (pre-19.5 types): **3,773** non-SCHOOL flights with an instructor, **186.568,70 €** of instructor fees charged, **341,765** minutes never accruing payout (probe P9). See §6 Q1.

### BL-15 — Info · open question — The expired-document scan is scope-blind

- **Location**: `src/server/services/bookings.service.ts:482-504` (expired rows of any scope block) vs `flights.service.ts:369-401` (missing rows are scope-aware).
- **Facts**: person with Pilot + Instructor profiles and an expired "FI(A)" rating (scope INSTRUCTORS, blocking) cannot self-book or be logged on a plain TOURISM flight without an admin `force`. 19.9 D-4 keeps this and records "applying scope to expired docs: PO decision never taken". See §6 Q3.

### BL-16 — Low · confidence high · **VERIFIED (code)** — The ledger's book-type filter and row badge disagree on rettifiche of top-ups

- **Location**: `src/server/services/transactions.service.ts:221-223` (`bookType: 'DEPOSIT'` → `{ type: 'TOP_UP' }` only) vs `:184-186` (a rettifica of a TOP_UP is badged DEPOSIT).
- **Counterexample**: a −90 € rettifica of a top-up shows the DEPOSIT badge under "Tutti", but appears under none of the REVENUE/DEPOSIT/TRANSFER filters.
- **Fix**: make the DEPOSIT filter the mirror of the badge (TOP_UP plus rettifiche whose root is a TOP_UP), ideally through the 16.6b root-type column.

---

## 4. Invariants checked and found OK

- **Balance is never stored**: no balance column on `Account`; every reader aggregates `AccountMovement` (`accounts.service.ts:154-176`, `billing-summary.service.ts:129-149`, `flights.service.ts:1052-1058`, `membership.service.ts:103`). Aircraft hours are `SUM(Flight.minutes)` (`aircraft.service.ts:587-610`).
- **Integer cents, one rounding rule for charges**: no Float/Decimal in the schema; charges `Math.round(rate*minutes/60)` on positive values (half-up). Load DB: aircraft and instructor amounts match `round(rate×min/60)` on **60,487/60,487** flights; every `FLIGHT_CHARGE` equals `−(aircraft+instructor)` (probes P1b/P2).
- **Flight date = Rome day of takeoff**: 0 mismatches on 60,487 flights (P4); 1-minute minimum and 24 h maximum enforced (`flights.service.ts:753-761`).
- **One charge per flight, deleted with it**: `AccountMovement.flightId @unique` + `ON DELETE RESTRICT`; `deleteFlight` deletes charge then flight; a legacy rettifica on the charge blocks edit/delete (`:1276-1284`); new rettifiche on charges refused under the Account lock.
- **Lock order is acyclic**: Flight → Aircraft → Account (flights); Booking → Aircraft → Person → InstructorProfile (bookings); Person → profiles/Account → Expiry → InstructorProfile → rates → Person update (people composite); Account only (adjustments, membership). `updateFlight` detects concurrent edits (`FLIGHT_MODIFIED_CONCURRENTLY`).
- **Rome "today" on every money writer** (see MAJOR-3 row).
- **Rates**: effective = max `validFrom ≤ flightDate`, unique per day, `validFrom ≥ today (Rome)`; past rows immutable; flights freeze rate and category.
- **Profile exclusivity (R-19-e/Q-19.3-c)**: enforced on create (body check) and on every profile write under a `Person` lock (`people.service.ts:878-893`); load DB 0 persons with pilot+student or student+instructor active (P5).
- **Bookings**: half-open overlap on aircraft/person/instructor under locks; window re-checked on create, edit and approval; approval re-verifies person/profile/instructor/expiries/aircraft; approve-in-the-past allowed and FLOWN/NO_SHOW-before-start refused (R-16-b); R-19-l enforced in the service (`bookings.service.ts:632-637`, students lack `bookings.manage.own`).
- **AOG**: every guard reads `status` only (invariant [a]); the impact window is inclusive to end of `outOfServiceUntil` in Rome, DST-safe (`aog-impact.ts:104-147`); emails after commit.
- **Currency parity**: SQL registry (`expiries.service.ts:414-445`) and TS (`currency.service.ts` + `lib/currency.ts`) apply the same rule: on-board = pilot or non-solo instructor, each flight once, flights ≤ today, `expiresAt = X-th most recent + Y`, current iff `today ≤ expiresAt`; subjects = non-archived active pilot/student in both.
- **Medical rule R-19-j**: one valid visit of any class; requirement off when no MEDICAL type is active; flights block missing and expired, bookings expired only (D-5, declared).
- **Registry and counters**: one Rome "today", archived persons excluded, status predicates identical to `computeExpiryStatus`.
- **Membership**: Account lock, insufficient-balance guard, rolling renewal, `SentAlert` wipe, all in one transaction.
- **Idempotency** (server side) and **exports** (reuse list services, refuse over cap rather than truncate) unchanged and correct.
- **Cascades**: only `Expiry → SentAlert/ExpiryUpdateProposal` cascade; no cascade can drop a ledger row.

---

## 5. Design-level concerns (consistent today, fragile)

1. **Same rule written twice**: currency (SQL registry + TS service, "change one, change both"); revenue book (`ACCOUNT_REVENUE_OR` Prisma `where` + `accountBookType` JS + the bookType filters, BL-16 already shows drift); the medical rule (`evaluateMedicalRequirement` + `listBlockingExpiriesByPerson`'s own best-visit reduction + the alert job that has none, BL-10). A shared fixture test that feeds the same data to both halves would pin parity.
2. **No closed periods**: R-19-c edits and deletes rewrite a past month's `FLIGHT_CHARGE` (amount and `effectiveDate`), and top-ups/cash movements accept any past value date. A month already reported can change silently. Consider a "period closed until" setting that blocks writes with an earlier value date.
3. **Flight edits leave no money audit trail**: after R-19-c the charge is rewritten in place and `actorUserId` stays the creator (D-13); `Flight`/`AccountMovement` keep no "edited by/when/previous amount". Every other money write is append-only with an actor.
4. **Two ledgers, one event, no link-level enforcement**: top-up ↔ cash twin, payout ↔ cash twin, fee ↔ membership `Expiry` are linked only by convention in each writer (BL-01, BL-04, BL-06). A single "correction" writer per pair would make the rule structural.
5. **Instructor compensation has no snapshot and no settlement entity** (MAJOR-1/2, BL-07): owed is recomputed from current rate, current profile state and current flights on every read; any later change moves past figures.
6. **Calendar**: server money is Rome; the expiries domain, the alert job and several client form defaults are still UTC (TD 16.1-a, 16.9).
7. **Static pickers** (§2.2 caps row): the admin booking form is the most visible remaining case of a business action limited by a page size.

---

## 6. Open questions and assumptions

**Questions for the PO**

- **Q1** (BL-14): should an instructor on a TOURISM flight (checkride) accrue payout, given the customer is charged the instructor fee?
- **Q2** (BL-03): should a pilot's/instructor's own move of an APPROVED booking go back to PENDING (recommended), or is "approved once, movable freely" intended?
- **Q3** (BL-15): should an expired rating block only the role it is scoped to (FI rating vs pilot flying), as the missing-document scan already does?
- **Q4** (BL-04): how is a deposit refund or a mistyped top-up booked? Recommended: one writer that moves account and cash together, classified as DEPOSIT, never cost.
- **Q5** (BL-01): how is a wrong instructor payout corrected? Recommended: lock the twin, add a two-sided payout correction.
- **Q6** (BL-06): does refunding a membership fee shorten the membership?

**Assumptions**

- `airmanager_load` is migrated only up to `20260807074113` (pre-19.x schema: `status`, hour meter, `FLIGHT_CHARGE_REVERSAL`, `AERIAL_WORK`) and was seeded with `createMany`, bypassing the services. Its numbers prove what the database allows and give magnitudes; they do not prove what the services accept. Service behaviour is proven by code reading and the scratch probes.
- Ratified decisions (R-16-a..k, R-19-a..p, A1–A20, Q-19.x) are treated as intended; findings only flag where code contradicts them or where they leave an inconsistency elsewhere.
- The uncommitted 19.8 files were not judged; `cash.service.ts` line numbers are from the dirty tree, and the cited guard is unchanged in `HEAD`.
- Severity is judged for a small club: no finding loses or duplicates money silently without an operator action, hence no Critical.
