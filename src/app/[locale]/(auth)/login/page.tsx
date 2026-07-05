import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getSessionActor } from '@/server/auth/session';
import { LoginForm } from './login-form';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { callbackUrl } = await searchParams;
  setRequestLocale(locale);

  // Already signed in — no reason to show the form again.
  const actor = await getSessionActor();
  if (actor) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('LoginPage');

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 sm:px-16">
      <div className="w-full max-w-md">
        <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
          {t('kicker')}
        </span>

        <h1 className="mt-6 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
          {t('title')}
        </h1>
        <p className="mt-3 text-base leading-[1.6] text-[#787774]">{t('description')}</p>

        <div className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-8">
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
          <p className="mt-6 text-center text-sm">
            <Link
              href="/forgot-password"
              locale={locale as AppLocale}
              className="font-medium text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 transition-colors hover:text-[#2F3437] hover:decoration-[#2F3437]"
            >
              {t('forgotPassword')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
