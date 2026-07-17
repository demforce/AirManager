import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TDD (story 12.11, AC 1) — the mailer's settings-first behavior: reads
 * `getSmtpSettingsForMailer` (the SIBLING `app-settings.service.ts`, mocked
 * rather than Prisma — same convention as `stats.service.test.ts`) on every
 * send, falling back to the existing env vars for whatever is not
 * configured, and mapping `security` to `secure`/`requireTLS`.
 */

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock('nodemailer', () => ({ default: { createTransport: createTransportMock } }));

vi.mock('@/lib/env', () => ({
  env: { SMTP_HOST: 'localhost', SMTP_PORT: 1025, MAIL_FROM: 'AirManager <no-reply@airmanager.local>' },
}));

const getSmtpSettingsForMailerMock = vi.fn();
vi.mock('@/server/services/app-settings.service', () => ({ getSmtpSettingsForMailer: getSmtpSettingsForMailerMock }));

const { SmtpMailSender } = await import('./smtp-mail-sender');

const EMPTY_SETTINGS = { host: null, port: null, security: null, user: null, pass: null, from: null };

beforeEach(() => {
  sendMailMock.mockReset();
  createTransportMock.mockClear();
  getSmtpSettingsForMailerMock.mockReset();
  getSmtpSettingsForMailerMock.mockResolvedValue(EMPTY_SETTINGS);
});

describe('SmtpMailSender (story 12.11, AC 1)', () => {
  it('falls back to the env vars when no smtp.* settings are configured (Mailpit dev/test, unchanged behavior)', async () => {
    await new SmtpMailSender().send({ to: 'x@example.com', subject: 'S', text: 'T' });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 1025, secure: false, requireTLS: false, auth: undefined }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'AirManager <no-reply@airmanager.local>', to: 'x@example.com' }),
    );
  });

  it('a configured smtp.host/port/from OVERRIDE the env fallback', async () => {
    getSmtpSettingsForMailerMock.mockResolvedValue({ ...EMPTY_SETTINGS, host: 'smtp.example.com', port: 587, from: 'Club <ops@example.com>' });

    await new SmtpMailSender().send({ to: 'x@example.com', subject: 'S', text: 'T' });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com', port: 587 }));
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ from: 'Club <ops@example.com>' }));
  });

  it('security STARTTLS maps to requireTLS: true, secure: false', async () => {
    getSmtpSettingsForMailerMock.mockResolvedValue({ ...EMPTY_SETTINGS, security: 'STARTTLS' });

    await new SmtpMailSender().send({ to: 'x@example.com', subject: 'S', text: 'T' });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true }));
  });

  it('security SSL_TLS maps to secure: true, requireTLS: false', async () => {
    getSmtpSettingsForMailerMock.mockResolvedValue({ ...EMPTY_SETTINGS, security: 'SSL_TLS' });

    await new SmtpMailSender().send({ to: 'x@example.com', subject: 'S', text: 'T' });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ secure: true, requireTLS: false }));
  });

  it('auth is set ONLY when BOTH user and pass are configured', async () => {
    getSmtpSettingsForMailerMock.mockResolvedValue({ ...EMPTY_SETTINGS, user: 'ops@example.com', pass: null });

    await new SmtpMailSender().send({ to: 'x@example.com', subject: 'S', text: 'T' });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it('auth carries user+pass when both are configured', async () => {
    getSmtpSettingsForMailerMock.mockResolvedValue({ ...EMPTY_SETTINGS, user: 'ops@example.com', pass: 'secret' });

    await new SmtpMailSender().send({ to: 'x@example.com', subject: 'S', text: 'T' });

    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ auth: { user: 'ops@example.com', pass: 'secret' } }));
  });
});
