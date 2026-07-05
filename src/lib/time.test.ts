import { describe, expect, it } from 'vitest';
import { formatMinutes, formatTimeOfDay, parseMinutes } from './time';

describe('formatMinutes', () => {
  it('formats minutes under an hour', () => {
    expect(formatMinutes(45)).toBe('0:45');
  });

  it('formats an exact hour', () => {
    expect(formatMinutes(60)).toBe('1:00');
  });

  it('formats over an hour', () => {
    expect(formatMinutes(90)).toBe('1:30');
  });

  it('formats zero minutes', () => {
    expect(formatMinutes(0)).toBe('0:00');
  });

  it('formats durations over 24 hours without wrapping', () => {
    expect(formatMinutes(25 * 60 + 5)).toBe('25:05');
  });

  it('throws on negative input', () => {
    expect(() => formatMinutes(-1)).toThrow(RangeError);
  });

  it('throws on non-integer input', () => {
    expect(() => formatMinutes(1.5)).toThrow(RangeError);
  });
});

describe('parseMinutes', () => {
  it('parses H:MM', () => {
    expect(parseMinutes('1:30')).toBe(90);
  });

  it('parses HH:MM', () => {
    expect(parseMinutes('01:05')).toBe(65);
  });

  it('parses 0:00', () => {
    expect(parseMinutes('0:00')).toBe(0);
  });

  it('parses durations over 24 hours', () => {
    expect(parseMinutes('25:05')).toBe(1505);
  });

  it('throws on invalid minute component', () => {
    expect(() => parseMinutes('1:75')).toThrow(RangeError);
  });

  it('throws on malformed input', () => {
    expect(() => parseMinutes('abc')).toThrow(RangeError);
  });

  it('round-trips through formatMinutes', () => {
    expect(parseMinutes(formatMinutes(125))).toBe(125);
  });
});

describe('formatTimeOfDay', () => {
  it('presents a winter UTC timestamp in Europe/Rome (CET, UTC+1)', () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0));
    expect(formatTimeOfDay(date, 'it')).toBe('13:00');
  });

  it('presents a summer UTC timestamp in Europe/Rome (CEST, UTC+2)', () => {
    const date = new Date(Date.UTC(2026, 6, 15, 12, 0));
    expect(formatTimeOfDay(date, 'it')).toBe('14:00');
  });

  it('defaults to the Italian locale', () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0));
    expect(formatTimeOfDay(date)).toBe(formatTimeOfDay(date, 'it'));
  });
});
