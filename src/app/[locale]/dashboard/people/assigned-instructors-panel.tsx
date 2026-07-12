'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { AssignedInstructorItemDto } from '@/lib/schemas/school';
import { formatDateTime } from '@/lib/time';
import { TruncatedCell } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type AssignedInstructorsPanelLabels = {
  heading: string;
  loadError: string;
  empty: string;
  addAction: string;
  feedback: { assigned: string; removed: string };
  table: { name: string; assignedAt: string; actions: string };
  form: {
    title: string;
    instructor: string;
    noInstructors: string;
    submit: string;
    cancel: string;
    requiredField: string;
    conflictError: string;
    genericError: string;
  };
  actions: { remove: string; confirmRemove: string; confirmYes: string; confirmCancel: string };
};

/**
 * Only rendered by the caller (`people/[id]/page.tsx`) when
 * `person.studentProfile !== null` AND the actor holds `school.manage.any`
 * (Dev Notes) — unlike `InstructorRatesPanel`/`ExpiriesPanel`, there is no
 * "read-only" mode here: an actor without `school.manage.any` gets 403 on
 * every one of this feature's endpoints (AC 4), so there is nothing for them
 * to view.
 */
type AssignedInstructorsPanelProps = {
  personId: string;
  labels: AssignedInstructorsPanelLabels;
};

type InstructorOption = { id: string; firstName: string; lastName: string };

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

async function fetchAssignedInstructors(personId: string): Promise<AssignedInstructorItemDto[] | null> {
  const response = await fetch(`/api/v1/people/${personId}/instructors`);
  if (!response.ok) return null;
  return (await response.json()) as AssignedInstructorItemDto[];
}

/**
 * "Istruttori assegnati" section of the scheda persona (story 9.1, AC 1/2) —
 * twin structure of `ExpiriesPanel`: a table with per-row two-step removal
 * (confirm, existing pattern) plus a conditionally-mounted "Assegna
 * istruttore" form.
 */
