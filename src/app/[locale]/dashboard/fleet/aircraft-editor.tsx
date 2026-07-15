'use client';

/**
 * Aircraft slide-over editor (story 12.5, AC 3) — port of
 * `docs/design-reference/airops/src/Fleet.jsx#AircraftEditor`, extended to
 * sections carrying EVERY legacy `aircraft-manager.tsx` function
 * (anagrafica, disponibilità, tariffe, contaore, archivio) — all visible
 * TOGETHER in one scrollable slide-over, rather than the legacy's swapped
 * single-panel-at-a-time layout, since AC 3 calls for "sezioni" not
 * "pannelli". Only the identity (anagrafica) section shares a Cancel/Submit
 * pair with the create flow (mirrors the prototype's own footer); every
 * other section is a self-contained mini-form/action, closed only via the
 * slide-over's own `X`.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { formatCents, parseCents } from '@/lib/money';
import { formatDateOnly, formatDateTime, formatMinutes } from '@/lib/time';
import {
  createAircraftSchema,
  createHourMeterAdjustmentSchema,
  updateAircraftSchema,
  type AircraftOwnerDto,
  type AircraftRateItemDto,
  type CreateAircraftInput,
  type CreateHourMeterAdjustmentInput,
  type HourMeterAdjustmentListItemDto,
  type UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import type { FleetCardItem } from './fleet-console';

export type AircraftEditorLabels = {
  newTitle: string;
  newSubtitle: string;
  closeLabel: string;
  cancel: string;
  submitCreate: string;
  submitEdit: string;
  identity: {
    sectionTitle: string;
    registration: string;
    type: string;
    model: string;
    seats: string;
    fuelType: string;
    fuelOptions: { avgas: string; jetA1: string; mogas: string };
    owner: string;
    ownerOptions: { club: string; private: string };
    based: string;
    basedOptions: { based: string; guest: string };
    notes: string;
    hourMeter: string;
    hourMeterHint: string;
  };
  availability: {
    sectionTitle: string;
    current: string;
    setOutOfService: string;
    returnToService: string;
    reason: string;
    confirm: string;
    confirmReturnToService: string;
  };
  rates: {
    sectionTitle: string;
    current: string;
    currentDry: string;
    noCurrentRate: string;
    newRateTitle: string;
    price: string;
    priceDry: string;
    validFrom: string;
    submit: string;
    readOnlyHint: string;
    historyTitle: string;
    historyEmpty: string;
  };
  hourMeter: {
    sectionTitle: string;
    current: string;
    newValue: string;
    hint: string;
    reason: string;
    delta: string;
    submit: string;
    historyTitle: string;
    historyEmpty: string;
    loadMore: string;
  };
  archive: {
    sectionTitle: string;
    archive: string;
    unarchive: string;
    confirmArchive: string;
    confirmUnarchive: string;
    confirmYes: string;
    confirmCancel: string;
  };
  errors: {
    required: string;
    generic: string;
    conflictRegistration: string;
    conflictStatus: string;
    conflictRate: string;
    invalidHourMeter: string;
    invalidPrice: string;
    invalidDate: string;
    reasonRequired: string;
  };
};

type ToastLabels = {
  created: string;
  updated: string;
  archived: string;
  unarchived: string;
  setOutOfService: string;
  returnedToService: string;
  hourMeterAdjusted: string;
  rateAdded: string;
};

type EditorTarget = { mode: 'new' } | { mode: 'edit'; aircraft: FleetCardItem };

type AircraftEditorProps = {
  target: EditorTarget | null;
  onClose: () => void;
  /** Refreshes the server-rendered grid/summary (AD-1) — called after every successful mutation. */
  onMutated: () => void;
  canManageSettings: boolean;
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
};

/** The editor's own working copy — a subset of `FleetCardItem` (no `wetRateCents`/`reserved`, grid-only presentation fields). */
type EditableAircraft = Omit<FleetCardItem, 'wetRateCents' | 'reserved'>;

type AircraftApiResponse = {
  id: string;
  registration: string;
  type: string;
  model: string;
  hourMeterMinutes: number;
  notes: string | null;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
  seats: number | null;
  fuelType: string | null;
  owner: AircraftOwnerDto;
  based: boolean;
  archivedAt: string | null;
};

