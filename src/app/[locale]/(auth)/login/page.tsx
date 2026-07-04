import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
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
            callbackUrl={callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : `/${locale}/dashboard`}
            labels={{
              email: t('emailLabel'),
              password: t('passwordLabel'),
              submit: t('submit'),
              submitting: t('submitting'),
              errorGeneric: t('errorGeneric'),
            }}
          />
        </div>
      </div>
    </main>
  );
}
