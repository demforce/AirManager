import { describe, expect, it } from 'vitest';
import { composeDatetimeLocal, isValidTimeText, parseDatetimeLocal } from './datetime-value';

describe('isValidTimeText', () => {
  it('accepts strict 2-digit HH:MM across the full 24h/60min range', () => {
    expect(isValidTimeText('00:00')).toBe(true);
    expect(isValidTimeText('23:59')).toBe(true);
    expect(isValidTimeText('09:30')).toBe(true);
    expect(isValidTimeText('09:07')).toBe(true); // any minute — ratifica 2, no 5-minute rounding
  });

  it('rejects out-of-range hours/minutes', () => {
    expect(isValidTimeText('24:00')).toBe(false);
    expect(isValidTimeText('12:60')).toBe(false);
  });

  it('rejects non-2-digit or malformed input', () => {
    expect(isValidTimeText('9:30')).toBe(false);
    expect(isValidTimeText('12:3')).toBe(false);
    expect(isValidTimeText('ab:cd')).toBe(false);
    expect(isValidTimeText('')).toBe(false);
    expect(isValidTimeText('09:30:00')).toBe(false);
  });
});

describe('parseDatetimeLocal', () => {
  it('splits a well-formed datetime-local value into its date/time parts', () => {
    expect(parseDatetimeLocal('2026-07-26T09:30')).toEqual({ dateOnly: '2026-07-26', time: '09:30' });
  });

  it('returns null for empty or malformed input', () => {
    expect(parseDatetimeLocal('')).toBeNull();
    expect(parseDatetimeLocal('2026-07-26')).toBeNull();
    expect(parseDatetimeLocal('not-a-date')).toBeNull();
  });
});

describe('composeDatetimeLocal', () => {
  it('joins date and time with a literal T (the inverse of parseDatetimeLocal)', () => {
    expect(composeDatetimeLocal('2026-07-26', '09:30')).toBe('2026-07-26T09:30');
  });

  it('round-trips through parseDatetimeLocal', () => {
    const value = '2026-12-31T23:59';
    const parsed = parseDatetimeLocal(value);
    expect(parsed).not.toBeNull();
    expect(composeDatetimeLocal(parsed!.dateOnly, parsed!.time)).toBe(value);
  });
});
