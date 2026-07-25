import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Icon } from '@/components/ui/icons';
import type { AppLocale } from '@/i18n/routing';
import { ForgotPasswordForm } from './forgot-password-form';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * AirOps visual pass (story 12.1, AC 5) — same neutral-confirmation
 * behavior as before (`auth.forgotPassword.*` content unchanged from the
 * old `ForgotPasswordPage` namespace), card/brand mark markup only.
 */
export default async function ForgotPasswordPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('auth.forgotPassword');

  return (
    <main
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
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

          <ForgotPasswordForm
            locale={locale as AppLocale}
            labels={{
              email: t('emailLabel'),
              submit: t('submit'),
              submitting: t('submitting'),
              confirmation: t('confirmation'),
              backToLogin: t('backToLogin'),
            }}
          />
        </div>
      </div>
    </main>
  );
}
