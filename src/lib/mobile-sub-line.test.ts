import { describe, expect, it } from 'vitest';
import { joinSegments } from './mobile-sub-line';

describe('joinSegments', () => {
  it('joins with the template\'s own separator', () => {
    expect(joinSegments(['a', 'b', 'c'])).toBe('a · b · c');
  });

  it('DROPS an absent segment instead of leaving two separators adjacent (review 15.5 F1)', () => {
    expect(joinSegments(['a', null, 'c'])).toBe('a · c');
    expect(joinSegments(['a', undefined, 'c'])).toBe('a · c');
    expect(joinSegments(['a', '', 'c'])).toBe('a · c');
    expect(joinSegments(['a', '   ', 'c'])).toBe('a · c');
  });

  it('never produces a leading or trailing separator', () => {
    expect(joinSegments([null, 'b', null])).toBe('b');
    expect(joinSegments(['', ''])).toBe('');
  });

  it('trims the segments it keeps', () => {
    expect(joinSegments([' a ', 'b '])).toBe('a · b');
  });
});
