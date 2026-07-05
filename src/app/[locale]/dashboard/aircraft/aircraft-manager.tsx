'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { DataTable } from '@/components/data-table';
import { useRouter } from '@/i18n/navigation';
import {
  createAircraftSchema,
  updateAircraftSchema,
  type CreateAircraftInput,
  type UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import { formatMinutes } from '@/lib/time';

export type AircraftRow = {
  id: string;
  registration: string;
  type: string;
  model: string;
  /** Integer number of minutes (AD-2) — never a decimal-hours value. */
  hourMeterMinutes: number;
  notes: string | null;
  /** ISO 8601 string (server `Date` already serialized) or `null` if active. */
  archivedAt: string | null;
};

type Labels = {
  newAircraft: string;
  searchPlaceholder: string;
  includeArchivedLabel: string;
  table: {
    registration: string;
    type: string;
    model: string;
    hourMeter: string;
    status: string;
    actions: string;
    empty: string;
  };
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
    registration: string;
    type: string;
    model: string;
    hourMeter: string;
    hourMeterHint: string;
    notes: string;
    submitCreate: string;
    submitEdit: string;
    cancel: string;
    requiredField: string;
    invalidHourMeter: string;
    genericError: string;
    conflictError: string;
  };
  feedback: { created: string; updated: string; archived: string; unarchived: string };
};

type AircraftManagerProps = {
  aircraft: AircraftRow[];
  initialQuery: string;
  initialIncludeArchived: boolean;
  labels: Labels;
};

type Panel = { mode: 'create' } | { mode: 'edit'; aircraft: AircraftRow };
type ConfirmState = { id: string; type: 'archive' | 'unarchive' };

function statusLabel(aircraft: AircraftRow, labels: Labels): string {
  return aircraft.archivedAt ? labels.status.archived : labels.status.active;
}

function statusBadgeClasses(aircraft: AircraftRow): string {
  return aircraft.archivedAt ? 'bg-[#FBF3DB] text-[#956400]' : 'bg-[#EDF3EC] text-[#346538]';
}

