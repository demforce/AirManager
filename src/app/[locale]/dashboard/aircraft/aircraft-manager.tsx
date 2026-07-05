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
  createHourMeterAdjustmentSchema,
  setOutOfServiceSchema,
  updateAircraftSchema,
  type CreateAircraftInput,
  type CreateHourMeterAdjustmentInput,
  type HourMeterAdjustmentListItemDto,
  type SetOutOfServiceInput,
  type UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import { formatDateTime, formatMinutes } from '@/lib/time';

export type AircraftRow = {
  id: string;
  registration: string;
  type: string;
  model: string;
  /** Integer number of minutes (AD-2) — never a decimal-hours value. */
  hourMeterMinutes: number;
  notes: string | null;
  /** Operational status (story 2.5, AC 1) — independent of `archivedAt`. */
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  /** Populated only while `status === 'OUT_OF_SERVICE'`. */
  statusReason: string | null;
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
    operationalStatus: string;
    actions: string;
    empty: string;
  };
  status: { active: string; archived: string };
  operationalStatus: { operational: string; outOfService: string };
  actions: {
    edit: string;
    archive: string;
    unarchive: string;
    confirmArchive: string;
    confirmUnarchive: string;
    confirmYes: string;
    confirmCancel: string;
    setOutOfService: string;
    returnToService: string;
    confirmReturnToService: string;
    adjustHourMeter: string;
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
  statusForm: {
    title: string;
    reason: string;
    reasonRequired: string;
    submit: string;
    cancel: string;
    conflictError: string;
    genericError: string;
  };
  hourMeterPanel: {
    title: string;
    current: string;
    newValue: string;
    hint: string;
    reason: string;
    delta: string;
    submit: string;
    cancel: string;
    requiredField: string;
    invalidValue: string;
    genericError: string;
    historyTitle: string;
    historyEmpty: string;
    historyWhen: string;
    historyActor: string;
    historyPrevious: string;
    historyNew: string;
    historyDelta: string;
    historyReason: string;
  };
  feedback: {
    created: string;
    updated: string;
    archived: string;
    unarchived: string;
    setOutOfService: string;
    returnedToService: string;
    hourMeterAdjusted: string;
  };
};

type AircraftManagerProps = {
  aircraft: AircraftRow[];
  initialQuery: string;
  initialIncludeArchived: boolean;
  labels: Labels;
};

type Panel =
  | { mode: 'create' }
  | { mode: 'edit'; aircraft: AircraftRow }
  | { mode: 'out-of-service'; aircraft: AircraftRow }
  | { mode: 'hour-meter'; aircraft: AircraftRow };
type ConfirmState = { id: string; type: 'archive' | 'unarchive' | 'return-to-service' };

function statusLabel(aircraft: AircraftRow, labels: Labels): string {
  return aircraft.archivedAt ? labels.status.archived : labels.status.active;
}

function statusBadgeClasses(aircraft: AircraftRow): string {
  return aircraft.archivedAt ? 'bg-[#FBF3DB] text-[#956400]' : 'bg-[#EDF3EC] text-[#346538]';
}

/** Operational status badge (story 2.5, AC 1) — distinct from the archive badge above. */
function operationalStatusLabel(aircraft: AircraftRow, labels: Labels): string {
  return aircraft.status === 'OUT_OF_SERVICE' ? labels.operationalStatus.outOfService : labels.operationalStatus.operational;
}

function operationalStatusBadgeClasses(aircraft: AircraftRow): string {
  return aircraft.status === 'OUT_OF_SERVICE' ? 'bg-[#FBF3DB] text-[#956400]' : 'bg-[#EDF3EC] text-[#346538]';
}

/** Signed `H:MM` delta preview (e.g. `+1:30`/`-0:45`) for the hour-meter adjustment form/history. */
function formatSignedMinutes(deltaMinutes: number): string {
  if (!Number.isInteger(deltaMinutes)) return '—';
  const sign = deltaMinutes < 0 ? '-' : '+';
  return `${sign}${formatMinutes(Math.abs(deltaMinutes))}`;
}