function toEditable(aircraft: AircraftApiResponse): EditableAircraft {
  return {
    id: aircraft.id,
    registration: aircraft.registration,
    type: aircraft.type,
    model: aircraft.model,
    hourMeterMinutes: aircraft.hourMeterMinutes,
    notes: aircraft.notes,
    status: aircraft.status,
    statusReason: aircraft.statusReason,
    seats: aircraft.seats,
    fuelType: aircraft.fuelType,
    owner: aircraft.owner,
    based: aircraft.based,
    archivedAt: aircraft.archivedAt,
  };
}

type ApiErrorBody = { error?: { code?: string } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

/** Same browser-local "today" `YYYY-MM-DD` default as the legacy `RatesPanel`'s `todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Malformed/negative values never crash the render (same defensive convention as the legacy manager's `safeFormatMinutes`). */
function safeFormatMinutes(totalMinutes: number): string {
  try {
    return formatMinutes(totalMinutes);
  } catch {
    return '—';
  }
}

function formatSignedMinutes(deltaMinutes: number): string {
  if (!Number.isInteger(deltaMinutes)) return '—';
  const sign = deltaMinutes < 0 ? '-' : '+';
  return `${sign}${formatMinutes(Math.abs(deltaMinutes))}`;
}

/** The row with the maximum `validFrom <= today` (AD-4), computed client-side over an already-fetched history — display only, never fed back into pricing. */
function currentRateOf(history: AircraftRateItemDto[]): AircraftRateItemDto | null {
  const today = todayDateOnly();
  return history.find((rate) => rate.validFrom <= today) ?? null;
}

const KNOWN_FUEL_TYPES = ['AVGAS 100LL', 'Jet A-1', 'Mogas'];

export function AircraftEditor({ target, onClose, onMutated, canManageSettings, locale, labels, toastLabels }: AircraftEditorProps) {
  const toast = useToast();
  const isNew = target?.mode === 'new';
  const [current, setCurrent] = useState<EditableAircraft | null>(target?.mode === 'edit' ? target.aircraft : null);

  const open = target !== null;
  const title = isNew ? labels.newTitle : (current?.registration ?? '');
  const subtitle = isNew ? labels.newSubtitle : (current?.model ?? '');

  function handleMutated(updated: EditableAircraft): void {
    setCurrent(updated);
    onMutated();
  }

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel}>
      {isNew ? (
        <IdentitySection mode="new" labels={labels} toastLabels={toastLabels} toast={toast} onClose={onClose} onCreated={onMutated} />
      ) : current ? (
        <>
          <IdentitySection
            mode="edit"
            aircraft={current}
            labels={labels}
            toastLabels={toastLabels}
            toast={toast}
            onClose={onClose}
            onSaved={handleMutated}
          />

          <Section title={labels.availability.sectionTitle}>
            <AvailabilitySection aircraft={current} labels={labels} toastLabels={toastLabels} toast={toast} onMutated={handleMutated} />
          </Section>

          <Section title={labels.rates.sectionTitle}>
            <RatesSection
              aircraftId={current.id}
              archived={current.archivedAt !== null}
              canManageSettings={canManageSettings}
              locale={locale}
              labels={labels}
              toastLabels={toastLabels}
              toast={toast}
              onMutated={onMutated}
            />
          </Section>

          <Section title={labels.hourMeter.sectionTitle}>
            <HourMeterSection aircraft={current} locale={locale} labels={labels} toastLabels={toastLabels} toast={toast} onMutated={handleMutated} />
          </Section>

          <Section title={labels.archive.sectionTitle}>
            <ArchiveSection aircraft={current} labels={labels} toastLabels={toastLabels} toast={toast} onMutated={handleMutated} />
          </Section>
        </>
      ) : null}
    </SlideOver>
  );
}

