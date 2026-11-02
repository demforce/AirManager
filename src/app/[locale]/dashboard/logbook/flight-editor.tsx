'use client';

/**
 * "Nuova voce" / "Correggi volo" slide-over (story 12.8, AC 3/4 — D13) —
 * port of `docs/design-reference/airops/src/Forms.jsx#NewLogbookForm` onto
 * the REAL domain (`docs/design-reference/airops/src/LogbookView.jsx`'s
 * `kind` Scuola/Solo/IFR/ME/Noleggio has no counterpart here: the real
 * `FlightType` is TOURISM/SCHOOL + `isSolo`, no manual
 * durata/costo — both derived server-side) plus the legacy
 * `flights-manager.tsx#RegisterFlightForm`'s business logic (composed
 * takeoff/landing instants, live-computed duration, idempotency, error
 * mapping), which this story's page replaces. SAME form doubles as the
 * "Modifica" editor — a non-null `target.mode === 'correct'` pre-fills every
 * field from that flight (the «Senza addebito» switch included) and sends the
 * full body with `PUT /api/v1/flights/{id}`: the flight and its charge are
 * updated in place, no motivo asked (story 19.6, R-19-c).
 *
 * Requirements (story 19.9, R-19-h): a 422 `REQUIREMENTS_NOT_MET` opens the
 * shared `RequirementsWarning` under the form — every failure listed, and
 * «Procedi comunque» resends the very body just refused plus `force: true`,
 * same endpoint and method. Any change to the form afterwards closes it: the
 * deroga only ever covers what was on screen.
 *
 * Ratifica utente 1 (2026-07-15): the addebito breakdown/nuovo saldo stays
 * VISIBLE INSIDE this slide-over on success (never lost, unlike a fleeting
 * toast) — `lastResult` switches the body/footer to a read-only summary
 * view until the user explicitly closes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { RequirementsWarning } from '@/components/dashboard/requirements-warning';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { DateInput } from '@/components/ui/date-input';
import { Icon } from '@/components/ui/icons';
import { SlideOver } from '@/components/ui/slide-over';
import { Toggle } from '@/components/ui/toggle';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { parseApiError } from '@/lib/api-field-errors';
import { focusFirstInvalid } from '@/lib/dom-focus';
import { formatCents } from '@/lib/money';
import type { FlightListItemDto, FlightTypeDto, RegisterFlightResponseDto } from '@/lib/schemas/flights';
import type { RequirementFailure } from '@/lib/schemas/requirements';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

export type FlightEditorTarget = { mode: 'new' } | { mode: 'correct'; flight: FlightListItemDto };

/** Story AOG-1a, AC 12 (ratifica R-AOG-d): `status`/`statusReason` travel with the option so the picker NAMES a grounded aircraft exactly like the booking form's own `<select>` does — the option stays SELECTABLE (the admin deroga exists, and a historical flight on that airframe must stay correctable). The return date deliberately does NOT come here (R-AOG-e confines it to the editor and the requirements warning). */
export type AircraftOption = { id: string; registration: string; status: 'OPERATIONAL' | 'OUT_OF_SERVICE'; statusReason: string | null };
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
  /** A 409 on an edit: the flight's charge was adjusted by hand (story 19.6, D-8). */
  conflictError: string;
  /** Story 19.6 — a 404 on an edit: the flight was deleted in the meantime. */
  notFoundError: string;
  /** Review 19.6 F3 — a 409 `FLIGHT_MODIFIED_CONCURRENTLY` on an edit: another edit of the same flight was saved first. */
  concurrentEditError: string;
  requiredField: string;
  /** Story 16.2 (AC 18) — the `<form>` is `noValidate`, so `min={1}` on the two cycle inputs is a hint, not a gate: this is the message a typed `0` gets, in the same bottom banner as `errors.FLIGHT_TIMES_INVALID`. */
  invalidCycles: string;
  fields: {
    aircraft: string;
    noAircraftAvailable: string;
    person: string;
    noPersonAvailable: string;
    instructor: string;
    noInstructor: string;
    flightDate: string;
    flightType: string;
    /** Story 19.5 (D-1) — the `Toggle`'s label «Volo solista» (on = solo); `soloModes` are its two visible state texts. */
    soloMode: string;
    soloModes: { dual: string; solo: string };
    /** Story 19.6 (R-19-d) — the «Senza addebito» `Toggle`'s label, its two state texts and its hint. */
    noCharge: string;
    noChargeModes: { charged: string; noCharge: string };
    noChargeHint: string;
    /** Story 14.3, AC 2 — shown as a neutral hint under Tipo volo once a person with only an active student profile is selected (the combobox is also forced/disabled to SCHOOL, see `isStudentOnly`). */
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
  };
  flightTypes: { private: string; school: string };
  errors: {
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
    /** Story 16.2 (P1, AC 18) — `t.raw` template, `{date}`/`{from}`/`{to}` filled client-side from `details.takeoffAt`/`details.landingAt`: the 409 must NAME the conflicting flight's day and clock window, because cancelling or correcting THAT flight is the only way out of a guard `force` deliberately does not derogate. */
    FLIGHT_OVERLAP: string;
    generic: string;
  };
  result: {
    title: string;
    /** Story 19.6 — the summary title after an edit: the charge was updated, not generated. */
    updatedTitle: string;
    /** Story 19.6 — next to the total of a no-charge flight. */
    noCharge: string;
    minutes: string;
    aircraftRate: string;
    aircraftAmount: string;
    instructorRate: string;
    instructorAmount: string;
    total: string;
    newBalance: string;
    /** Story 14.4, AC 3 — shown next to "Nuovo saldo" when `balanceAlert` is `true`: the balance is negative before or after this flight (it IS registered). */
    balanceAlert: string;
  };
  /** Story AOG-1a, AC 12 — `t.raw` template with a `{reason}` placeholder, the SAME `BookingsPage.form.outOfServiceSuffix` string the booking form uses: one language for one fact across the two forms. */
  outOfServiceSuffix: string;
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
  /** Story 19.9 — whether the requirements warning offers «Procedi comunque» (`requirements.force`); the real gate is server-side (AD-5). Always `true` today: only an admin registers flights. */
  canForce: boolean;
  labels: FlightEditorLabels;
};

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

