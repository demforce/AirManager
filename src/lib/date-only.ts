/**
 * Calendar-only (`@db.Date`) date helpers shared by the historicized-rate
 * services (`rates.service.ts` story 4.1, `instructor-rates.service.ts`
 * story 4.2). Extracted here (story 4.2, Task 2) so both twin services share
 * ONE implementation instead of duplicating it a third time — `cash.service.ts`/
 * `accounts.service.ts` keep their own private copies (out of scope for this
 * story, Dev Notes: avoid an unrelated sweep) but nothing stops a future
 * cleanup from switching them over too.
 *
 * The lesson these three functions encode (review 3.5 F1): a Postgres
 * `@db.Date` column must be compared/bound as a real calendar date, never a
 * timestamp — a JS `Date` carrying any time-of-day/timezone component into
 * that comparison risks the session timezone promoting it and silently
 * dropping boundary rows. The fix is to always keep the `Date` at
 * UTC-midnight and let Prisma's typed query bind it against `@db.Date`
 * (never raw SQL).
 */

/** `@db.Date` round-trips as a UTC-midnight `Date` — format with UTC parts so no server timezone can shift the calendar day. */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses a `YYYY-MM-DD` string (already validated by `z.iso.date()` at the
 * Zod boundary) into a UTC-midnight `Date` — the exact shape Prisma expects
 * to bind against a `@db.Date` column (review 3.5 F1's lesson: never let a
 * JS `Date` carry any time-of-day/timezone component into a date-only
 * comparison).
 */
export function parseDateOnlyUtc(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * `@db.Date` calendar-only "today" (server clock, UTC calendar day) —
 * legitimate ONLY where the compared side is also UTC-calendar by choice
 * (story 16.1: scadenze/alert-job "oggi", 3 pagine di visualizzazione
 * tariffe, il default di un form). Where the compared side is the
 * aviosuperficie's own calendar (a flight's date, a ledger `effectiveDate`,
 * a month boundary), use `zoned-time.ts#todayDateOnlyUtcInZone` instead —
 * the two diverge by a day between Rome midnight and UTC midnight (1h CET,
 * 2h CEST), which is exactly the bug `FLIGHT_DATE_IN_FUTURE` and five
 * ledger writers used to pay (ops-audit F1 / ledger-audit MAJOR-3).
 */
export function todayDateOnlyUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Adds a whole number of months to a UTC-midnight date-only `Date`, CLAMPING
 * to the end of the target month rather than overflowing into the next one
 * (story 4.4, Task 2 — `HourPackage.expiresAt = effectiveDate +
 * validityMonths`). E.g. 31 Jan + 1 month -> 28/29 Feb, NEVER 2/3 Mar. Always
 * operates in UTC (never local time, same rationale as every other helper
 * here) and always returns a fresh UTC-midnight `Date`.
 */
export function addMonthsClampUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  // Day 0 of the FOLLOWING month is the last day of the target month — the
  // standard trick to get a month's day count without a lookup table.
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay));
}
