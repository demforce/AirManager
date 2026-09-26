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
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, Select } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { Segmented } from '@/components/ui/segmented';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import { formatCents, parseCents } from '@/lib/money';
import { formatDateOnly, formatDateTime, formatMinutes } from '@/lib/time';
import {
  createAircraftSchema,
  createHourMeterAdjustmentSchema,
  updateAircraftSchema,
  type AircraftRateItemDto,
  type AogBookingImpactDto,
  type CreateAircraftInput,
  type CreateHourMeterAdjustmentInput,
  type HourMeterAdjustmentListItemDto,
  type UpdateAircraftInput,
} from '@/lib/schemas/aircraft';
import type { FleetConsoleItem } from './fleet-console';

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
    /** Review MAJOR-2 — the question in FRONT of the armed pair (full `ArchiveSection` idiom): it moves `out-of-service-confirm` off the point that armed it, so a double click on the trigger no longer arms AND confirms. Three forms because the count is part of the question and Italian inflects the noun; the `Unknown` one covers the preview that never answered. */
    confirmQuestionOne: string;
    confirmQuestionMany: string;
    confirmQuestionUnknown: string;
    /** Story AOG-1a, AC 5 — the date field's own label. Says "compreso"/"inclusive" IN the label, because R-AOG-a made the day itself part of the fermo. */
    until: string;
    /** Optional-ness + what an empty value means, in the `Field` hint slot (never a placeholder-as-label). */
    untilHint: string;
    /** `t.raw` template with a `{date}` placeholder — the fermo clause appended to "Stato attuale" when a date is on file. */
    untilValue: string;
    /** What "Stato attuale" says instead when the aircraft is grounded with NO date (invariant [b]: a legitimate state, never an empty string or a bare dash). */
    untilUnknown: string;
    /** Story AOG-1b, AC 2 — the preview headline, BEFORE the act. Two forms because Italian and English both inflect the noun; `{count}` is client-interpolated (same `t.raw` convention as `rates.showAll`). */
    impactPreviewOne: string;
    impactPreviewMany: string;
    /** Review MINOR-1 — the whole preview when the count is ZERO: nothing to split, nothing to warn about, so it collapses to this one line instead of spending the full box (measured: it was pushing the primary submit under the fold at 1280x900). */
    impactPreviewNone: string;
    /** AC 5 — the persistent banner's headline, AFTER the act, on the number the grounding transaction itself computed. */
    impactBannerOne: string;
    impactBannerMany: string;
    /** AC 6 — the line that comes back at every reopening of an already-grounded aircraft. */
    impactRowOne: string;
    impactRowMany: string;
    /** AC 2 — the split, `{pending}`/`{approved}`. NOT decorative: it is the criterion of the email (R-AOG-i), so each half says what it means. */
    impactSplit: string;
    /** AC 2/AC 8 — the counting window in words, `{date}`, in the INCLUSIVE form of R-AOG-a. */
    impactWindowUntil: string;
    /** AC 8 — invariant [b]: no date means the count is NOT delimited, and both halves of that are named. */
    impactWindowUndelimited: string;
    /** Review MAJOR-1 — the THIRD case: a date IS on file but its day has already passed, so the count is not delimited either. It names that date as the EXPECTED one (`{date}`) instead of claiming the fermo ended there, which is what the `impactWindowUntil` wording did over a count of every future booking. */
    impactWindowOverdue: string;
    /** AC 2 — the preview number is a STIMA; the authoritative one is the response's. */
    impactEstimate: string;
    /** AC 5 — the banner's way out towards the bookings it is talking about. */
    impactBookingsLink: string;
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
    /** `t.raw` template, `"Mostra tutte ({count})"` — client-interpolated (AC 2, story 13.4: default shows only the last 5). */
    showAll: string;
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

type EditorTarget = { mode: 'new' } | { mode: 'edit'; aircraft: FleetConsoleItem };

type AircraftEditorProps = {
  target: EditorTarget | null;
  onClose: () => void;
  /** Refreshes the server-rendered grid/summary (AD-1) — called after every successful mutation. */
  onMutated: () => void;
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
};

/**
 * The editor's own working copy — a subset of `FleetCardItem` (no
 * `wetRateCents`/`reserved`, grid-only presentation fields) PLUS
 * `outOfServiceUntil` (story AOG-1a). The date is added HERE rather than on
 * `FleetCardItem` on purpose: R-AOG-e keeps the fleet cards (desktop, mobile,
 * and the Panoramica widget that shares the very same component) out of this
 * story's perimeter, and widening the shared card type would have dragged
 * `dashboard/page.tsx#fleetItems` in with it.
 */
type EditableAircraft = Omit<FleetConsoleItem, 'wetRateCents' | 'reserved'>;

type AircraftApiResponse = {
  id: string;
  registration: string;
  type: string;
  model: string;
  hourMeterMinutes: number;
  notes: string | null;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
  /** Story AOG-1a — `YYYY-MM-DD` on the wire (`aircraftListItemSchema`), or `null`. */
  outOfServiceUntil: string | null;
  seats: number | null;
  fuelType: string | null;
  based: boolean;
  archivedAt: string | null;
};

