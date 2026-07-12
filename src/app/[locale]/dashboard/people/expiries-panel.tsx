'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ExpiryTypeItemDto } from '@/lib/schemas/expiry-types';
import type { ExpiryItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';
import { ExpiryStatusBadge } from '../expiries/expiry-status-badge';
import { TruncatedCell } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { Card } from '@/components/ui/card';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';

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
    datePicker: DatePickerLabels;
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
    <Card className="p-6" data-testid="expiries-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{labels.heading}</h3>
        {canManage && !formOpen ? (
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
        {loadError ? <p className="text-sm text-ember">{labels.loadError}</p> : null}
        {!loadError && expiries !== null && expiries.length === 0 ? <p className="text-sm text-mid-gray">{labels.empty}</p> : null}
        {!loadError && expiries !== null && expiries.length > 0 ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
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
          </Card>
        ) : null}
      </div>
    </Card>
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
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);

  if (isEditing) {
    return (
      <tr data-testid="expiry-row-editing" className="border-b border-hairline">
        <td colSpan={canManage ? 6 : 5} className="py-4">
          <EditExpiryRowForm expiry={expiry} labels={labels.form} onCancel={onCancelEdit} onSuccess={onSaved} />
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid="expiry-row" className="border-b border-hairline align-top text-ink">
      <td className="py-3 pr-4">
        <TruncatedCell value={expiry.typeName} className="max-w-[180px] font-medium" />
        {expiry.pendingProposal ? (
          <Badge data-testid="expiry-pending-badge" className="mt-1">
            {labels.table.pendingBadge}
          </Badge>
        ) : null}
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">{formatDateOnly(expiry.issuedAt, moneyLocale)}</td>
      <td className="py-3 pr-4 whitespace-nowrap">{formatDateOnly(expiry.expiresAt, moneyLocale)}</td>
      <td className="py-3 pr-4">
        <ExpiryStatusBadge status={expiry.status} label={labels.table.status[expiry.status]} data-testid="expiry-status-badge" />
      </td>
      <td className="py-3 pr-4 text-mid-gray">{expiry.notes ?? labels.table.noNotes}</td>
      {canManage ? (
        <td className="py-3">
          {isConfirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-mid-gray">{labels.actions.confirmDelete}</span>
              <Button size="sm"
                type="button"
                onClick={onConfirmDelete}
              >
                {labels.actions.confirmYes}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={onCancelDelete}
              >
                {labels.actions.confirmCancel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm"
                type="button"
                onClick={onEdit}
              >
                {labels.form.edit}
              </Button>
              <Button variant="outline" size="sm"
                type="button"
                onClick={onRequestDelete}
              >
                {labels.actions.delete}
              </Button>
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

  const [issuedAtValue, setIssuedAtValue] = useState(todayDateOnly());
  const [expiresAtValue, setExpiresAtValue] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
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
  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[44px] w-full');

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="space-y-4 rounded-nested border border-hairline p-4"
      data-testid="register-expiry-form"
    >
      <h4 className="text-base font-medium text-ink">{labels.title}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="expiry-type" className="block text-sm font-medium text-ink">
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
          {noCompatibleTypes ? <p className="mt-1 text-xs text-mid-gray">{labels.noCompatibleTypes}</p> : null}
          {errors.expiryTypeId ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>
        <div>
          <DatePicker
            id="expiry-issued-at"
            label={labels.issuedAt}
            value={issuedAtValue}
            onChange={(next) => {
              setIssuedAtValue(next);
              setValue('issuedAt', next);
            }}
            labels={labels.datePicker}
            ariaInvalid={Boolean(errors.issuedAt)}
          />
          {errors.issuedAt ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>
        <div>
          <DatePicker
            id="expiry-expires-at"
            label={labels.expiresAt}
            value={expiresAtValue}
            onChange={(next) => {
              setExpiresAtValue(next);
              setValue('expiresAt', next);
            }}
            labels={labels.datePicker}
            ariaInvalid={Boolean(errors.expiresAt)}
          />
          {errors.expiresAt ? <p className="mt-1 text-xs text-ember">{labels.invalidRange}</p> : null}
        </div>
        <div>
          <label htmlFor="expiry-notes" className="block text-sm font-medium text-ink">
            {labels.notes}
          </label>
          <input id="expiry-notes" maxLength={500} className={inputClasses} {...register('notes')} />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="register-expiry-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || noCompatibleTypes}
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
  const [issuedAtValue, setIssuedAtValue] = useState(expiry.issuedAt);
  const [expiresAtValue, setExpiresAtValue] = useState(expiry.expiresAt);

  const {
    register,
    handleSubmit,
    setValue,
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

  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[44px] w-full');

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      data-testid="edit-expiry-form"
    >
      <div>
        <DatePicker
          id={`edit-issued-at-${expiry.id}`}
          label={labels.issuedAt}
          value={issuedAtValue}
          onChange={(next) => {
            setIssuedAtValue(next);
            setValue('issuedAt', next);
          }}
          labels={labels.datePicker}
          ariaInvalid={Boolean(errors.issuedAt)}
        />
      </div>
      <div>
        <DatePicker
          id={`edit-expires-at-${expiry.id}`}
          label={labels.expiresAt}
          value={expiresAtValue}
          onChange={(next) => {
            setExpiresAtValue(next);
            setValue('expiresAt', next);
          }}
          labels={labels.datePicker}
          ariaInvalid={Boolean(errors.expiresAt)}
        />
        {errors.expiresAt ? <p className="mt-1 text-xs text-ember">{labels.invalidRange}</p> : null}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`edit-notes-${expiry.id}`} className="block text-sm font-medium text-ink">
          {labels.notes}
        </label>
        <input id={`edit-notes-${expiry.id}`} maxLength={500} className={inputClasses} {...register('notes')} />
      </div>

      {formError ? (
        <p role="alert" data-testid="edit-expiry-form-error" className="sm:col-span-2 rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3 sm:col-span-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px]"
        >
          {labels.save}
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
