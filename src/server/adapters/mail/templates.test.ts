import { describe, expect, it } from 'vitest';
import {
  buildAircraftGroundedEmail,
  buildExpiryAlertEmail,
  buildExpiryDigestEmail,
  buildInviteEmail,
  buildNegativeBalanceAlertEmail,
  buildPasswordResetEmail,
} from './templates';

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

  describe('buildExpiryAlertEmail (story 6.3, AC 1 — the days-phrase talks about REAL days, never a threshold)', () => {
    it('Italian, expires today (daysLeft 0) -> "scade oggi"', async () => {
      const email = await buildExpiryAlertEmail('it', {
        personName: 'Mario Rossi',
        typeName: 'Visita medica classe 2',
        expiresAt: new Date(Date.UTC(2026, 6, 8)),
        daysLeft: 0,
      });

      expect(email.subject).toContain('Visita medica classe 2');
      expect(email.text).toContain('Mario Rossi');
      expect(email.text).toContain('scade oggi');
      expect(email.text).not.toMatch(/\b60\b|\b30\b|\b7\b/);
    });

    it('Italian, still ahead (daysLeft 7) -> "scade tra 7 giorni", the real count — never the threshold word', async () => {
      const email = await buildExpiryAlertEmail('it', {
        personName: 'Mario Rossi',
        typeName: 'Visita medica classe 2',
        expiresAt: new Date(Date.UTC(2026, 6, 15)),
        daysLeft: 7,
      });

      expect(email.text).toContain('scade tra 7 giorni');
    });

    it('Italian, already expired (daysLeft -3, a catch-up run) -> "è scaduta da 3 giorni", not the threshold', async () => {
      const email = await buildExpiryAlertEmail('it', {
        personName: 'Mario Rossi',
        typeName: 'Visita medica classe 2',
        expiresAt: new Date(Date.UTC(2026, 6, 5)),
        daysLeft: -3,
      });

      expect(email.text).toContain('è scaduta da 3 giorni');
    });

    it('Italian, singular day count (daysLeft 1) uses the singular ICU plural form', async () => {
      const email = await buildExpiryAlertEmail('it', {
        personName: 'Mario Rossi',
        typeName: 'Visita medica classe 2',
        expiresAt: new Date(Date.UTC(2026, 6, 9)),
        daysLeft: 1,
      });

      expect(email.text).toContain('scade tra 1 giorno');
    });

    it('English, symmetric structure and day phrase', async () => {
      const email = await buildExpiryAlertEmail('en', {
        personName: 'John Smith',
        typeName: 'Class 2 medical',
        expiresAt: new Date(Date.UTC(2026, 6, 15)),
        daysLeft: 7,
      });

      expect(email.subject).toContain('Class 2 medical');
      expect(email.text).toContain('John Smith');
      expect(email.text).toContain('expires in 7 days');
    });

    it('formats the date locale-aware and date-only (no time-of-day)', async () => {
      const email = await buildExpiryAlertEmail('it', {
        personName: 'Mario Rossi',
        typeName: 'Visita medica classe 2',
        expiresAt: new Date(Date.UTC(2026, 6, 15)),
        daysLeft: 7,
      });

      expect(email.text).toContain('15 luglio 2026');
    });
  });

  describe('buildExpiryDigestEmail (story 6.3, AC 1; tri-state hardened story TD-1, AC 2 — one line per alert, NO_EMAIL/SEND_FAILED flagged distinctly)', () => {
    it('renders one line per item, in Italian, with the no-email flag only on the flagged item', async () => {
      const email = await buildExpiryDigestEmail('it', {
        items: [
          {
            personName: 'Mario Rossi',
            typeName: 'Visita medica classe 2',
            expiresAt: new Date(Date.UTC(2026, 6, 8)),
            daysLeft: 0,
            holderStatus: 'EMAILED',
          },
          {
            personName: 'Chiara Bianchi',
            typeName: 'Licenza PPL',
            expiresAt: new Date(Date.UTC(2026, 6, 5)),
            daysLeft: -3,
            holderStatus: 'NO_EMAIL',
          },
        ],
      });

      expect(email.subject).toBe('Riepilogo alert scadenze');
      expect(email.text).toContain('Mario Rossi');
      expect(email.text).toContain('scade oggi');
      expect(email.text).toContain('Chiara Bianchi');
      expect(email.text).toContain('è scaduta da 3 giorni');
      expect(email.text).toContain('senza email');
      // Only ONE flag, on Chiara's line — Mario's line must not carry it.
      expect(email.text.split('\n').find((line) => line.includes('Mario Rossi'))).not.toContain('senza email');
    });

    it('flags a SEND_FAILED item distinctly from a NO_EMAIL item (TD-1, AC 2)', async () => {
      const email = await buildExpiryDigestEmail('it', {
        items: [
          {
            personName: 'Chiara Bianchi',
            typeName: 'Licenza PPL',
            expiresAt: new Date(Date.UTC(2026, 6, 5)),
            daysLeft: -3,
            holderStatus: 'NO_EMAIL',
          },
          {
            personName: 'Luca Neri',
            typeName: 'Visita medica classe 2',
            expiresAt: new Date(Date.UTC(2026, 6, 8)),
            daysLeft: 0,
            holderStatus: 'SEND_FAILED',
          },
        ],
      });

      const lucaLine = email.text.split('\n').find((line) => line.includes('Luca Neri'));
      const chiaraLine = email.text.split('\n').find((line) => line.includes('Chiara Bianchi'));
      expect(lucaLine).toContain('invio email fallito');
      expect(lucaLine).not.toContain('senza email');
      expect(chiaraLine).toContain('senza email');
      expect(chiaraLine).not.toContain('invio email fallito');
    });

    it('renders the English digest with symmetric structure', async () => {
      const email = await buildExpiryDigestEmail('en', {
        items: [
          {
            personName: 'John Smith',
            typeName: 'Class 2 medical',
            expiresAt: new Date(Date.UTC(2026, 6, 15)),
            daysLeft: 7,
            holderStatus: 'EMAILED',
          },
        ],
      });

      expect(email.subject).toBe('Expiry alert summary');
      expect(email.text).toContain('John Smith');
      expect(email.text).toContain('expires in 7 days');
      expect(email.text).not.toContain('no email on file');
    });

    it('renders the English SEND_FAILED flag symmetric to the Italian one', async () => {
      const email = await buildExpiryDigestEmail('en', {
        items: [
          {
            personName: 'John Smith',
            typeName: 'Class 2 medical',
            expiresAt: new Date(Date.UTC(2026, 6, 15)),
            daysLeft: 7,
            holderStatus: 'SEND_FAILED',
          },
        ],
      });

      expect(email.text).toContain('email delivery failed');
      expect(email.text).not.toContain('no email on file');
    });
  });
});

