'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocale } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { RequirementsWarning } from '@/components/dashboard/requirements-warning';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { Field, Input } from '@/components/ui/field';
import { Icon } from '@/components/ui/icons';
import { Segmented } from '@/components/ui/segmented';
import { SlideOver } from '@/components/ui/slide-over';
import { focusFirstInvalid } from '@/lib/dom-focus';
import type { RequirementFailure } from '@/lib/schemas/requirements';
import { formatDateOnly } from '@/lib/time';

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
  /** Story 19.5 (D-7): the pickers' placeholder and empty row — the same two texts as the flight form's own `picker`. */
  picker: { placeholder: string; noResults: string };
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
    /** Story AOG-1a, AC 7 — used only when `details.outOfServiceUntil` is present: the same sentence plus the INCLUSIVE fermo clause (`{date}`). The plain key above stays byte-identical for a grounding with no date (invariant [b]). */
    AIRCRAFT_OUT_OF_SERVICE_UNTIL: string;
    BOOKING_IN_PAST: string;
    PERSON_NOT_BOOKABLE: string;
    /** Story 15.4 (ratifica R-15.4-g): already interpolated server-side with the airfield's own window — the settings live on the page, not in this component. */
    BOOKING_OUTSIDE_WINDOW: string;
    /** Story 16.3 (ops F2): the booked PERSON already has an approved booking over the interval, on any aircraft. */
    PERSON_BUSY: string;
    /** Story 16.3 (ops F2): the indicated INSTRUCTOR already has an approved booking over the interval, on any aircraft. */
    INSTRUCTOR_BUSY: string;
    /** Story 19.10 (D-8): staff indicated the person themself as the instructor. */
    INSTRUCTOR_SAME_AS_PILOT: string;
    overlap: string;
    generic: string;
  };
  success: string;
  /** Success banner text when the booking was created but non-blocking documents are expiring (story 7.4, AC 1) — the list itself renders separately, this is just the intro line. */
  successWithWarnings: string;
  /** The form's «Annulla» and the panel's close label. */
  cancel: string;
  /** Story 19.10: the requirements warning's title — with «Procedi comunque» (`title`) or blocked, for whoever cannot derogate (`blockedTitle`). */
  requirements: { title: string; blockedTitle: string };
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
  /** Story 19.10: whether the requirements warning offers «Procedi comunque» (`requirements.force`, computed by the page); the real gate is server-side (AD-5). */
  canForce: boolean;
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

/** Story 19.10: `details.failures` on a 422 `REQUIREMENTS_NOT_MET` (`schemas/requirements.ts`). */
type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    /** Story AOG-1a — `outOfServiceUntil` is additive on the SAME `AIRCRAFT_OUT_OF_SERVICE` details all four guards now share (`aircraft-status.ts#outOfServiceDetails`). */
    details?: { reason?: string; outOfServiceUntil?: string | null; failures?: RequirementFailure[] };
  };
};

/** `POST /api/v1/bookings`'s success envelope (story 7.4, AC 1) — `{ booking, warnings }`, replacing the bare item this route answered before this story. */
type CreateBookingResponseBody = { booking: { id: string }; warnings: Array<{ typeName: string; expiresAt: string }> };

/** Story AOG-1 / 19.5 (D-5): an out-of-service aircraft is listed WITH its reason but cannot be picked — same label the flight form's picker uses. Shared with the move form. */
export function aircraftOptionLabel(aircraft: AircraftOption, outOfServiceSuffix: string): string {
  if (aircraft.status !== 'OUT_OF_SERVICE') return aircraft.registration;
  return `${aircraft.registration} — ${outOfServiceSuffix.replace('{reason}', aircraft.statusReason ?? '')}`;
}

