import { describe, expect, it } from 'vitest';
import { resolveStatementPeriod } from './statement-period';

const NOW = new Date(Date.UTC(2026, 10, 3, 9, 0));
const DEFAULT = { from: '2025-11-03', to: '2026-11-03', explicit: false };

describe('resolveStatementPeriod (story 19.11, AC 13 — the estratto conto period from the URL)', () => {
  it('a valid pair is the explicit period, as written', () => {
    expect(resolveStatementPeriod({ from: '2020-01-01', to: '2021-12-31' }, NOW)).toEqual({ from: '2020-01-01', to: '2021-12-31', explicit: true });
  });

  it('a one-day period (from = to) is valid', () => {
    expect(resolveStatementPeriod({ from: '2026-07-01', to: '2026-07-01' }, NOW)).toEqual({ from: '2026-07-01', to: '2026-07-01', explicit: true });
  });

  it('no parameters: the default 12 months', () => {
    expect(resolveStatementPeriod({}, NOW)).toEqual(DEFAULT);
  });

  it('only one bound: the default, never a half-open period', () => {
    expect(resolveStatementPeriod({ from: '2020-01-01' }, NOW)).toEqual(DEFAULT);
    expect(resolveStatementPeriod({ to: '2020-01-01' }, NOW)).toEqual(DEFAULT);
  });

  it('an invalid date: the default', () => {
    expect(resolveStatementPeriod({ from: '2026-02-30', to: '2026-03-01' }, NOW)).toEqual(DEFAULT);
    expect(resolveStatementPeriod({ from: 'ieri', to: '2026-03-01' }, NOW)).toEqual(DEFAULT);
  });

  it('an inverted pair: the default', () => {
    expect(resolveStatementPeriod({ from: '2026-02-01', to: '2026-01-01' }, NOW)).toEqual(DEFAULT);
  });

  it('a repeated parameter (an array): the default', () => {
    expect(resolveStatementPeriod({ from: ['2020-01-01', '2021-01-01'], to: '2026-01-01' }, NOW)).toEqual(DEFAULT);
  });
});
