import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_TIMEZONE } from './time';
import { addMonthsClampUtc, parseDateOnlyUtc, toDateOnlyString, todayDateOnlyUtc } from './date-only';
import { todayDateOnlyUtcInZone } from './zoned-time';

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

    describe('deliberate divergence from zoned-time.ts#todayDateOnlyUtcInZone (story 16.1)', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      // Pins the exact bug ops-audit F1 / ledger-audit MAJOR-3 measured: at
      // 00:30 Rome on the 1st, the UTC calendar is still on the 31st. The two
      // helpers MUST disagree here — a future "cleanup" that unifies them
      // would silently reintroduce the FLIGHT_DATE_IN_FUTURE / ledger bug
      // this story fixes.
      it('disagrees with todayDateOnlyUtcInZone at 00:30 Rome on the 1st (CEST)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-31T22:30:00.000Z')); // 00:30 CEST, 1 Sep
        expect(toDateOnlyString(todayDateOnlyUtc())).toBe('2026-08-31');
        expect(toDateOnlyString(todayDateOnlyUtcInZone(APP_TIMEZONE))).toBe('2026-09-01');
      });
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

  describe('addMonthsClampUtc (story 4.4, Task 2 — HourPackage.expiresAt)', () => {
    it('adds whole months in the common case', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2026-07-07'), 12);
      expect(toDateOnlyString(result)).toBe('2027-07-07');
    });

    it('clamps end-of-month overflow instead of rolling into the next month (31 Jan + 1 month -> 28 Feb, non-leap year)', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2026-01-31'), 1);
      expect(toDateOnlyString(result)).toBe('2026-02-28');
    });

    it('clamps to 29 Feb on a leap year', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2024-01-31'), 1);
      expect(toDateOnlyString(result)).toBe('2024-02-29');
    });

    it('rolls over the calendar year (December -> January)', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2026-12-15'), 1);
      expect(toDateOnlyString(result)).toBe('2027-01-15');
    });

    it('clamps across a multi-month span landing on a shorter month (31 Oct + 4 months -> 28/29 Feb)', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2026-10-31'), 4);
      expect(toDateOnlyString(result)).toBe('2027-02-28');
    });

    it('a non-end-of-month day is never clamped', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2026-01-15'), 1);
      expect(toDateOnlyString(result)).toBe('2026-02-15');
    });

    it('returns a UTC-midnight Date carrying no time-of-day component', () => {
      const result = addMonthsClampUtc(parseDateOnlyUtc('2026-01-31'), 1);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
    });
  });
});
