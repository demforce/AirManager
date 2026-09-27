'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { Field, Input, Select } from '@/components/ui/field';
import { formatDateOnly } from '@/lib/time';
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
    /** Story AOG-1a, AC 7 — used only when `details.outOfServiceUntil` is present: the same sentence plus the INCLUSIVE fermo clause (`{date}`). The plain key above stays byte-identical for a grounding with no date (invariant [b]). */
    AIRCRAFT_OUT_OF_SERVICE_UNTIL: string;
    /** `{documents}` placeholder, client-filled. */
    EXPIRED_DOCUMENTS: string;
    /** Story 15.4 (ratifica R-15.4-g): already interpolated server-side with the airfield's own window — same message the create form shows. */
    BOOKING_OUTSIDE_WINDOW: string;
    /** Story 16.3 (ops F2): the booking's person / instructor already has ANOTHER approved booking over the new interval, on any aircraft — the create form's own two strings. */
    PERSON_BUSY: string;
    INSTRUCTOR_BUSY: string;
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

/** Story AOG-1a — `outOfServiceUntil` is additive on the SAME `AIRCRAFT_OUT_OF_SERVICE` details all four guards now share (`aircraft-status.ts#outOfServiceDetails`). */
type ApiErrorBody = { error?: { code?: string; details?: { reason?: string; outOfServiceUntil?: string | null; documents?: Array<{ typeName: string }> } } };

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
  // Story AOG-1a, AC 7(e) — the fermo date in the out-of-service 422 goes through the app's own date formatter, in the reader's own locale.
  const displayLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
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
      const body = await errorBodyOf(response);
      const code = body?.error?.code;
      // Story 16.3 — same rule as the create form: a busy person/instructor
      // says so, every other 409 keeps the existing message.
      if (response.status === 409) {
        setFormError(code === 'PERSON_BUSY' || code === 'INSTRUCTOR_BUSY' ? labels.errors[code] : labels.errors.conflict);
        return;
      }
      if (code === 'AIRCRAFT_OUT_OF_SERVICE') {
        // Story AOG-1a, AC 7 — same two-template rule as the create form (see
        // `new-booking-form.tsx`): the fermo clause only when a date exists,
        // and the no-date string byte-identical to today's.
        const until = body?.error?.details?.outOfServiceUntil ?? null;
        const template = until === null ? labels.errors.AIRCRAFT_OUT_OF_SERVICE : labels.errors.AIRCRAFT_OUT_OF_SERVICE_UNTIL;
        setFormError(
          template.replace('{reason}', body?.error?.details?.reason ?? '').replace('{date}', until === null ? '' : formatDateOnly(until, displayLocale)),
        );
      } else if (code === 'BOOKING_IN_PAST') {
        setFormError(labels.errors.BOOKING_IN_PAST);
      } else if (code === 'BOOKING_ALREADY_STARTED') {
        setFormError(labels.errors.BOOKING_ALREADY_STARTED);
      } else if (code === 'BOOKING_OUTSIDE_WINDOW') {
        // Ratifica R-15.4-g — same reasoning as the create form: moving a
        // booking outside the airfield's window must say WHICH window.
        setFormError(labels.errors.BOOKING_OUTSIDE_WINDOW);
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
            <Field label={labels.aircraft} error={fieldErrorLabel(errors.aircraftId) ?? undefined}>
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
            <p role="alert" data-testid="move-booking-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
              {formError}
            </p>
          ) : null}

          {/* Story 15.4 (R3, AD-6): see `new-booking-form.tsx`'s own note — the
              class is inert above 640px and pins "Salva" to the bottom of the
              full-screen panel below it. */}
          <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
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
