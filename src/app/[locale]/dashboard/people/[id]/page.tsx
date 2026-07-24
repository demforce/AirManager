import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { getAccountOverview, listAccountMovements } from '@/server/services/accounts.service';
import { ForbiddenError, NotFoundError } from '@/server/services/errors';
import { listPersonExpiries, type ExpiryListItem } from '@/server/services/expiries.service';
import { listFlights, type FlightListItem } from '@/server/services/flights.service';
import { getPerson, getPersonUser } from '@/server/services/people.service';
import { buildPilotEditorLabels, buildPilotEditorToastLabels } from '../../pilots/pilot-editor-labels';
import type { PilotRow } from '../../pilots/pilots-console';
import { AccountSection, type AccountSectionLabels } from './account-section';
import { EditPersonButton } from './edit-person-button';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
};

/**
 * Story 2.3, AC 1: the structural placeholder future epics fill without
 * restructuring the page. "hoursPackages"/"balance"/"expiries"/"recentFlights"
 * were all turned into real panels by stories 3.1/4.4/6.2/11.2 in turn
 * (4.4's "pacchetti ore" panel was itself retired in story 12.13) — only
 * "upcomingBookings" is still a placeholder today.
 */
const PLACEHOLDER_SECTIONS = ['upcomingBookings'] as const;

/** How many of the person's most recent flights the "Ultimi voli" panel shows (story 11.2, AC 4). */
const RECENT_FLIGHTS_PAGE_SIZE = 5;

/** Estratto conto page size — same as the retired standalone `/account` page (story 3.2). */
const ACCOUNT_PAGE_SIZE = 20;

function roleBadges(
  profiles: { pilot: boolean; student: boolean; instructor: boolean },
  labels: { pilot: string; student: string; instructor: string },
): Array<{ key: string; label: string; tone: BadgeTone }> {
  const badges: Array<{ key: string; label: string; tone: BadgeTone }> = [];
  if (profiles.pilot) badges.push({ key: 'pilot', label: labels.pilot, tone: 'info' });
  if (profiles.student) badges.push({ key: 'student', label: labels.student, tone: 'ok' });
  if (profiles.instructor) badges.push({ key: 'instructor', label: labels.instructor, tone: 'warn' });
  return badges;
}

function expiryStatusTone(status: ExpiryListItem['status']): BadgeTone {
  if (status === 'expired') return 'bad';
  if (status === 'expiring') return 'warn';
  return 'ok';
}

/**
 * The "scheda persona" (story 2.3; rebuilt AirOps-native, story 13.3): a
 * read-oriented DOSSIER — anagrafica, profili attivi, ratings/scadenze,
 * estratto conto (story 13.3, AC 2 — merges the retired `/account` drill-down
 * into a section here) and "Ultimi voli", all read-only. Editing anything
 * (anagrafica/profili/ratings/accesso/archivio) goes through the SAME
 * `PilotEditor` slide-over the Piloti table uses (R-13.3-c) via the
 * "Modifica" button — no editing logic duplicated on this page.
 *
 * Reachable by `people.read` (staff/admin, any person) or "own" access —
 * `self.read` with `actor.personId === id` (AC 2). The redirect below is
 * defense in depth only (AD-5): `getPerson` re-checks the very same rule
 * (own-scoping lives in the service, per `rbac.ts`'s module doc), so a
 * request that somehow skipped this page-level check is still rejected.
 */
