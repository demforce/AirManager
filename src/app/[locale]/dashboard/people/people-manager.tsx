'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { updatePersonSchema, type UpdatePersonInput } from '@/lib/schemas/people';
import { PersonCreateDialog } from './person-create-dialog';
import { ProfilesPanel, type ProfilesPanelLabels } from './profiles-panel';
import { DataTable, TruncatedCell } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';

export type PersonRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  fiscalCode: string | null;
  /** ISO 8601 string (server `Date` already serialized) or `null` if active. */
  archivedAt: string | null;
  /** Active-profile flags (story 2.2, AC 1) — rendered as P/A/I badges in the list. */
  profiles: { pilot: boolean; student: boolean; instructor: boolean };
};

/** Exported so `person-create-dialog.tsx` (story 12.3, AC 4) can share the exact same label shape — one source of truth passed down from `page.tsx`. */
export type Labels = {
  newPerson: string;
  searchPlaceholder: string;
  includeArchivedLabel: string;
  table: { name: string; email: string; phone: string; status: string; profiles: string; actions: string; noValue: string; empty: string };
  status: { active: string; archived: string };
  actions: {
    edit: string;
    archive: string;
    unarchive: string;
    confirmArchive: string;
    confirmUnarchive: string;
    confirmYes: string;
    confirmCancel: string;
    profiles: string;
  };
  profilesPanel: ProfilesPanelLabels;
  form: {
    createTitle: string;
    editTitle: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    fiscalCode: string;
    submitCreate: string;
    submitEdit: string;
    cancel: string;
    requiredField: string;
    genericError: string;
    conflictError: string;
    /** Story 12.3 (AC 4) — the create dialog's OPTIONAL role select and its "no role" option. */
    role: string;
    roleNone: string;
    /** Shown when the person was created but the second call (`PUT .../profiles/{type}`) failed — the person EXISTS, no rollback (AC 4). */
    profileError: string;
    /** Link text to the new person's scheda, shown both on full success and on the partial (`profileError`) case. */
    completeProfile: string;
  };
  feedback: { created: string; updated: string; archived: string; unarchived: string };
};

type PeopleManagerProps = {
  people: PersonRow[];
  initialQuery: string;
  initialIncludeArchived: boolean;
  /** Story 12.6 (AC 3) — the command palette's "Nuova persona" deep-link (`?new=1`): opens the create dialog from the very first render. */
  initialCreateOpen?: boolean;
  /** Story 10.1 (AC 5) — the SAME `q`/`includeArchived` this page was fetched with, `?format=xlsx` appended. */
  exportHref: string;
  exportLabel: string;
  labels: Labels;
};

/** Story 12.3 (AC 4) — 'create' moved out to `PersonCreateDialog`, a modal independent of this inline-panel mutual exclusion. */
type Panel = { mode: 'edit'; person: PersonRow } | { mode: 'profiles'; person: PersonRow };
type ConfirmState = { id: string; type: 'archive' | 'unarchive' };

function statusLabel(person: PersonRow, labels: Labels): string {
  return person.archivedAt ? labels.status.archived : labels.status.active;
}

function statusBadgeTone(person: PersonRow): StatusTone {
  return person.archivedAt ? 'warning' : 'ok';
}

/**
 * Debounces `q` before it hits the URL (and therefore the server-side
 * search) — otherwise every keystroke would trigger a full page navigation.
 */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): (value: string) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callback(value), delayMs);
  };
}

