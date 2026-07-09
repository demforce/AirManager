'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';

export type PprFormLabels = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aircraftRegistration: string;
  aircraftType: string;
  origin: string;
  destination: string;
  eta: string;
  etd: string;
  personsOnBoard: string;
  notes: string;
  submit: string;
  submitting: string;
  requiredField: string;
  invalidEmail: string;
  invalidRange: string;
  invalidPersons: string;
  errors: {
    ETA_IN_PAST: string;
    ETD_NOT_AFTER_ETA: string;
    RATE_LIMITED: string;
    generic: string;
  };
  success: {
    title: string;
    message: string;
  };
};

type PprFormProps = {
  locale: AppLocale;
  labels: PprFormLabels;
};

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  aircraftRegistration: string;
  aircraftType: string;
  origin: string;
  destination: string;
  eta: string;
  etd: string;
  personsOnBoard: string;
  notes: string;
  /** Honeypot — never shown to a human, see the hidden field below. */
  website: string;
};

const DEFAULT_VALUES: FormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  aircraftRegistration: '',
  aircraftType: '',
  origin: '',
  destination: '',
  eta: '',
  etd: '',
  personsOnBoard: '',
  notes: '',
  website: '',
};

/**
 * Client-side shape (Task 5): plain strings for every field (datetime-local
 * inputs yield the fixed-width `YYYY-MM-DDTHH:MM` shape, same reasoning as
 * `new-booking-form.tsx`'s `buildFormSchema`) with a `superRefine` producing
 * the SAME small set of custom message codes that
 * `NewBookingForm.fieldErrorLabel` uses — `requiredField` covers "empty",
 * `invalidEmail`/`invalidRange`/`invalidPersons` cover the field-specific
 * shape checks. `etd`/`notes` stay optional; `eta`-in-the-past and
 * `etd <= eta` (when `etd` is set) are checked server-side too (the
 * authoritative `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` 422 codes) — the client
 * check here is a same-request early-out, not a replacement.
 */
const pprFormSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
    aircraftRegistration: z.string(),
    aircraftType: z.string(),
    origin: z.string(),
    destination: z.string(),
    eta: z.string(),
    etd: z.string(),
    personsOnBoard: z.string(),
    notes: z.string(),
    website: z.string(),
  })
  .superRefine((value, ctx) => {
    const requiredFields: Array<keyof FormValues> = [
      'firstName',
      'lastName',
      'phone',
      'aircraftRegistration',
      'aircraftType',
      'origin',
      'destination',
      'eta',
      'personsOnBoard',
    ];
    for (const field of requiredFields) {
      if (value[field].trim().length === 0) {
        ctx.addIssue({ code: 'custom', message: 'requiredField', path: [field] });
      }
    }

    if (value.email.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['email'] });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
      ctx.addIssue({ code: 'custom', message: 'invalidEmail', path: ['email'] });
    }

    if (value.etd.length > 0 && value.eta.length > 0 && value.etd <= value.eta) {
      ctx.addIssue({ code: 'custom', message: 'invalidRange', path: ['etd'] });
    }

    if (value.personsOnBoard.trim().length > 0) {
      const persons = Number(value.personsOnBoard);
      if (!Number.isInteger(persons) || persons < 1 || persons > 99) {
        ctx.addIssue({ code: 'custom', message: 'invalidPersons', path: ['personsOnBoard'] });
      }
    }
  });

/** `POST /api/v1/ppr-requests`'s error envelope (AD-8). */
type ApiErrorBody = { error?: { code?: string } };

/**
 * Public PPR request form (epic 8, story 8.1; FR-22, AC 1/2). Datetime-local
 * inputs convert to ISO 8601 UTC via `new Date(value).toISOString()` at
 * submit time, same pattern as `new-booking-form.tsx`. `locale` (the page's
 * own locale, NFR-1) travels in the body untouched — the receipt email
 * (`ppr.service.ts`) is sent in this exact language.
 *
 * **Honeypot (AC 2)**: the `website` field is registered like any other
 * but rendered off-screen (absolute positioning, NOT `display:none` — some
 * bots skip hidden elements), `aria-hidden="true"`, `tabIndex={-1}`,
 * `autoComplete="off"`, and with no associated `<label>` — a screen-reader
 * user never learns it exists. A bot's generic autofill is likely to
 * populate it; a human never will. The server treats a non-empty value as
 * a silent success (same 201 body, nothing persisted).
 *
 * Success swaps the ENTIRE form area for an in-page confirmation
 * (`role="status"`) — this IS the "confirmation page" the AC asks for,
 * never a route navigation (Contesto: "vista di conferma in-page").
 */
