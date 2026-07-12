import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExportButton } from '@/components/export-button';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { buildExportHref } from '@/lib/export-href';
import type { ExpiryStatusDto } from '@/lib/schemas/expiries';
import { currentMonthRange } from '@/lib/period-presets';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { ValidationError } from '@/server/services/errors';
import {
  getInstructorHourSummaries,
  getStudentHourSummaries,
  listOwnStudents,
  type InstructorHourSummaryItem,
  type OwnStudentItem,
  type StudentHourSummaryItem,
} from '@/server/services/school.service';
import { ExpiryStatusBadge } from '../expiries/expiry-status-badge';
import { SummaryFilters } from './summary-filters';
import { Card } from '@/components/ui/card';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Same hand-edited URL defense as `finance/report/page.tsx#sanitizeDateParam`. */
function sanitizeDateParam(value: string | undefined): string | undefined {
  return value && DATE_ONLY_PATTERN.test(value) ? value : undefined;
}

/** `/dashboard/flights?instructorPersonId=…` drill-down (AC 2/4) — the SAME period, always `SCHOOL` (the summary itself is SCHOOL-only). */
function flightsDrillDownHref(instructorPersonId: string, from: string, to: string) {
  return { pathname: '/dashboard/flights', query: { instructorPersonId, flightType: 'SCHOOL', dateFrom: from, dateTo: to } };
}

/**
 * `/dashboard/school` — two faces (story 9.3, FR-34; extends 9.1's
 * own-access-only landing, pattern of the 6.4 expiries landing):
 *  - **Gestore** (`school.manage.any`, staff/admin): the "Riepiloghi"
 *    section — a shared period filter, the per-student dual-command/solo
 *    hour table, and the per-instructor SCHOOL-hour table with a
 *    drill-down into the flight registry.
 *  - **Istruttore** (`school.manage.own`): the UNCHANGED "I miei allievi"
 *    roster (story 9.1/9.2) plus a "Le mie ore scuola" card driven by the
 *    SAME period filter.
 * An actor holding BOTH (an admin with an instructor profile, a theoretical
 * case per the Dev Notes) sees both faces. `getInstructorHourSummaries` is
 * called exactly ONCE either way: its `school.manage.any` branch already
 * returns every instructor, so the own-row card is simply picked out of
 * that same result instead of issuing a second query.
 */
