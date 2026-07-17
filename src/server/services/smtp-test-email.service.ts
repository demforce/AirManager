import { getMailSender } from '@/server/adapters/mail';
import { authorize, type Actor } from '@/server/auth/rbac';
import { getAirfieldContactEmail } from './app-settings.service';
import { ValidationError } from './errors';

/**
 * "Invia email di prova" (story 12.11, AC 1/2) — sends a real email via the
 * CURRENT mailer (`getMailSender()`, settings-first per `smtp-mail-sender.ts`)
 * to the airfield contact email. A SEPARATE file from `app-settings.service.ts`
 * (which this imports FROM) specifically to avoid a circular import:
 * `app-settings.service.ts` -> `@/server/adapters/mail` ->
 * `smtp-mail-sender.ts` -> `app-settings.service.ts` would otherwise close a
 * cycle the moment this action lived in that same module.
 *
 * `sent: false` (never a thrown error) on a mail-transport failure — the
 * admin gets clear feedback either way, same "never let SMTP failures
 * surface as a 500" rule as every other best-effort email in this codebase
 * (`sendNegativeBalanceAlert`, `runExpiryAlertsJob`'s holder emails).
 */
export async function sendSmtpTestEmail(actor: Actor): Promise<{ sent: boolean }> {
  authorize(actor, 'settings.manage');

  const contactEmail = await getAirfieldContactEmail();
  if (!contactEmail) {
    throw new ValidationError(
      'No contact email is configured — set one on the Club card before sending a test email.',
      undefined,
      'NO_CONTACT_EMAIL',
    );
  }

  try {
    await getMailSender().send({
      to: contactEmail,
      subject: 'AirManager — Email di prova / Test email',
      text: 'Questa è una email di prova dalle impostazioni SMTP di AirManager.\n\nThis is a test email from AirManager SMTP settings.',
    });
    return { sent: true };
  } catch (error) {
    console.error('sendSmtpTestEmail: failed to send test email', error);
    return { sent: false };
  }
}
