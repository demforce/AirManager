'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';

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
  notes: string;
  submit: string;
  requiredField: string;
  invalidRange: string;
  errors: {
    /** `{reason}` placeholder, client-filled. */
    AIRCRAFT_OUT_OF_SERVICE: string;
    BOOKING_IN_PAST: string;
    PERSON_NOT_BOOKABLE: string;
    overlap: string;
    generic: string;
  };
  success: string;
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

type ApiErrorBody = { error?: { code?: string; message?: string; details?: { reason?: string } } };

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
  const [bookingTarget, setBookingTarget] = useState<'self' | 'student'>('self');

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

  async function onSubmit(values: FormValues): Promise<void> {
    setFormError(null);
    setSuccess(false);

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
      } else {
        setFormError(labels.errors.generic);
      }
      return;
    }

    reset(DEFAULT_VALUES);
    setBookingTarget('self');
    setSuccess(true);
    router.refresh();
  }

  const inputClasses =
    'mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]';

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      noValidate
      data-testid="new-booking-form"
      className="space-y-5 rounded-[12px] border border-[#EAEAEA] bg-white p-6"
    >
      <h3 className="font-[family-name:var(--font-serif)] text-xl font-medium tracking-[-0.02em] text-[#111111]">{labels.title}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="booking-aircraft" className="block text-sm font-medium text-[#2F3437]">
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
          {fieldErrorLabel(errors.aircraftId) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.aircraftId)}</p> : null}
        </div>

        {mode === 'staff' ? (
          <div>
            <label htmlFor="booking-person" className="block text-sm font-medium text-[#2F3437]">
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
            {personOptions.length === 0 ? <p className="mt-1 text-xs text-[#787774]">{labels.noPersonAvailable}</p> : null}
            {fieldErrorLabel(errors.personId) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.personId)}</p> : null}
          </div>
        ) : null}

        {mode === 'staff' ? (
          <div>
            <label htmlFor="booking-instructor" className="block text-sm font-medium text-[#2F3437]">
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
            <legend className="block text-sm font-medium text-[#2F3437]">{labels.bookingTarget}</legend>
            <div className="mt-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm text-[#2F3437]">
                <input
                  type="radio"
                  name="booking-target"
                  checked={bookingTarget === 'self'}
                  onChange={() => setBookingTarget('self')}
                />
                {labels.bookForMe}
              </label>
              <label className="flex items-center gap-2 text-sm text-[#2F3437]">
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
            <label htmlFor="booking-student" className="block text-sm font-medium text-[#2F3437]">
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
            {studentOptions.length === 0 ? <p className="mt-1 text-xs text-[#787774]">{labels.noStudentAvailable}</p> : null}
            {fieldErrorLabel(errors.studentId) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.studentId)}</p> : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="booking-starts-at" className="block text-sm font-medium text-[#2F3437]">
            {labels.startsAt}
          </label>
          <input
            id="booking-starts-at"
            type="datetime-local"
            step={300}
            aria-invalid={Boolean(errors.startsAt)}
            className={inputClasses}
            {...register('startsAt')}
          />
          {fieldErrorLabel(errors.startsAt) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.startsAt)}</p> : null}
        </div>

        <div>
          <label htmlFor="booking-ends-at" className="block text-sm font-medium text-[#2F3437]">
            {labels.endsAt}
          </label>
          <input
            id="booking-ends-at"
            type="datetime-local"
            step={300}
            aria-invalid={Boolean(errors.endsAt)}
            className={inputClasses}
            {...register('endsAt')}
          />
          {fieldErrorLabel(errors.endsAt) ? <p className="mt-1 text-xs text-[#9F2F2D]">{fieldErrorLabel(errors.endsAt)}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="booking-notes" className="block text-sm font-medium text-[#2F3437]">
            {labels.notes}
          </label>
          <input id="booking-notes" maxLength={500} className={inputClasses} {...register('notes')} />
        </div>
      </div>

      {formError ? (
        <p role="alert" data-testid="booking-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      {success ? (
        <p role="status" data-testid="booking-form-success" className="rounded-[8px] bg-[#EEF3EC] px-4 py-3 text-sm text-[#346538]">
          {labels.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
