'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { Icon } from '@/components/ui/icons';

export type PprFormLabels = {
  sections: { requester: string; aircraft: string; schedule: string; additional: string };
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
  /** Plain text (e.g. "I campi contrassegnati con * sono obbligatori.") — no markup, unlike the prototype's `<span class="req">*</span>` (avoids `dangerouslySetInnerHTML` for a single asterisk). */
  requiredNote: string;
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
    again: string;
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
 * Client-side shape (epic 12, story 12.4, AC 4) — UNCHANGED from the
 * pre-12.4 `pprFormSchema`: same fields (still NO wingspan — D13, the
 * domain has no such column), same custom message codes, same
 * `eta`-in-the-past/`etd <= eta` early-out (the authoritative
 * `ETA_IN_PAST`/`ETD_NOT_AFTER_ETA` 422 codes stay server-side).
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
 * Public PPR request form (epic 8, story 8.1; FR-22, AC 1/2 — rebuilt epic
 * 12, story 12.4, AC 4) — markup/classes 1:1 with
 * `docs/design-reference/airops/PPR Request.html` (`.ppr-section-label`/
 * `.ppr-form-grid`/`.fld`/`.input`), grouped into the prototype's own 4
 * sections; `origin`/`destination` (real schema fields the prototype's own
 * mock has no equivalent for) are placed in "Aeromobile" alongside
 * registration/type/POB — a reasonable placement within the prototype's own
 * section framework (Dev Notes: no dedicated "Rotta" section in the
 * reference). POST body/wire format, honeypot, and error-code handling stay
 * BYTE-IDENTICAL to before this story (Contesto: "POST identico").
 *
 * Success swaps the form for `.ppr-success` (`role="status"`) — WITHOUT a
 * reference number (D13, AC 4: the response stays `{status:'PENDING'}`, the
 * real number arrives by email on approval) — with a "send another" action
 * that simply resets local state, no `location.reload()` needed (unlike the
 * static prototype's own vanilla-JS demo).
 */
export function PprForm({ locale, labels }: PprFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
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

  function submitAnother(): void {
    reset(DEFAULT_VALUES);
    setFormError(null);
    setSuccess(false);
  }

  if (success) {
    return (
      <div role="status" data-testid="ppr-success" className="ppr-success" style={{ gridColumn: '1/-1' }}>
        <div className="check">
          <Icon.check />
        </div>
        <h2>{labels.success.title}</h2>
        <p>{labels.success.message}</p>
        <div>
          <button type="button" className="btn accent big" onClick={submitAnother} data-testid="ppr-success-again">
            {labels.success.again}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" id="formCard" style={{ padding: '22px 24px' }}>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="ppr-form">
        <div className="ppr-section-label">{labels.sections.requester}</div>
        <div className="ppr-form-grid">
          <label className="fld wide">
            <span className="fld-label">{labels.firstName}</span>
            <input className="input" autoComplete="given-name" aria-invalid={Boolean(errors.firstName)} {...register('firstName')} />
          </label>
          {fieldErrorLabel(errors.firstName) ? <p className="fld-label">{fieldErrorLabel(errors.firstName)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.lastName}</span>
            <input className="input" autoComplete="family-name" aria-invalid={Boolean(errors.lastName)} {...register('lastName')} />
          </label>
          {fieldErrorLabel(errors.lastName) ? <p className="fld-label">{fieldErrorLabel(errors.lastName)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.email}</span>
            <input className="input" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
          </label>
          {fieldErrorLabel(errors.email) ? <p className="fld-label">{fieldErrorLabel(errors.email)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.phone}</span>
            <input className="input" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} {...register('phone')} />
          </label>
          {fieldErrorLabel(errors.phone) ? <p className="fld-label">{fieldErrorLabel(errors.phone)}</p> : null}
        </div>

        <div className="ppr-section-label">{labels.sections.aircraft}</div>
        <div className="ppr-form-grid">
          <label className="fld">
            <span className="fld-label">{labels.aircraftRegistration}</span>
            <input className="input" style={{ textTransform: 'uppercase' }} aria-invalid={Boolean(errors.aircraftRegistration)} {...register('aircraftRegistration')} />
          </label>
          {fieldErrorLabel(errors.aircraftRegistration) ? <p className="fld-label">{fieldErrorLabel(errors.aircraftRegistration)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.aircraftType}</span>
            <input className="input" aria-invalid={Boolean(errors.aircraftType)} {...register('aircraftType')} />
          </label>
          {fieldErrorLabel(errors.aircraftType) ? <p className="fld-label">{fieldErrorLabel(errors.aircraftType)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.origin}</span>
            <input className="input" aria-invalid={Boolean(errors.origin)} {...register('origin')} />
          </label>
          {fieldErrorLabel(errors.origin) ? <p className="fld-label">{fieldErrorLabel(errors.origin)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.destination}</span>
            <input className="input" aria-invalid={Boolean(errors.destination)} {...register('destination')} />
          </label>
          {fieldErrorLabel(errors.destination) ? <p className="fld-label">{fieldErrorLabel(errors.destination)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.personsOnBoard}</span>
            <input className="input" type="number" min={1} max={99} step={1} aria-invalid={Boolean(errors.personsOnBoard)} {...register('personsOnBoard')} />
          </label>
          {fieldErrorLabel(errors.personsOnBoard) ? <p className="fld-label">{fieldErrorLabel(errors.personsOnBoard)}</p> : null}
        </div>

        <div className="ppr-section-label">{labels.sections.schedule}</div>
        <div className="ppr-form-grid">
          <label className="fld">
            <span className="fld-label">{labels.eta}</span>
            <input className="input" type="datetime-local" step={300} aria-invalid={Boolean(errors.eta)} {...register('eta')} />
          </label>
          {fieldErrorLabel(errors.eta) ? <p className="fld-label">{fieldErrorLabel(errors.eta)}</p> : null}

          <label className="fld">
            <span className="fld-label">{labels.etd}</span>
            <input className="input" type="datetime-local" step={300} aria-invalid={Boolean(errors.etd)} {...register('etd')} />
          </label>
          {fieldErrorLabel(errors.etd) ? <p className="fld-label">{fieldErrorLabel(errors.etd)}</p> : null}
        </div>

        <div className="ppr-section-label">{labels.sections.additional}</div>
        <div className="ppr-form-grid">
          <label className="fld wide">
            <span className="fld-label">{labels.notes}</span>
            <textarea className="input" rows={3} maxLength={1000} {...register('notes')} />
          </label>
        </div>

        {/* Honeypot (AC 2) — off-screen, not `display:none`, aria-hidden, no
            label. See the component doc-comment. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: '1px', height: '1px', overflow: 'hidden' }}>
          <input type="text" tabIndex={-1} autoComplete="off" data-testid="ppr-honeypot" {...register('website')} />
        </div>

        {formError ? (
          <p role="alert" data-testid="ppr-form-error" style={{ marginTop: 14, borderRadius: 8, background: 'var(--bad-soft)', padding: '10px 14px', fontSize: 13, color: 'var(--bad)' }}>
            {formError}
          </p>
        ) : null}

        <div className="ppr-actions">
          <button type="submit" disabled={isSubmitting} className="btn accent big" data-testid="ppr-submit">
            {isSubmitting ? labels.submitting : labels.submit}
          </button>
          <span className="note">{labels.requiredNote}</span>
        </div>
      </form>
    </div>
  );
}
