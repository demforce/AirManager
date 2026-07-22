import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { ForbiddenError, NotFoundError } from '@/server/services/errors';
import { listFlights, type FlightListItem } from '@/server/services/flights.service';
import { getPerson } from '@/server/services/people.service';
import { AccountPanel } from '../account-panel';
import { ExpiriesPanel } from '../expiries-panel';
import { ProfilesPanel } from '../profiles-panel';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

/**
 * Story 2.3, AC 1: the structural placeholders future epics fill without
 * restructuring the page. Story 3.1 turns "balance" into the real
 * `AccountPanel` below (removed from this list); story 6.2 does the same for
 * "expiries" -> the real `ExpiriesPanel`; story 11.2 does the same for
 * "recentFlights" -> the real "Ultimi voli" panel below. "hoursPackages" had
 * the same treatment (story 4.4, `PackagesPanel`) but the panel was removed
 * in story 12.13 (pacchetti ore ritirati) — only `upcomingBookings` is still
 * a placeholder today.
 */
const PLACEHOLDER_SECTIONS = ['upcomingBookings'] as const;

/** How many of the person's most recent flights the "Ultimi voli" panel shows (story 11.2, AC 4). */
const RECENT_FLIGHTS_PAGE_SIZE = 5;

/**
 * The "scheda persona" (story 2.3): anagrafica + profiles (read-only unless
 * `people.manage`) + structural placeholders for epics 3-7 (AC 1).
 *
 * Reachable by `people.read` (staff/admin, any person) or "own" access —
 * `self.read` with `actor.personId === id` (AC 2). The redirect below is
 * defense in depth only (AD-5): `getPerson` re-checks the very same rule
 * (own-scoping lives in the service, per `rbac.ts`'s module doc), so a
 * request that somehow skipped this page-level check is still rejected.
 */
