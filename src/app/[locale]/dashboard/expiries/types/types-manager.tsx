'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable, TruncatedCell } from '@/components/data-table';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { Card } from '@/components/ui/card';
import { PencilIcon, ToggleIcon, TrashIcon } from '@/components/ui/icons';

export type ExpiryScopeValue = 'PILOTS' | 'STUDENTS' | 'INSTRUCTORS' | 'ALL';

export type ExpiryTypeRow = {
  id: string;
  name: string;
  scope: ExpiryScopeValue;
  isActive: boolean;
  /** Whether an expired scadenza of this type blocks a new booking (epic 7, story 7.4; FR-21). */
  blocksBooking: boolean;
};

export type TypesManagerLabels = {
  newType: string;
  table: { name: string; scope: string; status: string; blocksBooking: string; actions: string; empty: string };
  /** `scope → label` map (Dev Notes: MAI l'enum raw in UI). */
  scope: Record<ExpiryScopeValue, string>;
  status: { active: string; inactive: string };
  /** "Blocca prenotazioni" list badge (story 7.4) — yes/no, same `Record`-map-not-raw-boolean convention as `status`. */
  blocksBooking: { yes: string; no: string };
  actions: {
    edit: string;
    deactivate: string;
    reactivate: string;
    delete: string;
    confirmDelete: string;
    confirmYes: string;
    confirmCancel: string;
  };
  form: {
    createTitle: string;
    editTitle: string;
    name: string;
    scope: string;
    /** "Blocca prenotazioni" checkbox label (story 7.4). */
    blocksBooking: string;
    blocksBookingHint: string;
    submitCreate: string;
    submitSave: string;
    cancel: string;
    requiredField: string;
    conflictError: string;
    genericError: string;
  };
  feedback: {
    created: string;
    updated: string;
    deactivated: string;
    reactivated: string;
    deleted: string;
    deleteInUseError: string;
    genericError: string;
  };
};

type TypesManagerProps = {
  expiryTypes: ExpiryTypeRow[];
  /** `settings.manage` — hides every write control for an `expiries.manage`-only (staff) viewer. */
  canManage: boolean;
  labels: TypesManagerLabels;
};

type Panel = { mode: 'create' } | { mode: 'edit'; expiryType: ExpiryTypeRow };

const SCOPE_VALUES: ExpiryScopeValue[] = ['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL'];

/**
 * Admin expiry-type management (story 6.1, Task 4, AC 1/2) — mirrors
 * `categories-manager.tsx` (story 3.4) with the partial-edit shape and
 * `canManage`-gated actions column of `packages-manager.tsx` (story 4.3):
 * list with lifecycle status, create/edit panels, a deactivate/reactivate
 * toggle (a plain `PATCH { isActive }` — no dedicated lifecycle endpoint,
 * following `PackageType`'s pattern) and a two-step delete. An
 * `expiries.manage`-only (staff) viewer gets the read-only catalogue: same
 * table, no "new type" button, no actions column.
 */
