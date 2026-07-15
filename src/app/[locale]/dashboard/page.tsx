import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { currentMonthRange } from '@/lib/period-presets';
import type { ExpiryStatusDto } from '@/lib/schemas/expiries';
import { APP_TIMEZONE, formatDateOnly, formatDateTime, formatMinutes, formatTimeOfDay } from '@/lib/time';
import { todayTomorrowRangeUtc } from '@/lib/zoned-time';
import { hasPermission } from '@/server/auth/rbac';
import { signOut } from '@/server/auth/auth';
import { getSessionActor } from '@/server/auth/session';
import { getAccountOverview, listNegativeBalances, type AccountOverview, type NegativeBalanceItem } from '@/server/services/accounts.service';
import { listOutOfServiceAircraft, type AircraftListItem } from '@/server/services/aircraft.service';
import { listBookings, listCalendarBookings, type BookingListItem } from '@/server/services/bookings.service';
import { ValidationError } from '@/server/services/errors';
import { listAllExpiries, listPersonExpiries, type ExpiryDashboardItem, type ExpiryListItem } from '@/server/services/expiries.service';
import { listFlights, type FlightListResult } from '@/server/services/flights.service';
import { getMe } from '@/server/services/me.service';
import { listPersonPackages, type HourPackageListItem } from '@/server/services/packages.service';
import { listPprRequests } from '@/server/services/ppr.service';
import {
  getInstructorHourSummaries,
  listOwnStudents,
  type InstructorHourSummaryItem,
  type OwnStudentItem,
} from '@/server/services/school.service';
import { ExpiryStatusBadge } from './expiries/expiry-status-badge';
import { visibleNavItems } from './nav-items';

type PageProps = {
  params: Promise<{ locale: string }>;
};

type DisplayLocale = 'it' | 'en';

/**
 * One bento tile shared by every widget below (story 10.3, AC 6) — heading +
 * "vista completa" link (matching the pre-existing "Le mie scadenze"/"PPR in
 * attesa" markup, story 6.4/8.2), an optional count next to the heading, and
 * either the widget's own content or a sober empty state (AC 4: a widget is
 * ALWAYS visible for its audience, "zero" is information, never conditionally
 * hidden on empty data).
 */
