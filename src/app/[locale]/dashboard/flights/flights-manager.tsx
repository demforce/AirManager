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
      /** Story 5.3 (AC 1) — the status column header; REGISTERED renders no badge at all (Contesto). */
      status: string;
      statusCancelled: string;
      /** Literal `{date}`/`{reason}` placeholders, CLIENT-filled — same `t.raw` pattern as `packageNote`. */
      cancelledDetail: string;
      correctionOf: string;
      correctedBy: string;
      actions: string;
      cancelAction: string;
      correctAction: string;
    };
  };
  /** Story 5.3, AC 1 — the inline "Annulla volo" confirmation panel. */
  cancelPanel: {
    title: string;
    reason: string;
    requiredReason: string;
    submit: string;
    close: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
  /** Story 5.3, AC 2 — the extra fields/labels the registration form grows in correction mode. */
  correctPanel: {
    title: string;
    reason: string;
    requiredReason: string;
    submit: string;
    exit: string;
    conflictError: string;
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
 *
 * Story 5.3 (AC 1/2): the same form doubles as the "Correggi" editor — when
 * a REGISTERED row's "Correggi" action is clicked, the form remounts
 * (`key`) pre-filled with that flight's data plus a mandatory motivo field,
 * and submits to `/correct` instead of `/`. "Annulla" opens a small,
 * separate confirmation panel (never a modal, Contesto: "niente modali
 * barocche") asking only for a motivo. Both write paths patch the
 * client-side list directly from their responses: `cancel`'s response
 * already IS the updated (cancelled) row (server-authoritative); `correct`'s
 * response is the NEW row only, so the just-superseded row is patched
 * locally with the same status/reason the server just recorded (an exact
 * value, not a guess — the reason came from this same submit) plus a
 * client-computed `cancelledAt` (a full page reload always shows the
 * DB-authoritative timestamp).
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
  const [correctingFlight, setCorrectingFlight] = useState<FlightListItemDto | null>(null);
  const [cancellingFlight, setCancellingFlight] = useState<FlightListItemDto | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  function handleRegistered(result: RegisterFlightResponseDto): void {
    setLastResult(result);
    setFlights((current) => [result.flight, ...current]);
  }

  function handleCorrected(result: RegisterFlightResponseDto, originalFlightId: string, reason: string): void {
    setLastResult(result);
    setFlights((current) => [
      result.flight,
      ...current.map((flight) =>
        flight.id === originalFlightId
          ? {
              ...flight,
              status: 'CANCELLED' as const,
              cancelledAt: new Date().toISOString(),
              cancelReason: reason,
              correctedByFlightId: result.flight.id,
            }
          : flight,
      ),
    ]);
    setCorrectingFlight(null);
  }

  function handleCancelled(result: RegisterFlightResponseDto): void {
    setFlights((current) => current.map((flight) => (flight.id === result.flight.id ? result.flight : flight)));
    setCancellingFlight(null);
    setCancelFeedback(labels.cancelPanel.success);
  }

  return (
    <div className="space-y-10">
      <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
        <RegisterFlightForm
          key={correctingFlight?.id ?? 'register'}
          aircraftOptions={aircraftOptions}
          personOptions={personOptions}
          instructorOptions={instructorOptions}
          labels={labels.form}
          correctLabels={labels.correctPanel}
          correctingFlight={correctingFlight}
          onExitCorrection={() => setCorrectingFlight(null)}
          onSuccess={handleRegistered}
          onCorrected={handleCorrected}
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

      {cancellingFlight ? (
        <CancelFlightPanel
          flight={cancellingFlight}
          moneyLocale={moneyLocale}
          labels={labels.cancelPanel}
          onClose={() => setCancellingFlight(null)}
          onCancelled={handleCancelled}
        />
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
            {labels.list.heading}
          </h3>
          {cancelFeedback ? (
            <p role="status" data-testid="flight-cancel-feedback" className="text-sm text-[#346538]">
              {cancelFeedback}
            </p>
          ) : null}
        </div>
        {flights.length === 0 ? (
          <p className="mt-4 text-sm text-[#787774]">{labels.list.empty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-xs uppercase tracking-[0.05em] text-[#787774]">
                  <th className="py-2 pr-4 font-medium">{labels.list.table.date}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.aircraft}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.person}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.instructor}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.type}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.duration}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.amount}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.landings}</th>
                  <th className="py-2 pr-4 font-medium">{labels.list.table.status}</th>
                  <th className="py-2 font-medium">{labels.list.table.actions}</th>
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
                    <td className="py-2 pr-4 whitespace-nowrap">{flight.landings ?? labels.list.table.noValue}</td>
                    <td className="py-2 pr-4">
                      <FlightStatusCell flight={flight} labels={labels.list.table} />
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {flight.status === 'REGISTERED' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            data-testid="flight-cancel-action"
                            onClick={() => {
                              setCancelFeedback(null);
                              setCancellingFlight(flight);
                            }}
                            className="rounded-[6px] border border-[#EAEAEA] bg-white px-2.5 py-1 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                          >
                            {labels.list.table.cancelAction}
                          </button>
                          <button
                            type="button"
                            data-testid="flight-correct-action"
                            onClick={() => setCorrectingFlight(flight)}
                            className="rounded-[6px] border border-[#EAEAEA] bg-white px-2.5 py-1 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                          >
                            {labels.list.table.correctAction}
                          </button>
                        </div>
                      ) : null}
                    </td>
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
 * The status/lineage cell (story 5.3, AC 1/2): REGISTERED renders nothing
 * (Contesto: "REGISTERED senza badge o neutro") — a CANCELLED flight shows a
 * muted/red badge plus, in a small secondary line, when/why (the reason is
 * also the row's `title` so the full text is always reachable even if the
 * line truncates). The correction chips ("corretto da"/"correzione di")
 * render whenever their id is present, REGARDLESS of this row's own status
 * — a REGISTERED flight can itself be a correction of an earlier ANNULLATO
 * one.
 */
function FlightStatusCell({ flight, labels }: { flight: FlightListItemDto; labels: FlightsManagerLabels['list']['table'] }) {
  if (flight.status !== 'CANCELLED' && !flight.correctionOfId && !flight.correctedByFlightId) {
    return null;
  }

  return (
    <div className="space-y-1">
      {flight.status === 'CANCELLED' ? (
        <>
          <span
            data-testid="flight-status-badge"
            className="inline-block rounded-full bg-[#FDEBEC] px-2.5 py-1 text-xs font-medium text-[#9F2F2D]"
          >
            {labels.statusCancelled}
          </span>
          {flight.cancelledAt && flight.cancelReason ? (
            <p className="text-xs text-[#787774]" title={flight.cancelReason}>
              {labels.cancelledDetail.replace('{date}', flight.cancelledAt.slice(0, 10)).replace('{reason}', flight.cancelReason)}
            </p>
          ) : null}
        </>
      ) : null}
      {flight.correctionOfId ? <p className="text-xs text-[#787774]">{labels.correctionOf}</p> : null}
      {flight.correctedByFlightId ? <p className="text-xs text-[#787774]">{labels.correctedBy}</p> : null}
    </div>
  );
}

type CancelFlightPanelProps = {
  flight: FlightListItemDto;
  moneyLocale: 'it' | 'en';
  labels: FlightsManagerLabels['cancelPanel'];
  onClose: () => void;
  onCancelled: (result: RegisterFlightResponseDto) => void;
};

/**
 * "Annulla volo" confirmation (story 5.3, AC 1) — a small inline panel, NOT
 * a modal (Contesto: "niente modali barocche"), asking only for the
 * mandatory motivo. On success, the response's `flight` IS the updated
 * (cancelled) row — the parent patches the list with it directly, no
 * separate re-fetch (same "the POST already returns everything the UI
 * needs" pattern as registration).
 */
function CancelFlightPanel({ flight, moneyLocale, labels, onClose, onCancelled }: CancelFlightPanelProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(): Promise<void> {
    const trimmed = reason.trim();
    if (trimmed === '') {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    setFormError(null);
    setSubmitting(true);

    const response = await fetch(`/api/v1/flights/${flight.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: trimmed }),
    });

    setSubmitting(false);
    if (!response.ok) {
      setFormError(response.status === 409 ? labels.conflictError : labels.genericError);
      return;
    }

    const result = (await response.json()) as RegisterFlightResponseDto;
    onCancelled(result);
  }

  return (
    <div data-testid="flight-cancel-panel" className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
      <h4 className="font-[family-name:var(--font-serif)] text-xl font-medium tracking-[-0.02em] text-[#111111]">{labels.title}</h4>
      <p className="mt-2 text-sm text-[#787774]">
        {flight.aircraft.registration} — {flight.flightDate} — {formatCents(flight.breakdown.totalAmountCents, moneyLocale)}
      </p>

      <div className="mt-4 max-w-md">
        <label htmlFor="cancel-reason" className="block text-sm font-medium text-[#2F3437]">
          {labels.reason}
        </label>
        <input
          id="cancel-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={reasonError}
          maxLength={500}
          className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
        />
        {reasonError ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.requiredReason}</p> : null}
      </div>

      {formError ? (
        <p role="alert" data-testid="flight-cancel-error" className="mt-4 rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]">
          {formError}
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          data-testid="flight-cancel-confirm"
          disabled={submitting}
          onClick={() => void handleConfirm()}
          className="min-h-[44px] rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.submit}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-[6px] border border-[#EAEAEA] bg-white px-4 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.close}
        </button>
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

/** Blank/registration defaults, or (story 5.3) pre-filled from the flight being corrected. */
function flightFormDefaults(aircraftOptions: AircraftOption[], correctingFlight: FlightListItemDto | null): FlightFormValues {
  if (!correctingFlight) {
    return {
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
    };
  }
  return {
    aircraftId: correctingFlight.aircraft.id,
    personId: correctingFlight.person.id,
    instructorPersonId: correctingFlight.instructor?.personId ?? '',
    flightDate: correctingFlight.flightDate,
    flightType: correctingFlight.flightType,
    minutes: correctingFlight.hourMeterStart === null ? String(correctingFlight.minutes) : '',
    hourMeterStart: correctingFlight.hourMeterStart !== null ? String(correctingFlight.hourMeterStart) : '',
    hourMeterEnd: correctingFlight.hourMeterEnd !== null ? String(correctingFlight.hourMeterEnd) : '',
    landings: correctingFlight.landings !== null ? String(correctingFlight.landings) : '',
    notes: correctingFlight.notes ?? '',
  };
}

type RegisterFlightFormProps = {
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  labels: FlightsManagerLabels['form'];
  correctLabels: FlightsManagerLabels['correctPanel'];
  /** Story 5.3, AC 2 — non-null re-purposes this SAME form into the "Correggi volo" editor. */
  correctingFlight: FlightListItemDto | null;
  onExitCorrection: () => void;
  onSuccess: (result: RegisterFlightResponseDto) => void;
  onCorrected: (result: RegisterFlightResponseDto, originalFlightId: string, reason: string) => void;
};

function RegisterFlightForm({
  aircraftOptions,
  personOptions,
  instructorOptions,
  labels,
  correctLabels,
  correctingFlight,
  onExitCorrection,
  onSuccess,
  onCorrected,
}: RegisterFlightFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  // Deliberately plain component state, NOT a react-hook-form field read via
  // `watch()` (the React Compiler flags TanStack/RHF's `watch()`/table hooks
  // as unmemoizable, same documented exception as `data-table.tsx` — a
  // second one here would add a second lint warning beyond the one already
  // accepted). `durationMode` only ever drives which inputs render and which
  // branch `onSubmit` takes; it is never itself sent to the API.
  const [durationMode, setDurationMode] = useState<'minutes' | 'hourMeter'>(
    correctingFlight?.hourMeterStart != null ? 'hourMeter' : 'minutes',
  );
  // Story 5.3 (AC 2): the mandatory motivo, only rendered/required in
  // correction mode — same "plain local state, not a schema field" pattern
  // as `durationMode` (the field only exists in one of the two modes).
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: flightFormDefaults(aircraftOptions, correctingFlight),
  });

  const noAircraft = aircraftOptions.length === 0;
  const noPerson = personOptions.length === 0;
  const isCorrecting = correctingFlight !== null;

  async function onSubmit(values: FlightFormValues): Promise<void> {
    setFormError(null);

    if (isCorrecting && reason.trim() === '') {
      setReasonError(true);
      return;
    }
    setReasonError(false);

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
    const trimmedReason = reason.trim();

    const response = await fetch(isCorrecting ? `/api/v1/flights/${correctingFlight.id}/correct` : '/api/v1/flights', {
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
        ...(isCorrecting ? { reason: trimmedReason } : {}),
      }),
    });

    if (!response.ok) {
      if (isCorrecting && response.status === 409) {
        setFormError(correctLabels.conflictError);
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const code = (body as { error?: { code?: string } } | null)?.error?.code;
      const knownErrors: Record<string, string> = labels.errors;
      setFormError((code && knownErrors[code]) ?? labels.errors.generic);
      return;
    }

    const result = (await response.json()) as RegisterFlightResponseDto;
    if (isCorrecting) {
      onCorrected(result, correctingFlight.id, trimmedReason);
    } else {
      onSuccess(result);
    }
    reset(flightFormDefaults(aircraftOptions, null));
    setDurationMode('minutes');
    setReason('');
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5" data-testid="flight-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-serif)] text-2xl font-medium tracking-[-0.02em] text-[#111111]">
          {isCorrecting ? correctLabels.title : labels.title}
        </h3>
        {isCorrecting ? (
          <button
            type="button"
            data-testid="flight-correct-exit"
            onClick={onExitCorrection}
            className="text-xs font-medium text-[#787774] underline-offset-4 hover:underline"
          >
            {correctLabels.exit}
          </button>
        ) : null}
      </div>

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

      {isCorrecting ? (
        <div className="max-w-md">
          <label htmlFor="flight-correct-reason" className="block text-sm font-medium text-[#2F3437]">
            {correctLabels.reason}
          </label>
          <input
            id="flight-correct-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={reasonError}
            maxLength={500}
            className="mt-2 min-h-[44px] w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          />
          {reasonError ? <p className="mt-1 text-xs text-[#9F2F2D]">{correctLabels.requiredReason}</p> : null}
        </div>
      ) : null}

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
        {isCorrecting ? correctLabels.submit : labels.submit}
      </button>
    </form>
  );
}
