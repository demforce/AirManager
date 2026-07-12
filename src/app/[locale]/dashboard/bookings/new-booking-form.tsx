'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { DateTimeField, type DateTimeFieldLabels } from '@/components/ui/date-time-field';

export type NewBookingFormMode = 'staff' | 'instructor' | 'pilot';

export type AircraftOption = {
  id: string;
  registration: string;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
};

export type PersonOption = { id: string; firstName: string; lastName: string };

export type InstructorOption = { instructorProfileId: string; firstName: string; lastName: string };

export type NewBookingFormLabels = {
  title: string;
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
  /** Story 12.5 (AC 1) — derived label for the datetime variant's time half ("Ora inizio"), distinct from `startsAt` which stays on the DATE half. */
  startsAtTime: string;
  endsAtTime: string;
  notes: string;
  submit: string;
  requiredField: string;
  invalidRange: string;
  /** Story 12.5 (AC 1) — shared `DateTimeField` a11y/error strings for `startsAt`/`endsAt`. */
  dateTimeField: DateTimeFieldLabels;
  errors: {
    /** `{reason}` placeholder, client-filled. */
    AIRCRAFT_OUT_OF_SERVICE: string;
    BOOKING_IN_PAST: string;
    PERSON_NOT_BOOKABLE: string;
    /** `{documents}` placeholder, client-filled with the comma-joined blocking document type names (story 7.4, AC 1) — same `t.raw` pattern as `outOfServiceSuffix`. */
    EXPIRED_DOCUMENTS: string;
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
 * "Nuova prenotazione" (AC 1/2/3, Task 5) — one form, three role-scoped
 * shapes decided by `mode` (computed server-side from the actor's
 * permissions/profiles, AD-5: this component only RENDERS the right
 * picker, the service is the real guardian). Datetime-local inputs
 * (`step=300`, first in the project) convert to ISO 8601 UTC via
 * `new Date(value).toISOString()` at submit time (Dev Notes: the
 * datetime-local value is the BROWSER's wall-time). On success: `role="status"`
 * feedback, form reset, and `router.refresh()` so the server-rendered
 * "Prossime prenotazioni" table (page.tsx) re-fetches — no local list
 * reconciliation here (AD-1: the list stays a plain server read).
 *
 * **Expiry block / staff force (story 7.4, AC 1/2)**: a 422
 * `EXPIRED_DOCUMENTS` response shows the blocking document names in the
 * error banner for EVERYONE; for `mode === 'staff'` ONLY, it also opens the
 * "Forza prenotazione" section (amber, mandatory motivo) — submitting it
 * resends the EXACT same body plus `force`/`forceReason`, so the user never
 * re-fills the form. A 201 whose body carries non-empty `warnings` (a
 * non-blocking expired document) renders the amber warning banner instead
 * of the plain green success one — both are `role="status"`, mutually
 * exclusive, driven by `warnings.length`.
 */
export function NewBookingForm({
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
  const [startsAtValue, setStartsAtValue] = useState('');
  const [endsAtValue, setEndsAtValue] = useState('');

  const resolver = useMemo(() => zodResolver(buildFormSchema(mode, bookingTarget)), [mode, bookingTarget]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues: DEFAULT_VALUES });

  function fieldErrorLabel(fieldError: { message?: string } | undefined): string | null {
    if (!fieldError?.message) {
      return null;
    }
    return fieldError.message === 'invalidRange' ? labels.invalidRange : labels.requiredField;
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
    setStartsAtValue('');
    setEndsAtValue('');
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
    setStartsAtValue('');
    setEndsAtValue('');
    setBookingTarget('self');
    setFormError(null);
    resetForceState();
    setSuccess(true);
    setWarnings(created.warnings);
    router.refresh();
  }

  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[44px] w-full');

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      data-testid="new-booking-form"
      className="space-y-5 rounded-cards border border-hairline bg-paper shadow-subtle p-6"
    >
      <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">{labels.title}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="booking-aircraft" className="block text-sm font-medium text-ink">
            {labels.aircraft}
          </label>
          <select id="booking-aircraft" aria-invalid={Boolean(errors.aircraftId)} className={inputClasses} {...register('aircraftId')}>
            <option value="">{labels.selectPlaceholder}</option>
            {aircraftOptions.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.id} disabled={aircraft.status === 'OUT_OF_SERVICE'}>
                {aircraft.status === 'OUT_OF_SERVICE'
                  ? `${aircraft.registration} — ${labels.outOfServiceSuffix.replace('{reason}', aircraft.statusReason ?? '')}`
                  : aircraft.registration}
              </option>
            ))}
          </select>
          {fieldErrorLabel(errors.aircraftId) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.aircraftId)}</p> : null}
        </div>

        {mode === 'staff' ? (
          <div>
            <label htmlFor="booking-person" className="block text-sm font-medium text-ink">
              {labels.person}
            </label>
            <select id="booking-person" aria-invalid={Boolean(errors.personId)} className={inputClasses} {...register('personId')}>
              <option value="">{labels.selectPlaceholder}</option>
              {personOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.lastName} {person.firstName}
                </option>
              ))}
            </select>
            {personOptions.length === 0 ? <p className="mt-1 text-xs text-mid-gray">{labels.noPersonAvailable}</p> : null}
            {fieldErrorLabel(errors.personId) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.personId)}</p> : null}
          </div>
        ) : null}

        {mode === 'staff' ? (
          <div>
            <label htmlFor="booking-instructor" className="block text-sm font-medium text-ink">
              {labels.instructorOptional}
            </label>
            <select id="booking-instructor" className={inputClasses} {...register('instructorProfileId')}>
              <option value="">{labels.noInstructor}</option>
              {instructorOptions.map((instructor) => (
                <option key={instructor.instructorProfileId} value={instructor.instructorProfileId}>
                  {instructor.lastName} {instructor.firstName}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {mode === 'instructor' ? (
          <fieldset className="sm:col-span-2">
            <legend className="block text-sm font-medium text-ink">{labels.bookingTarget}</legend>
            <div className="mt-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="booking-target"
                  checked={bookingTarget === 'self'}
                  onChange={() => setBookingTarget('self')}
                />
                {labels.bookForMe}
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="booking-target"
                  checked={bookingTarget === 'student'}
                  onChange={() => setBookingTarget('student')}
                />
                {labels.bookForStudent}
              </label>
            </div>
          </fieldset>
        ) : null}

        {mode === 'instructor' && bookingTarget === 'student' ? (
          <div>
            <label htmlFor="booking-student" className="block text-sm font-medium text-ink">
              {labels.student}
            </label>
            <select id="booking-student" aria-invalid={Boolean(errors.studentId)} className={inputClasses} {...register('studentId')}>
              <option value="">{labels.selectPlaceholder}</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.lastName} {student.firstName}
                </option>
              ))}
            </select>
            {studentOptions.length === 0 ? <p className="mt-1 text-xs text-mid-gray">{labels.noStudentAvailable}</p> : null}
            {fieldErrorLabel(errors.studentId) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.studentId)}</p> : null}
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <DateTimeField
            id="booking-starts-at"
            dateLabel={labels.startsAt}
            timeLabel={labels.startsAtTime}
            value={startsAtValue}
            onChange={(next) => {
              setStartsAtValue(next);
              setValue('startsAt', next);
            }}
            labels={labels.dateTimeField}
            ariaInvalid={Boolean(errors.startsAt)}
          />
          {fieldErrorLabel(errors.startsAt) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.startsAt)}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <DateTimeField
            id="booking-ends-at"
            dateLabel={labels.endsAt}
            timeLabel={labels.endsAtTime}
            value={endsAtValue}
            onChange={(next) => {
              setEndsAtValue(next);
              setValue('endsAt', next);
            }}
            labels={labels.dateTimeField}
            ariaInvalid={Boolean(errors.endsAt)}
          />
          {fieldErrorLabel(errors.endsAt) ? <p className="mt-1 text-xs text-ember">{fieldErrorLabel(errors.endsAt)}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="booking-notes" className="block text-sm font-medium text-ink">
            {labels.notes}
          </label>
          <input id="booking-notes" maxLength={500} className={inputClasses} {...register('notes')} />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="booking-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      {/* "Forza prenotazione" (story 7.4, AC 2) — staff-only bypass of a real
          blocking-expiry check; the actual `bookings.manage.any` gate is
          server-side (AD-5), `mode === 'staff'` is this component's own
          mirror of that permission (page.tsx only sets it for staff/admin). */}
      {blockedDocuments && mode === 'staff' ? (
        <div
          data-testid="force-booking-section"
          className="space-y-3 rounded-nested border border-[#EADFAE] bg-[#FBF3DB] px-4 py-4"
        >
          <div>
            <h4 className="text-sm font-medium text-[#7A5A00]">{labels.force.title}</h4>
            <p className="mt-1 text-sm text-[#956400]">{labels.force.description}</p>
          </div>
          <div>
            <label htmlFor="booking-force-reason" className="block text-sm font-medium text-[#7A5A00]">
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
              className="mt-2 w-full rounded-buttons border border-[#EADFAE] bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-[#956400]"
            />
          </div>
          {forceError ? (
            <p role="alert" data-testid="force-booking-error" className="text-xs text-ember">
              {forceError}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={forceSubmitting}
              onClick={() => void onForceSubmit()}
              data-testid="force-booking-submit"
              className="min-h-[40px] rounded-buttons bg-[#956400] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7A5300] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {labels.force.submit}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForceState();
                setFormError(null);
              }}
              data-testid="force-booking-cancel"
              className="min-h-[40px] rounded-buttons border border-[#EADFAE] bg-paper px-4 py-2 text-sm font-medium text-[#7A5A00] transition-colors hover:bg-[#F7F1DC]"
            >
              {labels.force.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {success && warnings.length === 0 ? (
        <p role="status" data-testid="booking-form-success" className="rounded-nested bg-[#EEF3EC] px-4 py-3 text-sm text-[#346538]">
          {labels.success}
        </p>
      ) : null}

      {/* Success-with-warnings (story 7.4, AC 1) — amber, distinct from both
          the green plain-success banner above and the red error banner:
          the booking WAS created, but the person has non-blocking documents
          already expired for this flight day. */}
      {success && warnings.length > 0 ? (
        <div role="status" data-testid="booking-form-warning" className="rounded-nested bg-[#FBF3DB] px-4 py-3 text-sm text-[#956400]">
          <p className="font-medium">{labels.successWithWarnings}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning.typeName}>{warning.typeName}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="min-h-[44px]"
      >
        {labels.submit}
      </Button>
    </form>
  );
}
