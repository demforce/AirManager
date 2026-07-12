import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { ForgotPasswordForm } from './forgot-password-form';
import { Card } from '@/components/ui/card';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Public page (`src/proxy.ts` `PUBLIC_WEB_PATHS`). AC 3: the confirmation
 * shown after submit is always the same neutral message — it never depends
 * on the API response body, which itself never reveals whether the email
 * matched an account (see `requestPasswordReset` / the API route).
 */
export default async function ForgotPasswordPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('ForgotPasswordPage');

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
        </Card>
      </div>
    </main>
  );
}
