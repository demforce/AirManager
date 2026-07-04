import { describe, expect, it } from 'vitest';
import { formatCents, parseCents } from './money';

// Node's ICU formats "<amount> €" for it-IT (non-breaking space before
// the currency symbol) — spelled out explicitly since it's invisible in a
// plain string literal.
const NBSP = ' ';

describe('formatCents', () => {
  it('formats a whole-euro amount in Italian locale', () => {
    expect(formatCents(150000, 'it')).toBe(`1500,00${NBSP}€`);
  });

  it('formats a whole-euro amount in English locale', () => {
    expect(formatCents(150000, 'en')).toBe('€1,500.00');
  });

  it('formats a larger amount with thousands grouping in Italian locale', () => {
    expect(formatCents(1500000, 'it')).toBe(`15.000,00${NBSP}€`);
  });

  it('formats zero cents', () => {
    expect(formatCents(0, 'it')).toBe(`0,00${NBSP}€`);
  });

  it('formats negative cents (e.g. a reversal)', () => {
    expect(formatCents(-550, 'it')).toBe(`-5,50${NBSP}€`);
  });

  it('defaults to the Italian locale', () => {
    expect(formatCents(100)).toBe(formatCents(100, 'it'));
  });

  it('throws on non-integer input', () => {
    expect(() => formatCents(10.5)).toThrow(TypeError);
  });
});

describe('parseCents', () => {
  it('parses a plain integer amount', () => {
    expect(parseCents('12')).toBe(1200);
  });

  it('parses a dot-decimal amount', () => {
    expect(parseCents('12.50')).toBe(1250);
  });

  it('parses a comma-decimal amount (Italian input)', () => {
    expect(parseCents('12,5')).toBe(1250);
  });

  it('parses a single decimal digit by padding to cents', () => {
    expect(parseCents('12,4')).toBe(1240);
  });

  it('parses a negative amount', () => {
    expect(parseCents('-5,50')).toBe(-550);
  });

  it('parses amounts with surrounding whitespace', () => {
    expect(parseCents('  7,00  ')).toBe(700);
  });

  it('throws on empty input', () => {
    expect(() => parseCents('')).toThrow(RangeError);
  });

  it('throws on non-numeric input', () => {
    expect(() => parseCents('abc')).toThrow(RangeError);
  });

  it('throws on more than 2 decimal digits', () => {
    expect(() => parseCents('12.999')).toThrow(RangeError);
  });

  it('round-trips through formatCents', () => {
    const cents = parseCents('42,42');
    expect(formatCents(cents, 'it')).toBe(`42,42${NBSP}€`);
  });
});
