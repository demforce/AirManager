'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { formatCents } from '@/lib/money';
import { flightTypeSchema, type FlightListItemDto, type RegisterFlightResponseDto } from '@/lib/schemas/flights';
import { formatMinutes } from '@/lib/time';

type PersonOption = { id: string; firstName: string; lastName: string };
type AircraftOption = { id: string; registration: string };

export type FlightsManagerLabels = {
  form: {
    title: string;
    aircraft: string;
    noAircraftAvailable: string;
    person: string;
    noPersonAvailable: string;
    instructor: string;
    noInstructor: string;
    flightDate: string;
    flightType: string;
    flightTypes: { private: string; school: string; other: string };
    durationMode: string;
    durationModes: { minutes: string; hourMeter: string };
    minutes: string;
    hourMeterStart: string;
    hourMeterEnd: string;
    landings: string;
    notes: string;
    submit: string;
    requiredField: string;
    invalidMinutes: string;
    invalidHourMeter: string;
    errors: {
      HOUR_METER_INVALID: string;
      NO_AIRCRAFT_RATE: string;
      NO_INSTRUCTOR_RATE: string;
      SCHOOL_FLIGHT_REQUIRES_INSTRUCTOR: string;
      AIRCRAFT_ARCHIVED: string;
      PERSON_ARCHIVED: string;
      PERSON_NOT_PILOT_OR_STUDENT: string;
      INSTRUCTOR_NOT_FOUND: string;
      INSTRUCTOR_SAME_AS_PILOT: string;
      FLIGHT_DATE_IN_FUTURE: string;
      generic: string;
    };
  };
  result: {
    title: string;
    minutes: string;
    aircraftRate: string;
    aircraftAmount: string;
    instructorRate: string;
    instructorAmount: string;
    /** Story 5.2 (AC 1) — total minutes covered by package consumption, shown only when > 0. */
    packageCovered: string;
    /** Story 5.2 (AC 1) — the pro-rata remainder the aircraft component is actually rated on. */
    chargedMinutes: string;
    total: string;
    newBalance: string;
  };
  list: {
    heading: string;
    empty: string;
    table: {
      date: string;
      aircraft: string;
      person: string;
      instructor: string;
      noInstructor: string;
      type: string;
      duration: string;
      amount: string;
      landings: string;
      noValue: string;
      /** Story 5.2 (AC 1) — literal `{duration}` placeholder, CLIENT-filled (t.raw, same pattern as `account-statement-table.tsx`'s `adjustmentOfDate`). */
      packageNote: string;
    };
  };
};

type FlightsManagerProps = {
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  initialFlights: FlightListItemDto[];
  moneyLocale: 'it' | 'en';
  labels: FlightsManagerLabels;
};

/** `<input type="date">` default — same browser-local-time convention as the other panels' `todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

function flightTypeLabel(type: FlightListItemDto['flightType'], labels: FlightsManagerLabels['form']['flightTypes']): string {
  switch (type) {
    case 'PRIVATE':
      return labels.private;
    case 'SCHOOL':
      return labels.school;
    case 'OTHER':
      return labels.other;
    default:
      return type;
  }
}

/**
 * Flight logging with automatic charges (story 5.1, Task 5, AC 1/2): a
 * "Registra volo" form (always visible — this whole page already requires
 * `flights.manage`, unlike `PackagesPanel`'s conditional `canSell`) plus a
 * "Voli recenti" list below it (first page only, `GET /api/v1/flights` —
 * story 5.4 owns filters/pagination). On success the form's response
 * (`RegisterFlightResponseDto`) drives BOTH the addebito breakdown panel and
 * a prepend onto the recent-flights list — no second round-trip needed
 * (same "the POST already returns everything the UI needs" pattern as
 * `sellPackage`/`recordTopUp`).
 */
