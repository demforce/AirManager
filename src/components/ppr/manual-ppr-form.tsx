'use client';

/**
 * Staff manual PPR intake slide-over (epic 12, story 12.4, AC 1-3) — ONE
 * shared component behind BOTH prototype forms
 * (`docs/design-reference/airops/src/Forms.jsx#ManualPPRForm`/
 * `#LogArrivalForm`): they hit the SAME `POST /api/v1/ppr-requests/manual`
 * endpoint with the SAME body shape (`createManualPprRequestSchema`), only
 * `approveImmediately` and the surrounding copy differ — the console's "PPR
 * manuale" (`approveImmediately={false}`, stays PENDING) and the movements
 * page's "Registra arrivo" (`approveImmediately={true}`, immediately
 * APPROVED with a pprNumber). Duplicating the ~150-line form twice for a
 * cosmetic title/subtitle difference would violate "simplicity first".
 *
 * Field composition deviates from the prototype's own mock fields (a single
 * free-text "Richiedente"/"Pilota" name and a single free-text "Contatto")
 * because the REAL schema needs `firstName`/`lastName` split and
 * `email`/`phone` typed separately — the same kind of domain-driven
 * adjustment `new-booking-form.tsx` already made to `NewBookingForm`'s own
 * free-text "Pilota" field (a real person picker there). Layout/classes
 * (`.form-grid`, `Field`/`Input`, `SlideOver`) stay 1:1.
 *
 * Closes on success (`EditBookingForm`'s pattern, not `NewBookingForm`'s
 * inline banner): a single manual/log-arrival entry is a one-off action,
 * the caller (`ppr-console.tsx`/`movements-table.tsx`) shows a toast +
 * `router.refresh()` from `onSuccess`.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { Field, Input } from '@/components/ui/field';
import { SlideOver } from '@/components/ui/slide-over';
import type { AppLocale } from '@/i18n/routing';
import { parseApiError } from '@/lib/api-field-errors';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';
import { Icon } from '@/components/ui/icons';

export type ManualPprFormLabels = {
  title: string;
  subtitle: string;
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
  cancel: string;
  requiredField: string;
  invalidEmail: string;
  invalidRange: string;
  invalidPersons: string;
  contactRequired: string;
  errors: {
    ETA_IN_PAST: string;
    ETD_NOT_AFTER_ETA: string;
    generic: string;
  };
};

type ManualPprFormProps = {
  open: boolean;
  onClose: () => void;
  /** `false` for the console's "PPR manuale" (stays PENDING); `true` for the movements page's "Registra arrivo" (immediately APPROVED, pprNumber assigned). */
  approveImmediately: boolean;
  /** The page's own locale — this form has no locale picker of its own (the prototype's forms don't either); sent as the created request's `locale` (drives which language any FUTURE outcome email would use). */
  locale: AppLocale;
  labels: ManualPprFormLabels;
  onSuccess: (created: PprRequestItemDto) => void;
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
};

const BLANK_VALUES: FormValues = {
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
};

/**
 * Same shape as the public `ppr-form.tsx#pprFormSchema` (custom message
 * codes resolved by `fieldErrorLabel` below), plus `contactRequired` — the
 * "at least one of email/phone" rule the server also enforces
 * (`createManualPprRequestSchema`'s `.refine`), checked here client-side
 * FIRST so a bare empty submit never even reaches the network.
 *
 * Review F4: the `.max()` bounds mirror `createManualPprRequestSchema`
 * (`lib/schemas/ppr.ts`) — same gap/fix as the public form's own schema. A
 * violation falls through to `fieldErrorLabel`'s generic `requiredField`
 * fallback (no dedicated "too long" message).
 */
