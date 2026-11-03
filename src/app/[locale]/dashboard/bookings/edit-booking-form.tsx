'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocale } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { RequirementsWarning } from '@/components/dashboard/requirements-warning';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { Field, Input } from '@/components/ui/field';
import { focusFirstInvalid } from '@/lib/dom-focus';
import type { RequirementFailure } from '@/lib/schemas/requirements';
import { formatDateOnly } from '@/lib/time';
import { SlideOver } from '@/components/ui/slide-over';
import { aircraftOptionLabel, type AircraftOption } from './new-booking-form';
import type { BookingRowDto } from './bookings-table';

export type EditBookingFormLabels = {
  title: string;
  subtitle: string;
  cancel: string;
  save: string;
  /** Story 19.5 (D-7): the velivolo picker's placeholder and empty row — the create form's own two texts. */
  picker: { placeholder: string; noResults: string };
  aircraft: string;
  outOfServiceSuffix: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  requiredField: string;
  invalidRange: string;
  errors: {
    BOOKING_ALREADY_STARTED: string;
    BOOKING_IN_PAST: string;
    /** `{reason}` placeholder, client-filled. */
    AIRCRAFT_OUT_OF_SERVICE: string;
    /** Story AOG-1a, AC 7 — used only when `details.outOfServiceUntil` is present: the same sentence plus the INCLUSIVE fermo clause (`{date}`). The plain key above stays byte-identical for a grounding with no date (invariant [b]). */
    AIRCRAFT_OUT_OF_SERVICE_UNTIL: string;
    /** Story 15.4 (ratifica R-15.4-g): already interpolated server-side with the airfield's own window — same message the create form shows. */
    BOOKING_OUTSIDE_WINDOW: string;
    /** Story 16.3 (ops F2): the booking's person / instructor already has ANOTHER approved booking over the new interval, on any aircraft — the create form's own two strings. */
    PERSON_BUSY: string;
    INSTRUCTOR_BUSY: string;
    conflict: string;
    generic: string;
  };
  /** Story 19.10: the requirements warning's title — with «Procedi comunque» (`title`) or blocked (`blockedTitle`), the create form's own two. */
  requirements: { title: string; blockedTitle: string };
};

type EditBookingFormProps = {
  open: boolean;
  /** `null` while closed — the SlideOver still renders (closing transition), the form body just has nothing to edit yet. */
  booking: BookingRowDto | null;
  aircraftOptions: AircraftOption[];
  onClose: () => void;
  onSuccess: () => void;
  /** Story 19.10: whether the requirements warning offers «Procedi comunque» (`requirements.force`); the real gate is server-side (AD-5). */
  canForce: boolean;
  labels: EditBookingFormLabels;
};

type FormValues = {
  aircraftId: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

/** Same required-fields + range `superRefine` shape as `new-booking-form.tsx#buildFormSchema` — every field here is always required (unlike the create form's mode-conditional ones), so a plain refine suffices. */
const formSchema = z.object({ aircraftId: z.string(), startsAt: z.string(), endsAt: z.string(), notes: z.string() }).superRefine((value, ctx) => {
  if (value.aircraftId.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['aircraftId'] });
  }
  if (value.startsAt.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['startsAt'] });
  }
  if (value.endsAt.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['endsAt'] });
  } else if (value.startsAt.length > 0 && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: 'custom', message: 'invalidRange', path: ['endsAt'] });
  }
});

/** `<input type="datetime-local">` value from an ISO instant, using the BROWSER's own local wall-clock getters — same convention as the legacy `bookings-list.tsx#toDatetimeLocalValue` this replaces. */
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Story AOG-1a — `outOfServiceUntil` is additive on the SAME `AIRCRAFT_OUT_OF_SERVICE` details all four guards now share (`aircraft-status.ts#outOfServiceDetails`); story 19.10 — `failures` on a 422 `REQUIREMENTS_NOT_MET`. */
type ApiErrorBody = { error?: { code?: string; details?: { reason?: string; outOfServiceUntil?: string | null; failures?: RequirementFailure[] } } };

