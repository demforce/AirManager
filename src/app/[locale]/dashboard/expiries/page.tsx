import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listExpiryTypes } from '@/server/services/expiry-types.service';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * The Scadenze landing (epic 6, story 6.1) — reachable with `expiries.manage`
 * (admin+staff; the redirect here hides navigation only, every service call
 * re-checks its own permission, AD-5). Today this page is deliberately
 * minimal: the catalogue link (`/dashboard/expiries/types`, `settings.manage`
 * only, same admin-configuration split as `/dashboard/finance/categories`)
 * plus a single informational panel. Story 6.4 REPLACES the panel below with
 * the real by-urgency dashboard (scadenze in scadenza/scadute, grouped per
 * persona) — nothing from 6.4 is built here, this is only the catalogue's
 * home for now. The only read is `listExpiryTypes` (active count) — no
 * scadenza data exists yet (arrives in story 6.2).
 */
export default async function ExpiriesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'expiries.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const canManageSettings = hasPermission(actor, 'settings.manage');
  const activeTypes = await listExpiryTypes(actor, { includeInactive: false });

  const t = await getTranslations('ExpiriesPage');

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
          <div className="flex flex-wrap gap-3">
            {canManageSettings ? (
              <Link
                href="/dashboard/expiries/types"
                locale={locale as AppLocale}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('manageTypes')}
              </Link>
            ) : null}
            <Link
              href="/dashboard"
              locale={locale as AppLocale}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('backToDashboard')}
            </Link>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{t('stat.label')}</p>
            <p className="mt-3 font-[family-name:var(--font-serif)] text-4xl font-medium text-[#111111]">{activeTypes.length}</p>
            <p className="mt-1 text-sm text-[#787774]">{t('stat.hint')}</p>
          </div>

          <div className="rounded-[12px] border border-[#EAEAEA] bg-[#F7F6F3] p-6 sm:col-span-2">
            <p className="text-sm font-medium text-[#111111]">{t('placeholder.heading')}</p>
            <p className="mt-2 max-w-lg text-sm leading-[1.6] text-[#787774]">{t('placeholder.body')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