const manualPprFormSchema = z
  .object({
    firstName: z.string().max(100),
    lastName: z.string().max(100),
    email: z.string(),
    phone: z.string().max(30),
    aircraftRegistration: z.string().max(20),
    aircraftType: z.string().max(100),
    origin: z.string().max(100),
    destination: z.string().max(100),
    eta: z.string(),
    etd: z.string(),
    personsOnBoard: z.string(),
    notes: z.string(),
  })
  .superRefine((value, ctx) => {
    const requiredFields: Array<keyof FormValues> = [
      'firstName',
      'lastName',
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

    if (value.email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
      ctx.addIssue({ code: 'custom', message: 'invalidEmail', path: ['email'] });
    }

    if (value.email.trim().length === 0 && value.phone.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'contactRequired', path: ['phone'] });
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

export function ManualPprForm({ open, onClose, approveImmediately, locale, labels, onSuccess }: ManualPprFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(manualPprFormSchema), defaultValues: BLANK_VALUES });

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) return null;
    if (fieldError.message === 'invalidEmail') return labels.invalidEmail;
    if (fieldError.message === 'invalidRange') return labels.invalidRange;
    if (fieldError.message === 'invalidPersons') return labels.invalidPersons;
    if (fieldError.message === 'contactRequired') return labels.contactRequired;
    return labels.requiredField;
  }

  function handleClose(): void {
    reset(BLANK_VALUES);
    setFormError(null);
    onClose();
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setFormError(null);

    const body = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      ...(values.email.trim() ? { email: values.email.trim() } : {}),
      ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      aircraftRegistration: values.aircraftRegistration.trim(),
      aircraftType: values.aircraftType.trim(),
      origin: values.origin.trim(),
      destination: values.destination.trim(),
      eta: new Date(values.eta).toISOString(),
      ...(values.etd ? { etd: new Date(values.etd).toISOString() } : {}),
      personsOnBoard: Number(values.personsOnBoard),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      locale,
      approveImmediately,
    };

    let response: Response;
    try {
      response = await fetch('/api/v1/ppr-requests/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify(body),
      });
    } catch {
      setFormError(labels.errors.generic);
      return;
    }
    regenerateIdempotencyKey();

    if (!response.ok) {
      const { code, fieldErrors } = await parseApiError(response);
      if (fieldErrors.size > 0) {
        // Review F4: a field-shaped 422 marks the matching Field instead of
        // only the generic banner below (`fieldErrorLabel`'s own fallback
        // translates it) — same "mapped only where a marker actually
        // renders" rule as review F1 (every field here except `notes` has a
        // visible `.fld-error` slot).
        const known: Array<keyof FormValues> = [
          'firstName',
          'lastName',
          'email',
          'phone',
          'aircraftRegistration',
          'aircraftType',
          'origin',
          'destination',
          'eta',
          'etd',
          'personsOnBoard',
        ];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: 'requiredField' });
            mapped = true;
          }
        }
        if (mapped) return;
      }
      if (code === 'ETA_IN_PAST') {
        setFormError(labels.errors.ETA_IN_PAST);
      } else if (code === 'ETD_NOT_AFTER_ETA') {
        setFormError(labels.errors.ETD_NOT_AFTER_ETA);
      } else {
        setFormError(labels.errors.generic);
      }
      return;
    }

    const created = (await response.json()) as PprRequestItemDto;
    reset(BLANK_VALUES);
    onSuccess(created);
  }

  /* Review 15.10 LOW-4 (PO decision 2026-08-06): the same medicine R-15.10-f
     gave the three multi-form editors, on the form that ratifica shares with
     them. The primary action moves from the in-body `.so-actions` bar to
     `SlideOver`'s `footer` (`.so-foot`, OUTSIDE the scrolling `.so-body`) and
     reaches this form through `form="manual-ppr-form"`. Measured at 375px on
     BOTH surfaces that mount it, at `scrollTop 0`: the sticky bar sat at
     743-812 and COVERED the ETA calendar trigger (756.73-800.73,
     `elementFromPoint` = `manual-ppr-submit`) — a 44px target that was not
     hit-testable at first sight, which is defect R3 itself. The desktop foot
     is the ratified one (review MINOR-1): the same grammar the other ten
     call-sites of `footer` already use. */
  const footer = (
    <>
      <div style={{ flex: 1 }} />
      <button type="button" className="btn" onClick={handleClose}>
        {labels.cancel}
      </button>
      <button type="submit" form="manual-ppr-form" disabled={isSubmitting} className="btn primary" data-testid="manual-ppr-submit">
        <Icon.check /> {labels.submit}
      </button>
    </>
  );

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.cancel} footer={footer}>
      {/* `manual-ppr-form` (class, not just the testid): the 44px touch floor
          of story 15.10 (R-15.10-j) has to reach the 12 fields of THIS form on
          both surfaces that mount it — `/dashboard/ppr` and the "Registra
          arrivo" of `/dashboard/movements` — without reaching `.form-grid` or
          `.input`, which every dashboard form shares. The `id` is what the
          footer submit binds to (`form="manual-ppr-form"`). */}
      <form
        id="manual-ppr-form"
        className="manual-ppr-form"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
        data-testid="manual-ppr-form"
      >
        <div className="form-grid">
          <Field label={labels.firstName} error={fieldErrorLabel(errors.firstName) ?? undefined}>
            <Input autoComplete="given-name" maxLength={100} aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
          </Field>

          <Field label={labels.lastName} error={fieldErrorLabel(errors.lastName) ?? undefined}>
            <Input autoComplete="family-name" maxLength={100} aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
          </Field>

          <Field label={labels.email} error={fieldErrorLabel(errors.email) ?? undefined}>
            <Input type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
          </Field>

          <Field label={labels.phone} error={fieldErrorLabel(errors.phone) ?? undefined}>
            <Input type="tel" autoComplete="tel" maxLength={30} aria-invalid={Boolean(errors.phone)} {...register('phone')} />
          </Field>

          <Field label={labels.aircraftRegistration} error={fieldErrorLabel(errors.aircraftRegistration) ?? undefined}>
            <Input aria-invalid={Boolean(errors.aircraftRegistration)} maxLength={20} {...register('aircraftRegistration')} style={{ textTransform: 'uppercase' }} />
          </Field>

          <Field label={labels.aircraftType} error={fieldErrorLabel(errors.aircraftType) ?? undefined}>
            <Input maxLength={100} aria-invalid={Boolean(errors.aircraftType)} {...register('aircraftType')} />
          </Field>

          <Field label={labels.origin} error={fieldErrorLabel(errors.origin) ?? undefined}>
            <Input maxLength={100} aria-invalid={Boolean(errors.origin)} {...register('origin')} />
          </Field>

          <Field label={labels.destination} error={fieldErrorLabel(errors.destination) ?? undefined}>
            <Input maxLength={100} aria-invalid={Boolean(errors.destination)} {...register('destination')} />
          </Field>

          <Field label={labels.eta} error={fieldErrorLabel(errors.eta) ?? undefined}>
            <DateTimeInput aria-invalid={Boolean(errors.eta)} {...register('eta')} />
          </Field>

          <Field label={labels.etd} error={fieldErrorLabel(errors.etd) ?? undefined}>
            <DateTimeInput aria-invalid={Boolean(errors.etd)} {...register('etd')} />
          </Field>

          <Field label={labels.personsOnBoard} error={fieldErrorLabel(errors.personsOnBoard) ?? undefined}>
            <Input type="number" min={1} max={99} step={1} aria-invalid={Boolean(errors.personsOnBoard)} {...register('personsOnBoard')} />
          </Field>

          <Field label={labels.notes} wide>
            <Input maxLength={1000} {...register('notes')} />
          </Field>
        </div>

        {formError ? (
          <p role="alert" data-testid="manual-ppr-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
            {formError}
          </p>
        ) : null}

      </form>
    </SlideOver>
  );
}