/** Shared section wrapper — a top divider + label, same convention `ppr-console.tsx`'s `LandingFeeEditor` sub-section uses inside `PprOperatingInstructionsEditor`. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// --- Identity (anagrafica) --------------------------------------------------

type ToastHandle = { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };

type IdentitySectionProps =
  | { mode: 'new'; labels: AircraftEditorLabels; toastLabels: ToastLabels; toast: ToastHandle; onClose: () => void; onCreated: () => void }
  | {
      mode: 'edit';
      aircraft: EditableAircraft;
      labels: AircraftEditorLabels;
      toastLabels: ToastLabels;
      toast: ToastHandle;
      onClose: () => void;
      onSaved: (updated: EditableAircraft) => void;
    };

function IdentitySection(props: IdentitySectionProps): React.JSX.Element {
  const { labels } = props;
  const [formError, setFormError] = useState<string | null>(null);

  const isNew = props.mode === 'new';
  const defaultValues = isNew
    ? { registration: '', type: '', model: '', hourMeterMinutes: 0, notes: null, seats: null, fuelType: null, owner: 'CLUB' as const, based: true }
    : {
        registration: props.aircraft.registration,
        type: props.aircraft.type,
        model: props.aircraft.model,
        notes: props.aircraft.notes,
        seats: props.aircraft.seats,
        fuelType: props.aircraft.fuelType,
        owner: props.aircraft.owner,
        based: props.aircraft.based,
      };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createAircraftSchema> | UpdateAircraftInput, unknown, CreateAircraftInput | UpdateAircraftInput>({
    resolver: zodResolver(isNew ? createAircraftSchema : updateAircraftSchema),
    defaultValues,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- register()'s valueAsNumber composition, same documented exception as the legacy manager.
  const seatsField = register('seats', { setValueAs: (value: string) => (value === '' ? null : Number(value)) }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above, create-only field.
  const hourMeterField = isNew ? (register('hourMeterMinutes', { valueAsNumber: true }) as any) : null;

  const currentFuelType = isNew ? null : props.aircraft.fuelType;
  const extraFuelOption = currentFuelType && !KNOWN_FUEL_TYPES.includes(currentFuelType) ? currentFuelType : null;

  async function onSubmit(values: CreateAircraftInput | UpdateAircraftInput): Promise<void> {
    setFormError(null);

    const response = isNew
      ? await fetch('/api/v1/aircraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
      : await fetch(`/api/v1/aircraft/${props.aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.errors.conflictRegistration : labels.errors.generic);
      return;
    }

    const updated = (await response.json()) as AircraftApiResponse;
    if (isNew) {
      props.toast.show(props.toastLabels.created, 'ok');
      props.onClose();
      props.onCreated();
    } else {
      props.toast.show(props.toastLabels.updated, 'ok');
      props.onSaved(toEditable(updated));
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="identity-form">
      <div className="form-grid">
        <Field label={labels.identity.registration}>
          <Input aria-invalid={Boolean(errors.registration)} {...register('registration')} />
        </Field>
        <Field label={labels.identity.type}>
          <Input aria-invalid={Boolean(errors.type)} {...register('type')} />
        </Field>
        <Field label={labels.identity.model} wide>
          <Input aria-invalid={Boolean(errors.model)} {...register('model')} />
        </Field>
        <Field label={labels.identity.seats}>
          <Input type="number" min={0} step={1} inputMode="numeric" {...seatsField} />
        </Field>
        <Field label={labels.identity.fuelType}>
          <Select {...register('fuelType', { setValueAs: (value: string) => (value === '' ? null : value) })} defaultValue={currentFuelType ?? ''}>
            <option value="">—</option>
            <option value="AVGAS 100LL">{labels.identity.fuelOptions.avgas}</option>
            <option value="Jet A-1">{labels.identity.fuelOptions.jetA1}</option>
            <option value="Mogas">{labels.identity.fuelOptions.mogas}</option>
            {extraFuelOption ? <option value={extraFuelOption}>{extraFuelOption}</option> : null}
          </Select>
        </Field>
        <Field label={labels.identity.owner}>
          <Select {...register('owner')} defaultValue={defaultValues.owner}>
            <option value="CLUB">{labels.identity.ownerOptions.club}</option>
            <option value="PRIVATE">{labels.identity.ownerOptions.private}</option>
          </Select>
        </Field>
        <Field label={labels.identity.based} wide>
          <BasedSegmented defaultValue={defaultValues.based} labels={labels} setValue={setValue} />
        </Field>
        {isNew ? (
          <Field label={labels.identity.hourMeter}>
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              title={labels.identity.hourMeterHint}
              aria-invalid={Boolean((errors as Record<string, unknown>)['hourMeterMinutes'])}
              {...hourMeterField}
            />
          </Field>
        ) : null}
        <Field label={labels.identity.notes} wide>
          <textarea className="input" rows={3} {...register('notes', { setValueAs: (value: string) => (value === '' ? null : value) })} />
        </Field>
      </div>

      {formError ? (
        <p role="alert" data-testid="identity-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button type="button" className="btn" onClick={props.onClose}>
          {labels.cancel}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="identity-submit">
          {isNew ? labels.submitCreate : labels.submitEdit}
        </button>
      </div>
    </form>
  );
}

/**
 * `based` segmented toggle — `Segmented` has no native change event RHF's
 * `register` can bind to, so this drives the form field IMPERATIVELY via
 * `setValue` (RHF's documented pattern for custom, non-native controls)
 * instead. Local `useState` only mirrors which segment is highlighted (same
 * "state mirror, RHF stays the single source of truth at submit"
 * convention as the legacy manager's `hourMeterMinutes` mirror) — never
 * read back via `watch()`/`useWatch()` (React-Compiler-unmemoizable, same
 * documented exception as `data-table.tsx`).
 */
