import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Icon } from '@/components/ui/icons';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getSessionActor } from '@/server/auth/session';
import { LoginForm } from './login-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
};

/**
 * AirOps visual pass (story 12.1, AC 5) — card on `--bg`, brand mark,
 * `.fld`/`.input`/`.btn.primary`. Same fields, API call, redirect and
 * error copy as before (`auth.login.*` in `messages/*.json`, unchanged
 * content, only relocated from the old top-level `LoginPage` namespace).
 */
export default async function LoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { callbackUrl } = await searchParams;
  setRequestLocale(locale);

  // Already signed in — no reason to show the form again.
  const actor = await getSessionActor();
  if (actor) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('auth.login');

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

          <LoginForm
            callbackUrl={
              // Internal paths only: "//evil.com" and "/\evil.com" are
              // protocol-relative external URLs, not local paths.
              callbackUrl && /^\/(?![/\\])/.test(callbackUrl)
                ? callbackUrl
                : `/${locale}/dashboard`
            }
            labels={{
              email: t('emailLabel'),
              password: t('passwordLabel'),
              submit: t('submit'),
              submitting: t('submitting'),
              errorGeneric: t('errorGeneric'),
            }}
          />

          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12.5 }}>
            <Link href="/forgot-password" locale={locale as AppLocale}>
              {t('forgotPassword')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
