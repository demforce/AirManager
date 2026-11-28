import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

type AuthPath = '/login' | '/forgot-password' | '/set-password';

/** A public counterpart to the shell's locale switch, preserving invite links. */
export async function AuthLanguageSwitch({ locale, pathname, token, callbackUrl, adminPassword }: { locale: AppLocale; pathname: AuthPath; token?: string; callbackUrl?: string; adminPassword?: boolean }) {
  const t = await getTranslations('auth');
  const otherLocale: AppLocale = locale === 'it' ? 'en' : 'it';
  const localizedCallback = callbackUrl?.replace(/^\/(it|en)(?=\/|$)/, `/${otherLocale}`);
  return (
    <Link
      href={{ pathname, query: {
        ...(token && { token }), ...(localizedCallback && { callbackUrl: localizedCallback }),
        ...(adminPassword && { access: 'admin' }),
      } }}
      locale={otherLocale}
      className="auth-locale-switch"
      data-testid="auth-locale-switch"
      hrefLang={otherLocale}
    >
      {t('otherLanguage')}
    </Link>
  );
}
