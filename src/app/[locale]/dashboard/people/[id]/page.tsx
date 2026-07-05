import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { ForbiddenError, NotFoundError } from '@/server/services/errors';
import { getPerson } from '@/server/services/people.service';
import { AccountPanel } from '../account-panel';
import { ProfilesPanel } from '../profiles-panel';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

/**
 * Story 2.3, AC 1: the structural placeholders future epics fill without
 * restructuring the page. Story 3.1 turns "balance" into the real
 * `AccountPanel` below — it is deliberately removed from this list.
 */
const PLACEHOLDER_SECTIONS = ['expiries', 'hoursPackages', 'recentFlights', 'upcomingBookings'] as const;

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
  const t = await getTranslations('PersonDetailPage');
  const tPeople = await getTranslations('PeoplePage');

  const personalDataRows: Array<{ label: string; value: string }> = [
    { label: t('personalData.firstName'), value: person.firstName },
    { label: t('personalData.lastName'), value: person.lastName },
    { label: t('personalData.email'), value: person.email ?? t('personalData.noValue') },
    { label: t('personalData.phone'), value: person.phone ?? t('personalData.noValue') },
    { label: t('personalData.address'), value: person.address ?? t('personalData.noValue') },
    { label: t('personalData.fiscalCode'), value: person.fiscalCode ?? t('personalData.noValue') },
  ];

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
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
              href="/dashboard/people"
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
                ratings: tPeople('profilesPanel.instructor.ratings'),
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
              movementType: { topUp: t('accountPanel.movementType.topUp') },
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

        {/* Story 2.3, AC 1: structural placeholders — epics 4-7 replace the
            content, never this layout. */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
