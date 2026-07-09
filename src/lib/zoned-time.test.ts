import { describe, expect, it } from 'vitest';
import { addDaysDateOnly, dateOnlyInZone, todayDateOnlyInZone, weekStartDateOnly, zonedMidnightUtc, zonedWallTime } from './zoned-time';

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
