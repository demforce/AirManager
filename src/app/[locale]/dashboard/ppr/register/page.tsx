import { permanentRedirect } from '@/i18n/navigation';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * `/dashboard/ppr/register` is ELIMINATED (epic 12, story 12.4, AC 3) — its
 * whole feature set (closure, landing fee, filters) moved to
 * `/dashboard/movements` (`Ops.jsx#VisitingView`, now with derived
 * atteso/in-arrivo/al-suolo/partito status and real KPIs). Any bookmark or
 * stale link to the old path gets a PERMANENT (308) redirect rather than a
 * bare 404 — the URL moved, it did not disappear.
 */
export default async function PprRegisterRedirectPage({ params }: PageProps) {
  const { locale } = await params;
  permanentRedirect({ href: '/dashboard/movements', locale: locale as 'it' | 'en' });
}
