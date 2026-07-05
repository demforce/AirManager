import nodemailer from 'nodemailer';
import { env } from '@/lib/env';
import type { MailMessage, MailSender } from './mail-sender';

/**
 * SMTP implementation of `MailSender`, via `nodemailer`. Points at Mailpit in
 * dev/test (`SMTP_HOST`/`SMTP_PORT`, default localhost:1025 — no auth, no
 * TLS); a production deployment only needs new env values (or a different
 * `MailSender` implementation swapped in by `getMailSender()`), never a
 * change to any caller.
 */
export class SmtpMailSender implements MailSender {
  private readonly transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
