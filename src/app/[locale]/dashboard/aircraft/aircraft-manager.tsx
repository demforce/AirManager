'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable, TruncatedCell } from '@/components/data-table';
import { ExportButton } from '@/components/export-button';
import { useRouter } from '@/i18n/navigation';
import {
  createAircraftSchema,
  createHourMeterAdjustmentSchema,
  setOutOfServiceSchema,
  updateAircraftSchema,
  type AircraftRateItemDto,
  type CreateAircraftInput,
  type CreateHourMeterAdjustmentInput,
  type HourMeterAdjustmentListItemDto,
  type SetOutOfServiceInput,
  type UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import { formatCents, parseCents } from '@/lib/money';
import { formatDateOnly, formatDateTime, formatMinutes } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input, inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/card';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';
import { ArchiveIcon, GaugeIcon, PencilIcon, RestoreIcon, TagEuroIcon, ToggleIcon } from '@/components/ui/icons';

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
  /**
   * The hourly rate in effect today (AD-4, story 4.1) — integer euro cents,
   * or `null` if the aircraft has no rate on or before today yet. Computed
   * server-side via `rates.service.ts#getEffectiveRate` so the fleet table
   * reads at a glance without a per-row client fetch.
   */
  currentRatePriceCentsPerHour: number | null;
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
    currentRate: string;
    noRate: string;
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
    rates: string;
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
    /** Story TD-1, AC 11 — "Carica altri", shown when more rows exist beyond the loaded page. */
    loadMore: string;
  };
  ratesPanel: {
    title: string;
    current: string;
    noCurrentRate: string;
    newRateTitle: string;
    price: string;
    validFrom: string;
    submit: string;
    cancel: string;
    requiredField: string;
    invalidPrice: string;
    invalidDate: string;
    genericError: string;
    conflictError: string;
    readOnlyHint: string;
    historyTitle: string;
    historyEmpty: string;
    historyValidFrom: string;
    historyPrice: string;
    historyActor: string;
    historyWhen: string;
    /** Story 12.5 (AC 1) — `DatePicker` a11y/error strings for `validFrom`. */
    datePicker: DatePickerLabels;
  };
  feedback: {
    created: string;
    updated: string;
    archived: string;
    unarchived: string;
    setOutOfService: string;
    returnedToService: string;
    hourMeterAdjusted: string;
    rateAdded: string;
  };
};

type AircraftManagerProps = {
  aircraft: AircraftRow[];
  initialQuery: string;
  initialIncludeArchived: boolean;
  /**
   * Derived server-side from `hasPermission(actor, 'settings.manage')`
   * (same `readOnly`/`canManage*` pattern as `account-panel.tsx`'s
   * `canManageFinance`) — hides the "Nuova tariffa" form for an actor who
   * only has `aircraft.manage` (staff sees the rates panel read-only).
   * `createAircraftRate`'s own `authorize(actor, 'settings.manage')`
   * remains the real guardian (AD-5).
   */
  canManageSettings: boolean;
  /** Story 10.1 (AC 5) — the SAME `q`/`includeArchived` this page was fetched with, `?format=xlsx` appended. */
  exportHref: string;
  exportLabel: string;
  labels: Labels;
};

type Panel =
  | { mode: 'create' }
  | { mode: 'edit'; aircraft: AircraftRow }
  | { mode: 'out-of-service'; aircraft: AircraftRow }
  | { mode: 'hour-meter'; aircraft: AircraftRow }
  | { mode: 'rates'; aircraft: AircraftRow };
type ConfirmState = { id: string; type: 'archive' | 'unarchive' | 'return-to-service' };

function statusLabel(aircraft: AircraftRow, labels: Labels): string {
  return aircraft.archivedAt ? labels.status.archived : labels.status.active;
}

function statusBadgeTone(aircraft: AircraftRow): StatusTone {
  return aircraft.archivedAt ? 'warning' : 'ok';
}

/** Operational status badge (story 2.5, AC 1) — distinct from the archive badge above. */
function operationalStatusLabel(aircraft: AircraftRow, labels: Labels): string {
  return aircraft.status === 'OUT_OF_SERVICE' ? labels.operationalStatus.outOfService : labels.operationalStatus.operational;
}

