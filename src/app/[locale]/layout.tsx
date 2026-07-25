import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
// AirOps design system fonts (story 12.1, AC 1) — self-hosted via
// @fontsource, no build-time/runtime font fetch.
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
    <html lang={locale} data-theme={theme}>
      {/* Story 13.9 fix (mechanism corrected in review F3): the light-mode pin came
          from globals.css's own `body{ background/color }` rule — unlayered and later
          in the cascade than airops.css's @import, so it beat the theme-aware
          `body{ background:var(--bg); color:var(--ink) }` rule and froze inherited
          text at light-mode colors (~1.5:1 on dark panels). The hardcoded Tailwind
          color classes that also sat here were INERT, not the culprit — Tailwind v4
          emits utilities in `@layer utilities`, which loses to unlayered CSS
          regardless of specificity — and were removed as dead, misleading code.
          Story 13.11: `h-full`/`antialiased` (Tailwind) dropped from `<html>` — both
          were already redundant with airops.css (`html,body{height:100%}` line 68,
          `body{-webkit-font-smoothing:antialiased}` line 76); the one non-redundant
          bit (`-moz-osx-font-smoothing:grayscale`) moved into that same airops.css
          body rule. `flex min-h-full flex-col` (real shell geometry, see `.ppr-page`'s
          `flex-shrink:0` comment above) moved to a plain `body{}` rule in
          globals.css. */}
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
