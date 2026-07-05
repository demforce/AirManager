import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { signOut } from '@/server/auth/auth';
import { getSessionActor } from '@/server/auth/session';
import { getMe } from '@/server/services/me.service';
import { visibleNavItems } from './nav-items';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Protected placeholder landing page (Task 3). Real role-based dashboard
 * areas (persone, velivoli, voli, ...) arrive with the corresponding
 * epics — this page only proves the login → session → logout loop (AC 1).
 *
 * `src/proxy.ts` already blocks unauthenticated requests before they reach
 * this route, but Auth.js's own guidance is not to rely on middleware
 * exclusively — the session is re-checked here, close to the data fetch.
 */
export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  // AD-1: pages read through services, never Prisma directly.
  const me = await getMe(actor);
  const displayName = me.person
    ? `${me.person.firstName} ${me.person.lastName}`
    : me.email;

  const t = await getTranslations('DashboardPage');
  const navItems = visibleNavItems(actor);

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: `/${locale}/login` });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24 sm:px-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
            {t('kicker')}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('logout')}
            </button>
          </form>
        </div>

        <h1 className="mt-6 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
          {t('welcome', { name: displayName })}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-[1.6] text-[#787774]">{t('subtitle')}</p>

        <nav className="mt-10" aria-label={t('navHeading')}>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">{t('navHeading')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
