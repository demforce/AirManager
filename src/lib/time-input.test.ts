import { describe, expect, it } from 'vitest';
import { parseTimeShorthand } from './time-input';

describe('parseTimeShorthand (story 12.3, AC 3 — keyboard-first time shorthand)', () => {
  it('parses 4 bare digits (HHmm)', () => {
    expect(parseTimeShorthand('1430')).toBe('14:30');
  });

  it('parses 3 bare digits (Hmm)', () => {
    expect(parseTimeShorthand('930')).toBe('09:30');
  });

  it('parses H:MM, zero-padding the hour', () => {
    expect(parseTimeShorthand('9:30')).toBe('09:30');
  });

  it('is idempotent on HH:MM', () => {
    expect(parseTimeShorthand('14:30')).toBe('14:30');
  });

  it('trims surrounding whitespace', () => {
    expect(parseTimeShorthand('  930  ')).toBe('09:30');
  });

  it('rejects an out-of-range hour (4-digit shorthand)', () => {
    expect(parseTimeShorthand('2500')).toBeNull();
  });

  it('rejects an out-of-range hour (colon form)', () => {
    expect(parseTimeShorthand('24:00')).toBeNull();
  });

  it('rejects an out-of-range minute', () => {
    expect(parseTimeShorthand('1460')).toBeNull();
    expect(parseTimeShorthand('9:60')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseTimeShorthand('abc')).toBeNull();
  });

  it('rejects too few or too many bare digits', () => {
    expect(parseTimeShorthand('9')).toBeNull();
    expect(parseTimeShorthand('93')).toBeNull();
    expect(parseTimeShorthand('14300')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseTimeShorthand('')).toBeNull();
    expect(parseTimeShorthand('   ')).toBeNull();
  });

  it('handles midnight and the last minute of the day', () => {
    expect(parseTimeShorthand('0000')).toBe('00:00');
    expect(parseTimeShorthand('2359')).toBe('23:59');
  });
});
