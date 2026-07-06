import { describe, expect, it } from 'vitest';
import { buildInviteEmail, buildNegativeBalanceAlertEmail, buildPasswordResetEmail } from './templates';

describe('mail templates (story 1.4 Task 1 — no hardcoded strings, IT/EN)', () => {
  describe('buildInviteEmail', () => {
    it('renders the Italian invite email with the link and plural day count', async () => {
      const email = await buildInviteEmail('it', {
        setPasswordUrl: 'http://localhost:3000/it/set-password?token=abc123',
        expiresInDays: 7,
      });

      expect(email.subject).toBe('Sei stato invitato ad AirManager');
      expect(email.text).toContain('http://localhost:3000/it/set-password?token=abc123');
      expect(email.text).toContain('7 giorni');
    });

    it('renders the English invite email', async () => {
      const email = await buildInviteEmail('en', {
        setPasswordUrl: 'http://localhost:3000/en/set-password?token=abc123',
        expiresInDays: 7,
      });

      expect(email.subject).toBe("You've been invited to AirManager");
      expect(email.text).toContain('http://localhost:3000/en/set-password?token=abc123');
      expect(email.text).toContain('7 days');
    });
  });

  describe('buildPasswordResetEmail', () => {
    it('renders the Italian reset email with the link and plural hour count', async () => {
      const email = await buildPasswordResetEmail('it', {
        setPasswordUrl: 'http://localhost:3000/it/set-password?token=xyz789',
        expiresInHours: 2,
      });

      expect(email.subject).toBe('Reimposta la tua password AirManager');
      expect(email.text).toContain('http://localhost:3000/it/set-password?token=xyz789');
      expect(email.text).toContain('2 ore');
    });

    it('renders the English reset email', async () => {
      const email = await buildPasswordResetEmail('en', {
        setPasswordUrl: 'http://localhost:3000/en/set-password?token=xyz789',
        expiresInHours: 2,
      });

      expect(email.subject).toBe('Reset your AirManager password');
      expect(email.text).toContain('http://localhost:3000/en/set-password?token=xyz789');
      expect(email.text).toContain('2 hours');
    });
  });

  describe('buildNegativeBalanceAlertEmail (story 3.3, AC 2)', () => {
    it('renders the Italian alert with the recipient name and locale-formatted balance (M1)', async () => {
      const email = await buildNegativeBalanceAlertEmail('it', { personName: 'Mario Rossi', balanceCents: -25000 });

      expect(email.subject).toBe('Il tuo conto AirManager è in negativo');
      expect(email.text).toContain('Mario Rossi');
      // `Intl.NumberFormat` puts a non-breaking space before the € symbol — match with \s.
      expect(email.text).toMatch(/-250,00\s€/);
    });

    it('renders the English alert with English money formatting', async () => {
      const email = await buildNegativeBalanceAlertEmail('en', { personName: 'John Smith', balanceCents: -25000 });

      expect(email.subject).toBe('Your AirManager account is in the negative');
      expect(email.text).toContain('John Smith');
      expect(email.text).toContain('-€250.00');
    });
  });
});
