import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listExpiryTypes } from '@/server/services/expiry-types.service';
import { TypesManager } from './types-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Expiry-type catalogue management (story 6.1, Task 4, AC 1/2; FR-35) —
 * mirrors `/dashboard/finance/categories` (story 3.4) with the partial-edit
 * form shape of `/dashboard/finance/packages` (story 4.3). Reachable with
 * `expiries.manage` (admin+staff — the redirect here hides navigation only,
 * every service call re-checks its own permission, AD-5): staff will
 * register scadenze against this catalogue in story 6.2 and must be able to
 * consult it now, but only `settings.manage` (admin) gets the
 * create/edit/lifecycle/delete controls — `TypesManager`'s `canManage` prop
 * drives that split client-side, same as `PackagesManager`.
 */
export default async function ExpiryTypesPage({ params }: PageProps) {
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

  const canManage = hasPermission(actor, 'settings.manage');

  const expiryTypes = await listExpiryTypes(actor, { includeInactive: true });

  const t = await getTranslations('ExpiryTypesPage');

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
            href="/dashboard/expiries"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToExpiries')}
          </Link>
        </div>

        <div className="mt-10">
          <TypesManager
            expiryTypes={expiryTypes.map((expiryType) => ({
              id: expiryType.id,
              name: expiryType.name,
              scope: expiryType.scope,
              isActive: expiryType.isActive,
              blocksBooking: expiryType.blocksBooking,
            }))}
            canManage={canManage}
            labels={{
              newType: t('newType'),
              table: {
                name: t('table.name'),
                scope: t('table.scope'),
                status: t('table.status'),
                blocksBooking: t('table.blocksBooking'),
                actions: t('table.actions'),
                empty: t('table.empty'),
              },
              scope: {
                PILOTS: t('scope.PILOTS'),
                STUDENTS: t('scope.STUDENTS'),
                INSTRUCTORS: t('scope.INSTRUCTORS'),
                ALL: t('scope.ALL'),
              },
              status: {
                active: t('status.active'),
                inactive: t('status.inactive'),
              },
              blocksBooking: {
                yes: t('blocksBooking.yes'),
                no: t('blocksBooking.no'),
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
                scope: t('form.scope'),
                blocksBooking: t('form.blocksBooking'),
                blocksBookingHint: t('form.blocksBookingHint'),
                submitCreate: t('form.submitCreate'),
                submitSave: t('form.submitSave'),
                cancel: t('form.cancel'),
                requiredField: t('form.requiredField'),
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
