import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildExportHref } from '@/lib/export-href';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { redirect } from '@/i18n/navigation';
import { listAircraft, listOutOfServiceAircraft } from '@/server/services/aircraft.service';
import { listReservedAircraftIds } from '@/server/services/bookings.service';
import { getEffectiveRates, todayDateOnlyUtc } from '@/server/services/rates.service';
import { FleetConsole, type FleetCardItem } from './fleet-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; includeArchived?: string }>;
};

const PAGE_SIZE = 20;

/**
 * Fleet page (story 12.5) — AirOps-native rebuild of the legacy
 * `/dashboard/aircraft` CRUD page (story 2.4+), which this story deletes.
 * `hasPermission` here only decides whether to *redirect* (AD-5); every
 * service call re-checks its own `aircraft.manage` gate. There is no
 * `aircraft.read` — pilots see the fleet via the bookings epic, not here.
 *
 * Card-grid badge derivation (AC 2): AOG comes straight off the persisted
 * `status`; "Riservato" is presentational (no DB field) — a batched query
 * over the CURRENT PAGE's ids only (`listReservedAircraftIds`, mirrors
 * `getEffectiveRates`'s own N+1-avoidance rationale), never per-card.
 *
 * The page-head "N totali · N disponibili · N AOG" summary is FLEET-WIDE
 * (unfiltered by `q`/pagination, matching the prototype's own always-whole-
 * fleet counts) but deliberately does NOT subtract live "Riservato"
 * bookings from "disponibili": that badge is a per-card, point-in-time
 * concept (Task Dev Notes leave the exact split open) — the summary's three
 * buckets are the cheap, persisted `status`/`archivedAt` partition
 * (total non-archived = available + AOG), while "Riservato" is a live
 * overlay shown only on the visible cards.
 */