/** Endpoint suffix + feedback message for each two-step-confirm action (`handleStateAction`). */
const STATE_ACTION_FEEDBACK: Record<ConfirmState['type'], (labels: Labels) => string> = {
  archive: (l) => l.feedback.archived,
  unarchive: (l) => l.feedback.unarchived,
  'return-to-service': (l) => l.feedback.returnedToService,
};

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

  async function handleStateAction(row: AircraftRow, type: ConfirmState['type']): Promise<void> {
    setPendingActionId(row.id);
    const response = await fetch(`/api/v1/aircraft/${row.id}/${type}`, { method: 'POST' });
    setPendingActionId(null);
    setConfirming(null);
    if (response.ok) {
      setFeedback(STATE_ACTION_FEEDBACK[type](labels));
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
      id: 'operationalStatus',
      header: labels.table.operationalStatus,
      cell: ({ row }) => (
        <span
          title={row.original.statusReason ?? undefined}
          data-testid={`operational-status-${row.original.id}`}
          className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.05em] ${operationalStatusBadgeClasses(row.original)}`}
        >
          {operationalStatusLabel(row.original, labels)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: labels.table.actions,
      cell: ({ row }) => {
        const item = row.original;
        const isArchived = item.archivedAt !== null;
        const archiveActionType: 'archive' | 'unarchive' = isArchived ? 'unarchive' : 'archive';
        const isOutOfService = item.status === 'OUT_OF_SERVICE';

        if (confirming?.id === item.id) {
          const confirmLabel =
            confirming.type === 'return-to-service'
              ? labels.actions.confirmReturnToService
              : confirming.type === 'unarchive'
                ? labels.actions.confirmUnarchive
                : labels.actions.confirmArchive;

          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#787774]">{confirmLabel}</span>
              <button
                type="button"
                disabled={pendingActionId === item.id}
                onClick={() => void handleStateAction(item, confirming.type)}
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
              onClick={() => setConfirming({ id: item.id, type: archiveActionType })}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
            >
              {isArchived ? labels.actions.unarchive : labels.actions.archive}
            </button>
            {isOutOfService ? (
              <button
                type="button"
                disabled={pendingActionId === item.id}
                onClick={() => setConfirming({ id: item.id, type: 'return-to-service' })}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
              >
                {labels.actions.returnToService}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPanel({ mode: 'out-of-service', aircraft: item })}
                className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
              >
                {labels.actions.setOutOfService}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPanel({ mode: 'hour-meter', aircraft: item })}
              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
            >
              {labels.actions.adjustHourMeter}
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

      {panel?.mode === 'out-of-service' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <OutOfServiceForm
            // Same remount rationale as EditAircraftForm above.
            key={panel.aircraft.id}
            aircraft={panel.aircraft}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </div>
      ) : null}

      {panel?.mode === 'hour-meter' ? (
        <div className="mt-6 rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <HourMeterAdjustmentPanel
            // Same remount rationale as EditAircraftForm above.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AircraftFields' matching comment.
  const hourMeterField = register('hourMeterMinutes', { valueAsNumber: true }) as any;

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

      <AircraftFields register={register} errors={errors} labels={labels} idPrefix="create" />

      {/*
       * `hourMeterMinutes` is create-only (story 2.5): after creation the
       * contaore changes exclusively via a tracked `HourMeterAdjustment`
       * ("Rettifica contaore"), never this form's generic PATCH — so this
       * field is deliberately absent from `EditAircraftForm`/`AircraftFields`.
       */}
      <div>
        <label htmlFor="create-hourMeterMinutes" className="block text-sm font-medium text-[#2F3437]">
          {labels.form.hourMeter}
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="create-hourMeterMinutes"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            aria-invalid={Boolean(errors.hourMeterMinutes)}
            className="mt-0 w-full max-w-[140px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...hourMeterField}
            onChange={(event) => {
              // Compose react-hook-form's own `onChange` (keeps the submitted
              // value as the single source of truth, AD-2) with a plain state
              // mirror for the live hint — see `HourMeterHint`'s comment.
              void hourMeterField.onChange(event);
              setHourMeterMinutes(event.target.valueAsNumber);
            }}
          />
          <span className="font-[family-name:var(--font-mono,monospace)] text-sm text-[#787774]" data-testid="create-hour-meter-hint">
            (<HourMeterHint minutes={hourMeterMinutes} />)
          </span>
        </div>
        <p className="mt-1 text-xs text-[#787774]">{labels.form.hourMeterHint}</p>
        {errors.hourMeterMinutes ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.invalidHourMeter}</p> : null}
      </div>

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

      <AircraftFields register={register} errors={errors} labels={labels} idPrefix="edit" />

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
 * Shared field set for create/edit: registration, type, model, notes.
 * `register` is typed loosely (both forms' input shapes only differ in
 * whether fields are required) since both `CreateAircraftInput`/
 * `UpdateAircraftInput` share every remaining field name — same pattern as
 * `PersonFields` in people-manager.tsx. `hourMeterMinutes` is deliberately
 * NOT here (story 2.5): it is create-only, rendered inline by
 * `CreateAircraftForm` — `UpdateAircraftInput` no longer carries it at all,
 * since the contaore changes exclusively via a tracked adjustment.
 */
function AircraftFields({
  register,
  errors,
  labels,
  idPrefix,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared across two distinct RHF instances (create/edit); field names are identical.
  register: any;
  errors: { registration?: unknown; type?: unknown; model?: unknown };
  labels: Labels;
  idPrefix: string;
}) {
  const inputClasses =
    'mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

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

      <div>
        <label htmlFor={`${idPrefix}-model`} className="block text-sm font-medium text-[#2F3437]">
          {labels.form.model}
        </label>
        <input id={`${idPrefix}-model`} className={inputClasses} aria-invalid={Boolean(errors.model)} {...register('model')} />
        {errors.model ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.form.requiredField}</p> : null}
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

type OutOfServiceFormProps = {
  aircraft: AircraftRow;
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

/**
 * "Fuori servizio" panel (story 2.5, AC 1): a mandatory reason plus a
 * confirm/cancel pair — this IS the "form inline/pannello con motivo
 * obbligatorio + conferma" the Dev Notes call for, distinct from the plain
 * two-step confirm used for archive/unarchive/return-to-service (those need
 * no extra input).
 */
function OutOfServiceForm({ aircraft, labels, onCancel, onSuccess }: OutOfServiceFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetOutOfServiceInput>({
    resolver: zodResolver(setOutOfServiceSchema),
    defaultValues: { reason: '' },
  });

  async function onSubmit(values: SetOutOfServiceInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/out-of-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      setFormError(code === 'CONFLICT' ? labels.statusForm.conflictError : labels.statusForm.genericError);
      return;
    }

    onSuccess(labels.feedback.setOutOfService);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
      <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
        {labels.statusForm.title} — {aircraft.registration}
      </h3>

      <div>
        <label htmlFor="out-of-service-reason" className="block text-sm font-medium text-[#2F3437]">
          {labels.statusForm.reason}
        </label>
        <textarea
          id="out-of-service-reason"
          rows={3}
          aria-invalid={Boolean(errors.reason)}
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          {...register('reason')}
        />
        {errors.reason ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.statusForm.reasonRequired}</p> : null}
      </div>

      {formError ? (
        <p role="alert" data-testid="aircraft-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <FormActions submitLabel={labels.statusForm.submit} cancelLabel={labels.statusForm.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

type HourMeterAdjustmentPanelProps = {
  aircraft: AircraftRow;
  labels: Labels;
  onCancel: () => void;
  onSuccess: (message: string) => void;
};

/**
 * "Rettifica contaore" panel (story 2.5, AC 2): current value, a new-value
 * input with a live `H:MM`/delta preview, a mandatory reason, and — below
 * the form — the append-only adjustment history (fetched once per mount,
 * i.e. per `key={aircraft.id}` remount, same rationale as `EditAircraftForm`
 * — never a per-row fetch, only when this panel is actually open).
 */
function HourMeterAdjustmentPanel({ aircraft, labels, onCancel, onSuccess }: HourMeterAdjustmentPanelProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [history, setHistory] = useState<HourMeterAdjustmentListItemDto[] | null>(null);
  // Local mirror for the live H:MM/delta preview — same rationale as the
  // create/edit forms' `hourMeterMinutes` mirror (avoids a second React
  // Compiler "incompatible library" warning on top of data-table.tsx's).
  const [newMinutes, setNewMinutes] = useState(aircraft.hourMeterMinutes);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateHourMeterAdjustmentInput>({
    resolver: zodResolver(createHourMeterAdjustmentSchema),
    defaultValues: { newMinutes: aircraft.hourMeterMinutes, reason: '' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- register()'s return type isn't worth threading through just for this composed onChange.
  const newMinutesField = register('newMinutes', { valueAsNumber: true }) as any;

  useEffect(() => {
    let cancelled = false;
    async function loadHistory(): Promise<void> {
      const response = await fetch(`/api/v1/aircraft/${aircraft.id}/hour-meter-adjustments?pageSize=50`);
      if (cancelled) return;
      if (!response.ok) {
        setHistory([]);
        return;
      }
      const body = (await response.json()) as { items: HourMeterAdjustmentListItemDto[] };
      setHistory(body.items);
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [aircraft.id]);

  async function onSubmit(values: CreateHourMeterAdjustmentInput): Promise<void> {
    setFormError(null);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/hour-meter-adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      setFormError(labels.hourMeterPanel.genericError);
      return;
    }

    onSuccess(labels.feedback.hourMeterAdjusted);
  }

  const delta = Number.isInteger(newMinutes) ? newMinutes - aircraft.hourMeterMinutes : Number.NaN;

  return (
    <div className="space-y-8">
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
        <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
          {labels.hourMeterPanel.title} — {aircraft.registration}
        </h3>

        <p className="text-sm text-[#787774]">
          {labels.hourMeterPanel.current}: <span className="font-medium text-[#111111]">{safeFormatMinutes(aircraft.hourMeterMinutes)}</span>
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="hour-meter-new-minutes" className="block text-sm font-medium text-[#2F3437]">
              {labels.hourMeterPanel.newValue}
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="hour-meter-new-minutes"
                type="number"
                step={1}
                min={0}
                inputMode="numeric"
                aria-invalid={Boolean(errors.newMinutes)}
                className="w-full max-w-[140px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
                {...newMinutesField}
                onChange={(event) => {
                  void newMinutesField.onChange(event);
                  setNewMinutes(event.target.valueAsNumber);
                }}
              />
              <span className="font-[family-name:var(--font-mono,monospace)] text-sm text-[#787774]" data-testid="hour-meter-new-hint">
                (<HourMeterHint minutes={newMinutes} />)
              </span>
            </div>
            <p className="mt-1 text-xs text-[#787774]">{labels.hourMeterPanel.hint}</p>
            {errors.newMinutes ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.hourMeterPanel.invalidValue}</p> : null}
          </div>
          <div>
            <span className="block text-sm font-medium text-[#2F3437]">{labels.hourMeterPanel.delta}</span>
            <p data-testid="hour-meter-delta" className="mt-2 font-[family-name:var(--font-mono,monospace)] text-base text-[#111111]">
              {formatSignedMinutes(delta)}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="hour-meter-reason" className="block text-sm font-medium text-[#2F3437]">
            {labels.hourMeterPanel.reason}
          </label>
          <textarea
            id="hour-meter-reason"
            rows={2}
            aria-invalid={Boolean(errors.reason)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('reason')}
          />
          {errors.reason ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.hourMeterPanel.requiredField}</p> : null}
        </div>

        {formError ? (
          <p role="alert" data-testid="aircraft-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
            {formError}
          </p>
        ) : null}

        <FormActions
          submitLabel={labels.hourMeterPanel.submit}
          cancelLabel={labels.hourMeterPanel.cancel}
          isSubmitting={isSubmitting}
          onCancel={onCancel}
        />
      </form>

      <div>
        <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.hourMeterPanel.historyTitle}</h4>
        {history === null ? null : history.length === 0 ? (
          <p className="mt-3 text-sm text-[#787774]">{labels.hourMeterPanel.historyEmpty}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs uppercase tracking-[0.05em] text-[#787774]">
                  <th className="py-2 pr-4 font-medium">{labels.hourMeterPanel.historyWhen}</th>
                  <th className="py-2 pr-4 font-medium">{labels.hourMeterPanel.historyActor}</th>
                  <th className="py-2 pr-4 font-medium">{labels.hourMeterPanel.historyPrevious}</th>
                  <th className="py-2 pr-4 font-medium">{labels.hourMeterPanel.historyNew}</th>
                  <th className="py-2 pr-4 font-medium">{labels.hourMeterPanel.historyDelta}</th>
                  <th className="py-2 font-medium">{labels.hourMeterPanel.historyReason}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} data-testid="hour-meter-history-row" className="border-b border-[#EAEAEA] text-[#111111]">
                    <td className="py-2 pr-4 whitespace-nowrap text-[#787774]">{formatDateTime(new Date(entry.createdAt))}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{entry.actorEmail}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{safeFormatMinutes(entry.previousMinutes)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{safeFormatMinutes(entry.newMinutes)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatSignedMinutes(entry.newMinutes - entry.previousMinutes)}</td>
                    <td className="py-2">{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
