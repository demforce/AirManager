import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref } from '@/lib/export-href';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAircraft } from '@/server/services/aircraft.service';
import { getEffectiveRates, todayDateOnlyUtc } from '@/server/services/rates.service';
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

  // Story 4.1, AD-4 (batched story TD-1, AC 4): the hourly rate in effect
  // TODAY for every row of the current page — ONE query via
  // `getEffectiveRates`, not N `getEffectiveRate` calls (the N+1 4.1's
  // review flagged as a follow-up).
  const today = todayDateOnlyUtc();
  const currentRatesById = await getEffectiveRates(
    actor,
    aircraftResult.items.map((item) => item.id),
    today,
  );

  const t = await getTranslations('AircraftPage');
  const tExport = await getTranslations('Export');
  const totalPages = Math.max(1, Math.ceil(aircraftResult.total / PAGE_SIZE));

  // Story 10.1 (AC 5) — server-driven view, same rationale as `people/page.tsx`.
  const exportHref = buildExportHref('/api/v1/aircraft', { q, includeArchived: includeArchived ? 'true' : undefined }, locale);

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
            <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
              {t('kicker')}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-ink">
              {t('title')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-mid-gray">{t('description')}</p>
          </div>
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
              currentRatePriceCentsPerHour: currentRatesById.get(aircraft.id)?.priceCentsPerHour ?? null,
            }))}
            initialQuery={q ?? ''}
            initialIncludeArchived={includeArchived}
            canManageSettings={hasPermission(actor, 'settings.manage')}
            exportHref={exportHref}
            exportLabel={tExport('button')}
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
                currentRate: t('table.currentRate'),
                noRate: t('table.noRate'),
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
                rates: t('actions.rates'),
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
                loadMore: t('hourMeterPanel.loadMore'),
              },
              ratesPanel: {
                title: t('ratesPanel.title'),
                current: t('ratesPanel.current'),
                noCurrentRate: t('ratesPanel.noCurrentRate'),
                newRateTitle: t('ratesPanel.newRateTitle'),
                price: t('ratesPanel.price'),
                validFrom: t('ratesPanel.validFrom'),
                submit: t('ratesPanel.submit'),
                cancel: t('ratesPanel.cancel'),
                requiredField: t('ratesPanel.requiredField'),
                invalidPrice: t('ratesPanel.invalidPrice'),
                invalidDate: t('ratesPanel.invalidDate'),
                genericError: t('ratesPanel.genericError'),
                conflictError: t('ratesPanel.conflictError'),
                readOnlyHint: t('ratesPanel.readOnlyHint'),
                historyTitle: t('ratesPanel.historyTitle'),
                historyEmpty: t('ratesPanel.historyEmpty'),
                historyValidFrom: t('ratesPanel.historyValidFrom'),
                historyPrice: t('ratesPanel.historyPrice'),
                historyActor: t('ratesPanel.historyActor'),
                historyWhen: t('ratesPanel.historyWhen'),
              },
              feedback: {
                created: t('feedback.created'),
                updated: t('feedback.updated'),
                archived: t('feedback.archived'),
                unarchived: t('feedback.unarchived'),
                setOutOfService: t('feedback.setOutOfService'),
                returnedToService: t('feedback.returnedToService'),
                hourMeterAdjusted: t('feedback.hourMeterAdjusted'),
                rateAdded: t('feedback.rateAdded'),
              },
            }}
          />
        </div>

        {totalPages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-4 text-sm text-mid-gray">
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
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
              className={`rounded-buttons border border-hairline bg-paper px-3 py-1.5 transition-colors ${
                page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-canvas'
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