function BasedSegmented({
  defaultValue,
  labels,
  setValue,
}: {
  defaultValue: boolean;
  labels: AircraftEditorLabels;
  setValue: (name: 'based', value: boolean) => void;
}) {
  const [value, setValue_] = useState(defaultValue);
  return (
    <Segmented
      options={[
        { value: 'based', label: labels.identity.basedOptions.based },
        { value: 'guest', label: labels.identity.basedOptions.guest },
      ]}
      value={value ? 'based' : 'guest'}
      onChange={(next) => {
        const nextBased = next === 'based';
        setValue_(nextBased);
        setValue('based', nextBased);
      }}
    />
  );
}

// --- Availability (disponibilità) ------------------------------------------

function AvailabilitySection({
  aircraft,
  labels,
  toastLabels,
  toast,
  onMutated,
}: {
  aircraft: EditableAircraft;
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
  toast: { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };
  onMutated: (updated: EditableAircraft) => void;
}) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOutOfService = aircraft.status === 'OUT_OF_SERVICE';

  async function submitOutOfService(): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError(labels.errors.reasonRequired);
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/out-of-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: trimmed }),
    });
    setBusy(false);

    if (!response.ok) {
      const code = await errorCodeOf(response);
      toast.show(code === 'CONFLICT' ? labels.errors.conflictStatus : labels.errors.generic, 'bad');
      return;
    }

    const updated = (await response.json()) as AircraftApiResponse;
    setReason('');
    setReasonError(null);
    toast.show(toastLabels.setOutOfService, 'ok');
    onMutated(toEditable(updated));
  }

  async function submitReturnToService(): Promise<void> {
    setBusy(true);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/return-to-service`, { method: 'POST' });
    setBusy(false);

    if (!response.ok) {
      const code = await errorCodeOf(response);
      toast.show(code === 'CONFLICT' ? labels.errors.conflictStatus : labels.errors.generic, 'bad');
      return;
    }

    const updated = (await response.json()) as AircraftApiResponse;
    toast.show(toastLabels.returnedToService, 'ok');
    onMutated(toEditable(updated));
  }

  return (
    <div>
      <p className="fld-label" data-testid="availability-current">
        {labels.availability.current}: {isOutOfService ? aircraft.statusReason : '—'}
      </p>

      {isOutOfService ? (
        <button type="button" className="btn" disabled={busy} onClick={() => void submitReturnToService()} data-testid="return-to-service-button">
          {labels.availability.returnToService}
        </button>
      ) : (
        <div className="form-grid">
          <Field label={labels.availability.reason} wide>
            <textarea
              className="input"
              rows={2}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError(null);
              }}
              data-testid="out-of-service-reason"
            />
          </Field>
          {reasonError ? (
            <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
              {reasonError}
            </p>
          ) : null}
          <div className="fld wide">
            <button type="button" className="btn" disabled={busy} onClick={() => void submitOutOfService()} data-testid="out-of-service-submit">
              {labels.availability.setOutOfService}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Rates (tariffe) ---------------------------------------------------------

const newRateFormSchema = z
  .object({ price: z.string().trim().min(1), priceDry: z.string().trim(), validFrom: z.string().trim().min(1) })
  .refine(
    (values) => {
      try {
        const cents = parseCents(values.price);
        return cents > 0 && cents <= 2_147_483_647;
      } catch {
        return false;
      }
    },
    { message: 'invalidPrice', path: ['price'] },
  )
  .refine(
    (values) => {
      if (values.priceDry.trim().length === 0) return true;
      try {
        const cents = parseCents(values.priceDry);
        return cents > 0 && cents <= 2_147_483_647;
      } catch {
        return false;
      }
    },
    { message: 'invalidPrice', path: ['priceDry'] },
  );

type NewRateFormValues = z.infer<typeof newRateFormSchema>;

/** Pure fetch, no setState (see the effect's own doc-comment for why). */
async function fetchRatesHistory(aircraftId: string): Promise<AircraftRateItemDto[]> {
  const response = await fetch(`/api/v1/aircraft/${aircraftId}/rates`);
  if (!response.ok) return [];
  return (await response.json()) as AircraftRateItemDto[];
}

function RatesSection({
  aircraftId,
  archived,
  canManageSettings,
  locale,
  labels,
  toastLabels,
  toast,
  onMutated,
}: {
  aircraftId: string;
  archived: boolean;
  canManageSettings: boolean;
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
  toast: { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };
  onMutated: () => void;
}) {
  const [history, setHistory] = useState<AircraftRateItemDto[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewRateFormValues>({ resolver: zodResolver(newRateFormSchema), defaultValues: { price: '', priceDry: '', validFrom: todayDateOnly() } });

  useEffect(() => {
    // Same `.then(callback)` shape as `account-panel.tsx`'s own fetch effect
    // (not a named async function referenced via `void loadHistory()`, which
    // the `react-hooks/set-state-in-effect` rule flags even behind a
    // `cancelled` guard) — `fetchRatesHistory` itself performs no setState,
    // only the `.then` callback below does, gated on `cancelled`.
    let cancelled = false;
    void fetchRatesHistory(aircraftId).then((result) => {
      if (!cancelled) setHistory(result);
    });
    return () => {
      cancelled = true;
    };
  }, [aircraftId]);

  async function onSubmit(values: NewRateFormValues): Promise<void> {
    setFormError(null);
    const priceCentsPerHour = parseCents(values.price);
    const dryHourlyRateCents = values.priceDry.trim().length > 0 ? parseCents(values.priceDry) : undefined;

    const response = await fetch(`/api/v1/aircraft/${aircraftId}/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceCentsPerHour, dryHourlyRateCents, validFrom: values.validFrom }),
    });

    if (!response.ok) {
      const code = await errorCodeOf(response);
      setFormError(code === 'CONFLICT' ? labels.errors.conflictRate : labels.errors.generic);
      return;
    }

    reset({ price: '', priceDry: '', validFrom: todayDateOnly() });
    toast.show(toastLabels.rateAdded, 'ok');
    setHistory(await fetchRatesHistory(aircraftId));
    onMutated();
  }

  const current = history ? currentRateOf(history) : null;

  return (
    <div>
      <p className="fld-label">
        {labels.rates.current}:{' '}
        <span data-testid="rates-current">{current ? `${formatCents(current.priceCentsPerHour, locale)}/h` : labels.rates.noCurrentRate}</span>
      </p>
      {current?.dryHourlyRateCents ? (
        <p className="fld-label" data-testid="rates-current-dry">
          {labels.rates.currentDry}: {formatCents(current.dryHourlyRateCents, locale)}/h
        </p>
      ) : null}

      {canManageSettings && !archived ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="new-rate-form" style={{ marginTop: 10 }}>
          <div className="form-grid">
            <Field label={labels.rates.price}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.price)} {...register('price')} />
            </Field>
            <Field label={labels.rates.priceDry}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.priceDry)} {...register('priceDry')} />
            </Field>
            <Field label={labels.rates.validFrom}>
              <Input type="date" aria-invalid={Boolean(errors.validFrom)} {...register('validFrom')} />
            </Field>
          </div>
          {formError ? (
            <p role="alert" data-testid="new-rate-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
              {formError}
            </p>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <button type="submit" disabled={isSubmitting} className="btn" data-testid="new-rate-submit">
              {labels.rates.submit}
            </button>
          </div>
        </form>
      ) : (
        <p className="fld-label" style={{ marginTop: 8 }}>
          {labels.rates.readOnlyHint}
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <div className="fld-label" style={{ fontWeight: 600 }}>
          {labels.rates.historyTitle}
        </div>
        {history === null ? null : history.length === 0 ? (
          <p className="fld-label" style={{ marginTop: 6 }}>
            {labels.rates.historyEmpty}
          </p>
        ) : (
          <div style={{ marginTop: 6 }}>
            {history.map((rate) => (
              <div key={rate.id} data-testid="rate-history-row" className="meter-row" style={{ padding: '4px 0' }}>
                <span>{formatDateOnly(rate.validFrom, locale)}</span>
                <span className="v mono">
                  {formatCents(rate.priceCentsPerHour, locale)}/h{rate.dryHourlyRateCents ? ` · ${formatCents(rate.dryHourlyRateCents, locale)}/h dry` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Hour meter (contaore) ---------------------------------------------------

const HOUR_METER_HISTORY_PAGE_SIZE = 50;

type HourMeterHistoryPage = { items: HourMeterAdjustmentListItemDto[]; total: number };

/** Pure fetch, no setState (see the effect's own doc-comment for why). */
async function fetchHourMeterHistory(aircraftId: string, page: number): Promise<HourMeterHistoryPage> {
  const response = await fetch(`/api/v1/aircraft/${aircraftId}/hour-meter-adjustments?pageSize=${HOUR_METER_HISTORY_PAGE_SIZE}&page=${page}`);
  if (!response.ok) return { items: [], total: 0 };
  return (await response.json()) as HourMeterHistoryPage;
}

function HourMeterSection({
  aircraft,
  locale,
  labels,
  toastLabels,
  toast,
  onMutated,
}: {
  aircraft: EditableAircraft;
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
  toast: { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };
  onMutated: (updated: EditableAircraft) => void;
}) {
  const [history, setHistory] = useState<HourMeterAdjustmentListItemDto[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newMinutes, setNewMinutes] = useState(aircraft.hourMeterMinutes);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateHourMeterAdjustmentInput>({
    resolver: zodResolver(createHourMeterAdjustmentSchema),
    defaultValues: { newMinutes: aircraft.hourMeterMinutes, reason: '' },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same composed-onChange exception as the legacy manager.
  const newMinutesField = register('newMinutes', { valueAsNumber: true }) as any;

  useEffect(() => {
    // Same `.then(callback)` shape as `RatesSection`'s own effect (and
    // `account-panel.tsx`'s) — `fetchHourMeterHistory` performs no setState
    // itself, only the `.then` callback below does, gated on `cancelled`.
    let cancelled = false;
    void fetchHourMeterHistory(aircraft.id, 1).then((result) => {
      if (cancelled) return;
      setHistory(result.items);
      setHistoryTotal(result.total);
      setHistoryPage(1);
    });
    return () => {
      cancelled = true;
    };
  }, [aircraft.id]);

  async function handleLoadMore(): Promise<void> {
    const nextPage = historyPage + 1;
    setLoadingMore(true);
    const result = await fetchHourMeterHistory(aircraft.id, nextPage);
    setLoadingMore(false);
    setHistory((currentHistory) => [...(currentHistory ?? []), ...result.items]);
    setHistoryTotal(result.total);
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
      setFormError(labels.errors.generic);
      return;
    }

    const updated = (await response.json()) as AircraftApiResponse;
    reset({ newMinutes: updated.hourMeterMinutes, reason: '' });
    setNewMinutes(updated.hourMeterMinutes);
    toast.show(toastLabels.hourMeterAdjusted, 'ok');
    const result = await fetchHourMeterHistory(aircraft.id, 1);
    setHistory(result.items);
    setHistoryTotal(result.total);
    setHistoryPage(1);
    onMutated(toEditable(updated));
  }

  const delta = Number.isInteger(newMinutes) ? newMinutes - aircraft.hourMeterMinutes : Number.NaN;

  return (
    <div>
      <p className="fld-label" data-testid="hour-meter-current">
        {labels.hourMeter.current}: {safeFormatMinutes(aircraft.hourMeterMinutes)}
      </p>

      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="hour-meter-form" style={{ marginTop: 8 }}>
        <div className="form-grid">
          <Field label={labels.hourMeter.newValue}>
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              title={labels.hourMeter.hint}
              aria-invalid={Boolean(errors.newMinutes)}
              {...newMinutesField}
              onChange={(event) => {
                void newMinutesField.onChange(event);
                setNewMinutes(event.target.valueAsNumber);
              }}
            />
          </Field>
          <Field label={labels.hourMeter.delta}>
            <span className="mono" data-testid="hour-meter-delta">
              {formatSignedMinutes(delta)}
            </span>
          </Field>
          <Field label={labels.hourMeter.reason} wide>
            <textarea className="input" rows={2} aria-invalid={Boolean(errors.reason)} {...register('reason')} />
          </Field>
        </div>
        {formError ? (
          <p role="alert" data-testid="hour-meter-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 8 }}>
            {formError}
          </p>
        ) : null}
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={isSubmitting} className="btn" data-testid="hour-meter-submit">
            {labels.hourMeter.submit}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 14 }}>
        <div className="fld-label" style={{ fontWeight: 600 }}>
          {labels.hourMeter.historyTitle}
        </div>
        {history === null ? null : history.length === 0 ? (
          <p className="fld-label" style={{ marginTop: 6 }}>
            {labels.hourMeter.historyEmpty}
          </p>
        ) : (
          <div style={{ marginTop: 6 }}>
            {history.map((entry) => (
              <div key={entry.id} data-testid="hour-meter-history-row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="meter-row">
                  <span>
                    {formatDateTime(new Date(entry.createdAt), locale)} · {entry.actorEmail}
                  </span>
                  <span className="v mono">
                    {safeFormatMinutes(entry.previousMinutes)} &rarr; {safeFormatMinutes(entry.newMinutes)} (
                    {formatSignedMinutes(entry.newMinutes - entry.previousMinutes)})
                  </span>
                </div>
                <div className="fld-label" style={{ marginTop: 2, textTransform: 'none' }}>
                  {entry.reason}
                </div>
              </div>
            ))}
            {history.length < historyTotal ? (
              <button type="button" disabled={loadingMore} onClick={() => void handleLoadMore()} className="btn" data-testid="hour-meter-load-more" style={{ marginTop: 8 }}>
                {labels.hourMeter.loadMore}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Archive/unarchive --------------------------------------------------------

function ArchiveSection({
  aircraft,
  labels,
  toastLabels,
  toast,
  onMutated,
}: {
  aircraft: EditableAircraft;
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
  toast: { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };
  onMutated: (updated: EditableAircraft) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = aircraft.archivedAt !== null;

  async function submit(): Promise<void> {
    setBusy(true);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/${archived ? 'unarchive' : 'archive'}`, { method: 'POST' });
    setBusy(false);
    setConfirming(false);

    if (!response.ok) {
      toast.show(labels.errors.generic, 'bad');
      return;
    }

    const updated = (await response.json()) as AircraftApiResponse;
    toast.show(archived ? toastLabels.unarchived : toastLabels.archived, 'ok');
    onMutated(toEditable(updated));
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="fld-label">{archived ? labels.archive.confirmUnarchive : labels.archive.confirmArchive}</span>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()} data-testid="archive-confirm">
          {labels.archive.confirmYes}
        </button>
        <button type="button" className="btn" onClick={() => setConfirming(false)}>
          {labels.archive.confirmCancel}
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="btn" onClick={() => setConfirming(true)} data-testid="archive-toggle-button">
      {archived ? labels.archive.unarchive : labels.archive.archive}
    </button>
  );
}
