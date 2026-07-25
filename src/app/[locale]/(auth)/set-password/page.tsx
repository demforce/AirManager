import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Icon } from '@/components/ui/icons';
import type { AppLocale } from '@/i18n/routing';
import { SetPasswordForm } from './set-password-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

/**
 * AirOps visual pass (story 12.1, AC 5) — same behavior as before (public
 * page, invite/reset dual-purpose, `auth.setPassword.*` content unchanged
 * from the old `SetPasswordPage` namespace), card/brand mark markup only.
 */
export default async function SetPasswordPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('auth.setPassword');

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28 }}>
          <div className="brand-mark">
            <Icon.logo />
          </div>
          <div className="brand-name" style={{ fontSize: 15 }}>
            AirManager
          </div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div className="page-title-block" style={{ marginBottom: 20 }}>
            <div className="so-sub">{t('kicker')}</div>
            <h1>{t('title')}</h1>
            <div className="sub">{t('description')}</div>
          </div>

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
            <p role="alert" data-testid="set-password-missing-token" className="alert-box bad">
              {t('missingToken')}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