export default async function PersonDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  const isOwnAccess = hasPermission(actor, 'self.read') && actor.personId === id;
  if (!hasPermission(actor, 'people.read') && !isOwnAccess) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  let person;
  try {
    person = await getPerson(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    // Can't fire today (the page-level check above mirrors the service rule),
    // but if the two ever diverge the service's 403 must degrade to the same
    // redirect as the page check, not to a generic 500 (review 2.3 F1).
    if (error instanceof ForbiddenError) {
      redirect({ href: '/dashboard', locale });
    }
    throw error;
  }

  const canManageProfiles = hasPermission(actor, 'people.manage');
  const canManageFinance = hasPermission(actor, 'finance.manage');
  const canManageExpiries = hasPermission(actor, 'expiries.manage');
  // Story 11.2 (AC 4): the "Ultimi voli" panel is real for staff
  // (`flights.manage`) or the titolare's own scheda (`isOwnAccess`, computed
  // above); everyone else keeps today's placeholder.
  const canManageFlights = hasPermission(actor, 'flights.manage');
  const showRecentFlights = canManageFlights || isOwnAccess;
  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const t = await getTranslations('PersonDetailPage');
  const tPeople = await getTranslations('PeoplePage');
  const tExpiries = await getTranslations('ExpiriesPanel');

  // Story 11.2 (AC 4): AD-1 (consume the service directly, no new endpoint) —
  // staff filters by this scheda's `personId`; the titolare gets NO
  // `personId` at all (own-scope is automatic in `listFlights` for a
  // non-`flights.manage` actor, same as the registry page itself).
  let recentFlights: FlightListItem[] = [];
  if (showRecentFlights) {
    const recentFlightsResult = await listFlights(actor, {
      page: 1,
      pageSize: RECENT_FLIGHTS_PAGE_SIZE,
      personId: canManageFlights ? person.id : undefined,
    });
    recentFlights = recentFlightsResult.items;
  }

  const personalDataRows: Array<{ label: string; value: string }> = [
    { label: t('personalData.firstName'), value: person.firstName },
    { label: t('personalData.lastName'), value: person.lastName },
    { label: t('personalData.email'), value: person.email ?? t('personalData.noValue') },
    { label: t('personalData.phone'), value: person.phone ?? t('personalData.noValue') },
    { label: t('personalData.address'), value: person.address ?? t('personalData.noValue') },
    { label: t('personalData.fiscalCode'), value: person.fiscalCode ?? t('personalData.noValue') },
  ];

  return (
    // Story 12.13 review (F1): this legacy Tailwind page is light-only by
    // design (ratifica 3 — kept alongside `people/{id}/account`, not
    // ported to AirOps). It used to inherit a light backdrop from the
    // now-removed `LegacyBackdrop` (`dashboard/layout.tsx`'s `.main` is
    // dark in dark theme, and the fixed `#111111`/`#2F3437` text below
    // would go dark-on-dark without this). Same colors as that shim.
    <main className="flex-1 px-6 py-16 sm:px-16" style={{ background: '#FBFBFA', color: '#2F3437' }}>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
              {t('kicker')}
            </span>
            <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">
              {person.lastName} {person.firstName}
            </h1>
            {person.archivedAt ? (
              <span className="mt-3 inline-block rounded-full bg-[#FBF3DB] px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#956400]">
                {t('personalData.archivedBadge')}
              </span>
            ) : null}
          </div>
          {hasPermission(actor, 'people.read') ? (
            <Link
              // Story 12.6, AC 6: the legacy `/dashboard/people` list is
              // gone — this page is no longer reached from a sidebar link,
              // but "back" still lands somewhere useful (the new Piloti page).
              href="/dashboard/pilots"
              locale={locale as AppLocale}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('backToList')}
            </Link>
          ) : (
            <Link
              href="/dashboard"
              locale={locale as AppLocale}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {t('backToDashboard')}
            </Link>
          )}
        </div>

        <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <h2 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
            {t('personalData.heading')}
          </h2>
          <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {personalDataRows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{row.label}</dt>
                <dd className="mt-1 text-base text-[#2F3437]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-6">
          <ProfilesPanel
            personId={person.id}
            personLabel={`${person.lastName} ${person.firstName}`}
            readOnly={!canManageProfiles}
            labels={{
              heading: tPeople('profilesPanel.heading'),
              close: tPeople('profilesPanel.close'),
              loadError: tPeople('profilesPanel.loadError'),
              badges: {
                pilot: tPeople('profilesPanel.badges.pilot'),
                student: tPeople('profilesPanel.badges.student'),
                instructor: tPeople('profilesPanel.badges.instructor'),
              },
              status: {
                active: tPeople('profilesPanel.status.active'),
                inactive: tPeople('profilesPanel.status.inactive'),
                notActivated: tPeople('profilesPanel.status.notActivated'),
              },
              actions: {
                activate: tPeople('profilesPanel.actions.activate'),
                edit: tPeople('profilesPanel.actions.edit'),
                reactivate: tPeople('profilesPanel.actions.reactivate'),
                deactivate: tPeople('profilesPanel.actions.deactivate'),
                confirmDeactivate: tPeople('profilesPanel.actions.confirmDeactivate'),
                confirmYes: tPeople('profilesPanel.actions.confirmYes'),
                confirmCancel: tPeople('profilesPanel.actions.confirmCancel'),
                cancel: tPeople('profilesPanel.actions.cancel'),
                save: tPeople('profilesPanel.actions.save'),
              },
              errors: {
                requiredField: tPeople('profilesPanel.errors.requiredField'),
                generic: tPeople('profilesPanel.errors.generic'),
              },
              pilot: {
                title: tPeople('profilesPanel.pilot.title'),
                licenseNumber: tPeople('profilesPanel.pilot.licenseNumber'),
                licenseType: tPeople('profilesPanel.pilot.licenseType'),
              },
              student: {
                title: tPeople('profilesPanel.student.title'),
                courseStartDate: tPeople('profilesPanel.student.courseStartDate'),
              },
              instructor: {
                title: tPeople('profilesPanel.instructor.title'),
              },
            }}
          />
        </div>

        <div className="mt-6">
          <AccountPanel
            personId={person.id}
            canManageFinance={canManageFinance}
            labels={{
              heading: t('accountPanel.heading'),
              balanceLabel: t('accountPanel.balanceLabel'),
              noAccount: t('accountPanel.noAccount'),
              loadError: t('accountPanel.loadError'),
              recentTitle: t('accountPanel.recentTitle'),
              recentEmpty: t('accountPanel.recentEmpty'),
              viewStatement: t('accountPanel.viewStatement'),
              movementType: {
                topUp: t('accountPanel.movementType.topUp'),
                adjustment: t('accountPanel.movementType.adjustment'),
                packagePurchase: t('accountPanel.movementType.packagePurchase'),
                flightCharge: t('accountPanel.movementType.flightCharge'),
                flightChargeReversal: t('accountPanel.movementType.flightChargeReversal'),
              },
              topUp: {
                action: t('accountPanel.topUp.action'),
                title: t('accountPanel.topUp.title'),
                amount: t('accountPanel.topUp.amount'),
                paymentMethod: t('accountPanel.topUp.paymentMethod'),
                paymentMethods: {
                  cash: t('accountPanel.topUp.paymentMethods.cash'),
                  bankTransfer: t('accountPanel.topUp.paymentMethods.bankTransfer'),
                  pos: t('accountPanel.topUp.paymentMethods.pos'),
                },
                effectiveDate: t('accountPanel.topUp.effectiveDate'),
                description: t('accountPanel.topUp.description'),
                submit: t('accountPanel.topUp.submit'),
                cancel: t('accountPanel.topUp.cancel'),
                invalidAmount: t('accountPanel.topUp.invalidAmount'),
                requiredField: t('accountPanel.topUp.requiredField'),
                genericError: t('accountPanel.topUp.genericError'),
              },
            }}
          />
        </div>

        <div className="mt-6">
          <ExpiriesPanel
            // Remount on person change — same rationale as
            // `InstructorRatesPanel`'s `key={person.id}` (review 2.4 F1).
            key={person.id}
            personId={person.id}
            canManage={canManageExpiries}
            activeProfiles={{
              pilot: person.pilotProfile !== null && person.pilotProfile.deactivatedAt === null,
              student: person.studentProfile !== null && person.studentProfile.deactivatedAt === null,
              instructor: person.instructorProfile !== null && person.instructorProfile.deactivatedAt === null,
            }}
            labels={{
              heading: tExpiries('heading'),
              loadError: tExpiries('loadError'),
              empty: tExpiries('empty'),
              addAction: tExpiries('addAction'),
              feedback: {
                registered: tExpiries('feedback.registered'),
                updated: tExpiries('feedback.updated'),
                deleted: tExpiries('feedback.deleted'),
              },
              table: {
                type: tExpiries('table.type'),
                issuedAt: tExpiries('table.issuedAt'),
                expiresAt: tExpiries('table.expiresAt'),
                notes: tExpiries('table.notes'),
                noNotes: tExpiries('table.noNotes'),
                statusHeader: tExpiries('table.statusHeader'),
                status: {
                  ok: tExpiries('table.status.ok'),
                  expiring: tExpiries('table.status.expiring'),
                  expired: tExpiries('table.status.expired'),
                },
                pendingBadge: tExpiries('table.pendingBadge'),
                actions: tExpiries('table.actions'),
              },
              form: {
                title: tExpiries('form.title'),
                type: tExpiries('form.type'),
                noCompatibleTypes: tExpiries('form.noCompatibleTypes'),
                issuedAt: tExpiries('form.issuedAt'),
                expiresAt: tExpiries('form.expiresAt'),
                notes: tExpiries('form.notes'),
                submit: tExpiries('form.submit'),
                cancel: tExpiries('form.cancel'),
                save: tExpiries('form.save'),
                edit: tExpiries('form.edit'),
                requiredField: tExpiries('form.requiredField'),
                invalidRange: tExpiries('form.invalidRange'),
                scopeMismatchError: tExpiries('form.scopeMismatchError'),
                conflictError: tExpiries('form.conflictError'),
                genericError: tExpiries('form.genericError'),
              },
              actions: {
                delete: tExpiries('actions.delete'),
                confirmDelete: tExpiries('actions.confirmDelete'),
                confirmYes: tExpiries('actions.confirmYes'),
                confirmCancel: tExpiries('actions.confirmCancel'),
              },
            }}
          />
        </div>

        {/* Story 2.3, AC 1: structural placeholders — epics 4-7 replace the
            content, never this layout. Story 11.2 turns "recentFlights" into
            the real panel below (still the SAME grid cell, same heading). */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showRecentFlights ? (
            <section className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="recent-flights-panel">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-medium text-[#111111]">{t('recentFlightsPanel.heading')}</h3>
                <Link
                  href={canManageFlights ? { pathname: '/dashboard/logbook', query: { personId: person.id } } : '/dashboard/logbook'}
                  locale={locale as AppLocale}
                  data-testid="recent-flights-view-all"
                  className="text-xs font-medium text-[#2F3437] underline-offset-4 hover:underline"
                >
                  {t('recentFlightsPanel.viewAll')}
                </Link>
              </div>
              {recentFlights.length === 0 ? (
                <p className="mt-3 text-sm text-[#787774]">{t('recentFlightsPanel.empty')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#EAEAEA]">
                  {recentFlights.map((flight) => (
                    <li key={flight.id} data-testid="recent-flight-row" className="flex items-center justify-between gap-4 py-2 text-sm">
                      <div>
                        <p className="text-[#111111]">
                          {flight.departureAirfield && flight.arrivalAirfield
                            ? `${flight.departureAirfield} → ${flight.arrivalAirfield}`
                            : t('personalData.noValue')}
                        </p>
                        <p className="text-xs text-[#787774]">
                          {formatDateOnly(flight.flightDate, displayLocale)} &middot; {formatMinutes(flight.minutes)}
                        </p>
                      </div>
                      <span className="text-xs text-[#787774]">
                        {flight.status === 'CANCELLED' ? t('recentFlightsPanel.status.cancelled') : t('recentFlightsPanel.status.registered')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
              <h3 className="text-base font-medium text-[#111111]">{t('recentFlightsPanel.heading')}</h3>
              <p className="mt-2 text-sm text-[#787774]">{t('placeholders.comingSoon')}</p>
            </div>
          )}
          {PLACEHOLDER_SECTIONS.map((section) => (
            <div key={section} className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
              <h3 className="text-base font-medium text-[#111111]">{t(`placeholders.${section}`)}</h3>
              <p className="mt-2 text-sm text-[#787774]">{t('placeholders.comingSoon')}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
