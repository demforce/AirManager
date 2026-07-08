'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ExpiryTypeItemDto } from '@/lib/schemas/expiry-types';
import type { ExpiryItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';

export type ExpiriesPanelLabels = {
  heading: string;
  loadError: string;
  empty: string;
  addAction: string;
  feedback: { registered: string; updated: string; deleted: string };
  table: {
    type: string;
    issuedAt: string;
    expiresAt: string;
    notes: string;
    noNotes: string;
    statusHeader: string;
    status: Record<ExpiryStatusDto, string>;
    pendingBadge: string;
    actions: string;
  };
  form: {
    title: string;
    type: string;
    noCompatibleTypes: string;
    issuedAt: string;
    expiresAt: string;
    notes: string;
    submit: string;
    cancel: string;
    save: string;
    edit: string;
    requiredField: string;
    invalidRange: string;
    scopeMismatchError: string;
    conflictError: string;
    genericError: string;
  };
  actions: {
    delete: string;
    confirmDelete: string;
    confirmYes: string;
    confirmCancel: string;
  };
};

type ExpiriesPanelProps = {
  personId: string;
  /**
   * Derived server-side from `hasPermission(actor, 'expiries.manage')`
   * (same `canSell`/`canAddRate`-style pattern as `PackagesPanel`/
   * `InstructorRatesPanel`): hides register/edit/delete for an own-access
   * viewer (a titolare reading their OWN scheda via `self.read`) — the
   * list itself is always shown, `listPersonExpiries`'s own authorize()
   * remains the real guardian (AD-5).
   */
  canManage: boolean;
  /**
   * Which of the person's profiles are currently ACTIVE — used to filter
   * the register form's type picker to compatible types only (Dev Notes:
   * a client-side convenience filter, `registerExpiry`'s own
   * `assertScopeCompatible` re-verifies regardless).
   */
  activeProfiles: { pilot: boolean; student: boolean; instructor: boolean };
  labels: ExpiriesPanelLabels;
};

const STATUS_BADGE_CLASSES: Record<ExpiryStatusDto, string> = {
  ok: 'bg-[#EDF3EC] text-[#346538]',
  expiring: 'bg-[#FBF3DB] text-[#956400]',
  expired: 'bg-[#FDEBEC] text-[#9F2F2D]',
};

/** `<input type="date">` default — same browser-local-time convention as the other panels' `todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchExpiries(personId: string): Promise<ExpiryItemDto[] | null> {
  const response = await fetch(`/api/v1/people/${personId}/expiries`);
  if (!response.ok) return null;
  return (await response.json()) as ExpiryItemDto[];
}

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as { error?: { code?: string } } | null)?.error?.code ?? null;
}

/**
 * "Scadenze" section of the scheda persona (story 6.2, AC 1) — replaces the
 * 6.1-era `expiries` structural placeholder. Twin structure of
 * `PackagesPanel`: a table (type / rilascio / scadenza / stato / note) with
 * a colored status badge and a "proposta in attesa" hint when a pending
 * proposal exists, plus (for `canManage` actors) a register form and
 * per-row edit/delete (edit as a conditionally-MOUNTED sub-form, so
 * `react-hook-form`'s `defaultValues` are read fresh every time editing
 * (re)opens — the review 2.4 F1 lesson, same fix as `types-manager.tsx`'s
 * panel).
 */
export function ExpiriesPanel({ personId, canManage, activeProfiles, labels }: ExpiriesPanelProps) {
  const [expiries, setExpiries] = useState<ExpiryItemDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refetch(): Promise<void> {
    const result = await fetchExpiries(personId);
    if (result === null) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setExpiries(result);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchExpiries(personId).then((result) => {
      if (cancelled) return;
      if (result === null) {
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setExpiries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  async function handleRegistered(): Promise<void> {
    setFormOpen(false);
    setFeedback(labels.feedback.registered);
    await refetch();
  }

  async function handleUpdated(): Promise<void> {
    setEditingId(null);
    setFeedback(labels.feedback.updated);
    await refetch();
  }

  async function handleDelete(id: string): Promise<void> {
    const response = await fetch(`/api/v1/expiries/${id}`, { method: 'DELETE' });
    setConfirmingDeleteId(null);
    if (response.ok) {
      setFeedback(labels.feedback.deleted);
    }
    await refetch();
  }

  return (
    <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="expiries-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">{labels.heading}</h3>
        {canManage && !formOpen ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="min-h-[44px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
          >
            {labels.addAction}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" data-testid="expiries-panel-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      {canManage && formOpen ? (
        <div className="mt-6">
          <RegisterExpiryForm
            personId={personId}
            activeProfiles={activeProfiles}
            labels={labels.form}
            onCancel={() => setFormOpen(false)}
            onSuccess={() => void handleRegistered()}
          />
        </div>
      ) : null}

      <div className="mt-6">
        {loadError ? <p className="text-sm text-[#9F2F2D]">{labels.loadError}</p> : null}
        {!loadError && expiries !== null && expiries.length === 0 ? <p className="text-sm text-[#787774]">{labels.empty}</p> : null}
        {!loadError && expiries !== null && expiries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs uppercase tracking-[0.05em] text-[#787774]">
                  <th className="py-2 pr-4 font-medium">{labels.table.type}</th>
                  <th className="py-2 pr-4 font-medium">{labels.table.issuedAt}</th>
                  <th className="py-2 pr-4 font-medium">{labels.table.expiresAt}</th>
                  <th className="py-2 pr-4 font-medium">{labels.table.statusHeader}</th>
                  <th className="py-2 pr-4 font-medium">{labels.table.notes}</th>
                  {canManage ? <th className="py-2 font-medium">{labels.table.actions}</th> : null}
                </tr>
              </thead>
              <tbody>
                {expiries.map((expiry) => (
                  <ExpiryRow
                    key={expiry.id}
                    expiry={expiry}
                    canManage={canManage}
                    isEditing={editingId === expiry.id}
                    isConfirmingDelete={confirmingDeleteId === expiry.id}
                    labels={labels}
                    onEdit={() => setEditingId(expiry.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaved={() => void handleUpdated()}
                    onRequestDelete={() => setConfirmingDeleteId(expiry.id)}
                    onCancelDelete={() => setConfirmingDeleteId(null)}
                    onConfirmDelete={() => void handleDelete(expiry.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ExpiryRowProps = {
  expiry: ExpiryItemDto;
  canManage: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  labels: ExpiriesPanelLabels;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

function ExpiryRow({
  expiry,
  canManage,
  isEditing,
  isConfirmingDelete,
  labels,
  onEdit,
  onCancelEdit,
  onSaved,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: ExpiryRowProps) {
  if (isEditing) {
    return (
      <tr data-testid="expiry-row-editing" className="border-b border-[#EAEAEA]">
        <td colSpan={canManage ? 6 : 5} className="py-4">
          <EditExpiryRowForm expiry={expiry} labels={labels.form} onCancel={onCancelEdit} onSuccess={onSaved} />
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid="expiry-row" className="border-b border-[#EAEAEA] align-top text-[#111111]">
      <td className="py-3 pr-4">
        <span className="font-medium">{expiry.typeName}</span>
        {expiry.pendingProposal ? (
          <span
            data-testid="expiry-pending-badge"
            className="mt-1 block w-fit rounded-full bg-[#F0EEE6] px-2.5 py-0.5 text-xs font-medium text-[#5F5B53]"
          >
            {labels.table.pendingBadge}
          </span>
        ) : null}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">{expiry.issuedAt}</td>
      <td className="py-3 pr-4 whitespace-nowrap">{expiry.expiresAt}</td>
      <td className="py-3 pr-4">
        <span
          data-testid="expiry-status-badge"
          className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${STATUS_BADGE_CLASSES[expiry.status]}`}
        >
          {labels.table.status[expiry.status]}
        </span>
      </td>
      <td className="py-3 pr-4 text-[#787774]">{expiry.notes ?? labels.table.noNotes}</td>
      {canManage ? (
        <td className="py-3">
          {isConfirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#787774]">{labels.actions.confirmDelete}</span>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333]"
              >
                {labels.actions.confirmYes}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.confirmCancel}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.form.edit}
              </button>
              <button
                type="button"
                onClick={onRequestDelete}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.delete}
              </button>
            </div>
          )}
        </td>
      ) : null}
    </tr>
  );
}

const registerExpiryFormSchema = z
  .object({
    expiryTypeId: z.string().trim().min(1),
    issuedAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1),
    notes: z.string(),
  })
  .refine((value) => value.expiresAt >= value.issuedAt, { message: 'invalidRange', path: ['expiresAt'] });

type RegisterExpiryFormValues = z.infer<typeof registerExpiryFormSchema>;

type RegisterExpiryFormProps = {
  personId: string;
  activeProfiles: { pilot: boolean; student: boolean; instructor: boolean };
  labels: ExpiriesPanelLabels['form'];
  onCancel: () => void;
  onSuccess: () => void;
};

/** Whether an expiry type's ambito matches the person's currently ACTIVE profiles (client-side convenience filter, `registerExpiry`'s `assertScopeCompatible` re-verifies). */
function isScopeCompatible(scope: ExpiryTypeItemDto['scope'], activeProfiles: RegisterExpiryFormProps['activeProfiles']): boolean {
  if (scope === 'ALL') return true;
  if (scope === 'PILOTS') return activeProfiles.pilot;
  if (scope === 'STUDENTS') return activeProfiles.student;
  return activeProfiles.instructor;
}

/**
 * "Registra scadenza" form (story 6.2, AC 1). Fetches the active
 * expiry-type catalogue on mount (`GET /api/v1/expiry-types`,
 * `expiries.manage` — the same permission this form is already gated
 * behind) and filters it to types compatible with the person's active
 * profiles — `registerExpiry` re-verifies regardless (Dev Notes). 409/422
 * are mapped per-cause: `SCOPE_MISMATCH` gets its own message (a scope
 * change on the catalogue between load and submit), any other 409
 * (archived person / deactivated type / duplicate) gets one shared
 * conflict message (none of those are further distinguishable by code).
 */
function RegisterExpiryForm({ personId, activeProfiles, labels, onCancel, onSuccess }: RegisterExpiryFormProps) {
  const [types, setTypes] = useState<ExpiryTypeItemDto[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadTypesOnMount(): Promise<void> {
      const response = await fetch('/api/v1/expiry-types');
      if (cancelled) return;
      if (!response.ok) {
        setTypes([]);
        return;
      }
      const body = (await response.json()) as ExpiryTypeItemDto[];
      setTypes(body.filter((type) => isScopeCompatible(type.scope, activeProfiles)));
    }
    void loadTypesOnMount();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `activeProfiles` is a fresh object each render (server-derived prop); only `personId`'s page identity should retrigger the fetch, same pattern as the other on-mount fetch effects in this file.
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterExpiryFormValues>({
    resolver: zodResolver(registerExpiryFormSchema),
    defaultValues: { expiryTypeId: '', issuedAt: todayDateOnly(), expiresAt: '', notes: '' },
  });

  async function onSubmit(values: RegisterExpiryFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch('/api/v1/expiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personId,
        expiryTypeId: values.expiryTypeId,
        issuedAt: values.issuedAt,
        expiresAt: values.expiresAt,
        notes: values.notes.trim() === '' ? undefined : values.notes.trim(),
      }),
    });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(
        code === 'SCOPE_MISMATCH' ? labels.scopeMismatchError : response.status === 409 ? labels.conflictError : labels.genericError,
      );
      return;
    }

    onSuccess();
  }

  const noCompatibleTypes = types !== null && types.length === 0;
  const inputClasses =
    'mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437] disabled:cursor-not-allowed disabled:bg-[#F7F6F3]';

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-[8px] border border-[#EAEAEA] p-4"
      data-testid="register-expiry-form"
    >
      <h4 className="text-base font-medium text-[#111111]">{labels.title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="expiry-type" className="block text-sm font-medium text-[#2F3437]">
            {labels.type}
          </label>
          <select id="expiry-type" aria-invalid={Boolean(errors.expiryTypeId)} disabled={noCompatibleTypes} className={inputClasses} {...register('expiryTypeId')}>
            <option value="" disabled>
              {labels.type}
            </option>
            {(types ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          {noCompatibleTypes ? <p className="mt-1 text-xs text-[#787774]">{labels.noCompatibleTypes}</p> : null}
          {errors.expiryTypeId ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="expiry-issued-at" className="block text-sm font-medium text-[#2F3437]">
            {labels.issuedAt}
          </label>
          <input id="expiry-issued-at" type="date" aria-invalid={Boolean(errors.issuedAt)} className={inputClasses} {...register('issuedAt')} />
          {errors.issuedAt ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="expiry-expires-at" className="block text-sm font-medium text-[#2F3437]">
            {labels.expiresAt}
          </label>
          <input id="expiry-expires-at" type="date" aria-invalid={Boolean(errors.expiresAt)} className={inputClasses} {...register('expiresAt')} />
          {errors.expiresAt ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.invalidRange}</p> : null}
        </div>
        <div>
          <label htmlFor="expiry-notes" className="block text-sm font-medium text-[#2F3437]">
            {labels.notes}
          </label>
          <input id="expiry-notes" maxLength={500} className={inputClasses} {...register('notes')} />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="register-expiry-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting || noCompatibleTypes}
          className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.submit}
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

const editExpiryFormSchema = z
  .object({
    issuedAt: z.string().trim().min(1),
    expiresAt: z.string().trim().min(1),
    notes: z.string(),
  })
  .refine((value) => value.expiresAt >= value.issuedAt, { message: 'invalidRange', path: ['expiresAt'] });

type EditExpiryFormValues = z.infer<typeof editExpiryFormSchema>;

type EditExpiryRowFormProps = {
  expiry: ExpiryItemDto;
  labels: ExpiriesPanelLabels['form'];
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * Per-row partial edit (story 6.2, AC 1). Deliberately mounted only while
 * `isEditing` (its parent `ExpiryRow` swaps this in for the view row) —
 * `useForm`'s `defaultValues` are therefore read fresh from the CURRENT
 * `expiry` prop every time editing (re)opens, never stale ones from an
 * earlier mount (review 2.4 F1 lesson).
 */
function EditExpiryRowForm({ expiry, labels, onCancel, onSuccess }: EditExpiryRowFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditExpiryFormValues>({
    resolver: zodResolver(editExpiryFormSchema),
    defaultValues: { issuedAt: expiry.issuedAt, expiresAt: expiry.expiresAt, notes: expiry.notes ?? '' },
  });

  async function onSubmit(values: EditExpiryFormValues): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/expiries/${expiry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuedAt: values.issuedAt,
        expiresAt: values.expiresAt,
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      }),
    });

    if (!response.ok) {
      setFormError(response.status === 422 ? labels.invalidRange : labels.genericError);
      return;
    }

    onSuccess();
  }

  const inputClasses =
    'mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      data-testid="edit-expiry-form"
    >
      <div>
        <label htmlFor={`edit-issued-at-${expiry.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.issuedAt}
        </label>
        <input id={`edit-issued-at-${expiry.id}`} type="date" aria-invalid={Boolean(errors.issuedAt)} className={inputClasses} {...register('issuedAt')} />
      </div>
      <div>
        <label htmlFor={`edit-expires-at-${expiry.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.expiresAt}
        </label>
        <input
          id={`edit-expires-at-${expiry.id}`}
          type="date"
          aria-invalid={Boolean(errors.expiresAt)}
          className={inputClasses}
          {...register('expiresAt')}
        />
        {errors.expiresAt ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.invalidRange}</p> : null}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`edit-notes-${expiry.id}`} className="block text-sm font-medium text-[#2F3437]">
          {labels.notes}
        </label>
        <input id={`edit-notes-${expiry.id}`} maxLength={500} className={inputClasses} {...register('notes')} />
      </div>

      {formError ? (
        <p role="alert" data-testid="edit-expiry-form-error" className="sm:col-span-2 rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3 sm:col-span-2">
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
