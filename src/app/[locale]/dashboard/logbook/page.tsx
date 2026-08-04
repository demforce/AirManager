import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KPI } from '@/components/ui/kpi';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { formatCents } from '@/lib/money';
import type { FlightStatusDto, FlightTypeDto } from '@/lib/schemas/flights';
import { formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAircraft } from '@/server/services/aircraft.service';
import { getAirfieldBranding } from '@/server/services/app-settings.service';
import { getFlightTotals, listFlights } from '@/server/services/flights.service';
import { listPeople } from '@/server/services/people.service';
import { LogbookConsole, type LogbookFilters } from './logbook-console';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    dateFrom?: string;
    dateTo?: string;
    aircraftId?: string;
    personId?: string;
    personQuery?: string;
    instructorPersonId?: string;
    flightType?: string;
    status?: string;
  }>;
};

/** Form pickers' seed candidates (story TD-3) — same convention as the legacy `flights/page.tsx#OPTIONS_PAGE_SIZE`. */
const OPTIONS_PAGE_SIZE = 100;

/** The registry's own page size (story 5.4, NFR-6; unchanged by story 12.8). */
const FLIGHTS_PAGE_SIZE = 20;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FLIGHT_TYPES: readonly FlightTypeDto[] = ['TOURISM', 'SCHOOL', 'AERIAL_WORK'];
const FLIGHT_STATUSES: readonly FlightStatusDto[] = ['REGISTERED', 'CANCELLED'];

/** Hand-edited URL defense (same pattern as the legacy `flights/page.tsx#sanitizeDateParam`). */
function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

function sanitizeFlightType(value: string | undefined): FlightTypeDto | undefined {
  return value && (FLIGHT_TYPES as readonly string[]).includes(value) ? (value as FlightTypeDto) : undefined;
}

function sanitizeFlightStatus(value: string | undefined): FlightStatusDto | undefined {
  return value && (FLIGHT_STATUSES as readonly string[]).includes(value) ? (value as FlightStatusDto) : undefined;
}

/**
 * Logbook (story 12.8) — AirOps-native, replaces the legacy `/dashboard/flights`
 * (deleted by this story, hard, no redirect — ratifica utente 2). Same two
 * RBAC faces as before, decided by `flights.manage` (AD-5, `hasPermission`
 * here only decides what to RENDER — `listFlights` re-authorizes/re-scopes
 * regardless): an admin gets the full manager (filters, "Nuova voce",
 * Storna/Correggi); everyone else gets a read-only own-access registry
 * (period/tipo/stato only).
 *
 * KPI row + table "Totali" + header count (ratifica 3, review fix — MAJOR):
 * REGISTERED-only, TRUE totals over the WHOLE filtered set, via
 * `flights.service.ts#getFlightTotals` (one aggregate query, same RBAC/WHERE
 * as `listFlights`) — NOT the current page's items (a page-scoped sum was
 * misleading: filtering to a month and landing on page 1 showed page 1's
 * totals, not the month's). The pagination/table itself still shows only the
 * current page's <=20 rows.
 */
