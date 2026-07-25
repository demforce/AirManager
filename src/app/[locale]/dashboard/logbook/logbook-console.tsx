'use client';

/**
 * Logbook table console (story 12.8, AC 2/4/5) — port of
 * `docs/design-reference/airops/src/LogbookView.jsx` onto real,
 * paginated/filtered data (replaces the legacy `flights-manager.tsx`), same
 * shell idiom as `fleet-console.tsx`/`pilots-console.tsx` (`.card` +
 * `.card-head` filters/export/new-button, `.logbook`/`.lb-row` table).
 *
 * `canManage` (`flights.manage`, staff/admin) sees the full manager: velivolo/
 * persona filters, "Nuova voce", per-row Annulla/Modifica. Everyone else
 * (`self.read`, own-access) sees a READ-ONLY registry of just their own
 * flights, filtered to period/tipo/stato only (Contesto: no staff-only
 * `listAircraft`/`listPeople` picker to source aircraft/persona options
 * from) — `listFlights`'s own-access WHERE clause is the real guardian
 * either way (AD-5), this component only decides what to RENDER.
 *
 * PIC (story 11.2's `flightPicPerson`, story 12.8 AC 2): a non-SCHOOL or
 * SCHOOL-solo flight's PIC is its own `person`; a SCHOOL-dual flight's PIC is
 * the `instructor` — shown in its OWN column (`flight-pic-cell`), distinct
 * from the "pilota" column (which always shows the flight's `person`, with
 * the instructor as a secondary "CFI" line when present) — an addition over
 * the prototype's own 10 columns, needed to satisfy this exact assertion
 * (flights.spec.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { DateInput } from '@/components/ui/date-input';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { flightPicPerson } from '@/lib/flight-pic';
import { formatCents } from '@/lib/money';
import type { FlightListItemDto, FlightStatusDto, FlightTypeDto } from '@/lib/schemas/flights';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { FlightEditor, type FlightEditorLabels, type FlightEditorTarget } from './flight-editor';

type AircraftOption = { id: string; registration: string };
type PersonOption = { id: string; firstName: string; lastName: string };
type AircraftFilterOption = AircraftOption & { archived: boolean };

export type LogbookFilters = {
  dateFrom: string;
  dateTo: string;
  aircraftId: string;
  /** Deep-link-only (story 11.2's "Vedi tutti" from the scheda persona) — no visible filter control sets this anymore (story 13.5, AC 7); kept for URL round-tripping. */
  personId: string;
  /** Free-text pilot filter (story 13.5, AC 7) — replaces the old native `<select>` of every person, same idiom as `pilots-console.tsx`'s own name filter. */
  personQuery: string;
  flightType: '' | FlightTypeDto;
  status: '' | FlightStatusDto;
};

/** Same debounce-before-navigating idiom as `pilots-console.tsx`/`fleet-console.tsx`. */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): (value: string) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callback(value), delayMs);
  };
}

