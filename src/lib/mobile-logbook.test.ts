import { describe, expect, it } from 'vitest';
import { flightBadgeKind, flightCardSubLine, flightRouteLabel, flightSheetSub } from './mobile-logbook';

const registered = { status: 'REGISTERED' as const, forcedAt: null, correctionOfId: null, correctedByFlightId: null };

describe('flightBadgeKind', () => {
  it('gives an ordinary registered flight no badge at all (ratifica R-15.6-b: a clean row stays clean)', () => {
    expect(flightBadgeKind(registered)).toBeNull();
  });

  it('flags a cancelled flight', () => {
    expect(flightBadgeKind({ ...registered, status: 'CANCELLED' })).toBe('cancelled');
  });

  it('flags an admin override on a registered flight', () => {
    expect(flightBadgeKind({ ...registered, forcedAt: '2026-01-02T10:00:00.000Z' })).toBe('forced');
  });

  it('flags a flight that IS a correction, and one that WAS corrected', () => {
    expect(flightBadgeKind({ ...registered, correctionOfId: 'f1' })).toBe('correction');
    expect(flightBadgeKind({ ...registered, correctedByFlightId: 'f2' })).toBe('correction');
  });

  it('cancellation wins over an override and over lineage (the three can hold at once)', () => {
    expect(
      flightBadgeKind({ status: 'CANCELLED', forcedAt: '2026-01-02T10:00:00.000Z', correctionOfId: 'f1', correctedByFlightId: 'f2' }),
    ).toBe('cancelled');
  });

  it('an override wins over lineage on a registered flight', () => {
    expect(flightBadgeKind({ ...registered, forcedAt: '2026-01-02T10:00:00.000Z', correctionOfId: 'f1' })).toBe('forced');
  });
});

describe('flightRouteLabel', () => {
  it('is the template\'s own DEP→ARR when both airfields are there', () => {
    expect(flightRouteLabel('LIRZ', 'LIPY')).toBe('LIRZ→LIPY');
  });

  it('is null on a pre-11.1 flight, whichever end is missing (never a half route)', () => {
    expect(flightRouteLabel(null, 'LIPY')).toBeNull();
    expect(flightRouteLabel('LIRZ', null)).toBeNull();
    expect(flightRouteLabel(null, null)).toBeNull();
  });

  it('treats a blank string like a missing airfield', () => {
    expect(flightRouteLabel('   ', 'LIPY')).toBeNull();
  });
});

describe('flightCardSubLine', () => {
  it('is the template\'s date · route · type · CFI when the flight has everything', () => {
    expect(flightCardSubLine({ date: '02/01/2020', route: 'LIRZ→LIPY', typeLabel: 'Scuola', instructorLabel: 'CFI Rossi Mario' })).toBe(
      '02/01/2020 · LIRZ→LIPY · Scuola · CFI Rossi Mario',
    );
  });

  it('drops the route of a historical flight instead of leaving two separators adjacent', () => {
    const line = flightCardSubLine({ date: '02/01/2020', route: null, typeLabel: 'Turismo', instructorLabel: null });
    expect(line).toBe('02/01/2020 · Turismo');
    expect(line).not.toMatch(/·\s*·/);
  });

  it('drops the CFI segment when nobody instructed', () => {
    expect(flightCardSubLine({ date: '02/01/2020', route: 'LIRZ→LIPY', typeLabel: 'Turismo', instructorLabel: null })).toBe('02/01/2020 · LIRZ→LIPY · Turismo');
  });

  it('never opens or closes on a separator, whatever is missing', () => {
    for (const route of [null, 'LIRZ→LIPY']) {
      for (const instructorLabel of [null, 'CFI Rossi Mario']) {
        const line = flightCardSubLine({ date: '02/01/2020', route, typeLabel: 'Turismo', instructorLabel });
        expect(line.startsWith('·')).toBe(false);
        expect(line.endsWith('·')).toBe(false);
        expect(line).not.toMatch(/·\s*·/);
      }
    }
  });
});

describe('flightSheetSub (it ends up inside the dialog accessible name — review 15.5 F1)', () => {
  it('is date · marks · type', () => {
    expect(flightSheetSub({ date: '02/01/2020', registration: 'I-ABCD', typeLabel: 'Turismo' })).toBe('02/01/2020 · I-ABCD · Turismo');
  });

  it('leaves no orphan separator when a segment arrives empty (the defect 15.5 F1 shipped)', () => {
    const sub = flightSheetSub({ date: '02/01/2020', registration: '', typeLabel: 'Turismo' });
    expect(sub).toBe('02/01/2020 · Turismo');
    expect(sub).not.toMatch(/·\s*·/);
  });

  it('never produces a segment that is only the "—" placeholder (a placeholder belongs to what is DISPLAYED)', () => {
    // The caller passes real values; this guards the composition itself, which
    // must not invent a filler for an absent segment.
    expect(flightSheetSub({ date: '', registration: '', typeLabel: '' })).toBe('');
  });
});
