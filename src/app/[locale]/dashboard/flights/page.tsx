import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { listAircraft } from '@/server/services/aircraft.service';
import { listFlights } from '@/server/services/flights.service';
import { listPeople } from '@/server/services/people.service';
import { FlightsManager } from './flights-manager';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** How many candidates the aircraft/person/instructor pickers load — same "small admin-managed list" cap as `packages/page.tsx`'s `activeAircraftResult`. */
const OPTIONS_PAGE_SIZE = 100;

/** How many recent flights the landing list shows — no pagination yet (Dev Notes: story 5.4 owns the full filterable registry). */
const RECENT_FLIGHTS_PAGE_SIZE = 20;

/**
 * Flight logging with automatic charges (epic 5, story 5.1, Task 5; FR-9/
 * FR-14/FR-15) — `flights.manage` (staff/admin) only; `hasPermission` here
 * only decides whether to *redirect* (AD-5: `registerFlight`/`listFlights`
 * re-check their own `authorize()` regardless). Only ACTIVE aircraft and
 * people with an active pilot/student profile are offered in the pickers
 * (`PersonListItem.profiles`, story 2.2); the instructor picker is people
 * with an active instructor profile — the service still re-validates all of
 * this server-side (AC 3).
 */
export default async function FlightsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'flights.manage')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  // Sequential, not `Promise.all` (unlike `AircraftPage`'s per-row rate
  // lookups): each of these already opens its own `$transaction` internally
  // (`listAircraft`/`listFlights`), and firing three concurrently against the
  // shared driver-adapter Prisma client triggered a `pg` "client is already
  // executing a query" deprecation warning under load — sequential awaits
  // are the same conservative pattern most other dashboard pages already use.
  const aircraftResult = await listAircraft(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });
  const peopleResult = await listPeople(actor, { page: 1, pageSize: OPTIONS_PAGE_SIZE, includeArchived: false });
  const flightsResult = await listFlights(actor, { page: 1, pageSize: RECENT_FLIGHTS_PAGE_SIZE });

  const aircraftOptions = aircraftResult.items.map((aircraft) => ({ id: aircraft.id, registration: aircraft.registration }));
  const personOptions = peopleResult.items
    .filter((person) => person.profiles.pilot || person.profiles.student)
    .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
  const instructorOptions = peopleResult.items
    .filter((person) => person.profiles.instructor)
    .map((person) => ({ id: person.id, firstName: person.firstName, lastName: person.lastName }));
  // `createdAt` serialized to ISO (AD-8) — the service's `Date` cannot cross
  // the server/client boundary as-is (same pattern as `AircraftPage`'s `archivedAt`).
  const initialFlights = flightsResult.items.map((flight) => ({ ...flight, createdAt: flight.createdAt.toISOString() }));

  const t = await getTranslations('FlightsPage');

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
          <FlightsManager
            aircraftOptions={aircraftOptions}
            personOptions={personOptions}
            instructorOptions={instructorOptions}
            initialFlights={initialFlights}
            moneyLocale={locale === 'en' ? 'en' : 'it'}
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
                  duration: t('list.table.duration'),
                  amount: t('list.table.amount'),
                  landings: t('list.table.landings'),
                  noValue: t('list.table.noValue'),
                  // `t.raw`: literal `{duration}` placeholder, CLIENT-filled
                  // (same pattern as account-statement-table.tsx's `adjustmentOfDate`).
                  packageNote: t.raw('list.table.packageNote') as string,
                },
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