export type LogbookConsoleLabels = {
  cardTitle: string;
  newEntry: string;
  empty: string;
  /** Story 13.5, AC 6 — single `ExportMenu` dropdown (pattern already used by fleet/pilots/billing), replacing the two separate export buttons. */
  exportMenu: { label: string; xlsLabel: string; pdfLabel: string };
  pagination: { prev: string; next: string };
  flightTypes: { private: string; school: string; other: string };
  table: {
    date: string;
    route: string;
    pilot: string;
    aircraft: string;
    type: string;
    hours: string;
    takeoffs: string;
    landings: string;
    amount: string;
    pic: string;
    actions: string;
    totals: string;
    soloSuffix: string;
    noInstructor: string;
    noValue: string;
    statusCancelled: string;
    cancelledDetail: string;
    correctionOf: string;
    correctedBy: string;
    cancelAction: string;
    correctAction: string;
  };
  filters: {
    dateFrom: string;
    dateTo: string;
    aircraft: string;
    allAircraft: string;
    person: string;
    personSearchPlaceholder: string;
    flightType: string;
    allTypes: string;
    status: string;
    allStatuses: string;
    statusOptions: { registered: string; cancelled: string };
    archivedSuffix: string;
    reset: string;
  };
  editor: FlightEditorLabels;
  cancelModal: {
    title: string;
    reason: string;
    requiredReason: string;
    submit: string;
    close: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
};

export type LogbookTotals = {
  count: number;
  minutes: number;
  takeoffs: number;
  landings: number;
  revenueCents: number;
};

export type LogbookConsoleProps = {
  canManage: boolean;
  items: FlightListItemDto[];
  /** TRUE totals over the whole filtered set (review fix 12.8, MAJOR) — `flights.service.ts#getFlightTotals`, REGISTERED-only. Renders the table's own "Totali" row; NOT derived from `items` (the current page). */
  totals: LogbookTotals;
  page: number;
  totalPages: number;
  filters: LogbookFilters;
  /** Read-only (story 9.3 drill-down) — cleared only via the page-level "Rimuovi filtro istruttore" banner, never edited from this filter bar. */
  instructorPersonId: string;
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  aircraftFilterOptions: AircraftFilterOption[];
  airfieldName: string;
  moneyLocale: 'it' | 'en';
  locale: 'it' | 'en';
  exportHref: string;
  pdfExportHref: string;
  labels: LogbookConsoleLabels;
};

function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

function flightTypeLabel(type: FlightTypeDto, labels: LogbookConsoleLabels['flightTypes']): string {
  if (type === 'TOURISM') return labels.private;
  if (type === 'SCHOOL') return labels.school;
  return labels.other;
}

const COLS = '92px 150px minmax(150px,1.5fr) 110px 130px 64px 55px 55px 100px minmax(130px,1.2fr) 150px';

export function LogbookConsole({
  canManage,
  items,
  totals,
  page,
  totalPages,
  filters: initialFilters,
  instructorPersonId,
  aircraftOptions,
  personOptions,
  instructorOptions,
  aircraftFilterOptions,
  airfieldName,
  moneyLocale,
  locale,
  exportHref,
  pdfExportHref,
  labels,
}: LogbookConsoleProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<LogbookFilters>(initialFilters);
  const [personQueryInput, setPersonQueryInput] = useState(initialFilters.personQuery);
  const [editorTarget, setEditorTarget] = useState<FlightEditorTarget | null>(null);
  const [cancellingFlight, setCancellingFlight] = useState<FlightListItemDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState(false);
  const [cancelFormError, setCancelFormError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  /** Builds the query string from the 7 editable filters (dropping `instructorPersonId` — same as the legacy manager, Dev Notes). `personId` is deep-link-only (no filter-bar control sets it, AC 7) but still round-trips here so an incoming "Vedi tutti" scope survives an unrelated filter tweak. */
  function buildFilterQuery(next: LogbookFilters): Record<string, string> {
    const query: Record<string, string> = {};
    if (next.dateFrom) query['dateFrom'] = next.dateFrom;
    if (next.dateTo) query['dateTo'] = next.dateTo;
    if (canManage && next.aircraftId) query['aircraftId'] = next.aircraftId;
    if (canManage && next.personId) query['personId'] = next.personId;
    if (canManage && next.personQuery) query['personQuery'] = next.personQuery;
    if (next.flightType) query['flightType'] = next.flightType;
    if (next.status) query['status'] = next.status;
    return query;
  }

  function navigate(next: LogbookFilters): void {
    const params = new URLSearchParams(buildFilterQuery(next));
    const search = params.toString();
    router.push(`/dashboard/logbook${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<LogbookFilters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    navigate(next);
  }

  const debouncedPersonQuery = useDebouncedCallback((value: string) => {
    handleFilterChange({ personQuery: value });
  }, 400);

  function handlePersonQueryChange(value: string): void {
    setPersonQueryInput(value);
    debouncedPersonQuery(value);
  }

  function handleReset(): void {
    const cleared: LogbookFilters = { dateFrom: '', dateTo: '', aircraftId: '', personId: '', personQuery: '', flightType: '', status: '' };
    setFilters(cleared);
    setPersonQueryInput('');
    navigate(cleared);
  }

  function pageHref(targetPage: number) {
    const query: Record<string, string | number> = { page: targetPage, ...buildFilterQuery(filters) };
    if (instructorPersonId) query['instructorPersonId'] = instructorPersonId;
    return { pathname: '/dashboard/logbook' as const, query };
  }

  const hasActiveFilter = Object.values(filters).some((value) => value !== '');

  // Plain-select option list (user decision 2026-07-21: the velivolo filter
  // uses the SAME control as the tipo/stato ones, no typeahead) — the server
  // page already loads the full candidate list (`OPTIONS_PAGE_SIZE`). The
  // persona filter is now free-text (story 13.5, AC 7), no options list needed.
  const aircraftSelectOptions: { id: string; label: string }[] = [
    { id: '', label: labels.filters.allAircraft },
    ...aircraftFilterOptions.map((aircraft) => ({
      id: aircraft.id,
      label: aircraft.registration + (aircraft.archived ? labels.filters.archivedSuffix : ''),
    })),
  ];

  function statusBadgeAndLineage(flight: FlightListItemDto) {
    if (flight.status !== 'CANCELLED' && !flight.correctionOfId && !flight.correctedByFlightId) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {flight.status === 'CANCELLED' ? (
          <>
            {/* `Badge` (`@/components/ui/badge`) never forwards unknown props onto its `<span>` — a `data-testid` passed directly to it is silently dropped. A thin wrapper carries it instead, without touching the shared primitive (surgical). */}
            <span data-testid="flight-status-badge">
              <Badge tone="bad" dot>
                {labels.table.statusCancelled}
              </Badge>
            </span>
            {flight.cancelledAt && flight.cancelReason ? (
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }} title={flight.cancelReason}>
                {labels.table.cancelledDetail.replace('{date}', formatDateOnly(flight.cancelledAt.slice(0, 10), moneyLocale)).replace('{reason}', flight.cancelReason)}
              </span>
            ) : null}
          </>
        ) : null}
        {flight.correctionOfId ? <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{labels.table.correctionOf}</span> : null}
        {flight.correctedByFlightId ? <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{labels.table.correctedBy}</span> : null}
      </div>
    );
  }

  async function submitCancel(): Promise<void> {
    if (!cancellingFlight) return;
    const trimmed = cancelReason.trim();
    if (trimmed === '') {
      setCancelReasonError(true);
      return;
    }
    setCancelReasonError(false);
    setCancelFormError(null);
    setCancelSubmitting(true);

    const response = await fetch(`/api/v1/flights/${cancellingFlight.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: trimmed }),
    });
    setCancelSubmitting(false);

    if (!response.ok) {
      setCancelFormError(response.status === 409 ? labels.cancelModal.conflictError : labels.cancelModal.genericError);
      return;
    }

    setCancellingFlight(null);
    setCancelReason('');
    setCancelFeedback(labels.cancelModal.success);
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          {cancelFeedback ? (
            <p role="status" data-testid="flight-cancel-feedback" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
              {cancelFeedback}
            </p>
          ) : null}
          <div className="filter-date-range" style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={`${labels.filters.dateFrom} – ${labels.filters.dateTo}`}>
            <DateInput
              inline
              style={{ width: 'auto', fontSize: 12 }}
              value={filters.dateFrom}
              onChange={(event) => handleFilterChange({ dateFrom: event.target.value })}
              data-testid="flight-filter-date-from"
              aria-label={labels.filters.dateFrom}
            />
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>–</span>
            <DateInput
              inline
              style={{ width: 'auto', fontSize: 12 }}
              value={filters.dateTo}
              onChange={(event) => handleFilterChange({ dateTo: event.target.value })}
              data-testid="flight-filter-date-to"
              aria-label={labels.filters.dateTo}
            />
          </div>
          {canManage ? (
            <select
              className="input"
              style={{ width: 'auto', minWidth: 130, fontSize: 12 }}
              value={filters.aircraftId}
              onChange={(event) => handleFilterChange({ aircraftId: event.target.value })}
              data-testid="flight-filter-aircraft"
              aria-label={labels.filters.aircraft}
            >
              {aircraftSelectOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
          {canManage ? (
            <div className="search" style={{ width: 190 }}>
              <Icon.search />
              <input
                className="bare-input"
                placeholder={labels.filters.personSearchPlaceholder}
                aria-label={labels.filters.person}
                value={personQueryInput}
                onChange={(event) => handlePersonQueryChange(event.target.value)}
                data-testid="flight-filter-person"
              />
            </div>
          ) : null}
          <select
            className="input"
            style={{ width: 'auto', minWidth: 110, fontSize: 12 }}
            value={filters.flightType}
            onChange={(event) => handleFilterChange({ flightType: event.target.value as LogbookFilters['flightType'] })}
            data-testid="flight-filter-type"
            aria-label={labels.filters.flightType}
          >
            <option value="">{labels.filters.allTypes}</option>
            <option value="TOURISM">{labels.flightTypes.private}</option>
            <option value="SCHOOL">{labels.flightTypes.school}</option>
            <option value="AERIAL_WORK">{labels.flightTypes.other}</option>
          </select>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 110, fontSize: 12 }}
            value={filters.status}
            onChange={(event) => handleFilterChange({ status: event.target.value as LogbookFilters['status'] })}
            data-testid="flight-filter-status"
            aria-label={labels.filters.status}
          >
            <option value="">{labels.filters.allStatuses}</option>
            <option value="REGISTERED">{labels.filters.statusOptions.registered}</option>
            <option value="CANCELLED">{labels.filters.statusOptions.cancelled}</option>
          </select>
          {hasActiveFilter ? (
            <button type="button" className="btn" onClick={handleReset} data-testid="flight-filter-reset">
              {labels.filters.reset}
            </button>
          ) : null}
          <ExportMenu label={labels.exportMenu.label} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={pdfExportHref} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={exportHref} />
          {canManage ? (
            <button type="button" className="btn primary" onClick={() => setEditorTarget({ mode: 'new' })} data-testid="logbook-new-button">
              <Icon.plus /> {labels.newEntry}
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="card-body" data-testid="flight-empty">
            {labels.empty}
          </p>
        ) : (
          <div className="logbook">
            <div className="lb-row header" style={{ gridTemplateColumns: COLS }}>
              <div>{labels.table.date}</div>
              <div>{labels.table.route}</div>
              <div>{labels.table.pilot}</div>
              <div>{labels.table.aircraft}</div>
              <div>{labels.table.type}</div>
              <div>{labels.table.hours}</div>
              <div>{labels.table.takeoffs}</div>
              <div>{labels.table.landings}</div>
              <div>{labels.table.amount}</div>
              <div>{labels.table.pic}</div>
              <div>{labels.table.actions}</div>
            </div>
            {items.map((flight) => {
              const pic = flightPicPerson(flight);
              const lineage = statusBadgeAndLineage(flight);
              const typeTone: BadgeTone = flight.flightType === 'SCHOOL' ? 'info' : flight.flightType === 'AERIAL_WORK' ? 'warn' : '';
              return (
                <div key={flight.id} className="lb-row" data-testid="flight-row" style={{ gridTemplateColumns: COLS }}>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {formatDateOnly(flight.flightDate, moneyLocale)}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                    {flight.departureAirfield && flight.arrivalAirfield ? `${flight.departureAirfield} → ${flight.arrivalAirfield}` : labels.table.noValue}
                  </div>
                  <div>
                    <div>{personLabel(flight.person)}</div>
                    {flight.instructor ? (
                      <div className="student-sub mono">CFI {personLabel(flight.instructor)}</div>
                    ) : null}
                  </div>
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {flight.aircraft.registration}
                  </div>
                  <div>
                    <Badge tone={typeTone}>
                      {flightTypeLabel(flight.flightType, labels.flightTypes)}
                      {flight.isSolo ? ` — ${labels.table.soloSuffix}` : ''}
                    </Badge>
                  </div>
                  <div className="mono num">{formatMinutes(flight.minutes)}</div>
                  <div className="mono num" data-testid="flight-takeoffs-cell">
                    {flight.takeoffs}
                  </div>
                  <div className="mono num" data-testid="flight-landings-cell">
                    {flight.landings}
                  </div>
                  <div className="mono num" style={{ fontWeight: 600 }}>
                    {formatCents(flight.breakdown.totalAmountCents, moneyLocale)}
                  </div>
                  <div data-testid="flight-pic-cell">{pic ? personLabel(pic) : labels.table.noValue}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* Actions (REGISTERED only) and lineage (correction/cancellation
                        notes) are NOT mutually exclusive — a REGISTERED flight that is
                        ITSELF a correction of an earlier one still needs both (legacy
                        `FlightStatusCell`'s own doc-comment: lineage chips render
                        "REGARDLESS of this row's own status"). */}
                    {canManage && flight.status === 'REGISTERED' ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn mini"
                          data-testid="flight-cancel-action"
                          onClick={() => {
                            setCancelFeedback(null);
                            setCancellingFlight(flight);
                          }}
                        >
                          {labels.table.cancelAction}
                        </button>
                        <button
                          type="button"
                          className="btn mini"
                          data-testid="flight-correct-action"
                          onClick={() => setEditorTarget({ mode: 'correct', flight })}
                        >
                          {labels.table.correctAction}
                        </button>
                      </div>
                    ) : null}
                    {lineage}
                  </div>
                </div>
              );
            })}
            <div className="lb-row total" style={{ gridTemplateColumns: COLS }} data-testid="logbook-totals-row">
              <div />
              <div />
              <div />
              <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {labels.table.totals}
              </div>
              <div />
              <div className="mono num" style={{ fontWeight: 600 }}>
                {formatMinutes(totals.minutes)}
              </div>
              <div className="mono num" style={{ fontWeight: 600 }}>
                {totals.takeoffs}
              </div>
              <div className="mono num" style={{ fontWeight: 600 }}>
                {totals.landings}
              </div>
              <div className="mono num" style={{ fontWeight: 600 }}>
                {formatCents(totals.revenueCents, moneyLocale)}
              </div>
              <div />
              <div />
            </div>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              data-testid="flight-page-prev"
              className="btn"
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="flight-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              data-testid="flight-page-next"
              className="btn"
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <FlightEditor
          key={editorTarget === null ? 'closed' : editorTarget.mode === 'new' ? 'new' : `correct-${editorTarget.flight.id}`}
          target={editorTarget}
          onClose={() => setEditorTarget(null)}
          onMutated={() => router.refresh()}
          aircraftOptions={aircraftOptions}
          personOptions={personOptions}
          instructorOptions={instructorOptions}
          airfieldName={airfieldName}
          moneyLocale={moneyLocale}
          labels={labels.editor}
        />
      ) : null}

      {canManage && cancellingFlight ? (
        <div className="mini-modal">
          <div className="mini-modal-card" data-testid="flight-cancel-panel">
            <div className="so-title" style={{ fontSize: 16 }}>
              {labels.cancelModal.title}
            </div>
            <div className="so-sub">
              {cancellingFlight.aircraft.registration} — {formatDateOnly(cancellingFlight.flightDate, moneyLocale)} —{' '}
              {formatCents(cancellingFlight.breakdown.totalAmountCents, moneyLocale)}
            </div>
            <label htmlFor="flight-cancel-reason" className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.cancelModal.reason}
            </label>
            <textarea
              id="flight-cancel-reason"
              className="input"
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              aria-invalid={cancelReasonError}
              maxLength={500}
              data-testid="flight-cancel-reason"
            />
            {cancelReasonError ? (
              <p style={{ color: 'var(--bad)', fontSize: 12 }}>{labels.cancelModal.requiredReason}</p>
            ) : null}
            {cancelFormError ? (
              <p role="alert" data-testid="flight-cancel-error" style={{ color: 'var(--bad)', fontSize: 12.5 }}>
                {cancelFormError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCancellingFlight(null);
                  setCancelReason('');
                  setCancelReasonError(false);
                  setCancelFormError(null);
                }}
              >
                {labels.cancelModal.close}
              </button>
              <button type="button" className="btn primary" disabled={cancelSubmitting} onClick={() => void submitCancel()} data-testid="flight-cancel-confirm">
                {labels.cancelModal.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