async function errorBodyOf(response: Response): Promise<ApiErrorBody | null> {
  return (await response.json().catch(() => null)) as ApiErrorBody | null;
}

const BLANK_VALUES: FormValues = { aircraftId: '', startsAt: '', endsAt: '', notes: '' };

function valuesFromBooking(booking: BookingRowDto | null): FormValues {
  if (!booking) return BLANK_VALUES;
  return {
    aircraftId: booking.aircraftId,
    startsAt: toDatetimeLocalValue(booking.startsAt),
    endsAt: toDatetimeLocalValue(booking.endsAt),
    notes: booking.notes ?? '',
  };
}

/**
 * "Modifica" (story 12.3, AC 3) — the SAME `PATCH /api/v1/bookings/{id}`
 * mechanics as the legacy `bookings-list.tsx#MoveBookingForm` this replaces
 * (was inline in the "Prossime prenotazioni" table row, now its own
 * `SlideOver`), re-skinned with `Field`/`Input` and, since story 19.5, a
 * `SearchCombobox` for the velivolo (the create form's own). `booking-move-*`/
 * `move-booking-*` testids are kept UNCHANGED to minimize e2e churn, same
 * rationale as `new-booking-form.tsx`'s own doc-comment — the submit button
 * stays inside `[data-testid="move-booking-form"]`, not `SlideOver`'s
 * separate `footer` slot.
 *
 * Requirements (story 19.10, D-3): every move is re-judged on the server; a
 * 422 `REQUIREMENTS_NOT_MET` opens the shared warning inside the form, exactly
 * as in the create form (`canForce` decides «Procedi comunque» vs the blocked
 * list; any change to the form closes it).
 *
 * Uses react-hook-form's `values` option (NOT `defaultValues`) so the form
 * re-syncs to a DIFFERENT `booking` automatically whenever the prop changes
 * — the idiomatic RHF way to avoid a manual "reset when the prop I'm
 * editing changes" effect (which would need a synchronous `setState` in an
 * effect body, a lint error in this codebase, `react-hooks/set-state-in-effect`)
 * while still keeping this component (and `SlideOver`'s open/close CSS
 * transition) mounted continuously rather than remounted per booking.
 */
