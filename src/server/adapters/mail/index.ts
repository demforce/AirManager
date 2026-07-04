import type { MailSender } from './mail-sender';
import { SmtpMailSender } from './smtp-mail-sender';

export type { MailMessage, MailSender } from './mail-sender';

let instance: MailSender | undefined;

/**
 * Factory (story 1.4 Dev Notes: "factory che le stories future riuseranno").
 * Every service that needs to send mail calls this instead of constructing a
 * transport itself — swapping the dev SMTP sender for a production
 * `MailSender` implementation later is a one-line change here, not a
 * search-and-replace across services.
 */
export function getMailSender(): MailSender {
  instance ??= new SmtpMailSender();
  return instance;
}
