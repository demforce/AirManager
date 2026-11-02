import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import it_ from '../../messages/it.json';
import { describeRequirementFailure } from './requirement-failures';

// Story 19.9 (AC 23) — the failure -> key + values mapping, and the very
// messages the warning renders with it (real catalogues, real ICU plurals).
const format = { formatDate: (dateOnly: string) => `[${dateOnly}]`, formatMoney: (cents: number) => `${cents}c` };
const tIt = createTranslator({ locale: 'it', messages: it_, namespace: 'Requirements' });
const tEn = createTranslator({ locale: 'en', messages: en, namespace: 'Requirements' });

function renderIt(failure: Parameters<typeof describeRequirementFailure>[0]): string {
  const described = describeRequirementFailure(failure, format);
  return tIt(`failure.${described.key}`, described.values);
}

const currency = (flightsInWindow: number, daysSinceLastFlight: number) =>
  ({ type: 'CURRENCY', role: 'person', personName: 'Mario Rossi', lastFlightDate: '2026-07-01', daysSinceLastFlight, flightsInWindow, minFlights: 2, windowDays: 90 }) as const;

describe('describeRequirementFailure', () => {
  it('EXPIRY: an expired document reads its date, a missing one reads "mancante"; both name who and in which role', () => {
    expect(describeRequirementFailure({ type: 'EXPIRY', role: 'instructor', personName: 'Anna Bianchi', typeName: 'SEP', expiresAt: '2026-09-30' }, format)).toEqual({
      who: { name: 'Anna Bianchi', role: 'instructor' },
      key: 'expiryExpired',
      values: { typeName: 'SEP', date: '[2026-09-30]' },
    });
    expect(describeRequirementFailure({ type: 'EXPIRY', role: 'person', personName: 'Mario Rossi', typeName: 'SEP', expiresAt: null }, format)).toMatchObject({
      key: 'expiryMissing',
      values: { typeName: 'SEP' },
    });
  });

  it('MEMBERSHIP: expired with its date, never paid without', () => {
    expect(describeRequirementFailure({ type: 'MEMBERSHIP', role: 'person', personName: 'Mario Rossi', expiresAt: '2026-01-31' }, format)).toMatchObject({
      key: 'membershipExpired',
      values: { date: '[2026-01-31]' },
    });
    expect(describeRequirementFailure({ type: 'MEMBERSHIP', role: 'person', personName: 'Mario Rossi', expiresAt: null }, format)).toMatchObject({
      key: 'membershipMissing',
      values: {},
    });
  });

  it('CURRENCY: the counts stay NUMBERS (the ICU plurals read them); never flown is its own key', () => {
    expect(describeRequirementFailure(currency(1, 92), format)).toEqual({
      who: { name: 'Mario Rossi', role: 'person' },
      key: 'currency',
      values: { flightsInWindow: 1, windowDays: 90, minFlights: 2, date: '[2026-07-01]', days: 92 },
    });
    expect(
      describeRequirementFailure(
        { type: 'CURRENCY', role: 'person', personName: 'Mario Rossi', lastFlightDate: null, daysSinceLastFlight: null, flightsInWindow: 0, minFlights: 1, windowDays: 90 },
        format,
      ),
    ).toMatchObject({ key: 'currencyNever', values: { minFlights: 1, windowDays: 90 } });
  });

  it('BALANCE: both amounts formatted by the caller', () => {
    expect(describeRequirementFailure({ type: 'BALANCE', role: 'person', personName: 'Mario Rossi', balanceCents: -500, costCents: 7500 }, format)).toMatchObject({
      key: 'balance',
      values: { balance: '-500c', cost: '7500c' },
    });
  });

  it('AIRCRAFT_OUT_OF_SERVICE: nobody (who: null), with the return date only when one is on file', () => {
    expect(describeRequirementFailure({ type: 'AIRCRAFT_OUT_OF_SERVICE', registration: 'I-AOGX', reason: 'Revisione', outOfServiceUntil: null }, format)).toEqual({
      who: null,
      key: 'outOfService',
      values: { registration: 'I-AOGX', reason: 'Revisione' },
    });
    expect(describeRequirementFailure({ type: 'AIRCRAFT_OUT_OF_SERVICE', registration: 'I-AOGX', reason: 'Revisione', outOfServiceUntil: '2026-12-01' }, format)).toMatchObject({
      key: 'outOfServiceUntil',
      values: { date: '[2026-12-01]' },
    });
  });
});

describe('Requirements messages (AC 23 — ICU plurals)', () => {
  it('renders "1 volo" / "0 voli" / "2 voli" and the days with their own plural', () => {
    expect(renderIt(currency(1, 1))).toBe('Currency scaduta: 1 volo negli ultimi 90 giorni (minimo 2); ultimo volo il [2026-07-01], 1 giorno fa');
    expect(renderIt(currency(0, 92))).toBe('Currency scaduta: 0 voli negli ultimi 90 giorni (minimo 2); ultimo volo il [2026-07-01], 92 giorni fa');
    expect(renderIt(currency(2, 92))).toContain('2 voli negli ultimi 90 giorni');
  });

  it('renders the never-flown minimum with its plural, in both languages', () => {
    const never = (minFlights: number) =>
      describeRequirementFailure(
        { type: 'CURRENCY', role: 'person', personName: 'Mario Rossi', lastFlightDate: null, daysSinceLastFlight: null, flightsInWindow: 0, minFlights, windowDays: 90 },
        format,
      );
    expect(tIt(`failure.${never(1).key}`, never(1).values)).toBe('Currency scaduta: nessun volo registrato (minimo 1 volo negli ultimi 90 giorni)');
    expect(tEn(`failure.${never(3).key}`, never(3).values)).toBe('Currency lapsed: no flight logged (minimum 3 flights in the last 90 days)');
  });

  it('every key the formatter can produce exists in both catalogues', () => {
    for (const key of ['expiryExpired', 'expiryMissing', 'membershipExpired', 'membershipMissing', 'currency', 'currencyNever', 'balance', 'outOfService', 'outOfServiceUntil']) {
      expect(it_.Requirements.failure).toHaveProperty(key);
      expect(en.Requirements.failure).toHaveProperty(key);
    }
  });
});
