import { describe, expect, it } from 'vitest';
import { avatarColorFor, hoursBarPercent, initialsOf, pilotRowFlag } from './mobile-registries';

describe('hoursBarPercent', () => {
  it('is 0 when nobody flew (the whole page has 0 minutes)', () => {
    expect(hoursBarPercent(0, 0)).toBe(0);
  });

  it('is 0 for an aircraft that did not fly, even when others did', () => {
    expect(hoursBarPercent(0, 600)).toBe(0);
  });

  it('is 100 for the aircraft that flew the most (a single flying aircraft fills the bar)', () => {
    expect(hoursBarPercent(600, 600)).toBe(100);
  });

  it('is proportional to the page maximum, rounded', () => {
    expect(hoursBarPercent(300, 600)).toBe(50);
    expect(hoursBarPercent(200, 600)).toBe(33);
    expect(hoursBarPercent(1, 600)).toBe(0);
  });

  it('never exceeds the track, even if the caller passes an inconsistent max', () => {
    expect(hoursBarPercent(900, 600)).toBe(100);
  });

  it('treats a negative max as "no data" instead of producing a negative width', () => {
    expect(hoursBarPercent(120, -5)).toBe(0);
  });
});

describe('pilotRowFlag', () => {
  it('returns null when nothing is wrong', () => {
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [] })).toBeNull();
  });

  it('flags a suspended account', () => {
    expect(pilotRowFlag({ currency: null, suspended: true, blockingDocuments: [] })).toEqual({ kind: 'suspended' });
  });

  it('gives the suspension priority over an expired document (one chip per row)', () => {
    expect(pilotRowFlag({ currency: null, suspended: true, blockingDocuments: [{ typeName: 'Medico', daysUntil: -10 }] })).toEqual({ kind: 'suspended' });
  });

  it('flags an expired blocking document and names it', () => {
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [{ typeName: 'Medico classe 2', daysUntil: -1 }] })).toEqual({
      kind: 'expired',
      typeName: 'Medico classe 2',
    });
  });

  it('flags a document expiring today as expiring, not expired (the day itself is still valid)', () => {
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 0 }] })).toEqual({
      kind: 'expiring',
      typeName: 'Abilitazione critica',
      daysUntil: 0,
    });
  });

  it('flags a document due within 30 days', () => {
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 30 }] })).toEqual({
      kind: 'expiring',
      typeName: 'Abilitazione critica',
      daysUntil: 30,
    });
  });

  it('stays silent beyond 30 days (a row that always carries a chip carries no signal)', () => {
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 31 }] })).toBeNull();
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 60 }] })).toBeNull();
  });

  it('picks the most urgent document when several block', () => {
    expect(
      pilotRowFlag({
        currency: null,
        suspended: false,
        blockingDocuments: [
          { typeName: 'Abilitazione critica', daysUntil: 12 },
          { typeName: 'Medico', daysUntil: -3 },
          { typeName: 'Radiotelefonia', daysUntil: 25 },
        ],
      }),
    ).toEqual({ kind: 'expired', typeName: 'Medico' });
  });

  it('breaks a same-day tie by type name, so the chip never flickers between renders', () => {
    const documents = [
      { typeName: 'Medico', daysUntil: 5 },
      { typeName: 'Abilitazione critica', daysUntil: 5 },
    ];
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: documents })).toEqual({ kind: 'expiring', typeName: 'Abilitazione critica', daysUntil: 5 });
    expect(pilotRowFlag({ currency: null, suspended: false, blockingDocuments: [...documents].reverse() })).toEqual({
      kind: 'expiring',
      typeName: 'Abilitazione critica',
      daysUntil: 5,
    });
  });
});

