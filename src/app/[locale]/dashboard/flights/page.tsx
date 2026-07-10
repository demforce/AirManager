import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { FlightStatusDto, FlightTypeDto } from '@/lib/schemas/flights';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAircraft } from '@/server/services/aircraft.service';
import { listFlights } from '@/server/services/flights.service';
import { listPeople } from '@/server/services/people.service';
import { FlightsManager, type FlightsFilters } from './flights-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    dateFrom?: string;
    dateTo?: string;
    aircraftId?: string;
    personId?: string;
    instructorPersonId?: string;
    flightType?: string;
    status?: string;
  }>;
};

/**
 * How many candidates the aircraft/person/instructor pickers SEED with —
 * story TD-3 (AC 1): these are now only the `SearchCombobox`'s
 * `initialOptions` (shown on focus with zero extra fetches, filtered
 * client-side as an optimistic placeholder while typing), NOT the complete
 * set — a query beyond this first page is answered by the pickers'
 * server-side typeahead (`GET /api/v1/aircraft`/`GET /api/v1/people`'s `q`),
 * never truncated silently (finding 5.4 D1, closed by this story).
 */
const OPTIONS_PAGE_SIZE = 100;

/** The registry's own page size (story 5.4, NFR-6) — same convention as `FinancePage`'s cash register. */
const FLIGHTS_PAGE_SIZE = 20;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FLIGHT_TYPES: readonly FlightTypeDto[] = ['TOURISM', 'SCHOOL', 'AERIAL_WORK'];
const FLIGHT_STATUSES: readonly FlightStatusDto[] = ['REGISTERED', 'CANCELLED'];

