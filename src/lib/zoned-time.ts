/**
 * Zoned calendar-day helpers (epic 7, story 7.2; FR-19) — SERVER-SIDE only.
 * Purpose: turn a calendar day/week expressed as Europe/Rome WALL-CLOCK
 * dates into the UTC instants that bound it, and turn a UTC instant back
 * into its Europe/Rome wall-clock time-of-day — so the booking calendar can
 * position blocks deterministically regardless of the machine's own
 * timezone (Dev Notes, story 7.1's lesson: "container UTC vs display
 * CEST" — the client must never redo this conversion).
 *
 * Deliberately a THIRD, separate module from:
 * - `time.ts` — pure DISPLAY formatting (`Intl.DateTimeFormat` strings),
 *   never used to compute a boundary or a position.
 * - `date-only.ts` — `@db.Date` calendar-only columns (UTC-midnight `Date`s
 *   with no real timezone conversion involved at all — a `@db.Date` has no
 *   time-of-day to begin with).
 * This module is the only one that actually crosses the UTC/Europe-Rome
 * boundary for real INSTANTS (`DateTime` columns, AD-8 wire format), which
 * is why it needs the DST-aware algorithm below and the other two don't.
 *
 * **`zonedMidnightUtc` algorithm (double-correction DST)**: there is no
 * built-in "give me the UTC instant of local midnight in this IANA zone"
 * primitive in `Intl`, only the reverse (instant -> wall-clock string). The
 * standard workaround, used here:
 * 1. `guess = Date.UTC(y, m-1, d)` — treat the target Y-M-D as if it were
 *    already a UTC instant (this is wrong by exactly the zone's offset).
 * 2. Read the zone's UTC offset AT `guess` (via `Intl.DateTimeFormat` with
 *    `hourCycle: 'h23'`, comparing the wall-clock it reports back to
 *    `guess` itself) and subtract it from `guess` — first correction.
 * 3. The zone's offset can DIFFER between `guess` and the corrected instant
 *    on a DST-transition day (the correction may cross the transition, or
 *    `guess` and the true midnight may sit on opposite sides of it) — so
 *    the offset is re-read AT THE CORRECTED INSTANT and the correction is
 *    applied a SECOND time, from the original `guess` again. This is the
 *    "double correction" the story calls for; it is a no-op on an ordinary
 *    day (both reads agree) and gives the right answer on the two 2026
 *    transition days (verified by `zoned-time.test.ts`): 2026-03-29 (23h
 *    day, clocks spring forward) and 2026-10-25 (25h day, clocks fall
 *    back).
 */

const WALL_TIME_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

/** Cached per-timezone formatter — `Intl.DateTimeFormat` construction is not free and every helper below needs one. */
function wallTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = WALL_TIME_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    WALL_TIME_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

type WallTimeParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function readWallTimeParts(instant: Date, timeZone: string): WallTimeParts {
  const parts = wallTimeFormatter(timeZone).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map['year']),
    month: Number(map['month']),
    day: Number(map['day']),
    // `hourCycle: 'h23'` always reports 00-23, never 24 — the `%24` here is
    // a defensive no-op kept for the (unobserved) case an engine deviates.
    hour: Number(map['hour']) % 24,
    minute: Number(map['minute']),
    second: Number(map['second']),
  };
}

/** The zone's UTC offset (ms, positive east of UTC — e.g. Europe/Rome is +3_600_000 in CET, +7_200_000 in CEST) AT the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = readWallTimeParts(instant, timeZone);
  const wallAsUtcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return wallAsUtcMs - instant.getTime();
}

/**
 * The UTC instant of WALL-CLOCK midnight (00:00:00.000) of `dateOnly` in
 * `timeZone` — e.g. `zonedMidnightUtc('2026-01-15', 'Europe/Rome')` ->
 * `2026-01-14T23:00:00.000Z` (CET, UTC+1). Pure, deterministic regardless
 * of the host's own timezone. See the module doc-comment for the
 * double-correction algorithm.
 */
export function zonedMidnightUtc(dateOnly: string, timeZone: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day);

  const firstOffset = zoneOffsetMs(new Date(guess), timeZone);
  const firstCorrection = guess - firstOffset;

  // Second correction (Dev Notes): re-read the offset AT the corrected
  // instant — on an ordinary day this equals `firstOffset` and the
  // subtraction below is a no-op; on a DST-transition day it can differ,
  // and applying it again (from the ORIGINAL guess, not from
  // `firstCorrection`) is what makes 2026-03-29/2026-10-25 exact.
  const secondOffset = zoneOffsetMs(new Date(firstCorrection), timeZone);

  return new Date(guess - secondOffset);
}