// Story 19.7a (AC 15, D-14): the currency joins the chip, below the documents' expiry.
describe('pilotRowFlag — currency (story 19.7a)', () => {
  const notCurrent = { current: false, daysUntil: -3 };
  const neverFlew = { current: false, daysUntil: null };

  it('suspension still beats everything, a not-current currency included', () => {
    expect(pilotRowFlag({ suspended: true, blockingDocuments: [], currency: notCurrent })).toEqual({ kind: 'suspended' });
  });

  it('an EXPIRED document beats a not-current currency', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Visita medica classe 2', daysUntil: -1 }], currency: notCurrent })).toEqual({
      kind: 'expired',
      typeName: 'Visita medica classe 2',
    });
  });

  it('a not-current currency beats a document merely EXPIRING — with or without a date', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 2 }], currency: notCurrent })).toEqual({ kind: 'currencyExpired' });
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [], currency: neverFlew })).toEqual({ kind: 'currencyExpired' });
  });

  it('both "expiring": the more urgent wins — the currency when it ends first', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 20 }], currency: { current: true, daysUntil: 4 } })).toEqual({
      kind: 'currencyExpiring',
      daysUntil: 4,
    });
  });

  it('both "expiring": the document when it ends first, and on a tie (parity -> document)', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 3 }], currency: { current: true, daysUntil: 9 } })).toEqual({
      kind: 'expiring',
      typeName: 'Abilitazione critica',
      daysUntil: 3,
    });
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 9 }], currency: { current: true, daysUntil: 9 } })).toEqual({
      kind: 'expiring',
      typeName: 'Abilitazione critica',
      daysUntil: 9,
    });
  });

  it('currency alone: ending today or within 30 days -> chip; at 31 days -> none', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [], currency: { current: true, daysUntil: 0 } })).toEqual({ kind: 'currencyExpiring', daysUntil: 0 });
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [], currency: { current: true, daysUntil: 30 } })).toEqual({ kind: 'currencyExpiring', daysUntil: 30 });
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [], currency: { current: true, daysUntil: 31 } })).toBeNull();
  });

  it('a document due beyond 30 days never hides a currency chip, nor the reverse', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 45 }], currency: { current: true, daysUntil: 12 } })).toEqual({
      kind: 'currencyExpiring',
      daysUntil: 12,
    });
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [{ typeName: 'Abilitazione critica', daysUntil: 12 }], currency: { current: true, daysUntil: 80 } })).toEqual({
      kind: 'expiring',
      typeName: 'Abilitazione critica',
      daysUntil: 12,
    });
  });

  it('no currency at all (an instructor without pilot profile): only the documents speak', () => {
    expect(pilotRowFlag({ suspended: false, blockingDocuments: [], currency: null })).toBeNull();
  });
});

describe('avatarColorFor', () => {
  it('is deterministic for the same id', () => {
    expect(avatarColorFor('cmsdp9gcg00004xpvbjrafp34')).toBe(avatarColorFor('cmsdp9gcg00004xpvbjrafp34'));
  });

  it('only ever returns a tone the design system defines', () => {
    const tones = new Set(['', 'amber', 'green', 'violet', 'red']);
    for (const id of ['a', 'b', 'c', 'zzz', 'cmsdp9gcg00004xpvbjrafp34', '']) {
      expect(tones.has(avatarColorFor(id))).toBe(true);
    }
  });

  it('spreads across more than one tone on realistic ids', () => {
    const ids = ['cma1', 'cma2', 'cma3', 'cma4', 'cma5'];
    expect(new Set(ids.map(avatarColorFor)).size).toBeGreaterThan(1);
  });
});

describe('initialsOf', () => {
  it('is lastName + firstName, uppercase, in the order the row title uses', () => {
    expect(initialsOf('Marco', 'Rossi')).toBe('RM');
  });

  it('falls back to the single available initial when one part is empty', () => {
    expect(initialsOf('', 'Rossi')).toBe('R');
    expect(initialsOf('Marco', '')).toBe('M');
  });

  it('is empty only when both parts are', () => {
    expect(initialsOf('', '')).toBe('');
    expect(initialsOf('  ', ' ')).toBe('');
  });
});
