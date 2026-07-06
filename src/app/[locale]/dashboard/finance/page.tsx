import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import { formatDateTime } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listNegativeBalances } from '@/server/services/accounts.service';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The first finance landing page (story 3.3, Task 3): the staff-facing
 * "Saldi negativi" list (AC 2) — every account below zero, most negative
 * first, each person linked to their scheda. Purely server-rendered (no
 * client interactivity needed): the data comes from `listNegativeBalances`
 * (AD-1: pages read through services, never Prisma directly). The rest of
 * the finance area (cassa, report) arrives with stories 3.4/3.5.
 * `hasPermission` here only decides whether to redirect; the service calls
 * `authorize()` again (AD-5: the UI is never the only guardian).
 */
export default async function FinancePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'finance.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const negativeBalances = await listNegativeBalances(actor);

  const t = await getTranslations('FinancePage');
  // Money must follow the page locale (review 3.1 M1 — mandatory), same
  // pattern as the account statement page.
  const moneyLocale = locale === 'en' ? ('en' as const) : ('it' as const);

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#787774]">{t('description')}</p>
          </div>
          <Link
            href="/dashboard"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-[#787774]">{t('negativeBalances.heading')}</h2>
          <div className="mt-4 overflow-x-auto rounded-[12px] border border-[#EAEAEA] bg-white">
            <table className="w-full min-w-[560px] text-left text-sm" data-testid="negative-balances-table">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">
                  <th className="px-5 py-3">{t('negativeBalances.table.person')}</th>
                  <th className="px-5 py-3">{t('negativeBalances.table.balance')}</th>
                  <th className="px-5 py-3">{t('negativeBalances.table.lastMovement')}</th>
                </tr>
              </thead>
              <tbody>
                {negativeBalances.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-[#787774]">
                      {t('negativeBalances.empty')}
                    </td>
                  </tr>
                ) : (
                  negativeBalances.map((item) => (
                    <tr key={item.personId} className="border-b border-[#EAEAEA] last:border-b-0" data-testid="negative-balance-row">
                      <td className="px-5 py-3 align-middle">
                        <Link
                          href={`/dashboard/people/${item.personId}`}
                          locale={locale as AppLocale}
                          className="font-medium text-[#111111] underline-offset-4 hover:underline"
                        >
                          {item.lastName} {item.firstName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 align-middle font-medium text-[#9F2F2D]">
                        {formatCents(item.balanceCents, moneyLocale)}
                      </td>
                      <td className="px-5 py-3 align-middle text-[#2F3437]">
                        {item.lastMovementAt ? formatDateTime(item.lastMovementAt, moneyLocale) : t('negativeBalances.table.noValue')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
