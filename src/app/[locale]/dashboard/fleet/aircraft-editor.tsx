'use client';

/**
 * Aircraft slide-over editor (story 12.5, AC 3) — port of
 * `docs/design-reference/airops/src/Fleet.jsx#AircraftEditor`, extended to
 * sections carrying EVERY legacy `aircraft-manager.tsx` function
 * (anagrafica, tariffe, disponibilità, archivio) — all visible
 * TOGETHER in one scrollable slide-over, rather than the legacy's swapped
 * single-panel-at-a-time layout, since AC 3 calls for "sezioni" not
 * "pannelli". Story 19.3 (R-19-m, A17): the data — anagrafica AND tariffe —
 * live in ONE form with ONE Salva (`identity-form`, submitted from the
 * panel's footer), in creation and in modification alike; the rate rides in
 * the same composite request (`POST`/`PATCH /api/v1/aircraft`). Disponibilità
 * and Archivio stay ACTIONS with effects of their own, not data.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Field, Input } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import { formatCents, parseCents } from '@/lib/money';
import { APP_TIMEZONE, formatDateOnly, formatMinutes } from '@/lib/time';
import { todayDateOnlyInZone } from '@/lib/zoned-time';
import {
  createAircraftSchema,
  updateAircraftSchema,
  type AogBookingImpactDto,
  type CreateAircraftInput,
  type UpdateAircraftInput,
  type UpdateAircraftRateInput,
} from '@/lib/schemas/aircraft';
import type { FleetConsoleItem, RatePrices, ScheduledRate } from './fleet-console';

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
  /** Story 19.3 (R-19-f) — the two prices + "In vigore da" of the ONE form; no history, no display-only price. */
  rates: {
    sectionTitle: string;
    studentPrice: string;
    pilotPrice: string;
    validFrom: string;
    /** `t.raw` template with a `{price}` placeholder — the field hint when a rate is in effect today (the placeholder alone is not accessible). */
    currentHint: string;
    /** The field hint when NO rate is in effect today. */
    noCurrentRate: string;
    /** `t.raw` template, `{date}`/`{student}`/`{pilot}` — the ONE "variazione programmata" line (Q-19.3-d). */
    scheduled: string;
    /** Shown instead of the three fields on an archived aircraft. */
    readOnlyHint: string;
  };
  /** Story 19.2 (R-19-b) — read-only: the aircraft's hours are the sum of its registered flights. */
  flightHours: {
    sectionTitle: string;
    total: string;
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
    /** Review 19.3 F3 — the 409 `AIRCRAFT_ARCHIVED` of a Salva with a rate, when the aircraft was archived elsewhere while the panel was open. */
    aircraftArchived: string;
    conflictStatus: string;
    invalidPrice: string;
    invalidDate: string;
    /** Story 19.3 — "In vigore da" before today (client check, and the server's `RATE_VALID_FROM_IN_PAST`). */
    validFromPast: string;
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
};

type EditorTarget = { mode: 'new' } | { mode: 'edit'; aircraft: FleetConsoleItem };

type AircraftEditorProps = {
  target: EditorTarget | null;
  onClose: () => void;
  /** Refreshes the server-rendered grid/summary (AD-1) — called after every successful mutation. */
  onMutated: () => void;
  /** Σ `minutes` of the aircraft's `REGISTERED` flights (story 19.2, R-19-b) — `null` in create mode. Not on `EditableAircraft`: that copy is rebuilt from API responses (`toEditable`), which carry no hours (D-2). */
  totalMinutes: number | null;
  locale: 'it' | 'en';
  labels: AircraftEditorLabels;
  toastLabels: ToastLabels;
};

/**
 * The editor's own working copy — the fleet row minus the grid-only
 * `reserved` badge and the two rates (story 19.3), which the editor keeps in
 * a state of its own (`AircraftEditor#rates`): this copy is rebuilt from API
 * responses (`toEditable`), and no aircraft response carries a rate.
 */
type EditableAircraft = Omit<FleetConsoleItem, 'reserved' | 'currentRate' | 'scheduledRate'>;

/** The rate in effect today and the next scheduled one — the placeholders and the "variazione programmata" line (story 19.3, D-6). */
type EditorRates = { current: RatePrices | null; scheduled: ScheduledRate | null };

type AircraftApiResponse = {
  id: string;
  registration: string;
  type: string;
  model: string;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
  /** Story AOG-1a — `YYYY-MM-DD` on the wire (`aircraftListItemSchema`), or `null`. */
  outOfServiceUntil: string | null;
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
    status: aircraft.status,
    statusReason: aircraft.statusReason,
    outOfServiceUntil: aircraft.outOfServiceUntil,
    archivedAt: aircraft.archivedAt,
  };
}

