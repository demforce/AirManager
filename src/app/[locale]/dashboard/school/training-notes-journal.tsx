'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { formatDateOnly, formatMinutes } from '@/lib/time';

export type TrainingNoteRowData = {
  id: string;
  noteDate: string;
  exercises: string;
  assessment: string | null;
  nextSteps: string | null;
  authorName: string;
  /** `updatedAt !== createdAt`, computed server-side (AC 3: "mostra che è stata modificata"). */
  edited: boolean;
  /** Author-or-admin AND within the 7-day window, computed server-side (Dev Notes: no `editableBy` on the wire DTO). */
  editable: boolean;
  /** Read-only summary — the edit form never lets the UI reassign a note's flight, but resubmits `id` verbatim on save (see `EditNoteForm` doc-comment). */
  flight: { id: string; flightDate: string; minutes: number } | null;
};

export type SchoolFlightOption = { id: string; flightDate: string; minutes: number };

export type TrainingNotesJournalLabels = {
  row: {
    author: string;
    edited: string;
    exercises: string;
    assessment: string;
    nextSteps: string;
    linkedFlight: string;
    edit: string;
  };
  newNoteForm: {
    title: string;
    addAction: string;
    noteDate: string;
    exercises: string;
    assessment: string;
    nextSteps: string;
    flight: string;
    noFlight: string;
    submit: string;
    cancel: string;
    requiredField: string;
    flightError: string;
    genericError: string;
  };
  editForm: {
    noteDate: string;
    exercises: string;
    assessment: string;
    nextSteps: string;
    save: string;
    cancel: string;
    requiredField: string;
    immutableError: string;
    genericError: string;
  };
};

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as { error?: { code?: string } } | null)?.error?.code ?? null;
}

/** `<input type="date">` default (today, browser-local — same convention as the other panels' `todayDateOnly`). */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

const noteInputSchema = z.object({
  noteDate: z.string().trim().min(1),
  flightId: z.string(),
  exercises: z.string().trim().min(1).max(2000),
  assessment: z.string().max(2000),
  nextSteps: z.string().max(2000),
});

type NoteInputValues = z.infer<typeof noteInputSchema>;

function toRequestBody(values: NoteInputValues): {
  noteDate: string;
  exercises: string;
  assessment?: string;
  nextSteps?: string;
  flightId?: string;
} {
  return {
    noteDate: values.noteDate,
    exercises: values.exercises.trim(),
    assessment: values.assessment.trim() === '' ? undefined : values.assessment.trim(),
    nextSteps: values.nextSteps.trim() === '' ? undefined : values.nextSteps.trim(),
    flightId: values.flightId === '' ? undefined : values.flightId,
  };
}

const inputClasses =
  'mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

/**
 * "Nuova annotazione" form (story 9.2, AC 1) — rendered by the page ONLY for
 * the assigned instructor (`header.isAssignedInstructor`). Reuses the
 * PPR-queue textarea pattern (`rows`/`maxLength`, `ppr-queue.tsx:280-291`).
 * `flightOptions` (this student's SCHOOL flights) is fetched server-side and
 * passed in as a prop — no client fetch needed. On success, `router.refresh()`
 * re-runs the server page so the new note appears at the top of page 1
 * (same pattern as `categories-manager.tsx`).
 */