export function TypesManager({ expiryTypes, canManage, labels }: TypesManagerProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function handleSuccess(message: string): void {
    setPanel(null);
    setFeedback({ text: message, isError: false });
    router.refresh();
  }

  async function handleToggleActive(expiryType: ExpiryTypeRow): Promise<void> {
    setPendingActionId(expiryType.id);
    const response = await fetch(`/api/v1/expiry-types/${expiryType.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !expiryType.isActive }),
    });
    setPendingActionId(null);
    if (response.ok) {
      setFeedback({
        text: expiryType.isActive ? labels.feedback.deactivated : labels.feedback.reactivated,
        isError: false,
      });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  async function handleDelete(expiryType: ExpiryTypeRow): Promise<void> {
    setPendingActionId(expiryType.id);
    const response = await fetch(`/api/v1/expiry-types/${expiryType.id}`, { method: 'DELETE' });
    setPendingActionId(null);
    setConfirmingDeleteId(null);
    if (response.ok) {
      setFeedback({ text: labels.feedback.deleted, isError: false });
    } else if (response.status === 409) {
      // AC 2: a type already in use (story 6.2 onwards) is not deletable — deactivate instead.
      setFeedback({ text: labels.feedback.deleteInUseError, isError: true });
    } else {
      setFeedback({ text: labels.feedback.genericError, isError: true });
    }
    router.refresh();
  }

  const columns: ColumnDef<ExpiryTypeRow, unknown>[] = [
    {
      id: 'name',
      header: labels.table.name,
      cell: ({ row }) => <TruncatedCell value={row.original.name} className="max-w-[220px] font-medium text-ink" />,
    },
    {
      id: 'scope',
      header: labels.table.scope,
      cell: ({ row }) => <Badge>{labels.scope[row.original.scope]}</Badge>,
    },
    {
      id: 'status',
      header: labels.table.status,
      cell: ({ row }) => (
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${
            row.original.isActive ? 'bg-[#EDF3EC] text-[#346538]' : 'bg-[#FBF3DB] text-[#956400]'
          }`}
        >
          {row.original.isActive ? labels.status.active : labels.status.inactive}
        </span>
      ),
    },
    {
      // Story 7.4 (FR-21): list badge — only a "Blocca prenotazioni" TRUE
      // type gets a visible badge (amber, same palette as the "Disattivato"
      // status badge above — both signal "pay attention"); `false` renders
      // nothing rather than a second low-signal badge on every row.
      id: 'blocksBooking',
      header: labels.table.blocksBooking,
      cell: ({ row }) =>
        row.original.blocksBooking ? (
          <span className="rounded-full bg-[#FBF3DB] px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] text-[#956400]">
            {labels.blocksBooking.yes}
          </span>
        ) : (
          <span className="text-xs text-mid-gray">{labels.blocksBooking.no}</span>
        ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: labels.table.actions,
            cell: ({ row }: { row: { original: ExpiryTypeRow } }) => {
              const expiryType = row.original;

              if (confirmingDeleteId === expiryType.id) {
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-mid-gray">{labels.actions.confirmDelete}</span>
                    <Button size="sm"
                      type="button"
                      disabled={pendingActionId === expiryType.id}
                      onClick={() => void handleDelete(expiryType)}
                    >
                      {labels.actions.confirmYes}
                    </Button>
                    <Button variant="outline" size="sm"
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      {labels.actions.confirmCancel}
                    </Button>
                  </div>
                );
              }

              return (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={() => setPanel({ mode: 'edit', expiryType })}
                    aria-label={labels.actions.edit}
                    title={labels.actions.edit}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    disabled={pendingActionId === expiryType.id}
                    onClick={() => void handleToggleActive(expiryType)}
                    aria-label={expiryType.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                    title={expiryType.isActive ? labels.actions.deactivate : labels.actions.reactivate}
                  >
                    <ToggleIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    disabled={pendingActionId === expiryType.id}
                    onClick={() => setConfirmingDeleteId(expiryType.id)}
                    aria-label={labels.actions.delete}
                    title={labels.actions.delete}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {feedback ? (
          <p
            role="status"
            data-testid="expiry-types-feedback"
            className={`text-sm ${feedback.isError ? 'text-[#9F2F2D]' : 'text-[#346538]'}`}
          >
            {feedback.text}
          </p>
        ) : (
          <span />
        )}
        {canManage ? (
          <Button
            type="button"
            onClick={() => setPanel({ mode: 'create' })}
          >
            {labels.newType}
          </Button>
        ) : null}
      </div>

      {panel ? (
        <Card className="mt-6 p-6">
          <ExpiryTypeForm
            // Remount when the target changes (create ↔ edit A ↔ edit B):
            // react-hook-form reads defaultValues only at mount (review 2.4 F1 pattern).
            key={panel.mode === 'edit' ? panel.expiryType.id : 'create'}
            expiryType={panel.mode === 'edit' ? panel.expiryType : null}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={(mode) => handleSuccess(mode === 'create' ? labels.feedback.created : labels.feedback.updated)}
          />
        </Card>
      ) : null}

      <div className="mt-6" data-testid="expiry-types-table">
        <DataTable columns={columns} data={expiryTypes} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

const expiryTypeFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(['PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL']),
  blocksBooking: z.boolean(),
});

type ExpiryTypeFormValues = z.infer<typeof expiryTypeFormSchema>;

type ExpiryTypeFormProps = {
  /** `null` = create mode; a row = edit mode. */
  expiryType: ExpiryTypeRow | null;
  labels: TypesManagerLabels;
  onCancel: () => void;
  onSuccess: (mode: 'create' | 'edit') => void;
};

function ExpiryTypeForm({ expiryType, labels, onCancel, onSuccess }: ExpiryTypeFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpiryTypeFormValues>({
    resolver: zodResolver(expiryTypeFormSchema),
    defaultValues: { name: expiryType?.name ?? '', scope: expiryType?.scope ?? 'ALL', blocksBooking: expiryType?.blocksBooking ?? false },
  });

  async function onSubmit(values: ExpiryTypeFormValues): Promise<void> {
    setFormError(null);
    const body = { name: values.name.trim(), scope: values.scope, blocksBooking: values.blocksBooking };

    const response = expiryType
      ? await fetch(`/api/v1/expiry-types/${expiryType.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      : await fetch('/api/v1/expiry-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

    if (!response.ok) {
      setFormError(response.status === 409 ? labels.form.conflictError : labels.form.genericError);
      return;
    }

    onSuccess(expiryType ? 'edit' : 'create');
  }

  const inputClasses = cn(inputBaseClasses, 'mt-2 w-full max-w-md');

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4" data-testid="expiry-type-form">
      <h4 className="text-base font-medium text-ink">{expiryType ? labels.form.editTitle : labels.form.createTitle}</h4>
      <div>
        <label htmlFor="expiry-type-name" className="block text-sm font-medium text-ink">
          {labels.form.name}
        </label>
        <input
          id="expiry-type-name"
          maxLength={100}
          aria-invalid={Boolean(errors.name)}
          className={inputClasses}
          {...register('name')}
        />
        {errors.name ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
      </div>

      <div>
        <label htmlFor="expiry-type-scope" className="block text-sm font-medium text-ink">
          {labels.form.scope}
        </label>
        <select id="expiry-type-scope" className={inputClasses} {...register('scope')}>
          {SCOPE_VALUES.map((scope) => (
            <option key={scope} value={scope}>
              {labels.scope[scope]}
            </option>
          ))}
        </select>
      </div>

      {/* "Blocca prenotazioni" (story 7.4, AC 1) — a plain checkbox, not
          hidden behind an "advanced" toggle: this IS the field that decides
          whether an expired scadenza of this type blocks a booking, so it
          deserves the same visibility as name/scope. */}
      <div>
        <Switch label={labels.form.blocksBooking} labelClassName="font-medium" {...register('blocksBooking')} />
        <p className="mt-1 pl-[46px] text-xs text-mid-gray">{labels.form.blocksBookingHint}</p>
      </div>

      {formError ? (
        <p role="alert" data-testid="expiry-type-form-error" className="text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {expiryType ? labels.form.submitSave : labels.form.submitCreate}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
        >
          {labels.form.cancel}
        </Button>
      </div>
    </form>
  );
}
