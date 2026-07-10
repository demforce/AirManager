'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { useRouter } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import {
  flightTypeSchema,
  type FlightListItemDto,
  type FlightStatusDto,
  type FlightTypeDto,
  type RegisterFlightResponseDto,
} from '@/lib/schemas/flights';
import { formatMinutes } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';

type PersonOption = { id: string; firstName: string; lastName: string };
type AircraftOption = { id: string; registration: string };

/**
 * Raw shape of one `GET /api/v1/aircraft` / `GET /api/v1/people` list item,
 * as far as the 5 typeahead pickers below need it (story TD-3, AC 1/3) — the
 * two search helpers below are the `fetchOptions` every `SearchCombobox`
 * instance on this page is built from.
 */
type AircraftSearchItem = { id: string; registration: string; archivedAt: string | null };
type PersonSearchItem = { id: string; firstName: string; lastName: string; archivedAt: string | null };

/**
 * Server-side aircraft search (story TD-3, AC 1/3) — `GET /api/v1/aircraft`
 * already supports `q` (case-insensitive, registration/model) and
 * `includeArchived`; the domain rule (form = active-only, filter bar =
 * includes archived) is entirely in what the CALLER passes here, never in
 * this helper. `pageSize: 50` is a generous result cap for a targeted
 * search (well under the API's own 100-per-page cap) — not a "first N"
 * truncation, since a narrower query only ever needs to return a handful of
 * plausible matches.
 */
async function searchAircraft(query: string, options: { includeArchived: boolean; archivedSuffix?: string }): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50' });
  if (options.includeArchived) params.set('includeArchived', 'true');
  const response = await fetch(`/api/v1/aircraft?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: AircraftSearchItem[] };
  return body.items.map((aircraft) => ({
    id: aircraft.id,
    label: aircraft.registration + (options.includeArchived && options.archivedSuffix && aircraft.archivedAt ? options.archivedSuffix : ''),
  }));
}

/**
 * Server-side people search (story TD-3, AC 1/3) — `GET /api/v1/people`'s
 * new `profile` param (`pilot-or-student`/`instructor`) is what makes this
 * safe to reuse for both the form's "Pilota o allievo"/"Istruttore" pickers
 * (server-enforced domain rule, AD-5 — the client typeahead is only
 * affordance) AND the filter bar's unrestricted "Persona" picker (`profile`
 * simply omitted there, same as today).
 */
async function searchPeople(
  query: string,
  options: { includeArchived: boolean; profile?: 'pilot-or-student' | 'instructor'; archivedSuffix?: string },
): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50' });
  if (options.includeArchived) params.set('includeArchived', 'true');
  if (options.profile) params.set('profile', options.profile);
  const response = await fetch(`/api/v1/people?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: PersonSearchItem[] };
  return body.items.map((person) => ({
    id: person.id,
    label: personLabel(person) + (options.includeArchived && options.archivedSuffix && person.archivedAt ? options.archivedSuffix : ''),
  }));
}
/** Filter-bar picker option (story 5.4) — `archived` drives the "(Archiviato)" suffix (Dev Notes: these pickers include archived entities to consult the storico, unlike the registration form's active-only ones). */
type AircraftFilterOption = AircraftOption & { archived: boolean };
type PersonFilterOption = PersonOption & { archived: boolean };

/**
 * The filter bar's current values (story 5.4, AC 1/2/3), always strings
 * (`''` = unset) so every `<select>`/`<input type="date">` stays a plain
 * controlled element — converted to real query params only in `navigate`.
 * `aircraftId`/`personId` are meaningless for a non-staff actor (Dev Notes:
 * no picker to source them from) but the shape stays uniform either way.
 */
