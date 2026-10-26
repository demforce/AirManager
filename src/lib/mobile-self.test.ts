import { describe, expect, it } from 'vitest';
import { accountMovementSheetSub, accountMovementSubLine, linkedBadgeText, payoutCardSubLine } from './mobile-self';

describe('accountMovementSubLine', () => {
  it('joins date, description and actor on the admin face', () => {
    expect(accountMovementSubLine({ dateLabel: '15/01/2026', description: 'Ricarica di cassa', actorEmail: 'admin@airmanager.local' })).toBe(
      '15/01/2026 · Ricarica di cassa · admin@airmanager.local',
    );
  });

  it('omits the description when the row has none — never the desktop "—" placeholder (review 15.5 F1)', () => {
    expect(accountMovementSubLine({ dateLabel: '15/01/2026', description: null })).toBe('15/01/2026');
    expect(accountMovementSubLine({ dateLabel: '15/01/2026', description: '   ' })).toBe('15/01/2026');
  });

  it('omits the actor on the self face (the prop is simply not passed)', () => {
    expect(accountMovementSubLine({ dateLabel: '15/01/2026', description: 'Addebito volo' })).toBe('15/01/2026 · Addebito volo');
  });
});

describe('accountMovementSheetSub', () => {
  it('is the date alone when the row carries no actor (self face)', () => {
    expect(accountMovementSheetSub({ dateLabel: '02/02/2026' })).toBe('02/02/2026');
  });

  it('appends the actor on the admin face', () => {
    expect(accountMovementSheetSub({ dateLabel: '02/02/2026', actorEmail: 'admin@airmanager.local' })).toBe('02/02/2026 · admin@airmanager.local');
  });

  it('never produces a double separator, which would land in the dialog accessible name', () => {
    expect(accountMovementSheetSub({ dateLabel: '02/02/2026', actorEmail: null })).not.toMatch(/·\s*·/);
    expect(accountMovementSheetSub({ dateLabel: '02/02/2026', actorEmail: '' })).not.toMatch(/·\s*·/);
  });
});

describe('linkedBadgeText', () => {
  const labels = { ofDate: 'Rettifica del movimento del {date}', linked: 'Rettifica di un movimento precedente' };

  it('names the original date when the original is on the same statement page', () => {
    expect(linkedBadgeText(labels, '02/02/2026')).toBe('Rettifica del movimento del 02/02/2026');
  });

  it('falls back to the generic text when the original is NOT on this page', () => {
    expect(linkedBadgeText(labels, null)).toBe('Rettifica di un movimento precedente');
  });
});

describe('payoutCardSubLine', () => {
  it('joins the registration timestamp and the payment method', () => {
    expect(payoutCardSubLine({ registeredLabel: '05/08/2026 14:30', methodLabel: 'Contanti' })).toBe('05/08/2026 14:30 · Contanti');
  });
});
