'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { Field, Input, Select } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { Segmented } from '@/components/ui/segmented';
import { SlideOver } from '@/components/ui/slide-over';

export type NewBookingFormMode = 'staff' | 'instructor' | 'pilot';

export type AircraftOption = {
  id: string;
  registration: string;
  /** Additive (review 12.3 F8): `listBookableAircraft` already selects it — shared with `ScheduleAircraftRow` (`schedule.tsx`) so `page.tsx` can hand `aircraftOptions` to both the create form AND the timeline without a cast. */
  model: string;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
};

export type PersonOption = { id: string; firstName: string; lastName: string };

export type InstructorOption = { instructorProfileId: string; firstName: string; lastName: string };

export type NewBookingFormLabels = {
  title: string;
  subtitle: string;
  selectPlaceholder: string;
  aircraft: string;
  /** `{reason}` placeholder, client-filled (same `t.raw` pattern as `flights-manager.tsx`'s `packageNote`). */
  outOfServiceSuffix: string;
  person: string;
  noPersonAvailable: string;
  instructorOptional: string;
  noInstructor: string;
  bookingTarget: string;
  bookForMe: string;
  bookForStudent: string;
  student: string;
  noStudentAvailable: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  submit: string;
  requiredField: string;
  invalidRange: string;
  errors: {
    /** `{reason}` placeholder, client-filled. */
    AIRCRAFT_OUT_OF_SERVICE: string;
    BOOKING_IN_PAST: string;
    PERSON_NOT_BOOKABLE: string;
    /** `{documents}` placeholder, client-filled with the comma-joined blocking document type names (story 7.4, AC 1) — same `t.raw` pattern as `outOfServiceSuffix`. */
    EXPIRED_DOCUMENTS: string;
    /** Story 15.4 (ratifica R-15.4-g): already interpolated server-side with the airfield's own window — the settings live on the page, not in this component. */
    BOOKING_OUTSIDE_WINDOW: string;
    overlap: string;
    generic: string;
  };
  success: string;
  /** Success banner text when the booking was created but non-blocking documents are expiring (story 7.4, AC 1) — the list itself renders separately, this is just the intro line. */
  successWithWarnings: string;
  /** "Forza prenotazione" (story 7.4, AC 2) — only ever rendered for `mode === 'staff'`. */
  force: {
    title: string;
    description: string;
    reasonLabel: string;
    submit: string;
    cancel: string;
    requiredReason: string;
    generic: string;
  };
};

type NewBookingFormProps = {
  open: boolean;
  onClose: () => void;
  /** `staff` (`bookings.manage.any`): free person + optional instructor picker. `instructor` (`bookings.manage.own` + an active own `InstructorProfile`): "for me" / "for a student" toggle. `pilot` (`bookings.manage.own`, no active own instructor profile): books for self only, no picker. */
  mode: NewBookingFormMode;
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: InstructorOption[];
  studentOptions: PersonOption[];
  /** The actor's own person id — required to book "for me" (`instructor`/`pilot` modes). */
  ownPersonId: string | null;
  /** The actor's own ACTIVE `InstructorProfile.id` — required for the `instructor` mode's "for a student" branch. */
  ownInstructorProfileId: string | null;
  labels: NewBookingFormLabels;
};