/** The Europe/Rome (or any IANA `timeZone`) wall-clock hour/minute an instant displays as — for SERVER-SIDE block positioning only (Dev Notes: the client never re-derives this). */
export function zonedWallTime(instant: Date, timeZone: string): { hour: number; minute: number } {
  const wall = readWallTimeParts(instant, timeZone);
  return { hour: wall.hour, minute: wall.minute };
}

/**
 * The Monday (ISO-8601 week start) of the week containing `dateOnly`, as a
 * `YYYY-MM-DD` string — pure date-only arithmetic (no timezone/DST
 * involved at all: a calendar week's Monday never depends on wall-clock
 * time, only on the calendar date), matching `date-only.ts`'s
 * UTC-midnight-`Date` convention so the arithmetic below is exact.
 */
export function weekStartDateOnly(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  // `getUTCDay()`: 0 = Sunday .. 6 = Saturday. ISO weekday: 1 = Monday .. 7 = Sunday.
  const isoWeekday = asUtc.getUTCDay() === 0 ? 7 : asUtc.getUTCDay();
  asUtc.setUTCDate(asUtc.getUTCDate() - (isoWeekday - 1));
  return asUtc.toISOString().slice(0, 10);
}

/**
 * `dateOnly` shifted by `days` (may be negative) — pure date-only
 * arithmetic, same rationale as {@link weekStartDateOnly}. NOT one of the
 * three functions Task 1 names explicitly, but a minimal, obviously-needed
 * extension: the page needs it for the day view's `[date, date+1)` range
 * and the week view's 7 date labels (`weekStart .. weekStart+6`) — adding a
 * general "add N days to a date-only string" helper here (rather than
 * inlining the same UTC-midnight arithmetic twice in `page.tsx`) keeps the
 * one Date-arithmetic implementation in one place.
 */
export function addDaysDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  asUtc.setUTCDate(asUtc.getUTCDate() + days);
  return asUtc.toISOString().slice(0, 10);
}

/**
 * The `YYYY-MM-DD` WALL-CLOCK calendar date `instant` falls on in `timeZone`
 * (story 7.4, Task 2) — the inverse direction of {@link zonedMidnightUtc}:
 * that one turns a wall-clock date INTO a UTC instant, this one reads a UTC
 * instant back OUT as a wall-clock date. Needed for the "flight day" the
 * expiry-block rule compares against (Contesto: "il giorno del volo, non
 * oggi" — `expiresAt < dateOnlyInZone(startsAt, APP_TIMEZONE)`), which is
 * NOT always "today": a booking made now for the day after tomorrow must
 * compare against THAT future day, not the current one. The en-CA locale is
 * the standard `Intl` trick for a locale that always formats as
 * `YYYY-MM-DD`, so this needs no manual part-assembly (same trick
 * {@link todayDateOnlyInZone} used inline before this refactor).
 */
export function dateOnlyInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/**
 * "Today", as a `YYYY-MM-DD` string, in `timeZone` — the calendar page's
 * default `?date=` (Contesto: "default: oggi Europe/Rome"). Not one of Task
 * 1's three named functions, but minimal/necessary (story 7.2). Story 7.4,
 * Task 2: refactored to the `instant = now` special case of the more general
 * {@link dateOnlyInZone} above — same output, single implementation.
 */
export function todayDateOnlyInZone(timeZone: string): string {
  return dateOnlyInZone(new Date(), timeZone);
}

/**
 * `[from, to)` UTC instant range spanning TODAY and TOMORROW's wall-clock
 * calendar days in `timeZone` (story 10.3, AC 1) — the staff home
 * dashboard's "prenotazioni di oggi/domani" widget. A pure composition of
 * the three primitives above (`dateOnlyInZone`/`addDaysDateOnly`/
 * `zonedMidnightUtc`), the same DST-aware range-building pattern
 * `ppr.service.ts#listPprRequests` already uses for its `eta` filter — no
 * new date arithmetic. `now` defaults to the real clock but is overridable
 * for tests (same pattern as `period-presets.ts#currentMonthRange`).
 */
export function todayTomorrowRangeUtc(timeZone: string, now: Date = new Date()): { from: Date; to: Date } {
  const today = dateOnlyInZone(now, timeZone);
  return {
    from: zonedMidnightUtc(today, timeZone),
    to: zonedMidnightUtc(addDaysDateOnly(today, 2), timeZone),
  };
}
