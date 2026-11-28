import { describe, expect, it } from 'vitest';
import { ledgerSide, transactionCardSubLine, transactionCardTitle, transactionSheetSub, transactionStatusIsAnomalous } from './mobile-billing';

/**
 * The property every sheet over-line must hold (AC 2, lesson 15.5 F1):
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

describe('transactionCardSubLine', () => {
  it('is the template\'s own `pilota · data · metodo`', () => {
    expect(transactionCardSubLine({ personName: 'Mario Rossi', date: '12/03/2026', methodLabel: 'Contanti' })).toBe('Mario Rossi · 12/03/2026 · Contanti');
  });

  it('omits the pilot on a CASH row instead of leaving a placeholder', () => {
    expect(transactionCardSubLine({ personName: null, date: '12/03/2026', methodLabel: 'Bonifico' })).toBe('12/03/2026 · Bonifico');
  });

  it('omits the method on the unattributed row (the secchiello), keeping one separator', () => {
    expect(transactionCardSubLine({ personName: 'Mario Rossi', date: '12/03/2026', methodLabel: null })).toBe('Mario Rossi · 12/03/2026');
  });

  it('degrades to the date alone when a CASH row is also unattributed', () => {
    expect(transactionCardSubLine({ personName: null, date: '12/03/2026', methodLabel: null })).toBe('12/03/2026');
  });

  it('drops a whitespace-only segment as if absent', () => {
    expect(transactionCardSubLine({ personName: '   ', date: '12/03/2026', methodLabel: 'POS' })).toBe('12/03/2026 · POS');
  });
});

describe('transactionSheetSub', () => {
  it('composes date · tipo · pilota', () => {
    expect(transactionSheetSub({ date: '12/03/2026', bookTypeLabel: 'Ricavo', personName: 'Mario Rossi' })).toBe('12/03/2026 · Ricavo · Mario Rossi');
  });

  it('stays well formed as a dialog name on a row with no pilot', () => {
    const sub = transactionSheetSub({ date: '12/03/2026', bookTypeLabel: 'Costo', personName: null });
    expect(sub).toBe('12/03/2026 · Costo');
    expectWellFormedAccessibleName(sub, transactionCardTitle({ kindLabel: 'Carburante', description: null }));
  });

  it('stays well formed on a row with neither pilot nor description (the unattributed CASH row)', () => {
    const sub = transactionSheetSub({ date: '12/03/2026', bookTypeLabel: 'Ricavo', personName: null });
    expectWellFormedAccessibleName(sub, transactionCardTitle({ kindLabel: 'Altro', description: '' }));
  });

  it('stays well formed with every segment present', () => {
    expectWellFormedAccessibleName(
      transactionSheetSub({ date: '12/03/2026', bookTypeLabel: 'Acconto', personName: 'Mario Rossi' }),
      transactionCardTitle({ kindLabel: 'Ricarica', description: 'Bonifico di marzo' }),
    );
  });
});

describe('transactionCardTitle', () => {
  it('joins the granular kind and the free-text description the desktop cell shows', () => {
    expect(transactionCardTitle({ kindLabel: 'Ricarica', description: 'Bonifico di marzo' })).toBe('Ricarica — Bonifico di marzo');
  });

  it('is the kind alone when the description is absent — never a dangling dash', () => {
    expect(transactionCardTitle({ kindLabel: 'Ricarica', description: null })).toBe('Ricarica');
    expect(transactionCardTitle({ kindLabel: 'Ricarica', description: '  ' })).toBe('Ricarica');
  });
});

describe('ledgerSide', () => {
  it('reads the club-perspective amount as Entrate when positive and Uscite when negative', () => {
    expect(ledgerSide(1200)).toBe('in');
    expect(ledgerSide(-1200)).toBe('out');
  });

  it('is neither on a zero row — the desktop shows "—" in both columns there', () => {
    expect(ledgerSide(0)).toBe('none');
  });
});

describe('transactionStatusIsAnomalous', () => {
  it('is false on an ordinary registered row (no chip on the card, idiom 15.6)', () => {
    expect(transactionStatusIsAnomalous({ reversed: false, reversal: false })).toBe(false);
  });

  it('is true on a reversed row and on a reversal row', () => {
    expect(transactionStatusIsAnomalous({ reversed: true, reversal: false })).toBe(true);
    expect(transactionStatusIsAnomalous({ reversed: false, reversal: true })).toBe(true);
  });
});