function operationalStatusBadgeTone(aircraft: AircraftRow): StatusTone {
  return aircraft.status === 'OUT_OF_SERVICE' ? 'warning' : 'ok';
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

export function AircraftManager({
  aircraft,
  initialQuery,
  initialIncludeArchived,
  canManageSettings,
  exportHref,
  exportLabel,
  labels,
}: AircraftManagerProps) {
  const router = useRouter();
  // Money must follow the page locale (review 3.1 F1 — mandatory, same
  // pattern as `account-panel.tsx`): without this, `formatCents`' default
  // renders Italian separators on /en too.
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConfirmState | null>(null);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);
  // TD-9: current-rate values reported by `RatesPanel` right after a
  // successful submit (see its `onSuccess` doc-comment) — overrides the
  // `aircraft` prop's (possibly not-yet-refreshed) value for the fleet
  // table's `current-rate-` cell, keyed by aircraft id.
  const [rateOverrides, setRateOverrides] = useState<Map<string, number | null>>(new Map());

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

  function handleFormSuccess(message: string, updatedRate?: { aircraftId: string; currentRatePriceCentsPerHour: number | null }): void {
    setPanel(null);
    setFeedback(message);
    if (updatedRate) {
      setRateOverrides((prev) => new Map(prev).set(updatedRate.aircraftId, updatedRate.currentRatePriceCentsPerHour));
    }
    router.refresh();
  }

  const columns: ColumnDef<AircraftRow, unknown>[] = [
    {
      id: 'registration',
      header: labels.table.registration,
      cell: ({ row }) => <span className="font-medium text-ink">{row.original.registration}</span>,
    },
    {
      id: 'type',
      header: labels.table.type,
      cell: ({ row }) => row.original.type,
    },
    {
      id: 'model',
      header: labels.table.model,
      cell: ({ row }) => <TruncatedCell value={row.original.model} className="max-w-[200px]" />,
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
      cell: ({ row }) => <StatusPill tone={statusBadgeTone(row.original)}>{statusLabel(row.original, labels)}</StatusPill>,
    },
    {
      id: 'operationalStatus',
      header: labels.table.operationalStatus,
      cell: ({ row }) => (
        <StatusPill
          tone={operationalStatusBadgeTone(row.original)}
          title={row.original.statusReason ?? undefined}
          data-testid={`operational-status-${row.original.id}`}
        >
          {operationalStatusLabel(row.original, labels)}
        </StatusPill>
      ),
    },
    {
      id: 'currentRate',
      header: labels.table.currentRate,
      cell: ({ row }) => {
        // TD-9: prefer the override (set right after a successful rate
        // submit, see `handleFormSuccess`) over the `aircraft` prop, which
        // only reflects the new rate once `router.refresh()` lands.
        const override = rateOverrides.get(row.original.id);
        const currentRate = override !== undefined ? override : row.original.currentRatePriceCentsPerHour;
        return (
          <span data-testid={`current-rate-${row.original.id}`}>
            {currentRate === null ? labels.table.noRate : `${formatCents(currentRate, moneyLocale)}/h`}
          </span>
        );
      },
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
              <span className="text-xs text-mid-gray">{confirmLabel}</span>
              <Button size="sm"
                type="button"
                disabled={pendingActionId === item.id}
                onClick={() => void handleStateAction(item, confirming.type)}
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
            <Button variant="outline" size="icon"
              type="button"
              onClick={() => setPanel({ mode: 'edit', aircraft: item })}
              aria-label={labels.actions.edit}
              title={labels.actions.edit}
            >
              <PencilIcon />
            </Button>
            <Button variant="outline" size="icon"
              type="button"
              disabled={pendingActionId === item.id}
              onClick={() => setConfirming({ id: item.id, type: archiveActionType })}
              aria-label={isArchived ? labels.actions.unarchive : labels.actions.archive}
              title={isArchived ? labels.actions.unarchive : labels.actions.archive}
            >
              {isArchived ? <RestoreIcon /> : <ArchiveIcon />}
            </Button>
            {isOutOfService ? (
              <Button variant="outline" size="icon"
                type="button"
                disabled={pendingActionId === item.id}
                onClick={() => setConfirming({ id: item.id, type: 'return-to-service' })}
                aria-label={labels.actions.returnToService}
                title={labels.actions.returnToService}
              >
                <ToggleIcon />
              </Button>
            ) : (
              <Button variant="outline" size="icon"
                type="button"
                onClick={() => setPanel({ mode: 'out-of-service', aircraft: item })}
                aria-label={labels.actions.setOutOfService}
                title={labels.actions.setOutOfService}
              >
                <ToggleIcon />
              </Button>
            )}
            <Button variant="outline" size="icon"
              type="button"
              onClick={() => setPanel({ mode: 'hour-meter', aircraft: item })}
              aria-label={labels.actions.adjustHourMeter}
              title={labels.actions.adjustHourMeter}
            >
              <GaugeIcon />
            </Button>
            <Button variant="outline" size="icon"
              type="button"
              onClick={() => setPanel({ mode: 'rates', aircraft: item })}
              aria-label={labels.actions.rates}
              title={labels.actions.rates}
            >
              <TagEuroIcon />
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
          <p role="status" data-testid="aircraft-feedback" className="text-sm text-[#346538]">
            {feedback}
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <ExportButton href={exportHref} label={exportLabel} testId="aircraft-export-button" />
          <Button
            type="button"
            onClick={() => setPanel({ mode: 'create' })}
          >
            {labels.newAircraft}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Input
          type="search"
          value={queryInput}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          className="w-full max-w-xs"
        />
        <Switch
          label={labels.includeArchivedLabel}
          checked={includeArchived}
          onChange={(event) => handleIncludeArchivedChange(event.target.checked)}
        />
      </div>

      {panel?.mode === 'create' ? (
        <Card className="mt-6 p-6">
          <CreateAircraftForm labels={labels} onCancel={() => setPanel(null)} onSuccess={handleFormSuccess} />
        </Card>
      ) : null}

      {panel?.mode === 'edit' ? (
        <Card className="mt-6 p-6">
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
        </Card>
      ) : null}

      {panel?.mode === 'out-of-service' ? (
        <Card className="mt-6 p-6">
          <OutOfServiceForm
            // Same remount rationale as EditAircraftForm above.
            key={panel.aircraft.id}
            aircraft={panel.aircraft}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </Card>
      ) : null}

      {panel?.mode === 'hour-meter' ? (
        <Card className="mt-6 p-6">
          <HourMeterAdjustmentPanel
            // Same remount rationale as EditAircraftForm above.
            key={panel.aircraft.id}
            aircraft={panel.aircraft}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </Card>
      ) : null}

      {panel?.mode === 'rates' ? (
        <Card className="mt-6 p-6">
          <RatesPanel
            // Same remount rationale as EditAircraftForm above.
            key={panel.aircraft.id}
            aircraft={panel.aircraft}
            canManageSettings={canManageSettings}
            moneyLocale={moneyLocale}
            labels={labels}
            onCancel={() => setPanel(null)}
            onSuccess={handleFormSuccess}
          />
        </Card>
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
    return <span className="text-ember">—:—</span>;
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
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
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
        <label htmlFor="create-hourMeterMinutes" className="block text-sm font-medium text-ink">
          {labels.form.hourMeter}
        </label>
        <div className="mt-2 flex items-center gap-3">
          <Input
            id="create-hourMeterMinutes"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            aria-invalid={Boolean(errors.hourMeterMinutes)}
            className="mt-0 w-full max-w-[140px]"
            {...hourMeterField}
            onChange={(event) => {
              // Compose react-hook-form's own `onChange` (keeps the submitted
              // value as the single source of truth, AD-2) with a plain state
              // mirror for the live hint — see `HourMeterHint`'s comment.
              void hourMeterField.onChange(event);
              setHourMeterMinutes(event.target.valueAsNumber);
            }}
          />
          <span className="font-[family-name:var(--font-mono,monospace)] text-sm text-mid-gray" data-testid="create-hour-meter-hint">
            (<HourMeterHint minutes={hourMeterMinutes} />)
          </span>
        </div>
        <p className="mt-1 text-xs text-mid-gray">{labels.form.hourMeterHint}</p>
        {errors.hourMeterMinutes ? <p className="mt-1 text-xs text-ember">{labels.form.invalidHourMeter}</p> : null}
      </div>

      {formError ? (
        <p role="alert" data-testid="aircraft-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
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
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        {labels.form.editTitle}
      </h3>

      <AircraftFields register={register} errors={errors} labels={labels} idPrefix="edit" />

      {formError ? (
        <p role="alert" data-testid="aircraft-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
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
  const inputClasses = cn(inputBaseClasses, 'mt-2 w-full');

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-registration`} className="block text-sm font-medium text-ink">
            {labels.form.registration}
          </label>
          <input
            id={`${idPrefix}-registration`}
            className={inputClasses}
            aria-invalid={Boolean(errors.registration)}
            {...register('registration')}
          />
          {errors.registration ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-type`} className="block text-sm font-medium text-ink">
            {labels.form.type}
          </label>
          <input id={`${idPrefix}-type`} className={inputClasses} aria-invalid={Boolean(errors.type)} {...register('type')} />
          {errors.type ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-model`} className="block text-sm font-medium text-ink">
          {labels.form.model}
        </label>
        <input id={`${idPrefix}-model`} className={inputClasses} aria-invalid={Boolean(errors.model)} {...register('model')} />
        {errors.model ? <p className="mt-1 text-xs text-ember">{labels.form.requiredField}</p> : null}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-notes`} className="block text-sm font-medium text-ink">
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
      <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
        {labels.statusForm.title} — {aircraft.registration}
      </h3>

      <div>
        <label htmlFor="out-of-service-reason" className="block text-sm font-medium text-ink">
          {labels.statusForm.reason}
        </label>
        <textarea
          id="out-of-service-reason"
          rows={3}
          aria-invalid={Boolean(errors.reason)}
          className="mt-2 w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
          {...register('reason')}
        />
        {errors.reason ? <p className="mt-1 text-xs text-ember">{labels.statusForm.reasonRequired}</p> : null}
      </div>

      {formError ? (
        <p role="alert" data-testid="aircraft-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
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

/** Page size for the adjustment history, and for each subsequent "Carica altri" page (story 2.5 default, "load more" story TD-1 AC 11). */
const HOUR_METER_HISTORY_PAGE_SIZE = 50;

/**
 * "Rettifica contaore" panel (story 2.5, AC 2): current value, a new-value
 * input with a live `H:MM`/delta preview, a mandatory reason, and — below
 * the form — the append-only adjustment history (fetched once per mount,
 * i.e. per `key={aircraft.id}` remount, same rationale as `EditAircraftForm`
 * — never a per-row fetch, only when this panel is actually open). Story
 * TD-1, AC 11: the first page (50 rows) loads as before; a "Carica altri"
 * button appears whenever more rows exist (`history.length < historyTotal`)
 * and appends the next page on click — no virtualization, no redesign.
 */
function HourMeterAdjustmentPanel({ aircraft, labels, onCancel, onSuccess }: HourMeterAdjustmentPanelProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [history, setHistory] = useState<HourMeterAdjustmentListItemDto[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
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
      const response = await fetch(`/api/v1/aircraft/${aircraft.id}/hour-meter-adjustments?pageSize=${HOUR_METER_HISTORY_PAGE_SIZE}`);
      if (cancelled) return;
      if (!response.ok) {
        setHistory([]);
        return;
      }
      const body = (await response.json()) as { items: HourMeterAdjustmentListItemDto[]; total: number };
      setHistory(body.items);
      setHistoryTotal(body.total);
      setHistoryPage(1);
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [aircraft.id]);

  async function handleLoadMore(): Promise<void> {
    const nextPage = historyPage + 1;
    setLoadingMore(true);
    const response = await fetch(
      `/api/v1/aircraft/${aircraft.id}/hour-meter-adjustments?pageSize=${HOUR_METER_HISTORY_PAGE_SIZE}&page=${nextPage}`,
    );
    setLoadingMore(false);
    if (!response.ok) return;
    const body = (await response.json()) as { items: HourMeterAdjustmentListItemDto[]; total: number };
    setHistory((current) => [...(current ?? []), ...body.items]);
    setHistoryTotal(body.total);
    setHistoryPage(nextPage);
  }

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
        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {labels.hourMeterPanel.title} — {aircraft.registration}
        </h3>

        <p className="text-sm text-mid-gray">
          {labels.hourMeterPanel.current}: <span className="font-medium text-ink">{safeFormatMinutes(aircraft.hourMeterMinutes)}</span>
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="hour-meter-new-minutes" className="block text-sm font-medium text-ink">
              {labels.hourMeterPanel.newValue}
            </label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                id="hour-meter-new-minutes"
                type="number"
                step={1}
                min={0}
                inputMode="numeric"
                aria-invalid={Boolean(errors.newMinutes)}
                className="w-full max-w-[140px]"
                {...newMinutesField}
                onChange={(event) => {
                  void newMinutesField.onChange(event);
                  setNewMinutes(event.target.valueAsNumber);
                }}
              />
              <span className="font-[family-name:var(--font-mono,monospace)] text-sm text-mid-gray" data-testid="hour-meter-new-hint">
                (<HourMeterHint minutes={newMinutes} />)
              </span>
            </div>
            <p className="mt-1 text-xs text-mid-gray">{labels.hourMeterPanel.hint}</p>
            {errors.newMinutes ? <p className="mt-1 text-xs text-ember">{labels.hourMeterPanel.invalidValue}</p> : null}
          </div>
          <div>
            <span className="block text-sm font-medium text-ink">{labels.hourMeterPanel.delta}</span>
            <p data-testid="hour-meter-delta" className="mt-2 font-[family-name:var(--font-mono,monospace)] text-base text-ink">
              {formatSignedMinutes(delta)}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="hour-meter-reason" className="block text-sm font-medium text-ink">
            {labels.hourMeterPanel.reason}
          </label>
          <textarea
            id="hour-meter-reason"
            rows={2}
            aria-invalid={Boolean(errors.reason)}
            className="mt-2 w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
            {...register('reason')}
          />
          {errors.reason ? <p className="mt-1 text-xs text-ember">{labels.hourMeterPanel.requiredField}</p> : null}
        </div>

        {formError ? (
          <p role="alert" data-testid="aircraft-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
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
        <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.hourMeterPanel.historyTitle}</h4>
        {history === null ? null : history.length === 0 ? (
          <p className="mt-3 text-sm text-mid-gray">{labels.hourMeterPanel.historyEmpty}</p>
        ) : (
          <Card className="mt-3 overflow-x-auto p-3">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
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
                  <tr key={entry.id} data-testid="hour-meter-history-row" className="border-b border-hairline text-ink">
                    <td className="py-2 pr-4 whitespace-nowrap text-mid-gray">{formatDateTime(new Date(entry.createdAt))}</td>
                    <td className="py-2 pr-4"><TruncatedCell value={entry.actorEmail} className="max-w-[180px]" /></td>
                    <td className="py-2 pr-4 whitespace-nowrap">{safeFormatMinutes(entry.previousMinutes)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{safeFormatMinutes(entry.newMinutes)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatSignedMinutes(entry.newMinutes - entry.previousMinutes)}</td>
                    <td className="py-2"><TruncatedCell value={entry.reason} className="max-w-[220px]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length < historyTotal ? (
              <Button variant="outline"
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                data-testid="hour-meter-history-load-more"
                className="mt-3"
              >
                {labels.hourMeterPanel.loadMore}
              </Button>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  );
}

/** `<input type="date">` default — same browser-local-time convention as `account-panel.tsx#todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Client-side mirror of `getEffectiveRate`'s AD-4 rule (the rate with the
 * MAXIMUM `validFrom <= today`), computed from a rate list already ordered
 * `validFrom desc` (`GET .../aircraft/{id}/rates`, `rates.service.ts`), so
 * the first entry that qualifies IS that rate. TD-9 fix: both
 * `AircraftRow.currentRatePriceCentsPerHour` (the fleet table) and
 * `RatesPanel`'s own display are server-computed PROPS that only update via
 * `router.refresh()` — under load its RSC re-fetch can lag well behind a
 * direct re-fetch of this one endpoint, so deriving the displayed value from
 * fresh history instead removes the race entirely. Twin fix:
 * `instructor-rates-panel.tsx`'s `currentRateFromHistory` (same rule, same
 * shape, duplicated per-file per this codebase's existing twin convention —
 * see e.g. `todayDateOnly` above, already duplicated rather than shared).
 */
function currentRateFromHistory(history: AircraftRateItemDto[], today: string): number | null {
  const current = history.find((entry) => entry.validFrom <= today);
  return current ? current.priceCentsPerHour : null;
}

/**
 * Local, UI-only schema (never sent over the wire): the price input stays a
 * euro-with-2-decimals string end to end while the user types (same
 * pattern/rationale as `account-panel.tsx`'s `topUpFormSchema`) — only
 * `NewRateForm.onSubmit` converts it to integer cents via `parseCents`,
 * exactly at the API-call boundary (AD-2).
 */
const newRateFormSchema = z
  .object({
    price: z.string().trim().min(1),
    validFrom: z.string().trim().min(1),
  })
  .refine(
    (values) => {
      let cents: number;
      try {
        cents = parseCents(values.price);
      } catch {
        return false;
      }
      return cents > 0 && cents <= 2_147_483_647;
    },
    { message: 'invalidPrice', path: ['price'] },
  );

type NewRateFormValues = z.infer<typeof newRateFormSchema>;

type RatesPanelProps = {
  aircraft: AircraftRow;
  /** See `AircraftManagerProps.canManageSettings` doc — hides the form for a read-only (`aircraft.manage`-only) viewer. */
  canManageSettings: boolean;
  moneyLocale: 'it' | 'en';
  labels: Labels;
  onCancel: () => void;
  /**
   * `updatedRate` (TD-9) is set only on a successful "Aggiungi tariffa"
   * submit — the freshly recomputed current rate for `aircraft.id`, so the
   * caller can update the fleet table's `current-rate-` cell immediately
   * instead of waiting on `router.refresh()` (this panel is about to be
   * unmounted by `onCancel`-equivalent close, discarding its own `history`).
   */
  onSuccess: (message: string, updatedRate?: { aircraftId: string; currentRatePriceCentsPerHour: number | null }) => void;
};

/**
 * "Tariffe" panel (story 4.1, AC 1/2, AD-4): the rate in effect today (from
 * `aircraft.currentRatePriceCentsPerHour` — the same server-computed value
 * already shown in the fleet table, so this never disagrees with it), the
 * full append-only history (fetched once per mount, i.e. per
 * `key={aircraft.id}` remount, same rationale as `HourMeterAdjustmentPanel`),
 * and — for `settings.manage` actors only — a "Nuova tariffa" form.
 * `aircraft.manage`-only viewers (staff) get the read-only view: current
 * rate + history, no form (Dev Notes: pricing configuration is admin-only).
 */
function RatesPanel({ aircraft, canManageSettings, moneyLocale, labels, onCancel, onSuccess }: RatesPanelProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [history, setHistory] = useState<AircraftRateItemDto[] | null>(null);
  const [validFromValue, setValidFromValue] = useState(todayDateOnly());

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NewRateFormValues>({
    resolver: zodResolver(newRateFormSchema),
    defaultValues: { price: '', validFrom: todayDateOnly() },
  });

  useEffect(() => {
    let cancelled = false;
    async function loadHistory(): Promise<void> {
      const response = await fetch(`/api/v1/aircraft/${aircraft.id}/rates`);
      if (cancelled) return;
      if (!response.ok) {
        setHistory([]);
        return;
      }
      const body = (await response.json()) as AircraftRateItemDto[];
      setHistory(body);
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [aircraft.id]);

  /**
   * Re-fetches the full history after a successful submit (an `await` inside
   * the `onSubmit` event handler, not inside a `useEffect` body — same
   * distinct-call-site rationale/shape as `instructor-rates-panel.tsx`'s
   * `refetchHistory`) — TD-9: lets `onSubmit` hand the caller a freshly
   * computed current rate (`currentRateFromHistory`) instead of the stale
   * `aircraft` prop, since this panel is about to unmount (`onSuccess`
   * closes it) before `router.refresh()` could ever land.
   */
  async function refetchHistory(): Promise<AircraftRateItemDto[]> {
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/rates`);
    if (!response.ok) return history ?? [];
    return (await response.json()) as AircraftRateItemDto[];
  }

  async function onSubmit(values: NewRateFormValues): Promise<void> {
    setFormError(null);
    // Boundary conversion (AD-2): the user types euros, the wire format is
    // always integer cents — never a float past this point.
    const priceCentsPerHour = parseCents(values.price);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceCentsPerHour, validFrom: values.validFrom }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      setFormError(code === 'CONFLICT' ? labels.ratesPanel.conflictError : labels.ratesPanel.genericError);
      return;
    }

    const freshHistory = await refetchHistory();
    onSuccess(labels.feedback.rateAdded, {
      aircraftId: aircraft.id,
      currentRatePriceCentsPerHour: currentRateFromHistory(freshHistory, todayDateOnly()),
    });
  }

  // TD-9: derived from `history` (deterministic, see `currentRateFromHistory`
  // doc-comment) once it has loaded; the `aircraft` prop (possibly stale,
  // captured at the moment the row's "Tariffe" button was clicked) is only
  // the fallback for the brief instant before the mount fetch resolves.
  const displayedCurrentRate = history === null ? aircraft.currentRatePriceCentsPerHour : currentRateFromHistory(history, todayDateOnly());

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {labels.ratesPanel.title} — {aircraft.registration}
        </h3>
      </div>

      <div>
        <span className="text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.ratesPanel.current}</span>
        <p data-testid="rates-current" className="mt-1 text-2xl font-medium text-ink">
          {displayedCurrentRate === null ? labels.ratesPanel.noCurrentRate : `${formatCents(displayedCurrentRate, moneyLocale)}/h`}
        </p>
      </div>

      {canManageSettings ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5">
          <h4 className="text-base font-medium text-ink">{labels.ratesPanel.newRateTitle}</h4>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="rate-price" className="block text-sm font-medium text-ink">
                {labels.ratesPanel.price}
              </label>
              <Input
                id="rate-price"
                inputMode="decimal"
                placeholder="0,00"
                aria-invalid={Boolean(errors.price)}
                className="mt-2 w-full"
                {...register('price')}
              />
              {errors.price ? <p className="mt-1 text-xs text-ember">{labels.ratesPanel.invalidPrice}</p> : null}
            </div>
            <div>
              <DatePicker
                id="rate-valid-from"
                label={labels.ratesPanel.validFrom}
                value={validFromValue}
                onChange={(next) => {
                  setValidFromValue(next);
                  setValue('validFrom', next);
                }}
                labels={labels.ratesPanel.datePicker}
                ariaInvalid={Boolean(errors.validFrom)}
              />
              {errors.validFrom ? <p className="mt-1 text-xs text-ember">{labels.ratesPanel.invalidDate}</p> : null}
            </div>
          </div>

          {formError ? (
            <p role="alert" data-testid="aircraft-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
              {formError}
            </p>
          ) : null}

          <FormActions submitLabel={labels.ratesPanel.submit} cancelLabel={labels.ratesPanel.cancel} isSubmitting={isSubmitting} onCancel={onCancel} />
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-mid-gray">{labels.ratesPanel.readOnlyHint}</p>
          <div className="flex gap-3">
            <Button variant="outline"
              type="button"
              onClick={onCancel}
            >
              {labels.ratesPanel.cancel}
            </Button>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.ratesPanel.historyTitle}</h4>
        {history === null ? null : history.length === 0 ? (
          <p className="mt-3 text-sm text-mid-gray">{labels.ratesPanel.historyEmpty}</p>
        ) : (
          <Card className="mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
                  <th className="py-2 pr-4 font-medium">{labels.ratesPanel.historyValidFrom}</th>
                  <th className="py-2 pr-4 font-medium">{labels.ratesPanel.historyPrice}</th>
                  <th className="py-2 pr-4 font-medium">{labels.ratesPanel.historyActor}</th>
                  <th className="py-2 font-medium">{labels.ratesPanel.historyWhen}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} data-testid="rate-history-row" className="border-b border-hairline text-ink">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDateOnly(entry.validFrom, moneyLocale)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatCents(entry.priceCentsPerHour, moneyLocale)}/h</td>
                    <td className="py-2 pr-4"><TruncatedCell value={entry.actorEmail} className="max-w-[180px]" /></td>
                    <td className="py-2 whitespace-nowrap text-mid-gray">{formatDateTime(new Date(entry.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
