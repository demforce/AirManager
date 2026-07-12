import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatDateOnly } from '@/lib/time';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionActor } from '@/server/auth/session';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/services/errors';
import {
  getTrainingDiaryHeader,
  listStudentSchoolFlights,
  listTrainingNotes,
  type TrainingDiaryHeader,
  type TrainingNoteItem,
} from '@/server/services/school.service';
import { NewTrainingNoteForm, TrainingNoteRow, type TrainingNoteRowData } from '../training-notes-journal';
import { Pager } from '@/components/pager';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;
const NOTE_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toRowData(note: TrainingNoteItem, actorPersonId: string | null, canAuthor: boolean, canEditAsAdmin: boolean): TrainingNoteRowData {
  const isAuthor = canAuthor && actorPersonId !== null && actorPersonId === note.author.personId;
  const withinWindow = Date.now() - note.createdAt.getTime() <= NOTE_EDIT_WINDOW_MS;
  return {
    id: note.id,
    noteDate: note.noteDate,
    exercises: note.exercises,
    assessment: note.assessment,
    nextSteps: note.nextSteps,
    authorName: `${note.author.lastName} ${note.author.firstName}`,
    edited: note.updatedAt.getTime() !== note.createdAt.getTime(),
    editable: (isAuthor || canEditAsAdmin) && withinWindow,
    flight: note.flight,
  };
}

/**
 * The training diary (epic 9, story 9.2, AC 1/2/3; FR-33) — `/dashboard/school/{id}`,
 * `{id}` = the STUDENT's `Person.id`. Guard mirrors the service's own triple
 * access (`school.manage.any` OR assigned instructor OR own-access,
 * `school.service.ts#resolveTrainingDiaryAccess`) — the redirect/notFound
 * here only hide navigation (AD-5), the service re-checks everything.
 */
export default async function TrainingDiaryPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const { page: pageParam } = await searchParams;
  setRequestLocale(locale);

  const actor = await getSessionActor();
  if (!actor) {
    redirect({ href: '/login', locale });
    return;
  }

  let page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);

  let header: TrainingDiaryHeader;
  let notesResult: Awaited<ReturnType<typeof listTrainingNotes>>;
  try {
    header = await getTrainingDiaryHeader(actor, id);
    notesResult = await listTrainingNotes(actor, id, { page, pageSize: PAGE_SIZE });
    const lastPage = Math.max(1, Math.ceil(notesResult.total / PAGE_SIZE));
    if (page > lastPage) {
      page = lastPage;
      notesResult = await listTrainingNotes(actor, id, { page, pageSize: PAGE_SIZE });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    // Neither of the three access branches applied, or (management paths
    // only) the student profile is inactive — same redirect either way, this
    // page has nothing to show an unauthorized viewer (AD-5).
    if (error instanceof ForbiddenError || error instanceof ValidationError) {
      redirect({ href: '/dashboard', locale });
      return;
    }
    throw error;
  }

  const schoolFlights = header.isAssignedInstructor ? await listStudentSchoolFlights(actor, id) : [];

  // The admin override (`school.notes.manage.any`) is ADMIN-only (rbac.ts) —
  // author-editing needs `school.manage.own` too (checked per-note below via
  // `actor.personId` matching `note.author.personId`).
  const canAuthor = hasPermission(actor, 'school.manage.own');
  const canEditAsAdmin = hasPermission(actor, 'school.notes.manage.any');
  const rows = notesResult.items.map((note) => toRowData(note, actor.personId, canAuthor, canEditAsAdmin));

  const t = await getTranslations('TrainingDiaryPage');
  const totalPages = Math.max(1, Math.ceil(notesResult.total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    return { pathname: `/dashboard/school/${id}`, query: { page: targetPage } };
  }

  // Asymmetric back-link target (same rule as `people/[id]/page.tsx`): staff
  // reads via `school.manage.any` and has no dedicated entry point yet, so
  // `people.read` (staff/admin) sends them to the scheda persona; the
  // instructor's own "I miei allievi" is `/dashboard/school`; the allievo's
  // own-access falls back to the dashboard (no "Persone" list to return to).
  const backHref = hasPermission(actor, 'people.read')
    ? `/dashboard/people/${id}`
    : hasPermission(actor, 'school.manage.own')
      ? '/dashboard/school'
      : '/dashboard';

  return (
    <main className="flex-1 px-6 py-16 sm:px-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-hairline bg-paper px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-mid-gray">
              {t('kicker')}
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-ink">
              {header.lastName} {header.firstName}
            </h1>
            <p className="mt-2 text-sm text-mid-gray">
              {t('courseStartDate')}: {formatDateOnly(header.courseStartDate, locale as 'it' | 'en')}
            </p>
          </div>
          <Link
            href={backHref}
            locale={locale as AppLocale}
            className="rounded-buttons border border-hairline bg-transparent px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            {t('back')}
          </Link>
        </div>

        {header.isAssignedInstructor ? (
          <div className="mt-10" data-testid="new-training-note-section">
            <NewTrainingNoteForm
              studentPersonId={id}
              flightOptions={schoolFlights}
              labels={{
                title: t('newNoteForm.title'),
                addAction: t('newNoteForm.addAction'),
                noteDate: t('newNoteForm.noteDate'),
                exercises: t('newNoteForm.exercises'),
                assessment: t('newNoteForm.assessment'),
                nextSteps: t('newNoteForm.nextSteps'),
                flight: t('newNoteForm.flight'),
                noFlight: t('newNoteForm.noFlight'),
                submit: t('newNoteForm.submit'),
                cancel: t('newNoteForm.cancel'),
                requiredField: t('newNoteForm.requiredField'),
                flightError: t('newNoteForm.flightError'),
                genericError: t('newNoteForm.genericError'),
              }}
              datePickerLabels={{
                openCalendar: t('datePicker.openCalendar'),
                previousMonth: t('datePicker.previousMonth'),
                nextMonth: t('datePicker.nextMonth'),
                invalidDate: t('datePicker.invalidDate'),
              }}
            />
          </div>
        ) : null}

        <div className="mt-10 space-y-4" data-testid="training-notes-list">
          {rows.length === 0 ? (
            <p className="text-sm text-mid-gray">{t('empty')}</p>
          ) : (
            rows.map((note) => (
              <TrainingNoteRow
                key={note.id}
                studentPersonId={id}
                note={note}
                labels={{
                  row: {
                    author: t('row.author'),
                    edited: t('row.edited'),
                    exercises: t('row.exercises'),
                    assessment: t('row.assessment'),
                    nextSteps: t('row.nextSteps'),
                    linkedFlight: t('row.linkedFlight'),
                    edit: t('row.edit'),
                  },
                  editForm: {
                    noteDate: t('editForm.noteDate'),
                    exercises: t('editForm.exercises'),
                    assessment: t('editForm.assessment'),
                    nextSteps: t('editForm.nextSteps'),
                    save: t('editForm.save'),
                    cancel: t('editForm.cancel'),
                    requiredField: t('editForm.requiredField'),
                    immutableError: t('editForm.immutableError'),
                    genericError: t('editForm.genericError'),
                  },
                  datePicker: {
                    openCalendar: t('datePicker.openCalendar'),
                    previousMonth: t('datePicker.previousMonth'),
                    nextMonth: t('datePicker.nextMonth'),
                    invalidDate: t('datePicker.invalidDate'),
                  },
                }}
              />
            ))
          )}
        </div>

        <Pager page={page} totalPages={totalPages} hrefBuilder={pageHref} locale={locale as AppLocale} />
      </div>
    </main>
  );
}
