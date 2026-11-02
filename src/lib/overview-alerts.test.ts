import { describe, expect, it } from 'vitest';
import { buildOverviewAlerts, OVERVIEW_ALERTS_LIMIT, type OverviewAlertsInput } from './overview-alerts';

function expiry(id: string, daysUntil: number | null, lastName = 'Rossi') {
  return { id, personId: `p-${id}`, personFirstName: 'Mario', personLastName: lastName, category: 'MEDICAL' as const, typeName: 'Visita medica', daysUntil };
}

/** A row of the unified registry with no date and no type of its own (story 19.7b): a currency never acquired. */
function missingCurrency(id: string) {
  return { ...expiry(id, null), category: 'CURRENCY' as const, typeName: null };
}

function balance(personId: string, balanceCents: number) {
  return { personId, firstName: 'Anna', lastName: 'Bianchi', balanceCents };
}

const EMPTY: OverviewAlertsInput = { expiries: [], negativeBalances: [] };

describe('buildOverviewAlerts — ratified order (R-15.3-e)', () => {
  it('ranks scaduto -> saldo negativo -> <=7g -> <=30g -> <=60g', () => {
    const result = buildOverviewAlerts(
      {
        expiries: [expiry('in60', 55), expiry('in30', 20), expiry('in7', 3), expiry('overdue', -4)],
        negativeBalances: [balance('debtor', -12_000)],
      },
      99,
    );

    expect(result.items.map((item) => item.key)).toEqual([
      'expiry:overdue',
      'balance:debtor',
      'expiry:in7',
      'expiry:in30',
      'expiry:in60',
    ]);
    expect(result.hiddenCount).toBe(0);
    expect(result.moreHref).toBeNull();
  });

  it('orders inside a rank by real urgency: most overdue scadenza and deepest negative balance first', () => {
    const result = buildOverviewAlerts(
      {
        expiries: [expiry('late-1', -1), expiry('late-30', -30), expiry('late-9', -9)],
        negativeBalances: [balance('small', -500), balance('big', -90_000)],
      },
      99,
    );

    expect(result.items.map((item) => item.key)).toEqual([
      'expiry:late-30',
      'expiry:late-9',
      'expiry:late-1',
      'balance:big',
      'balance:small',
    ]);
  });

  it('drops a scadenza beyond the 60-day window (tier 4 is not an avviso)', () => {
    const result = buildOverviewAlerts({ ...EMPTY, expiries: [expiry('far', 120)] });
    expect(result.items).toEqual([]);
  });
});

describe('buildOverviewAlerts — missing rows of the unified registry (story 19.7b)', () => {
  it('rank of an expired row, weight −1: after one expired 10 days ago, before one expiring, never dropped', () => {
    const result = buildOverviewAlerts(
      {
        expiries: [expiry('in7', 3), missingCurrency('currency:p1'), expiry('in60', 55), expiry('late-10', -10)],
        negativeBalances: [balance('debtor', -1_000)],
      },
      99,
    );

    expect(result.items.map((item) => item.key)).toEqual(['expiry:late-10', 'expiry:currency:p1', 'balance:debtor', 'expiry:in7', 'expiry:in60']);
  });

  it('sorts exactly like a row that expired yesterday (D-20), red', () => {
    const result = buildOverviewAlerts({ ...EMPTY, expiries: [expiry('yesterday', -1), missingCurrency('currency:p1'), expiry('two-days', -2)] }, 99);

    expect(result.items.map((item) => item.key)).toEqual(['expiry:two-days', 'expiry:currency:p1', 'expiry:yesterday']);
    expect(result.items.find((item) => item.key === 'expiry:currency:p1')?.tone).toBe('red');
  });

  it('the cap hides missing rows after the older expired documents, never before them', () => {
    const result = buildOverviewAlerts({ ...EMPTY, expiries: [missingCurrency('currency:a'), missingCurrency('currency:b'), expiry('decade', -3650)] }, 1);

    expect(result.items.map((item) => item.key)).toEqual(['expiry:decade']);
    expect(result.hiddenCount).toBe(2);
  });
});

describe('buildOverviewAlerts — tone', () => {
  it('marks scaduto and <=7g red, <=30g and <=60g amber', () => {
    const result = buildOverviewAlerts({ ...EMPTY, expiries: [expiry('a', -1), expiry('b', 7), expiry('c', 8), expiry('d', 60)] }, 99);
    expect(result.items.map((item) => item.tone)).toEqual(['red', 'red', 'amber', 'amber']);
  });

  it('marks every negative balance red', () => {
    const result = buildOverviewAlerts({ ...EMPTY, negativeBalances: [balance('x', -1)] });
    expect(result.items[0]?.tone).toBe('red');
  });
});