/** Same `H:MM` display as the input's live preview — a malformed/negative value never crashes the row render. */
function safeFormatMinutes(totalMinutes: number): string {
  try {
    return formatMinutes(totalMinutes);
  } catch {
    return '—';
  }
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

export function AircraftManager({ aircraft, initialQuery, initialIncludeArchived, labels }: AircraftManagerProps) {
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
    router.push(`/dashboard/aircraft${search ? `?${search}` : ''}`);
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

  async function handleArchiveToggle(row: AircraftRow, type: 'archive' | 'unarchive'): Promise<void> {
    setPendingActionId(row.id);
    const response = await fetch(`/api/v1/aircraft/${row.id}/${type}`, { method: 'POST' });
    setPendingActionId(null);
    setConfirming(null);
    if (response.ok) {
      setFeedback(type === 'archive' ? labels.feedback.archived : labels.feedback.unarchived);
      router.refresh();
    } else {
      // e.g. 409 from a concurrent state change: surface it instead of
      // leaving the row untouched with no explanation (same pattern as
      // people-manager.tsx, review 2.1 F1).
      setFeedback(labels.form.genericError);
      router.refresh();
    }
  }

  function handleFormSuccess(message: string): void {
    setPanel(null);
    setFeedback(message);
    router.refresh();
  }

  const columns: ColumnDef<AircraftRow, unknown>[] = [
    {
      id: 'registration',
      header: labels.table.registration,
      cell: ({ row }) => <span className="font-medium text-[#111111]">{row.original.registration}</span>,
    },
    {
      id: 'type',
      header: labels.table.type,
      cell: ({ row }) => row.original.type,
    },
    {
      id: 'model',
      header: labels.table.model,
      cell: ({ row }) => row.original.model,
    },
    {
      id: 'hourMeter',
      header: labels.table.hourMeter,
      // AD-2: the wire/model value stays an integer number of minutes;
      // `H:MM` is presentation only, computed here for display.
      cell: ({ row }) => safeFormatMinutes(row.original.hourMeterMinutes),
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
        const item = row.original;
        const isArchived = item.archivedAt !== null;
        const actionType: 'archive' | 'unarchive' = isArchived ? 'unarchive' : 'archive';

        if (confirming?.id === item.id) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#787774]">
                {isArchived ? labels.actions.confirmUnarchive : labels.actions.confirmArchive}
              </span>
              <button
                type="button"
                disabled={pendingActionId === item.id}
                onClick={() => void handleArchiveToggle(item, actionType)}
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
              onClick={() => setPanel({ mode: 'edit', aircraft: item })}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {labels.actions.edit}
            </button>
            <button
              type="button"
              disabled={pendingActionId === item.id}
              onClick={() => setConfirming({ id: item.id, type: actionType })}
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
          <p role="status" data-testid="aircraft-feedback" className="text-sm text-[#346538]">
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
          {labels.newAircraft}
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
          <CreateAircraftForm labels={labels} onCancel={() => setPanel(null)} onSuccess={handleFormSuccess} />
        </div>
      ) : null}

      {panel?.mode === 'edit' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <EditAircraftForm
            // Remount when the edit target changes: react-hook-form reads
            // defaultValues only at mount, so without the key switching from
            // aircraft A to B keeps A's field values and PATCHes them onto B
            // (review 2.4 F1).
            key={panel.aircraft.id}
            aircraft={panel.aircraft}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <DataTable columns={columns} data={aircraft} emptyMessage={labels.table.empty} />
      </div>
    </div>
  );
}

/**
 * Live `H:MM` preview next to the minutes input (Dev Notes: "input in minuti
 * con visualizzazione hh:mm accanto") — presentation only, never fed back
 * into the form value (AD-2: the wire/model value is always the raw integer
 * minutes typed by the user).
 */
function HourMeterHint({ minutes }: { minutes: number }): React.JSX.Element {
  if (!Number.isInteger(minutes) || minutes < 0) {
    return <span className="text-[#9F2F2D]">—:—</span>;
  }
  return <span>{formatMinutes(minutes)}</span>;
}

type CreateAircraftFormProps = {
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

function CreateAircraftForm({ labels, onCancel, onSuccess }: CreateAircraftFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  // Mirrors the hour meter input's raw value for the live `H:MM` hint (Dev
  // Notes). Deliberately *not* read via react-hook-form's `watch()`/
  // `useWatch()` — both are flagged by the React Compiler as unmemoizable
  // (see data-table.tsx's own documented exception) and would add a second
  // warning here; a plain `onChange`-driven state mirror avoids that while
  // never feeding back into the form's own value (AD-2 stays the single
  // source of truth for the submitted integer).
  const [hourMeterMinutes, setHourMeterMinutes] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createAircraftSchema>, unknown, CreateAircraftInput>({
    resolver: zodResolver(createAircraftSchema),
    defaultValues: { registration: '', type: '', model: '', hourMeterMinutes: 0, notes: null },
  });

  async function onSubmit(values: CreateAircraftInput): Promise<void> {
    setFormError(null);
    const response = await fetch('/api/v1/aircraft', {
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

      <AircraftFields
        register={register}
        errors={errors}
        labels={labels}
        idPrefix="create"
        hourMeterMinutes={hourMeterMinutes}
        onHourMeterMinutesChange={setHourMeterMinutes}
      />

      {formError ? (
        <p role="alert" data-testid="aircraft-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.form.submitCreate} cancelLabel={labels.form.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

type EditAircraftFormProps = {
  aircraft: AircraftRow;
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

function EditAircraftForm({ aircraft, labels, onCancel, onSuccess }: EditAircraftFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  // See the matching comment in `CreateAircraftForm` — a local mirror avoids
  // the React Compiler's "incompatible library" warning that `watch()`/
  // `useWatch()` would add on top of `data-table.tsx`'s existing one.
  const [hourMeterMinutes, setHourMeterMinutes] = useState(aircraft.hourMeterMinutes);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAircraftInput>({
    resolver: zodResolver(updateAircraftSchema),
    defaultValues: {
      registration: aircraft.registration,
      type: aircraft.type,
      model: aircraft.model,
      hourMeterMinutes: aircraft.hourMeterMinutes,
      notes: aircraft.notes,
    },
  });

  async function onSubmit(values: UpdateAircraftInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}`, {
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

      <AircraftFields
        register={register}
        errors={errors}
        labels={labels}
        idPrefix="edit"
        hourMeterMinutes={hourMeterMinutes}
        onHourMeterMinutesChange={setHourMeterMinutes}
      />

      {formError ? (
        <p role="alert" data-testid="aircraft-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.form.submitEdit} cancelLabel={labels.form.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

/**
 * Shared field set for create/edit. `register` is typed loosely (both forms'
 * input shapes only differ in whether fields are required) since both
 * `CreateAircraftInput`/`UpdateAircraftInput` share every field name — same
 * pattern as `PersonFields` in people-manager.tsx.
 */
function AircraftFields({
  register,
  errors,
  labels,
  idPrefix,
  hourMeterMinutes,
  onHourMeterMinutesChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared across two distinct RHF instances (create/edit); field names are identical.
  register: any;
  errors: { registration?: unknown; type?: unknown; model?: unknown; hourMeterMinutes?: unknown };
  labels: Labels;
  idPrefix: string;
  /** Local mirror of the hour-meter input, for the live `H:MM` hint — see the form components' comments. */
  hourMeterMinutes: number;
  onHourMeterMinutesChange: (minutes: number) => void;
}) {
  const inputClasses =
    'mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `register()`'s return type is only known on the concrete RHF instance, erased above.
  const hourMeterField = register('hourMeterMinutes', { valueAsNumber: true }) as any;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-registration`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.registration}
          </label>
          <input
            id={`${idPrefix}-registration`}
            className={inputClasses}
            aria-invalid={Boolean(errors.registration)}
            {...register('registration')}
          />
          {errors.registration ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-type`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.type}
          </label>
          <input id={`${idPrefix}-type`} className={inputClasses} aria-invalid={Boolean(errors.type)} {...register('type')} />
          {errors.type ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.requiredField}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-model`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.model}
          </label>
          <input id={`${idPrefix}-model`} className={inputClasses} aria-invalid={Boolean(errors.model)} {...register('model')} />
          {errors.model ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-hourMeterMinutes`} className="block text-sm font-medium text-[#2F3437]">
            {labels.form.hourMeter}
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id={`${idPrefix}-hourMeterMinutes`}
              type="number"
              step={1}
              min={0}
              inputMode="numeric"
              aria-invalid={Boolean(errors.hourMeterMinutes)}
              className={`${inputClasses} mt-0 max-w-[140px]`}
              {...hourMeterField}
              onChange={(event) => {
                // Compose react-hook-form's own `onChange` (keeps the
                // submitted value as the single source of truth, AD-2) with
                // a plain state mirror for the live hint — see the form
                // components' comments for why this isn't `watch()`.
                void hourMeterField.onChange(event);
                onHourMeterMinutesChange(event.target.valueAsNumber);
              }}
            />
            <span className="font-[family-name:var(--font-mono,monospace)] text-sm text-[#787774]" data-testid={`${idPrefix}-hour-meter-hint`}>
              (<HourMeterHint minutes={hourMeterMinutes} />)
            </span>
          </div>
          <p className="mt-1 text-xs text-[#787774]">{labels.form.hourMeterHint}</p>
          {errors.hourMeterMinutes ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.invalidHourMeter}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-notes`} className="block text-sm font-medium text-[#2F3437]">
          {labels.form.notes}
        </label>
        <input
          id={`${idPrefix}-notes`}
          className={inputClasses}
          // Empty input means "no note": map '' to null so clearing the field
          // deletes the note instead of silently failing the `.min(1)`
          // validation with no rendered error (review 2.4 F3).
          {...register('notes', { setValueAs: (value: string) => (value === '' ? null : value) })}
        />
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
