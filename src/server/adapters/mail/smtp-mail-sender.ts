import nodemailer from 'nodemailer';
import { env } from '@/lib/env';
import { getSmtpSettingsForMailer } from '@/server/services/app-settings.service';
import type { MailMessage, MailSender } from './mail-sender';

/**
 * SMTP implementation of `MailSender`, via `nodemailer`. Settings-first
 * (story 12.11, AC 1): reads the admin-configured `smtp.*` `AppSetting` keys
 * on EVERY send (`getSmtpSettingsForMailer`, no caching — sends are
 * infrequent, and a config change must take effect immediately, no
 * redeploy), falling back to the existing `SMTP_HOST`/`SMTP_PORT`/
 * `MAIL_FROM` env vars for whichever field is not configured — Mailpit in
 * dev/test keeps working unchanged (no admin has touched Impostazioni yet,
 * every `smtp.*` key reads `null`). NIENTE nuove env var (Contesto):
 * `security`/`user`/`pass` have no env counterpart at all, they simply stay
 * unset (no auth, no TLS) until an admin configures them.
 */
export class SmtpMailSender implements MailSender {
  async send(message: MailMessage): Promise<void> {
    const settings = await getSmtpSettingsForMailer();

    const host = settings.host || env.SMTP_HOST;
    const port = settings.port ?? env.SMTP_PORT;
    const from = settings.from || env.MAIL_FROM;
    // `security` mapping (AC 1): none/STARTTLS/SSL-TLS -> `secure`/`requireTLS`.
    // `secure: true` speaks TLS from the first byte (SMTPS, typically :465);
    // `requireTLS: true` upgrades via STARTTLS on a plaintext connection —
    // the two are mutually exclusive, both `false` is a plain connection.
    const secure = settings.security === 'SSL_TLS';
    const requireTLS = settings.security === 'STARTTLS';
    const auth = settings.user && settings.pass ? { user: settings.user, pass: settings.pass } : undefined;

    // CWE-918 (SSRF) defense-in-depth: an admin-configured host that is
    // unreachable/black-holed (e.g. a filtered internal address) must fail
    // fast rather than hang the request indefinitely.
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS,
      auth,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