describe('buildOverviewAlerts — cap and "Vedi tutte" (the case no e2e can fabricate)', () => {
  it('shows at most 5 voices by default and reports how many it hid', () => {
    const result = buildOverviewAlerts({
      ...EMPTY,
      negativeBalances: Array.from({ length: 40 }, (_, index) => balance(`debtor-${index}`, -1000 * (index + 1))),
    });

    expect(result.items).toHaveLength(OVERVIEW_ALERTS_LIMIT);
    expect(result.hiddenCount).toBe(35);
    // Most negative first, so the cap keeps the five biggest debts.
    expect(result.items.map((item) => (item.kind === 'negativeBalance' ? item.balance.balanceCents : null))).toEqual([
      -40_000, -39_000, -38_000, -37_000, -36_000,
    ]);
  });

  it('points "Vedi tutte" at the page of competence of the most urgent HIDDEN voice', () => {
    // Five overdue scadenze fill the cap; the 6th voice hidden is a negative
    // balance, so the overflow row must lead to Contabilità, not Scadenze.
    const result = buildOverviewAlerts({
      expiries: Array.from({ length: 5 }, (_, index) => expiry(`late-${index}`, -10 - index)),
      negativeBalances: [balance('debtor', -5000)],
    });

    expect(result.items).toHaveLength(5);
    expect(result.hiddenCount).toBe(1);
    expect(result.moreHref).toBe('/dashboard/billing');
  });

  it('points at Scadenze when the hidden tail starts with a scadenza', () => {
    const result = buildOverviewAlerts({
      expiries: Array.from({ length: 8 }, (_, index) => expiry(`late-${index}`, -10 - index)),
      negativeBalances: [],
    });
    expect(result.hiddenCount).toBe(3);
    expect(result.moreHref).toBe('/dashboard/expiries');
  });

  it('deep-links a single negative-balance voice to its own person, not to the list', () => {
    const result = buildOverviewAlerts({ ...EMPTY, negativeBalances: [balance('person-7', -900)] });
    expect(result.items[0]?.href).toBe('/dashboard/people/person-7');
  });

  it('returns nothing at all on an empty airfield', () => {
    expect(buildOverviewAlerts(EMPTY)).toEqual({ items: [], hiddenCount: 0, hiddenCountIsFloor: false, moreHref: null });
  });
});

/**
 * Review 15.3 F7, PO ratification 2026-07-30. `hiddenCount` counts what the
 * FEED hid, but the expiries handed to the feed are themselves capped by the
 * caller's scan limit — so above that cap "+N altri" was a number that quietly
 * under-reported (measured: "+48 altri" while the truth was higher). The feed
 * now says whether its own count is a floor, and the card renders "+N e oltre".
 */
describe('buildOverviewAlerts — "+N" is a floor when the source scan was capped (F7)', () => {
  const capped = (count: number, scanLimit?: number) =>
    buildOverviewAlerts({
      ...EMPTY,
      expiries: Array.from({ length: count }, (_, index) => expiry(`e-${index}`, -index)),
      ...(scanLimit === undefined ? {} : { expiriesScanLimit: scanLimit }),
    });

  it('a FULL scan means more may exist beyond it: the count is a floor', () => {
    const result = capped(60, 60);
    expect(result.hiddenCount).toBe(55);
    expect(result.hiddenCountIsFloor).toBe(true);
  });

  it('a scan that came back under its limit saw everything: the count is exact', () => {
    const result = capped(12, 60);
    expect(result.hiddenCount).toBe(7);
    expect(result.hiddenCountIsFloor).toBe(false);
  });

  it('nothing hidden, nothing to caveat — even when the scan was full', () => {
    // Five expiries exactly fill the feed: `hiddenCount` is 0, so "+N e oltre"
    // must not appear just because the scan limit happened to be five too.
    const result = capped(5, 5);
    expect(result.hiddenCount).toBe(0);
    expect(result.hiddenCountIsFloor).toBe(false);
  });

  it('without a declared scan limit the input IS everything (unit-test default)', () => {
    expect(capped(20).hiddenCountIsFloor).toBe(false);
  });
});
