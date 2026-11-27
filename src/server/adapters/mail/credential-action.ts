import type { AppLocale } from '@/i18n/routing';
import { env } from '@/lib/env';

export type CredentialPurpose = 'INVITE' | 'PASSWORD_RESET' | 'VERIFY_EMAIL' | 'LOGIN_LINK';
const validated = Symbol('mail action');
export type Action = { url: string; label: string; [validated]: true };
export function credentialAction(locale: AppLocale, purpose: CredentialPurpose, url: string, label: string): Action {
  // URL.parse returns null on malformed input. A thrown parser error may contain the whole credential.
  const link = URL.parse(url);
  const invalid = () => new Error('Invalid email action URL.');
  if (!link || link.origin !== new URL(env.APP_URL).origin || link.username || link.password
      || link.href !== url || link.searchParams.size !== 1) throw invalid();

  const trial = purpose === 'VERIFY_EMAIL' || purpose === 'LOGIN_LINK';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(link.hostname);
  // Legacy set-password links already support the configured HTTP(S) application origin.
  if (link.protocol !== 'https:' && !(link.protocol === 'http:' && (!trial || local))) throw invalid();
  if (trial) {
    const expectedPurpose = purpose === 'VERIFY_EMAIL' ? 'verify' : 'login';
    if (link.pathname !== `/${locale}/email-access` || link.searchParams.get('purpose') !== expectedPurpose || !link.hash.slice(1)) throw invalid();
  } else if (!['/set-password', `/${locale}/set-password`].includes(link.pathname) || !link.searchParams.get('token') || link.hash) {
    throw invalid();
  }
  return { url, label, [validated]: true };
}