type FormValues = {
  aircraftId: string;
  personId: string;
  instructorProfileId: string;
  studentId: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

const DEFAULT_VALUES: FormValues = {
  aircraftId: '',
  personId: '',
  instructorProfileId: '',
  studentId: '',
  startsAt: '',
  endsAt: '',
  notes: '',
};

/**
 * Field-level validation, mode-aware (Task 5): required fields depend on
 * WHO is creating the booking — a plain `z.object` cannot express that, so
 * every check lives in one `superRefine` keyed off `mode`/`bookingTarget`
 * closed over at creation time (`useMemo`d, recomputed when either changes).
 * `bookingTarget` (the instructor's "for me"/"for a student" toggle) is
 * deliberately PLAIN component state, not a react-hook-form field read via
 * `watch()` — same documented exception as `flights-manager.tsx`'s
 * `durationMode`: the React Compiler flags RHF's `watch()` as unmemoizable
 * (the same class of warning already accepted once for `data-table.tsx`); a
 * second instance here would add a second lint warning beyond that one.
 * `endsAt > startsAt` is a plain string compare — safe because
 * `<input type="datetime-local">` always yields the fixed-width
 * `YYYY-MM-DDTHH:MM` shape (same reasoning as the server schema's
 * `z.iso.datetime()` refine).
 */
function buildFormSchema(mode: NewBookingFormMode, bookingTarget: 'self' | 'student') {
  return z.object({
    aircraftId: z.string(),
    personId: z.string(),
    instructorProfileId: z.string(),
    studentId: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    notes: z.string(),
  }).superRefine((value, ctx) => {
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
    if (mode === 'staff' && value.personId.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['personId'] });
    }
    if (mode === 'instructor' && bookingTarget === 'student' && value.studentId.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'requiredField', path: ['studentId'] });
    }
  });
}

/** Story 7.4: `details` also carries `documents` on an `EXPIRED_DOCUMENTS` 422 (`{ typeName, expiresAt }[]`, `bookings.service.ts#createBooking`'s doc-comment). */
type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: { reason?: string; documents?: Array<{ typeName: string; expiresAt: string }> } };
};

/** `POST /api/v1/bookings`'s success envelope (story 7.4, AC 1) — `{ booking, warnings }`, replacing the bare item this route answered before this story. */
type CreateBookingResponseBody = { booking: { id: string }; warnings: Array<{ typeName: string; expiresAt: string }> };

/**
 * "Nuova prenotazione" (story 12.3, AC 4) — the SAME 7.1/7.3/7.4 mechanics
 * (mode-scoped picker, expiry block + staff "Forza prenotazione", success/
 * warning banners) as the legacy `new-booking-form.tsx`, re-skinned inside a
 * `SlideOver` with `Field`/`Input`/`Select` (12.1 primitives) instead of the
 * legacy Tailwind markup — Contesto: "parità funzionale COMPLETA col form
 * legacy". `data-testid="new-booking-form"`/`booking-form-*`/`force-booking-*`
 * are kept UNCHANGED (Contesto: "per minimizzare il churn e2e") — which is
 * why the submit/cancel buttons stay INSIDE this `<form>` element rather
 * than `SlideOver`'s separate `footer` slot: e2e locates them via
 * `page.getByTestId('new-booking-form').getByRole('button', ...)`, a
 * `footer`-rendered button would be a SIBLING of `so-body`, not a descendant
 * of this form, and that locator would stop finding it.
 *
 * State resets on CLOSE (`handleClose`, called by every dismiss path: the
 * X button, the scrim, Esc, and the in-form Annulla button) rather than an
 * effect keyed on `open` becoming `true` — this component stays mounted the
 * whole time (`SlideOver`'s own CSS drives the slide transition), and a
 * synchronous `setState` in an effect body is a lint error in this codebase
 * (`react-hooks/set-state-in-effect`); resetting from a user-triggered event
 * handler needs no effect at all, and leaves the form clean the NEXT time it
 * opens (same end result, one render earlier).
 */
