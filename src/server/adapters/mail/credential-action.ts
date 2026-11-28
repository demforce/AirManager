import type { AppLocale } from '@/i18n/routing';
import { env } from '@/lib/env';

export type CredentialPurpose = 'INVITE' | 'PASSWORD_RESET' | 'VERIFY_EMAIL' | 'LOGIN_LINK' | 'REACTIVATE_ACCOUNT' | 'CHANGE_EMAIL_CURRENT' | 'CHANGE_EMAIL_NEW' | 'CHANGE_ADMIN_PASSWORD';
const validated = Symbol('mail action');
export type Action = { url: string; label: string; [validated]: true };
export const trialActionModes = { VERIFY_EMAIL: 'verify', LOGIN_LINK: 'login', REACTIVATE_ACCOUNT: 'reactivate', CHANGE_EMAIL_CURRENT: 'change-current', CHANGE_EMAIL_NEW: 'change-new', CHANGE_ADMIN_PASSWORD: 'change-password' } as const;
export function credentialAction(locale: AppLocale, purpose: CredentialPurpose, url: string, label: string): Action {
  // URL.parse returns null on malformed input. A thrown parser error may contain the whole credential.
  const link = URL.parse(url);
  const invalid = () => new Error('Invalid email action URL.');
  if (!link || link.origin !== new URL(env.APP_URL).origin || link.username || link.password
      || link.href !== url || link.searchParams.size !== 1) throw invalid();

  const trial = purpose !== 'INVITE' && purpose !== 'PASSWORD_RESET';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(link.hostname);
  // Legacy set-password links already support the configured HTTP(S) application origin.
  if (link.protocol !== 'https:' && !(link.protocol === 'http:' && (!trial || local))) throw invalid();
  if (trial) {
    const expectedPurpose = trialActionModes[purpose];
    if (link.pathname !== `/${locale}/email-access` || link.searchParams.get('purpose') !== expectedPurpose || !link.hash.slice(1)) throw invalid();
  } else if (!['/set-password', `/${locale}/set-password`].includes(link.pathname) || !link.searchParams.get('token') || link.hash) {
    throw invalid();
  }
  return { url, label, [validated]: true };
}
