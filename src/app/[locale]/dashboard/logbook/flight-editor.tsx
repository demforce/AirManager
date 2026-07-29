'use client';

/**
 * "Nuova voce" / "Correggi volo" slide-over (story 12.8, AC 3/4 — D13) —
 * port of `docs/design-reference/airops/src/Forms.jsx#NewLogbookForm` onto
 * the REAL domain (`docs/design-reference/airops/src/LogbookView.jsx`'s
 * `kind` Scuola/Solo/IFR/ME/Noleggio has no counterpart here: the real
 * `FlightType` is TOURISM/SCHOOL/AERIAL_WORK + `isSolo`, no manual
 * durata/costo — both derived server-side) plus the legacy
 * `flights-manager.tsx#RegisterFlightForm`'s business logic (composed
 * takeoff/landing instants, live-computed duration, idempotency, error
 * mapping), which this story's page replaces. SAME form doubles as the
 * "Correggi volo" editor (story 5.3 precedent) — a non-null `target.mode ===
 * 'correct'` pre-fills every field from that flight plus a mandatory motivo,
 * and posts to `/correct` instead of `/`.
 *
 * Ratifica utente 1 (2026-07-15): the addebito breakdown/nuovo saldo stays
 * VISIBLE INSIDE this slide-over on success (never lost, unlike a fleeting
 * toast) — `lastResult` switches the body/footer to a read-only summary
 * view until the user explicitly closes.
 */
import { useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input, Select } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import { formatCents } from '@/lib/money';
import { flightTypeSchema, type FlightListItemDto, type FlightTypeDto, type RegisterFlightResponseDto } from '@/lib/schemas/flights';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

export type FlightEditorTarget = { mode: 'new' } | { mode: 'correct'; flight: FlightListItemDto };

type AircraftOption = { id: string; registration: string };
type PersonOption = { id: string; firstName: string; lastName: string };
/** The "person" (pilot/allievo) picker's own option shape (story 14.3, AC 2): `profiles` carries ACTIVE-profile flags only (mirrors `people.service.ts#PersonListItem`'s own) — just the two this form needs to decide whether a student-only person forces `flightType` to SCHOOL. The instructor picker keeps the plain `PersonOption` (no profile data needed there). */
type PilotStudentOption = PersonOption & { profiles: { pilot: boolean; student: boolean } };

export type FlightEditorLabels = {
  newTitle: string;
  newSubtitle: string;
  correctTitle: string;
  closeLabel: string;
  cancel: string;
  submit: string;
  correctSubmit: string;
  correctReason: string;
  requiredReason: string;
  conflictError: string;
  requiredField: string;
  invalidHourMeter: string;
  fields: {
    aircraft: string;
    noAircraftAvailable: string;
    person: string;
    noPersonAvailable: string;
    instructor: string;
    noInstructor: string;
    flightDate: string;
    flightType: string;
    soloMode: string;
    soloModes: { dual: string; solo: string };
    /** Story 14.3, AC 2 — shown as a neutral `Field` hint under Tipo volo once a person with only an active student profile is selected (the select is also forced/disabled to SCHOOL, see `isStudentOnly`). */
    studentOnlyHint: string;
    /** Review F1 (14.3) — shown ONLY while correcting a flight whose person is student-only TODAY but whose recorded type is NOT SCHOOL (ratifica R-14.3-a: never disabled, never rewritten). Contains a `{type}` placeholder for the flight's own recorded type label. */
    studentOnlyCorrectionHint: string;
    departure: string;
    arrival: string;
    takeoffTime: string;
    landingTime: string;
    computedDuration: string;
    takeoffs: string;
    landings: string;
    hourMeterStart: string;
    hourMeterEnd: string;
    notes: string;
  };
  flightTypes: { private: string; school: string; other: string };
  errors: {
    HOUR_METER_INVALID: string;
    FLIGHT_TIMES_INVALID: string;
    NO_AIRCRAFT_RATE: string;
    NO_INSTRUCTOR_RATE: string;
    SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR: string;
    SOLO_REQUIRES_SCHOOL: string;
    STUDENT_FLIGHT_MUST_BE_SCHOOL: string;
    AIRCRAFT_ARCHIVED: string;
    PERSON_ARCHIVED: string;
    PERSON_NOT_PILOT_OR_STUDENT: string;
    INSTRUCTOR_NOT_FOUND: string;
    INSTRUCTOR_SAME_AS_PILOT: string;
    FLIGHT_DATE_IN_FUTURE: string;
    generic: string;
  };
  result: {
    title: string;
    minutes: string;
    aircraftRate: string;
    aircraftAmount: string;
    instructorRate: string;
    instructorAmount: string;
    total: string;
    newBalance: string;
  };
  picker: { placeholder: string; noResults: string };
};

