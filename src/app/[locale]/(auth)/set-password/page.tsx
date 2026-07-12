import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { SetPasswordForm } from './set-password-form';
import { Card } from '@/components/ui/card';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

/**
 * Public page (`src/proxy.ts` `PUBLIC_WEB_PATHS`) — reached from either the
 * invite email or the password-reset email (AC 1/3): both are "here's a
 * single-use token, set your password", so one page and one API call
 * (`POST /api/v1/auth/set-password`) serve both flows.
 */
export default async function SetPasswordPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('SetPasswordPage');

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 sm:px-16">
      <div className="w-full max-w-md">
        <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
          {t('kicker')}
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.02em] text-ink">
          {t('title')}
        </h1>
        <p className="mt-3 text-base leading-[1.6] text-mid-gray">{t('description')}</p>

        <Card className="mt-10 p-8">
          {token ? (
            <SetPasswordForm
              token={token}
              locale={locale as AppLocale}
              labels={{
                password: t('passwordLabel'),
                confirmPassword: t('confirmPasswordLabel'),
                submit: t('submit'),
                submitting: t('submitting'),
                success: t('success'),
                goToLogin: t('goToLogin'),
                errorMismatch: t('errorMismatch'),
                errorTooShort: t('errorTooShort'),
                errorGeneric: t('errorGeneric'),
              }}
            />
          ) : (
            <p
              role="alert"
              data-testid="set-password-missing-token"
              className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember"
            >
              {t('missingToken')}
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