export type FlightsFilters = {
  dateFrom: string;
  dateTo: string;
  aircraftId: string;
  personId: string;
  flightType: '' | FlightTypeDto;
  status: '' | FlightStatusDto;
};

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
    /** Story 9.4 (AC 1) — dual/solo radio, rendered only when `flightType === 'SCHOOL'`. */
    soloMode: string;
    soloModes: { dual: string; solo: string };
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
      SOLO_REQUIRES_SCHOOL: string;
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
      /** Story 9.4 (AC 1) — suffix appended to the type label when `flight.isSolo` ("Scuola — solista" / "School — solo"). */
      soloSuffix: string;
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
  /** Story 5.4 (AC 1/2/3) — the filter bar above the registry; `aircraft`/`person` and their "all" options are staff-only (Contesto: no picker to source them from for a non-staff actor). */
  filters: {
    dateFrom: string;
    dateTo: string;
    aircraft: string;
    allAircraft: string;
    person: string;
    allPeople: string;
    flightType: string;
    allTypes: string;
    status: string;
    allStatuses: string;
    statusOptions: { registered: string; cancelled: string };
    /** Appended to an archived aircraft/person's label in the filter pickers (e.g. " (Archiviato)"). */
    archivedSuffix: string;
    reset: string;
  };
  /** Story TD-3 (AC 2) — shared chrome for all 5 `SearchCombobox` pickers on this page (form + filter bar). */
  picker: {
    placeholder: string;
    noResults: string;
  };
};

type FlightsManagerProps = {
  /** Story 5.4 — `flights.manage`: full manager (form + actions + every filter). Otherwise: the own-access read-only registry (period/type/status only). */
  canManage: boolean;
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  /** Filter-bar aircraft picker (staff only) — includes archived aircraft (Dev Notes: consulting the storico). */
  aircraftFilterOptions: AircraftFilterOption[];
  /** Filter-bar person picker (staff only) — includes archived people, same rationale. */
  personFilterOptions: PersonFilterOption[];
  initialFlights: FlightListItemDto[];
  moneyLocale: 'it' | 'en';
  /** The filter values the current page was rendered with (from the URL, story 5.4) — the bar's initial/controlled state. */
  filters: FlightsFilters;
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
    case 'TOURISM':
      return labels.private;
    case 'SCHOOL':
      return labels.school;
    case 'AERIAL_WORK':
      return labels.other;
    default:
      return type;
  }
}

