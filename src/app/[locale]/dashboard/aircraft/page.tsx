import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAircraft } from '@/server/services/aircraft.service';
import { AircraftManager } from './aircraft-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; includeArchived?: string }>;
};

const PAGE_SIZE = 20;

/**
 * Staff/admin Aircraft fleet CRUD (story 2.4, AC 1/2 — `aircraft.manage`).
 * `hasPermission` here only decides whether to *redirect*; `listAircraft`
 * calls `authorize()` again (AD-5: the UI is never the only guardian).
 * There is no `aircraft.read` — pilots see the fleet via the future
 * bookings epic, not this page.
 */
export default async function AircraftPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { page: pageParam, q, includeArchived: includeArchivedParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'aircraft.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const includeArchived = includeArchivedParam === 'true';

  const aircraftResult = await listAircraft(actor, { page, pageSize: PAGE_SIZE, q, includeArchived });

  const t = await getTranslations('AircraftPage');
  const totalPages = Math.max(1, Math.ceil(aircraftResult.total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/aircraft',
      query: { page: targetPage, ...(q ? { q } : {}), ...(includeArchived ? { includeArchived: 'true' } : {}) },
    };
  }

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

        <div className="mt-10">
          <AircraftManager
            aircraft={aircraftResult.items.map((aircraft) => ({
              id: aircraft.id,
              registration: aircraft.registration,
              type: aircraft.type,
              model: aircraft.model,
              hourMeterMinutes: aircraft.hourMeterMinutes,
              notes: aircraft.notes,
              status: aircraft.status,
              statusReason: aircraft.statusReason,
              archivedAt: aircraft.archivedAt ? aircraft.archivedAt.toISOString() : null,
            }))}
            initialQuery={q ?? ''}
            initialIncludeArchived={includeArchived}
            labels={{
              newAircraft: t('newAircraft'),
              searchPlaceholder: t('searchPlaceholder'),
              includeArchivedLabel: t('includeArchivedLabel'),
              table: {
                registration: t('table.registration'),
                type: t('table.type'),
                model: t('table.model'),
                hourMeter: t('table.hourMeter'),
                status: t('table.status'),
                operationalStatus: t('table.operationalStatus'),
                actions: t('table.actions'),
                empty: t('table.empty'),
              },
              status: {
                active: t('status.active'),
                archived: t('status.archived'),
              },
              operationalStatus: {
                operational: t('operationalStatus.operational'),
                outOfService: t('operationalStatus.outOfService'),
              },
              actions: {
                edit: t('actions.edit'),
                archive: t('actions.archive'),
                unarchive: t('actions.unarchive'),
                confirmArchive: t('actions.confirmArchive'),
                confirmUnarchive: t('actions.confirmUnarchive'),
                confirmYes: t('actions.confirmYes'),
                confirmCancel: t('actions.confirmCancel'),
                setOutOfService: t('actions.setOutOfService'),
                returnToService: t('actions.returnToService'),
                confirmReturnToService: t('actions.confirmReturnToService'),
                adjustHourMeter: t('actions.adjustHourMeter'),
              },
              form: {
                createTitle: t('form.createTitle'),
                editTitle: t('form.editTitle'),
                registration: t('form.registration'),
                type: t('form.type'),
                model: t('form.model'),
                hourMeter: t('form.hourMeter'),
                hourMeterHint: t('form.hourMeterHint'),
                notes: t('form.notes'),
                submitCreate: t('form.submitCreate'),
                submitEdit: t('form.submitEdit'),
                cancel: t('form.cancel'),
                requiredField: t('form.requiredField'),
                invalidHourMeter: t('form.invalidHourMeter'),
                genericError: t('form.genericError'),
                conflictError: t('form.conflictError'),
              },
              statusForm: {
                title: t('statusForm.title'),
                reason: t('statusForm.reason'),
                reasonRequired: t('statusForm.reasonRequired'),
                submit: t('statusForm.submit'),
                cancel: t('statusForm.cancel'),
                conflictError: t('statusForm.conflictError'),
                genericError: t('statusForm.genericError'),
              },
              hourMeterPanel: {
                title: t('hourMeterPanel.title'),
                current: t('hourMeterPanel.current'),
                newValue: t('hourMeterPanel.newValue'),
                hint: t('hourMeterPanel.hint'),
                reason: t('hourMeterPanel.reason'),
                delta: t('hourMeterPanel.delta'),
                submit: t('hourMeterPanel.submit'),
                cancel: t('hourMeterPanel.cancel'),
                requiredField: t('hourMeterPanel.requiredField'),
                invalidValue: t('hourMeterPanel.invalidValue'),
                genericError: t('hourMeterPanel.genericError'),
                historyTitle: t('hourMeterPanel.historyTitle'),
                historyEmpty: t('hourMeterPanel.historyEmpty'),
                historyWhen: t('hourMeterPanel.historyWhen'),
                historyActor: t('hourMeterPanel.historyActor'),
                historyPrevious: t('hourMeterPanel.historyPrevious'),
                historyNew: t('hourMeterPanel.historyNew'),
                historyDelta: t('hourMeterPanel.historyDelta'),
                historyReason: t('hourMeterPanel.historyReason'),
              },
              feedback: {
                created: t('feedback.created'),
                updated: t('feedback.updated'),
                archived: t('feedback.archived'),
                unarchived: t('feedback.unarchived'),
                setOutOfService: t('feedback.setOutOfService'),
                returnedToService: t('feedback.returnedToService'),
                hourMeterAdjusted: t('feedback.hourMeterAdjusted'),
              },
            }}
          />
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-[#787774]">
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
              }`}
            >
              ←
            </Link>
            <span>
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              className={`rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 transition-colors ${
                page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-[#F7F6F3]'
              }`}
            >
              →
            </Link>
          </nav>
        ) : null}
      </div>
    </main>
  );
}