export function EditBookingForm({ open, booking, aircraftOptions, onClose, onSuccess, canForce, labels }: EditBookingFormProps) {
  // Story AOG-1a, AC 7(e) — the fermo date in the out-of-service 422 goes through the app's own date formatter, in the reader's own locale.
  const displayLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [formError, setFormError] = useState<string | null>(null);
  // Story 19.10 (AD-6): same warning state as the create form — `body` is the
  // PATCH just refused, resent unchanged plus `force: true`.
  const [requirements, setRequirements] = useState<{ failures: RequirementFailure[]; body: Record<string, unknown> } | null>(null);
  const [proceedSubmitting, setProceedSubmitting] = useState(false);
  const [proceedError, setProceedError] = useState(false);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const formErrorRef = useRef<HTMLParagraphElement | null>(null);
  // Story 19.5 (AD-5): same `Controller` + `focusFirstInvalid` bridge as the
  // create form — the combobox forwards no `ref` for RHF's own focus.
  const formRef = useRef<HTMLFormElement | null>(null);
  const {
    register,
    control,
    handleSubmit,
    subscribe,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), values: valuesFromBooking(booking), shouldFocusError: false });

  /** Closes the warning and forgets its body — «Annulla», a new submit, a close, and ANY change to the form (the stale-body guard of the create form). */
  function dismissRequirements(): void {
    setRequirements(null);
    setProceedError(false);
  }

  useEffect(() => subscribe({ formState: { values: true }, callback: () => dismissRequirements() }), [subscribe]);

  /** «Annulla» of the warning — the focus goes back to «Salva» (review 19.9 F3). */
  function cancelRequirements(): void {
    submitButtonRef.current?.focus();
    dismissRequirements();
  }

  /** A resend that closes the warning hands the focus to the banner saying why (review 19.9 F3). */
  function closeRequirementsWithError(message: string): void {
    flushSync(() => {
      dismissRequirements();
      setFormError(message);
    });
    formErrorRef.current?.focus();
  }

  // Static mode (story 19.5, D-4/D-5): the server-rendered list, out-of-service
  // aircraft listed with their reason but not selectable.
  const aircraftComboOptions = useMemo<SearchComboboxOption[]>(
    () =>
      aircraftOptions.map((aircraft) => ({
        id: aircraft.id,
        label: aircraftOptionLabel(aircraft, labels.outOfServiceSuffix),
        disabled: aircraft.status === 'OUT_OF_SERVICE',
      })),
    [aircraftOptions, labels.outOfServiceSuffix],
  );

  // Review 12.3 F4: `formError` used to leak between rows — a caller can swap
  // `booking` to a DIFFERENT row while the SlideOver stays open (clicking
  // another row's Modifica without closing this one first), which never goes
  // through `handleClose` below. The React-documented "adjust state during
  // render" pattern (a plain comparison + conditional `setState`, NOT inside
  // an effect — `react-hooks/set-state-in-effect` only flags an effect body)
  // clears it the moment the edited booking's id changes, mounted or not.
  const [lastBookingId, setLastBookingId] = useState<string | null>(booking?.id ?? null);
  if ((booking?.id ?? null) !== lastBookingId) {
    setLastBookingId(booking?.id ?? null);
    setFormError(null);
    setRequirements(null);
    setProceedError(false);
  }

  /** Every dismiss path (X, scrim, Esc) — mirrors `new-booking-form.tsx#handleClose`'s own reset-on-close pattern, so a stale error from a PREVIOUS open never survives into the next one. */
  function handleClose(): void {
    setFormError(null);
    dismissRequirements();
    onClose();
  }

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) return null;
    return fieldError.message === 'invalidRange' ? labels.invalidRange : labels.requiredField;
  }

  /**
   * The message of a refusal this form knows, or `null` — shared by «Salva»
   * and «Procedi comunque» (story 19.10: on the resend a known 409/422 closes
   * the warning and takes the banner; only an unknown one keeps it open).
   * Story 16.3 — a busy person/instructor says so, every other 409 keeps the
   * existing message.
   */
  function knownErrorMessage(status: number, body: ApiErrorBody | null): string | null {
    const code = body?.error?.code;
    if (status === 409) {
      return code === 'PERSON_BUSY' || code === 'INSTRUCTOR_BUSY' ? labels.errors[code] : labels.errors.conflict;
    }
    switch (code) {
      case 'AIRCRAFT_OUT_OF_SERVICE': {
        // Story AOG-1a, AC 7 — same two-template rule as the create form (see
        // `new-booking-form.tsx`): the fermo clause only when a date exists,
        // and the no-date string byte-identical to today's.
        const until = body?.error?.details?.outOfServiceUntil ?? null;
        const template = until === null ? labels.errors.AIRCRAFT_OUT_OF_SERVICE : labels.errors.AIRCRAFT_OUT_OF_SERVICE_UNTIL;
        return template.replace('{reason}', body?.error?.details?.reason ?? '').replace('{date}', until === null ? '' : formatDateOnly(until, displayLocale));
      }
      case 'BOOKING_IN_PAST':
      case 'BOOKING_ALREADY_STARTED':
        return labels.errors[code];
      case 'BOOKING_OUTSIDE_WINDOW':
        // Ratifica R-15.4-g — same reasoning as the create form: moving a
        // booking outside the airfield's window must say WHICH window.
        return labels.errors.BOOKING_OUTSIDE_WINDOW;
      default:
        return null;
    }
  }

  async function onSubmit(values: FormValues): Promise<void> {
    if (!booking) return;
    dismissRequirements();
    const body = {
      aircraftId: values.aircraftId,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      notes: values.notes.trim() === '' ? null : values.notes.trim(),
    };
    const response = await fetch(`/api/v1/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await errorBodyOf(response);
      // Story 19.10: the list goes in the warning only, never also in the banner.
      if (response.status === 422 && errorBody?.error?.code === 'REQUIREMENTS_NOT_MET') {
        setFormError(null);
        setRequirements({ failures: errorBody.error.details?.failures ?? [], body });
        return;
      }
      setFormError(knownErrorMessage(response.status, errorBody) ?? labels.errors.generic);
      return;
    }

    setFormError(null);
    onSuccess();
  }

  /** «Procedi comunque» (story 19.10) — the refused PATCH unchanged plus `force: true`; the create form's own error rule. */
  async function onProceed(): Promise<void> {
    if (!booking || !requirements) return;
    setProceedSubmitting(true);
    setProceedError(false);

    let response: Response;
    try {
      response = await fetch(`/api/v1/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requirements.body, force: true }),
      });
    } catch {
      setProceedSubmitting(false);
      setProceedError(true);
      return;
    }
    setProceedSubmitting(false);

    if (!response.ok) {
      const message = knownErrorMessage(response.status, await errorBodyOf(response));
      if (message === null) {
        setProceedError(true);
        return;
      }
      closeRequirementsWithError(message);
      return;
    }

    dismissRequirements();
    setFormError(null);
    onSuccess();
  }

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.cancel}>
      {booking ? (
        <form
          ref={formRef}
          onSubmit={(event) => void handleSubmit(onSubmit, () => setTimeout(() => focusFirstInvalid(formRef.current), 0))(event)}
          noValidate
          data-testid="move-booking-form"
        >
          <div className="form-grid">
            {/* Bare `.fld` wrapper: the combobox renders its own label. The id
                (= testid) is distinct from the create form's `booking-aircraft`
                — both forms are mounted on the same page. */}
            <div className="fld">
              <Controller
                name="aircraftId"
                control={control}
                render={({ field, fieldState }) => (
                  <SearchCombobox
                    id="move-booking-aircraft"
                    label={labels.aircraft}
                    value={field.value}
                    onChange={field.onChange}
                    initialOptions={aircraftComboOptions}
                    placeholder={labels.picker.placeholder}
                    emptyText={labels.picker.noResults}
                    error={fieldErrorLabel(fieldState.error) ?? undefined}
                  />
                )}
              />
            </div>

            <Field label={labels.startsAt} error={fieldErrorLabel(errors.startsAt) ?? undefined}>
              <DateTimeInput aria-invalid={Boolean(errors.startsAt)} {...register('startsAt')} />
            </Field>

            <Field label={labels.endsAt} error={fieldErrorLabel(errors.endsAt) ?? undefined}>
              <DateTimeInput aria-invalid={Boolean(errors.endsAt)} {...register('endsAt')} />
            </Field>

            <Field label={labels.notes} wide>
              <Input maxLength={500} {...register('notes')} />
            </Field>
          </div>

          {formError ? (
            <p ref={formErrorRef} tabIndex={-1} role="alert" data-testid="move-booking-form-error" className="fld-label req-error-banner" style={{ color: 'var(--bad)', marginTop: 14 }}>
              {formError}
            </p>
          ) : null}

          {requirements ? (
            <RequirementsWarning
              failures={requirements.failures}
              canProceed={canForce}
              onProceed={() => void onProceed()}
              onCancel={cancelRequirements}
              submitting={proceedSubmitting}
              error={proceedError}
              moneyLocale={displayLocale}
              title={canForce ? labels.requirements.title : labels.requirements.blockedTitle}
            />
          ) : null}

          {/* Story 15.4 (R3, AD-6): see `new-booking-form.tsx`'s own note — the
              class is inert above 640px and pins "Salva" to the bottom of the
              full-screen panel below it. */}
          <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn" onClick={handleClose}>
              {labels.cancel}
            </button>
            <button ref={submitButtonRef} type="submit" disabled={isSubmitting} className="btn primary" data-testid="move-booking-save">
              {labels.save}
            </button>
          </div>
        </form>
      ) : null}
    </SlideOver>
  );
}
