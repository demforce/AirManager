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

/** `@db.Date` calendar-only "today" (server clock, UTC). */
export function todayDateOnlyUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