function WidgetCard({
  testId,
  heading,
  countLabel,
  linkHref,
  linkLabel,
  isEmpty = false,
  emptyLabel,
  children,
}: {
  testId: string;
  heading: string;
  countLabel?: string;
  linkHref: string;
  linkLabel: string;
  isEmpty?: boolean;
  emptyLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid={testId}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
          {heading}
          {countLabel ? <> &middot; {countLabel}</> : null}
        </p>
        <Link href={linkHref} className="text-sm font-medium text-[#2F3437] underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      </div>
      {isEmpty && emptyLabel ? (
        <p className="mt-4 text-sm text-[#787774]" data-testid={`${testId}-empty`}>
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}

/**
 * Protected home page — a role-based dashboard (story 10.3, FR-41): each
 * widget below is gated on the same permission its full page requires, and
 * every applicable widget's data is fetched in ONE `Promise.all` fan-out
 * (AC 5) rather than sequential awaits.
 *
 * `src/proxy.ts` already blocks unauthenticated requests before they reach
 * this route, but Auth.js's own guidance is not to rely on middleware
 * exclusively — the session is re-checked here, close to the data fetch.
 */
export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const displayLocale: DisplayLocale = locale === 'en' ? 'en' : 'it';

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  // AD-1: pages read through services, never Prisma directly.
  const me = await getMe(actor);
  const displayName = me.person
    ? `${me.person.firstName} ${me.person.lastName}`
    : me.email;

  const t = await getTranslations('DashboardPage');
  const navItems = visibleNavItems(actor);

  /**
   * Story 2.3, Task 2: a self-service actor (pilot/student/instructor —
   * `self.read` but no `people.read`) has no "Persone" nav item to reach
   * their own scheda through, so this dashboard (which already loads `me`)
   * is the most coherent place to link it directly. Staff/admin reach any
   * scheda via the "Persone" list instead (nav item above), so this tile is
   * deliberately omitted for them.
   */
  const ownPersonHref =
    me.person && !hasPermission(actor, 'people.read') ? `/dashboard/people/${me.person.id}` : null;

  /**
   * Story 3.2, Task 2: the "Il mio conto" tile sits alongside "La mia
   * scheda" for the same self-service actor — staff/admin reach any
   * account's statement via the "Persone" list + scheda persona instead
   * (the "Estratto conto" link on `AccountPanel`), so this tile is
   * deliberately omitted for them too.
   */
  const ownAccountHref = ownPersonHref ? `${ownPersonHref}/account` : null;

  /**
   * Story 9.2 (FR-33): "Il mio diario" — the allievo's read-only entry point
   * into their own training diary. Same asymmetric-tile rule as
   * `ownPersonHref`/`ownAccountHref` above, gated on `me.person.hasActiveStudentProfile`
   * (the minimal flag `getMe` now exposes, Dev Notes) rather than on
   * `people.read`/`school.manage.*`: it targets whoever HAS a student
   * profile, regardless of role (e.g. a pilot+student dual role also sees
   * it) — the nav "Scuola" entry stays gated `school.manage.own` (the
   * istruttore's index page), unrelated to this tile.
   */
  const ownDiaryHref = me.person?.hasActiveStudentProfile ? `/dashboard/school/${me.person.id}` : null;

  // --- Story 10.3: role-based widget gates (checked BEFORE any query, so a
  // widget the actor cannot see never launches a query destined for a 403).
  const canManagePpr = hasPermission(actor, 'ppr.manage');
  const canManageExpiries = hasPermission(actor, 'expiries.manage');
  const canManageFinance = hasPermission(actor, 'finance.manage');
  const canManageBookingsAny = hasPermission(actor, 'bookings.manage.any');
  const canManageAircraft = hasPermission(actor, 'aircraft.manage');
  /**
   * Personal (pilot/allievo) block (AC 2): visible for an actor with a
   * linked person who lacks `finance.manage` — the SAME asymmetric-tile
   * rule the nav tiles above use, generalized to a single gate for the
   * whole block (Dev Notes: STAFF/ADMIN are the only roles holding
   * `finance.manage`, so this alone separates "has an operational
   * dashboard" from "has a personal one").
   */
  const showPersonalBlock = me.person !== null && !canManageFinance;
  /** Instructor block (AC 3) — `school.manage.own` (INSTRUCTOR; ADMIN inherits it too, same theoretical case `school/page.tsx` already documents/degrades). */
  const showInstructorBlock = hasPermission(actor, 'school.manage.own');
  const personId = me.person?.id;

  const monthRange = currentMonthRange();
  const { from: todayStart, to: dayAfterTomorrowStart } = todayTomorrowRangeUtc(APP_TIMEZONE);

  // AC 5: every applicable widget's query runs in ONE parallel fan-out.
  const [
    pendingPprRequests,
    negativeBalances,
    expiredExpiries,
    expiringExpiries,
    todayTomorrowBookings,
    outOfServiceAircraft,
    accountOverview,
    personPackages,
    upcomingBookings,
    myExpiries,
    recentFlights,
    ownStudents,
    schoolFlights,
    instructorHourSummaries,
  ] = await Promise.all([
    canManagePpr ? listPprRequests(actor, { status: 'PENDING', page: 1, pageSize: 5 }) : Promise.resolve(null),
    canManageFinance ? listNegativeBalances(actor) : Promise.resolve<NegativeBalanceItem[]>([]),
    canManageExpiries ? listAllExpiries(actor, { status: 'expired', page: 1, pageSize: 5 }) : Promise.resolve(null),
    canManageExpiries ? listAllExpiries(actor, { status: 'expiring', page: 1, pageSize: 5 }) : Promise.resolve(null),
    canManageBookingsAny
      ? listCalendarBookings(actor, { from: todayStart.toISOString(), to: dayAfterTomorrowStart.toISOString() })
      : Promise.resolve<BookingListItem[]>([]),
    canManageAircraft ? listOutOfServiceAircraft(actor) : Promise.resolve<AircraftListItem[]>([]),
    showPersonalBlock ? getAccountOverview(actor, personId!) : Promise.resolve<AccountOverview | null>(null),
    showPersonalBlock ? listPersonPackages(actor, personId!) : Promise.resolve<HourPackageListItem[]>([]),
    showPersonalBlock
      ? // Story 12.2 review F1: the service default became APPROVED-only; the
        // personal widget must keep showing the user's own PENDING requests
        // (pre-12.2 they were ACTIVE and visible) until 12.3's status-aware UI.
        listBookings(actor, {
          from: new Date().toISOString(),
          personId: personId!,
          page: 1,
          pageSize: 5,
          status: ['PENDING', 'APPROVED'],
        })
      : Promise.resolve(null),
    showPersonalBlock ? listPersonExpiries(actor, personId!) : Promise.resolve<ExpiryListItem[]>([]),
    showPersonalBlock ? listFlights(actor, { page: 1, pageSize: 5 }) : Promise.resolve<FlightListResult | null>(null),
    showInstructorBlock
      ? listOwnStudents(actor).catch((error): OwnStudentItem[] => {
          // AC 3: an instructor with no active InstructorProfile (or an
          // admin who inherits `school.manage.own` via ALL_PERMISSIONS but
          // never activated one, same theoretical case `school/page.tsx`
          // documents) degrades to an empty roster instead of crashing.
          if (error instanceof ValidationError) return [];
          throw error;
        })
      : Promise.resolve<OwnStudentItem[]>([]),
    showInstructorBlock && personId
      ? listFlights(actor, { instructorPersonId: personId, flightType: 'SCHOOL', page: 1, pageSize: 5 })
      : Promise.resolve<FlightListResult | null>(null),
    showInstructorBlock
      ? getInstructorHourSummaries(actor, monthRange).catch((error): InstructorHourSummaryItem[] => {
          if (error instanceof ValidationError) return [];
          throw error;
        })
      : Promise.resolve<InstructorHourSummaryItem[]>([]),
  ]);

  const tExpiries = await getTranslations('ExpiriesPage');
  const expiryStatusLabels: Record<ExpiryStatusDto, string> = {
    ok: tExpiries('own.table.status.ok'),
    expiring: tExpiries('own.table.status.expiring'),
    expired: tExpiries('own.table.status.expired'),
  };

  const staffExpiries: ExpiryDashboardItem[] = [...(expiredExpiries?.items ?? []), ...(expiringExpiries?.items ?? [])];
  const staffExpiriesTotal = (expiredExpiries?.total ?? 0) + (expiringExpiries?.total ?? 0);
  const topNegativeBalances = negativeBalances.slice(0, 5);
  const totalRemainingMinutes = personPackages
    .filter((pkg) => !pkg.isExpired)
    .reduce((sum, pkg) => sum + pkg.remainingMinutes, 0);
  const ownMonthlyMinutes = instructorHourSummaries.find((item) => item.personId === actor.personId)?.minutes ?? 0;
  const schoolFlightsHref = personId
    ? `/dashboard/logbook?instructorPersonId=${personId}&flightType=SCHOOL`
    : '/dashboard/logbook';

  async function logoutAction() {
    'use server';
    await signOut({ redirectTo: `/${locale}/login` });
  }

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
            {t('kicker')}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('logout')}
            </button>
          </form>
        </div>

        <h1 className="mt-6 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
          {t('welcome', { name: displayName })}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-[1.6] text-[#787774]">{t('subtitle')}</p>

        <nav className="mt-10" aria-label={t('navHeading')}>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">{t('navHeading')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            {ownPersonHref ? (
              <Link
                href={ownPersonHref}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('myProfile')}
              </Link>
            ) : null}
            {ownAccountHref ? (
              <Link
                href={ownAccountHref}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('myAccount')}
              </Link>
            ) : null}
            {ownDiaryHref ? (
              <Link
                href={ownDiaryHref}
                className="rounded-[8px] border border-[#EAEAEA] bg-white px-4 py-3 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {t('myDiary')}
              </Link>
            ) : null}
          </div>
        </nav>

        {/* Staff/admin widgets (AC 1) */}
        {canManagePpr || canManageFinance || canManageExpiries || canManageBookingsAny || canManageAircraft ? (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="staff-widgets-grid">
            {canManagePpr && pendingPprRequests ? (
              <WidgetCard
                testId="ppr-pending-widget"
                heading={t('pprPendingWidget.heading')}
                countLabel={t('pprPendingWidget.count', { count: pendingPprRequests.total })}
                linkHref="/dashboard/ppr"
                linkLabel={t('pprPendingWidget.link')}
                isEmpty={pendingPprRequests.items.length === 0}
                emptyLabel={t('pprPendingWidget.empty')}
              >
                <div className="divide-y divide-[#EAEAEA]">
                  {pendingPprRequests.items.map((request) => (
                    <div key={request.id} data-testid="ppr-pending-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-[#111111]">
                          {request.firstName} {request.lastName} &middot; {request.aircraftRegistration}
                        </p>
                        <p className="text-xs text-[#787774]">{formatDateTime(request.eta, displayLocale)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            ) : null}

            {canManageFinance ? (
              <WidgetCard
                testId="negative-balances-widget"
                heading={t('negativeBalancesWidget.heading')}
                countLabel={t('negativeBalancesWidget.count', { count: negativeBalances.length })}
                linkHref="/dashboard/finance"
                linkLabel={t('negativeBalancesWidget.link')}
                isEmpty={topNegativeBalances.length === 0}
                emptyLabel={t('negativeBalancesWidget.empty')}
              >
                <div className="divide-y divide-[#EAEAEA]">
                  {topNegativeBalances.map((item) => (
                    <div key={item.personId} data-testid="negative-balances-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium text-[#111111]">
                        {item.lastName} {item.firstName}
                      </p>
                      <p className="text-sm font-medium text-[#9F2F2D]">{formatCents(item.balanceCents, displayLocale)}</p>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            ) : null}

            {canManageExpiries ? (
              <WidgetCard
                testId="staff-expiries-widget"
                heading={t('expiriesWidget.heading')}
                countLabel={t('expiriesWidget.count', { count: staffExpiriesTotal })}
                linkHref="/dashboard/expiries"
                linkLabel={t('expiriesWidget.link')}
                isEmpty={staffExpiries.length === 0}
                emptyLabel={t('expiriesWidget.empty')}
              >
                <div className="divide-y divide-[#EAEAEA]">
                  {staffExpiries.map((expiry) => (
                    <div key={expiry.id} data-testid="staff-expiries-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-[#111111]">
                          {expiry.personLastName} {expiry.personFirstName} &middot; {expiry.typeName}
                        </p>
                        <p className="text-xs text-[#787774]">{formatDateOnly(expiry.expiresAt, displayLocale)}</p>
                      </div>
                      <ExpiryStatusBadge status={expiry.status} label={expiryStatusLabels[expiry.status]} />
                    </div>
                  ))}
                </div>
              </WidgetCard>
            ) : null}

            {canManageBookingsAny ? (
              <WidgetCard
                testId="bookings-today-widget"
                heading={t('bookingsTodayWidget.heading')}
                linkHref="/dashboard/bookings"
                linkLabel={t('bookingsTodayWidget.link')}
                isEmpty={todayTomorrowBookings.length === 0}
                emptyLabel={t('bookingsTodayWidget.empty')}
              >
                <div className="divide-y divide-[#EAEAEA]">
                  {todayTomorrowBookings.map((booking) => (
                    <div key={booking.id} data-testid="bookings-today-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-[#111111]">
                          {booking.personName} &middot; {booking.aircraftRegistration}
                        </p>
                        <p className="text-xs text-[#787774]">
                          {formatDateTime(booking.startsAt, displayLocale)} &rarr; {formatTimeOfDay(booking.endsAt, displayLocale)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            ) : null}

            {canManageAircraft ? (
              <WidgetCard
                testId="aircraft-out-of-service-widget"
                heading={t('aircraftOutOfServiceWidget.heading')}
                linkHref="/dashboard/fleet"
                linkLabel={t('aircraftOutOfServiceWidget.link')}
                isEmpty={outOfServiceAircraft.length === 0}
                emptyLabel={t('aircraftOutOfServiceWidget.empty')}
              >
                <div className="divide-y divide-[#EAEAEA]">
                  {outOfServiceAircraft.map((aircraft) => (
                    <div key={aircraft.id} data-testid="aircraft-out-of-service-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-[#111111]">
                          {aircraft.registration} &middot; {aircraft.model}
                        </p>
                        <p className="text-xs text-[#787774]">{aircraft.statusReason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            ) : null}
          </div>
        ) : null}

        {/* Personal (pilota/allievo) widgets (AC 2) */}
        {showPersonalBlock ? (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="personal-widgets-grid">
            <WidgetCard
              testId="account-widget"
              heading={t('accountWidget.heading')}
              linkHref={`/dashboard/people/${personId}/account`}
              linkLabel={t('accountWidget.link')}
              isEmpty={accountOverview?.account === null}
              emptyLabel={t('accountWidget.empty')}
            >
              <p
                className={`text-2xl font-medium ${accountOverview && accountOverview.balanceCents < 0 ? 'text-[#9F2F2D]' : 'text-[#111111]'}`}
                data-testid="account-widget-balance"
              >
                {formatCents(accountOverview?.balanceCents ?? 0, displayLocale)}
              </p>
            </WidgetCard>

            <WidgetCard
              testId="packages-widget"
              heading={t('packagesWidget.heading')}
              linkHref={`/dashboard/people/${personId}/account`}
              linkLabel={t('packagesWidget.link')}
            >
              <p className="text-2xl font-medium text-[#111111]" data-testid="packages-widget-remaining">
                {formatMinutes(totalRemainingMinutes)}
              </p>
            </WidgetCard>

            <WidgetCard
              testId="upcoming-bookings-widget"
              heading={t('upcomingBookingsWidget.heading')}
              linkHref="/dashboard/bookings"
              linkLabel={t('upcomingBookingsWidget.link')}
              isEmpty={(upcomingBookings?.items.length ?? 0) === 0}
              emptyLabel={t('upcomingBookingsWidget.empty')}
            >
              <div className="divide-y divide-[#EAEAEA]">
                {(upcomingBookings?.items ?? []).map((booking) => (
                  <div key={booking.id} data-testid="upcoming-bookings-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-[#111111]">{booking.aircraftRegistration}</p>
                    <p className="text-xs text-[#787774]">{formatDateTime(booking.startsAt, displayLocale)}</p>
                  </div>
                ))}
              </div>
            </WidgetCard>

            <WidgetCard
              testId="my-expiries-widget"
              heading={t('myExpiries.heading')}
              linkHref="/dashboard/expiries"
              linkLabel={t('myExpiries.link')}
              isEmpty={myExpiries.length === 0}
              emptyLabel={t('myExpiries.empty')}
            >
              <div className="divide-y divide-[#EAEAEA]">
                {myExpiries.map((expiry) => (
                  <div key={expiry.id} data-testid="my-expiries-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-[#111111]">{expiry.typeName}</p>
                      <p className="text-xs text-[#787774]">{formatDateOnly(expiry.expiresAt, displayLocale)}</p>
                    </div>
                    <ExpiryStatusBadge status={expiry.status} label={expiryStatusLabels[expiry.status]} data-testid="my-expiries-widget-badge" />
                  </div>
                ))}
              </div>
            </WidgetCard>

            <WidgetCard
              testId="recent-flights-widget"
              heading={t('recentFlightsWidget.heading')}
              linkHref="/dashboard/logbook"
              linkLabel={t('recentFlightsWidget.link')}
              isEmpty={(recentFlights?.items.length ?? 0) === 0}
              emptyLabel={t('recentFlightsWidget.empty')}
            >
              <div className="divide-y divide-[#EAEAEA]">
                {(recentFlights?.items ?? []).map((flight) => (
                  <div key={flight.id} data-testid="recent-flights-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-[#111111]">{flight.aircraft.registration}</p>
                    <p className="text-xs text-[#787774]">
                      {formatDateOnly(flight.flightDate, displayLocale)} &middot; {formatMinutes(flight.minutes)}
                    </p>
                  </div>
                ))}
              </div>
            </WidgetCard>
          </div>
        ) : null}

        {/* Istruttore widgets (AC 3) */}
        {showInstructorBlock ? (
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="instructor-widgets-grid">
            <WidgetCard
              testId="students-widget"
              heading={t('studentsWidget.heading')}
              linkHref="/dashboard/school"
              linkLabel={t('studentsWidget.link')}
              isEmpty={ownStudents.length === 0}
              emptyLabel={t('studentsWidget.empty')}
            >
              <div className="divide-y divide-[#EAEAEA]">
                {ownStudents.map((student) => (
                  <div key={student.personId} data-testid="students-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-[#111111]">
                      {student.lastName} {student.firstName}
                    </p>
                    <p className="text-xs text-[#787774]">{formatMinutes(student.totalMinutes)}</p>
                  </div>
                ))}
              </div>
            </WidgetCard>

            <WidgetCard
              testId="school-flights-widget"
              heading={t('schoolFlightsWidget.heading')}
              linkHref={schoolFlightsHref}
              linkLabel={t('schoolFlightsWidget.link')}
              isEmpty={(schoolFlights?.items.length ?? 0) === 0}
              emptyLabel={t('schoolFlightsWidget.empty')}
            >
              <div className="divide-y divide-[#EAEAEA]">
                {(schoolFlights?.items ?? []).map((flight) => (
                  <div key={flight.id} data-testid="school-flights-widget-row" className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-[#111111]">
                      {flight.person.lastName} {flight.person.firstName}
                    </p>
                    <p className="text-xs text-[#787774]">
                      {formatDateOnly(flight.flightDate, displayLocale)} &middot; {formatMinutes(flight.minutes)}
                    </p>
                  </div>
                ))}
              </div>
            </WidgetCard>

            <section className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="monthly-hours-widget">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">{t('monthlyHoursWidget.heading')}</p>
              <p className="mt-4 text-2xl font-medium text-[#346538]" data-testid="monthly-hours-widget-value">
                {formatMinutes(ownMonthlyMinutes)}
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