type ApiErrorBody = { error?: { code?: string } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

/** The server's >0/`INT_MAX` price rule (`createAircraftRateSchema`), checked imperatively by the "Tariffe" block, which is plain state rather than react-hook-form. */
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

/** A price the way it is typed (`132,00` — no symbol, no grouping): the placeholder of a price field (story 19.3, AD-6). */
function typableCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function AircraftEditor({ target, onClose, onMutated, totalMinutes, locale, labels, toastLabels }: AircraftEditorProps) {
  const toast = useToast();
  const isNew = target?.mode === 'new';
  const [current, setCurrent] = useState<EditableAircraft | null>(target?.mode === 'edit' ? target.aircraft : null);
  /** Story 19.3 (D-6): seeded from the server row, updated locally after a Salva — survives the availability/archive actions, which rebuild `current` from responses with no rate. */
  const [rates, setRates] = useState<EditorRates>(
    target?.mode === 'edit' ? { current: target.aircraft.currentRate, scheduled: target.aircraft.scheduledRate } : { current: null, scheduled: null },
  );
  /** Mirrors `IdentitySection`'s `isSubmitting` so the footer submit can be disabled while the request is in flight. */
  const [identityBusy, setIdentityBusy] = useState(false);

  const open = target !== null;
  const title = isNew ? labels.newTitle : (current?.registration ?? '');
  const subtitle = isNew ? labels.newSubtitle : (current?.model ?? '');

  function handleMutated(updated: EditableAircraft): void {
    setCurrent(updated);
    onMutated();
  }

  /**
   * Story 19.3 (D-6) — the placeholders after a Salva, without re-reading the
   * history: every write has `validFrom >= today`, so a rate saved for TODAY
   * becomes the current one, and a future one only competes with the known
   * next scheduled rate (the nearer wins; on the same date, the saved one).
   * A price left out took the one in force on `validFrom` (review 19.3 D-1),
   * known exactly here whenever the saved row is shown: the current rate for
   * a row of today or one before the next scheduled, that scheduled row for a
   * rewrite of it — a later row never becomes the line.
   */
  function handleRateSaved(saved: UpdateAircraftRateInput, today: string): void {
    setRates((previous) => {
      const inForce = previous.scheduled !== null && previous.scheduled.validFrom <= saved.validFrom ? previous.scheduled : previous.current;
      // Non-null: a price can be left out only when a rate is in effect today (`IdentitySection#priceError`).
      const prices = {
        studentPriceCents: saved.studentPriceCents ?? inForce!.studentPriceCents,
        pilotPriceCents: saved.pilotPriceCents ?? inForce!.pilotPriceCents,
      };
      return saved.validFrom === today
        ? { ...previous, current: prices }
        : {
            ...previous,
            scheduled:
              previous.scheduled !== null && previous.scheduled.validFrom < saved.validFrom ? previous.scheduled : { ...prices, validFrom: saved.validFrom },
          };
    });
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
          locale={locale}
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
            rates={rates}
            locale={locale}
            labels={labels}
            toastLabels={toastLabels}
            toast={toast}
            onBusyChange={setIdentityBusy}
            onClose={onClose}
            onSaved={handleMutated}
            onRateSaved={handleRateSaved}
          />

          <Section title={labels.availability.sectionTitle}>
            <AvailabilitySection aircraft={current} locale={locale} labels={labels} toastLabels={toastLabels} toast={toast} onMutated={handleMutated} />
          </Section>

          <Section title={labels.flightHours.sectionTitle}>
            <p className="fld-label" data-testid="aircraft-total-hours">
              {labels.flightHours.total}: {formatMinutes(totalMinutes ?? 0)}
            </p>
          </Section>

          <Section title={labels.archive.sectionTitle}>
            <ArchiveSection aircraft={current} labels={labels} toastLabels={toastLabels} toast={toast} onMutated={handleMutated} />
          </Section>
        </>
      ) : null}
    </SlideOver>
  );
}

/** Shared section wrapper — a top divider + label. */
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
      locale: 'it' | 'en';
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
      rates: EditorRates;
      locale: 'it' | 'en';
      labels: AircraftEditorLabels;
      toastLabels: ToastLabels;
      toast: ToastHandle;
      onBusyChange: (busy: boolean) => void;
      onClose: () => void;
      onSaved: (updated: EditableAircraft) => void;
      /** Story 19.3 (D-6) — the rate block this Salva sent (a price left out = kept, review 19.3 D-1), and the "today" it was checked against. */
      onRateSaved: (saved: UpdateAircraftRateInput, today: string) => void;
    };