export function PprForm({ locale, labels }: PprFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(pprFormSchema), defaultValues: DEFAULT_VALUES });

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) {
      return null;
    }
    if (fieldError.message === 'invalidEmail') return labels.invalidEmail;
    if (fieldError.message === 'invalidRange') return labels.invalidRange;
    if (fieldError.message === 'invalidPersons') return labels.invalidPersons;
    return labels.requiredField;
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setFormError(null);

    const body = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      aircraftRegistration: values.aircraftRegistration.trim(),
      aircraftType: values.aircraftType.trim(),
      origin: values.origin.trim(),
      destination: values.destination.trim(),
      eta: new Date(values.eta).toISOString(),
      ...(values.etd ? { etd: new Date(values.etd).toISOString() } : {}),
      personsOnBoard: Number(values.personsOnBoard),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      locale,
      // Honeypot: forwarded exactly as the user's browser (or a bot) left
      // it — an empty value here is the normal, human case.
      ...(values.website ? { website: values.website } : {}),
    };

    const response = await fetch('/api/v1/ppr-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        setFormError(labels.errors.RATE_LIMITED);
        return;
      }
      const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
      const code = errorBody?.error?.code;
      if (code === 'ETA_IN_PAST') {
        setFormError(labels.errors.ETA_IN_PAST);
      } else if (code === 'ETD_NOT_AFTER_ETA') {
        setFormError(labels.errors.ETD_NOT_AFTER_ETA);
      } else {
        setFormError(labels.errors.generic);
      }
      return;
    }

    setSuccess(true);
  }

  const inputClasses =
    'mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  if (success) {
    return (
      <div
        role="status"
        data-testid="ppr-success"
        className="rounded-[12px] border border-[#EAEAEA] bg-white p-8"
      >
        <p className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
          {labels.success.title}
        </p>
        <p className="mt-3 text-base leading-[1.6] text-[#787774]">{labels.success.message}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      data-testid="ppr-form"
      className="space-y-5 rounded-[12px] border border-[#EAEAEA] bg-white p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ppr-first-name" className="block text-sm font-medium text-[#2F3437]">
            {labels.firstName}
          </label>
          <input
            id="ppr-first-name"
            autoComplete="given-name"
            aria-invalid={Boolean(errors.firstName)}
            className={inputClasses}
            {...register('firstName')}
          />
          {fieldErrorLabel(errors.firstName) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.firstName)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-last-name" className="block text-sm font-medium text-[#2F3437]">
            {labels.lastName}
          </label>
          <input
            id="ppr-last-name"
            autoComplete="family-name"
            aria-invalid={Boolean(errors.lastName)}
            className={inputClasses}
            {...register('lastName')}
          />
          {fieldErrorLabel(errors.lastName) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.lastName)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-email" className="block text-sm font-medium text-[#2F3437]">
            {labels.email}
          </label>
          <input
            id="ppr-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            className={inputClasses}
            {...register('email')}
          />
          {fieldErrorLabel(errors.email) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.email)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-phone" className="block text-sm font-medium text-[#2F3437]">
            {labels.phone}
          </label>
          <input
            id="ppr-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            className={inputClasses}
            {...register('phone')}
          />
          {fieldErrorLabel(errors.phone) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.phone)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-aircraft-registration" className="block text-sm font-medium text-[#2F3437]">
            {labels.aircraftRegistration}
          </label>
          <input
            id="ppr-aircraft-registration"
            autoComplete="off"
            aria-invalid={Boolean(errors.aircraftRegistration)}
            className={inputClasses}
            {...register('aircraftRegistration')}
          />
          {fieldErrorLabel(errors.aircraftRegistration) ? (
            <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.aircraftRegistration)}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="ppr-aircraft-type" className="block text-sm font-medium text-[#2F3437]">
            {labels.aircraftType}
          </label>
          <input
            id="ppr-aircraft-type"
            autoComplete="off"
            aria-invalid={Boolean(errors.aircraftType)}
            className={inputClasses}
            {...register('aircraftType')}
          />
          {fieldErrorLabel(errors.aircraftType) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.aircraftType)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-origin" className="block text-sm font-medium text-[#2F3437]">
            {labels.origin}
          </label>
          <input
            id="ppr-origin"
            autoComplete="off"
            aria-invalid={Boolean(errors.origin)}
            className={inputClasses}
            {...register('origin')}
          />
          {fieldErrorLabel(errors.origin) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.origin)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-destination" className="block text-sm font-medium text-[#2F3437]">
            {labels.destination}
          </label>
          <input
            id="ppr-destination"
            autoComplete="off"
            aria-invalid={Boolean(errors.destination)}
            className={inputClasses}
            {...register('destination')}
          />
          {fieldErrorLabel(errors.destination) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.destination)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-eta" className="block text-sm font-medium text-[#2F3437]">
            {labels.eta}
          </label>
          <input
            id="ppr-eta"
            type="datetime-local"
            step={300}
            aria-invalid={Boolean(errors.eta)}
            className={inputClasses}
            {...register('eta')}
          />
          {fieldErrorLabel(errors.eta) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.eta)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-etd" className="block text-sm font-medium text-[#2F3437]">
            {labels.etd}
          </label>
          <input
            id="ppr-etd"
            type="datetime-local"
            step={300}
            aria-invalid={Boolean(errors.etd)}
            className={inputClasses}
            {...register('etd')}
          />
          {fieldErrorLabel(errors.etd) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.etd)}</p> : null}
        </div>

        <div>
          <label htmlFor="ppr-persons" className="block text-sm font-medium text-[#2F3437]">
            {labels.personsOnBoard}
          </label>
          <input
            id="ppr-persons"
            type="number"
            min={1}
            max={99}
            step={1}
            aria-invalid={Boolean(errors.personsOnBoard)}
            className={inputClasses}
            {...register('personsOnBoard')}
          />
          {fieldErrorLabel(errors.personsOnBoard) ? (
            <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.personsOnBoard)}</p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="ppr-notes" className="block text-sm font-medium text-[#2F3437]">
            {labels.notes}
          </label>
          <textarea
            id="ppr-notes"
            rows={3}
            maxLength={1000}
            className={inputClasses}
            {...register('notes')}
          />
        </div>
      </div>

      {/* Honeypot (AC 2) — off-screen, not `display:none`, aria-hidden, no
          label. See the component doc-comment. Inline style (not a
          Tailwind utility) so the off-screen positioning can never be
          affected by a class purge/ordering change. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: '1px', height: '1px', overflow: 'hidden' }}>
        <input type="text" tabIndex={-1} autoComplete="off" data-testid="ppr-honeypot" {...register('website')} />
      </div>

      {formError ? (
        <p role="alert" data-testid="ppr-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        data-testid="ppr-submit"
        className="min-h-[44px] w-full rounded-[6px] bg-[#111111] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
