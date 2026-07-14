import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GeistSans } from 'geist/font/sans';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
// AirOps design system fonts (story 12.1, AC 1) — self-hosted via
// @fontsource, no build-time/runtime font fetch. Geist stays imported above
// until every legacy page is gone (epic 12, story 12.13).
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/instrument-serif/400.css';
import { routing } from '@/i18n/routing';
import '../globals.css';

const THEME_COOKIE = 'am-theme';

export function generateStaticParams(): Array<{ locale: string }> {
  return routing.locales.map((locale) => ({ locale }));
}

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this locale (see next-intl docs).
  setRequestLocale(locale);

  // AirOps theme (story 12.1, AC 2): read server-side and stamp on <html>
  // BEFORE hydration — no flash, no client/server mismatch. Cookie-only
  // (never localStorage, which can't be read during SSR).
  const theme = (await cookies()).get(THEME_COOKIE)?.value === 'dark' ? 'dark' : 'light';

  return (
    <html lang={locale} data-theme={theme} className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[#FBFBFA] font-[family-name:var(--font-sans)] text-[#2F3437]">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