type FlightEditorProps = {
  target: FlightEditorTarget | null;
  onClose: () => void;
  /** Refreshes the server-rendered table/KPI (`router.refresh()`) — the slide-over stays open (ratifica 1). */
  onMutated: () => void;
  aircraftOptions: AircraftOption[];
  personOptions: PilotStudentOption[];
  instructorOptions: PersonOption[];
  airfieldName: string;
  moneyLocale: 'it' | 'en';
  labels: FlightEditorLabels;
};

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

/** Server-side aircraft search (active only — the form's own domain rule, story TD-3). */
async function searchAircraft(query: string): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50' });
  const response = await fetch(`/api/v1/aircraft?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; registration: string }[] };
  return body.items.map((aircraft) => ({ id: aircraft.id, label: aircraft.registration }));
}

/** Server-side people search, profile-scoped (story TD-3) — active only, same domain rule as the aircraft picker above. */
async function searchPeople(query: string, profile: 'pilot-or-student' | 'instructor'): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50', profile });
  const response = await fetch(`/api/v1/people?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; firstName: string; lastName: string }[] };
  return body.items.map((person) => ({ id: person.id, label: personLabel(person) }));
}

/** Composes `takeoffAt`/`landingAt` `Date`s from the date + two `type="time"` fields — same convention as the legacy `flights-manager.tsx#composeFlightTimes`. Landing at/before takeoff rolls to the FOLLOWING day (attraversamento mezzanotte). */
function composeFlightTimes(flightDate: string, takeoffTime: string, landingTime: string): { takeoffAt: Date; landingAt: Date } | null {
  if (flightDate.trim() === '' || takeoffTime.trim() === '' || landingTime.trim() === '') return null;
  const takeoffAt = new Date(`${flightDate}T${takeoffTime}`);
  if (Number.isNaN(takeoffAt.getTime())) return null;
  const landingAt = new Date(`${flightDate}T${landingTime}`);
  if (Number.isNaN(landingAt.getTime())) return null;
  if (landingAt.getTime() <= takeoffAt.getTime()) {
    landingAt.setDate(landingAt.getDate() + 1);
  }
  return { takeoffAt, landingAt };
}

