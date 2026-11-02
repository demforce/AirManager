import { describe, expect, it } from 'vitest';
import { flightCardSubLine, flightRouteLabel, flightSheetSub } from './mobile-logbook';

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
