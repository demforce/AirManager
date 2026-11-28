'use client';

import { useTranslations } from 'next-intl';
import { ErrorCard } from './error-card';

/**
 * Story 19.12b (AD-4) — the localized error boundary of every page under
 * `[locale]` (a client component by Next's contract; the messages come from
 * the layout's `NextIntlClientProvider`). It shows no detail of the error:
 * in production Next hands the client only a digest. `reset` re-renders the
 * segment that failed.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('ErrorPages');
  return <ErrorCard title={t('error.title')} text={t('error.text')} homeLabel={t('home')} retry={{ label: t('retry'), onClick: reset }} />;
}
