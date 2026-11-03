import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Story 19.12b (AD-4) — every localized path no route claims (`/it/ppr`,
 * removed by story 19.1, included) lands here and answers the localized 404
 * of `../not-found.tsx` instead of Next's English default. Existing routes are
 * more specific than a catch-all, so none of them is intercepted; `api/` lives
 * outside `[locale]`.
 */
export default async function CatchAllPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  notFound();
}