/** The `YYYY-MM-DD` LOCAL (browser) calendar date an ISO instant falls on — correction prefill only. */
function localDateFromIso(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The `HH:MM` LOCAL (browser) time-of-day an ISO instant falls on — same rationale as {@link localDateFromIso}. */
function localTimeFromIso(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

const flightFormSchema = z.object({
  flightDate: z.string().trim().min(1),
  flightType: flightTypeSchema,
  departureAirfield: z.string().trim().min(1),
  arrivalAirfield: z.string().trim().min(1),
  takeoffTime: z.string().trim().min(1),
  landingTime: z.string().trim().min(1),
  hourMeterStart: z.string(),
  hourMeterEnd: z.string(),
  takeoffs: z.string(),
  landings: z.string(),
  notes: z.string(),
});

type FlightFormValues = z.infer<typeof flightFormSchema>;

function flightFormDefaults(target: FlightEditorTarget, airfieldName: string): FlightFormValues {
  if (target.mode === 'new') {
    return {
      flightDate: todayDateOnly(),
      flightType: 'TOURISM',
      departureAirfield: airfieldName,
      arrivalAirfield: airfieldName,
      takeoffTime: '',
      landingTime: '',
      hourMeterStart: '',
      hourMeterEnd: '',
      takeoffs: '1',
      landings: '1',
      notes: '',
    };
  }
  const flight = target.flight;
  return {
    flightDate: flight.takeoffAt ? localDateFromIso(flight.takeoffAt) : flight.flightDate,
    flightType: flight.flightType,
    departureAirfield: flight.departureAirfield ?? '',
    arrivalAirfield: flight.arrivalAirfield ?? '',
    takeoffTime: flight.takeoffAt ? localTimeFromIso(flight.takeoffAt) : '',
    landingTime: flight.landingAt ? localTimeFromIso(flight.landingAt) : '',
    hourMeterStart: flight.hourMeterStart !== null ? String(flight.hourMeterStart) : '',
    hourMeterEnd: flight.hourMeterEnd !== null ? String(flight.hourMeterEnd) : '',
    takeoffs: String(flight.takeoffs),
    landings: String(flight.landings),
    notes: flight.notes ?? '',
  };
}

function pickerDefaults(target: FlightEditorTarget, aircraftOptions: AircraftOption[]): { aircraftId: string; personId: string; instructorPersonId: string } {
  if (target.mode === 'new') {
    return { aircraftId: aircraftOptions[0]?.id ?? '', personId: '', instructorPersonId: '' };
  }
  const flight = target.flight;
  return { aircraftId: flight.aircraft.id, personId: flight.person.id, instructorPersonId: flight.instructor?.personId ?? '' };
}

export function FlightEditor({
  target,
  onClose,
  onMutated,
  aircraftOptions,
  personOptions,
  instructorOptions,
  airfieldName,
  moneyLocale,
  labels,
}: FlightEditorProps) {
  const isCorrecting = target?.mode === 'correct';
  const correctingFlight = target?.mode === 'correct' ? target.flight : null;
  const defaults = target ? flightFormDefaults(target, airfieldName) : flightFormDefaults({ mode: 'new' }, airfieldName);
  const initialPickers = target ? pickerDefaults(target, aircraftOptions) : pickerDefaults({ mode: 'new' }, aircraftOptions);

  // Story 14.3 (AC 2): `personId -> active-profile flags`, seeded from the
  // server-rendered `personOptions` page and grown by `searchPilotStudent`
  // below as the operator types — the ONLY way this form knows whether the
  // CURRENTLY selected person has only an active student profile (in which
  // case the service forces SCHOOL, `STUDENT_FLIGHT_MUST_BE_SCHOOL`) without
  // re-fetching on every keystroke. A person outside this map (e.g. a
  // "Correggi volo" prefill for someone past the options page cap, never
  // re-searched) simply isn't force-locked here — the service itself still
  // authoritatively rejects an invalid submission with a labeled error
  // banner, so this is a narrower proactive hint, never a dead end.
  const [personProfiles, setPersonProfiles] = useState<Map<string, PilotStudentOption['profiles']>>(
    () => new Map(personOptions.map((person) => [person.id, person.profiles])),
  );

  function isStudentOnly(id: string): boolean {
    const profiles = personProfiles.get(id);
    return Boolean(profiles?.student && !profiles?.pilot);
  }

  // Review F1 (14.3, CORRUZIONE DATI): the initial Tipo volo must NEVER be
  // silently rewritten from the flight's own recorded value — forcing it to
  // SCHOOL here based on the person's CURRENT active-profile flags used to
  // make "Correggi volo" on an old TOURISM/AERIAL_WORK flight, whose person
  // is student-only TODAY, open showing "Scuola" while the record says
  // otherwise; confirming even a notes-only correction then re-typed the
  // flight and re-charged it as SCHOOL (ratifica R-14.3-a: a historical
  // flight's type is never rewritten by the UI, only by an explicit operator
  // choice — see `isLocked`/`showStudentOnlyCorrectionWarning` below).
  // `defaults.flightType` is always the value ALREADY ON FILE in `correct`
  // mode, and the plain `'TOURISM'` default in `new` mode (where `personId`
  // starts empty, so no forcing ever applied here anyway).
  const initialFlightType: FlightTypeDto = defaults.flightType;

  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFlightType, setSelectedFlightType] = useState<FlightTypeDto>(initialFlightType);
  const [isSolo, setIsSolo] = useState(correctingFlight?.isSolo ?? false);
  const [flightDateValue, setFlightDateValue] = useState(defaults.flightDate);
  const [takeoffTimeValue, setTakeoffTimeValue] = useState(defaults.takeoffTime);
  const [landingTimeValue, setLandingTimeValue] = useState(defaults.landingTime);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [aircraftId, setAircraftId] = useState(initialPickers.aircraftId);
  const [personId, setPersonId] = useState(initialPickers.personId);
  const [instructorPersonId, setInstructorPersonId] = useState(initialPickers.instructorPersonId);
  // Story 14.2 (AC 1/2): the aircraft/person pickers are `SearchCombobox`,
  // not react-hook-form fields — their OWN "required" errors (each marked
  // independently, not a single combined banner) and cleared the instant a
  // selection is made.
  const [aircraftError, setAircraftError] = useState(false);
  const [personError, setPersonError] = useState(false);
  const [lastResult, setLastResult] = useState<RegisterFlightResponseDto | null>(null);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();
  const formRef = useRef<HTMLFormElement | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: { ...defaults, flightType: initialFlightType },
  });

  function handleAircraftChange(id: string): void {
    setAircraftId(id);
    if (id.trim() !== '') setAircraftError(false);
  }

  function handlePersonChange(id: string): void {
    setPersonId(id);
    if (id.trim() !== '') setPersonError(false);
  }

  const noAircraft = aircraftOptions.length === 0;
  const noPerson = personOptions.length === 0;
  // Story 14.3 (AC 2): re-derived every render off the CURRENT `personId`
  // (not a one-off flag set at selection time) so switching back to a
  // non-restricted person un-locks Tipo volo again.
  const personIsStudentOnly = isStudentOnly(personId);
  // Review F1/F2 (14.3): the lock is a NEW-registration-only concept —
  // correcting a historical flight NEVER disables the select (ratifica
  // R-14.3-a: the operator decides whether to change a historical flight's
  // type, never the UI; see `showStudentOnlyCorrectionWarning` below for
  // what correct mode shows instead). `isLocked` is the ONE value driving
  // BOTH the `disabled` prop AND `effectiveFlightType` right below it, so
  // the two can never disagree (review F2: before this fix the force lived
  // only in `handlePersonChange`, while `disabled` was re-derived every
  // render from a profile map that can grow via search WITHOUT a
  // re-selection — landing on `disabled=true` with the OLD, server-rejected
  // value still selected, an unrecoverable dead end short of re-picking the
  // person from the dropdown).
  const isLocked = !isCorrecting && personIsStudentOnly;

  // The value ACTUALLY in effect — `selectedFlightType` is only the
  // operator's own last choice; while `isLocked`, SCHOOL wins regardless
  // (covers BOTH the initial selection AND the delayed case where
  // `searchPilotStudent` fills in the CURRENTLY selected person's profile
  // flags later, typed but never re-selected). Fed BOTH into the Select's
  // own `value` (so the DOM can never show a stale, server-rejected type
  // while disabled — review F2) and into the submitted payload below, one
  // single derivation for both, per the review's own fix note.
  const effectiveFlightType: FlightTypeDto = isLocked ? 'SCHOOL' : selectedFlightType;

  // Review F1 (14.3): correcting a flight whose person is student-only TODAY
  // but whose recorded type is NOT SCHOOL — a real, if rare, state (ratifica
  // R-14.3-b: a license is for life, so losing every profile is unusual, but
  // a deactivated pilot profile is not impossible). The select stays
  // ENABLED (never a silent rewrite, R-14.3-a) — this only names the
  // situation so the operator decides with full information.
  const showStudentOnlyCorrectionWarning = isCorrecting && personIsStudentOnly && effectiveFlightType !== 'SCHOOL';

  function flightTypeLabel(type: FlightTypeDto): string {
    if (type === 'SCHOOL') return labels.flightTypes.school;
    if (type === 'AERIAL_WORK') return labels.flightTypes.other;
    return labels.flightTypes.private;
  }

  const aircraftComboOptions = useMemo<SearchComboboxOption[]>(() => {
    const base = aircraftOptions.map((aircraft) => ({ id: aircraft.id, label: aircraft.registration }));
    if (correctingFlight && !base.some((option) => option.id === correctingFlight.aircraft.id)) {
      base.unshift({ id: correctingFlight.aircraft.id, label: correctingFlight.aircraft.registration });
    }
    return base;
  }, [aircraftOptions, correctingFlight]);
  const personComboOptions = useMemo<SearchComboboxOption[]>(() => {
    const base = personOptions.map((person) => ({ id: person.id, label: personLabel(person) }));
    if (correctingFlight && !base.some((option) => option.id === correctingFlight.person.id)) {
      base.unshift({ id: correctingFlight.person.id, label: personLabel(correctingFlight.person) });
    }
    return base;
  }, [personOptions, correctingFlight]);
  const instructorComboOptions = useMemo<SearchComboboxOption[]>(() => {
    const base: SearchComboboxOption[] = [
      { id: '', label: labels.fields.noInstructor },
      ...instructorOptions.map((instructor) => ({ id: instructor.id, label: personLabel(instructor) })),
    ];
    if (correctingFlight?.instructor && !base.some((option) => option.id === correctingFlight.instructor!.personId)) {
      base.splice(1, 0, { id: correctingFlight.instructor.personId, label: personLabel(correctingFlight.instructor) });
    }
    return base;
  }, [instructorOptions, correctingFlight, labels.fields.noInstructor]);

  /**
   * Server-side search for the "person" (pilot/allievo) field ONLY (story
   * TD-3, extended 14.3 AC 2) — unlike the generic `searchPeople` above
   * (still used by the instructor field, which never needs profile data),
   * this ALSO records each result's active-profile flags into
   * `personProfiles`: the only way this form learns the profile of someone
   * found via search rather than already present in the server-rendered
   * `personOptions` page.
   */
  async function searchPilotStudent(query: string): Promise<SearchComboboxOption[]> {
    const params = new URLSearchParams({ q: query, pageSize: '50', profile: 'pilot-or-student' });
    const response = await fetch(`/api/v1/people?${params.toString()}`);
    if (!response.ok) return [];
    const body = (await response.json()) as { items: PilotStudentOption[] };
    setPersonProfiles((previous) => {
      const next = new Map(previous);
      for (const person of body.items) next.set(person.id, person.profiles);
      return next;
    });
    return body.items.map((person) => ({ id: person.id, label: personLabel(person) }));
  }

  /**
   * Review F2: the aircraft/person/reason checks used to live ONLY inside
   * `onValid` (RHF's valid-callback) — unreachable while any RHF-tracked
   * field (`flightDate` etc.) was ALSO empty, so a totally blank submit
   * left these three plain-state pickers mute. Extracted so BOTH
   * `handleSubmit`'s valid and invalid branches mark them (`onInvalid`
   * below) — RHF's own `shouldFocusError` already focuses its first
   * invalid tracked field in the invalid branch, so only the valid branch
   * needs the explicit `focusFirstInvalid` call.
   */
  function markPlainRequiredFields(): boolean {
    const nextAircraftError = aircraftId.trim() === '';
    const nextPersonError = personId.trim() === '';
    setAircraftError(nextAircraftError);
    setPersonError(nextPersonError);
    const nextReasonError = isCorrecting && reason.trim() === '';
    setReasonError(nextReasonError);
    return nextAircraftError || nextPersonError || nextReasonError;
  }

  function onInvalid(): void {
    markPlainRequiredFields();
  }

  async function onValid(values: FlightFormValues): Promise<void> {
    setFormError(null);

    if (markPlainRequiredFields()) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    const times = composeFlightTimes(values.flightDate, values.takeoffTime, values.landingTime);
    if (!times) {
      setFormError(labels.errors.FLIGHT_TIMES_INVALID);
      return;
    }

    const hourMeterStartRaw = values.hourMeterStart.trim();
    const hourMeterEndRaw = values.hourMeterEnd.trim();
    let hourMeterPayload: { hourMeterStart: number; hourMeterEnd: number } | Record<string, never> = {};
    if (hourMeterStartRaw !== '' || hourMeterEndRaw !== '') {
      const hourMeterStart = Number(hourMeterStartRaw);
      const hourMeterEnd = Number(hourMeterEndRaw);
      if (
        hourMeterStartRaw === '' ||
        hourMeterEndRaw === '' ||
        !Number.isInteger(hourMeterStart) ||
        !Number.isInteger(hourMeterEnd) ||
        hourMeterEnd <= hourMeterStart
      ) {
        setFormError(labels.invalidHourMeter);
        return;
      }
      hourMeterPayload = { hourMeterStart, hourMeterEnd };
    }

    const takeoffs = values.takeoffs.trim() === '' ? undefined : Number(values.takeoffs);
    const landings = values.landings.trim() === '' ? undefined : Number(values.landings);
    const notes = values.notes.trim() === '' ? undefined : values.notes.trim();
    const trimmedReason = reason.trim();

    let response: Response;
    try {
      response = await fetch(isCorrecting ? `/api/v1/flights/${correctingFlight!.id}/correct` : '/api/v1/flights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isCorrecting ? {} : { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
        },
        body: JSON.stringify({
          aircraftId,
          personId,
          instructorPersonId: instructorPersonId === '' ? undefined : instructorPersonId,
          departureAirfield: values.departureAirfield.trim(),
          arrivalAirfield: values.arrivalAirfield.trim(),
          takeoffAt: times.takeoffAt.toISOString(),
          landingAt: times.landingAt.toISOString(),
          // Review F2: the SUBMITTED type is `effectiveFlightType`, not the
          // raw form value — the one derivation that also drives the
          // Select's own `value`/`disabled` above, so the two can never
          // disagree.
          flightType: effectiveFlightType,
          isSolo,
          ...hourMeterPayload,
          takeoffs,
          landings,
          notes,
          ...(isCorrecting ? { reason: trimmedReason } : {}),
        }),
      });
    } catch {
      setFormError(labels.errors.generic);
      return;
    }
    if (!isCorrecting) regenerateIdempotencyKey();

    if (!response.ok) {
      if (isCorrecting && response.status === 409) {
        setFormError(labels.conflictError);
        return;
      }
      const { code, fieldErrors } = await parseApiError(response);
      if (response.status === 422 && fieldErrors.size > 0) {
        // Story 14.2, AC 3: a field-shaped 422 marks the matching Field
        // instead of only the bottom banner (`labels.requiredField` reused
        // per field) — unreachable in normal use today (the client schema
        // already mirrors the server's required checks) but kept for parity
        // with every other SlideOver editor's own mapping.
        const known: Array<keyof FlightFormValues> = ['flightDate', 'departureAirfield', 'arrivalAirfield', 'takeoffTime', 'landingTime'];
        let mapped = false;
        for (const field of known) {
          if (fieldErrors.has(field)) {
            setError(field, { type: 'server', message: labels.requiredField });
            mapped = true;
          }
        }
        if (mapped) {
          setTimeout(() => focusFirstInvalid(formRef.current), 0);
          return;
        }
      }
      const knownErrors: Record<string, string> = labels.errors;
      setFormError((code && knownErrors[code]) ?? labels.errors.generic);
      return;
    }

    const result = (await response.json()) as RegisterFlightResponseDto;
    setLastResult(result);
    onMutated();
  }

  const liveTimes = composeFlightTimes(flightDateValue, takeoffTimeValue, landingTimeValue);
  const computedMinutes = liveTimes ? Math.round((liveTimes.landingAt.getTime() - liveTimes.takeoffAt.getTime()) / 60_000) : null;

  const open = target !== null;
  const title = isCorrecting ? labels.correctTitle : labels.newTitle;
  const subtitle = isCorrecting && correctingFlight ? `${correctingFlight.aircraft.registration} · ${formatDateOnly(correctingFlight.flightDate, moneyLocale)}` : labels.newSubtitle;

  const footer =
    lastResult !== null ? (
      <>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn primary" onClick={onClose} data-testid="flight-result-close">
          {labels.closeLabel}
        </button>
      </>
    ) : (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-3)' }}>
          <span>{labels.fields.computedDuration}:</span>
          <span className="mono" data-testid="flight-computed-duration">
            {computedMinutes !== null ? formatMinutes(computedMinutes) : '—'}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>
          {labels.cancel}
        </button>
        <button type="submit" form="flight-editor-form" className="btn primary" disabled={isSubmitting || noAircraft || noPerson}>
          <Icon.check /> {isCorrecting ? labels.correctSubmit : labels.submit}
        </button>
      </>
    );

  return (
    <SlideOver open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel={labels.closeLabel} footer={footer}>
      {lastResult !== null ? (
        <div data-testid="flight-result-panel" style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-2)', padding: 14 }}>
          <div className="fld-label" style={{ marginBottom: 10 }}>
            {labels.result.title}
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 8, columnGap: 12, fontSize: 13 }}>
            <dt style={{ color: 'var(--ink-3)' }}>{labels.result.minutes}</dt>
            <dd className="mono num">{formatMinutes(lastResult.flight.minutes)}</dd>
            <dt style={{ color: 'var(--ink-3)' }}>{labels.result.aircraftRate}</dt>
            <dd className="mono num">{formatCents(lastResult.flight.breakdown.aircraftRateCentsPerHour, moneyLocale)}/h</dd>
            <dt style={{ color: 'var(--ink-3)' }}>{labels.result.aircraftAmount}</dt>
            <dd className="mono num">{formatCents(lastResult.flight.breakdown.aircraftAmountCents, moneyLocale)}</dd>
            {lastResult.flight.breakdown.instructorAmountCents !== undefined && lastResult.flight.breakdown.instructorRateCentsPerHour !== undefined ? (
              <>
                <dt style={{ color: 'var(--ink-3)' }}>{labels.result.instructorRate}</dt>
                <dd className="mono num">{formatCents(lastResult.flight.breakdown.instructorRateCentsPerHour, moneyLocale)}/h</dd>
                <dt style={{ color: 'var(--ink-3)' }}>{labels.result.instructorAmount}</dt>
                <dd className="mono num">{formatCents(lastResult.flight.breakdown.instructorAmountCents, moneyLocale)}</dd>
              </>
            ) : null}
            <dt style={{ fontWeight: 600, color: 'var(--ink)' }}>{labels.result.total}</dt>
            <dd className="mono num" style={{ fontWeight: 600 }} data-testid="flight-result-total">
              {formatCents(lastResult.flight.breakdown.totalAmountCents, moneyLocale)}
            </dd>
            <dt style={{ fontWeight: 600, color: 'var(--ink)' }}>{labels.result.newBalance}</dt>
            <dd className="mono num" style={{ fontWeight: 600 }} data-testid="flight-result-new-balance">
              {formatCents(lastResult.account.balanceCents, moneyLocale)}
            </dd>
          </dl>
        </div>
      ) : (
        <form id="flight-editor-form" ref={formRef} data-testid="flight-form" onSubmit={(event) => void handleSubmit(onValid, onInvalid)(event)} noValidate>
          <div className="form-grid">
            <Field label={labels.fields.flightDate} error={errors.flightDate ? labels.requiredField : undefined}>
              <DateInput
                aria-invalid={Boolean(errors.flightDate)}
                {...register('flightDate', { onChange: (event: { target: { value: string } }) => setFlightDateValue(event.target.value) })}
              />
            </Field>
            {/* `SearchCombobox` renders its OWN `<label>` (story TD-3) — a
                wrapping `Field` would double it up (its `.fld-label` PLUS the
                combobox's own), so these three use a bare `.fld`/`.fld.wide`
                wrapper (same grid-cell/spacing rules, no second label). */}
            <div className="fld">
              <SearchCombobox
                id="flight-aircraft"
                label={labels.fields.aircraft}
                value={aircraftId}
                onChange={handleAircraftChange}
                fetchOptions={searchAircraft}
                initialOptions={aircraftComboOptions}
                placeholder={labels.picker.placeholder}
                emptyText={labels.picker.noResults}
                disabled={noAircraft}
                error={aircraftError ? labels.requiredField : undefined}
              />
            </div>
            <div className="fld wide">
              <SearchCombobox
                id="flight-person"
                label={labels.fields.person}
                value={personId}
                onChange={handlePersonChange}
                fetchOptions={searchPilotStudent}
                initialOptions={personComboOptions}
                placeholder={labels.picker.placeholder}
                emptyText={labels.picker.noResults}
                disabled={noPerson}
                error={personError ? labels.requiredField : undefined}
              />
            </div>
            <div className="fld">
              <SearchCombobox
                id="flight-instructor"
                label={labels.fields.instructor}
                value={instructorPersonId}
                onChange={setInstructorPersonId}
                fetchOptions={(q) => searchPeople(q, 'instructor')}
                initialOptions={instructorComboOptions}
                placeholder={labels.picker.placeholder}
                emptyText={labels.picker.noResults}
              />
            </div>
            <Field
              label={labels.fields.flightType}
              hint={
                isLocked
                  ? labels.fields.studentOnlyHint
                  : showStudentOnlyCorrectionWarning
                    ? labels.fields.studentOnlyCorrectionHint.replace('{type}', flightTypeLabel(correctingFlight!.flightType))
                    : undefined
              }
            >
              <Select
                disabled={isLocked}
                data-testid="flight-type-select"
                // Review F2: `value` is CONTROLLED by `effectiveFlightType`
                // (never the raw `selectedFlightType`) — the DOM can never
                // show/submit a type the lock disagrees with, by React's own
                // reconciliation, not an imperative sync call.
                value={effectiveFlightType}
                {...register('flightType', {
                  onChange: (event: { target: { value: string } }) => {
                    const next = event.target.value as FlightTypeDto;
                    setSelectedFlightType(next);
                    if (next !== 'SCHOOL') setIsSolo(false);
                  },
                })}
              >
                <option value="TOURISM">{labels.flightTypes.private}</option>
                <option value="SCHOOL">{labels.flightTypes.school}</option>
                <option value="AERIAL_WORK">{labels.flightTypes.other}</option>
              </Select>
            </Field>
            <Field label={labels.fields.departure} error={errors.departureAirfield ? labels.requiredField : undefined}>
              <Input aria-invalid={Boolean(errors.departureAirfield)} {...register('departureAirfield')} />
            </Field>
            <Field label={labels.fields.arrival} error={errors.arrivalAirfield ? labels.requiredField : undefined}>
              <Input aria-invalid={Boolean(errors.arrivalAirfield)} {...register('arrivalAirfield')} />
            </Field>
            <Field label={labels.fields.takeoffTime} error={errors.takeoffTime ? labels.requiredField : undefined}>
              <Input
                type="time"
                aria-invalid={Boolean(errors.takeoffTime)}
                {...register('takeoffTime', { onChange: (event: { target: { value: string } }) => setTakeoffTimeValue(event.target.value) })}
              />
            </Field>
            <Field label={labels.fields.landingTime} error={errors.landingTime ? labels.requiredField : undefined}>
              <Input
                type="time"
                aria-invalid={Boolean(errors.landingTime)}
                {...register('landingTime', { onChange: (event: { target: { value: string } }) => setLandingTimeValue(event.target.value) })}
              />
            </Field>
            <Field label={labels.fields.takeoffs}>
              <Input type="number" min={0} step={1} inputMode="numeric" {...register('takeoffs')} />
            </Field>
            <Field label={labels.fields.landings}>
              <Input type="number" min={0} step={1} inputMode="numeric" {...register('landings')} />
            </Field>
            <Field label={labels.fields.hourMeterStart}>
              <Input type="number" min={0} step={1} inputMode="numeric" {...register('hourMeterStart')} />
            </Field>
            <Field label={labels.fields.hourMeterEnd}>
              <Input type="number" min={0} step={1} inputMode="numeric" {...register('hourMeterEnd')} />
            </Field>
            <Field label={labels.fields.notes} wide>
              <Input {...register('notes')} />
            </Field>
            {isCorrecting ? (
              <Field label={labels.correctReason} wide error={reasonError ? labels.requiredReason : undefined}>
                <Input
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (reasonError && event.target.value.trim() !== '') setReasonError(false);
                  }}
                  aria-invalid={reasonError}
                  maxLength={500}
                />
              </Field>
            ) : null}
          </div>

          {effectiveFlightType === 'SCHOOL' ? (
            <fieldset style={{ marginTop: 14 }}>
              <legend className="fld-label">{labels.fields.soloMode}</legend>
              <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                  <input type="radio" name="flight-solo-mode" checked={!isSolo} onChange={() => setIsSolo(false)} />
                  {labels.fields.soloModes.dual}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                  <input type="radio" name="flight-solo-mode" checked={isSolo} onChange={() => setIsSolo(true)} />
                  {labels.fields.soloModes.solo}
                </label>
              </div>
            </fieldset>
          ) : null}

          {noAircraft ? <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 10 }}>{labels.fields.noAircraftAvailable}</p> : null}
          {noPerson ? <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 4 }}>{labels.fields.noPersonAvailable}</p> : null}
          {formError ? (
            <p role="alert" data-testid="flight-form-error" style={{ color: 'var(--bad)', fontSize: 13, marginTop: 14 }}>
              {formError}
            </p>
          ) : null}
        </form>
      )}
    </SlideOver>
  );
}