/** Hand-edited URL defense: only a well-formed `YYYY-MM-DD` reaches the service (same pattern as `FinancePage`'s `sanitizeDateParam`). */
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
 * Flight registry (epic 5, story 5.1 Task 5; story 5.4 Task 2, AC 1/2/3;
 * FR-9/FR-14/FR-15/FR-17) — two faces of the SAME page, decided by
 * `flights.manage`:
 *
 * - **Staff/admin** (`canManage`): the full manager unchanged from 5.1/5.3
 *   (the "Registra volo" form, per-row Annulla/Correggi) PLUS the new filter
 *   bar (period/velivolo/persona/tipo/stato).
 * - **Everyone else** (own-access, `self.read` — every role holds it, so the
 *   nav item now opens to all): a READ-ONLY registry of just the actor's own
 *   flights (as the flight's person OR its instructor), with a filter bar
 *   limited to period/tipo/stato (Contesto: no `listAircraft`/`listPeople`
 *   picker to source the other two from without a staff-only endpoint).
 *
 * `hasPermission` here only decides what to RENDER (AD-5) — `listFlights`
 * re-authorizes and re-scopes regardless, so a hand-edited `?personId=`/
 * `?aircraftId=` from a non-staff session is simply dropped before it ever
 * reaches the service (never forwarded for a non-`canManage` actor).
 */
export default async function FlightsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  const canManage = hasPermission(actor, 'flights.manage');
  // Defensive only (story 5.4: every role holds `self.read`) — an actor with
  // neither permission (e.g. no roles at all) never reaches `listFlights`,
  // which would otherwise answer 403 (AD-5 is the real guardian either way).
  if (!canManage && !hasPermission(actor, 'self.read')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const dateFrom = sanitizeDateParam(sp.dateFrom);
  const dateTo = sanitizeDateParam(sp.dateTo);
  const flightType = sanitizeFlightType(sp.flightType);
  const status = sanitizeFlightStatus(sp.status);
  // Own-access actors have no picker to source these from (Dev Notes) — a
  // hand-edited `?aircraftId=`/`?personId=` on their URL is simply dropped
  // here, never forwarded to `listFlights` (which would 403 a `personId` for
  // anyone but themselves, AC 4 — this page never lets that happen by
  // accident).
  const aircraftId = canManage ? (sp.aircraftId || undefined) : undefined;
  const personId = canManage ? (sp.personId || undefined) : undefined;
  // Story 9.3 (AC 4): UNLIKE aircraftId/personId above (staff-only), a
  // non-staff actor MAY use this filter — but only on their OWN personId
  // (the "Le mie ore scuola"/"Apri nel registro" drill-down from the school
  // hour summaries). Anyone else's id is dropped here, never forwarded —
  // `listFlights` would 403 it anyway, but a non-staff actor who never asked
  // for someone else's data should never see that 403 surface.
  const instructorPersonIdParam = sp.instructorPersonId || undefined;
  const instructorPersonId = canManage
    ? instructorPersonIdParam
    : instructorPersonIdParam && instructorPersonIdParam === actor.personId
      ? instructorPersonIdParam
      : undefined;

  // Sequential, not `Promise.all` (5.1 Debug Log: concurrent `$transaction`s
  // on the shared driver-adapter Prisma client trigger a `pg` "client is
  // already executing a query" warning under load) — aircraft/people (staff
  // only) load first, flights last, same order as 5.1.
  let aircraftOptions: { id: string; registration: string }[] = [];
  let personOptions: { id: string; firstName: string; lastName: string }[] = [];
  let instructorOptions: { id: string; firstName: string; lastName: string }[] = [];
  let aircraftFilterOptions: { id: string; registration: string; archived: boolean }[] = [];
  let personFilterOptions: { id: string; firstName: string; lastName: string; archived: boolean }[] = [];

  if (canManage) {
    // `includeArchived: true` on the FILTER sources: the filter pickers need
    // the full history (Dev Notes: "incl. archiviati per consultare lo
    // storico"). The FORM pickers' `initialOptions` instead come from the
    // profile-filtered queries below (review TD-3 D2): deriving them from
    // the first unfiltered page re-created the 5.4 D1 silent-miss class —
    // if the first 100 people by lastName held zero active pilot/student,
    // the person picker rendered disabled even though eligible people
    // existed past the cap. With the profile-filtered query, page 1 is
    // empty IFF the whole filtered set is empty, so the pickers' disabled
    // gating (`options.length === 0`) is exact again.
    const aircraftResult = await listAircraft(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: true });
    const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: true });
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
    personOptions = pilotStudentResult.items.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
    instructorOptions = instructorResult.items.map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
    personFilterOptions = peopleResult.items.map((person) => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      archived: person.archivedAt !== null,
    }));
  }

  const flightsQuery = { pageSize: FLIGHTS_PAGE_SIZE, dateFrom, dateTo, aircraftId, personId, instructorPersonId, flightType, status };
  let page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  let flightsResult = await listFlights(actor, { ...flightsQuery, page });
  // Clamp an out-of-range ?page to the last real page (same pattern as `FinancePage`).
  const lastPage = Math.max(1, Math.ceil(flightsResult.total / FLIGHTS_PAGE_SIZE));
  if (page > lastPage) {
    page = lastPage;
    flightsResult = await listFlights(actor, { ...flightsQuery, page });
  }
  const totalPages = Math.max(1, Math.ceil(flightsResult.total / FLIGHTS_PAGE_SIZE));

  // `createdAt`/`cancelledAt` serialized to ISO (AD-8) — the service's `Date`
  // cannot cross the server/client boundary as-is (same pattern as 5.1/5.3).
  const initialFlights = flightsResult.items.map((flight) => ({
    ...flight,
    createdAt: flight.createdAt.toISOString(),
    cancelledAt: flight.cancelledAt ? flight.cancelledAt.toISOString() : null,
  }));

  const filters: FlightsFilters = {
    dateFrom: dateFrom ?? '',
    dateTo: dateTo ?? '',
    aircraftId: aircraftId ?? '',
    personId: personId ?? '',
    flightType: flightType ?? '',
    status: status ?? '',
  };

  // Shared by every filter/pagination link EXCEPT the instructor chip's own
  // "Rimuovi" action below (AC 4's "azione di rimozione").
  const baseFilterQuery = {
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(aircraftId ? { aircraftId } : {}),
    ...(personId ? { personId } : {}),
    ...(flightType ? { flightType } : {}),
    ...(status ? { status } : {}),
  };
  const filterQuery = { ...baseFilterQuery, ...(instructorPersonId ? { instructorPersonId } : {}) };

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/flights', query: { page: targetPage, ...filterQuery } };
  }

  const t = await getTranslations('FlightsPage');
  const tExport = await getTranslations('Export');

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
              {canManage ? t('title') : t('titleOwn')}
            </h1>
            <p className="mt-2 max-w-xl text-base leading-[1.6] text-[#787774]">{canManage ? t('description') : t('descriptionOwn')}</p>
          </div>
          <Link
            href="/dashboard"
            locale={locale as AppLocale}
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {t('backToDashboard')}
          </Link>
        </div>

        {instructorPersonId ? (
          <div
            className="mt-6 flex flex-wrap items-center gap-3 rounded-[8px] border border-[#EAEAEA] bg-[#F7F6F3] px-4 py-2 text-sm text-[#2F3437]"
            data-testid="flight-instructor-filter-banner"
          >
            <span>{t('filters.instructorActive')}</span>
            <Link
              href={{ pathname: '/dashboard/flights', query: baseFilterQuery }}
              locale={locale as AppLocale}
              data-testid="flight-instructor-filter-clear"
              className="font-medium underline-offset-4 hover:underline"
            >
              {t('filters.instructorClear')}
            </Link>
          </div>
        ) : null}

        <div className="mt-10">
          <FlightsManager
            // Remounts on every filter/page navigation (story 5.4): the
            // parent server component re-queries and passes fresh
            // `initialFlights`, and this `key` forces the client component's
            // OWN local state (the optimistic register/cancel/correct
            // patches) to start clean from it rather than keep stale rows
            // from a previous filter/page (same remount-on-identity-change
            // idiom already used by `RegisterFlightForm`'s own `key`).
            key={JSON.stringify({ page, ...filterQuery })}
            canManage={canManage}
            aircraftOptions={aircraftOptions}
            personOptions={personOptions}
            instructorOptions={instructorOptions}
            aircraftFilterOptions={aircraftFilterOptions}
            personFilterOptions={personFilterOptions}
            initialFlights={initialFlights}
            moneyLocale={locale === 'en' ? 'en' : 'it'}
            filters={filters}
            exportLabel={tExport('button')}
            labels={{
              form: {
                title: t('form.title'),
                aircraft: t('form.aircraft'),
                noAircraftAvailable: t('form.noAircraftAvailable'),
                person: t('form.person'),
                noPersonAvailable: t('form.noPersonAvailable'),
                instructor: t('form.instructor'),
                noInstructor: t('form.noInstructor'),
                flightDate: t('form.flightDate'),
                flightType: t('form.flightType'),
                flightTypes: {
                  private: t('form.flightTypes.private'),
                  school: t('form.flightTypes.school'),
                  other: t('form.flightTypes.other'),
                },
                soloMode: t('form.soloMode'),
                soloModes: {
                  dual: t('form.soloModes.dual'),
                  solo: t('form.soloModes.solo'),
                },
                durationMode: t('form.durationMode'),
                durationModes: {
                  minutes: t('form.durationModes.minutes'),
                  hourMeter: t('form.durationModes.hourMeter'),
                },
                minutes: t('form.minutes'),
                hourMeterStart: t('form.hourMeterStart'),
                hourMeterEnd: t('form.hourMeterEnd'),
                landings: t('form.landings'),
                notes: t('form.notes'),
                submit: t('form.submit'),
                requiredField: t('form.requiredField'),
                invalidMinutes: t('form.invalidMinutes'),
                invalidHourMeter: t('form.invalidHourMeter'),
                errors: {
                  HOUR_METER_INVALID: t('form.errors.HOUR_METER_INVALID'),
                  NO_AIRCRAFT_RATE: t('form.errors.NO_AIRCRAFT_RATE'),
                  NO_INSTRUCTOR_RATE: t('form.errors.NO_INSTRUCTOR_RATE'),
                  SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR: t('form.errors.SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR'),
                  SOLO_REQUIRES_SCHOOL: t('form.errors.SOLO_REQUIRES_SCHOOL'),
                  AIRCRAFT_ARCHIVED: t('form.errors.AIRCRAFT_ARCHIVED'),
                  PERSON_ARCHIVED: t('form.errors.PERSON_ARCHIVED'),
                  PERSON_NOT_PILOT_OR_STUDENT: t('form.errors.PERSON_NOT_PILOT_OR_STUDENT'),
                  INSTRUCTOR_NOT_FOUND: t('form.errors.INSTRUCTOR_NOT_FOUND'),
                  INSTRUCTOR_SAME_AS_PILOT: t('form.errors.INSTRUCTOR_SAME_AS_PILOT'),
                  FLIGHT_DATE_IN_FUTURE: t('form.errors.FLIGHT_DATE_IN_FUTURE'),
                  generic: t('form.errors.generic'),
                },
              },
              result: {
                title: t('result.title'),
                minutes: t('result.minutes'),
                aircraftRate: t('result.aircraftRate'),
                aircraftAmount: t('result.aircraftAmount'),
                instructorRate: t('result.instructorRate'),
                instructorAmount: t('result.instructorAmount'),
                packageCovered: t('result.packageCovered'),
                chargedMinutes: t('result.chargedMinutes'),
                total: t('result.total'),
                newBalance: t('result.newBalance'),
              },
              list: {
                heading: t('list.heading'),
                empty: t('list.empty'),
                table: {
                  date: t('list.table.date'),
                  aircraft: t('list.table.aircraft'),
                  person: t('list.table.person'),
                  instructor: t('list.table.instructor'),
                  noInstructor: t('list.table.noInstructor'),
                  type: t('list.table.type'),
                  soloSuffix: t('list.table.soloSuffix'),
                  duration: t('list.table.duration'),
                  amount: t('list.table.amount'),
                  landings: t('list.table.landings'),
                  noValue: t('list.table.noValue'),
                  // `t.raw`: literal `{duration}` placeholder, CLIENT-filled
                  // (same pattern as account-statement-table.tsx's `adjustmentOfDate`).
                  packageNote: t.raw('list.table.packageNote') as string,
                  status: t('list.table.status'),
                  statusCancelled: t('list.table.statusCancelled'),
                  // `t.raw`: literal `{date}`/`{reason}` placeholders, CLIENT-filled (same pattern as `packageNote`).
                  cancelledDetail: t.raw('list.table.cancelledDetail') as string,
                  correctionOf: t('list.table.correctionOf'),
                  correctedBy: t('list.table.correctedBy'),
                  actions: t('list.table.actions'),
                  cancelAction: t('list.table.cancelAction'),
                  correctAction: t('list.table.correctAction'),
                },
              },
              cancelPanel: {
                title: t('cancelPanel.title'),
                reason: t('cancelPanel.reason'),
                requiredReason: t('cancelPanel.requiredReason'),
                submit: t('cancelPanel.submit'),
                close: t('cancelPanel.close'),
                conflictError: t('cancelPanel.conflictError'),
                genericError: t('cancelPanel.genericError'),
                success: t('cancelPanel.success'),
              },
              correctPanel: {
                title: t('correctPanel.title'),
                reason: t('correctPanel.reason'),
                requiredReason: t('correctPanel.requiredReason'),
                submit: t('correctPanel.submit'),
                exit: t('correctPanel.exit'),
                conflictError: t('correctPanel.conflictError'),
              },
              filters: {
                dateFrom: t('filters.dateFrom'),
                dateTo: t('filters.dateTo'),
                aircraft: t('filters.aircraft'),
                allAircraft: t('filters.allAircraft'),
                person: t('filters.person'),
                allPeople: t('filters.allPeople'),
                flightType: t('filters.flightType'),
                allTypes: t('filters.allTypes'),
                status: t('filters.status'),
                allStatuses: t('filters.allStatuses'),
                statusOptions: {
                  registered: t('filters.statusOptions.registered'),
                  cancelled: t('filters.statusOptions.cancelled'),
                },
                archivedSuffix: t('filters.archivedSuffix'),
                reset: t('filters.reset'),
              },
              picker: {
                placeholder: t('searchPlaceholder'),
                noResults: t('noResults'),
              },
            }}
          />

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
              <span data-testid="flight-pagination-status">
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
      </div>
    </main>
  );
}
