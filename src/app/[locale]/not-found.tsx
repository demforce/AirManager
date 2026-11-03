import { getTranslations } from 'next-intl/server';
import { ErrorCard } from './error-card';

/**
 * Story 19.12b (AD-4) — the localized 404. Next renders it for a `notFound()`
 * thrown inside a route, never for an unknown path on its own: that is what
 * the catch-all `[...rest]/page.tsx` beside it is for. The locale comes from
 * the request (next-intl's middleware runs on every localized path).
 */
export default async function NotFound() {
  const t = await getTranslations('ErrorPages');
  return <ErrorCard code="404" title={t('notFound.title')} text={t('notFound.text')} homeLabel={t('home')} />;
}