export default async function FleetPage({ params, searchParams }: PageProps) {
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

  const [aircraftResult, fleetTotalResult, outOfServiceAircraft] = await Promise.all([
    listAircraft(actor, { page, pageSize: PAGE_SIZE, q, includeArchived }),
    listAircraft(actor, { page: 1, pageSize: 1, includeArchived: false }),
    listOutOfServiceAircraft(actor),
  ]);

  const ids = aircraftResult.items.map((item) => item.id);
  const today = todayDateOnlyUtc();
  const now = new Date();
  const [currentRatesById, reservedIds] = await Promise.all([
    getEffectiveRates(actor, ids, today),
    listReservedAircraftIds(actor, ids, now),
  ]);

  const totalCount = fleetTotalResult.total;
  const aogCount = outOfServiceAircraft.length;
  const availableCount = Math.max(0, totalCount - aogCount);

  const t = await getTranslations('AircraftPage');
  const tExport = await getTranslations('Export');
  const totalPages = Math.max(1, Math.ceil(aircraftResult.total / PAGE_SIZE));

  const exportHref = buildExportHref('/api/v1/aircraft', { q, includeArchived: includeArchived ? 'true' : undefined }, locale);

  const items: FleetCardItem[] = aircraftResult.items.map((aircraft) => ({
    id: aircraft.id,
    registration: aircraft.registration,
    type: aircraft.type,
    model: aircraft.model,
    hourMeterMinutes: aircraft.hourMeterMinutes,
    notes: aircraft.notes,
    status: aircraft.status,
    statusReason: aircraft.statusReason,
    seats: aircraft.seats,
    fuelType: aircraft.fuelType,
    based: aircraft.based,
    archivedAt: aircraft.archivedAt ? aircraft.archivedAt.toISOString() : null,
    wetRateCents: currentRatesById.get(aircraft.id)?.priceCentsPerHour ?? null,
    reserved: reservedIds.has(aircraft.id),
  }));

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{t('sub', { total: totalCount, available: availableCount, aog: aogCount })}</div>
        </div>
      </div>

      <FleetConsole
        key={JSON.stringify({ page, q: q ?? '', includeArchived })}
        items={items}
        page={page}
        totalPages={totalPages}
        initialQuery={q ?? ''}
        initialIncludeArchived={includeArchived}
        canManageSettings={hasPermission(actor, 'settings.manage')}
        exportHref={exportHref}
        locale={locale as 'it' | 'en'}
        labels={{
          cardTitle: t('cardTitle'),
          searchPlaceholder: t('searchPlaceholder'),
          includeArchivedLabel: t('includeArchivedLabel'),
          empty: t('empty'),
          newAircraft: t('newAircraft'),
          rateLabel: t('rateLabel'),
          exportLabel: tExport('button'),
          exportXls: tExport('button'),
          pagination: { prev: t('pagination.prev'), next: t('pagination.next') },
          badge: {
            aog: t('badge.aog'),
            reserved: t('badge.reserved'),
            available: t('badge.available'),
            archived: t('badge.archived'),
          },
          editor: {
            newTitle: t('editor.newTitle'),
            newSubtitle: t('editor.newSubtitle'),
            closeLabel: t('editor.closeLabel'),
            cancel: t('editor.cancel'),
            submitCreate: t('editor.submitCreate'),
            submitEdit: t('editor.submitEdit'),
            identity: {
              sectionTitle: t('editor.identity.sectionTitle'),
              registration: t('editor.identity.registration'),
              type: t('editor.identity.type'),
              model: t('editor.identity.model'),
              seats: t('editor.identity.seats'),
              fuelType: t('editor.identity.fuelType'),
              fuelOptions: {
                avgas: t('editor.identity.fuelOptions.avgas'),
                jetA1: t('editor.identity.fuelOptions.jetA1'),
                mogas: t('editor.identity.fuelOptions.mogas'),
              },
              based: t('editor.identity.based'),
              basedOptions: { based: t('editor.identity.basedOptions.based'), guest: t('editor.identity.basedOptions.guest') },
              notes: t('editor.identity.notes'),
              hourMeter: t('editor.identity.hourMeter'),
              hourMeterHint: t('editor.identity.hourMeterHint'),
            },
            availability: {
              sectionTitle: t('editor.availability.sectionTitle'),
              current: t('editor.availability.current'),
              setOutOfService: t('editor.availability.setOutOfService'),
              returnToService: t('editor.availability.returnToService'),
              reason: t('editor.availability.reason'),
              confirm: t('editor.availability.confirm'),
              confirmReturnToService: t('editor.availability.confirmReturnToService'),
            },
            rates: {
              sectionTitle: t('editor.rates.sectionTitle'),
              current: t('editor.rates.current'),
              currentDry: t('editor.rates.currentDry'),
              noCurrentRate: t('editor.rates.noCurrentRate'),
              newRateTitle: t('editor.rates.newRateTitle'),
              price: t('editor.rates.price'),
              priceDry: t('editor.rates.priceDry'),
              validFrom: t('editor.rates.validFrom'),
              submit: t('editor.rates.submit'),
              readOnlyHint: t('editor.rates.readOnlyHint'),
              historyTitle: t('editor.rates.historyTitle'),
              historyEmpty: t('editor.rates.historyEmpty'),
              showAll: t.raw('editor.rates.showAll') as string,
            },
            hourMeter: {
              sectionTitle: t('editor.hourMeter.sectionTitle'),
              current: t('editor.hourMeter.current'),
              newValue: t('editor.hourMeter.newValue'),
              hint: t('editor.hourMeter.hint'),
              reason: t('editor.hourMeter.reason'),
              delta: t('editor.hourMeter.delta'),
              submit: t('editor.hourMeter.submit'),
              historyTitle: t('editor.hourMeter.historyTitle'),
              historyEmpty: t('editor.hourMeter.historyEmpty'),
              loadMore: t('editor.hourMeter.loadMore'),
            },
            archive: {
              sectionTitle: t('editor.archive.sectionTitle'),
              archive: t('editor.archive.archive'),
              unarchive: t('editor.archive.unarchive'),
              confirmArchive: t('editor.archive.confirmArchive'),
              confirmUnarchive: t('editor.archive.confirmUnarchive'),
              confirmYes: t('editor.archive.confirmYes'),
              confirmCancel: t('editor.archive.confirmCancel'),
            },
            errors: {
              required: t('editor.errors.required'),
              generic: t('editor.errors.generic'),
              conflictRegistration: t('editor.errors.conflictRegistration'),
              conflictStatus: t('editor.errors.conflictStatus'),
              conflictRate: t('editor.errors.conflictRate'),
              invalidHourMeter: t('editor.errors.invalidHourMeter'),
              invalidPrice: t('editor.errors.invalidPrice'),
              invalidDate: t('editor.errors.invalidDate'),
              reasonRequired: t('editor.errors.reasonRequired'),
            },
          },
          toast: {
            created: t('toast.created'),
            updated: t('toast.updated'),
            archived: t('toast.archived'),
            unarchived: t('toast.unarchived'),
            setOutOfService: t('toast.setOutOfService'),
            returnedToService: t('toast.returnedToService'),
            hourMeterAdjusted: t('toast.hourMeterAdjusted'),
            rateAdded: t('toast.rateAdded'),
          },
        }}
      />
    </main>
  );
}
