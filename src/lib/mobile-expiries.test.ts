import { describe, expect, it } from 'vitest';
import { expiryCardSubLine, expiryDaysLabel, expirySheetSub, myExpiryCardSubLine } from './mobile-expiries';

const SUFFIXES = { ago: 'g fa', left: ' g' };

describe('expiryDaysLabel', () => {
  it('counts down with the desktop cell\'s own suffix', () => {
    expect(expiryDaysLabel(12, SUFFIXES)).toBe('12 g');
    expect(expiryDaysLabel(0, SUFFIXES)).toBe('0 g');
  });

  it('counts UP, with the "ago" suffix, once the date is past — the sign never leaks into the label', () => {
    expect(expiryDaysLabel(-3, SUFFIXES)).toBe('3g fa');
    expect(expiryDaysLabel(-1, SUFFIXES)).toBe('1g fa');
  });
});

describe('expiryCardSubLine', () => {
  it('is the template\'s tipo · data, plus the day count ratifica R-15.7-b moved into the sub', () => {
    expect(expiryCardSubLine({ typeName: 'Visita medica classe 2', dateLabel: '12/09/2026', daysLabel: '38 g' })).toBe('Visita medica classe 2 · 12/09/2026 · 38 g');
  });

  it('drops a blank segment instead of leaving two separators adjacent', () => {
    expect(expiryCardSubLine({ typeName: 'Licenza PPL', dateLabel: '', daysLabel: '38 g' })).toBe('Licenza PPL · 38 g');
  });
});

describe('expirySheetSub', () => {
  it('carries the two classifications, and stays well formed inside the dialog name', () => {
    const sub = expirySheetSub({ category: 'Medico', typeName: 'Visita medica classe 2' });
    expect(sub).toBe('Medico · Visita medica classe 2');
    const name = `${sub} — Rossi Mario`;
    expect(name).not.toMatch(/—\s*—/);
    expect(name).not.toMatch(/·\s*·/);
    for (const segment of sub.split(' · ')) {
      expect(segment.trim()).not.toBe('');
      expect(segment.trim()).not.toBe('—');
    }
  });
});

describe('myExpiryCardSubLine', () => {
  it('shows the note next to the date when there is one', () => {
    expect(myExpiryCardSubLine({ dateLabel: '12/09/2026', notes: 'Rinnovo prenotato' })).toBe('12/09/2026 · Rinnovo prenotato');
  });

  it('OMITS an absent note — never the desktop table\'s "—" placeholder', () => {
    const sub = myExpiryCardSubLine({ dateLabel: '12/09/2026', notes: null });
    expect(sub).toBe('12/09/2026');
    expect(sub).not.toContain('—');
  });
});