export default async function PersonDetailPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const { page: pageParam } = await searchParams;
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

  // Story 13.3 (AC 2): `getAccountOverview`/`listAccountMovements`/
  // `listPersonExpiries` share the EXACT same `people.read`-OR-own-access
  // rule as `getPerson` (`assertReadAccess`/`listPersonExpiries`'s own
  // check) — grouped in the same try/catch as defense in depth (AD-5),
  // same convention the retired standalone `/account` page used.
  let person;
  let overview;
  let statement;
  let expiries;
  let accountPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  try {
    person = await getPerson(actor, id);
    overview = await getAccountOverview(actor, id);
    expiries = await listPersonExpiries(actor, id);
    statement = await listAccountMovements(actor, id, { page: accountPage, pageSize: ACCOUNT_PAGE_SIZE });
    // Clamp an out-of-range ?page to the last real page (same guard the
    // retired `/account` page had, review 3.2 F1).
    const lastPage = Math.max(1, Math.ceil(statement.total / ACCOUNT_PAGE_SIZE));
    if (accountPage > lastPage) {
      accountPage = lastPage;
      statement = await listAccountMovements(actor, id, { page: accountPage, pageSize: ACCOUNT_PAGE_SIZE });
    }
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

  const canManagePeople = hasPermission(actor, 'people.manage');
  const canManageFinance = hasPermission(actor, 'finance.manage');
  const canManageUsers = hasPermission(actor, 'users.manage');
  // Story 11.2 (AC 4): the "Ultimi voli" panel is real for staff
  // (`flights.manage`) or the titolare's own scheda (`isOwnAccess`, computed
  // above); everyone else keeps today's placeholder.
  const canManageFlights = hasPermission(actor, 'flights.manage');
  const showRecentFlights = canManageFlights || isOwnAccess;
  const displayLocale: 'it' | 'en' = locale === 'en' ? 'en' : 'it';
  const t = await getTranslations('PersonDetailPage');
  const tPeople = await getTranslations('PeoplePage');
  const tExpiries = await getTranslations('ExpiriesPanel');
  const tPilots = await getTranslations('PilotsPage');
  const tUsers = await getTranslations('UsersPage');
  const tAccount = await getTranslations('AccountStatementPage');
  const tExport = await getTranslations('Export');

  // Story 11.2 (AC 4): AD-1 (consume the service directly, no new endpoint) —
  // staff filters by this scheda's `personId`; the titolare gets NO
  // `personId` at all (own-scope is automatic in `listFlights` for a
  // non-`flights.manage` actor, same as the registry page itself). Runs
  // alongside the linked-user lookup (13.3, R-13.3-c) — neither can throw
  // the errors the try/catch above guards against.
  const [recentFlightsResult, personUser] = await Promise.all([
    showRecentFlights
      ? listFlights(actor, { page: 1, pageSize: RECENT_FLIGHTS_PAGE_SIZE, personId: canManageFlights ? person.id : undefined })
      : Promise.resolve(null),
    getPersonUser(person.id),
  ]);
  const recentFlights: FlightListItem[] = recentFlightsResult?.items ?? [];

  // `people.read` gates the "registrato da" column (same rule the retired
  // `/account` page used) — the service already omits `actorEmail` from the
  // wire payload for anyone without it (AD-5: it is the real guardian), this
  // only decides whether to render an extra column.
  const showActor = hasPermission(actor, 'people.read');

  const personalDataRows: Array<{ label: string; value: string }> = [
    { label: t('personalData.firstName'), value: person.firstName },
    { label: t('personalData.lastName'), value: person.lastName },
    { label: t('personalData.email'), value: person.email ?? t('personalData.noValue') },
    { label: t('personalData.phone'), value: person.phone ?? t('personalData.noValue') },
    { label: t('personalData.address'), value: person.address ?? t('personalData.noValue') },
    { label: t('personalData.fiscalCode'), value: person.fiscalCode ?? t('personalData.noValue') },
  ];

  const roles = roleBadges(person.profiles, {
    pilot: tPeople('profilesPanel.pilot.title'),
    student: tPeople('profilesPanel.student.title'),
    instructor: tPeople('profilesPanel.instructor.title'),
  });

  // The `PilotRow` the embedded `PilotEditor` needs (R-13.3-c). `balanceCents`/
  // `lastFlightDate` are structurally required by the shared type but never
  // read inside the editor (only `pilots-console.tsx`'s OWN table row uses
  // them) — inert placeholders here, not a second source of truth.
  const personRow: PilotRow = {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    address: person.address,
    fiscalCode: person.fiscalCode,
    archivedAt: person.archivedAt ? person.archivedAt.toISOString() : null,
    profiles: person.profiles,
    balanceCents: 0,
    lastFlightDate: null,
    user: personUser,
  };

  const accountLabels: AccountSectionLabels = {
    heading: tAccount('kicker'),
    balanceLabel: t('accountPanel.balanceLabel'),
    noAccount: t('accountPanel.noAccount'),
    empty: tAccount('table.empty'),
    pagination: { prev: tPilots('pagination.prev'), next: tPilots('pagination.next') },
    table: {
      date: tAccount('table.date'),
      type: tAccount('table.type'),
      description: tAccount('table.description'),
      amount: tAccount('table.amount'),
      recordedBy: tAccount('table.recordedBy'),
      actions: tAccount('table.actions'),
      noValue: tAccount('table.noValue'),
    },
    movementType: {
      topUp: tAccount('movementType.topUp'),
      adjustment: tAccount('movementType.adjustment'),
      packagePurchase: tAccount('movementType.packagePurchase'),
      flightCharge: tAccount('movementType.flightCharge'),
      flightChargeReversal: tAccount('movementType.flightChargeReversal'),
    },
    // `t.raw`: these carry a literal `{date}` placeholder the CLIENT fills in
    // (the original movement's date lives in the row data) — `t()` would
    // fail on the missing ICU value server-side.
    adjustmentBadge: { ofDate: tAccount.raw('adjustmentBadge.ofDate') as string, linked: tAccount('adjustmentBadge.linked') },
    reversalBadge: { ofDate: tAccount.raw('reversalBadge.ofDate') as string, linked: tAccount('reversalBadge.linked') },
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
    adjustments: {
      action: tAccount('adjustments.action'),
      rowAction: tAccount('adjustments.rowAction'),
      title: tAccount('adjustments.title'),
      linkedTo: tAccount.raw('adjustments.linkedTo') as string,
      amount: tAccount('adjustments.amount'),
      amountHint: tAccount('adjustments.amountHint'),
      reason: tAccount('adjustments.reason'),
      submit: tAccount('adjustments.submit'),
      cancel: tAccount('adjustments.cancel'),
      invalidAmount: tAccount('adjustments.invalidAmount'),
      requiredReason: tAccount('adjustments.requiredReason'),
      conflictError: tAccount('adjustments.conflictError'),
      genericError: tAccount('adjustments.genericError'),
      success: tAccount('adjustments.success'),
    },
  };

  const exportHref = buildExportHref(`/api/v1/people/${id}/account/movements`, {}, locale);
  const exportPdfHref = buildPdfExportHref(`/api/v1/people/${id}/account/pdf`, {}, locale);

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title-block">
          <h1>
            {person.lastName} {person.firstName}
          </h1>
          <div className="sub">
            {roles.map((role) => (
              <Badge key={role.key} tone={role.tone}>
                {role.label}
              </Badge>
            ))}
            {person.archivedAt ? <Badge dot>{t('personalData.archivedBadge')}</Badge> : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManagePeople ? (
            <EditPersonButton
              person={personRow}
              canManageUsers={canManageUsers}
              locale={displayLocale}
              editLabel={tPeople('actions.edit')}
              labels={buildPilotEditorLabels(tPilots, tPeople, tUsers)}
              toastLabels={buildPilotEditorToastLabels(tPilots)}
            />
          ) : null}
          <Link href={hasPermission(actor, 'people.read') ? '/dashboard/pilots' : '/dashboard'} locale={locale as AppLocale} className="btn">
            {hasPermission(actor, 'people.read') ? t('backToList') : t('backToDashboard')}
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{t('personalData.heading')}</h2>
        </div>
        <div className="card-body">
          {personalDataRows.map((row) => (
            <div className="info-row" key={row.label}>
              <span className="k">{row.label}</span>
              <span className="v">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{tPeople('profilesPanel.heading')}</h2>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <ProfileSummaryCard
            testId="profile-section-pilot"
            title={tPeople('profilesPanel.pilot.title')}
            profile={person.pilotProfile}
            fact={person.pilotProfile ? `${tPeople('profilesPanel.pilot.licenseNumber')}: ${person.pilotProfile.licenseNumber} · ${tPeople('profilesPanel.pilot.licenseType')}: ${person.pilotProfile.licenseType}` : null}
            labels={{ active: tPeople('profilesPanel.status.active'), inactive: tPeople('profilesPanel.status.inactive'), notActivated: tPeople('profilesPanel.status.notActivated') }}
          />
          <ProfileSummaryCard
            testId="profile-section-student"
            title={tPeople('profilesPanel.student.title')}
            profile={person.studentProfile}
            fact={person.studentProfile ? `${tPeople('profilesPanel.student.courseStartDate')}: ${formatDateOnly(person.studentProfile.courseStartDate, displayLocale)}` : null}
            labels={{ active: tPeople('profilesPanel.status.active'), inactive: tPeople('profilesPanel.status.inactive'), notActivated: tPeople('profilesPanel.status.notActivated') }}
          />
          <ProfileSummaryCard
            testId="profile-section-instructor"
            title={tPeople('profilesPanel.instructor.title')}
            profile={person.instructorProfile}
            fact={null}
            labels={{ active: tPeople('profilesPanel.status.active'), inactive: tPeople('profilesPanel.status.inactive'), notActivated: tPeople('profilesPanel.status.notActivated') }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">{tExpiries('heading')}</h2>
        </div>
        <div className="card-body">
          {expiries.length === 0 ? (
            <p className="fld-label" style={{ textTransform: 'none' }}>
              {tExpiries('empty')}
            </p>
          ) : (
            <div className="students">
              <div className="student-row header" style={{ gridTemplateColumns: '1.4fr 120px 140px 1fr' }}>
                <div>{tExpiries('table.type')}</div>
                <div>{tExpiries('table.expiresAt')}</div>
                <div>{tExpiries('table.statusHeader')}</div>
                <div>{tExpiries('table.notes')}</div>
              </div>
              {expiries.map((expiry) => (
                <div key={expiry.id} className="student-row" data-testid="person-expiry-row" style={{ gridTemplateColumns: '1.4fr 120px 140px 1fr' }}>
                  <div>{expiry.typeName}</div>
                  <div className="mono">{formatDateOnly(expiry.expiresAt, displayLocale)}</div>
                  <div>
                    <Badge tone={expiryStatusTone(expiry.status)}>{tExpiries(`table.status.${expiry.status}`)}</Badge>
                  </div>
                  <div style={{ color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {expiry.notes ?? tExpiries('table.noNotes')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AccountSection
        personId={person.id}
        locale={locale as AppLocale}
        moneyLocale={displayLocale}
        hasAccount={overview.account !== null}
        balanceCents={overview.balanceCents}
        rows={statement.items}
        page={accountPage}
        totalPages={Math.max(1, Math.ceil(statement.total / ACCOUNT_PAGE_SIZE))}
        showActor={showActor}
        canManageFinance={canManageFinance}
        exportHref={exportHref}
        exportPdfHref={exportPdfHref}
        exportLabels={{ label: tExport('button'), xls: tExport('button'), pdf: tExport('buttonPdf') }}
        labels={accountLabels}
      />

      {/* Story 2.3, AC 1: structural placeholders — epics 4-7 replace the
          content, never this layout. Story 11.2 turns "recentFlights" into
          the real panel below (still the SAME grid cell, same heading). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {showRecentFlights ? (
          <div className="card" data-testid="recent-flights-panel">
            <div className="card-head">
              <h2 className="card-title">{t('recentFlightsPanel.heading')}</h2>
              <div className="spacer" />
              <Link
                href={canManageFlights ? { pathname: '/dashboard/logbook', query: { personId: person.id } } : '/dashboard/logbook'}
                locale={locale as AppLocale}
                data-testid="recent-flights-view-all"
                className="card-sub"
                style={{ textDecoration: 'underline' }}
              >
                {t('recentFlightsPanel.viewAll')}
              </Link>
            </div>
            <div className="card-body">
              {recentFlights.length === 0 ? (
                <p className="fld-label" style={{ textTransform: 'none' }}>
                  {t('recentFlightsPanel.empty')}
                </p>
              ) : (
                recentFlights.map((flight) => (
                  <div
                    key={flight.id}
                    data-testid="recent-flight-row"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}
                  >
                    <div>
                      <div>
                        {flight.departureAirfield && flight.arrivalAirfield ? `${flight.departureAirfield} → ${flight.arrivalAirfield}` : t('personalData.noValue')}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {formatDateOnly(flight.flightDate, displayLocale)} · {formatMinutes(flight.minutes)}
                      </div>
                    </div>
                    <span className="card-sub">
                      {flight.status === 'CANCELLED' ? t('recentFlightsPanel.status.cancelled') : t('recentFlightsPanel.status.registered')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">{t('recentFlightsPanel.heading')}</h2>
            </div>
            <div className="card-body">
              <p className="fld-label" style={{ textTransform: 'none' }}>
                {t('placeholders.comingSoon')}
              </p>
            </div>
          </div>
        )}
        {PLACEHOLDER_SECTIONS.map((section) => (
          <div className="card" key={section}>
            <div className="card-head">
              <h2 className="card-title">{t(`placeholders.${section}`)}</h2>
            </div>
            <div className="card-body">
              <p className="fld-label" style={{ textTransform: 'none' }}>
                {t('placeholders.comingSoon')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

type SummaryProfile = { deactivatedAt: Date | null } | null;

function profileStatusLabel(profile: SummaryProfile, labels: { active: string; inactive: string; notActivated: string }): string {
  if (!profile) return labels.notActivated;
  return profile.deactivatedAt ? labels.inactive : labels.active;
}

function profileStatusTone(profile: SummaryProfile): BadgeTone {
  if (!profile) return '';
  return profile.deactivatedAt ? 'warn' : 'ok';
}

/** Read-only profile mini-card (story 13.3, AC 1) — activate/edit/deactivate all moved into the `PilotEditor` slide-over's own "Profili" section (R-13.3-c). */
function ProfileSummaryCard({
  testId,
  title,
  profile,
  fact,
  labels,
}: {
  testId: string;
  title: string;
  profile: SummaryProfile;
  fact: string | null;
  labels: { active: string; inactive: string; notActivated: string };
}) {
  return (
    <div data-testid={testId} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
        <Badge tone={profileStatusTone(profile)} dot>
          {profileStatusLabel(profile, labels)}
        </Badge>
      </div>
      {fact ? (
        <p className="fld-label" style={{ textTransform: 'none', marginTop: 8 }}>
          {fact}
        </p>
      ) : null}
    </div>
  );
}
