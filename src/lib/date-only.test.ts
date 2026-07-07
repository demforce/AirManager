import { describe, expect, it } from 'vitest';
import { parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from './date-only';

describe('date-only helpers (story 4.2 — shared by rates.service.ts/instructor-rates.service.ts)', () => {
  describe('parseDateOnlyUtc', () => {
    it('parses a YYYY-MM-DD string into a UTC-midnight Date', () => {
      const result = parseDateOnlyUtc('2026-07-07');
      expect(result.toISOString()).toBe('2026-07-07T00:00:00.000Z');
    });

    it('carries no time-of-day component regardless of the calling environment timezone', () => {
      const result = parseDateOnlyUtc('2026-01-01');
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
    });

    it('handles end-of-year / leap-day boundaries correctly', () => {
      expect(parseDateOnlyUtc('2026-12-31').toISOString()).toBe('2026-12-31T00:00:00.000Z');
      expect(parseDateOnlyUtc('2028-02-29').toISOString()).toBe('2028-02-29T00:00:00.000Z');
    });
  });

  describe('todayDateOnlyUtc', () => {
    it('returns a UTC-midnight Date matching the current UTC calendar day', () => {
      const now = new Date();
      const result = todayDateOnlyUtc();
      expect(result.getUTCFullYear()).toBe(now.getUTCFullYear());
      expect(result.getUTCMonth()).toBe(now.getUTCMonth());
      expect(result.getUTCDate()).toBe(now.getUTCDate());
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('toDateOnlyString', () => {
    it('formats a UTC-midnight Date back to YYYY-MM-DD', () => {
      expect(toDateOnlyString(new Date('2026-07-07T00:00:00.000Z'))).toBe('2026-07-07');
    });

    it('round-trips through parseDateOnlyUtc', () => {
      expect(toDateOnlyString(parseDateOnlyUtc('2026-03-15'))).toBe('2026-03-15');
    });

    it('uses UTC parts even if the Date carries a non-midnight time (defensive formatting)', () => {
      // `@db.Date` round-trips as UTC-midnight in practice, but the
      // formatter itself must always read UTC parts (never local time) so a
      // stray non-midnight Date still formats to the correct calendar day.
      expect(toDateOnlyString(new Date('2026-07-07T23:59:59.000Z'))).toBe('2026-07-07');
    });
  });
});
