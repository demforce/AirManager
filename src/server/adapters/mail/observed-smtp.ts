import SMTPConnection from 'nodemailer/lib/smtp-connection';
import MailComposer from 'nodemailer/lib/mail-composer';
import { env } from '@/lib/env';
import { getSmtpSettingsForMailer } from '@/server/services/app-settings.service';
import { classifySmtpError, type SmtpObservation, type SmtpPhase } from './smtp-observation';
import type { MailMessage } from './mail-sender';
export const SMTP_ATTEMPT_MS = 90_000;
export class InvalidMailConfiguration extends Error {}

export async function readObservedSmtpConfig() {
  const s = await getSmtpSettingsForMailer();
  const from = s.from || env.MAIL_FROM;
  if (!new MailComposer({from}).compile().getEnvelope().from) throw new InvalidMailConfiguration();
  return {
    host: s.host || env.SMTP_HOST,
    port: s.port ?? env.SMTP_PORT,
    from: s.from || env.MAIL_FROM,
    secure: s.security === 'SSL_TLS',
    requireTLS: s.security === 'STARTTLS',
    auth: s.user && s.pass ? {
      user: s.user,
      pass: s.pass
    } : null
  };
}
export type ObservedSmtpConfig = Awaited<ReturnType<typeof readObservedSmtpConfig>>;

/** SMTPConnection exposes the positive final DATA reply and lets the hard deadline close this exact connection. */
export function submitObservedMail(config: ObservedSmtpConfig, message: MailMessage): Promise<SmtpObservation> {
  return new Promise(resolve => {
    const connection = new SMTPConnection({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
      tls: {
        rejectUnauthorized: true
      },
      connectionTimeout: 10_000,
      dnsTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 45_000
    });
    let stage: SmtpPhase = 'CONNECT';
    let finished = false;
    function finish(result: SmtpObservation) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      connection.close();
      resolve(result);
    }
    function failed(error?: unknown) {
      finish(classifySmtpError(error, stage));
    }
    const timer = setTimeout(failed, SMTP_ATTEMPT_MS);
    connection.on('error', failed);
    connection.on('end', () => failed());
    function submit() {
      if (finished) return;
      try {
        const mime = new MailComposer({
          ...message,
          from: config.from
        }).compile();
        const envelope = mime.getEnvelope();
        if (!envelope.from || envelope.to.length !== 1 || envelope.to[0] !== message.to) {
          return finish({
            outcome: 'CONFIGURATION',
            phase: 'CONFIG',
            channel: true
          });
        }
        stage = 'MESSAGE';
        connection.send(envelope, mime.createReadStream(), (err, info) => {
          if (err) return failed(err);
          const code = /^2\d\d\b/.exec(info.response)?.[0];
          if (code && info.accepted.length === 1 && info.accepted[0] === message.to) {
            return finish({
              outcome: 'ACCEPTED',
              phase: 'FINAL',
              code: Number(code),
              channel: false
            });
          }
          finish({
            outcome: 'UNCERTAIN',
            phase: 'FINAL',
            channel: false
          });
        });
      } catch {
        failed();
      }
    }
    connection.connect(err => {
      if (finished) return;
      if (err) return failed(err);
      if (!config.auth) return submit();
      stage = 'AUTH';
      connection.login({
        credentials: config.auth
      }, err => err ? failed(err) : submit());
    });
  });
}
