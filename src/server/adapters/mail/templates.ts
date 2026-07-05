import { createTranslator } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';

/**
 * Loads a locale's message catalogue directly (not via `next-intl/server`'s
 * `getTranslations`, which is bound to the *current request's* locale). An
 * invite/reset email must be written in the *recipient's* stored `locale`
 * (AD-7: "le email ... usano la lingua scelta dal destinatario"), which is
 * almost always different from whichever locale the admin who triggered the
 * action happens to be browsing in.
 */
type Messages = typeof import('../../../../messages/it.json');

async function loadMessages(locale: AppLocale): Promise<Messages> {
  return (await import(`../../../../messages/${locale}.json`)).default as Messages;
}

export type InviteEmailContent = { subject: string; text: string };
export type PasswordResetEmailContent = { subject: string; text: string };

/**
 * Builds the invite email (AC 1). Subject/body come from the `Emails.invite`
 * catalogue entry (`messages/{it,en}.json`) — no hardcoded strings, per the
 * story's Task 1.
 */
export async function buildInviteEmail(
  locale: AppLocale,
  params: { setPasswordUrl: string; expiresInDays: number },
): Promise<InviteEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.invite' });

  return {
    subject: t('subject'),
    text: t('body', { url: params.setPasswordUrl, expiresInDays: params.expiresInDays }),
  };
}

/**
 * Builds the password-reset email (AC 3). Subject/body come from the
 * `Emails.passwordReset` catalogue entry.
 */
export async function buildPasswordResetEmail(
  locale: AppLocale,
  params: { setPasswordUrl: string; expiresInHours: number },
): Promise<PasswordResetEmailContent> {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: 'Emails.passwordReset' });

  return {
    subject: t('subject'),
    text: t('body', { url: params.setPasswordUrl, expiresInHours: params.expiresInHours }),
  };
}
