import { describe, expect, it } from 'vitest';
import { buildInviteEmail, buildPasswordResetEmail } from './templates';

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
});