export function FlightsManager({
  aircraftOptions,
  personOptions,
  instructorOptions,
  initialFlights,
  moneyLocale,
  labels,
}: FlightsManagerProps) {
  const [flights, setFlights] = useState<FlightListItemDto[]>(initialFlights);
  const [lastResult, setLastResult] = useState<RegisterFlightResponseDto | null>(null);

  function handleRegistered(result: RegisterFlightResponseDto): void {
    setLastResult(result);
    setFlights((current) => [result.flight, ...current]);
  }

  return (
    <div className="space-y-10">
      <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
        <RegisterFlightForm
          aircraftOptions={aircraftOptions}
          personOptions={personOptions}
          instructorOptions={instructorOptions}
          labels={labels.form}
          onSuccess={handleRegistered}
        />

        {lastResult ? (
          <div data-testid="flight-result-panel" className="mt-6 rounded-[8px] border border-[#EAEAEA] bg-[#F7F6F3] p-4 text-sm">
            <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.result.title}</h4>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:justify-start">
                <dt className="text-[#787774]">{labels.result.minutes}</dt>
                <dd className="font-[family-name:var(--font-mono,monospace)] text-[#111111]">
                  {formatMinutes(lastResult.flight.minutes)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:justify-start">
                <dt className="text-[#787774]">{labels.result.aircraftRate}</dt>
                <dd className="text-[#111111]">{formatCents(lastResult.flight.breakdown.aircraftRateCentsPerHour, moneyLocale)}/h</dd>
              </div>
              {lastResult.flight.breakdown.packageCoveredMinutes > 0 ? (
                <>
                  <div className="flex justify-between gap-2 sm:justify-start">
                    <dt className="text-[#787774]">{labels.result.packageCovered}</dt>
                    <dd className="text-[#111111]">{formatMinutes(lastResult.flight.breakdown.packageCoveredMinutes)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:justify-start">
                    <dt className="text-[#787774]">{labels.result.chargedMinutes}</dt>
                    <dd className="text-[#111111]">{formatMinutes(lastResult.flight.breakdown.chargedMinutes)}</dd>
                  </div>
                  {lastResult.flight.breakdown.packageConsumptions.length > 1 ? (
                    <div className="sm:col-span-2">
                      <ul data-testid="flight-result-packages" className="mt-1 space-y-1 border-t border-[#EAEAEA] pt-2 text-xs text-[#787774]">
                        {lastResult.flight.breakdown.packageConsumptions.map((consumption) => (
                          <li key={consumption.hourPackageId} className="flex justify-between gap-3">
                            <span>{consumption.typeName}</span>
                            <span className="font-[family-name:var(--font-mono,monospace)]">{formatMinutes(consumption.minutes)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="flex justify-between gap-2 sm:justify-start">
                <dt className="text-[#787774]">{labels.result.aircraftAmount}</dt>
                <dd className="text-[#111111]">{formatCents(lastResult.flight.breakdown.aircraftAmountCents, moneyLocale)}</dd>
              </div>
              {lastResult.flight.breakdown.instructorAmountCents !== undefined &&
              lastResult.flight.breakdown.instructorRateCentsPerHour !== undefined ? (
                <>
                  <div className="flex justify-between gap-2 sm:justify-start">
                    <dt className="text-[#787774]">{labels.result.instructorRate}</dt>
                    <dd className="text-[#111111]">
                      {formatCents(lastResult.flight.breakdown.instructorRateCentsPerHour, moneyLocale)}/h
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:justify-start">
                    <dt className="text-[#787774]">{labels.result.instructorAmount}</dt>
                    <dd className="text-[#111111]">{formatCents(lastResult.flight.breakdown.instructorAmountCents, moneyLocale)}</dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-2 sm:justify-start">
                <dt className="font-medium text-[#787774]">{labels.result.total}</dt>
                <dd data-testid="flight-result-total" className="font-medium text-[#111111]">
                  {formatCents(lastResult.flight.breakdown.totalAmountCents, moneyLocale)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:justify-start">
                <dt className="font-medium text-[#787774]">{labels.result.newBalance}</dt>
                <dd data-testid="flight-result-new-balance" className="font-medium text-[#111111]">
                  {formatCents(lastResult.account.balanceCents, moneyLocale)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
          {labels.list.heading}
        </h3>
        {flights.length === 0 ? (
          <p className="mt-4 text-sm text-[#787774]">{labels.list.empty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs uppercase tracking-[0.05em] text-[#787774]">
                  <th className="py-2 pr-4 font-medium">{labels.list.table.date}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.aircraft}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.person}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.instructor}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.type}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.duration}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.amount}</th>
                  <th className="py-2 font-medium">{labels.list.table.landings}</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((flight) => (
                  <tr key={flight.id} data-testid="flight-row" className="border-b border-[#EAEAEA] text-[#111111]">
                    <td className="py-2 pr-4 whitespace-nowrap text-[#787774]">{flight.flightDate}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{flight.aircraft.registration}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{personLabel(flight.person)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {flight.instructor ? personLabel(flight.instructor) : labels.list.table.noInstructor}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{flightTypeLabel(flight.flightType, labels.form.flightTypes)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-[family-name:var(--font-mono,monospace)]">{formatMinutes(flight.minutes)}</span>
                      {flight.breakdown.packageCoveredMinutes > 0 ? (
                        <span className="block text-xs font-normal text-[#787774]">
                          {labels.list.table.packageNote.replace('{duration}', formatMinutes(flight.breakdown.packageCoveredMinutes))}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatCents(flight.breakdown.totalAmountCents, moneyLocale)}</td>
                    <td className="py-2 whitespace-nowrap">{flight.landings ?? labels.list.table.noValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Local, UI-only schema (never sent over the wire as-is — same "convert only
 * at the boundary" pattern as `TopUpForm`): every numeric field stays a raw
 * string end to end while the user types. The `minutes`/`hourMeterStart`/
 * `hourMeterEnd` XOR (Dev Notes: "il valore inviato all'API è SEMPRE minuti
 * interi o la coppia contaore") is resolved by `durationMode` — a plain
 * toggle, not a Zod refine — and validated in `onSubmit`, not here: the
 * fields the current mode doesn't use are never required.
 */
const flightFormSchema = z.object({
  aircraftId: z.string().trim().min(1),
  personId: z.string().trim().min(1),
  instructorPersonId: z.string(),
  flightDate: z.string().trim().min(1),
  flightType: flightTypeSchema,
  minutes: z.string(),
  hourMeterStart: z.string(),
  hourMeterEnd: z.string(),
  landings: z.string(),
  notes: z.string(),
});

type FlightFormValues = z.infer<typeof flightFormSchema>;

type RegisterFlightFormProps = {
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  labels: FlightsManagerLabels['form'];
  onSuccess: (result: RegisterFlightResponseDto) => void;
};

function RegisterFlightForm({ aircraftOptions, personOptions, instructorOptions, labels, onSuccess }: RegisterFlightFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  // Deliberately plain component state, NOT a react-hook-form field read via
  // `watch()` (the React Compiler flags TanStack/RHF's `watch()`/table hooks
  // as unmemoizable, same documented exception as `data-table.tsx` — a
  // second one here would add a second lint warning beyond the one already
  // accepted). `durationMode` only ever drives which inputs render and which
  // branch `onSubmit` takes; it is never itself sent to the API.
  const [durationMode, setDurationMode] = useState<'minutes' | 'hourMeter'>('minutes');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: {
      aircraftId: aircraftOptions[0]?.id ?? '',
      personId: '',
      instructorPersonId: '',
      flightDate: todayDateOnly(),
      flightType: 'PRIVATE',
      minutes: '',
      hourMeterStart: '',
      hourMeterEnd: '',
      landings: '',
      notes: '',
    },
  });

  const noAircraft = aircraftOptions.length === 0;
  const noPerson = personOptions.length === 0;

  async function onSubmit(values: FlightFormValues): Promise<void> {
    setFormError(null);

    let durationPayload: { minutes: number } | { hourMeterStart: number; hourMeterEnd: number };
    if (durationMode === 'minutes') {
      const minutes = Number(values.minutes);
      if (!Number.isInteger(minutes) || minutes < 1) {
        setFormError(labels.invalidMinutes);
        return;
      }
      durationPayload = { minutes };
    } else {
      const hourMeterStart = Number(values.hourMeterStart);
      const hourMeterEnd = Number(values.hourMeterEnd);
      if (!Number.isInteger(hourMeterStart) || !Number.isInteger(hourMeterEnd) || hourMeterEnd <= hourMeterStart) {
        setFormError(labels.invalidHourMeter);
        return;
      }
      durationPayload = { hourMeterStart, hourMeterEnd };
    }

    const landings = values.landings.trim() === '' ? undefined : Number(values.landings);
    const notes = values.notes.trim() === '' ? undefined : values.notes.trim();

    const response = await fetch('/api/v1/flights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: values.aircraftId,
        personId: values.personId,
        instructorPersonId: values.instructorPersonId === '' ? undefined : values.instructorPersonId,
        flightDate: values.flightDate,
        flightType: values.flightType,
        ...durationPayload,
        landings,
        notes,
      }),
    });

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      const knownErrors: Record<string, string> = labels.errors;
      setFormError((code && knownErrors[code]) ?? labels.errors.generic);
      return;
    }

    const result = (await response.json()) as RegisterFlightResponseDto;
    onSuccess(result);
    reset({
      aircraftId: values.aircraftId,
      personId: '',
      instructorPersonId: '',
      flightDate: todayDateOnly(),
      flightType: 'PRIVATE',
      minutes: '',
      hourMeterStart: '',
      hourMeterEnd: '',
      landings: '',
      notes: '',
    });
    setDurationMode('minutes');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5" data-testid="flight-form">
      <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">{labels.title}</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="flight-aircraft" className="block text-sm font-medium text-[#2F3437]">
            {labels.aircraft}
          </label>
          <select
            id="flight-aircraft"
            disabled={noAircraft}
            aria-invalid={Boolean(errors.aircraftId)}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437] disabled:cursor-not-allowed disabled:bg-[#F7F6F3]"
            {...register('aircraftId')}
          >
            <option value="" disabled>
              {labels.aircraft}
            </option>
            {aircraftOptions.map((aircraft) => (
              <option key={aircraft.id} value={aircraft.id}>
                {aircraft.registration}
              </option>
            ))}
          </select>
          {noAircraft ? <p className="mt-1 text-xs text-[#787774]">{labels.noAircraftAvailable}</p> : null}
        </div>

        <div>
          <label htmlFor="flight-person" className="block text-sm font-medium text-[#2F3437]">
            {labels.person}
          </label>
          <select
            id="flight-person"
            disabled={noPerson}
            aria-invalid={Boolean(errors.personId)}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437] disabled:cursor-not-allowed disabled:bg-[#F7F6F3]"
            {...register('personId')}
          >
            <option value="" disabled>
              {labels.person}
            </option>
            {personOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
          {noPerson ? <p className="mt-1 text-xs text-[#787774]">{labels.noPersonAvailable}</p> : null}
        </div>

        <div>
          <label htmlFor="flight-instructor" className="block text-sm font-medium text-[#2F3437]">
            {labels.instructor}
          </label>
          <select
            id="flight-instructor"
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('instructorPersonId')}
          >
            <option value="">{labels.noInstructor}</option>
            {instructorOptions.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {personLabel(instructor)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flight-date" className="block text-sm font-medium text-[#2F3437]">
            {labels.flightDate}
          </label>
          <input
            id="flight-date"
            type="date"
            aria-invalid={Boolean(errors.flightDate)}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('flightDate')}
          />
          {errors.flightDate ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredField}</p> : null}
        </div>

        <div>
          <label htmlFor="flight-type" className="block text-sm font-medium text-[#2F3437]">
            {labels.flightType}
          </label>
          <select
            id="flight-type"
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('flightType')}
          >
            <option value="PRIVATE">{labels.flightTypes.private}</option>
            <option value="SCHOOL">{labels.flightTypes.school}</option>
            <option value="OTHER">{labels.flightTypes.other}</option>
          </select>
        </div>

        <div>
          <label htmlFor="flight-landings" className="block text-sm font-medium text-[#2F3437]">
            {labels.landings}
          </label>
          <input
            id="flight-landings"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('landings')}
          />
        </div>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-[#2F3437]">{labels.durationMode}</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          <label htmlFor="flight-duration-mode-minutes" className="flex items-center gap-2 text-sm text-[#2F3437]">
            <input
              id="flight-duration-mode-minutes"
              type="radio"
              name="flight-duration-mode"
              value="minutes"
              checked={durationMode === 'minutes'}
              onChange={() => setDurationMode('minutes')}
            />
            {labels.durationModes.minutes}
          </label>
          <label htmlFor="flight-duration-mode-hourMeter" className="flex items-center gap-2 text-sm text-[#2F3437]">
            <input
              id="flight-duration-mode-hourMeter"
              type="radio"
              name="flight-duration-mode"
              value="hourMeter"
              checked={durationMode === 'hourMeter'}
              onChange={() => setDurationMode('hourMeter')}
            />
            {labels.durationModes.hourMeter}
          </label>
        </div>
      </fieldset>

      {durationMode === 'minutes' ? (
        <div className="max-w-[200px]">
          <label htmlFor="flight-minutes" className="block text-sm font-medium text-[#2F3437]">
            {labels.minutes}
          </label>
          <input
            id="flight-minutes"
            type="number"
            step={1}
            min={1}
            inputMode="numeric"
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
            {...register('minutes')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-[440px]">
          <div>
            <label htmlFor="flight-hour-meter-start" className="block text-sm font-medium text-[#2F3437]">
              {labels.hourMeterStart}
            </label>
            <input
              id="flight-hour-meter-start"
              type="number"
              step={1}
              min={0}
              inputMode="numeric"
              className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
              {...register('hourMeterStart')}
            />
          </div>
          <div>
            <label htmlFor="flight-hour-meter-end" className="block text-sm font-medium text-[#2F3437]">
              {labels.hourMeterEnd}
            </label>
            <input
              id="flight-hour-meter-end"
              type="number"
              step={1}
              min={0}
              inputMode="numeric"
              className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
              {...register('hourMeterEnd')}
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="flight-notes" className="block text-sm font-medium text-[#2F3437]">
          {labels.notes}
        </label>
        <input
          id="flight-notes"
          maxLength={1000}
          className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          {...register('notes')}
        />
      </div>

      {formError ? (
        <p role="alert" data-testid="flight-form-error" className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || noAircraft || noPerson}
        className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
