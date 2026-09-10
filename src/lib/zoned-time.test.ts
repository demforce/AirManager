import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDaysDateOnly,
  dateOnlyInZone,
  todayDateOnlyInZone,
  todayDateOnlyUtcInZone,
  todayTomorrowRangeUtc,
  weekStartDateOnly,
  zonedMidnightUtc,
  zonedWallTime,
} from './zoned-time';

const ROME = 'Europe/Rome';

describe('zonedMidnightUtc (story 7.2, Task 1 — double-correction DST algorithm)', () => {
  it('CET (January, UTC+1): Rome midnight is 23:00Z the previous day', () => {
    expect(zonedMidnightUtc('2026-01-15', ROME).toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  it('CEST (July, UTC+2): Rome midnight is 22:00Z the previous day', () => {
    expect(zonedMidnightUtc('2026-07-15', ROME).toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  it('returns a Date with no leftover fractional milliseconds', () => {
    expect(zonedMidnightUtc('2026-05-01', ROME).getUTCMilliseconds()).toBe(0);
  });

  it('is stable across a non-DST year boundary (December CET -> January CET)', () => {
    expect(zonedMidnightUtc('2026-12-31', ROME).toISOString()).toBe('2026-12-30T23:00:00.000Z');
    expect(zonedMidnightUtc('2027-01-01', ROME).toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  describe('DST spring-forward, 2026-03-29 (clocks jump 02:00 -> 03:00 local, a 23-hour day)', () => {
    it('the day starts at 23:00Z the previous day (still CET, before the 01:00Z transition)', () => {
      expect(zonedMidnightUtc('2026-03-29', ROME).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    });

    it('the day ends (next midnight) at 22:00Z (already CEST, after the transition)', () => {
      expect(zonedMidnightUtc('2026-03-30', ROME).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    });

    it('the day range covers EXACTLY 23 hours', () => {
      const start = zonedMidnightUtc('2026-03-29', ROME).getTime();
      const end = zonedMidnightUtc('2026-03-30', ROME).getTime();
      expect((end - start) / (60 * 60 * 1000)).toBe(23);
    });
  });

  describe('DST fall-back, 2026-10-25 (clocks step back 03:00 -> 02:00 local, a 25-hour day)', () => {
    it('the day starts at 22:00Z the previous day (still CEST, before the 01:00Z transition)', () => {
      expect(zonedMidnightUtc('2026-10-25', ROME).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    });

    it('the day ends (next midnight) at 23:00Z (already CET, after the transition)', () => {
      expect(zonedMidnightUtc('2026-10-26', ROME).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    });

    it('the day range covers EXACTLY 25 hours', () => {
      const start = zonedMidnightUtc('2026-10-25', ROME).getTime();
      const end = zonedMidnightUtc('2026-10-26', ROME).getTime();
      expect((end - start) / (60 * 60 * 1000)).toBe(25);
    });
  });

  it('works for a timezone other than Europe/Rome too (UTC itself: no offset)', () => {
    expect(zonedMidnightUtc('2026-06-01', 'UTC').toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('zonedWallTime (story 7.2, Task 1 — server-side block positioning)', () => {
  it('reads the CET wall-clock hour/minute of a UTC instant (January)', () => {
    expect(zonedWallTime(new Date('2026-01-15T09:30:00.000Z'), ROME)).toEqual({ hour: 10, minute: 30 });
  });

  it('reads the CEST wall-clock hour/minute of a UTC instant (July)', () => {
    expect(zonedWallTime(new Date('2026-07-15T09:30:00.000Z'), ROME)).toEqual({ hour: 11, minute: 30 });
  });

  it('round-trips with zonedMidnightUtc: the wall time of a day-start instant is always 00:00', () => {
    expect(zonedWallTime(zonedMidnightUtc('2026-01-15', ROME), ROME)).toEqual({ hour: 0, minute: 0 });
    expect(zonedWallTime(zonedMidnightUtc('2026-07-15', ROME), ROME)).toEqual({ hour: 0, minute: 0 });
    expect(zonedWallTime(zonedMidnightUtc('2026-03-29', ROME), ROME)).toEqual({ hour: 0, minute: 0 });
    expect(zonedWallTime(zonedMidnightUtc('2026-10-25', ROME), ROME)).toEqual({ hour: 0, minute: 0 });
  });

  it('reads correctly right after the spring-forward transition (02:59:59 local never exists; 03:00 local does)', () => {
    // 2026-03-29T01:00:00Z is the transition instant itself (02:00 CET becomes 03:00 CEST).
    expect(zonedWallTime(new Date('2026-03-29T01:00:00.000Z'), ROME)).toEqual({ hour: 3, minute: 0 });
    expect(zonedWallTime(new Date('2026-03-29T00:59:00.000Z'), ROME)).toEqual({ hour: 1, minute: 59 });
  });
});

describe('weekStartDateOnly (story 7.2, Task 1 — ISO Monday, pure date-only arithmetic)', () => {
  it('a Monday maps to itself', () => {
    expect(weekStartDateOnly('2026-12-28')).toBe('2026-12-28');
  });

  it('a Sunday maps to the Monday 6 days earlier', () => {
    expect(weekStartDateOnly('2028-12-31')).toBe('2028-12-25');
  });

  it('a mid-week day maps to that week\'s Monday', () => {
    expect(weekStartDateOnly('2026-07-08')).toBe('2026-07-06'); // Wednesday -> Monday
  });

  it('crosses a year boundary (Thursday 1 Jan -> Monday in the previous year)', () => {
    expect(weekStartDateOnly('2026-01-01')).toBe('2025-12-29');
  });

  it('handles a leap-year February 29 (Tuesday, 2028)', () => {
    expect(weekStartDateOnly('2028-02-29')).toBe('2028-02-28');
  });

  it('is stable across the 2026 DST transition weeks (pure date arithmetic, unaffected by DST)', () => {
    expect(weekStartDateOnly('2026-03-29')).toBe('2026-03-23');
    expect(weekStartDateOnly('2026-10-25')).toBe('2026-10-19');
  });
});

describe('addDaysDateOnly', () => {
  it('adds a positive number of days, rolling over month/year boundaries', () => {
    expect(addDaysDateOnly('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('subtracts with a negative count', () => {
    expect(addDaysDateOnly('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('adds zero as a no-op', () => {
    expect(addDaysDateOnly('2026-07-08', 0)).toBe('2026-07-08');
  });

  it('handles a leap-day rollover', () => {
    expect(addDaysDateOnly('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysDateOnly('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('dateOnlyInZone (story 7.4, Task 2 — the flight-day rule\'s reference date)', () => {
  it('CET (January): a UTC instant that is still the same wall-clock day in Rome', () => {
    expect(dateOnlyInZone(new Date('2026-01-15T09:30:00.000Z'), ROME)).toBe('2026-01-15');
  });

  it('CEST (July): a UTC instant that is still the same wall-clock day in Rome', () => {
    expect(dateOnlyInZone(new Date('2026-07-15T09:30:00.000Z'), ROME)).toBe('2026-07-15');
  });

  it('an evening UTC instant that has ALREADY crossed into the next wall-clock day in Rome (CEST, +2)', () => {
    // 21:30Z in July is 23:30 CEST — still the same day. 22:30Z is 00:30 CEST the NEXT day.
    expect(dateOnlyInZone(new Date('2026-07-15T21:30:00.000Z'), ROME)).toBe('2026-07-15');
    expect(dateOnlyInZone(new Date('2026-07-15T22:30:00.000Z'), ROME)).toBe('2026-07-16');
  });

  it('an evening UTC instant that has ALREADY crossed into the next wall-clock day in Rome (CET, +1)', () => {
    // 22:30Z in January is 23:30 CET — still the same day. 23:30Z is 00:30 CET the NEXT day.
    expect(dateOnlyInZone(new Date('2026-01-15T22:30:00.000Z'), ROME)).toBe('2026-01-15');
    expect(dateOnlyInZone(new Date('2026-01-15T23:30:00.000Z'), ROME)).toBe('2026-01-16');
  });

  it('round-trips with zonedMidnightUtc: the date-only of a day-start instant is that same day', () => {
    expect(dateOnlyInZone(zonedMidnightUtc('2026-01-15', ROME), ROME)).toBe('2026-01-15');
    expect(dateOnlyInZone(zonedMidnightUtc('2026-07-15', ROME), ROME)).toBe('2026-07-15');
  });

  it('is the instant = now special case todayDateOnlyInZone delegates to (behavior-preserving refactor)', () => {
    const now = new Date();
    expect(todayDateOnlyInZone(ROME)).toBe(dateOnlyInZone(now, ROME));
  });
});

describe('todayTomorrowRangeUtc (story 10.3, AC 1 — home dashboard "oggi/domani" bookings widget)', () => {
  it('spans exactly today midnight to the day-after-tomorrow midnight, CET (ordinary days)', () => {
    const now = new Date('2026-01-15T10:00:00.000Z'); // 11:00 CET, still 2026-01-15 in Rome
    const { from, to } = todayTomorrowRangeUtc(ROME, now);
    expect(from.toISOString()).toBe(zonedMidnightUtc('2026-01-15', ROME).toISOString());
    expect(to.toISOString()).toBe(zonedMidnightUtc('2026-01-17', ROME).toISOString());
  });

  it('covers exactly 48 hours on an ordinary (non-DST-transition) pair of days', () => {
    const now = new Date('2026-01-15T10:00:00.000Z');
    const { from, to } = todayTomorrowRangeUtc(ROME, now);
    expect((to.getTime() - from.getTime()) / (60 * 60 * 1000)).toBe(48);
  });

  it('is DST-aware: today = the 23-hour spring-forward day, tomorrow ordinary -> 47-hour span', () => {
    // 2026-03-29T10:00:00Z is already CEST (transition at 01:00Z) -> still wall-clock 2026-03-29 in Rome.
    const now = new Date('2026-03-29T10:00:00.000Z');
    const { from, to } = todayTomorrowRangeUtc(ROME, now);
    expect(from.toISOString()).toBe('2026-03-28T23:00:00.000Z'); // zonedMidnightUtc('2026-03-29', ROME)
    expect((to.getTime() - from.getTime()) / (60 * 60 * 1000)).toBe(23 + 24);
  });

  it('defaults `now` to the real clock when omitted', () => {
    const { from, to } = todayTomorrowRangeUtc(ROME);
    const today = todayDateOnlyInZone(ROME);
    expect(from.toISOString()).toBe(zonedMidnightUtc(today, ROME).toISOString());
    expect(to.toISOString()).toBe(zonedMidnightUtc(addDaysDateOnly(today, 2), ROME).toISOString());
  });
});

describe('todayDateOnlyInZone', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayDateOnlyInZone(ROME)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the zoned wall-clock date of "now" (cross-check against zonedWallTime-style reasoning)', () => {
    // "Today" in Rome must fall within [zonedMidnightUtc(today), zonedMidnightUtc(today+1)) at the instant this test runs.
    const today = todayDateOnlyInZone(ROME);
    const dayStart = zonedMidnightUtc(today, ROME).getTime();
    const dayEnd = zonedMidnightUtc(addDaysDateOnly(today, 1), ROME).getTime();
    const now = Date.now();
    expect(now).toBeGreaterThanOrEqual(dayStart);
    expect(now).toBeLessThan(dayEnd);
  });
});

describe('todayDateOnlyUtcInZone (story 16.1, AC 1 — "oggi" as a UTC-midnight Date on the Rome calendar day)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the Rome calendar day, as a UTC-midnight Date, on an ordinary day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z')); // 11:00 CET, still 2026-01-15 in Rome
    expect(todayDateOnlyUtcInZone(ROME).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('at 00:30 Rome in CEST (already tomorrow in Rome, still today in UTC), returns the ROME day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T22:30:00.000Z')); // 00:30 CEST, 15 Jul
    expect(todayDateOnlyUtcInZone(ROME).toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('at 00:30 Rome in CET (already tomorrow in Rome, still today in UTC), returns the ROME day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T23:30:00.000Z')); // 00:30 CET, 15 Jan
    expect(todayDateOnlyUtcInZone(ROME).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('always returns exact UTC midnight (invariant [I-d]: the shape a `@db.Date` column binds as)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T22:30:00.000Z'));
    const result = todayDateOnlyUtcInZone(ROME);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it('agrees with parseDateOnlyUtc(todayDateOnlyInZone(...)) — same value, collapsed formula (AD-2 #7)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z')); // 00:30 CEST, 1 Sep
    expect(todayDateOnlyUtcInZone(ROME).toISOString()).toBe(new Date(Date.UTC(2026, 8, 1)).toISOString());
  });
});

describe('DST boundary matrix (story 16.1, AC 6 — the two 2026 transition days at 00:00/01:00/02:00/03:00 Rome)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const cases: Array<{ utc: string; label: string; expected: string }> = [
    { utc: '2026-03-28T23:00:00Z', label: 'spring-forward: 00:00 Rome (CET)', expected: '2026-03-29' },
    { utc: '2026-03-29T00:00:00Z', label: 'spring-forward: 01:00 Rome (CET)', expected: '2026-03-29' },
    { utc: '2026-03-29T01:00:00Z', label: 'spring-forward: 03:00 Rome (CEST — 02:00 does not exist)', expected: '2026-03-29' },
    { utc: '2026-03-29T02:00:00Z', label: 'spring-forward: 04:00 Rome (CEST)', expected: '2026-03-29' },
    { utc: '2026-10-24T22:00:00Z', label: 'fall-back: 00:00 Rome (CEST)', expected: '2026-10-25' },
    { utc: '2026-10-24T23:00:00Z', label: 'fall-back: 01:00 Rome (CEST)', expected: '2026-10-25' },
    { utc: '2026-10-25T00:00:00Z', label: 'fall-back: 01:00 Rome AGAIN (CET — the repeated hour)', expected: '2026-10-25' },
    { utc: '2026-10-25T01:00:00Z', label: 'fall-back: 02:00 Rome (CET)', expected: '2026-10-25' },
  ];

  it.each(cases)('$label -> $expected', ({ utc, expected }) => {
    expect(dateOnlyInZone(new Date(utc), ROME)).toBe(expected);
  });

  it.each(cases)('todayDateOnlyUtcInZone agrees with dateOnlyInZone at $label', ({ utc, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(utc));
    expect(todayDateOnlyUtcInZone(ROME).toISOString()).toBe(`${expected}T00:00:00.000Z`);
    vi.useRealTimers();
  });
});