export function NewTrainingNoteForm({
  studentPersonId,
  flightOptions,
  labels,
}: {
  studentPersonId: string;
  flightOptions: SchoolFlightOption[];
  labels: TrainingNotesJournalLabels['newNoteForm'];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NoteInputValues>({
    resolver: zodResolver(noteInputSchema),
    defaultValues: { noteDate: todayDateOnly(), flightId: '', exercises: '', assessment: '', nextSteps: '' },
  });

  async function onSubmit(values: NoteInputValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${studentPersonId}/training-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toRequestBody(values)),
    });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(code === 'FLIGHT_NOT_LINKABLE' ? labels.flightError : labels.genericError);
      return;
    }

    setOpen(false);
    reset({ noteDate: todayDateOnly(), flightId: '', exercises: '', assessment: '', nextSteps: '' });
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="new-training-note-action"
        className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98]"
      >
        {labels.addAction}
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-[12px] border border-[#EAEAEA] bg-white p-6"
      data-testid="new-training-note-form"
    >
      <h3 className="font-[family-name:var(--font-serif)] text-xl font-medium tracking-[-0.02em] text-[#111111]">{labels.title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-note-date" className="block text-sm font-medium text-[#2F3437]">
            {labels.noteDate}
          </label>
          <input id="new-note-date" type="date" aria-invalid={Boolean(errors.noteDate)} className={inputClasses} {...register('noteDate')} />
          {errors.noteDate ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="new-note-flight" className="block text-sm font-medium text-[#2F3437]">
            {labels.flight}
          </label>
          <select id="new-note-flight" className={inputClasses} {...register('flightId')}>
            <option value="">{labels.noFlight}</option>
            {flightOptions.map((flight) => (
              <option key={flight.id} value={flight.id}>
                {formatDateOnly(flight.flightDate)} · {formatMinutes(flight.minutes)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="new-note-exercises" className="block text-sm font-medium text-[#2F3437]">
          {labels.exercises}
        </label>
        <textarea
          id="new-note-exercises"
          rows={4}
          maxLength={2000}
          aria-invalid={Boolean(errors.exercises)}
          className={inputClasses}
          {...register('exercises')}
        />
        {errors.exercises ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
      </div>
      <div>
        <label htmlFor="new-note-assessment" className="block text-sm font-medium text-[#2F3437]">
          {labels.assessment}
        </label>
        <textarea id="new-note-assessment" rows={3} maxLength={2000} className={inputClasses} {...register('assessment')} />
      </div>
      <div>
        <label htmlFor="new-note-next-steps" className="block text-sm font-medium text-[#2F3437]">
          {labels.nextSteps}
        </label>
        <textarea id="new-note-next-steps" rows={3} maxLength={2000} className={inputClasses} {...register('nextSteps')} />
      </div>

      {formError ? (
        <p role="alert" data-testid="new-training-note-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

const editFormSchema = z.object({
  noteDate: z.string().trim().min(1),
  exercises: z.string().trim().min(1).max(2000),
  assessment: z.string().max(2000),
  nextSteps: z.string().max(2000),
});

type EditFormValues = z.infer<typeof editFormSchema>;

/**
 * Inline edit form (AC 3) — noteDate/exercises/assessment/nextSteps only.
 * DELIBERATE simplification (documented deviation, story Completion Notes):
 * the linked flight is NOT reassignable from this form, even though the API
 * accepts a `flightId` on PATCH — the flight-options list
 * (`listStudentSchoolFlights`) is only available to the ASSIGNED instructor,
 * while the edit action is also reachable by the ADMIN override, who may not
 * hold an instructor profile at all. The existing link (if any) is preserved
 * verbatim on every save.
 */
function EditNoteForm({
  studentPersonId,
  note,
  labels,
  onCancel,
  onSaved,
}: {
  studentPersonId: string;
  note: TrainingNoteRowData;
  labels: TrainingNotesJournalLabels['editForm'];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      noteDate: note.noteDate,
      exercises: note.exercises,
      assessment: note.assessment ?? '',
      nextSteps: note.nextSteps ?? '',
    },
  });

  async function onSubmit(values: EditFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${studentPersonId}/training-notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteDate: values.noteDate,
        exercises: values.exercises.trim(),
        assessment: values.assessment.trim() === '' ? undefined : values.assessment.trim(),
        nextSteps: values.nextSteps.trim() === '' ? undefined : values.nextSteps.trim(),
        // Preserve the existing link verbatim (see doc-comment above) — omitting
        // `flightId` entirely would be read by the server as "clear the link"
        // (full-replace semantics, same schema as create).
        flightId: note.flight?.id,
      }),
    });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.immutableError : labels.genericError);
      return;
    }

    onSaved();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="mt-4 space-y-4" data-testid="edit-training-note-form">
      <div>
        <label htmlFor={`edit-note-date-${note.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.noteDate}
        </label>
        <input
          id={`edit-note-date-${note.id}`}
          type="date"
          aria-invalid={Boolean(errors.noteDate)}
          className={`${inputClasses} max-w-xs`}
          {...register('noteDate')}
        />
      </div>
      <div>
        <label htmlFor={`edit-note-exercises-${note.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.exercises}
        </label>
        <textarea
          id={`edit-note-exercises-${note.id}`}
          rows={4}
          maxLength={2000}
          aria-invalid={Boolean(errors.exercises)}
          className={inputClasses}
          {...register('exercises')}
        />
        {errors.exercises ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
      </div>
      <div>
        <label htmlFor={`edit-note-assessment-${note.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.assessment}
        </label>
        <textarea id={`edit-note-assessment-${note.id}`} rows={3} maxLength={2000} className={inputClasses} {...register('assessment')} />
      </div>
      <div>
        <label htmlFor={`edit-note-next-steps-${note.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.nextSteps}
        </label>
        <textarea id={`edit-note-next-steps-${note.id}`} rows={3} maxLength={2000} className={inputClasses} {...register('nextSteps')} />
      </div>

      {formError ? (
        <p role="alert" data-testid="edit-training-note-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}

/**
 * One diary entry (AC 2/3) — a card, not a table row (Dev Notes offers
 * "card/righe"; free-text fields up to 2000 chars read far better as a card
 * than a dense table cell). `editable` is computed server-side by the page
 * (author-or-admin AND within the 7-day window) — the UI only decides what
 * to SHOW, `updateTrainingNote` remains the real enforcement (AD-5).
 */
export function TrainingNoteRow({
  studentPersonId,
  note,
  labels,
}: {
  studentPersonId: string;
  note: TrainingNoteRowData;
  labels: Pick<TrainingNotesJournalLabels, 'row' | 'editForm'>;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  function handleSaved(): void {
    setIsEditing(false);
    router.refresh();
  }

  return (
    <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="training-note-row">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#111111]">{formatDateOnly(note.noteDate)}</p>
          <p className="mt-1 text-xs text-[#787774]">
            {labels.row.author}: {note.authorName}
            {note.edited ? ` · ${labels.row.edited}` : ''}
          </p>
        </div>
        {note.editable && !isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            data-testid="edit-training-note-action"
            className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {labels.row.edit}
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <EditNoteForm studentPersonId={studentPersonId} note={note} labels={labels.editForm} onCancel={() => setIsEditing(false)} onSaved={handleSaved} />
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.row.exercises}</p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-[#2F3437]">{note.exercises}</p>
          </div>
          {note.assessment ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.row.assessment}</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-[#2F3437]">{note.assessment}</p>
            </div>
          ) : null}
          {note.nextSteps ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.row.nextSteps}</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-[#2F3437]">{note.nextSteps}</p>
            </div>
          ) : null}
          {note.flight ? (
            <p className="text-xs text-[#787774]">
              {labels.row.linkedFlight}: {formatDateOnly(note.flight.flightDate)} · {formatMinutes(note.flight.minutes)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
