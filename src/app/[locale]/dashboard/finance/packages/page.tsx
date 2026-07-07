import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAircraft } from '@/server/services/aircraft.service';
import { listPackageTypes } from '@/server/services/package-types.service';
import { PackagesManager } from './packages-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Package-type listino management (story 4.3, Task 4, AC 1/2; FR-12) —
 * reachable with `finance.manage` (staff consult the listino they will sell
 * from in story 4.4; the redirect here hides navigation only, every service
 * call re-checks its own permission, AD-5). Lists ALL package types
 * (inactive included) with their eligible-aircraft set, so the admin sees at
 * a glance which ones are active/deletable. Only `settings.manage` (admin)
 * gets the create/edit/lifecycle/delete controls — `PackagesManager`'s
 * `canManage` prop drives that split client-side (the service is the real
 * guardian either way).
 */
export default async function PackagesPage({ params }: PageProps) {
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

  const canManage = hasPermission(actor, 'settings.manage');

  const packageTypes = await listPackageTypes(actor, { includeInactive: true });
  // Only the write-capable (admin) viewer needs the picker's aircraft
  // options — a read-only staff viewer never opens the create/edit form.
  const activeAircraftResult = canManage
    ? await listAircraft(actor, { page: 1, pageSize: 100, includeArchived: false })
    : null;

  const t = await getTranslations('PackagesPage');

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
            href="/dashboard/finance"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToFinance')}
          </Link>
        </div>

        <div className="mt-10">
          <PackagesManager
            packageTypes={packageTypes.map((packageType) => ({
              id: packageType.id,
              name: packageType.name,
              includedMinutes: packageType.includedMinutes,
              priceCents: packageType.priceCents,
              validityMonths: packageType.validityMonths,
              isActive: packageType.isActive,
              eligibleAircraft: packageType.eligibleAircraft,
            }))}
            activeAircraft={activeAircraftResult?.items.map((aircraft) => ({ id: aircraft.id, registration: aircraft.registration })) ?? []}
            canManage={canManage}
            moneyLocale={locale === 'en' ? 'en' : 'it'}
            labels={{
              newPackageType: t('newPackageType'),
              table: {
                name: t('table.name'),
                includedHours: t('table.includedHours'),
                price: t('table.price'),
                effectivePrice: t('table.effectivePrice'),
                aircraft: t('table.aircraft'),
                validity: t('table.validity'),
                status: t('table.status'),
                actions: t('table.actions'),
                empty: t('table.empty'),
                noValidity: t('table.noValidity'),
                noAircraft: t('table.noAircraft'),
                monthsUnit: t('table.monthsUnit'),
              },
              status: {
                active: t('status.active'),
                inactive: t('status.inactive'),
              },
              actions: {
                edit: t('actions.edit'),
                deactivate: t('actions.deactivate'),
                reactivate: t('actions.reactivate'),
                delete: t('actions.delete'),
                confirmDelete: t('actions.confirmDelete'),
                confirmYes: t('actions.confirmYes'),
                confirmCancel: t('actions.confirmCancel'),
              },
              form: {
                createTitle: t('form.createTitle'),
                editTitle: t('form.editTitle'),
                name: t('form.name'),
                includedHours: t('form.includedHours'),
                includedHoursHint: t('form.includedHoursHint'),
                price: t('form.price'),
                validityMonths: t('form.validityMonths'),
                validityMonthsHint: t('form.validityMonthsHint'),
                aircraft: t('form.aircraft'),
                noAircraftAvailable: t('form.noAircraftAvailable'),
                submitCreate: t('form.submitCreate'),
                submitSave: t('form.submitSave'),
                cancel: t('form.cancel'),
                requiredField: t('form.requiredField'),
                invalidDuration: t('form.invalidDuration'),
                invalidAmount: t('form.invalidAmount'),
                invalidValidity: t('form.invalidValidity'),
                conflictError: t('form.conflictError'),
                genericError: t('form.genericError'),
              },
              feedback: {
                created: t('feedback.created'),
                updated: t('feedback.updated'),
                deactivated: t('feedback.deactivated'),
                reactivated: t('feedback.reactivated'),
                deleted: t('feedback.deleted'),
                deleteInUseError: t('feedback.deleteInUseError'),
                genericError: t('feedback.genericError'),
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