export default async function LogbookPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  const canManage = hasPermission(actor, 'flights.manage');
  if (!canManage && !hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }
  // Story 14.4, AC 2 (ratifica R4) — `flights.forceExpiry` (ADMIN-only), the
  // client-side mirror of the "Forza registrazione" gate (AD-5, `FlightEditor`'s
  // own doc-comment for the real server-side check).
  const canForceExpiry = hasPermission(actor, 'flights.forceExpiry');

  const dateFrom = sanitizeDateParam(sp.dateFrom);
  const dateTo = sanitizeDateParam(sp.dateTo);
  const flightType = sanitizeFlightType(sp.flightType);
  const status = sanitizeFlightStatus(sp.status);
  const aircraftId = canManage ? (sp.aircraftId || undefined) : undefined;
  const personId = canManage ? (sp.personId || undefined) : undefined;
  const personQuery = canManage ? (sp.personQuery || undefined) : undefined;
  const instructorPersonIdParam = sp.instructorPersonId || undefined;
  const instructorPersonId = canManage
    ? instructorPersonIdParam
    : instructorPersonIdParam && instructorPersonIdParam === actor.personId
      ? instructorPersonIdParam
      : undefined;

  const branding = await getAirfieldBranding();

  // Sequential (not `Promise.all`): concurrent `$transaction`s on the shared
  // driver-adapter Prisma client trigger a `pg` "client is already executing
  // a query" warning under load (5.1 Debug Log) — same order as the legacy page.
  let aircraftOptions: { id: string; registration: string }[] = [];
  // Story 14.3, AC 2: `profiles` (active-only, pilot/student) travels with
  // the person picker's options so `FlightEditor` can force/lock Tipo volo
  // to SCHOOL for a person with only an active student profile.
  let personOptions: { id: string; firstName: string; lastName: string; profiles: { pilot: boolean; student: boolean } }[] = [];
  let instructorOptions: { id: string; firstName: string; lastName: string }[] = [];
  let aircraftFilterOptions: { id: string; registration: string; archived: boolean }[] = [];

  if (canManage) {
    const aircraftResult = await listAircraft(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: true });
    const pilotStudentResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, profile: 'pilot-or-student', includeArchived: false });
    const instructorResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, profile: 'instructor', includeArchived: false });

    aircraftOptions = aircraftResult.items
      .filter((aircraft) => aircraft.archivedAt === null)
      .map((aircraft) => ({ id: aircraft.id, registration: aircraft.registration }));
    aircraftFilterOptions = aircraftResult.items.map((aircraft) => ({
      id: aircraft.id,
      registration: aircraft.registration,
      archived: aircraft.archivedAt !== null,
    }));
    personOptions = pilotStudentResult.items.map((person) => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      profiles: { pilot: person.profiles.pilot, student: person.profiles.student },
    }));
    instructorOptions = instructorResult.items.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
  }

  const flightsQuery = { pageSize: FLIGHTS_PAGE_SIZE, dateFrom, dateTo, aircraftId, personId, personQuery, instructorPersonId, flightType, status };
  let page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  let flightsResult = await listFlights(actor, { ...flightsQuery, page });
  const lastPage = Math.max(1, Math.ceil(flightsResult.total / FLIGHTS_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    flightsResult = await listFlights(actor, { ...flightsQuery, page });
  }
  const totalPages = Math.max(1, Math.ceil(flightsResult.total / FLIGHTS_PAGE_SIZE));

  // NOT `Promise.all` with `listFlights` above — same sequential constraint
  // documented for the aircraft/people options block above (Dev Notes:
  // concurrent queries on the shared driver-adapter Prisma client trigger a
  // pg "client is already executing a query" warning under load). `page` is
  // irrelevant to the aggregate itself (`getFlightTotals` never paginates) —
  // passed only to satisfy `ListFlightsQuery`'s required shape.
  const totals = await getFlightTotals(actor, { ...flightsQuery, page });

  // ISO-serialize (AD-8) — same fields as the legacy page.
  const items = flightsResult.items.map((flight) => ({
    ...flight,
    createdAt: flight.createdAt.toISOString(),
    cancelledAt: flight.cancelledAt ? flight.cancelledAt.toISOString() : null,
    takeoffAt: flight.takeoffAt ? flight.takeoffAt.toISOString() : null,
    landingAt: flight.landingAt ? flight.landingAt.toISOString() : null,
    // Story 14.4, AC 2 — same ISO-serialize treatment as the other `Date` fields.
    forcedAt: flight.forcedAt ? flight.forcedAt.toISOString() : null,
  }));

  const filters: LogbookFilters = {
    dateFrom: dateFrom ?? '',
    dateTo: dateTo ?? '',
    aircraftId: aircraftId ?? '',
    personId: personId ?? '',
    personQuery: personQuery ?? '',
    flightType: flightType ?? '',
    status: status ?? '',
  };

  const baseFilterQuery = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(aircraftId ? { aircraftId } : {}),
    ...(personId ? { personId } : {}),
    ...(personQuery ? { personQuery } : {}),
    ...(flightType ? { flightType } : {}),
    ...(status ? { status } : {}),
  };

  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const exportFilters = { ...baseFilterQuery, ...(instructorPersonId ? { instructorPersonId } : {}) };
  const exportHref = buildExportHref('/api/v1/flights', exportFilters, locale);
  const pdfExportHref = buildPdfExportHref('/api/v1/flights/pdf', exportFilters, locale);

  const t = await getTranslations('LogbookPage');

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>{t('title')}</h1>
          <div className="sub">{canManage ? t('sub', { count: totals.count }) : t('subOwn', { count: totals.count })}</div>
        </div>
      </div>

      {instructorPersonId ? (
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--panel-2)',
            padding: '8px 14px',
            fontSize: 13,
          }}
          data-testid="flight-instructor-filter-banner"
        >
          <span>{t('filters.instructorActive')}</span>
          <Link href={{ pathname: '/dashboard/logbook', query: baseFilterQuery }} locale={locale as AppLocale} data-testid="flight-instructor-filter-clear" className="fld-label" style={{ textTransform: 'none', textDecoration: 'underline' }}>
            {t('filters.instructorClear')}
          </Link>
        </div>
      ) : null}

      <div className="kpi-row">
        <KPI label={t('kpi.entries')} value={totals.count} />
        <KPI label={t('kpi.hours')} value={formatMinutes(totals.minutes)} />
        <KPI label={t('kpi.movements')} value={`${totals.takeoffs} / ${totals.landings}`} />
        <KPI label={t('kpi.revenue')} value={formatCents(totals.revenueCents, displayLocale)} />
      </div>

      <LogbookConsole
        key={JSON.stringify({ page, ...exportFilters })}
        canManage={canManage}
        canForceExpiry={canForceExpiry}
        items={items}
        totals={totals}
        page={page}
        totalPages={totalPages}
        filters={filters}
        instructorPersonId={instructorPersonId ?? ''}
        aircraftOptions={aircraftOptions}
        personOptions={personOptions}
        instructorOptions={instructorOptions}
        aircraftFilterOptions={aircraftFilterOptions}
        airfieldName={branding.name}
        moneyLocale={displayLocale}
        locale={displayLocale}
        exportHref={exportHref}
        pdfExportHref={pdfExportHref}
        labels={{
          cardTitle: t('cardTitle'),
          newEntry: t('newEntry'),
          empty: t('table.empty'),
          exportMenu: { label: t('exportMenu.label'), xlsLabel: t('exportMenu.xlsLabel'), pdfLabel: t('exportMenu.pdfLabel') },
          pagination: { prev: '←', next: '→' },
          flightTypes: { private: t('flightTypes.private'), school: t('flightTypes.school'), other: t('flightTypes.other') },
          table: {
            date: t('table.date'),
            route: t('table.route'),
            pilot: t('table.pilot'),
            aircraft: t('table.aircraft'),
            type: t('table.type'),
            hours: t('table.hours'),
            takeoffs: t('table.takeoffs'),
            landings: t('table.landings'),
            amount: t('table.amount'),
            pic: t('table.pic'),
            actions: t('table.actions'),
            totals: t('table.totals'),
            soloSuffix: t('table.soloSuffix'),
            noInstructor: t('table.noInstructor'),
            noValue: t('table.noValue'),
            statusCancelled: t('table.statusCancelled'),
            cancelledDetail: t.raw('table.cancelledDetail') as string,
            correctionOf: t('table.correctionOf'),
            correctedBy: t('table.correctedBy'),
            cancelAction: t('table.cancelAction'),
            correctAction: t('table.correctAction'),
            forcedBadge: t('table.forcedBadge'),
            // `t.raw`: the {reason} placeholder is filled CLIENT-side (same
            // reasoning as `editor.fields.studentOnlyCorrectionHint` below).
            forcedDetail: t.raw('table.forcedDetail'),
          },
          filters: {
            dateFrom: t('filters.dateFrom'),
            dateTo: t('filters.dateTo'),
            aircraft: t('filters.aircraft'),
            allAircraft: t('filters.allAircraft'),
            person: t('filters.person'),
            personSearchPlaceholder: t('filters.personSearchPlaceholder'),
            flightType: t('filters.flightType'),
            allTypes: t('filters.allTypes'),
            status: t('filters.status'),
            allStatuses: t('filters.allStatuses'),
            statusOptions: { registered: t('filters.statusOptions.registered'), cancelled: t('filters.statusOptions.cancelled') },
            archivedSuffix: t('filters.archivedSuffix'),
            reset: t('filters.reset'),
          },
          editor: {
            newTitle: t('editor.newTitle'),
            newSubtitle: t('editor.newSubtitle'),
            correctTitle: t('editor.correctTitle'),
            closeLabel: t('editor.closeLabel'),
            cancel: t('editor.cancel'),
            submit: t('editor.submit'),
            correctSubmit: t('editor.correctSubmit'),
            correctReason: t('editor.correctReason'),
            requiredReason: t('editor.requiredReason'),
            conflictError: t('editor.conflictError'),
            requiredField: t('editor.requiredField'),
            invalidHourMeter: t('editor.invalidHourMeter'),
            fields: {
              aircraft: t('editor.fields.aircraft'),
              noAircraftAvailable: t('editor.fields.noAircraftAvailable'),
              person: t('editor.fields.person'),
              noPersonAvailable: t('editor.fields.noPersonAvailable'),
              instructor: t('editor.fields.instructor'),
              noInstructor: t('editor.fields.noInstructor'),
              flightDate: t('editor.fields.flightDate'),
              flightType: t('editor.fields.flightType'),
              soloMode: t('editor.fields.soloMode'),
              soloModes: { dual: t('editor.fields.soloModes.dual'), solo: t('editor.fields.soloModes.solo') },
              studentOnlyHint: t('editor.fields.studentOnlyHint'),
              // `t.raw`: the {type} placeholder is filled CLIENT-side by the editor —
              // plain `t()` fails ICU formatting and renders the key path instead
              // (lezione fix post-epic-13, HANDOFF).
              studentOnlyCorrectionHint: t.raw('editor.fields.studentOnlyCorrectionHint'),
              departure: t('editor.fields.departure'),
              arrival: t('editor.fields.arrival'),
              takeoffTime: t('editor.fields.takeoffTime'),
              landingTime: t('editor.fields.landingTime'),
              computedDuration: t('editor.fields.computedDuration'),
              takeoffs: t('editor.fields.takeoffs'),
              landings: t('editor.fields.landings'),
              hourMeterStart: t('editor.fields.hourMeterStart'),
              hourMeterEnd: t('editor.fields.hourMeterEnd'),
              notes: t('editor.fields.notes'),
            },
            flightTypes: { private: t('flightTypes.private'), school: t('flightTypes.school'), other: t('flightTypes.other') },
            errors: {
              HOUR_METER_INVALID: t('editor.errors.HOUR_METER_INVALID'),
              FLIGHT_TIMES_INVALID: t('editor.errors.FLIGHT_TIMES_INVALID'),
              NO_AIRCRAFT_RATE: t('editor.errors.NO_AIRCRAFT_RATE'),
              NO_INSTRUCTOR_RATE: t('editor.errors.NO_INSTRUCTOR_RATE'),
              SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR: t('editor.errors.SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR'),
              SOLO_REQUIRES_SCHOOL: t('editor.errors.SOLO_REQUIRES_SCHOOL'),
              STUDENT_FLIGHT_MUST_BE_SCHOOL: t('editor.errors.STUDENT_FLIGHT_MUST_BE_SCHOOL'),
              AIRCRAFT_ARCHIVED: t('editor.errors.AIRCRAFT_ARCHIVED'),
              PERSON_ARCHIVED: t('editor.errors.PERSON_ARCHIVED'),
              PERSON_NOT_PILOT_OR_STUDENT: t('editor.errors.PERSON_NOT_PILOT_OR_STUDENT'),
              INSTRUCTOR_NOT_FOUND: t('editor.errors.INSTRUCTOR_NOT_FOUND'),
              INSTRUCTOR_SAME_AS_PILOT: t('editor.errors.INSTRUCTOR_SAME_AS_PILOT'),
              FLIGHT_DATE_IN_FUTURE: t('editor.errors.FLIGHT_DATE_IN_FUTURE'),
              // `t.raw`: the {documents} placeholder is filled CLIENT-side
              // (same reasoning as `fields.studentOnlyCorrectionHint` above).
              FLIGHT_BLOCKED_BY_EXPIRY: t.raw('editor.errors.FLIGHT_BLOCKED_BY_EXPIRY'),
              // Review F5/F6 — `{date}` filled CLIENT-side, same reasoning.
              documentExpiredOn: t.raw('editor.errors.documentExpiredOn'),
              documentMissing: t('editor.errors.documentMissing'),
              documentRolePerson: t('editor.errors.documentRolePerson'),
              documentRoleInstructor: t('editor.errors.documentRoleInstructor'),
              generic: t('editor.errors.generic'),
            },
            result: {
              title: t('editor.result.title'),
              minutes: t('editor.result.minutes'),
              aircraftRate: t('editor.result.aircraftRate'),
              aircraftAmount: t('editor.result.aircraftAmount'),
              instructorRate: t('editor.result.instructorRate'),
              instructorAmount: t('editor.result.instructorAmount'),
              total: t('editor.result.total'),
              newBalance: t('editor.result.newBalance'),
              balanceAlert: t('editor.result.balanceAlert'),
              // Review F11 — `{reason}` filled CLIENT-side, same reasoning.
              forcedNotice: t.raw('editor.result.forcedNotice'),
            },
            picker: { placeholder: t('picker.placeholder'), noResults: t('picker.noResults') },
            force: {
              title: t('editor.force.title'),
              description: t('editor.force.description'),
              reasonLabel: t('editor.force.reasonLabel'),
              submit: t('editor.force.submit'),
              cancel: t('editor.force.cancel'),
              requiredReason: t('editor.force.requiredReason'),
              generic: t('editor.force.generic'),
            },
          },
          mobile: {
            openDetail: t('mobile.openDetail'),
            close: t('mobile.close'),
            back: t('mobile.back'),
            route: t('mobile.route'),
            instructor: t('mobile.instructor'),
            takeoffs: t('mobile.takeoffs'),
            landings: t('mobile.landings'),
            times: t('mobile.times'),
            hourMeter: t('mobile.hourMeter'),
            notes: t('mobile.notes'),
            lineage: t('mobile.lineage'),
            correctionBadge: t('mobile.correctionBadge'),
            statusAll: t('mobile.statusAll'),
            filters: t('mobile.filters'),
            // `t.raw`: the {count} placeholder is filled CLIENT-side (same
            // reasoning as `table.forcedDetail` above).
            filtersCount: t.raw('mobile.filtersCount'),
            filtersTitle: t('mobile.filtersTitle'),
            apply: t('mobile.apply'),
          },
          cancelModal: {
            title: t('cancelModal.title'),
            reason: t('cancelModal.reason'),
            requiredReason: t('cancelModal.requiredReason'),
            submit: t('cancelModal.submit'),
            close: t('cancelModal.close'),
            conflictError: t('cancelModal.conflictError'),
            genericError: t('cancelModal.genericError'),
            success: t('cancelModal.success'),
          },
        }}
      />
    </main>
  );
}