/**
 * "Nuova prenotazione" (story 12.3, AC 4) — the SAME 7.1/7.3/7.4 mechanics
 * (mode-scoped picker, success/warning banners) as the legacy
 * `new-booking-form.tsx`, re-skinned inside a
 * `SlideOver` with `Field`/`Input` (12.1 primitives) instead of the legacy
 * Tailwind markup, and with one `SearchCombobox` per choice field since story
 * 19.5 (A15/A18: the flight form's own dropdown) — Contesto: "parità
 * funzionale COMPLETA col form legacy".
 * Requirements (story 19.10, R-19-h): a 422 `REQUIREMENTS_NOT_MET` opens the
 * shared `RequirementsWarning` inside the form — every failure listed, and
 * «Procedi comunque» (no motivo) for whoever holds `requirements.force`
 * (`canForce`), resending the very body just refused plus `force: true`;
 * everyone else gets the same list in its blocked mode. Any change to the form
 * closes it (the stale-body guard of the flight form, story 19.9 D-12): the
 * deroga is never sent for a body other than the one listed.
 * `data-testid="new-booking-form"`/`booking-form-*`
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
  canForce,
  labels,
}: NewBookingFormProps) {
  const router = useRouter();
  // Story AOG-1a, AC 7(e) — the fermo date in the out-of-service 422 goes through the app's own date formatter, in the reader's own locale.
  const displayLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);

  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ typeName: string; expiresAt: string }>>([]);
  const [bookingTarget, setBookingTarget] = useState<'self' | 'student'>('self');

  // --- Requirements warning (story 19.10, AD-6) ----------------------------
  // `requirements` is non-null ONLY right after a 422 `REQUIREMENTS_NOT_MET`:
  // its `failures` are what the warning lists, its `body` the EXACT request
  // just refused, resent unchanged plus `force: true` by «Procedi comunque».
  const [requirements, setRequirements] = useState<{ failures: RequirementFailure[]; body: Record<string, unknown> } | null>(null);
  const [proceedSubmitting, setProceedSubmitting] = useState(false);
  const [proceedError, setProceedError] = useState(false);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const formErrorRef = useRef<HTMLParagraphElement | null>(null);

  const resolver = useMemo(() => zodResolver(buildFormSchema(mode, bookingTarget)), [mode, bookingTarget]);

  // Story 19.5 (AD-5): the choice fields are `SearchCombobox`es bridged with
  // RHF's `Controller`; the combobox forwards no `ref`, so RHF's own
  // `shouldFocusError` would skip them and land on «Inizio» — off, and the
  // invalid branch focuses the first `aria-invalid` field in DOM order
  // instead (story 14.2's `focusFirstInvalid`).
  const formRef = useRef<HTMLFormElement | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    subscribe,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver, defaultValues: DEFAULT_VALUES, shouldFocusError: false });

  /** Closes the warning and forgets its body — «Annulla», a new submit, a close, and ANY change to the form (the stale-body guard). */
  function dismissRequirements(): void {
    setRequirements(null);
    setProceedError(false);
  }

  // The stale-body guard for the RHF fields: a value subscription (not
  // `watch()`, which the React Compiler cannot memoize) — the flight form's
  // own (story 19.9, D-12). `bookingTarget` closes it in its change handler.
  useEffect(() => subscribe({ formState: { values: true }, callback: () => dismissRequirements() }), [subscribe]);

  function handleBookingTargetChange(next: 'self' | 'student'): void {
    if (next !== bookingTarget) dismissRequirements();
    setBookingTarget(next);
  }

  /** «Annulla» of the warning — the focus goes back to the submit that opened it (review 19.9 F3), never to the page body. */
  function cancelRequirements(): void {
    submitButtonRef.current?.focus();
    dismissRequirements();
  }

  /** A resend that closes the warning hands the focus to the banner saying why (rendered first, hence `flushSync`; review 19.9 F3). */
  function closeRequirementsWithError(message: string): void {
    flushSync(() => {
      dismissRequirements();
      setFormError(message);
    });
    formErrorRef.current?.focus();
  }

  // Story 19.5 (D-4): static mode — the comboboxes filter these server-rendered
  // lists locally (no `fetchOptions`): a pilot or an instructor cannot call the
  // people/aircraft search APIs, and the lists are exactly what each actor may
  // pick today.
  const personComboOptions = useMemo<SearchComboboxOption[]>(
    () => personOptions.map((person) => ({ id: person.id, label: `${person.lastName} ${person.firstName}` })),
    [personOptions],
  );
  const aircraftComboOptions = useMemo<SearchComboboxOption[]>(
    () =>
      aircraftOptions.map((aircraft) => ({
        id: aircraft.id,
        label: aircraftOptionLabel(aircraft, labels.outOfServiceSuffix),
        disabled: aircraft.status === 'OUT_OF_SERVICE',
      })),
    [aircraftOptions, labels.outOfServiceSuffix],
  );
  const instructorComboOptions = useMemo<SearchComboboxOption[]>(
    () => [
      { id: '', label: labels.noInstructor },
      ...instructorOptions.map((instructor) => ({ id: instructor.instructorProfileId, label: `${instructor.lastName} ${instructor.firstName}` })),
    ],
    [instructorOptions, labels.noInstructor],
  );
  const studentComboOptions = useMemo<SearchComboboxOption[]>(
    () => studentOptions.map((student) => ({ id: student.id, label: `${student.lastName} ${student.firstName}` })),
    [studentOptions],
  );

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
    dismissRequirements();
    setProceedSubmitting(false);
    onClose();
  }

  /**
   * The message of a refusal this form knows, or `null` — shared by the submit
   * and «Procedi comunque» (story 19.10: on the resend a known 409/422 closes
   * the warning and takes the banner, since forcing can no longer help — review
   * 16.3 MAJOR-1; only an unknown one keeps the warning open with its retry).
   * A 409 names what is busy (story 16.3): the person or the instructor by
   * their own code, the aircraft for every other 409.
   */
  function knownErrorMessage(status: number, errorBody: ApiErrorBody | null): string | null {
    const code = errorBody?.error?.code;
    if (status === 409) {
      return code === 'PERSON_BUSY' || code === 'INSTRUCTOR_BUSY' ? labels.errors[code] : labels.errors.overlap;
    }
    switch (code) {
      case 'AIRCRAFT_OUT_OF_SERVICE': {
        // Story AOG-1a, AC 7 (precedente R-15.4-g: a 422 must SAY the
        // constraint it hit). With a date on file the message adds the fermo
        // clause in the INCLUSIVE wording R-AOG-a fixed; WITHOUT one it is
        // byte-identical to what it has always been — an absent return date is
        // a legitimate state (invariant [b]), not a blank to announce.
        const until = errorBody?.error?.details?.outOfServiceUntil ?? null;
        const template = until === null ? labels.errors.AIRCRAFT_OUT_OF_SERVICE : labels.errors.AIRCRAFT_OUT_OF_SERVICE_UNTIL;
        return template.replace('{reason}', errorBody?.error?.details?.reason ?? '').replace('{date}', until === null ? '' : formatDateOnly(until, displayLocale));
      }
      case 'BOOKING_IN_PAST':
      case 'PERSON_NOT_BOOKABLE':
      case 'INSTRUCTOR_SAME_AS_PILOT':
        return labels.errors[code];
      case 'BOOKING_OUTSIDE_WINDOW':
        // Ratifica R-15.4-g: this used to fall through to the generic
        // "Riprova", which is the one thing that cannot work — the slot is
        // outside the airfield's window and retrying it fails again. The
        // message now states the window (interpolated server-side).
        return labels.errors.BOOKING_OUTSIDE_WINDOW;
      default:
        return null;
    }
  }

  function bookingCreated(created: CreateBookingResponseBody): void {
    reset(DEFAULT_VALUES);
    setBookingTarget('self');
    setFormError(null);
    dismissRequirements();
    setSuccess(true);
    setWarnings(created.warnings);
    router.refresh();
  }

  async function onSubmit(values: FormValues): Promise<void> {
    setFormError(null);
    setSuccess(false);
    dismissRequirements();

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
      const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
      // Story 19.10: the list goes in the warning only — never also in the
      // banner, or a screen reader would read it twice (`formError` stays null).
      if (response.status === 422 && errorBody?.error?.code === 'REQUIREMENTS_NOT_MET') {
        setRequirements({ failures: errorBody.error.details?.failures ?? [], body });
        return;
      }
      // 409 (overlap) is never conflated with a 422 domain code (Dev Notes).
      setFormError(knownErrorMessage(response.status, errorBody) ?? labels.errors.generic);
      return;
    }

    bookingCreated((await response.json()) as CreateBookingResponseBody);
  }

  /**
   * «Procedi comunque» (story 19.10, AD-6) — the refused body unchanged plus
   * `force: true`. The deroga is decided last on the server (AD-3), so what can
   * still fail here is a race: a known 409/422 closes the warning and says why
   * in the banner; a network error or an unknown answer keeps it open with its
   * retry message.
   */
  async function onProceed(): Promise<void> {
    if (!requirements) return;
    setProceedSubmitting(true);
    setProceedError(false);

    let response: Response;
    try {
      response = await fetch('/api/v1/bookings', {
        method: 'POST',
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
      const message = knownErrorMessage(response.status, (await response.json().catch(() => null)) as ApiErrorBody | null);
      if (message === null) {
        setProceedError(true);
        return;
      }
      closeRequirementsWithError(message);
      return;
    }

    bookingCreated((await response.json()) as CreateBookingResponseBody);
  }

  return (
    <SlideOver open={open} onClose={handleClose} title={labels.title} subtitle={labels.subtitle} closeLabel={labels.cancel}>
      <form
        ref={formRef}
        onSubmit={(event) => void handleSubmit(onSubmit, () => setTimeout(() => focusFirstInvalid(formRef.current), 0))(event)}
        noValidate
        data-testid="new-booking-form"
      >
        <div className="form-grid">
          {/* `SearchCombobox` renders its OWN `.fld` + `<label>` (story TD-3):
              these cells use a bare `.fld`/`.fld.wide` wrapper, never a
              `Field`, which would double the label — same as the flight form. */}
          {mode === 'staff' ? (
            <div className="fld wide">
              <Controller
                name="personId"
                control={control}
                render={({ field, fieldState }) => (
                  <SearchCombobox
                    id="booking-person"
                    label={labels.person}
                    value={field.value}
                    onChange={field.onChange}
                    initialOptions={personComboOptions}
                    placeholder={labels.picker.placeholder}
                    emptyText={labels.picker.noResults}
                    error={fieldErrorLabel(fieldState.error) ?? undefined}
                  />
                )}
              />
            </div>
          ) : null}
          {mode === 'staff' && personOptions.length === 0 ? <p className="fld-label">{labels.noPersonAvailable}</p> : null}

          <div className="fld">
            <Controller
              name="aircraftId"
              control={control}
              render={({ field, fieldState }) => (
                <SearchCombobox
                  id="booking-aircraft"
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

          {mode === 'staff' ? (
            <div className="fld">
              <Controller
                name="instructorProfileId"
                control={control}
                render={({ field }) => (
                  <SearchCombobox
                    id="booking-instructor"
                    label={labels.instructorOptional}
                    value={field.value}
                    onChange={field.onChange}
                    initialOptions={instructorComboOptions}
                    placeholder={labels.picker.placeholder}
                    emptyText={labels.picker.noResults}
                  />
                )}
              />
            </div>
          ) : null}

          {/* Story 14.7, AC 1: one binary AirOps `Segmented` control instead of
              two radios, chosen over a checkbox/switch because the
              choice is a named PAIR of mutually-exclusive options ("per me" /
              "per un allievo"), exactly what `Segmented` is for; a bare
              toggle would need its own on/off-to-label mapping for no
              benefit. `bookingTarget`'s semantics (state, schema, the student
              field's conditional render+validation) are UNCHANGED — only the
              markup driving it.

              NOT wrapped in `Field`:
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
                    onChange={handleBookingTargetChange}
                  />
                </span>
              </div>
            </div>
          ) : null}

          {mode === 'instructor' && bookingTarget === 'student' ? (
            <div className="fld">
              <Controller
                name="studentId"
                control={control}
                render={({ field, fieldState }) => (
                  <SearchCombobox
                    id="booking-student"
                    label={labels.student}
                    value={field.value}
                    onChange={field.onChange}
                    initialOptions={studentComboOptions}
                    placeholder={labels.picker.placeholder}
                    emptyText={labels.picker.noResults}
                    error={fieldErrorLabel(fieldState.error) ?? undefined}
                  />
                )}
              />
            </div>
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
          <p ref={formErrorRef} tabIndex={-1} role="alert" data-testid="booking-form-error" className="fld-label req-error-banner" style={{ color: 'var(--bad)', marginTop: 14 }}>
            {formError}
          </p>
        ) : null}

        {/* Story 19.10 (AD-6): the ONE requirements warning of the app, in its
            blocked mode (the list, no buttons) for whoever cannot derogate. */}
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
            on THIS row only: the requirements warning above keeps scrolling
            with its own amber panel, because two stacked sticky bars are the
            defect review 15.2 F3 deferred to story 15.5. */}
        <div className="so-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn" onClick={handleClose}>
            {labels.cancel}
          </button>
          <button ref={submitButtonRef} type="submit" disabled={isSubmitting} className="btn primary">
            <Icon.check /> {labels.submit}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
