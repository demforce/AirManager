import { describe, expect, it } from 'vitest';
import { cashCategorySheetSub, cashCategorySubLine, expiryTypeSheetSub, expiryTypeSubLine } from './mobile-settings';

/** The property the composers exist for (lesson 15.5 F1): no empty segment, no placeholder, no doubled separator — asserted on the dialog NAME, which is where both defects become audible. */
function expectWellFormedSheetName(sub: string, title: string): void {
  const name = `${sub} — ${title}`;
  expect(name).not.toMatch(/—\s*—/);
  expect(name).not.toMatch(/·\s*·/);
  expect(sub).not.toMatch(/^\s*·/);
  expect(sub).not.toMatch(/·\s*$/);
  for (const segment of sub.split(' · ')) {
    expect(segment.trim()).not.toBe('');
    expect(segment.trim()).not.toBe('—');
  }
}

describe('expiryTypeSubLine', () => {
  it('carries scope and validity, and says nothing about the two facts that are false', () => {
    expect(expiryTypeSubLine({ scopeLabel: 'Piloti', validityLabel: '24 mesi' })).toBe('Piloti · 24 mesi');
  });

  it('adds the blocking manoeuvre only when the type blocks', () => {
    expect(expiryTypeSubLine({ scopeLabel: 'Tutti', validityLabel: '12 mesi', blocksLabel: 'Blocca prenotazioni' })).toBe('Tutti · 12 mesi · Blocca prenotazioni');
  });

  it('adds the deactivated state only when the type is deactivated, and never leaves a hole where a false fact was', () => {
    expect(expiryTypeSubLine({ scopeLabel: 'Allievi', validityLabel: 'senza scadenza', blocksLabel: null, inactiveLabel: 'Disattivato' })).toBe('Allievi · senza scadenza · Disattivato');
  });

  it('a type WITHOUT a validity reads "senza scadenza", never an empty slot', () => {
    const sub = expiryTypeSubLine({ scopeLabel: 'Istruttori', validityLabel: 'senza scadenza', blocksLabel: undefined, inactiveLabel: undefined });
    expect(sub).toBe('Istruttori · senza scadenza');
    expect(sub).not.toMatch(/·\s*·/);
  });
});

describe('expiryTypeSheetSub', () => {
  it('names the catalogue and the scope, and stays well formed inside the dialog name', () => {
    const sub = expiryTypeSheetSub({ catalogLabel: 'Abilitazioni', scopeLabel: 'Piloti' });
    expect(sub).toBe('Abilitazioni · Piloti');
    expectWellFormedSheetName(sub, 'Inglese ICAO');
  });

  it('stays well formed when the blocking segment IS there', () => {
    const sub = expiryTypeSheetSub({ catalogLabel: 'Visite mediche', scopeLabel: 'Tutti', blocksLabel: 'Blocca prenotazioni' });
    expect(sub).toBe('Visite mediche · Tutti · Blocca prenotazioni');
    expectWellFormedSheetName(sub, 'Visita medica classe 2');
  });

  it('stays well formed when a segment arrives blank instead of absent', () => {
    const sub = expiryTypeSheetSub({ catalogLabel: 'Abilitazioni', scopeLabel: '   ', blocksLabel: null });
    expect(sub).toBe('Abilitazioni');
    expectWellFormedSheetName(sub, 'Quota associativa');
  });
});

describe('cashCategorySubLine', () => {
  it('leads with the movement count, and mentions "di sistema" only for a system category', () => {
    expect(cashCategorySubLine({ movementsLabel: '3 movimenti' })).toBe('3 movimenti');
    expect(cashCategorySubLine({ movementsLabel: '0 movimenti', systemLabel: 'Di sistema' })).toBe('0 movimenti · Di sistema');
  });

  it('adds the deactivated state last, and omits the system segment in between when it is absent', () => {
    expect(cashCategorySubLine({ movementsLabel: '7 movimenti', systemLabel: null, inactiveLabel: 'Disattivata' })).toBe('7 movimenti · Disattivata');
  });
});

describe('cashCategorySheetSub', () => {
  it('names the catalogue, plus the system marker when there is one, and stays well formed', () => {
    const plain = cashCategorySheetSub({ catalogLabel: 'Categorie di cassa' });
    expect(plain).toBe('Categorie di cassa');
    expectWellFormedSheetName(plain, 'Carburante');

    const system = cashCategorySheetSub({ catalogLabel: 'Categorie di cassa', systemLabel: 'Di sistema' });
    expect(system).toBe('Categorie di cassa · Di sistema');
    expectWellFormedSheetName(system, 'Ricariche');
  });
});