export function PeopleManager({
  people,
  initialQuery,
  initialIncludeArchived,
  initialCreateOpen,
  exportHref,
  exportLabel,
  labels,
}: PeopleManagerProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);
  // Story 12.3 (AC 4) — the create dialog, independent of `panel`'s inline
  // edit/profiles mutual exclusion. Story 12.6 (AC 3): `initialCreateOpen`
  // (the command palette's `?new=1` deep-link) seeds it open from the very
  // first render — a lazy initializer, not an effect, since this only ever
  // matters at mount.
  const [createDialogOpen, setCreateDialogOpen] = useState(() => Boolean(initialCreateOpen));
  // Story 12.3 (AC 4) — "Completa la scheda" link shown alongside `feedback`
  // after a successful creation; cleared by every OTHER feedback-setting
  // action below so it never lingers past its own creation.
  const [completeProfileHref, setCompleteProfileHref] = useState<string | null>(null);

  function navigate(next: { q: string; includeArchived: boolean }): void {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.includeArchived) params.set('includeArchived', 'true');
    const search = params.toString();
    router.push(`/dashboard/people${search ? `?${search}` : ''}`);
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    navigate({ q: value, includeArchived });
  }, 400);

  function handleQueryChange(value: string): void {
    setQueryInput(value);
    debouncedSearch(value);
  }

  function handleIncludeArchivedChange(checked: boolean): void {
    setIncludeArchived(checked);
    navigate({ q: queryInput, includeArchived: checked });
  }

  async function handleArchiveToggle(person: PersonRow, type: 'archive' | 'unarchive'): Promise<void> {
    setPendingActionId(person.id);
    const response = await fetch(`/api/v1/people/${person.id}/${type}`, { method: 'POST' });
    setPendingActionId(null);
    setConfirming(null);
    setCompleteProfileHref(null);
    if (response.ok) {
      setFeedback(type === 'archive' ? labels.feedback.archived : labels.feedback.unarchived);
      router.refresh();
    } else {
      // e.g. 409 from a concurrent state change: surface it instead of
      // leaving the row untouched with no explanation (review 2.1 F1).
      setFeedback(labels.form.genericError);
      router.refresh();
    }
  }

  function handleFormSuccess(message: string): void {
    setPanel(null);
    setFeedback(message);
    setCompleteProfileHref(null);
    router.refresh();
  }

  /** Story 12.3 (AC 4) — POST /people (+ optional PUT profile) succeeded: close the dialog, show `people-feedback` plus a link to the new scheda. */
  function handlePersonCreated(personId: string, message: string): void {
    setCreateDialogOpen(false);
    setFeedback(message);
    setCompleteProfileHref(`/dashboard/people/${personId}`);
    router.refresh();
  }

  const columns: ColumnDef<PersonRow, unknown>[] = [
    {
      id: 'name',
      header: labels.table.name,
      cell: ({ row }) => {
        const name = `${row.original.lastName} ${row.original.firstName}`;
        return (
          // Story 2.3: the name is the entry point into the scheda persona.
          <Link
            href={`/dashboard/people/${row.original.id}`}
            title={name}
            className="block max-w-[220px] truncate font-medium text-ink underline-offset-4 hover:underline"
          >
            {name}
          </Link>
        );
      },
    },
    {
      id: 'email',
      header: labels.table.email,
      cell: ({ row }) =>
        row.original.email ? <TruncatedCell value={row.original.email} className="max-w-[220px]" /> : labels.table.noValue,
    },
    {
      id: 'phone',
      header: labels.table.phone,
      cell: ({ row }) => row.original.phone ?? labels.table.noValue,
    },
    {
      id: 'status',
      header: labels.table.status,
      cell: ({ row }) => <StatusPill tone={statusBadgeTone(row.original)}>{statusLabel(row.original, labels)}</StatusPill>,
    },
    {
      id: 'profiles',
      header: labels.table.profiles,
      cell: ({ row }) => {
        const { profiles } = row.original;
        const badges: Array<{ key: string; label: string; title: string }> = [
          ...(profiles.pilot ? [{ key: 'pilot', label: labels.profilesPanel.badges.pilot, title: labels.profilesPanel.pilot.title }] : []),
          ...(profiles.student
            ? [{ key: 'student', label: labels.profilesPanel.badges.student, title: labels.profilesPanel.student.title }]
            : []),
          ...(profiles.instructor
            ? [{ key: 'instructor', label: labels.profilesPanel.badges.instructor, title: labels.profilesPanel.instructor.title }]
            : []),
        ];
        if (badges.length === 0) {
          return labels.table.noValue;
        }
        return (
          <div className="flex gap-1.5" data-testid={`person-profile-badges-${row.original.id}`}>
            {badges.map((badge) => (
              <span
                key={badge.key}
                title={badge.title}
                className="rounded-full bg-[#E1F3FE] px-2.5 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#1F6C9F]"
              >
                {badge.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: labels.table.actions,
      cell: ({ row }) => {
        const person = row.original;
        const isArchived = person.archivedAt !== null;
        const actionType: 'archive' | 'unarchive' = isArchived ? 'unarchive' : 'archive';

        if (confirming?.id === person.id) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">
                {isArchived ? labels.actions.confirmUnarchive : labels.actions.confirmArchive}
              </span>
              <Button size="sm"
                type="button"
                disabled={pendingActionId === person.id}
                onClick={() => void handleArchiveToggle(person, actionType)}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={() => setConfirming(null)}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          );
        }

        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm"
              type="button"
              onClick={() => setPanel({ mode: 'edit', person })}
            >
              {labels.actions.edit}
            </Button>
            <Button variant="outline" size="sm"
              type="button"
              onClick={() => setPanel({ mode: 'profiles', person })}
            >
              {labels.actions.profiles}
            </Button>
            <Button variant="outline" size="sm"
              type="button"
              disabled={pendingActionId === person.id}
              onClick={() => setConfirming({ id: person.id, type: actionType })}
            >
              {isArchived ? labels.actions.unarchive : labels.actions.archive}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {feedback ? (
          <p role="status" data-testid="people-feedback" className="text-sm text-[#346538]">
            {feedback}
            {completeProfileHref ? (
              <>
                {' '}
                <Link href={completeProfileHref} className="underline underline-offset-4">
                  {labels.form.completeProfile}
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <ExportButton href={exportHref} label={exportLabel} testId="people-export-button" />
          <Button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
          >
            {labels.newPerson}
          </Button>
        </div>
      </div>

      <PersonCreateDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} labels={labels} onCreated={handlePersonCreated} />

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="w-full max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => handleIncludeArchivedChange(event.target.checked)}
          />
          {labels.includeArchivedLabel}
        </label>
      </div>

      {panel?.mode === 'edit' ? (
        <Card className="mt-6 p-6">
          <EditPersonForm
            // Remount when the edit target changes — same latent stale-form
            // bug found on the aircraft manager (review 2.4 F1): without the
            // key, switching edit target keeps the previous person's values.
            key={panel.person.id}
            person={panel.person}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </Card>
      ) : null}

      {panel?.mode === 'profiles' ? (
        <div className="mt-6">
          <ProfilesPanel
            key={panel.person.id}
            personId={panel.person.id}
            personLabel={`${panel.person.lastName} ${panel.person.firstName}`}
            labels={labels.profilesPanel}
            onClose={() => setPanel(null)}
            onChanged={() => router.refresh()}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <DataTable columns={columns} data={people} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

type EditPersonFormProps = {
  person: PersonRow;
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

function EditPersonForm({ person, labels, onCancel, onSuccess }: EditPersonFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePersonInput>({
    resolver: zodResolver(updatePersonSchema),
    defaultValues: {
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,
      address: person.address,
      fiscalCode: person.fiscalCode,
    },
  });

  async function onSubmit(values: UpdatePersonInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      setFormError(code === 'CONFLICT' ? labels.form.conflictError : labels.form.genericError);
      return;
    }

    onSuccess(labels.feedback.updated);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        {labels.form.editTitle}
      </h3>

      <PersonFields register={register} errors={errors} labels={labels} idPrefix="edit" />

      {formError ? (
        <p role="alert" data-testid="person-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.form.submitEdit} cancelLabel={labels.form.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

/**
 * Shared field set for create/edit. `register` is typed loosely (both forms'
 * input shapes only differ in whether `firstName`/`lastName` are required)
 * since both `CreatePersonInput`/`UpdatePersonInput` share every field name.
 */
function PersonFields({
  register,
  errors,
  labels,
  idPrefix,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared across two distinct RHF instances (create/edit); field names are identical.
  register: any;
  errors: { firstName?: unknown; lastName?: unknown };
  labels: Labels;
  idPrefix: string;
}) {
  const inputClasses = cn(inputBaseClasses, 'mt-2 w-full');

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-firstName`} className="block text-sm font-medium text-ink">
            {labels.form.firstName}
          </label>
          <input id={`${idPrefix}-firstName`} className={inputClasses} aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
          {errors.firstName ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-lastName`} className="block text-sm font-medium text-ink">
            {labels.form.lastName}
          </label>
          <input id={`${idPrefix}-lastName`} className={inputClasses} aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
          {errors.lastName ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-email`} className="block text-sm font-medium text-ink">
            {labels.form.email}
          </label>
          <input id={`${idPrefix}-email`} type="email" autoComplete="off" className={inputClasses} {...register('email')} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-phone`} className="block text-sm font-medium text-ink">
            {labels.form.phone}
          </label>
          <input id={`${idPrefix}-phone`} type="tel" className={inputClasses} {...register('phone')} />
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-address`} className="block text-sm font-medium text-ink">
          {labels.form.address}
        </label>
        <input id={`${idPrefix}-address`} className={inputClasses} {...register('address')} />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-fiscalCode`} className="block text-sm font-medium text-ink">
          {labels.form.fiscalCode}
        </label>
        <input id={`${idPrefix}-fiscalCode`} className={inputClasses} {...register('fiscalCode')} />
      </div>
    </>
  );
}

function FormActions({
  submitLabel,
  cancelLabel,
  isSubmitting,
  onCancel,
}: {
  submitLabel: string;
  cancelLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-3">
      <Button
        type="submit"
        disabled={isSubmitting}
      >
        {submitLabel}
      </Button>
      <Button variant="outline"
        type="button"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
    </div>
  );
}
