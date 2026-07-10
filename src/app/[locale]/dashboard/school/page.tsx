import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { ValidationError } from '@/server/services/errors';
import { listOwnStudents, type OwnStudentItem } from '@/server/services/school.service';
import { ExpiryStatusBadge } from '../expiries/expiry-status-badge';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * "I miei allievi" (epic 9, story 9.1, AC 3; FR-32) — the instructor's own,
 * self-scoped roster: nothing here comes from a query param, `listOwnStudents`
 * derives everything from `actor.personId` (AC 4: an instructor can never
 * enumerate another instructor's students by construction). Gated
 * `school.manage.own` (the redirect here only hides navigation, AD-5 — the
 * service re-checks the same permission).
 *
 * Story 9.2 (FR-33): the student's name row-links to their training diary
 * (`/dashboard/school/{personId}`) and the "ultima annotazione" column
 * closes the 9.1 deferral — both come from `listOwnStudents`'s ALREADY
 * batched `lastNoteDate` (no extra query here).
 */
export default async function SchoolPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }
  if (!hasPermission(actor, 'school.manage.own')) {
    redirect({ href: '/dashboard', locale });
    return;
  }

  let students: OwnStudentItem[];
  try {
    students = await listOwnStudents(actor);
  } catch (error) {
    // AC 4: an actor holding `school.manage.own` but with no active
    // instructor profile gets a 422 from the service — degrade to the same
    // empty state a genuinely student-less instructor sees rather than
    // crashing (the redirect above only hides navigation, AD-5).
    if (error instanceof ValidationError) {
      students = [];
    } else {
      throw error;
    }
  }

  const t = await getTranslations('SchoolPage');
  const statusLabels: Record<ExpiryStatusDto, string> = {
    ok: t('table.status.ok'),
    expiring: t('table.status.expiring'),
    expired: t('table.status.expired'),
  };

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-5xl">
        <span className="rounded-full border border-[#EAEAEA] bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-[#787774]">
          {t('kicker')}
        </span>
        <h1 className="mt-4 font-[family-name:var(--font-serif)] text-4xl font-medium tracking-[-0.02em] text-[#111111]">{t('title')}</h1>
        <p className="mt-4 max-w-xl text-base leading-[1.6] text-[#787774]">{t('description')}</p>

        <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="own-students-panel">
          {students.length === 0 ? (
            <p className="text-sm text-[#787774]">{t('empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#EAEAEA] text-xs uppercase tracking-[0.05em] text-[#787774]">
                    <th className="py-2 pr-4 font-medium">{t('table.name')}</th>
                    <th className="py-2 pr-4 font-medium">{t('table.courseStartDate')}</th>
                    <th className="py-2 pr-4 font-medium">{t('table.totalHours')}</th>
                    <th className="py-2 pr-4 font-medium">{t('table.lastNote')}</th>
                    <th className="py-2 font-medium">{t('table.statusHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.personId} data-testid="own-student-row" className="border-b border-[#EAEAEA] text-[#111111]">
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          href={`/dashboard/school/${student.personId}`}
                          locale={locale as AppLocale}
                          className="underline-offset-4 hover:underline"
                        >
                          {student.lastName} {student.firstName}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-[#787774]">{student.courseStartDate}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">{formatMinutes(student.totalMinutes)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-[#787774]">
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
                          <span className="text-xs text-[#787774]">{t('table.noExpiries')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
