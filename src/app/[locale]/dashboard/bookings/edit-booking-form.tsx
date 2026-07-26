'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { Field, Input, Select } from '@/components/ui/field';
import { SlideOver } from '@/components/ui/slide-over';
import type { AircraftOption } from './new-booking-form';
import type { BookingRowDto } from './bookings-table';

export type EditBookingFormLabels = {
  title: string;
  subtitle: string;
  cancel: string;
  save: string;
  selectPlaceholder: string;
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
    /** `{documents}` placeholder, client-filled. */
    EXPIRED_DOCUMENTS: string;
    conflict: string;
    generic: string;
  };
};

type EditBookingFormProps = {
  open: boolean;
  /** `null` while closed — the SlideOver still renders (closing transition), the form body just has nothing to edit yet. */
  booking: BookingRowDto | null;
  aircraftOptions: AircraftOption[];
  onClose: () => void;
  onSuccess: () => void;
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

type ApiErrorBody = { error?: { code?: string; details?: { reason?: string; documents?: Array<{ typeName: string }> } } };

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
 * `SlideOver`), re-skinned with `Field`/`Input`/`Select`. `booking-move-*`/
 * `move-booking-*` testids are kept UNCHANGED to minimize e2e churn, same
 * rationale as `new-booking-form.tsx`'s own doc-comment — the submit button
 * stays inside `[data-testid="move-booking-form"]`, not `SlideOver`'s
 * separate `footer` slot.
 *
 * Uses react-hook-form's `values` option (NOT `defaultValues`) so the form
 * re-syncs to a DIFFERENT `booking` automatically whenever the prop changes
 * — the idiomatic RHF way to avoid a manual "reset when the prop I'm
 * editing changes" effect (which would need a synchronous `setState` in an
 * effect body, a lint error in this codebase, `react-hooks/set-state-in-effect`)
 * while still keeping this component (and `SlideOver`'s open/close CSS
 * transition) mounted continuously rather than remounted per booking.
 */
export function EditBookingForm({ open, booking, aircraftOptions, onClose, onSuccess, labels }: EditBookingFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), values: valuesFromBooking(booking) });

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
  }

  /** Every dismiss path (X, scrim, Esc) — mirrors `new-booking-form.tsx#handleClose`'s own reset-on-close pattern, so a stale error from a PREVIOUS open never survives into the next one. */
  function handleClose(): void {
    setFormError(null);
    onClose();
  }

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) return null;
    return fieldError.message === 'invalidRange' ? labels.invalidRange : labels.requiredField;
  }

  async function onSubmit(values: FormValues): Promise<void> {
    if (!booking) return;
    const response = await fetch(`/api/v1/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: values.aircraftId,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      }),
    });

    if (!response.ok) {
      if (response.status === 409) {
        setFormError(labels.errors.conflict);
        return;
      }
      const body = await errorBodyOf(response);
      const code = body?.error?.code;
      if (code === 'AIRCRAFT_OUT_OF_SERVICE') {
        setFormError(labels.errors.AIRCRAFT_OUT_OF_SERVICE.replace('{reason}', body?.error?.details?.reason ?? ''));
      } else if (code === 'BOOKING_IN_PAST') {
        setFormError(labels.errors.BOOKING_IN_PAST);
      } else if (code === 'BOOKING_ALREADY_STARTED') {
        setFormError(labels.errors.BOOKING_ALREADY_STARTED);
      } else if (code === 'EXPIRED_DOCUMENTS') {
        const documentNames = (body?.error?.details?.documents ?? []).map((document) => document.typeName);
        setFormError(labels.errors.EXPIRED_DOCUMENTS.replace('{documents}', documentNames.join(', ')));
      } else {
        setFormError(labels.errors.generic);
      }
      return;
    }

    setFormError(null);
    onSuccess();
  }

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.cancel}>
      {booking ? (
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="move-booking-form">
          <div className="form-grid">
            <Field label={labels.aircraft}>
              <Select aria-invalid={Boolean(errors.aircraftId)} {...register('aircraftId')}>
                <option value="">{labels.selectPlaceholder}</option>
                {aircraftOptions.map((aircraft) => (
                  <option key={aircraft.id} value={aircraft.id} disabled={aircraft.status === 'OUT_OF_SERVICE'}>
                    {aircraft.status === 'OUT_OF_SERVICE'
                      ? `${aircraft.registration} — ${labels.outOfServiceSuffix.replace('{reason}', aircraft.statusReason ?? '')}`
                      : aircraft.registration}
                  </option>
                ))}
              </Select>
            </Field>
            {fieldErrorLabel(errors.aircraftId) ? <p className="fld-label">{fieldErrorLabel(errors.aircraftId)}</p> : null}

            <Field label={labels.startsAt}>
              <DateTimeInput aria-invalid={Boolean(errors.startsAt)} {...register('startsAt')} />
            </Field>
            {fieldErrorLabel(errors.startsAt) ? <p className="fld-label">{fieldErrorLabel(errors.startsAt)}</p> : null}

            <Field label={labels.endsAt}>
              <DateTimeInput aria-invalid={Boolean(errors.endsAt)} {...register('endsAt')} />
            </Field>
            {fieldErrorLabel(errors.endsAt) ? <p className="fld-label">{fieldErrorLabel(errors.endsAt)}</p> : null}

            <Field label={labels.notes} wide>
              <Input maxLength={500} {...register('notes')} />
            </Field>
          </div>

          {formError ? (
            <p role="alert" data-testid="move-booking-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
              {formError}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" className="btn" onClick={handleClose}>
              {labels.cancel}
            </button>
            <button type="submit" disabled={isSubmitting} className="btn primary" data-testid="move-booking-save">
              {labels.save}
            </button>
          </div>
        </form>
      ) : null}
    </SlideOver>
  );
}