export function AssignedInstructorsPanel({ personId, labels }: AssignedInstructorsPanelProps) {
  const [instructors, setInstructors] = useState<AssignedInstructorItemDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refetch(): Promise<void> {
    const result = await fetchAssignedInstructors(personId);
    if (result === null) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setInstructors(result);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchAssignedInstructors(personId).then((result) => {
      if (cancelled) return;
      if (result === null) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setInstructors(result);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function handleAssigned(): Promise<void> {
    setFormOpen(false);
    setFeedback(labels.feedback.assigned);
    await refetch();
  }

  async function handleRemove(instructorPersonId: string): Promise<void> {
    const response = await fetch(`/api/v1/people/${personId}/instructors/${instructorPersonId}`, { method: 'DELETE' });
    setConfirmingRemoveId(null);
    if (response.ok) {
      setFeedback(labels.feedback.removed);
    }
    await refetch();
  }

  return (
    <Card className="p-6" data-testid="assigned-instructors-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{labels.heading}</h3>
        {!formOpen ? (
          <Button variant="outline" size="sm"
            type="button"
            onClick={() => setFormOpen(true)}
            className="min-h-[44px]"
          >
            {labels.addAction}
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" data-testid="assigned-instructors-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      {formOpen ? (
        <div className="mt-6">
          <AssignInstructorForm
            personId={personId}
            existingInstructorPersonIds={(instructors ?? []).map((instructor) => instructor.personId)}
            labels={labels.form}
            onCancel={() => setFormOpen(false)}
            onSuccess={() => void handleAssigned()}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {loadError ? <p className="text-sm text-ember">{labels.loadError}</p> : null}
        {!loadError && instructors !== null && instructors.length === 0 ? <p className="text-sm text-mid-gray">{labels.empty}</p> : null}
        {!loadError && instructors !== null && instructors.length > 0 ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
                  <th className="py-2 pr-4 font-medium">{labels.table.name}</th>
                  <th className="py-2 pr-4 font-medium">{labels.table.assignedAt}</th>
                  <th className="py-2 font-medium">{labels.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((instructor) => (
                  <tr key={instructor.personId} data-testid="assigned-instructor-row" className="border-b border-hairline text-ink">
                    <td className="py-2 pr-4"><TruncatedCell value={personLabel(instructor)} className="max-w-[200px]" /></td>
                    <td className="py-2 pr-4 whitespace-nowrap text-mid-gray">{formatDateTime(new Date(instructor.assignedAt))}</td>
                    <td className="py-2">
                      {confirmingRemoveId === instructor.personId ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-mid-gray">{labels.actions.confirmRemove}</span>
                          <Button size="sm"
                            type="button"
                            onClick={() => void handleRemove(instructor.personId)}
                          >
                            {labels.actions.confirmYes}
                          </Button>
                          <Button variant="outline" size="sm"
                            type="button"
                            onClick={() => setConfirmingRemoveId(null)}
                          >
                            {labels.actions.confirmCancel}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm"
                          type="button"
                          onClick={() => setConfirmingRemoveId(instructor.personId)}
                        >
                          {labels.actions.remove}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </Card>
  );
}

const assignInstructorFormSchema = z.object({ instructorPersonId: z.string().trim().min(1) });

type AssignInstructorFormValues = z.infer<typeof assignInstructorFormSchema>;

type AssignInstructorFormProps = {
  personId: string;
  /** Already-assigned instructor person ids — filtered out of the picker (a client-side convenience; the server's own duplicate check, AC 1, remains the real guardian). */
  existingInstructorPersonIds: string[];
  labels: AssignedInstructorsPanelLabels['form'];
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * "Assegna istruttore" form (story 9.1, AC 1). A plain `<select>` populated
 * from `GET /api/v1/people?profile=instructor` (TD-3's `profile` filter,
 * reused verbatim) — deliberately NOT a `SearchCombobox` typeahead (Dev
 * Notes: "il numero di istruttori è piccolo, non serve").
 */
function AssignInstructorForm({ personId, existingInstructorPersonIds, labels, onCancel, onSuccess }: AssignInstructorFormProps) {
  const [options, setOptions] = useState<InstructorOption[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadInstructorsOnMount(): Promise<void> {
      const response = await fetch('/api/v1/people?profile=instructor&pageSize=100');
      if (cancelled) return;
      if (!response.ok) {
        setOptions([]);
        return;
      }
      const body = (await response.json()) as { items: InstructorOption[] };
      setOptions(body.items);
    }
    void loadInstructorsOnMount();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssignInstructorFormValues>({
    resolver: zodResolver(assignInstructorFormSchema),
    defaultValues: { instructorPersonId: '' },
  });

  async function onSubmit(values: AssignInstructorFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${personId}/instructors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructorPersonId: values.instructorPersonId }),
    });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    onSuccess();
  }

  const availableOptions = (options ?? []).filter((option) => !existingInstructorPersonIds.includes(option.id));
  const noneAvailable = options !== null && availableOptions.length === 0;

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-nested border border-hairline p-4"
      data-testid="assign-instructor-form"
    >
      <h4 className="text-base font-medium text-ink">{labels.title}</h4>
      <div>
        <label htmlFor="assign-instructor-select" className="block text-sm font-medium text-ink">
          {labels.instructor}
        </label>
        <select
          id="assign-instructor-select"
          aria-invalid={Boolean(errors.instructorPersonId)}
          disabled={noneAvailable}
          className="mt-2 min-h-[44px] w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink disabled:cursor-not-allowed disabled:bg-canvas"
          {...register('instructorPersonId')}
        >
          <option value="" disabled>
            {labels.instructor}
          </option>
          {availableOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {personLabel(option)}
            </option>
          ))}
        </select>
        {noneAvailable ? <p className="mt-1 text-xs text-mid-gray">{labels.noInstructors}</p> : null}
        {errors.instructorPersonId ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
      </div>

      {formError ? (
        <p role="alert" data-testid="assign-instructor-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || noneAvailable}
          className="min-h-[44px]"
        >
          {labels.submit}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
          className="min-h-[44px]"
        >
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