/** Story AOG-1a, AC 12 — one option label for both the server-rendered list and the server search, so a grounded aircraft reads the same either way (and the same way the booking form reads it). */
function aircraftOptionLabel(aircraft: AircraftOption, outOfServiceSuffix: string): string {
  if (aircraft.status !== 'OUT_OF_SERVICE') return aircraft.registration;
  return `${aircraft.registration} — ${outOfServiceSuffix.replace('{reason}', aircraft.statusReason ?? '')}`;
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
  departureAirfield: z.string().trim().min(1),
  arrivalAirfield: z.string().trim().min(1),
  takeoffTime: z.string().trim().min(1),
  landingTime: z.string().trim().min(1),
  takeoffs: z.string(),
  landings: z.string(),
});

type FlightFormValues = z.infer<typeof flightFormSchema>;

function flightFormDefaults(target: FlightEditorTarget, airfieldName: string): FlightFormValues {
  if (target.mode === 'new') {
    return {
      flightDate: todayDateOnly(),
      departureAirfield: airfieldName,
      arrivalAirfield: airfieldName,
      takeoffTime: '',
      landingTime: '',
      takeoffs: '1',
      landings: '1',
    };
  }
  const flight = target.flight;
  return {
    flightDate: flight.takeoffAt ? localDateFromIso(flight.takeoffAt) : flight.flightDate,
    departureAirfield: flight.departureAirfield ?? '',
    arrivalAirfield: flight.arrivalAirfield ?? '',
    takeoffTime: flight.takeoffAt ? localTimeFromIso(flight.takeoffAt) : '',
    landingTime: flight.landingAt ? localTimeFromIso(flight.landingAt) : '',
    takeoffs: String(flight.takeoffs),
    landings: String(flight.landings),
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
  canForce,
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
  // make "Correggi volo" on an old TOURISM flight, whose person
  // is student-only TODAY, open showing "Scuola" while the record says
  // otherwise; confirming even a cycles-only correction then re-typed the
  // flight and re-charged it as SCHOOL (ratifica R-14.3-a: a historical
  // flight's type is never rewritten by the UI, only by an explicit operator
  // choice — see `isLocked`/`showStudentOnlyCorrectionWarning` below).
  // `correctingFlight.flightType` is always the value ALREADY ON FILE in
  // `correct` mode, and the plain `'TOURISM'` default in `new` mode (where
  // `personId` starts empty, so no forcing ever applied here anyway). Plain
  // state, not a react-hook-form field (story 19.5, AD-6): like the three
  // pickers, Tipo volo is a `SearchCombobox`, and RHF never sent it anyway
  // (the body reads `effectiveFlightType`).
  const initialFlightType: FlightTypeDto = correctingFlight?.flightType ?? 'TOURISM';

  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFlightType, setSelectedFlightType] = useState<FlightTypeDto>(initialFlightType);
  const [isSolo, setIsSolo] = useState(correctingFlight?.isSolo ?? false);
  const [noCharge, setNoCharge] = useState(correctingFlight?.noCharge ?? false);
  const [flightDateValue, setFlightDateValue] = useState(defaults.flightDate);
  const [takeoffTimeValue, setTakeoffTimeValue] = useState(defaults.takeoffTime);
  const [landingTimeValue, setLandingTimeValue] = useState(defaults.landingTime);
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

  // --- Requirements warning (story 19.9, AD-6) ------------------------------
  // `requirements` is non-null ONLY right after a 422 `REQUIREMENTS_NOT_MET`:
  // its `failures` are what the warning lists, its `body` the EXACT request
  // just refused, resent unchanged plus `force: true` — the operator never
  // re-fills the form, and never derogates a body other than the one listed.
  const [requirements, setRequirements] = useState<{ failures: RequirementFailure[]; body: Record<string, unknown> } | null>(null);
  const [proceedSubmitting, setProceedSubmitting] = useState(false);
  const [proceedError, setProceedError] = useState(false);

  /** Closes the warning and forgets its body — «Annulla», a new submit, and ANY change to the form (the stale-body guard, D-12). */
  function dismissRequirements(): void {
    setRequirements(null);
    setProceedError(false);
  }

  /**
   * Story 16.2 (AC 18): the `FLIGHT_OVERLAP` sentence — names the conflicting
   * flight's day and clock window instead of a wall, since cancelling or
   * correcting THAT flight is the one way out of a guard `force` does not
   * derogate. Rendered in the BROWSER's local time, the same convention
   * `localTimeFromIso` already uses to prefill a correction: the operator
   * reads back the very times this form would have shown for that flight.
   * Shared by the primary submit and «Procedi comunque».
   */
  function overlapMessage(details: { takeoffAt?: string; landingAt?: string } | undefined): string {
    const takeoffAt = details?.takeoffAt;
    const landingAt = details?.landingAt;
    if (takeoffAt === undefined || landingAt === undefined) return labels.errors.generic;
    return labels.errors.FLIGHT_OVERLAP.replace('{date}', formatDateOnly(localDateFromIso(takeoffAt), moneyLocale))
      .replace('{from}', localTimeFromIso(takeoffAt))
      .replace('{to}', localTimeFromIso(landingAt));
  }

  const {
    register,
    handleSubmit,
    setError,
    subscribe,
    formState: { errors, isSubmitting },
  } = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: defaults,
  });

  // The stale-body guard for the RHF fields (D-12): a value subscription, not
  // a re-render per keystroke (and not `watch()`, which the React Compiler
  // cannot memoize). The plain-state fields close it in their own change
  // handlers below.
  useEffect(() => subscribe({ formState: { values: true }, callback: () => dismissRequirements() }), [subscribe]);

  function handleAircraftChange(id: string): void {
    if (id !== aircraftId) dismissRequirements();
    setAircraftId(id);
    if (id.trim() !== '') setAircraftError(false);
  }

  function handlePersonChange(id: string): void {
    if (id !== personId) dismissRequirements();
    setPersonId(id);
    if (id.trim() !== '') setPersonError(false);
  }

  function handleInstructorChange(id: string): void {
    if (id !== instructorPersonId) dismissRequirements();
    setInstructorPersonId(id);
  }

  function handleFlightTypeChange(id: string): void {
    if (id !== selectedFlightType) dismissRequirements();
    setSelectedFlightType(id as FlightTypeDto);
  }

  function handleSoloChange(next: boolean): void {
    dismissRequirements();
    setIsSolo(next);
  }

  function handleNoChargeChange(next: boolean): void {
    dismissRequirements();
    setNoCharge(next);
  }

  const noAircraft = aircraftOptions.length === 0;
  const noPerson = personOptions.length === 0;
  // Story 14.3 (AC 2): re-derived every render off the CURRENT `personId`
  // (not a one-off flag set at selection time) so switching back to a
  // non-restricted person un-locks Tipo volo again.
  const personIsStudentOnly = isStudentOnly(personId);
  // Review F1/F2 (14.3): the lock is a NEW-registration-only concept —
  // correcting a historical flight NEVER disables Tipo volo (ratifica
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
  // flags later, typed but never re-selected). Fed BOTH into the combobox's
  // own `value` (so the DOM can never show a stale, server-rejected type
  // while disabled — review F2) and into the submitted payload below, one
  // single derivation for both, per the review's own fix note.
  const effectiveFlightType: FlightTypeDto = isLocked ? 'SCHOOL' : selectedFlightType;

  // Review F2 (19.5, AC 14): `isSolo` exists only on SCHOOL, so it is cleared
  // whenever the type IN EFFECT leaves SCHOOL — whatever moved it: the
  // combobox, or the student lock releasing on a change of person, which
  // never passes through the combobox's `onChange`. Adjusted during render
  // (the same React pattern as `SearchCombobox`'s own reconciliation): a
  // hidden switch can never submit `isSolo: true` on a TOURISM flight (422
  // `SOLO_REQUIRES_SCHOOL`) nor come back on with SCHOOL.
  const [soloResetType, setSoloResetType] = useState<FlightTypeDto>(effectiveFlightType);
  if (effectiveFlightType !== soloResetType) {
    setSoloResetType(effectiveFlightType);
    if (effectiveFlightType !== 'SCHOOL') setIsSolo(false);
  }

  // Review F1 (14.3): correcting a flight whose person is student-only TODAY
  // but whose recorded type is NOT SCHOOL — a real, if rare, state (ratifica
  // R-14.3-b: a license is for life, so losing every profile is unusual, but
  // a deactivated pilot profile is not impossible). Tipo volo stays
  // ENABLED (never a silent rewrite, R-14.3-a) — this only names the
  // situation so the operator decides with full information.
  const showStudentOnlyCorrectionWarning = isCorrecting && personIsStudentOnly && effectiveFlightType !== 'SCHOOL';

  function flightTypeLabel(type: FlightTypeDto): string {
    return type === 'SCHOOL' ? labels.flightTypes.school : labels.flightTypes.private;
  }

  // Story 19.5 (AD-6, D-3): Tipo volo is the same `SearchCombobox` as the
  // three pickers, in static mode — two fixed options, no `fetchOptions`.
  const flightTypeComboOptions = useMemo<SearchComboboxOption[]>(
    () => [
      { id: 'TOURISM', label: labels.flightTypes.private },
      { id: 'SCHOOL', label: labels.flightTypes.school },
    ],
    [labels.flightTypes.private, labels.flightTypes.school],
  );

  const aircraftComboOptions = useMemo<SearchComboboxOption[]>(() => {
    const base = aircraftOptions.map((aircraft) => ({ id: aircraft.id, label: aircraftOptionLabel(aircraft, labels.outOfServiceSuffix) }));
    if (correctingFlight && !base.some((option) => option.id === correctingFlight.aircraft.id)) {
      base.unshift({ id: correctingFlight.aircraft.id, label: correctingFlight.aircraft.registration });
    }
    return base;
  }, [aircraftOptions, correctingFlight, labels.outOfServiceSuffix]);

  /** Server-side aircraft search (active only — the form's own domain rule, story TD-3), labelled exactly like the server-rendered options above (AC 12). */
  async function searchAircraft(query: string): Promise<SearchComboboxOption[]> {
    const params = new URLSearchParams({ q: query, pageSize: '50' });
    const response = await fetch(`/api/v1/aircraft?${params.toString()}`);
    if (!response.ok) return [];
    const body = (await response.json()) as { items: AircraftOption[] };
    return body.items.map((aircraft) => ({ id: aircraft.id, label: aircraftOptionLabel(aircraft, labels.outOfServiceSuffix) }));
  }
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
   * Review F2: the aircraft/person checks used to live ONLY inside
   * `onValid` (RHF's valid-callback) — unreachable while any RHF-tracked
   * field (`flightDate` etc.) was ALSO empty, so a totally blank submit
   * left these plain-state pickers mute. Extracted so BOTH
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
    return nextAircraftError || nextPersonError;
  }

  function onInvalid(): void {
    markPlainRequiredFields();
  }

  async function onValid(values: FlightFormValues): Promise<void> {
    setFormError(null);
    dismissRequirements();

    if (markPlainRequiredFields()) {
      setTimeout(() => focusFirstInvalid(formRef.current), 0);
      return;
    }

    const times = composeFlightTimes(values.flightDate, values.takeoffTime, values.landingTime);
    if (!times) {
      setFormError(labels.errors.FLIGHT_TIMES_INVALID);
      return;
    }

    const takeoffs = values.takeoffs.trim() === '' ? undefined : Number(values.takeoffs);
    const landings = values.landings.trim() === '' ? undefined : Number(values.landings);
    // Story 16.2 (F14, AC 18): the server bound is now `[1, 500]` — the
    // minimum the Prisma schema always DECLARED. The form is `noValidate`, so
    // `min={1}` on the two inputs never blocks a submit: without this check a
    // typed `0` would come back as a field-shaped `VALIDATION_ERROR` on a
    // path the mapping below does not know (`takeoffs`/`landings` are not in
    // its `known` list) and the operator would read "Riprova". Same mechanic
    // and same bottom banner as `FLIGHT_TIMES_INVALID` above.
    if ((takeoffs !== undefined && takeoffs < 1) || (landings !== undefined && landings < 1)) {
      setFormError(labels.invalidCycles);
      return;
    }

    const body = {
      aircraftId,
      personId,
      instructorPersonId: instructorPersonId === '' ? undefined : instructorPersonId,
      departureAirfield: values.departureAirfield.trim(),
      arrivalAirfield: values.arrivalAirfield.trim(),
      takeoffAt: times.takeoffAt.toISOString(),
      landingAt: times.landingAt.toISOString(),
      // Review F2: the SUBMITTED type is `effectiveFlightType`, not the raw
      // form value — the one derivation that also drives the combobox's own
      // `value`/`disabled` above, so the two can never disagree.
      flightType: effectiveFlightType,
      isSolo,
      // Always sent, `false` included: an edit is a full replacement (`PUT`),
      // and an omitted flag would turn it off in silence (story 19.6).
      noCharge,
      takeoffs,
      landings,
    };

    let response: Response;
    try {
      response = await fetch(isCorrecting ? `/api/v1/flights/${correctingFlight!.id}` : '/api/v1/flights', {
        method: isCorrecting ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isCorrecting ? {} : { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
        },
        body: JSON.stringify(body),
      });
    } catch {
      setFormError(labels.errors.generic);
      return;
    }
    if (!isCorrecting) regenerateIdempotencyKey();

    if (!response.ok) {
      // `response.clone()`: `parseApiError` below consumes the body via its
      // own `.json()` — cloned so the REQUIREMENTS_NOT_MET branch can read
      // `error.details.failures` (not part of `parseApiError`'s own, narrower
      // return shape) from the SAME response.
      // Story 16.2: read BEFORE the `isCorrecting && 409` branch below, so a
      // `FLIGHT_OVERLAP` during an edit is never answered with the
      // manual-adjustment sentence that branch carries.
      const blockedBody = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        error?: {
          /** Story 16.2 — the stable domain code, needed here (not only from `parseApiError` below) to tell one 409 from another. */
          code?: string;
          details?: {
            /** Story 19.9 — `REQUIREMENTS_NOT_MET`'s list (`schemas/requirements.ts`). */
            failures?: RequirementFailure[];
            /** Story 16.2 — `FLIGHT_OVERLAP`'s own details: the conflicting flight's id and its two instants as ISO 8601 UTC strings (`flights.service.ts#assertNoOverlappingFlight`). */
            flightId?: string;
            takeoffAt?: string;
            landingAt?: string;
          };
        };
      } | null;
      if (response.status === 409 && blockedBody?.error?.code === 'FLIGHT_OVERLAP') {
        setFormError(overlapMessage(blockedBody.error.details));
        return;
      }
      if (isCorrecting && response.status === 404) {
        setFormError(labels.notFoundError);
        return;
      }
      if (isCorrecting && response.status === 409 && blockedBody?.error?.code === 'FLIGHT_MODIFIED_CONCURRENTLY') {
        setFormError(labels.concurrentEditError);
        return;
      }
      if (isCorrecting && response.status === 409) {
        setFormError(labels.conflictError);
        return;
      }
      // Story 19.9: the list goes in the warning only — never also in the
      // banner, or a screen reader would read it twice (`formError` stays null).
      if (response.status === 422 && blockedBody?.error?.code === 'REQUIREMENTS_NOT_MET') {
        setRequirements({ failures: blockedBody.error.details?.failures ?? [], body });
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

  /**
   * «Procedi comunque» (story 19.9, AD-6) — the refused body unchanged plus
   * `force: true`, same endpoint and method as the submit (`noCharge` is
   * already in it: an edit is a full replacement). A `FLIGHT_OVERLAP` 409
   * (every requirement precedes it, and `force` never derogates it) closes the
   * warning and names the flight in the banner, as on the submit; a 404 on an
   * edit is the flight deleted meanwhile. Anything else keeps the warning open
   * with its retry message.
   */
  async function onProceed(): Promise<void> {
    if (!requirements) return;
    setProceedSubmitting(true);
    setProceedError(false);

    let response: Response;
    try {
      response = await fetch(isCorrecting ? `/api/v1/flights/${correctingFlight!.id}` : '/api/v1/flights', {
        method: isCorrecting ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isCorrecting ? {} : { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
        },
        body: JSON.stringify({ ...requirements.body, force: true }),
      });
    } catch {
      setProceedSubmitting(false);
      setProceedError(true);
      return;
    }
    setProceedSubmitting(false);
    if (!isCorrecting) regenerateIdempotencyKey();

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { code?: string; details?: { takeoffAt?: string; landingAt?: string } };
      } | null;
      if (response.status === 409 && errorBody?.error?.code === 'FLIGHT_OVERLAP') {
        dismissRequirements();
        setFormError(overlapMessage(errorBody.error.details));
        return;
      }
      if (isCorrecting && response.status === 404) {
        dismissRequirements();
        setFormError(labels.notFoundError);
        return;
      }
      setProceedError(true);
      return;
    }

    const result = (await response.json()) as RegisterFlightResponseDto;
    dismissRequirements();
    setFormError(null);
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
            {isCorrecting ? labels.result.updatedTitle : labels.result.title}
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
            <dd className="mono num" style={{ fontWeight: 600 }}>
              {/* Story 19.6 (D-10): a bare "0,00 €" would read as an error. */}
              {lastResult.flight.noCharge ? (
                <span data-testid="flight-result-no-charge" style={{ marginRight: 8 }}>
                  <Badge>{labels.result.noCharge}</Badge>
                </span>
              ) : null}
              <span data-testid="flight-result-total">{formatCents(lastResult.flight.breakdown.totalAmountCents, moneyLocale)}</span>
            </dd>
            <dt style={{ fontWeight: 600, color: 'var(--ink)' }}>{labels.result.newBalance}</dt>
            <dd className="mono num" style={{ fontWeight: 600 }} data-testid="flight-result-new-balance">
              {formatCents(lastResult.account.balanceCents, moneyLocale)}
            </dd>
          </dl>
          {/* Story 14.4, AC 3 (decision D1) — non-blocking: the flight above IS
              registered, this only flags the resulting balance to the
              OPERATOR (the pilot-facing email is unchanged and separate). */}
          {lastResult.balanceAlert ? (
            <div
              role="status"
              data-testid="flight-balance-alert"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--warn-soft)',
                border: '1px solid color-mix(in oklch, var(--warn) 40%, transparent)',
                fontSize: 12.5,
                color: 'var(--accent-ink)',
              }}
            >
              {labels.result.balanceAlert}
            </div>
          ) : null}
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
                combobox's own), so these four use a bare `.fld`/`.fld.wide`
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
                onChange={handleInstructorChange}
                fetchOptions={(q) => searchPeople(q, 'instructor')}
                initialOptions={instructorComboOptions}
                placeholder={labels.picker.placeholder}
                emptyText={labels.picker.noResults}
              />
            </div>
            <div className="fld">
              {/* The id (= testid) still says "select" although the control is
                  a combobox since story 19.5: desktop testids never change. */}
              <SearchCombobox
                id="flight-type-select"
                label={labels.fields.flightType}
                // Review F2: `value` is CONTROLLED by `effectiveFlightType`
                // (never the raw `selectedFlightType`) — the DOM can never
                // show/submit a type the lock disagrees with, by React's own
                // reconciliation, not an imperative sync call.
                value={effectiveFlightType}
                onChange={handleFlightTypeChange}
                initialOptions={flightTypeComboOptions}
                placeholder={labels.picker.placeholder}
                emptyText={labels.picker.noResults}
                disabled={isLocked}
                hint={
                  isLocked
                    ? labels.fields.studentOnlyHint
                    : showStudentOnlyCorrectionWarning
                      ? labels.fields.studentOnlyCorrectionHint.replace('{type}', flightTypeLabel(correctingFlight!.flightType))
                      : undefined
                }
              />
            </div>
            {/* Story 19.5 (P4/P5, D-1/D-2): the dual/solo choice is a `Toggle`
                — on = solo — in a full-width cell right after the field that
                makes it appear, and only on SCHOOL (A19). */}
            {effectiveFlightType === 'SCHOOL' ? (
              <div className="fld wide">
                <Toggle
                  id="flight-solo-toggle"
                  label={labels.fields.soloMode}
                  checked={isSolo}
                  onChange={handleSoloChange}
                  onText={labels.fields.soloModes.solo}
                  offText={labels.fields.soloModes.dual}
                />
              </div>
            ) : null}
            {/* Story 19.6 (R-19-d): always there, on every type — the form is
                mounted for `flights.manage` only, which is the whole gate. */}
            <div className="fld wide">
              <Toggle
                id="flight-no-charge-toggle"
                label={labels.fields.noCharge}
                checked={noCharge}
                onChange={handleNoChargeChange}
                onText={labels.fields.noChargeModes.noCharge}
                offText={labels.fields.noChargeModes.charged}
                hint={labels.fields.noChargeHint}
              />
            </div>
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
              <Input type="number" min={1} step={1} inputMode="numeric" {...register('takeoffs')} />
            </Field>
            <Field label={labels.fields.landings}>
              <Input type="number" min={1} step={1} inputMode="numeric" {...register('landings')} />
            </Field>
          </div>


          {noAircraft ? <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 10 }}>{labels.fields.noAircraftAvailable}</p> : null}
          {noPerson ? <p style={{ color: 'var(--ink-3)', fontSize: 12, marginTop: 4 }}>{labels.fields.noPersonAvailable}</p> : null}
          {formError ? (
            <p role="alert" data-testid="flight-form-error" style={{ color: 'var(--bad)', fontSize: 13, marginTop: 14 }}>
              {formError}
            </p>
          ) : null}

          {requirements ? (
            <RequirementsWarning
              failures={requirements.failures}
              canProceed={canForce}
              onProceed={() => void onProceed()}
              onCancel={dismissRequirements}
              submitting={proceedSubmitting}
              error={proceedError}
              moneyLocale={moneyLocale}
            />
          ) : null}
        </form>
      )}
    </SlideOver>
  );
}