export default async function SchoolPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  const canManageAny = hasPermission(actor, 'school.manage.any');
  const canManageOwn = hasPermission(actor, 'school.manage.own');
  if (!canManageAny && !canManageOwn) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  const defaultRange = currentMonthRange();
  const sanitizedFrom = sanitizeDateParam(fromParam);
  const sanitizedTo = sanitizeDateParam(toParam);
  // AC 2 (93-N2): a hand-edited URL with a well-formed but inverted range
  // (from > to) degrades to the default period on BOTH ends — same as a
  // malformed param — rather than silently querying an empty/invalid range.
  // Date-only strings (`YYYY-MM-DD`) compare correctly as plain strings.
  const rangeInverted = sanitizedFrom !== undefined && sanitizedTo !== undefined && sanitizedFrom > sanitizedTo;
  const from = rangeInverted ? defaultRange.from : (sanitizedFrom ?? defaultRange.from);
  const to = rangeInverted ? defaultRange.to : (sanitizedTo ?? defaultRange.to);

  let ownStudents: OwnStudentItem[] = [];
  if (canManageOwn) {
    try {
      ownStudents = await listOwnStudents(actor);
    } catch (error) {
      // AC 4 (story 9.1): an actor holding `school.manage.own` but with no
      // active instructor profile gets a 422 — degrade to the same empty
      // state a genuinely student-less instructor sees (the redirect above
      // only hides navigation, AD-5).
      if (!(error instanceof ValidationError)) throw error;
    }
  }

  const studentSummaries: StudentHourSummaryItem[] = canManageAny ? await getStudentHourSummaries(actor, { from, to }) : [];

  let instructorSummaries: InstructorHourSummaryItem[] = [];
  try {
    instructorSummaries = await getInstructorHourSummaries(actor, { from, to });
  } catch (error) {
    // Same 422 degrade as `listOwnStudents` above — only reachable on the
    // own-scoped branch (no `school.manage.any`, no active instructor profile).
    if (!(error instanceof ValidationError)) throw error;
  }
  const ownInstructorSummary = canManageOwn ? instructorSummaries.find((item) => item.personId === actor.personId) : undefined;

  const t = await getTranslations('SchoolPage');
  const tExport = await getTranslations('Export');
  // Story 10.1 (AC 5) — both summary exports share the SAME `from`/`to` period filter the tables above were fetched with.
  const studentsExportHref = buildExportHref('/api/v1/school/summaries/students', { from, to }, locale);
  const instructorsExportHref = buildExportHref('/api/v1/school/summaries/instructors', { from, to }, locale);
  const statusLabels: Record<ExpiryStatusDto, string> = {
    ok: t('table.status.ok'),
    expiring: t('table.status.expiring'),
    expired: t('table.status.expired'),
  };

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
          {t('kicker')}
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-ink">
          {canManageOwn ? t('title') : t('titleManage')}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-[1.6] text-mid-gray">{canManageOwn ? t('description') : t('descriptionManage')}</p>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('summaries.filters.heading')}</h2>
          <div className="mt-4">
            <SummaryFilters
              initialFilters={{ from, to }}
              labels={{
                month: t('summaries.filters.month'),
                quarter: t('summaries.filters.quarter'),
                year: t('summaries.filters.year'),
                custom: t('summaries.filters.custom'),
                from: t('summaries.filters.from'),
                to: t('summaries.filters.to'),
              }}
            />
          </div>
        </section>

        {canManageAny ? (
          <section className="mt-10" data-testid="school-summaries-panel">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {t('summaries.heading')}
            </h2>

            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('summaries.students.heading')}</h3>
                <ExportButton href={studentsExportHref} label={tExport('button')} testId="school-students-export-button" />
              </div>
              {studentSummaries.length === 0 ? (
                <p className="mt-3 text-sm text-mid-gray">{t('summaries.students.empty')}</p>
              ) : (
                <Card className="mt-3 overflow-x-auto p-0">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
                        <th className="px-5 py-3">{t('summaries.students.table.name')}</th>
                        <th className="px-5 py-3">{t('summaries.students.table.dual')}</th>
                        <th className="px-5 py-3">{t('summaries.students.table.solo')}</th>
                        <th className="px-5 py-3">{t('summaries.students.table.totalPeriod')}</th>
                        <th className="px-5 py-3">{t('summaries.students.table.totalAllTime')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentSummaries.map((student) => (
                        <tr
                          key={student.personId}
                          data-testid="school-summary-student-row"
                          className="border-b border-hairline text-ink last:border-b-0"
                        >
                          <td className="px-5 py-3 align-middle font-medium">
                            <Link
                              href={`/dashboard/school/${student.personId}`}
                              locale={locale as AppLocale}
                              className="underline-offset-4 hover:underline"
                            >
                              {student.lastName} {student.firstName}
                            </Link>
                          </td>
                          <td className="px-5 py-3 align-middle">{formatMinutes(student.dualMinutes)}</td>
                          <td className="px-5 py-3 align-middle">{formatMinutes(student.soloMinutes)}</td>
                          <td className="px-5 py-3 align-middle font-medium">{formatMinutes(student.totalMinutes)}</td>
                          <td className="px-5 py-3 align-middle text-mid-gray">{formatMinutes(student.totalMinutesAllTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>

            <div className="mt-10">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{t('summaries.instructors.heading')}</h3>
                <ExportButton href={instructorsExportHref} label={tExport('button')} testId="school-instructors-export-button" />
              </div>
              {instructorSummaries.length === 0 ? (
                <p className="mt-3 text-sm text-mid-gray">{t('summaries.instructors.empty')}</p>
              ) : (
                <Card className="mt-3 overflow-x-auto p-0">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
                        <th className="px-5 py-3">{t('summaries.instructors.table.name')}</th>
                        <th className="px-5 py-3">{t('summaries.instructors.table.hours')}</th>
                        <th className="px-5 py-3">{t('summaries.instructors.table.action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructorSummaries.map((instructor) => (
                        <tr
                          key={instructor.personId}
                          data-testid="school-summary-instructor-row"
                          className="border-b border-hairline text-ink last:border-b-0"
                        >
                          <td className="px-5 py-3 align-middle font-medium">
                            {instructor.lastName} {instructor.firstName}
                          </td>
                          <td className="px-5 py-3 align-middle font-medium text-[#346538]">{formatMinutes(instructor.minutes)}</td>
                          <td className="px-5 py-3 align-middle">
                            <Link
                              href={flightsDrillDownHref(instructor.personId, from, to)}
                              locale={locale as AppLocale}
                              data-testid="school-summary-open-register"
                              className="rounded-buttons border border-hairline bg-transparent px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
                            >
                              {t('summaries.instructors.table.action')}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          </section>
        ) : null}

        {canManageOwn ? (
          <section className="mt-10 rounded-cards border border-hairline bg-paper shadow-subtle p-6" data-testid="own-hours-panel">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">
              {t('myHours.heading')}
            </h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <p className="text-2xl font-medium text-[#346538]" data-testid="own-hours-minutes">
                {formatMinutes(ownInstructorSummary?.minutes ?? 0)}
              </p>
              {actor.personId ? (
                <Link
                  href={flightsDrillDownHref(actor.personId, from, to)}
                  locale={locale as AppLocale}
                  data-testid="own-hours-open-register"
                  className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
                >
                  {t('myHours.openRegister')}
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {canManageOwn ? (
          <section className="mt-10 rounded-cards border border-hairline bg-paper shadow-subtle p-6" data-testid="own-students-panel">
            {ownStudents.length === 0 ? (
              <p className="text-sm text-mid-gray">{t('empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
                      <th className="py-2 pr-4 font-medium">{t('table.name')}</th>
                      <th className="py-2 pr-4 font-medium">{t('table.courseStartDate')}</th>
                      <th className="py-2 pr-4 font-medium">{t('table.totalHours')}</th>
                      <th className="py-2 pr-4 font-medium">{t('table.lastNote')}</th>
                      <th className="py-2 font-medium">{t('table.statusHeader')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownStudents.map((student) => (
                      <tr key={student.personId} data-testid="own-student-row" className="border-b border-hairline text-ink">
                        <td className="py-3 pr-4 font-medium">
                          <Link
                            href={`/dashboard/school/${student.personId}`}
                            locale={locale as AppLocale}
                            className="underline-offset-4 hover:underline"
                          >
                            {student.lastName} {student.firstName}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap text-mid-gray">{formatDateOnly(student.courseStartDate, locale as 'it' | 'en')}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{formatMinutes(student.totalMinutes)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap text-mid-gray">
                          {student.lastNoteDate ? formatDateOnly(student.lastNoteDate, locale as 'it' | 'en') : t('table.noNotes')}
                        </td>
                        <td className="py-3">
                          {student.expiryStatus ? (
                            <ExpiryStatusBadge
                              status={student.expiryStatus}
                              label={statusLabels[student.expiryStatus]}
                              data-testid="own-student-status-badge"
                            />
                          ) : (
                            <span className="text-xs text-mid-gray">{t('table.noExpiries')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