/**
 * Flight logging with automatic charges (story 5.1, Task 5, AC 1/2), extended
 * to a role-scoped registry with filters (story 5.4, AC 1/2/3/4; FR-17):
 * `canManage` (staff/admin, `flights.manage`) gets the full manager — a
 * "Registra volo" form, the filter bar with every filter (period, velivolo,
 * persona, tipo, stato) and per-row "Annulla"/"Correggi" actions. Everyone
 * else (own-access, `self.read`) gets a READ-ONLY registry of just their own
 * flights (as the flight's person OR its instructor, `flights.service.ts`'s
 * own-access scope) — no form, no actions, and a filter bar limited to
 * period/tipo/stato (Contesto: no aircraft/person picker to source options
 * from without a staff-only endpoint). The page component is the real
 * guardian of what data arrives here (AD-5, `listFlights`'s own-access
 * branch) — `canManage` only decides what to RENDER.
 *
 * The registry itself is paginated server-side (NFR-6) — the parent server
 * component re-renders this whole client component with fresh `key`/props on
 * every filter or page change (a hand-edited URL, a filter select, or a
 * Prev/Next click all just navigate), so `flights`'s local state below always
 * starts from the CURRENT page's data.
 *
 * On a successful registration the form's response (`RegisterFlightResponseDto`)
 * drives BOTH the addebito breakdown panel and a prepend onto the list — no
 * second round-trip needed (same "the POST already returns everything the UI
 * needs" pattern as `sellPackage`/`recordTopUp`).
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
  canManage,
  aircraftOptions,
  personOptions,
  instructorOptions,
  aircraftFilterOptions,
  personFilterOptions,
  initialFlights,
  moneyLocale,
  filters: initialFilters,
  labels,
}: FlightsManagerProps) {
  const router = useRouter();
  const [flights, setFlights] = useState<FlightListItemDto[]>(initialFlights);
  const [lastResult, setLastResult] = useState<RegisterFlightResponseDto | null>(null);
  const [correctingFlight, setCorrectingFlight] = useState<FlightListItemDto | null>(null);
  const [cancellingFlight, setCancellingFlight] = useState<FlightListItemDto | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [filters, setFilters] = useState<FlightsFilters>(initialFilters);

  /**
   * Pushes the new filter values into the URL (dropping `page` — any filter
   * change goes back to page 1, same behavior as `CashRegister`'s own
   * `navigate`). The parent server page re-reads `searchParams`, re-queries
   * `listFlights` with the new filters, and re-renders this component with a
   * fresh `key` (`page.tsx`), so there is nothing else to sync here.
   */
  function navigate(next: FlightsFilters): void {
    const params = new URLSearchParams();
    if (next.dateFrom) params.set('dateFrom', next.dateFrom);
    if (next.dateTo) params.set('dateTo', next.dateTo);
    if (canManage && next.aircraftId) params.set('aircraftId', next.aircraftId);
    if (canManage && next.personId) params.set('personId', next.personId);
    if (next.flightType) params.set('flightType', next.flightType);
    if (next.status) params.set('status', next.status);
    const search = params.toString();
    router.push(`/dashboard/flights${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<FlightsFilters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    navigate(next);
  }

  function handleResetFilters(): void {
    const cleared: FlightsFilters = { dateFrom: '', dateTo: '', aircraftId: '', personId: '', flightType: '', status: '' };
    setFilters(cleared);
    navigate(cleared);
  }

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
      {canManage ? (
        <div className="rounded-[12px] border border-[#EAEAEA] bg-white p-6">
          <RegisterFlightForm
            key={correctingFlight?.id ?? 'register'}
            aircraftOptions={aircraftOptions}
            personOptions={personOptions}
            instructorOptions={instructorOptions}
            labels={labels.form}
            correctLabels={labels.correctPanel}
            pickerLabels={labels.picker}
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
      ) : null}

      {canManage && cancellingFlight ? (
        <CancelFlightPanel
          flight={cancellingFlight}
          moneyLocale={moneyLocale}
          labels={labels.cancelPanel}
          onClose={() => setCancellingFlight(null)}
          onCancelled={handleCancelled}
        />
      ) : null}

      <div>
        <FilterBar
          canManage={canManage}
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleResetFilters}
          aircraftOptions={aircraftFilterOptions}
          personOptions={personFilterOptions}
          labels={labels.filters}
          flightTypeLabels={labels.form.flightTypes}
          pickerLabels={labels.picker}
        />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
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
                  {canManage ? <th className="py-2 font-medium">{labels.list.table.actions}</th> : null}
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
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {flightTypeLabel(flight.flightType, labels.form.flightTypes)}
                      {flight.isSolo ? ` — ${labels.list.table.soloSuffix}` : ''}
                    </td>
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
                    {canManage ? (
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
                    ) : null}
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

type FilterBarProps = {
  canManage: boolean;
  filters: FlightsFilters;
  onChange: (patch: Partial<FlightsFilters>) => void;
  onReset: () => void;
  aircraftOptions: AircraftFilterOption[];
  personOptions: PersonFilterOption[];
  labels: FlightsManagerLabels['filters'];
  /** Reused verbatim from the registration form's labels (private/school/other) — no separate i18n keys for the same three values. */
  flightTypeLabels: FlightsManagerLabels['form']['flightTypes'];
  pickerLabels: FlightsManagerLabels['picker'];
};

/**
 * The registry's filter bar (story 5.4, AC 1/2/3; velivolo/persona migrated
 * to `SearchCombobox` in story TD-3, AC 1/3) — a sober row of plain
 * inputs/pickers above the table, coherent with the rest of the minimalist
 * editorial dashboard (no separate filter panel/drawer, same "controls sit
 * directly above their data" pattern as `CashRegister`). Period/tipo/stato
 * are offered to EVERY role; velivolo/persona render only for `canManage`
 * (Contesto: a non-staff actor has no staff-only `listAircraft`/`listPeople`
 * picker to source them from). Every change navigates immediately (no
 * "Applica" button, same as `CashRegister`) — "Azzera filtri" clears the
 * whole bar in one click.
 */
function FilterBar({ canManage, filters, onChange, onReset, aircraftOptions, personOptions, labels, flightTypeLabels, pickerLabels }: FilterBarProps) {
  const inputClasses =
    'mt-2 min-h-[40px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]';
  const hasActiveFilter = Object.values(filters).some((value) => value !== '');

  // The filter bar includes archived entities (Dev Notes: consulting the
  // storico) AND offers "Tutti i velivoli"/"Tutte le persone" to clear the
  // filter — a plain `{ id: '', label: ... }` entry the combobox itself
  // knows nothing special about (story TD-3's exact prop contract has no
  // "clear" affordance: this IS how a caller expresses one). Backspacing the
  // query back to empty re-shows this entry at the top, reachable by
  // keyboard exactly like every other option.
  const aircraftComboOptions = useMemo<SearchComboboxOption[]>(
    () => [
      { id: '', label: labels.allAircraft },
      ...aircraftOptions.map((aircraft) => ({
        id: aircraft.id,
        label: aircraft.registration + (aircraft.archived ? labels.archivedSuffix : ''),
      })),
    ],
    [aircraftOptions, labels.allAircraft, labels.archivedSuffix],
  );
  const personComboOptions = useMemo<SearchComboboxOption[]>(
    () => [
      { id: '', label: labels.allPeople },
      ...personOptions.map((person) => ({
        id: person.id,
        label: personLabel(person) + (person.archived ? labels.archivedSuffix : ''),
      })),
    ],
    [personOptions, labels.allPeople, labels.archivedSuffix],
  );

  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-[#EAEAEA] pb-6" data-testid="flight-filter-bar">
      {/* `<label htmlFor>` as a SIBLING of its control, never wrapping it: a
          wrapping `<label>` around a `<select>` folds every `<option>`'s
          text into the label's own accessible name (browsers compute it from
          textContent), which can accidentally collide with an unrelated
          label elsewhere on the page once option text is dynamic (e.g. a
          person's name) — the same footgun `CashRegister`'s filter bar has,
          fixed here instead of repeated. */}
      <div className="flex flex-col text-sm text-[#2F3437]">
        <label htmlFor="flight-filter-date-from">{labels.dateFrom}</label>
        <input
          id="flight-filter-date-from"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => onChange({ dateFrom: event.target.value })}
          className={inputClasses}
          data-testid="flight-filter-date-from"
        />
      </div>
      <div className="flex flex-col text-sm text-[#2F3437]">
        <label htmlFor="flight-filter-date-to">{labels.dateTo}</label>
        <input
          id="flight-filter-date-to"
          type="date"
          value={filters.dateTo}
          onChange={(event) => onChange({ dateTo: event.target.value })}
          className={inputClasses}
          data-testid="flight-filter-date-to"
        />
      </div>
      {canManage ? (
        <SearchCombobox
          id="flight-filter-aircraft"
          label={labels.aircraft}
          value={filters.aircraftId}
          onChange={(id) => onChange({ aircraftId: id })}
          fetchOptions={(q) => searchAircraft(q, { includeArchived: true, archivedSuffix: labels.archivedSuffix })}
          initialOptions={aircraftComboOptions}
          placeholder={pickerLabels.placeholder}
          emptyText={pickerLabels.noResults}
        />
      ) : null}
      {canManage ? (
        <SearchCombobox
          id="flight-filter-person"
          label={labels.person}
          value={filters.personId}
          onChange={(id) => onChange({ personId: id })}
          fetchOptions={(q) => searchPeople(q, { includeArchived: true, archivedSuffix: labels.archivedSuffix })}
          initialOptions={personComboOptions}
          placeholder={pickerLabels.placeholder}
          emptyText={pickerLabels.noResults}
        />
      ) : null}
      <div className="flex flex-col text-sm text-[#2F3437]">
        <label htmlFor="flight-filter-type">{labels.flightType}</label>
        <select
          id="flight-filter-type"
          value={filters.flightType}
          onChange={(event) => onChange({ flightType: event.target.value as FlightsFilters['flightType'] })}
          className={inputClasses}
          data-testid="flight-filter-type"
        >
          <option value="">{labels.allTypes}</option>
          <option value="TOURISM">{flightTypeLabels.private}</option>
          <option value="SCHOOL">{flightTypeLabels.school}</option>
          <option value="AERIAL_WORK">{flightTypeLabels.other}</option>
        </select>
      </div>
      <div className="flex flex-col text-sm text-[#2F3437]">
        <label htmlFor="flight-filter-status">{labels.status}</label>
        <select
          id="flight-filter-status"
          value={filters.status}
          onChange={(event) => onChange({ status: event.target.value as FlightsFilters['status'] })}
          className={inputClasses}
          data-testid="flight-filter-status"
        >
          <option value="">{labels.allStatuses}</option>
          <option value="REGISTERED">{labels.statusOptions.registered}</option>
          <option value="CANCELLED">{labels.statusOptions.cancelled}</option>
        </select>
      </div>
      {hasActiveFilter ? (
        <button
          type="button"
          onClick={onReset}
          data-testid="flight-filter-reset"
          className="min-h-[40px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
        >
          {labels.reset}
        </button>
      ) : null}
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
 *
 * Story TD-3: `aircraftId`/`personId`/`instructorPersonId` are deliberately
 * NOT part of this schema anymore — they moved to plain component state
 * driven by `SearchCombobox` (same "plain local state, not an RHF field"
 * pattern already used here for `durationMode`/`reason`, for the identical
 * reason: a controlled value that isn't read via RHF's `watch()`). Their
 * "required" check moved from the Zod resolver to a manual pre-submit check
 * in `onSubmit`, reusing the SAME `labels.requiredField` message
 * `flightDate` already showed inline — see `onSubmit` below.
 */
const flightFormSchema = z.object({
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
function flightFormDefaults(correctingFlight: FlightListItemDto | null): FlightFormValues {
  if (!correctingFlight) {
    return {
      flightDate: todayDateOnly(),
      flightType: 'TOURISM',
      minutes: '',
      hourMeterStart: '',
      hourMeterEnd: '',
      landings: '',
      notes: '',
    };
  }
  return {
    flightDate: correctingFlight.flightDate,
    flightType: correctingFlight.flightType,
    minutes: correctingFlight.hourMeterStart === null ? String(correctingFlight.minutes) : '',
    hourMeterStart: correctingFlight.hourMeterStart !== null ? String(correctingFlight.hourMeterStart) : '',
    hourMeterEnd: correctingFlight.hourMeterEnd !== null ? String(correctingFlight.hourMeterEnd) : '',
    landings: correctingFlight.landings !== null ? String(correctingFlight.landings) : '',
    notes: correctingFlight.notes ?? '',
  };
}

/** The 3 picker fields' defaults — mirrors `flightFormDefaults` but kept separate since they live in their own plain state, not the RHF-managed `FlightFormValues` (story TD-3). */
function pickerDefaults(aircraftOptions: AircraftOption[], correctingFlight: FlightListItemDto | null): { aircraftId: string; personId: string; instructorPersonId: string } {
  if (!correctingFlight) {
    return { aircraftId: aircraftOptions[0]?.id ?? '', personId: '', instructorPersonId: '' };
  }
  return {
    aircraftId: correctingFlight.aircraft.id,
    personId: correctingFlight.person.id,
    instructorPersonId: correctingFlight.instructor?.personId ?? '',
  };
}

type RegisterFlightFormProps = {
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  labels: FlightsManagerLabels['form'];
  correctLabels: FlightsManagerLabels['correctPanel'];
  pickerLabels: FlightsManagerLabels['picker'];
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
  pickerLabels,
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
  // Story 9.4 (AC 1): `flightType` stays `register`-only (RHF reads it from
  // the DOM at submit, same as before) — this mirrors it into plain state,
  // via `register`'s own `onChange` option (NOT `watch()`, same React
  // Compiler exception as `durationMode` above), purely so the dual/solo
  // radio below can decide whether to render. `isSolo` itself is likewise
  // plain state, never an RHF field — same rationale as `durationMode`.
  const [selectedFlightType, setSelectedFlightType] = useState<FlightTypeDto>(flightFormDefaults(correctingFlight).flightType);
  const [isSolo, setIsSolo] = useState(correctingFlight?.isSolo ?? false);
  // Story 5.3 (AC 2): the mandatory motivo, only rendered/required in
  // correction mode — same "plain local state, not a schema field" pattern
  // as `durationMode` (the field only exists in one of the two modes).
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  // Story TD-3: the 3 picker fields, plain component state driven by
  // `SearchCombobox` instead of RHF-registered `<select>`s (same rationale
  // as `durationMode`/`reason` above) — initialized from the SAME defaults
  // `flightFormDefaults` used before the split (`pickerDefaults`).
  const initialPickerValues = pickerDefaults(aircraftOptions, correctingFlight);
  const [aircraftId, setAircraftId] = useState(initialPickerValues.aircraftId);
  const [personId, setPersonId] = useState(initialPickerValues.personId);
  const [instructorPersonId, setInstructorPersonId] = useState(initialPickerValues.instructorPersonId);
  // Story TD-2 (AC 5/6): idempotency-key lifecycle for the REGISTRATION POST
  // only (`/flights`, `endpoint: 'flight-register'`) — the correction POST
  // (`/flights/{id}/correct`, same form, `isCorrecting` branch below) is NOT
  // covered: it is already protected by `AccountMovement.reversalOfId`'s
  // unique constraint (see that route's doc-comment).
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: flightFormDefaults(correctingFlight),
  });

  const noAircraft = aircraftOptions.length === 0;
  const noPerson = personOptions.length === 0;
  const isCorrecting = correctingFlight !== null;

  // Story TD-3: the FORM's pickers are active-only (Dev Notes) — but a flight
  // under correction may reference an aircraft/person/instructor that has
  // SINCE been archived/deactivated. Injecting that one entry (if missing)
  // keeps "Correggi volo" showing the correct label instead of a blank
  // field, without loosening the picker's active-only domain rule for any
  // OTHER selection (the server remains the real guardian either way, AD-5).
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
      { id: '', label: labels.noInstructor },
      ...instructorOptions.map((instructor) => ({ id: instructor.id, label: personLabel(instructor) })),
    ];
    if (correctingFlight?.instructor && !base.some((option) => option.id === correctingFlight.instructor!.personId)) {
      base.splice(1, 0, { id: correctingFlight.instructor.personId, label: personLabel(correctingFlight.instructor) });
    }
    return base;
  }, [instructorOptions, correctingFlight, labels.noInstructor]);

  async function onSubmit(values: FlightFormValues): Promise<void> {
    setFormError(null);

    if (aircraftId.trim() === '' || personId.trim() === '') {
      setFormError(labels.requiredField);
      return;
    }

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

    // Story TD-2 (AC 6): only the registration path sends the key (see the
    // hook's doc-comment above) — the key survives a network failure (the
    // retry this protects) but is regenerated once ANY HTTP response
    // arrives.
    let response: Response;
    try {
      response = await fetch(isCorrecting ? `/api/v1/flights/${correctingFlight.id}/correct` : '/api/v1/flights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(isCorrecting ? {} : { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey }),
        },
        body: JSON.stringify({
          aircraftId,
          personId,
          instructorPersonId: instructorPersonId === '' ? undefined : instructorPersonId,
          flightDate: values.flightDate,
          flightType: values.flightType,
          // Story 9.4 (AC 1) — meaningful only on SCHOOL; the same body is
          // used for both registration and correction (correctFlight
          // re-validates/re-persists it exactly like every other field).
          isSolo,
          ...durationPayload,
          landings,
          notes,
          ...(isCorrecting ? { reason: trimmedReason } : {}),
        }),
      });
    } catch {
      setFormError(labels.errors.generic);
      return;
    }
    if (!isCorrecting) {
      regenerateIdempotencyKey();
    }

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
    reset(flightFormDefaults(null));
    // Story TD-3: the 3 picker fields reset alongside the RHF-managed ones
    // above — `SearchCombobox` is controlled, so setting these back to the
    // blank/first-active defaults is enough to re-sync its visible text (see
    // its own doc-comment on the external-value sync effect).
    const blankPickerValues = pickerDefaults(aircraftOptions, null);
    setAircraftId(blankPickerValues.aircraftId);
    setPersonId(blankPickerValues.personId);
    setInstructorPersonId(blankPickerValues.instructorPersonId);
    setDurationMode('minutes');
    setSelectedFlightType('TOURISM');
    setIsSolo(false);
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
          <SearchCombobox
            id="flight-aircraft"
            label={labels.aircraft}
            value={aircraftId}
            onChange={setAircraftId}
            fetchOptions={(q) => searchAircraft(q, { includeArchived: false })}
            initialOptions={aircraftComboOptions}
            placeholder={pickerLabels.placeholder}
            emptyText={pickerLabels.noResults}
            disabled={noAircraft}
          />
          {noAircraft ? <p className="mt-1 text-xs text-[#787774]">{labels.noAircraftAvailable}</p> : null}
        </div>

        <div>
          <SearchCombobox
            id="flight-person"
            label={labels.person}
            value={personId}
            onChange={setPersonId}
            fetchOptions={(q) => searchPeople(q, { includeArchived: false, profile: 'pilot-or-student' })}
            initialOptions={personComboOptions}
            placeholder={pickerLabels.placeholder}
            emptyText={pickerLabels.noResults}
            disabled={noPerson}
          />
          {noPerson ? <p className="mt-1 text-xs text-[#787774]">{labels.noPersonAvailable}</p> : null}
        </div>

        <div>
          <SearchCombobox
            id="flight-instructor"
            label={labels.instructor}
            value={instructorPersonId}
            onChange={setInstructorPersonId}
            fetchOptions={(q) => searchPeople(q, { includeArchived: false, profile: 'instructor' })}
            initialOptions={instructorComboOptions}
            placeholder={pickerLabels.placeholder}
            emptyText={pickerLabels.noResults}
          />
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
            {...register('flightType', {
              onChange: (event: { target: { value: string } }) => {
                const next = event.target.value as FlightTypeDto;
                setSelectedFlightType(next);
                // AC 1: isSolo is only meaningful on SCHOOL — leaving SCHOOL
                // resets it back to the dual default.
                if (next !== 'SCHOOL') setIsSolo(false);
              },
            })}
          >
            <option value="TOURISM">{labels.flightTypes.private}</option>
            <option value="SCHOOL">{labels.flightTypes.school}</option>
            <option value="AERIAL_WORK">{labels.flightTypes.other}</option>
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

      {selectedFlightType === 'SCHOOL' ? (
        <fieldset>
          <legend className="block text-sm font-medium text-[#2F3437]">{labels.soloMode}</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            <label htmlFor="flight-solo-dual" className="flex items-center gap-2 text-sm text-[#2F3437]">
              <input
                id="flight-solo-dual"
                type="radio"
                name="flight-solo-mode"
                value="dual"
                checked={!isSolo}
                onChange={() => setIsSolo(false)}
              />
              {labels.soloModes.dual}
            </label>
            <label htmlFor="flight-solo-solo" className="flex items-center gap-2 text-sm text-[#2F3437]">
              <input
                id="flight-solo-solo"
                type="radio"
                name="flight-solo-mode"
                value="solo"
                checked={isSolo}
                onChange={() => setIsSolo(true)}
              />
              {labels.soloModes.solo}
            </label>
          </div>
        </fieldset>
      ) : null}

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