function IdentitySection(props: IdentitySectionProps): React.JSX.Element {
  const { labels, locale } = props;
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const isNew = props.mode === 'new';
  // Story 19.3 (R-19-m): the "Tariffe" block lives in this ONE form in both
  // modes — except on an archived aircraft, which takes no new rate (the
  // server would answer 409), so the block shows a sentence instead and the
  // body never carries `rate`.
  const archived = props.mode === 'edit' && props.aircraft.archivedAt !== null;
  const currentRate = props.mode === 'edit' ? props.rates.current : null;
  const scheduledRate = props.mode === 'edit' ? props.rates.scheduled : null;

  // Plain state + imperative validation, NOT react-hook-form (story 14.8's
  // convention for this block, same as `pilot-editor.tsx`'s `NewPersonForm`):
  // whether a field is required depends on a rate in effect, not on the field.
  const [studentPrice, setStudentPrice] = useState('');
  const [pilotPrice, setPilotPrice] = useState('');
  // A16 (story 16.9 AD-1 idiom): "today" is the Europe/Rome calendar day, the
  // same day the server's `RATE_VALID_FROM_IN_PAST` checks against. Computed
  // once per mount: the panel only renders client-side, after a click.
  const [today] = useState(() => todayDateOnlyInZone(APP_TIMEZONE));
  const [rateValidFrom, setRateValidFrom] = useState(today);
  const [rateSubmitAttempted, setRateSubmitAttempted] = useState(false);
  /** The server's 422 `RATE_VALID_FROM_IN_PAST` (midnight between render and Salva) — cleared as soon as the date changes. */
  const [validFromServerPast, setValidFromServerPast] = useState(false);

  // Touched = at least one price typed; the date alone writes nothing (AD-6).
  const rateTouched = !archived && (studentPrice.trim().length > 0 || pilotPrice.trim().length > 0);
  /** `null` = valid; otherwise the message for that price field. An empty field keeps the price in force on "In vigore da" (review 19.3 D-1) and is required only without a rate in effect today. */
  function priceError(value: string): string | null {
    if (!rateTouched) return null;
    if (value.trim().length === 0) return currentRate === null ? labels.errors.required : null;
    return isValidRatePrice(value) ? null : labels.errors.invalidPrice;
  }
  const studentPriceError = priceError(studentPrice);
  const pilotPriceError = priceError(pilotPrice);
  const trimmedValidFrom = rateValidFrom.trim();
  // Review 14.8 F2: Chromium's date input accepts >4-digit years that
  // `z.iso.date()` rejects server-side as an unmappable `rate` fieldError —
  // the ISO shape is enforced here so that 422 is unreachable. The native
  // `min` does not stop a TYPED earlier date (the form is `noValidate`), so
  // "before today" is checked here too — ISO strings compare as dates.
  const validFromError = !rateTouched
    ? null
    : trimmedValidFrom.length === 0
      ? labels.errors.required
      : !/^\d{4}-\d{2}-\d{2}$/.test(trimmedValidFrom)
        ? labels.errors.invalidDate
        : trimmedValidFrom < today || validFromServerPast
          ? labels.errors.validFromPast
          : null;
  const rateBlocked = studentPriceError !== null || pilotPriceError !== null || validFromError !== null;

  const defaultValues = isNew
    ? { registration: '', type: '', model: '' }
    : {
        registration: props.aircraft.registration,
        type: props.aircraft.type,
        model: props.aircraft.model,
      };

  const {
    register,
    handleSubmit,
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

  /** RHF's INVALID branch (base fields failed their own zodResolver check) — same `onInvalid` role as `pilot-editor.tsx`'s `NewPersonForm`: flips the plain-state "Tariffe" block's error visibility too, so a submit with BOTH an empty identity field AND an invalid rate field marks both at once instead of leaving the rate block mute. */
  function onInvalid(): void {
    setRateSubmitAttempted(true);
  }

  async function onSubmit(values: CreateAircraftInput | UpdateAircraftInput): Promise<void> {
    setFormError(null);
    setRateSubmitAttempted(true);
    if (rateBlocked) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    // ONE composite body (story 14.8 for the create, story 19.3 / A17 for the
    // update): the server writes identity and rate in one `$transaction`, so a
    // rejected rate never leaves a half-saved form behind. An empty price is
    // left out of the body: the server keeps the one in force on `validFrom`
    // (review 19.3 D-1), so a change scheduled before that date survives —
    // today's price would silently undo it. (A creation has no rate in effect:
    // both prices are required there, `priceError`.)
    const rate = rateTouched
      ? {
          ...(studentPrice.trim().length > 0 && { studentPriceCents: parseCents(studentPrice) }),
          ...(pilotPrice.trim().length > 0 && { pilotPriceCents: parseCents(pilotPrice) }),
          validFrom: trimmedValidFrom,
        }
      : null;
    const body: CreateAircraftInput | UpdateAircraftInput = rate ? { ...values, rate } : values;

    const response = isNew
      ? await fetch('/api/v1/aircraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(`/api/v1/aircraft/${props.aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

    if (!response.ok) {
      const { code, fieldErrors } = await parseApiError(response);
      if (code === 'RATE_VALID_FROM_IN_PAST') {
        setValidFromServerPast(true);
        setTimeout(() => focusFirstInvalid(formRef.current), 0);
        return;
      }
      if (response.status === 422) {
        // Story 14.2, AC 3: field-shaped 422 mapped onto the matching Field,
        // reusing `labels.errors.required` (same generic string as client-side
        // required checks) — the raw server message is never shown (AD-8).
        const known: Array<'registration' | 'type' | 'model'> = ['registration', 'type', 'model'];
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
      setFormError(
        code === 'AIRCRAFT_ARCHIVED'
          ? labels.errors.aircraftArchived
          : code === 'CONFLICT'
            ? labels.errors.conflictRegistration
            : labels.errors.generic,
      );
      return;
    }

    const updated = (await response.json()) as AircraftApiResponse;
    if (props.mode === 'new') {
      props.toast.show(props.toastLabels.created, 'ok');
      props.onClose();
      props.onCreated();
    } else {
      props.toast.show(props.toastLabels.updated, 'ok');
      // D-6: the panel stays open on a fresh, empty rate block.
      if (rate) props.onRateSaved(rate, today);
      setStudentPrice('');
      setPilotPrice('');
      setRateValidFrom(today);
      setRateSubmitAttempted(false);
      props.onSaved(toEditable(updated));
    }
  }

  /** The field hint (linked by `aria-describedby`, unlike the placeholder): the price in effect today, or that there is none. Creation has nothing to say. */
  function priceHint(cents: number | undefined): string | undefined {
    if (isNew) return undefined;
    return cents === undefined ? labels.rates.noCurrentRate : labels.rates.currentHint.replace('{price}', formatCents(cents, locale));
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
      </div>

      <Section title={labels.rates.sectionTitle}>
        {archived ? (
          <p className="fld-hint" data-testid="aircraft-rate-readonly">
            {labels.rates.readOnlyHint}
          </p>
        ) : (
          <>
            <div className="form-grid">
              <Field
                label={labels.rates.studentPrice}
                error={rateSubmitAttempted ? (studentPriceError ?? undefined) : undefined}
                hint={priceHint(currentRate?.studentPriceCents)}
              >
                <Input
                  inputMode="decimal"
                  placeholder={currentRate ? typableCents(currentRate.studentPriceCents) : '0,00'}
                  aria-invalid={rateSubmitAttempted && studentPriceError !== null}
                  value={studentPrice}
                  onChange={(event) => setStudentPrice(event.target.value)}
                  data-testid="aircraft-rate-student"
                />
              </Field>
              <Field
                label={labels.rates.pilotPrice}
                error={rateSubmitAttempted ? (pilotPriceError ?? undefined) : undefined}
                hint={priceHint(currentRate?.pilotPriceCents)}
              >
                <Input
                  inputMode="decimal"
                  placeholder={currentRate ? typableCents(currentRate.pilotPriceCents) : '0,00'}
                  aria-invalid={rateSubmitAttempted && pilotPriceError !== null}
                  value={pilotPrice}
                  onChange={(event) => setPilotPrice(event.target.value)}
                  data-testid="aircraft-rate-pilot"
                />
              </Field>
              <Field label={labels.rates.validFrom} error={rateSubmitAttempted ? (validFromError ?? undefined) : undefined}>
                <DateInput
                  aria-invalid={rateSubmitAttempted && validFromError !== null}
                  value={rateValidFrom}
                  min={today}
                  onChange={(event) => {
                    setRateValidFrom(event.target.value);
                    setValidFromServerPast(false);
                  }}
                  data-testid="aircraft-rate-valid-from"
                />
              </Field>
            </div>
            {scheduledRate ? (
              <p className="fld-hint" data-testid="aircraft-rate-scheduled" style={{ marginTop: 12 }}>
                {labels.rates.scheduled
                  .replace('{date}', formatDateOnly(scheduledRate.validFrom, locale))
                  .replace('{student}', formatCents(scheduledRate.studentPriceCents, locale))
                  .replace('{pilot}', formatCents(scheduledRate.pilotPriceCents, locale))}
              </p>
            ) : null}
          </>
        )}
      </Section>

      {formError ? (
        <p role="alert" data-testid="identity-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
          {formError}
        </p>
      ) : null}

    </form>
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
  /** Story AOG-1a — needed only to format the fermo date in "Stato attuale" (the same `formatDateOnly` + locale pair the Tariffe block uses). */
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
                    // Accepted side effects: a triple click is ignored too, and
                    // a deliberate click that falls within the double-click
                    // interval (and a couple of px) of the arming click needs a
                    // second click.
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
