import { getTranslations, setRequestLocale } from 'next-intl/server';
import { parseDateOnlyUtc, toDateOnlyString } from '@/lib/date-only';
import { buildExportHref } from '@/lib/export-href';
import { APP_TIMEZONE } from '@/lib/time';
import { todayDateOnlyUtcInZone } from '@/lib/zoned-time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { redirect } from '@/i18n/navigation';
import { listAircraft, listOutOfServiceAircraft, sumFlightMinutesByAircraft } from '@/server/services/aircraft.service';
import { listReservedAircraftIds } from '@/server/services/bookings.service';
import { getEffectiveRates, getNextScheduledRates } from '@/server/services/rates.service';
import { FleetConsole, type FleetConsoleItem } from './fleet-console';

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
  // Story 19.3 (D-8, A16): the Europe/Rome day — the same "today" the editor's
  // "In vigore da" minimum and the server's `RATE_VALID_FROM_IN_PAST` use, so
  // the price placeholders never speak of yesterday between 00:00 and 02:00.
  const today = todayDateOnlyUtcInZone(APP_TIMEZONE);
  const now = new Date();
  // Story 15.5 (R-15.5-b): the phone card's hours bar. Batched over the ids of
  // THIS page, exactly like the readers beside it — the window is the
  // current calendar month, and the card's own caption names it.
  const monthStart = parseDateOnlyUtc(`${toDateOnlyString(today).slice(0, 7)}-01`);
  // Story 19.2 (R-19-b): the aircraft's hours (sheet row + editor readout) —
  // the same aggregate with no window at all (a flight is never in the
  // future, so no upper bound is needed).
  const [currentRatesById, scheduledRatesById, reservedIds, monthMinutesById, totalMinutesById] = await Promise.all([
    getEffectiveRates(actor, ids, today),
    // Story 19.3 (Q-19.3-d): the next scheduled rate, the editor's one line.
    getNextScheduledRates(actor, ids, today),
    listReservedAircraftIds(actor, ids, now),
    sumFlightMinutesByAircraft(actor, ids, monthStart, today),
    sumFlightMinutesByAircraft(actor, ids, null, null),
  ]);

  const totalCount = fleetTotalResult.total;
  const aogCount = outOfServiceAircraft.length;
  const availableCount = Math.max(0, totalCount - aogCount);

  const t = await getTranslations('AircraftPage');
  const tExport = await getTranslations('Export');
  const totalPages = Math.max(1, Math.ceil(aircraftResult.total / PAGE_SIZE));

  const exportHref = buildExportHref('/api/v1/aircraft', { q, includeArchived: includeArchived ? 'true' : undefined }, locale);

  const items: FleetConsoleItem[] = aircraftResult.items.map((aircraft) => {
    const currentRate = currentRatesById.get(aircraft.id) ?? null;
    const scheduledRate = scheduledRatesById.get(aircraft.id) ?? null;
    return {
      id: aircraft.id,
      registration: aircraft.registration,
      type: aircraft.type,
      model: aircraft.model,
      status: aircraft.status,
      statusReason: aircraft.statusReason,
      // Story AOG-1a — already `YYYY-MM-DD` off the service DTO (same `@db.Date`
      // wire convention as `AircraftRateListItem.validFrom`), so no conversion here.
      outOfServiceUntil: aircraft.outOfServiceUntil,
      archivedAt: aircraft.archivedAt ? aircraft.archivedAt.toISOString() : null,
      currentRate: currentRate && { studentPriceCents: currentRate.studentPriceCents, pilotPriceCents: currentRate.pilotPriceCents },
      scheduledRate: scheduledRate && {
        studentPriceCents: scheduledRate.studentPriceCents,
        pilotPriceCents: scheduledRate.pilotPriceCents,
        validFrom: scheduledRate.validFrom,
      },
      reserved: reservedIds.has(aircraft.id),
    };
  });

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
        exportHref={exportHref}
        locale={locale as 'it' | 'en'}
        monthMinutesById={Object.fromEntries(monthMinutesById)}
        totalMinutesById={Object.fromEntries(totalMinutesById)}
        labels={{
          cardTitle: t('cardTitle'),
          searchPlaceholder: t('searchPlaceholder'),
          includeArchivedLabel: t('includeArchivedLabel'),
          empty: t('empty'),
          newAircraft: t('newAircraft'),
          exportLabel: tExport('button'),
          exportXls: t('exportMenu.xlsLabel'),
          pagination: { prev: t('pagination.prev'), next: t('pagination.next') },
          badge: {
            aog: t('badge.aog'),
            reserved: t('badge.reserved'),
            available: t('badge.available'),
            archived: t('badge.archived'),
          },
          mobile: {
            monthHours: t('mobile.monthHours'),
            openDetail: t('mobile.openDetail'),
            close: t('mobile.close'),
            edit: t('mobile.edit'),
            sheet: {
              status: t('mobile.sheet.status'),
              aogReason: t('mobile.sheet.aogReason'),
              totalHours: t('mobile.sheet.totalHours'),
              monthHours: t('mobile.sheet.monthHours'),
            },
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
            },
            availability: {
              sectionTitle: t('editor.availability.sectionTitle'),
              current: t('editor.availability.current'),
              setOutOfService: t('editor.availability.setOutOfService'),
              until: t('editor.availability.until'),
              untilHint: t('editor.availability.untilHint'),
              untilValue: t.raw('editor.availability.untilValue') as string,
              untilUnknown: t('editor.availability.untilUnknown'),
              returnToService: t('editor.availability.returnToService'),
              reason: t('editor.availability.reason'),
              confirm: t('editor.availability.confirm'),
              confirmReturnToService: t('editor.availability.confirmReturnToService'),
              // Review MAJOR-2: the question that now stands in FRONT of the
              // confirm/cancel pair, so the Conferma no longer appears under the
              // click point of the trigger that armed it.
              confirmQuestionUnknown: t('editor.availability.confirmQuestionUnknown'),
              // Story AOG-1b — `t.raw` for every template carrying a
              // client-interpolated placeholder (same convention as
              // `rates.currentHint`): the count and the date are only known in
              // the browser. The sentences that inflect on the count are ICU
              // plurals the editor formats itself (story 19.12a).
              impactSplit: t.raw('editor.availability.impactSplit') as string,
              impactWindowUntil: t.raw('editor.availability.impactWindowUntil') as string,
              impactWindowUndelimited: t('editor.availability.impactWindowUndelimited'),
              impactWindowOverdue: t.raw('editor.availability.impactWindowOverdue') as string,
              impactEstimate: t('editor.availability.impactEstimate'),
              impactBookingsLink: t('editor.availability.impactBookingsLink'),
            },
            rates: {
              sectionTitle: t('editor.rates.sectionTitle'),
              studentPrice: t('editor.rates.studentPrice'),
              pilotPrice: t('editor.rates.pilotPrice'),
              validFrom: t('editor.rates.validFrom'),
              currentHint: t.raw('editor.rates.currentHint') as string,
              noCurrentRate: t('editor.rates.noCurrentRate'),
              scheduled: t.raw('editor.rates.scheduled') as string,
              readOnlyHint: t('editor.rates.readOnlyHint'),
            },
            flightHours: {
              sectionTitle: t('editor.flightHours.sectionTitle'),
              total: t('editor.flightHours.total'),
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
              aircraftArchived: t('editor.errors.aircraftArchived'),
              conflictStatus: t('editor.errors.conflictStatus'),
              invalidPrice: t('editor.errors.invalidPrice'),
              invalidDate: t('editor.errors.invalidDate'),
              validFromPast: t('editor.errors.validFromPast'),
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
          },
        }}
      />
    </main>
  );
}
