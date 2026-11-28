import { describe, expect, it } from 'vitest';
import { computeCurrency, CURRENCY_DEFAULTS, type CurrencyResult } from './currency';
import { addDaysDateOnly } from './zoned-time';

const D = '2026-06-15';
const daysBefore = (days: number) => addDaysDateOnly(D, -days);
const X1_Y90 = { minFlights: 1, windowDays: 90 };
const X2_Y90 = { minFlights: 2, windowDays: 90 };

/** Every case also proves the invariant of D-6: current ⇔ flightsInWindow ≥ X. */
function expectConsistent(result: CurrencyResult, minFlights: number): void {
  expect(result.current).toBe(result.flightsInWindow >= minFlights);
}

describe('computeCurrency (story 19.7a, D-6)', () => {
  it('defaults are X=1, Y=90', () => {
    expect(CURRENCY_DEFAULTS).toEqual({ minFlights: 1, windowDays: 90 });
  });

  it('X=1: a flight at D−90 is still current, expiring on D itself', () => {
    const result = computeCurrency([daysBefore(90)], D, X1_Y90);
    expect(result).toEqual({ current: true, expiresAt: D, lastFlightDate: daysBefore(90), flightsInWindow: 1 });
    expectConsistent(result, 1);
  });

  it('X=1: a flight at D−91 has left the window — not current, expired on D−1', () => {
    const result = computeCurrency([daysBefore(91)], D, X1_Y90);
    expect(result).toEqual({ current: false, expiresAt: daysBefore(1), lastFlightDate: daysBefore(91), flightsInWindow: 0 });
    expectConsistent(result, 1);
  });

  it('no flight at all: not current, no date', () => {
    const result = computeCurrency([], D, X1_Y90);
    expect(result).toEqual({ current: false, expiresAt: null, lastFlightDate: null, flightsInWindow: 0 });
    expectConsistent(result, 1);
  });

  it('X=2: flights at D−10 and D−91 — the 2nd most recent is out, expired on D−1', () => {
    const result = computeCurrency([daysBefore(91), daysBefore(10)], D, X2_Y90);
    expect(result).toEqual({ current: false, expiresAt: daysBefore(1), lastFlightDate: daysBefore(10), flightsInWindow: 1 });
    expectConsistent(result, 2);
  });

  it('X=2: flights at D−10 and D−90 — current, expiring on D', () => {
    const result = computeCurrency([daysBefore(10), daysBefore(90)], D, X2_Y90);
    expect(result).toMatchObject({ current: true, expiresAt: D, flightsInWindow: 2 });
    expectConsistent(result, 2);
  });

  it('X=2: two flights on the SAME day count twice', () => {
    const result = computeCurrency([daysBefore(5), daysBefore(5)], D, X2_Y90);
    expect(result).toEqual({ current: true, expiresAt: addDaysDateOnly(D, 85), lastFlightDate: daysBefore(5), flightsInWindow: 2 });
    expectConsistent(result, 2);
  });

  it('X=3 with only two flights ever: no date at all', () => {
    const result = computeCurrency([daysBefore(5), daysBefore(6)], D, { minFlights: 3, windowDays: 90 });
    expect(result).toMatchObject({ current: false, expiresAt: null, flightsInWindow: 2 });
    expectConsistent(result, 3);
  });

  it('flights after atDate never count (neither for the window nor for the date)', () => {
    const result = computeCurrency([addDaysDateOnly(D, 1), daysBefore(91)], D, X1_Y90);
    expect(result).toEqual({ current: false, expiresAt: daysBefore(1), lastFlightDate: daysBefore(91), flightsInWindow: 0 });
    expectConsistent(result, 1);
  });

  it('Y=1: a flight at D−1 is current, expiring on D', () => {
    const result = computeCurrency([daysBefore(1)], D, { minFlights: 1, windowDays: 1 });
    expect(result).toEqual({ current: true, expiresAt: D, lastFlightDate: daysBefore(1), flightsInWindow: 1 });
    expectConsistent(result, 1);
  });

  it('input order does not matter, and the window crosses a month/year edge correctly', () => {
    const result = computeCurrency(['2025-12-31', '2026-01-02', '2025-10-01'], '2026-01-05', { minFlights: 2, windowDays: 30 });
    expect(result).toEqual({ current: true, expiresAt: '2026-01-30', lastFlightDate: '2026-01-02', flightsInWindow: 2 });
    expectConsistent(result, 2);
  });
});