export function NewBookingForm({
  open,
  onClose,
  mode,
  aircraftOptions,
  personOptions,
  instructorOptions,
  studentOptions,
  ownPersonId,
  ownInstructorProfileId,
  labels,
}: NewBookingFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ typeName: string; expiresAt: string }>>([]);
  const [bookingTarget, setBookingTarget] = useState<'self' | 'student'>('self');

  // --- Expiry block / staff force (story 7.4, AC 1/2) ---------------------
  // `blockedDocuments` is non-null ONLY right after a 422 `EXPIRED_DOCUMENTS`
  // — its presence (for `mode === 'staff'`) is what renders the "Forza
  // prenotazione" section below. `pendingForceBody` is the EXACT body that
  // just got rejected, kept so "Forza prenotazione" can resend it unchanged
  // plus `force`/`forceReason` — the user never re-fills the form.
  const [blockedDocuments, setBlockedDocuments] = useState<string[] | null>(null);
  const [pendingForceBody, setPendingForceBody] = useState<Record<string, unknown> | null>(null);
  const [forceReason, setForceReason] = useState('');
  const [forceReasonTouched, setForceReasonTouched] = useState(false);
  const [forceSubmitting, setForceSubmitting] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(buildFormSchema(mode, bookingTarget)), [mode, bookingTarget]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues: DEFAULT_VALUES });

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) {
      return null;
    }
    return fieldError.message === 'invalidRange' ? labels.invalidRange : labels.requiredField;
  }

  function handleClose(): void {
    reset(DEFAULT_VALUES);
    setBookingTarget('self');
    setFormError(null);
    setSuccess(false);
    setWarnings([]);
    setBlockedDocuments(null);
    setPendingForceBody(null);
    setForceReason('');
    setForceReasonTouched(false);
    setForceSubmitting(false);
    setForceError(null);
    onClose();
  }

  /** Clears every force-related state — used both on a successful bypass and on "Annulla" (Task 4: "annulla che torna al form pulito dallo stato force"). */
  function resetForceState(): void {
    setBlockedDocuments(null);
    setPendingForceBody(null);
    setForceReason('');
    setForceReasonTouched(false);
    setForceError(null);
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setFormError(null);
    setSuccess(false);
    resetForceState();

    let personId: string;
    let instructorProfileId: string | undefined;
    if (mode === 'staff') {
      personId = values.personId;
      instructorProfileId = values.instructorProfileId || undefined;
    } else if (mode === 'instructor' && bookingTarget === 'student') {
      personId = values.studentId;
      instructorProfileId = ownInstructorProfileId ?? undefined;
    } else {
      // `instructor` booking "for me", or `pilot` mode (no picker at all).
      personId = ownPersonId ?? '';
      instructorProfileId = undefined;
    }

    const body = {
      aircraftId: values.aircraftId,
      personId,
      ...(instructorProfileId ? { instructorProfileId } : {}),
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };

    const response = await fetch('/api/v1/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // 409 (overlap) is never conflated with a 422 domain code (Dev Notes).
      if (response.status === 409) {
        setFormError(labels.errors.overlap);
        return;
      }
      const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
      const code = errorBody?.error?.code;
      if (code === 'AIRCRAFT_OUT_OF_SERVICE') {
        setFormError(labels.errors.AIRCRAFT_OUT_OF_SERVICE.replace('{reason}', errorBody?.error?.details?.reason ?? ''));
      } else if (code === 'BOOKING_IN_PAST') {
        setFormError(labels.errors.BOOKING_IN_PAST);
      } else if (code === 'PERSON_NOT_BOOKABLE') {
        setFormError(labels.errors.PERSON_NOT_BOOKABLE);
      } else if (code === 'BOOKING_OUTSIDE_WINDOW') {
        // Ratifica R-15.4-g: this used to fall through to the generic
        // "Riprova", which is the one thing that cannot work — the slot is
        // outside the airfield's window and retrying it fails again. The
        // message now states the window (interpolated server-side).
        setFormError(labels.errors.BOOKING_OUTSIDE_WINDOW);
      } else if (code === 'EXPIRED_DOCUMENTS') {
        // Story 7.4, AC 1/2: the message lists the blocking document names
        // (from `details.documents`, never the server's English-only
        // message — AD-8: messages are for logs, codes+details drive the UI).
        const documentNames = (errorBody?.error?.details?.documents ?? []).map((document) => document.typeName);
        setFormError(labels.errors.EXPIRED_DOCUMENTS.replace('{documents}', documentNames.join(', ')));
        // Only staff (`mode === 'staff'`, Contesto's exact gate) ever gets a
        // bypass affordance — everyone else just sees the message above.
        if (mode === 'staff') {
          setBlockedDocuments(documentNames);
          setPendingForceBody(body);
        }
      } else {
        setFormError(labels.errors.generic);
      }
      return;
    }

    const created = (await response.json()) as CreateBookingResponseBody;
    reset(DEFAULT_VALUES);
    setBookingTarget('self');
    setSuccess(true);
    setWarnings(created.warnings);
    router.refresh();
  }

  async function onForceSubmit(): Promise<void> {
    const trimmedReason = forceReason.trim();
    setForceReasonTouched(true);
    if (trimmedReason.length === 0) {
      setForceError(labels.force.requiredReason);
      return;
    }
    if (!pendingForceBody) {
      return;
    }

    setForceSubmitting(true);
    setForceError(null);

    const response = await fetch('/api/v1/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pendingForceBody, force: true, forceReason: trimmedReason }),
    });

    setForceSubmitting(false);

    if (!response.ok) {
      // A concurrent change (e.g. the slot got taken, or the reason was
      // rejected as too long) — the generic message is enough here, the
      // primary error path above already covers every other domain code.
      setForceError(labels.force.generic);
      return;
    }

    const created = (await response.json()) as CreateBookingResponseBody;
    reset(DEFAULT_VALUES);
    setBookingTarget('self');
    setFormError(null);
    resetForceState();
    setSuccess(true);
    setWarnings(created.warnings);
    router.refresh();
  }

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.force.cancel}>
      <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate data-testid="new-booking-form">
        <div className="form-grid">
          {mode === 'staff' ? (
            <Field label={labels.person} wide error={fieldErrorLabel(errors.personId) ?? undefined}>
              <Select aria-invalid={Boolean(errors.personId)} {...register('personId')}>
                <option value="">{labels.selectPlaceholder}</option>
                {personOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.lastName} {person.firstName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === 'staff' && personOptions.length === 0 ? <p className="fld-label">{labels.noPersonAvailable}</p> : null}

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

          {mode === 'staff' ? (
            <Field label={labels.instructorOptional}>
              <Select {...register('instructorProfileId')}>
                <option value="">{labels.noInstructor}</option>
                {instructorOptions.map((instructor) => (
                  <option key={instructor.instructorProfileId} value={instructor.instructorProfileId}>
                    {instructor.lastName} {instructor.firstName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {/* Story 14.7, AC 1: one binary AirOps `Segmented` control instead of
              two radios — same component `aircraft-editor.tsx`'s `based`
              toggle already uses, chosen over a checkbox/switch because the
              choice is a named PAIR of mutually-exclusive options ("per me" /
              "per un allievo"), exactly what `Segmented` is for; a bare
              toggle would need its own on/off-to-label mapping for no
              benefit. `bookingTarget`'s semantics (state, schema, the student
              field's conditional render+validation) are UNCHANGED — only the
              markup driving it.

              NOT wrapped in `Field` (unlike `BasedSegmented`'s usage):
              `Field`'s implicit `<label>` associates with the FIRST
              labelable descendant only (native HTML behaviour) — verified
              interactively that this makes Chromium compute that first
              button's accessible name as the label text PLUS the OTHER
              button's text, with the button's OWN text silently dropped
              (e.g. "Per me" -> "Prenota Per un allievo"), while the second
              button keeps a clean name. Same `role="group"`/`aria-label`
              pattern `schedule.tsx`'s view toggle already uses instead: the
              GROUP gets the accessible name, each button keeps its own
              clean one — reused here via `Segmented`'s new `ariaLabel` prop
              rather than hand-rolling the group markup again. Visual layout
              is identical to `Field`'s (same `fld`/`fld-label-group`/
              `fld-label`/`fld-ctrl` classes), just without the label
              wrapper. */}
          {mode === 'instructor' ? (
            <div className="fld wide">
              <div className="fld-label-group">
                <span className="fld-label">{labels.bookingTarget}</span>
                <span className="fld-ctrl">
                  <Segmented
                    ariaLabel={labels.bookingTarget}
                    options={[
                      { value: 'self', label: labels.bookForMe },
                      { value: 'student', label: labels.bookForStudent },
                    ]}
                    value={bookingTarget}
                    onChange={setBookingTarget}
                  />
                </span>
              </div>
            </div>
          ) : null}

          {mode === 'instructor' && bookingTarget === 'student' ? (
            <Field label={labels.student} error={fieldErrorLabel(errors.studentId) ?? undefined}>
              <Select aria-invalid={Boolean(errors.studentId)} {...register('studentId')}>
                <option value="">{labels.selectPlaceholder}</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.lastName} {student.firstName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode === 'instructor' && bookingTarget === 'student' && studentOptions.length === 0 ? <p className="fld-label">{labels.noStudentAvailable}</p> : null}

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
          <p role="alert" data-testid="booking-form-error" className="fld-label" style={{ color: 'var(--bad)', marginTop: 14 }}>
            {formError}
          </p>
        ) : null}

        {/* "Forza prenotazione" (story 7.4, AC 2) — staff-only bypass of a real
            blocking-expiry check; the actual `bookings.manage.any` gate is
            server-side (AD-5), `mode === 'staff'` is this component's own
            mirror of that permission (page.tsx only sets it for staff/admin). */}
        {blockedDocuments && mode === 'staff' ? (
          <div data-testid="force-booking-section" style={{ marginTop: 14, padding: 14, borderRadius: 8, background: 'var(--warn-soft)', border: '1px solid color-mix(in oklch, var(--warn) 40%, transparent)' }}>
            <div>
              <h4 className="fld-label" style={{ color: 'var(--accent-ink)' }}>
                {labels.force.title}
              </h4>
              <p style={{ marginTop: 4, fontSize: 13 }}>{labels.force.description}</p>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className="fld-label" htmlFor="booking-force-reason">
                {labels.force.reasonLabel}
              </label>
              <textarea
                id="booking-force-reason"
                rows={2}
                maxLength={500}
                value={forceReason}
                onChange={(event) => setForceReason(event.target.value)}
                aria-invalid={forceReasonTouched && forceReason.trim().length === 0}
                data-testid="force-booking-reason"
                className="input"
                style={{ marginTop: 6 }}
              />
            </div>
            {forceError ? (
              <p role="alert" data-testid="force-booking-error" className="fld-error" style={{ marginTop: 6 }}>
                {forceError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" disabled={forceSubmitting} onClick={() => void onForceSubmit()} data-testid="force-booking-submit" className="btn primary">
                {labels.force.submit}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForceState();
                  setFormError(null);
                }}
                data-testid="force-booking-cancel"
                className="btn"
              >
                {labels.force.cancel}
              </button>
            </div>
          </div>
        ) : null}

        {success && warnings.length === 0 ? (
          <p role="status" data-testid="booking-form-success" className="fld-label" style={{ color: 'var(--ok)', marginTop: 14 }}>
            {labels.success}
          </p>
        ) : null}

        {/* Success-with-warnings (story 7.4, AC 1) — amber, distinct from both
            the plain success message above and the error message: the
            booking WAS created, but the person has non-blocking documents
            already expired for this flight day. */}
        {success && warnings.length > 0 ? (
          <div role="status" data-testid="booking-form-warning" style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--warn-soft)', color: 'var(--accent-ink)' }}>
            <p style={{ fontWeight: 600, fontSize: 13 }}>{labels.successWithWarnings}</p>
            <ul style={{ marginTop: 4, paddingLeft: 18, listStyle: 'disc' }}>
              {warnings.map((warning) => (
                <li key={warning.typeName}>{warning.typeName}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Story 15.4 (R3, AD-6): `so-actions` is the hook the <=640px
            full-screen mode uses to pin the PRIMARY action to the bottom of
            the panel (`airops.css`, inside `@media (max-width: 640px)` — inert
            on the desktop, where this row keeps its exact geometry). It goes
            on THIS row only: the "Forza prenotazione" row above keeps
            scrolling with its own amber section, because two stacked sticky
            bars are the defect review 15.2 F3 deferred to story 15.5. */}
        <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={handleClose}>
            {labels.force.cancel}
          </button>
          <button type="submit" disabled={isSubmitting} className="btn primary">
            <Icon.check /> {labels.submit}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
