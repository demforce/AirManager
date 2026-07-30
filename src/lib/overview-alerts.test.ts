import { describe, expect, it } from 'vitest';
import { buildOverviewAlerts, OVERVIEW_ALERTS_LIMIT, type OverviewAlertsInput } from './overview-alerts';

function expiry(id: string, daysUntil: number, lastName = 'Rossi') {
  return { id, personId: `p-${id}`, personFirstName: 'Mario', personLastName: lastName, typeName: 'Visita medica', daysUntil };
}

function balance(personId: string, balanceCents: number) {
  return { personId, firstName: 'Anna', lastName: 'Bianchi', balanceCents };
}

const EMPTY: OverviewAlertsInput = { expiries: [], negativeBalances: [], pprPendingCount: 0 };

describe('buildOverviewAlerts — ratified order (R-15.3-e)', () => {
  it('ranks scaduto -> saldo negativo -> <=7g -> PPR -> <=30g -> <=60g', () => {
    const result = buildOverviewAlerts(
      {
        expiries: [expiry('in60', 55), expiry('in30', 20), expiry('in7', 3), expiry('overdue', -4)],
        negativeBalances: [balance('debtor', -12_000)],
        pprPendingCount: 2,
      },
      99,
    );

    expect(result.items.map((item) => item.key)).toEqual([
      'expiry:overdue',
      'balance:debtor',
      'expiry:in7',
      'ppr:pending',
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
        pprPendingCount: 0,
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

  it('omits the PPR voice entirely when nothing is pending', () => {
    const result = buildOverviewAlerts({ ...EMPTY, pprPendingCount: 0 });
    expect(result.items).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });

  it('collapses the PPR queue into ONE voice carrying the count, never one row per request', () => {
    const result = buildOverviewAlerts({ ...EMPTY, pprPendingCount: 7 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: 'pprPending', count: 7, tone: 'amber' });
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
      pprPendingCount: 3,
    });

    expect(result.items).toHaveLength(5);
    expect(result.hiddenCount).toBe(2);
    expect(result.moreHref).toBe('/dashboard/billing');
  });

  it('points at Scadenze when the hidden tail starts with a scadenza', () => {
    const result = buildOverviewAlerts({
      expiries: Array.from({ length: 8 }, (_, index) => expiry(`late-${index}`, -10 - index)),
      negativeBalances: [],
      pprPendingCount: 0,
    });
    expect(result.hiddenCount).toBe(3);
    expect(result.moreHref).toBe('/dashboard/expiries');
  });

  it('points at PPR when the pending queue is the first hidden voice', () => {
    const result = buildOverviewAlerts({
      expiries: [expiry('a', -3), expiry('b', 2)],
      negativeBalances: [balance('c', -1), balance('d', -2), balance('e', -3)],
      pprPendingCount: 1,
    });
    expect(result.items).toHaveLength(5);
    expect(result.hiddenCount).toBe(1);
    expect(result.moreHref).toBe('/dashboard/ppr');
  });

  it('deep-links a single negative-balance voice to its own person, not to the list', () => {
    const result = buildOverviewAlerts({ ...EMPTY, negativeBalances: [balance('person-7', -900)] });
    expect(result.items[0]?.href).toBe('/dashboard/people/person-7');
  });

  it('returns nothing at all on an empty airfield', () => {
    expect(buildOverviewAlerts(EMPTY)).toEqual({ items: [], hiddenCount: 0, moreHref: null });
  });
});
