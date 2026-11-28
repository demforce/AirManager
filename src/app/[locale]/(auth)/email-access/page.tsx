import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { emailTrialEnabled } from '@/server/auth/email-trial-policy';
import { EmailAccessForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } } as const;

export default async function EmailAccessPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ purpose?: string }>;
}) {
  if (!emailTrialEnabled()) notFound();
  const { locale } = await params;
  const { purpose } = await searchParams;
  if (purpose !== undefined && purpose !== 'verify' && purpose !== 'login' && purpose !== 'reactivate') notFound();
  setRequestLocale(locale);
  const t = await getTranslations('auth.emailTrial');
  const mode = purpose ?? 'request';
  return <main className="auth-page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <section className="card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
      <h1>{t(mode + 'Title')}</h1>
      <p>{t(mode + 'Help')}</p>
      <EmailAccessForm purpose={mode} locale={locale} />
      <p><Link href="/login">{t('back')}</Link></p>
    </section>
  </main>;
}
