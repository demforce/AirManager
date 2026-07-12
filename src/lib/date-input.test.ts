import { describe, expect, it } from 'vitest';
import {
  composeDateTimeLocalValue,
  formatIsoDateToDisplay,
  parseDisplayDateToIso,
  splitDateTimeLocalValue,
} from './date-input';

describe('formatIsoDateToDisplay (story 12.5, AC 1)', () => {
  it('converts an ISO date to DD/MM/YYYY', () => {
    expect(formatIsoDateToDisplay('2026-07-12')).toBe('12/07/2026');
  });

  it('zero-pads single-digit day/month sources unchanged (already ISO-padded)', () => {
    expect(formatIsoDateToDisplay('2026-01-05')).toBe('05/01/2026');
  });

  it('returns empty string for empty input', () => {
    expect(formatIsoDateToDisplay('')).toBe('');
  });

  it('returns empty string for a malformed ISO string', () => {
    expect(formatIsoDateToDisplay('not-a-date')).toBe('');
  });
});

describe('parseDisplayDateToIso (story 12.5, AC 1)', () => {
  it('parses a zero-padded DD/MM/YYYY', () => {
    expect(parseDisplayDateToIso('12/07/2026')).toBe('2026-07-12');
  });

  it('is tolerant of missing leading zeros', () => {
    expect(parseDisplayDateToIso('1/7/2026')).toBe('2026-07-01');
    expect(parseDisplayDateToIso('5/1/2026')).toBe('2026-01-05');
  });

  it('maps empty string to empty string (cleared, not invalid)', () => {
    expect(parseDisplayDateToIso('')).toBe('');
    expect(parseDisplayDateToIso('   ')).toBe('');
  });

  it('rejects an impossible calendar date (31 February)', () => {
    expect(parseDisplayDateToIso('31/02/2026')).toBeNull();
  });

  it('rejects 29 February on a non-leap year', () => {
    expect(parseDisplayDateToIso('29/02/2026')).toBeNull();
  });

  it('accepts 29 February on a leap year', () => {
    expect(parseDisplayDateToIso('29/02/2024')).toBe('2024-02-29');
  });

  it('rejects an out-of-range month', () => {
    expect(parseDisplayDateToIso('01/13/2026')).toBeNull();
  });

  it('rejects a malformed shape', () => {
    expect(parseDisplayDateToIso('2026-07-12')).toBeNull();
    expect(parseDisplayDateToIso('12/07/26')).toBeNull();
    expect(parseDisplayDateToIso('abc')).toBeNull();
  });

  it('round-trips with formatIsoDateToDisplay', () => {
    const iso = '2026-07-12';
    expect(parseDisplayDateToIso(formatIsoDateToDisplay(iso))).toBe(iso);
  });
});

describe('composeDateTimeLocalValue (story 12.5, AC 1/2 — byte-identical wire)', () => {
  it('composes YYYY-MM-DDTHH:MM, matching the datetime-local input it replaces', () => {
    expect(composeDateTimeLocalValue('2026-07-12', '14:30')).toBe('2026-07-12T14:30');
  });

  it('returns empty string when the date half is missing', () => {
    expect(composeDateTimeLocalValue('', '14:30')).toBe('');
  });

  it('returns empty string when the time half is missing', () => {
    expect(composeDateTimeLocalValue('2026-07-12', '')).toBe('');
  });
});

describe('splitDateTimeLocalValue (story 12.5, AC 1/2)', () => {
  it('splits a composed value back into date/time', () => {
    expect(splitDateTimeLocalValue('2026-07-12T14:30')).toEqual({ date: '2026-07-12', time: '14:30' });
  });

  it('returns empty halves for an empty value', () => {
    expect(splitDateTimeLocalValue('')).toEqual({ date: '', time: '' });
  });
});
