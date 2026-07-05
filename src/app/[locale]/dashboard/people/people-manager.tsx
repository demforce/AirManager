'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { DataTable } from '@/components/data-table';
import { useRouter } from '@/i18n/navigation';
import { createPersonSchema, updatePersonSchema, type CreatePersonInput, type UpdatePersonInput } from '@/lib/schemas/people';

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
};

type Labels = {
  newPerson: string;
  searchPlaceholder: string;
  includeArchivedLabel: string;
  table: { name: string; email: string; phone: string; status: string; actions: string; noValue: string; empty: string };
  status: { active: string; archived: string };
  actions: {
    edit: string;
    archive: string;
    unarchive: string;
    confirmArchive: string;
    confirmUnarchive: string;
    confirmYes: string;
    confirmCancel: string;
  };
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
  };
  feedback: { created: string; updated: string; archived: string; unarchived: string };
};

type PeopleManagerProps = {
  people: PersonRow[];
  initialQuery: string;
  initialIncludeArchived: boolean;
  labels: Labels;
};

type Panel = { mode: 'create' } | { mode: 'edit'; person: PersonRow };
type ConfirmState = { id: string; type: 'archive' | 'unarchive' };

function statusLabel(person: PersonRow, labels: Labels): string {
  return person.archivedAt ? labels.status.archived : labels.status.active;
}

function statusBadgeClasses(person: PersonRow): string {
  return person.archivedAt ? 'bg-[#FBF3DB] text-[#956400]' : 'bg-[#EDF3EC] text-[#346538]';
}

/**
 * Debounces `q` before it hits the URL (and therefore the server-side
 * search) — otherwise every keystroke would trigger a full page navigation.
 */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): (value: string) => void {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer ? clearTimeout(timer) : undefined), [timer]);

  return (value: string) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => callback(value), delayMs));
  };
}

export function PeopleManager({ people, initialQuery, initialIncludeArchived, labels }: PeopleManagerProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);

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
    if (response.ok) {
      setFeedback(type === 'archive' ? labels.feedback.archived : labels.feedback.unarchived);
      router.refresh();
    }
  }

  function handleFormSuccess(message: string): void {
    setPanel(null);
    setFeedback(message);
    router.refresh();
  }

  const columns: ColumnDef<PersonRow, unknown>[] = [
    {
      id: 'name',
      header: labels.table.name,
      cell: ({ row }) => (
        <span className="text-[#111111]">
          {row.original.lastName} {row.original.firstName}
        </span>
      ),
    },
    {
      id: 'email',
      header: labels.table.email,
      cell: ({ row }) => row.original.email ?? labels.table.noValue,
    },
    {
      id: 'phone',
      header: labels.table.phone,
      cell: ({ row }) => row.original.phone ?? labels.table.noValue,
    },
    {
      id: 'status',
      header: labels.table.status,
      cell: ({ row }) => (
        <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${statusBadgeClasses(row.original)}`}>
          {statusLabel(row.original, labels)}
        </span>
      ),
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
              <span className="text-xs text-[#787774]">
                {isArchived ? labels.actions.confirmUnarchive : labels.actions.confirmArchive}
              </span>
              <button
                type="button"
                disabled={pendingActionId === person.id}
                onClick={() => void handleArchiveToggle(person, actionType)}
                className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
              >
                {labels.actions.confirmYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.confirmCancel}
              </button>
            </div>
          );
        }

        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPanel({ mode: 'edit', person })}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {labels.actions.edit}
            </button>
            <button
              type="button"
              disabled={pendingActionId === person.id}
              onClick={() => setConfirming({ id: person.id, type: actionType })}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
            >
              {isArchived ? labels.actions.unarchive : labels.actions.archive}
            </button>
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
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setPanel({ mode: 'create' })}
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98]"
        >
          {labels.newPerson}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={queryInput}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="w-full max-w-xs rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
        />
        <label className="flex items-center gap-2 text-sm text-[#2F3437]">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => handleIncludeArchivedChange(event.target.checked)}
          />
          {labels.includeArchivedLabel}
        </label>
      </div>

      {panel?.mode === 'create' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <CreatePersonForm labels={labels} onCancel={() => setPanel(null)} onSuccess={handleFormSuccess} />
        </div>
      ) : null}

      {panel?.mode === 'edit' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <EditPersonForm
            person={panel.person}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <DataTable columns={columns} data={people} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

type CreatePersonFormProps = {
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

function CreatePersonForm({ labels, onCancel, onSuccess }: CreatePersonFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createPersonSchema>, unknown, CreatePersonInput>({
    resolver: zodResolver(createPersonSchema),
    defaultValues: { firstName: '', lastName: '', email: null, phone: null, address: null, fiscalCode: null },
  });

  async function onSubmit(values: CreatePersonInput): Promise<void> {
    setFormError(null);
    const response = await fetch('/api/v1/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      setFormError(code === 'CONFLICT' ? labels.form.conflictError : labels.form.genericError);
      return;
    }

    onSuccess(labels.feedback.created);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
      <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
        {labels.form.createTitle}
      </h3>

      <PersonFields register={register} errors={errors} labels={labels} idPrefix="create" />

      {formError ? (
        <p role="alert" data-testid="person-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.form.submitCreate} cancelLabel={labels.form.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
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
      <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
        {labels.form.editTitle}
      </h3>

      <PersonFields register={register} errors={errors} labels={labels} idPrefix="edit" />

      {formError ? (
        <p role="alert" data-testid="person-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
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
  const inputClasses =
    'mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-firstName`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.firstName}
          </label>
          <input id={`${idPrefix}-firstName`} className={inputClasses} aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
          {errors.firstName ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-lastName`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.lastName}
          </label>
          <input id={`${idPrefix}-lastName`} className={inputClasses} aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
          {errors.lastName ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.requiredField}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-email`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.email}
          </label>
          <input id={`${idPrefix}-email`} type="email" autoComplete="off" className={inputClasses} {...register('email')} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-phone`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.phone}
          </label>
          <input id={`${idPrefix}-phone`} type="tel" className={inputClasses} {...register('phone')} />
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-address`} className="block text-sm font-medium text-[#2F3437]">
          {labels.form.address}
        </label>
        <input id={`${idPrefix}-address`} className={inputClasses} {...register('address')} />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-fiscalCode`} className="block text-sm font-medium text-[#2F3437]">
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
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