describe('buildAircraftGroundedEmail (story AOG-1b, ratifica R-AOG-i)', () => {
  const BOOKING_START = new Date('2031-05-02T09:00:00.000Z');

  it('names the aircraft, the reason, the INCLUSIVE window and the holder booking, in Italian', async () => {
    const email = await buildAircraftGroundedEmail('it', {
      firstName: 'Anna',
      aircraftRegistration: 'I-ABCD',
      startsAt: BOOKING_START,
      reason: 'Revisione 100h',
      outOfServiceUntil: '2031-05-12',
    });

    expect(email.subject).toBe('Velivolo fuori servizio: I-ABCD');
    expect(email.text).toContain('Ciao Anna');
    expect(email.text).toContain('I-ABCD');
    expect(email.text).toContain('Revisione 100h');
    // R-AOG-a: the day itself is part of the fermo, and the mail says so.
    expect(email.text).toContain('fino al 12/05/2031 compreso');
    // The booking the recipient actually holds, in Europe/Rome wall clock.
    expect(email.text).toContain('02/05/2031');
    // Decisione PO 2026-07-31 (option 2 of 3): the AOG counts and warns, it
    // never cancels — and the pilot must not be left guessing.
    expect(email.text).toContain('NON è stata annullata');
  });

  it('NAMES the undelimited case instead of leaving an empty spot (invariant [b])', async () => {
    const email = await buildAircraftGroundedEmail('it', {
      firstName: 'Bruno',
      aircraftRegistration: 'I-ABCD',
      startsAt: BOOKING_START,
      reason: 'Attesa pezzo',
      outOfServiceUntil: null,
    });

    expect(email.text).toContain('rientro da definire');
    expect(email.text).not.toContain('fino al');
    // Never an empty value, never a bare dash where a value is announced.
    expect(email.text).not.toMatch(/Fermo:\s*$/m);
    expect(email.text).not.toContain('Fermo: —');
  });

  it('renders the English counterpart with the same structure', async () => {
    const dated = await buildAircraftGroundedEmail('en', {
      firstName: 'John',
      aircraftRegistration: 'I-ABCD',
      startsAt: BOOKING_START,
      reason: '100h inspection',
      outOfServiceUntil: '2031-05-12',
    });
    const undated = await buildAircraftGroundedEmail('en', {
      firstName: 'John',
      aircraftRegistration: 'I-ABCD',
      startsAt: BOOKING_START,
      reason: 'Waiting for a part',
      outOfServiceUntil: null,
    });

    expect(dated.subject).toBe('Aircraft out of service: I-ABCD');
    expect(dated.text).toContain('until 12/05/2031 inclusive');
    expect(dated.text).toContain('has NOT been cancelled');
    expect(undated.text).toContain('return date not yet known');
  });
});