/** Story AOG-1b (AD-5): `POST /out-of-service` now answers the aircraft under its own key PLUS the count its transaction recomputed — `setOutOfServiceResponseSchema`. */
type SetOutOfServiceApiResponse = {
  aircraft: AircraftApiResponse;
  impactedBookings: AogBookingImpactDto;
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
    outOfServiceUntil: aircraft.outOfServiceUntil,
    seats: aircraft.seats,
    fuelType: aircraft.fuelType,
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

/** Same >0/`INT_MAX` validity rule as `newRateFormSchema`'s own `.refine` (`RatesSection`, below) — reused imperatively by the create-mode composite "Tariffe" block (story 14.8), which is plain state rather than react-hook-form. */
function isValidRatePrice(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  try {
    const cents = parseCents(trimmed);
    return cents > 0 && cents <= 2_147_483_647;
  } catch {
    return false;
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

export function AircraftEditor({ target, onClose, onMutated, locale, labels, toastLabels }: AircraftEditorProps) {
  const toast = useToast();
  const isNew = target?.mode === 'new';
  const [current, setCurrent] = useState<EditableAircraft | null>(target?.mode === 'edit' ? target.aircraft : null);
  /** Mirrors `IdentitySection`'s `isSubmitting` so the footer submit can be disabled while the request is in flight. */
  const [identityBusy, setIdentityBusy] = useState(false);

  const open = target !== null;
  const title = isNew ? labels.newTitle : (current?.registration ?? '');
  const subtitle = isNew ? labels.newSubtitle : (current?.model ?? '');

  function handleMutated(updated: EditableAircraft): void {
    setCurrent(updated);
    onMutated();
  }

  /* Story 15.10 (R-15.10-f): the identity submit moves from the in-body
     `.so-actions` bar to `SlideOver`'s `footer` (`.so-foot`, OUTSIDE the
     scrolling `.so-body`), reaching its form through `form="identity-form"`.
     15.2 pinned that bar with `position: sticky`, which cannot leave its
     containing block: measured at 375px in MODIFICA, `.so-body` scrolls 1781px
     inside 728px and the bar ended at `top -409.41` with the submit's
     `elementFromPoint` returning FALSE — the same defect the pilot editor was
     credited with, on the panel that was believed already fixed. */
  const identityFooter = (
    <>
      <div style={{ flex: 1 }} />
      <button type="button" className="btn" onClick={onClose}>
        {labels.cancel}
      </button>
      <button type="submit" form="identity-form" disabled={identityBusy} className="btn primary" data-testid="identity-submit">
        {isNew ? labels.submitCreate : labels.submitEdit}
      </button>
    </>
  );

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel} footer={identityFooter}>
      {isNew ? (
        <IdentitySection
          mode="new"
          labels={labels}
          toastLabels={toastLabels}
          toast={toast}
          onBusyChange={setIdentityBusy}
          onClose={onClose}
          onCreated={onMutated}
        />
      ) : current ? (
        <>
          <IdentitySection
            mode="edit"
            aircraft={current}
            labels={labels}
            toastLabels={toastLabels}
            toast={toast}
            onBusyChange={setIdentityBusy}
            onClose={onClose}
            onSaved={handleMutated}
          />

          <Section title={labels.availability.sectionTitle}>
            <AvailabilitySection aircraft={current} locale={locale} labels={labels} toastLabels={toastLabels} toast={toast} onMutated={handleMutated} />
          </Section>

          <Section title={labels.rates.sectionTitle}>
            <RatesSection
              aircraftId={current.id}
              archived={current.archivedAt !== null}
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
  | {
      mode: 'new';
      labels: AircraftEditorLabels;
      toastLabels: ToastLabels;
      toast: ToastHandle;
      /** `useState`'s setter — stable by contract, so the effect below cannot loop. */
      onBusyChange: (busy: boolean) => void;
      onClose: () => void;
      onCreated: () => void;
    }
  | {
      mode: 'edit';
      aircraft: EditableAircraft;
      labels: AircraftEditorLabels;
      toastLabels: ToastLabels;
      toast: ToastHandle;
      onBusyChange: (busy: boolean) => void;
      onClose: () => void;
      onSaved: (updated: EditableAircraft) => void;
    };

function IdentitySection(props: IdentitySectionProps): React.JSX.Element {
  const { labels } = props;
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const isNew = props.mode === 'new';
  // Review 14.9 (F9, ratifica R-14.9-d): the create-mode "Tariffe" block
  // used to be gated on `settings.manage` (the STAFF/ADMIN split from story
  // 14.8) — post-14.9 only ADMIN can reach this form at all (`aircraft.manage`
  // route gate), so the block is unconditional now.
  const showRatesSection = props.mode === 'new';

  // Story 14.8 (AC 1/2): the optional "Tariffe" block folded into the SAME
  // composite submit as identity — plain state + imperative validation, NOT
  // react-hook-form, same "conditional block validated against the
  // mirrored server rule" convention as `pilot-editor.tsx`'s `NewPersonForm`
  // (its own doc-comment: fighting RHF over a conditionally-relevant,
  // differently-shaped nested object isn't worth it for a one-shot form).
  // Untouched (and unused) in edit mode, which keeps its own independent
  // `RatesSection` form further down this file.
  const [ratePrice, setRatePrice] = useState('');
  const [ratePriceDry, setRatePriceDry] = useState('');
  const [rateValidFrom, setRateValidFrom] = useState(todayDateOnly());
  const [rateSubmitAttempted, setRateSubmitAttempted] = useState(false);

  const hasRate = ratePrice.trim().length > 0;
  // Review 14.8 F1: the block counts as "touched" if ANY of its fields is —
  // a dry price without a wet one must BLOCK the submit (mirror of edit's
  // `newRateFormSchema` `price: min(1)`), never be silently dropped.
  const rateTouched = hasRate || ratePriceDry.trim().length > 0;
  const ratePriceMissing = rateTouched && !hasRate;
  const ratePriceInvalid = hasRate && !isValidRatePrice(ratePrice);
  const ratePriceDryInvalid = ratePriceDry.trim().length > 0 && !isValidRatePrice(ratePriceDry);
  const rateValidFromMissing = rateTouched && rateValidFrom.trim().length === 0;
  // Review 14.8 F2: Chromium's date input accepts >4-digit years that
  // `z.iso.date()` rejects server-side as an unmappable `rate` fieldError —
  // enforce the ISO shape client-side so that 422 is unreachable.
  const rateValidFromInvalid = rateTouched && rateValidFrom.trim().length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(rateValidFrom.trim());

  const defaultValues = isNew
    ? { registration: '', type: '', model: '', hourMeterMinutes: 0, notes: null, seats: null, fuelType: null, based: true }
    : {
        registration: props.aircraft.registration,
        type: props.aircraft.type,
        model: props.aircraft.model,
        notes: props.aircraft.notes,
        seats: props.aircraft.seats,
        fuelType: props.aircraft.fuelType,
        based: props.aircraft.based,
      };

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createAircraftSchema> | UpdateAircraftInput, unknown, CreateAircraftInput | UpdateAircraftInput>({
    resolver: zodResolver(isNew ? createAircraftSchema : updateAircraftSchema),
    defaultValues,
  });

  // The submit that runs this form lives in the panel's `.so-foot` (story
  // 15.10), outside this component: the only state it needs from here is
  // whether a request is in flight.
  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange(isSubmitting);
  }, [isSubmitting, onBusyChange]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- register()'s valueAsNumber composition, same documented exception as the legacy manager.
  const seatsField = register('seats', { setValueAs: (value: string) => (value === '' ? null : Number(value)) }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above, create-only field.
  const hourMeterField = isNew ? (register('hourMeterMinutes', { valueAsNumber: true }) as any) : null;

  const currentFuelType = isNew ? null : props.aircraft.fuelType;
  const extraFuelOption = currentFuelType && !KNOWN_FUEL_TYPES.includes(currentFuelType) ? currentFuelType : null;

  /** RHF's INVALID branch (base fields failed their own zodResolver check) — same `onInvalid` role as `pilot-editor.tsx`'s `NewPersonForm`: flips the plain-state "Tariffe" block's error visibility too, so a submit with BOTH an empty identity field AND an invalid rate field marks both at once instead of leaving the rate block mute. */
  function onInvalid(): void {
    if (isNew) setRateSubmitAttempted(true);
  }

  async function onSubmit(values: CreateAircraftInput | UpdateAircraftInput): Promise<void> {
    setFormError(null);

    if (isNew) {
      setRateSubmitAttempted(true);
      if (ratePriceMissing || ratePriceInvalid || ratePriceDryInvalid || rateValidFromMissing || rateValidFromInvalid) {
        setTimeout(() => focusFirstInvalid(formRef.current), 0);
        return;
      }
    }

    // Story 14.8 (AC 2, "un solo submit"): the optional rate rides along in
    // the SAME composite body — `createAircraft` runs both writes in one
    // `$transaction` server-side (`aircraft.service.ts`), so a rejected
    // rate never leaves a half-created aircraft for this form to recover
    // from.
    const body: CreateAircraftInput | UpdateAircraftInput =
      isNew && hasRate
        ? {
            ...(values as CreateAircraftInput),
            rate: {
              priceCentsPerHour: parseCents(ratePrice),
              dryHourlyRateCents: ratePriceDry.trim().length > 0 ? parseCents(ratePriceDry) : undefined,
              validFrom: rateValidFrom,
            },
          }
        : values;

    const response = isNew
      ? await fetch('/api/v1/aircraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(`/api/v1/aircraft/${props.aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

    if (!response.ok) {
      if (response.status === 422) {
        // Story 14.2, AC 3: field-shaped 422 mapped onto the matching Field,
        // reusing `labels.errors.required` (same generic string as client-side
        // required checks) — the raw server message is never shown (AD-8).
        const { fieldErrors } = await parseApiError(response);
        const known: Array<'registration' | 'type' | 'model' | 'seats' | 'fuelType' | 'notes' | 'hourMeterMinutes'> = [
          'registration',
          'type',
          'model',
          'seats',
          'fuelType',
          'notes',
          'hourMeterMinutes',
        ];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: labels.errors.required });
            mapped = true;
          }
        }
        if (mapped) {
          setTimeout(() => focusFirstInvalid(formRef.current), 0);
          return;
        }
      }
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
    <form id="identity-form" ref={formRef} onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)} noValidate data-testid="identity-form">
      <div className="form-grid">
        <Field label={labels.identity.registration} error={errors.registration ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.registration)} {...register('registration')} />
        </Field>
        <Field label={labels.identity.type} error={errors.type ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.type)} {...register('type')} />
        </Field>
        <Field label={labels.identity.model} wide error={errors.model ? labels.errors.required : undefined}>
          <Input aria-invalid={Boolean(errors.model)} {...register('model')} />
        </Field>
        <Field label={labels.identity.seats} error={errors.seats ? labels.errors.required : undefined}>
          <Input type="number" min={0} step={1} inputMode="numeric" aria-invalid={Boolean(errors.seats)} {...seatsField} />
        </Field>
        <Field label={labels.identity.fuelType} error={errors.fuelType ? labels.errors.required : undefined}>
          <Select
            aria-invalid={Boolean(errors.fuelType)}
            {...register('fuelType', { setValueAs: (value: string) => (value === '' ? null : value) })}
            defaultValue={currentFuelType ?? ''}
          >
            <option value="">—</option>
            <option value="AVGAS 100LL">{labels.identity.fuelOptions.avgas}</option>
            <option value="Jet A-1">{labels.identity.fuelOptions.jetA1}</option>
            <option value="Mogas">{labels.identity.fuelOptions.mogas}</option>
            {extraFuelOption ? <option value={extraFuelOption}>{extraFuelOption}</option> : null}
          </Select>
        </Field>
        <Field label={labels.identity.based} wide>
          <BasedSegmented defaultValue={defaultValues.based} labels={labels} setValue={setValue} />
        </Field>
        {isNew ? (
          <Field
            label={labels.identity.hourMeter}
            error={(errors as Record<string, unknown>)['hourMeterMinutes'] ? labels.errors.required : undefined}
          >
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
        <Field label={labels.identity.notes} wide error={errors.notes ? labels.errors.required : undefined}>
          <textarea
            className="input"
            rows={3}
            aria-invalid={Boolean(errors.notes)}
            {...register('notes', { setValueAs: (value: string) => (value === '' ? null : value) })}
          />
        </Field>
      </div>

      {showRatesSection ? (
        <Section title={labels.rates.sectionTitle}>
          <div className="form-grid">
            <Field
              label={labels.rates.price}
              error={
                rateSubmitAttempted && (ratePriceMissing || ratePriceInvalid)
                  ? ratePriceMissing
                    ? labels.errors.required
                    : labels.errors.invalidPrice
                  : undefined
              }
            >
              <Input
                inputMode="decimal"
                placeholder="0,00"
                aria-invalid={rateSubmitAttempted && (ratePriceMissing || ratePriceInvalid)}
                value={ratePrice}
                onChange={(event) => setRatePrice(event.target.value)}
                data-testid="new-aircraft-rate-price"
              />
            </Field>
            <Field label={labels.rates.priceDry} error={rateSubmitAttempted && ratePriceDryInvalid ? labels.errors.invalidPrice : undefined}>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                aria-invalid={rateSubmitAttempted && ratePriceDryInvalid}
                value={ratePriceDry}
                onChange={(event) => setRatePriceDry(event.target.value)}
                data-testid="new-aircraft-rate-price-dry"
              />
            </Field>
            <Field
              label={labels.rates.validFrom}
              error={
                rateSubmitAttempted && (rateValidFromMissing || rateValidFromInvalid)
                  ? rateValidFromMissing
                    ? labels.errors.required
                    : labels.errors.invalidDate
                  : undefined
              }
            >
              <DateInput
                aria-invalid={rateSubmitAttempted && (rateValidFromMissing || rateValidFromInvalid)}
                value={rateValidFrom}
                onChange={(event) => setRateValidFrom(event.target.value)}
                data-testid="new-aircraft-rate-valid-from"
              />
            </Field>
          </div>
        </Section>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="identity-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

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

/**
 * Story AOG-1b, AC 2: how long the impacted-booking preview waits before asking
 * again. Sized on the MEASURED behaviour of the native date control (see the
 * effect that uses it), not on a habit — small enough that opening the section
 * still feels immediate, large enough that a typed year is one request.
 */
const IMPACT_DEBOUNCE_MS = 300;

/**
 * A count on screen TOGETHER with the date it was asked about (review
 * MAJOR-1). The sentence beside the number is chosen on this pair — never on
 * the date field's current value, which moves ahead of the count for a whole
 * debounce + request: an undelimited answer next to a freshly typed future
 * date would otherwise read "fermo oltre il {that date} previsto".
 */
type ShownImpact = AogBookingImpactDto & { askedUntil: string | null };

function AvailabilitySection({
  aircraft,
  locale,
  labels,
  toastLabels,
  toast,
  onMutated,
}: {
  aircraft: EditableAircraft;
  /** Story AOG-1a — needed only to format the fermo date in "Stato attuale" (same `formatDateOnly` + locale pair `RatesSection`/`HourMeterSection` already take). */
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
  toast: { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };
  onMutated: (updated: EditableAircraft) => void;
}) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  // Story AOG-1a, AC 5 — `YYYY-MM-DD` straight out of `DateInput`'s native
  // `type="date"`, which is exactly the wire format `setOutOfServiceSchema`
  // expects; an empty string means "not set" and is a legitimate submit.
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Story AOG-1b, AC 3 — the second step of the submit. Deliberately LOCAL
   * state on a section that `fleet-console.tsx` remounts on every open
   * (`key={target === null ? 'closed' : ...}`), so it cannot outlive a
   * close/reopen the way `pendingForceBody` did in BLOCKER 14.4 F1. Measured,
   * not assumed (Dev Agent Record).
   */
  const [confirming, setConfirming] = useState(false);
  /** The impacted-booking count currently on screen — `null` until the first read answers. */
  const [impact, setImpact] = useState<ShownImpact | null>(null);
  /**
   * Which of the two things that number IS: the estimate the preview fetched
   * (`false`, AC 2) or the one `POST /out-of-service` recomputed inside its own
   * transaction (`true`, AC 4) — the latter is what the persistent banner
   * reports (AC 5). Deliberately its OWN state and not a field of `impact`: it
   * is a dependency of the effect below, and folding it into the value the
   * effect WRITES would make every fetch schedule another one.
   */
  const [authoritative, setAuthoritative] = useState(false);
  const isOutOfService = aircraft.status === 'OUT_OF_SERVICE';

  /**
   * The window the count is about: the CANDIDATE date while the aircraft is
   * still operational (it changes as the admin types), the STORED one once it
   * is grounded (AC 6 — the row reappears at every reopen, same function).
   */
  const impactUntil = isOutOfService ? aircraft.outOfServiceUntil : until === '' ? null : until;

  /*
   * AC 2: the number is fetched when the section MOUNTS and re-fetched whenever
   * the candidate date changes. The trigger is the VALUE of the date control,
   * not a keystroke — but a native `<input type="date">` still emits one
   * complete value per digit of the YEAR segment while it is being typed
   * (measured: `0002-08-10`, `0020-08-10`, `0202-08-10`, `2026-08-10`), so an
   * un-debounced effect fires FOUR requests, three of them about years nobody
   * asked for. `IMPACT_DEBOUNCE_MS` collapses a whole typed date into ONE
   * request (measured, Dev Agent Record) and costs one timer.
   *
   * `authoritative` short-circuits the whole thing: once the grounding has
   * answered, its own number stands — a refetch would silently replace a
   * transactional count with a later estimate.
   */
  useEffect(() => {
    if (authoritative) return;
    const controller = new AbortController();
    const query = impactUntil === null ? '' : `?until=${encodeURIComponent(impactUntil)}`;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/v1/aircraft/${aircraft.id}/out-of-service-impact${query}`, { signal: controller.signal });
          if (!response.ok) return;
          setImpact({ ...((await response.json()) as AogBookingImpactDto), askedUntil: impactUntil });
        } catch {
          // An aborted/failed preview is not an error the admin has to act on:
          // the count is advisory, and the authoritative one still arrives with
          // the grounding itself. Never a toast, never a blocked submit.
        }
      })();
    }, IMPACT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [aircraft.id, impactUntil, authoritative]);

  async function submitOutOfService(): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError(labels.errors.reasonRequired);
      setConfirming(false);
      return;
    }
    // AC 3: the FIRST press writes nothing — it only asks. The write happens on
    // the second one, below.
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/v1/aircraft/${aircraft.id}/out-of-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Invariant [b]: the key is OMITTED when empty, never sent as `null`/`''`
      // — the schema's `.optional()` is what "return date not yet known" means.
      body: JSON.stringify({ reason: trimmed, ...(until === '' ? {} : { outOfServiceUntil: until }) }),
    });
    setBusy(false);
    setConfirming(false);

    if (!response.ok) {
      const code = await errorCodeOf(response);
      toast.show(code === 'CONFLICT' ? labels.errors.conflictStatus : labels.errors.generic, 'bad');
      return;
    }

    // Story AOG-1b, AD-5: the response is now the aircraft PLUS the count its
    // own transaction recomputed.
    const result = (await response.json()) as SetOutOfServiceApiResponse;
    setReason('');
    setUntil('');
    setReasonError(null);
    setImpact({ ...result.impactedBookings, askedUntil: result.aircraft.outOfServiceUntil });
    setAuthoritative(true);
    toast.show(toastLabels.setOutOfService, 'ok');
    onMutated(toEditable(result.aircraft));
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
    // The aircraft is airworthy again: the count that described its fermo is
    // no longer about anything, and the next read is an estimate again. No
    // email goes out here (R-AOG-i).
    setImpact(null);
    setAuthoritative(false);
    toast.show(toastLabels.returnedToService, 'ok');
    onMutated(toEditable(updated));
  }

  // Story AOG-1a, AC 5 — the fermo clause of "Stato attuale". Present ONLY
  // while the aircraft is actually grounded; `null` is a legitimate state
  // (invariant [b]) and is NAMED ("rientro da definire"), never rendered as an
  // empty string or as a bare "—" in a spot that already announces a value.
  const currentStatusText = isOutOfService
    ? `${aircraft.statusReason} · ${
        aircraft.outOfServiceUntil === null
          ? labels.availability.untilUnknown
          : labels.availability.untilValue.replace('{date}', formatDateOnly(aircraft.outOfServiceUntil, locale))
      }`
    : '—';

  function countText(one: string, many: string, count: number): string {
    return count === 1 ? one : many.replace('{count}', String(count));
  }

  /**
   * Story AOG-1b, AC 2/AC 8 — the window, stated in words, on EVERY surface
   * that shows a number, and (review MAJOR-1) chosen on the bound the count was
   * ACTUALLY taken over: `impactedBookings.effectiveUntil`, straight from the
   * domain function. Three cases, three sentences:
   * - a live bound -> "conteggio fino al {date} compreso";
   * - no date at all -> "rientro da definire: conteggio non delimitato"
   *   (invariant [b] is a legitimate state, and the one thing it must never
   *   look like is a delimited count with a missing end);
   * - a date whose day has already passed -> "fermo oltre il {date} previsto",
   *   because `computeAogImpact` counted WITHOUT a bound (AC 9: an overrun
   *   fermo must not have its warning silenced) and saying "fino al {ieri}"
   *   over that number was simply false.
   *
   * The rule that decides case 3 lives ONLY in the domain function; what is
   * read here is its answer plus the date that answer was asked about
   * (`ShownImpact`). The empty string is unreachable in render: every consumer
   * sits inside `impact ? ... : null`.
   */
  const windowText = !impact
    ? ''
    : impact.effectiveUntil !== null
      ? labels.availability.impactWindowUntil.replace('{date}', formatDateOnly(impact.effectiveUntil, locale))
      : impact.askedUntil === null
        ? labels.availability.impactWindowUndelimited
        : labels.availability.impactWindowOverdue.replace('{date}', formatDateOnly(impact.askedUntil, locale));

  const splitText = impact
    ? labels.availability.impactSplit.replace('{pending}', String(impact.pending)).replace('{approved}', String(impact.approved))
    : '';
  const impactTotal = impact ? impact.pending + impact.approved : 0;

  return (
    <div>
      <p className="fld-label" data-testid="availability-current">
        {labels.availability.current}: {currentStatusText}
      </p>

      {isOutOfService ? (
        <>
          {impact ? (
            authoritative ? (
              /* AC 5: the PERSISTENT report of what just happened. `role="status"`
                 (polite) rather than `alert`: it is the outcome of an action the
                 admin took on purpose, not an interruption — and unlike the
                 2600 ms toast beside it, it does not go away. */
              <p className="alert-box bad" role="status" style={{ marginBottom: 12, lineHeight: 1.55 }} data-testid="aog-impact-banner">
                <span style={{ display: 'block', fontWeight: 600 }}>
                  {countText(labels.availability.impactBannerOne, labels.availability.impactBannerMany, impactTotal)}
                </span>
                <span style={{ display: 'block' }}>{splitText}</span>
                <span style={{ display: 'block' }}>{windowText}</span>
                <a style={{ display: 'inline-block', marginTop: 4 }} href={`/${locale}/dashboard/bookings?status=PENDING,APPROVED`} data-testid="aog-impact-bookings-link">
                  {labels.availability.impactBookingsLink}
                </a>
              </p>
            ) : (
              /* AC 6: the same number, from the same domain function, back at
                 every reopening of an already-grounded aircraft — the banner is
                 gone with the session, this line is not. Informative only: AD-9
                 keeps every control that would 409 off this face. */
              <p className="fld-hint" style={{ marginBottom: 12 }} data-testid="aog-impact-row">
                {countText(labels.availability.impactRowOne, labels.availability.impactRowMany, impactTotal)} · {windowText}
              </p>
            )
          ) : null}
          <button type="button" className="btn" disabled={busy} onClick={() => void submitReturnToService()} data-testid="return-to-service-button">
            {labels.availability.returnToService}
          </button>
        </>
      ) : (
        /* AD-9: the whole grounding form — reason AND date — is rendered ONLY
           for an OPERATIONAL aircraft, because `setOutOfService`'s atomic
           `where: { status: 'OPERATIONAL' }` guard (review 2.2 F1, untouched)
           makes a second call a 409. Offering an editable date on an
           already-grounded aircraft would be a control that can only ever
           fail — the dead-end class of lezione 14.6 F2. */
        <div className="form-grid">
          {impact && impactTotal > 0 ? (
            /* AC 2: the warning arrives BEFORE the act, not after it. `role="status"`
               so the number is re-announced when the candidate date changes it.
               Only when there IS something to warn about: review MINOR-1 measured
               this box spending 78,13 px + 14 px of gap to say "0 prenotazioni",
               which is what pushed the primary submit under the fold of the
               scrollable body at 1280x900. Zero takes the one-line form below. */
            <p className="alert-box info" role="status" style={{ gridColumn: '1 / -1', lineHeight: 1.55 }} data-testid="aog-impact-preview">
              <span style={{ display: 'block', fontWeight: 600 }}>
                {countText(labels.availability.impactPreviewOne, labels.availability.impactPreviewMany, impactTotal)}
              </span>
              <span style={{ display: 'block' }}>{splitText}</span>
              <span style={{ display: 'block' }}>
                {windowText} · {labels.availability.impactEstimate}
              </span>
            </p>
          ) : null}
          <Field label={labels.availability.reason} wide error={reasonError ?? undefined}>
            <textarea
              className="input"
              rows={2}
              aria-invalid={Boolean(reasonError)}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError(null);
                // Editing the motivo after asking to confirm would have the
                // second press write something the first one never showed.
                setConfirming(false);
              }}
              data-testid="out-of-service-reason"
            />
          </Field>
          <Field label={labels.availability.until} hint={labels.availability.untilHint}>
            <DateInput
              value={until}
              onChange={(event) => {
                setUntil(event.target.value);
                setConfirming(false);
              }}
              data-testid="out-of-service-until"
            />
          </Field>
          {impact && impactTotal === 0 ? (
            /* Review MINOR-1: the whole preview, as one hint line, when there
               is nothing to warn about. Above 640px it sits in the grid cell
               BESIDE the date field — the one the 2-column `.form-grid` leaves
               empty — because that cell is vertical space the form already
               pays for: measured at 1280x900, it costs 0 px of extra height and
               the submit is back at the pre-story y 777.13, above the fold (a
               full-width row of its own would have left it 3.20 px under).
               At <=640px the grid is one column and it is a row after the date
               field. It is also where it belongs: "no bookings impacted" is an
               answer ABOUT the window that date defines, in the same `.fld-hint`
               idiom as the persistent row of an already-grounded aircraft.
               `role="status"` stays, so narrowing the window to zero is
               announced like any other change of the number. */
            <p className="fld-hint" role="status" style={{ alignSelf: 'end', margin: 0 }} data-testid="aog-impact-preview">
              {labels.availability.impactPreviewNone} · {windowText}
            </p>
          ) : null}
          {/* AC 3, the DOUBLE STEP. Same idiom as `ArchiveSection` two sections
              below, now taken WHOLE (review MAJOR-2): the armed state replaces
              the trigger with a QUESTION followed by the confirm/cancel pair.
              The question is not decoration — it is what makes the second step a
              step. Without it the `Conferma` button was born at the trigger's
              own origin (both measured at x 781, y 444.25) and its box covered
              the point that had just been clicked, so a plain double click armed
              AND confirmed: the grounding was written and the emails fanned out
              with nobody ever reading a confirmation. With the question in front,
              `out-of-service-confirm` starts past the end of the question text,
              exactly as `archive-confirm` does. The trigger is full-width, so the
              pair still lies inside its box (right of its centred label at 1280,
              on a second row under its lower-left corner at <=640): that part of
              the gesture is closed by the `event.detail` check on the Conferma
              below (decisione PO 6). It also gives the "the preview never
              answered" case a question of its own, where before it left two bare
              buttons with nothing above them to confirm. */}
          {/* `.fld` is a COLUMN flex box (`airops.css:1143`) — the plain, unstyled
              wrapper is what gives the lone submit the full-width box story
              AOG-1a measured, and it is left exactly that way. Only the armed
              state turns the row horizontal, for its two controls. */}
          <div className="fld wide" style={confirming ? { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 } : undefined}>
            {confirming ? (
              <>
                <span className="fld-label">
                  {impact
                    ? countText(labels.availability.confirmQuestionOne, labels.availability.confirmQuestionMany, impactTotal)
                    : labels.availability.confirmQuestionUnknown}
                </span>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={(event) => {
                    // Decisione PO 6: the SECOND half of a double click (or
                    // double tap) that armed this step lands here with
                    // `detail === 2` — the browser counts clicks by time and
                    // position, not by element — and must not confirm. A single
                    // click is `1`, keyboard activation `0`: both still confirm.
                    if (event.detail > 1) return;
                    void submitOutOfService();
                  }}
                  data-testid="out-of-service-confirm"
                >
                  {labels.availability.confirm}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)} data-testid="out-of-service-cancel">
                  {labels.cancel}
                </button>
              </>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void submitOutOfService()} data-testid="out-of-service-submit">
                {labels.availability.setOutOfService}
              </button>
            )}
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

/** Default visible window for the rates/hour-meter histories (R3, story 13.4) — full history stays reachable via "mostra tutte"/"carica altri". */
const HISTORY_VISIBLE_COUNT = 5;

/** Pure fetch, no setState (see the effect's own doc-comment for why). */
async function fetchRatesHistory(aircraftId: string): Promise<AircraftRateItemDto[]> {
  const response = await fetch(`/api/v1/aircraft/${aircraftId}/rates`);
  if (!response.ok) return [];
  return (await response.json()) as AircraftRateItemDto[];
}

function RatesSection({
  aircraftId,
  archived,
  locale,
  labels,
  toastLabels,
  toast,
  onMutated,
}: {
  aircraftId: string;
  archived: boolean;
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
  toast: { show: (msg: string, tone?: 'ok' | 'bad' | 'warn' | 'info') => void };
  onMutated: () => void;
}) {
  const [history, setHistory] = useState<AircraftRateItemDto[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // AC 2 (R3): the full history is already fetched (defensively capped at
  // 500 server-side) — showing only the last 5 by default is a pure
  // client-side slice, no extra round-trip needed to "show all".
  const [showAllRates, setShowAllRates] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewRateFormValues>({ resolver: zodResolver(newRateFormSchema), defaultValues: { price: '', priceDry: '', validFrom: todayDateOnly() } });

  /** Story 14.2: `newRateFormSchema`'s own `.refine(...)` tags a price violation with the `'invalidPrice'` marker (never shown verbatim) — anything else on the field is the plain `min(1)` required check. */
  function priceFieldError(fieldError: { message?: string } | undefined): string | undefined {
    if (!fieldError) return undefined;
    return fieldError.message === 'invalidPrice' ? labels.errors.invalidPrice : labels.errors.required;
  }

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

      {/* `archived` remains a live gate independent of role (review 14.9 F9,
          ratifica R-14.9-d): the old `canManageSettings &&` conjunct is
          dropped because only ADMIN ever reaches this editor (`aircraft.manage`
          route gate) — the readOnlyHint below now fires ONLY for an archived
          aircraft, never for a permission gap. */}
      {!archived ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="new-rate-form" style={{ marginTop: 10 }}>
          <div className="form-grid">
            <Field label={labels.rates.price} error={priceFieldError(errors.price)}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.price)} {...register('price')} />
            </Field>
            <Field label={labels.rates.priceDry} error={priceFieldError(errors.priceDry)}>
              <Input inputMode="decimal" placeholder="0,00" aria-invalid={Boolean(errors.priceDry)} {...register('priceDry')} />
            </Field>
            <Field label={labels.rates.validFrom} error={errors.validFrom ? labels.errors.required : undefined}>
              <DateInput aria-invalid={Boolean(errors.validFrom)} {...register('validFrom')} />
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
            {(showAllRates ? history : history.slice(0, HISTORY_VISIBLE_COUNT)).map((rate) => (
              <div key={rate.id} data-testid="rate-history-row" className="meter-row" style={{ padding: '4px 0' }}>
                <span>{formatDateOnly(rate.validFrom, locale)}</span>
                <span className="v mono">
                  {formatCents(rate.priceCentsPerHour, locale)}/h{rate.dryHourlyRateCents ? ` · ${formatCents(rate.dryHourlyRateCents, locale)}/h dry` : ''}
                </span>
              </div>
            ))}
            {!showAllRates && history.length > HISTORY_VISIBLE_COUNT ? (
              <button
                type="button"
                className="btn"
                onClick={() => setShowAllRates(true)}
                data-testid="rates-history-show-all"
                style={{ marginTop: 8 }}
              >
                {labels.rates.showAll.replace('{count}', String(history.length - HISTORY_VISIBLE_COUNT))}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Hour meter (contaore) ---------------------------------------------------

// R3 (story 13.4): default window shrunk from 50 to 5 — "carica altri"
// (the pre-existing `loadMore` mechanism, unchanged) reaches the rest a
// page at a time, staying under the shared pagination cap (`pageSize` <=
// 100, `paginationQuerySchema`) regardless of how large the history grows.
const HOUR_METER_HISTORY_PAGE_SIZE = HISTORY_VISIBLE_COUNT;

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
          <Field label={labels.hourMeter.newValue} error={errors.newMinutes ? labels.errors.required : undefined}>
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
          <Field label={labels.hourMeter.reason} wide error={errors.reason ? labels.errors.required : undefined}>
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
