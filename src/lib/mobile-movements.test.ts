import { describe, expect, it } from 'vitest';
import { requesterLabel, transitCardSubLine, transitRouteLabel, transitSheetSub } from './mobile-movements';

/**
 * The property every sheet over-line must hold (AC 3, lesson 15.5 F1):
 * `BottomSheet` composes the dialog's accessible name as `${sub} — ${title}`,
 * so a sub with an empty segment, a dangling separator or the "—" placeholder
 * inside it produces a name a screen reader reads as gibberish. Asserted as a
 * PROPERTY of the composed string — never `split(' · ').length`, which is
 * blind by construction on a composite value.
 */
function expectWellFormedAccessibleName(sub: string, title: string): void {
  const name = `${sub} — ${title}`;
  expect(name).not.toMatch(/—\s*—/);
  expect(name).not.toMatch(/·\s*·/);
  expect(name.trim()).toBe(name);
  expect(name).not.toMatch(/(^|·)\s*—\s*(·|$)/);
  for (const segment of sub.split(' · ')) {
    expect(segment.trim()).not.toBe('');
    expect(segment.trim()).not.toBe('—');
  }
}

describe('transitRouteLabel', () => {
  it('is the desktop "Rotta" cell\'s own origin → destination', () => {
    expect(transitRouteLabel('LIRN Napoli', 'LIRU Urbe')).toBe('LIRN Napoli → LIRU Urbe');
  });

  it('is null when either end is missing — never a half route', () => {
    expect(transitRouteLabel('', 'LIRU')).toBeNull();
    expect(transitRouteLabel('LIRN', '   ')).toBeNull();
  });
});

describe('requesterLabel', () => {
  it('is the desktop cell\'s own Nome Cognome order', () => {
    expect(requesterLabel({ firstName: 'Mario', lastName: 'Rossi' })).toBe('Mario Rossi');
  });
});

describe('transitCardSubLine', () => {
  it('is the template\'s rotta · pilota · ETA', () => {
    expect(transitCardSubLine({ route: 'LIRN → LIRU', requester: 'Mario Rossi', etaLabel: 'ETA 14:30' })).toBe('LIRN → LIRU · Mario Rossi · ETA 14:30');
  });

  it('drops the route rather than leaving two separators adjacent', () => {
    expect(transitCardSubLine({ route: null, requester: 'Mario Rossi', etaLabel: 'ETA 14:30' })).toBe('Mario Rossi · ETA 14:30');
  });
});

describe('transitSheetSub', () => {
  it('is the template\'s own `id · tipo` on an approved request', () => {
    const sub = transitSheetSub({ pprNumber: 'PPR-2026-0001', aircraftType: 'Cessna 172' });
    expect(sub).toBe('PPR-2026-0001 · Cessna 172');
    expectWellFormedAccessibleName(sub, 'I-ABCD');
  });

  it('OMITS the pprNumber on a PENDING/REJECTED request — never the "—" placeholder (review 15.5 F1)', () => {
    const sub = transitSheetSub({ pprNumber: null, aircraftType: 'Cessna 172' });
    expect(sub).toBe('Cessna 172');
    expect(sub).not.toContain('—');
    expectWellFormedAccessibleName(sub, 'I-ABCD');
  });

  it('stays well formed even if the aircraft type is blank (both segments absent is still not a dangling separator)', () => {
    expect(transitSheetSub({ pprNumber: 'PPR-2026-0001', aircraftType: '   ' })).toBe('PPR-2026-0001');
    expect(transitSheetSub({ pprNumber: null, aircraftType: '' })).toBe('');
  });
});
