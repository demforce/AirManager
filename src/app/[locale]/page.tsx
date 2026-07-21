import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The pre-epic-12 public splash ("stato del progetto" placeholder) is gone:
 * the root simply enters the app. The dashboard layout bounces anonymous
 * visitors to `/login` (with `callbackUrl`), and the login page sends an
 * already-authenticated session back to `/dashboard` — so this single
 * redirect gives both audiences the right landing.
 */
export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: '/dashboard', locale });
}
