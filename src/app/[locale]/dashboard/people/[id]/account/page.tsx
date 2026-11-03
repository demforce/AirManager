import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string; from?: string | string[]; to?: string | string[] }>;
};

/**
 * Story 13.3 (R-13.3-a/b): the standalone "estratto conto" drill-down is
 * retired — it is now the "Estratto conto" SECTION embedded in the scheda
 * persona (`../page.tsx`), rebuilt AirOps-native (no more `DataTable`/
 * `ExportButton`/Tailwind, AC 2/4). This route stays alive ONLY so links and
 * bookmarks pointing at it (the least invasive option per R-13.3-b — no
 * incoming link breaks) land on the same content: a plain redirect to the
 * scheda, `?page=` and the period (`?from=&to=`, story 19.11) preserved since
 * the destination reads the SAME query params for its embedded statement
 * (a repeated or malformed one is dropped here and the destination falls back
 * to its default period, as it would on its own URL). No RBAC check of its own —
 * the destination page re-authorizes (`getPerson`'s own `people.read`/
 * own-access rule), same AD-5 convention as every other redirect in the app.
 */
export default async function AccountStatementRedirectPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const { page, from, to } = await searchParams;
  setRequestLocale(locale);
  const query: Record<string, string> = {};
  if (page) query['page'] = page;
  if (typeof from === 'string') query['from'] = from;
  if (typeof to === 'string') query['to'] = to;
  redirect({ href: { pathname: `/dashboard/people/${id}`, query }, locale });
}
