import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('HomePage');
  const otherLocale: AppLocale = locale === 'it' ? 'en' : 'it';

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 sm:px-16 sm:py-32">
      <div className="w-full max-w-2xl">
        <div className="mb-10 flex items-center justify-between">
          <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
            {t('kicker')}
          </span>
          <Link
            href="/"
            locale={otherLocale}
            className="text-sm font-medium text-[#2F3437] underline decoration-[#EAEAEA] underline-offset-4 transition-colors hover:decoration-[#2F3437]"
          >
            {t('switchTo')}
          </Link>
        </div>

        <h1 className="font-[family-name:var(--font-serif)] text-5xl font-medium leading-[1.1] tracking-[-0.02em] text-[#111111] sm:text-6xl">
          {t('title')}
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-[1.6] text-[#787774]">{t('description')}</p>

        <div className="mt-12 rounded-[12px] border border-[#EAEAEA] bg-white px-8 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
            {t('statusLabel')}
          </p>
          <p className="mt-2 text-base font-medium text-[#2F3437]">{t('statusValue')}</p>
        </div>
      </div>
    </main>
  );
}
