import { describe, expect, it } from 'vitest';
import { currentMonthRange, currentQuarterRange, currentYearRange } from './period-presets';

describe('currentMonthRange (story 3.5, period presets — UI only, Europe/Rome)', () => {
  it('resolves a mid-month UTC instant to that calendar month', () => {
    expect(currentMonthRange(new Date(Date.UTC(2026, 6, 15, 12, 0)))).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('picks the Rome-local NEXT day at 23:30 UTC in winter (CET, UTC+1) — crosses the month boundary', () => {
    // 2026-01-31T23:30:00Z is already 2026-02-01T00:30 in Rome (CET).
    expect(currentMonthRange(new Date(Date.UTC(2026, 0, 31, 23, 30)))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('picks the Rome-local NEXT day at 22:30 UTC in summer (CEST, UTC+2) — crosses the month boundary', () => {
    // 2026-06-30T22:30:00Z is already 2026-07-01T00:30 in Rome (CEST).
    expect(currentMonthRange(new Date(Date.UTC(2026, 5, 30, 22, 30)))).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('handles a leap-year February', () => {
    expect(currentMonthRange(new Date(Date.UTC(2028, 1, 10, 12, 0)))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('currentQuarterRange', () => {
  it('resolves Q1 (Jan-Mar)', () => {
    expect(currentQuarterRange(new Date(Date.UTC(2026, 1, 10, 12, 0)))).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('resolves Q3 (Jul-Sep)', () => {
    expect(currentQuarterRange(new Date(Date.UTC(2026, 6, 15, 12, 0)))).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  });

  it('resolves Q4 (Oct-Dec)', () => {
    expect(currentQuarterRange(new Date(Date.UTC(2026, 11, 25, 12, 0)))).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });
});

describe('currentYearRange', () => {
  it('resolves the full calendar year', () => {
    expect(currentYearRange(new Date(Date.UTC(2026, 6, 15, 12, 0)))).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('picks the Rome-local NEXT year at 23:30 UTC on Dec 31 in winter (CET)', () => {
    expect(currentYearRange(new Date(Date.UTC(2026, 11, 31, 23, 30)))).toEqual({ from: '2027-01-01', to: '2027-12-31' });
  });
});
