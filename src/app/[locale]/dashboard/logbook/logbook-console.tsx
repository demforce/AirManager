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
 * flights, filtered to period/tipo only (Contesto: no staff-only
 * `listAircraft`/`listPeople` picker to source aircraft/persona options
 * from) — `listFlights`'s own-access WHERE clause is the real guardian
 * either way (AD-5), this component only decides what to RENDER.
 *
 * PIC (story 11.2's `flightPicPerson`, story 12.8 AC 2): a non-SCHOOL or
 * SCHOOL-solo flight's PIC is its own `person`; a SCHOOL-dual flight's PIC is
 * the `instructor` — shown in its OWN column (`flight-pic-cell`), distinct
 * from the "pilota" column (which always shows the flight's `person`, with
 * the instructor as a secondary "Istruttore: …" line when present) — an addition over
 * the prototype's own 10 columns, needed to satisfy this exact assertion
 * (flights.spec.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { DateInput } from '@/components/ui/date-input';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { flightPicPerson } from '@/lib/flight-pic';
import { flightCardSubLine, flightRouteLabel, flightSheetSub } from '@/lib/mobile-logbook';
import { formatCents } from '@/lib/money';
import type { FlightListItemDto, FlightTypeDto } from '@/lib/schemas/flights';
import { formatDateOnly, formatMinutes, formatTimeOfDay } from '@/lib/time';
import { FlightEditor, type AircraftOption, type FlightEditorLabels, type FlightEditorTarget } from './flight-editor';

type PersonOption = { id: string; firstName: string; lastName: string };
/** The "person" (pilot/allievo) picker's own option shape (story 14.3, AC 2) — see `flight-editor.tsx`'s own `PilotStudentOption` doc-comment. */
type PilotStudentOption = PersonOption & { profiles: { pilot: boolean; student: boolean } };
/** The filter bar's own option — deliberately NOT `AircraftOption & …`: the filter never needs the editor's `status`/`statusReason` (story AOG-1a, AC 12), only the archived flag it already showed. */
type AircraftFilterOption = { id: string; registration: string; archived: boolean };

export type LogbookFilters = {
  dateFrom: string;
  dateTo: string;
  aircraftId: string;
  /** Deep-link-only (story 11.2's "Vedi tutti" from the scheda persona) — no visible filter control sets this anymore (story 13.5, AC 7); kept for URL round-tripping. */
  personId: string;
  /** Free-text pilot filter (story 13.5, AC 7) — replaces the old native `<select>` of every person, same idiom as `pilots-console.tsx`'s own name filter. */
  personQuery: string;
  flightType: '' | FlightTypeDto;
};

/**
 * Same debounce-before-navigating idiom as `pilots-console.tsx`/`fleet-console.tsx`,
 * plus the `cancel` this page needs (review 15.6 MINOR-1): here a navigation
 * REMOUNTS the console (`page.tsx`'s own `key`), so a timer still pending when
 * the "Filtri" panel opens would close that panel ~400ms later, under the
 * reader's thumb — the exact failure AD-4 calls unacceptable. The other
 * consoles have no panel and keep the plain form.
 */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): { run: (value: string) => void; cancel: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function cancel(): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  return {
    run: (value: string) => {
      cancel();
      timerRef.current = setTimeout(() => callback(value), delayMs);
    },
    cancel,
  };
}

export type LogbookConsoleLabels = {
  cardTitle: string;
  newEntry: string;
  empty: string;
  /** Story 13.5, AC 6 — single `ExportMenu` dropdown (pattern already used by fleet/pilots/billing), replacing the two separate export buttons. */
  exportMenu: { label: string; xlsLabel: string; pdfLabel: string };
  pagination: { prev: string; next: string };
  flightTypes: { private: string; school: string };
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
    /** Story 19.6 (R-19-d) — the sub-line of the Costo cell, the phone card's note and the sheet's Costo row on a no-charge flight. */
    noCharge: string;
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
    archivedSuffix: string;
    reset: string;
  };
  editor: FlightEditorLabels;
  /**
   * Story 15.6 — the phone face of the registry (card list, detail sheet,
   * "Filtri" panel). Only the words the desktop has NO equivalent for live
   * here: the sheet reuses `table.*` wherever the desktop already spells the
   * word out in full, and the abbreviated column heads ("Dec"/"Att") are the
   * ones it cannot borrow.
   */
  mobile: {
    openDetail: string;
    close: string;
    back: string;
    route: string;
    instructor: string;
    takeoffs: string;
    landings: string;
    times: string;
    /** Story 19.12b — «Istruttore: {name}», `{name}` filled client-side (`t.raw`): the instructor line under the pilot, on the desktop row and on the card. */
    instructorLine: string;
    filters: string;
    /** `{count}` filled client-side (`t.raw`) — the number of PANEL filters currently active. */
    filtersCount: string;
    filtersTitle: string;
    apply: string;
  };
  cancelModal: {
    title: string;
    /** Story 19.6 — `{person}` filled client-side (`t.raw`): what the deletion takes away, said before it happens. */
    warning: string;
    submit: string;
    close: string;
    conflictError: string;
    /** Story 19.6 — a 404: the flight was deleted in the meantime. */
    notFoundError: string;
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
  /** Story 19.9 — `requirements.force` (ADMIN-only); forwarded to `FlightEditor` as its own `canForce`. */
  canForce: boolean;
  items: FlightListItemDto[];
  /** TRUE totals over the whole filtered set (review fix 12.8, MAJOR) — `flights.service.ts#getFlightTotals`. Renders the table's own "Totali" row; NOT derived from `items` (the current page). */
  totals: LogbookTotals;
  page: number;
  totalPages: number;
  filters: LogbookFilters;
  /** Read-only (story 9.3 drill-down) — cleared only via the page-level "Rimuovi filtro istruttore" banner, never edited from this filter bar. */
  instructorPersonId: string;
  aircraftOptions: AircraftOption[];
  personOptions: PilotStudentOption[];
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
  return type === 'SCHOOL' ? labels.school : labels.private;
}

// The person column starts at 200px (was 150px, story 19.12b): its sub-line reads «Istruttore: ⟨nome⟩» instead of
// «CFI ⟨nome⟩», and 200px keeps the room for the name the old 150px left (17 characters of 11px mono).
const COLS = '92px 150px minmax(200px,1.5fr) 110px 130px 64px 55px 55px 100px minmax(130px,1.2fr) 150px';

export function LogbookConsole({
  canManage,
  canForce,
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
  const toast = useToast();
  const [filters, setFilters] = useState<LogbookFilters>(initialFilters);
  const [personQueryInput, setPersonQueryInput] = useState(initialFilters.personQuery);
  const [editorTarget, setEditorTarget] = useState<FlightEditorTarget | null>(null);
  const [cancellingFlight, setCancellingFlight] = useState<FlightListItemDto | null>(null);
  const [cancelFormError, setCancelFormError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  // --- phone-only state (story 15.6) ---------------------------------------
  // The row-detail sheet and its second step (the delete confirmation,
  // ratifica R-15.6-d), plus the draft of the "Filtri" panel. All of it dies with the
  // console at every navigation (`page.tsx`'s own `key`), which is exactly why
  // the panel applies ONCE instead of navigating per keystroke (AD-4).
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'none' | 'cancel'>('none');
  const [sheetCancelError, setSheetCancelError] = useState<string | null>(null);
  /** `null` while the panel is closed; the filter values being edited while it is open. */
  const [filterDraft, setFilterDraft] = useState<LogbookFilters | null>(null);
  const sheetPrimaryRef = useRef<HTMLButtonElement>(null);
  const sheetDismissRef = useRef<HTMLButtonElement>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('none');
    setSheetCancelError(null);
  }, []);

  /**
   * Review 15.2 F1: entering the second step removes the very button that was
   * pressed, and `document.activeElement` falls back to `<body>` — the dialog
   * context is lost for assistive technology even though the node survives.
   * The step lands on "Indietro", never on the destructive button (story 19.6:
   * the motivo field that used to take the focus is gone). Inert while no
   * sheet is open (both refs are null then), so `MobileSheet`'s own
   * focus-on-open baseline is untouched.
   */
  useEffect(() => {
    if (sheetStep === 'cancel') sheetDismissRef.current?.focus();
    else sheetPrimaryRef.current?.focus();
  }, [sheetStep]);

  /** Builds the query string from the 6 editable filters (dropping `instructorPersonId` — same as the legacy manager, Dev Notes). `personId` is deep-link-only (no filter-bar control sets it, AC 7) but still round-trips here so an incoming "Vedi tutti" scope survives an unrelated filter tweak. */
  function buildFilterQuery(next: LogbookFilters): Record<string, string> {
    const query: Record<string, string> = {};
    if (next.dateFrom) query['dateFrom'] = next.dateFrom;
    if (next.dateTo) query['dateTo'] = next.dateTo;
    if (canManage && next.aircraftId) query['aircraftId'] = next.aircraftId;
    if (canManage && next.personId) query['personId'] = next.personId;
    if (canManage && next.personQuery) query['personQuery'] = next.personQuery;
    if (next.flightType) query['flightType'] = next.flightType;
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

  const personQueryDebounce = useDebouncedCallback((value: string) => {
    handleFilterChange({ personQuery: value });
  }, 400);

  function handlePersonQueryChange(value: string): void {
    setPersonQueryInput(value);
    personQueryDebounce.run(value);
  }

  function handleReset(): void {
    const cleared: LogbookFilters = { dateFrom: '', dateTo: '', aircraftId: '', personId: '', personQuery: '', flightType: '' };
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
  // uses the SAME control as the tipo one, no typeahead) — the server
  // page already loads the full candidate list (`OPTIONS_PAGE_SIZE`). The
  // persona filter is now free-text (story 13.5, AC 7), no options list needed.
  const aircraftSelectOptions: { id: string; label: string }[] = [
    { id: '', label: labels.filters.allAircraft },
    ...aircraftFilterOptions.map((aircraft) => ({
      id: aircraft.id,
      label: aircraft.registration + (aircraft.archived ? labels.filters.archivedSuffix : ''),
    })),
  ];

  /** The card's mono sub-line and the desktop's own second line under the pilot share this: «Istruttore: ⟨nome⟩». */
  function instructorLabel(flight: FlightListItemDto): string | null {
    return flight.instructor ? labels.mobile.instructorLine.replace('{name}', personLabel(flight.instructor)) : null;
  }

  /**
   * Parity of the sheet with the desktop row (AC 2, lesson 15.5 F2): the 11
   * columns, what the row shows OUTSIDE a column (the no-charge sub-line of
   * the Costo cell) and what the DTO carries that the desktop table has no
   * room for (orari — ratifica R-15.6-b: the phone may show MORE, never
   * less). No deroga row: story 19.9 (A10) shows a derogated flight like any
   * other.
   */
  function sheetRows(flight: FlightListItemDto): BottomSheetRow[] {
    const pic = flightPicPerson(flight);
    const route = flightRouteLabel(flight.departureAirfield, flight.arrivalAirfield);
    const rows: BottomSheetRow[] = [
      { k: labels.table.date, v: formatDateOnly(flight.flightDate, moneyLocale) },
      { k: labels.mobile.route, v: route ?? labels.table.noValue },
      { k: labels.table.pilot, v: personLabel(flight.person) },
      { k: labels.mobile.instructor, v: flight.instructor ? personLabel(flight.instructor) : labels.table.noValue },
      { k: labels.table.pic, v: pic ? personLabel(pic) : labels.table.noValue },
      { k: labels.table.aircraft, v: flight.aircraft.registration },
      {
        k: labels.table.type,
        v: `${flightTypeLabel(flight.flightType, labels.flightTypes)}${flight.isSolo ? ` — ${labels.table.soloSuffix}` : ''}`,
      },
      { k: labels.table.hours, v: formatMinutes(flight.minutes) },
      {
        k: labels.mobile.times,
        v:
          flight.takeoffAt && flight.landingAt
            ? `${formatTimeOfDay(new Date(flight.takeoffAt), moneyLocale)} – ${formatTimeOfDay(new Date(flight.landingAt), moneyLocale)}`
            : labels.table.noValue,
      },
      { k: labels.mobile.takeoffs, v: flight.takeoffs },
      { k: labels.mobile.landings, v: flight.landings },
      {
        k: labels.table.amount,
        v: flight.noCharge
          ? `${formatCents(flight.breakdown.totalAmountCents, moneyLocale)} · ${labels.table.noCharge}`
          : formatCents(flight.breakdown.totalAmountCents, moneyLocale),
      },
    ];

    return rows;
  }

  /** A row's sheet always opens on its first step, never on a leftover one from the previous row. */
  function openSheet(id: string): void {
    setSheetStep('none');
    setSheetCancelError(null);
    setSheetId(id);
  }

  /**
   * How many of the filters the phone HIDES inside the panel are active — the
   * count on its trigger. A filter one cannot see is a filter one forgets;
   * persona is not counted because it is on the head, in plain sight (the
   * search box).
   */
  const panelActiveCount =
    (filters.dateFrom !== '' || filters.dateTo !== '' ? 1 : 0) + (canManage && filters.aircraftId !== '' ? 1 : 0) + (filters.flightType !== '' ? 1 : 0);

  /** Re-read from `items` on every render: after an edit the very same row comes back changed, and the sheet must not keep showing the stale copy it was opened with. */
  const sheetFlight = items.find((flight) => flight.id === sheetId) ?? null;

  /**
   * Opening the panel takes the pending search OVER (review 15.6 MINOR-1).
   * Cancelling that timer is what keeps the panel open (its navigation would
   * remount the console); carrying `personQueryInput` — the text as TYPED, not
   * the last applied one — into the draft is what keeps the typing: "Applica"
   * then sends search and panel filters in the SAME single navigation (AD-4).
   * Flushing instead of cancelling would be self-defeating: the flush IS the
   * navigation that closes the panel.
   */
  function openFilterPanel(): void {
    personQueryDebounce.cancel();
    setFilterDraft({ ...filters, personQuery: personQueryInput });
  }

  /** Dismissing (✕, scrim, Escape) drops the panel's own edits — never the typing that preceded it: the search re-arms and lands on its own, as it would have without the panel. */
  function dismissFilterPanel(): void {
    setFilterDraft(null);
    if (personQueryInput !== filters.personQuery) personQueryDebounce.run(personQueryInput);
  }

  /** ONE navigation on "Applica" (AD-4) — navigating per `onChange`, as the desktop head does, would remount the console and close the panel under the reader's thumb. */
  function applyFilterDraft(): void {
    if (filterDraft === null) return;
    const next = filterDraft;
    setFilterDraft(null);
    setFilters(next);
    navigate(next);
  }

  /**
   * The ONE network path of a deletion (story 15.6 AD-8, story 19.6): same
   * request, same error mapping, same irreversibility, whether the decision
   * was taken in the desktop `.mini-modal` or in the phone sheet. Returns the
   * message to show, or `null` on success — the CALLER decides where the
   * outcome is announced (a `role="status"` in the card head on desktop, a
   * toast on the phone, where that paragraph would be off-screen: ratifica
   * R-15.6-d).
   */
  async function deleteFlightRequest(id: string): Promise<string | null> {
    setCancelSubmitting(true);
    const response = await fetch(`/api/v1/flights/${id}`, { method: 'DELETE' });
    setCancelSubmitting(false);
    if (response.ok) return null;
    if (response.status === 404) return labels.cancelModal.notFoundError;
    return response.status === 409 ? labels.cancelModal.conflictError : labels.cancelModal.genericError;
  }

  async function submitCancel(): Promise<void> {
    if (!cancellingFlight) return;
    setCancelFormError(null);

    const error = await deleteFlightRequest(cancellingFlight.id);
    if (error !== null) {
      setCancelFormError(error);
      return;
    }

    setCancellingFlight(null);
    setCancelFeedback(labels.cancelModal.success);
    router.refresh();
  }

  /** The phone twin of `submitCancel`, on the sheet's second step. Same request, same mapping. */
  async function submitSheetCancel(id: string): Promise<void> {
    setSheetCancelError(null);

    const error = await deleteFlightRequest(id);
    if (error !== null) {
      setSheetCancelError(error);
      return;
    }

    closeSheet();
    toast.show(labels.cancelModal.success, 'ok');
    router.refresh();
  }

  return (
    <>
      <div className="card">
        {/* ONE head at every width (AD-2/AD-3): every control keeps its testid
            and its state. On a phone the five filters that ratifica R-15.6-e
            moves into the "Filtri" panel are hidden here (`.logbook-filter-
            inpanel`) and re-rendered there over a DRAFT, because the panel
            applies once instead of navigating per change (AD-4) — the only
            behavioural difference, and the reason those five cannot be the
            same elements. */}
        <div className="card-head logbook-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          {cancelFeedback ? (
            <p role="status" data-testid="flight-cancel-feedback" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
              {cancelFeedback}
            </p>
          ) : null}
          {/* The inline `display: flex` this pair used to carry moved into
              `.logbook-filter-range` (identical computed style above 640px,
              measured): an inline `display` cannot be overridden by a media
              query, and the phone head has to hide it. Same move `.registry-
              search` needed in 15.5. */}
          <div className="filter-date-range logbook-filter-range logbook-filter-inpanel" title={`${labels.filters.dateFrom} – ${labels.filters.dateTo}`}>
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
              className="input logbook-filter-inpanel"
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
          {/* Width moved out of the inline style into `.logbook-search` for the
              same reason as the date pair above: the phone head gives this box
              its own full-width row, and an inline `width` wins over a media
              query. Identical computed width above 640px, measured. */}
          {canManage ? (
            <div className="search logbook-search">
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
            className="input logbook-filter-inpanel"
            style={{ width: 'auto', minWidth: 110, fontSize: 12 }}
            value={filters.flightType}
            onChange={(event) => handleFilterChange({ flightType: event.target.value as LogbookFilters['flightType'] })}
            data-testid="flight-filter-type"
            aria-label={labels.filters.flightType}
          >
            <option value="">{labels.filters.allTypes}</option>
            <option value="TOURISM">{labels.flightTypes.private}</option>
            <option value="SCHOOL">{labels.flightTypes.school}</option>
          </select>
          {hasActiveFilter ? (
            <button type="button" className="btn logbook-filter-inpanel" onClick={handleReset} data-testid="flight-filter-reset">
              {labels.filters.reset}
            </button>
          ) : null}
          {/* Phone only (`display: none` above 640px): the door to the panel that
              holds periodo, velivolo and tipo, with the number of them currently
              active — a filter one cannot see is a filter one forgets. */}
          <button
            type="button"
            className="btn logbook-filters-trigger"
            onClick={openFilterPanel}
            data-testid="mobile-flight-filters-button"
          >
            {panelActiveCount === 0 ? labels.mobile.filters : labels.mobile.filtersCount.replace('{count}', String(panelActiveCount))}
          </button>
          <ExportMenu label={labels.exportMenu.label} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={pdfExportHref} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={exportHref} />
          {canManage ? (
            <button type="button" className="btn primary" onClick={() => setEditorTarget({ mode: 'new' })} data-testid="logbook-new-button">
              <Icon.plus /> {labels.newEntry}
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="card-body logbook-desktop-body" data-testid="flight-empty">
            {labels.empty}
          </p>
        ) : (
          <div className="logbook logbook-desktop-body">
            <div className="lb-row header" style={{ gridTemplateColumns: COLS }}>
              <div>{labels.table.date}</div>
              <div>{labels.table.route}</div>
              <div>{labels.table.pilot}</div>
              <div>{labels.table.aircraft}</div>
              <div>{labels.table.type}</div>
              <div>{labels.table.hours}</div>
              {/* Story 19.12b: the abbreviated heads stay (a 55px column) and carry the full word for assistive tech and as a tooltip. */}
              <div title={labels.mobile.takeoffs}>
                <span aria-hidden="true">{labels.table.takeoffs}</span>
                <span className="sr-only">{labels.mobile.takeoffs}</span>
              </div>
              <div title={labels.mobile.landings}>
                <span aria-hidden="true">{labels.table.landings}</span>
                <span className="sr-only">{labels.mobile.landings}</span>
              </div>
              <div>{labels.table.amount}</div>
              <div>{labels.table.pic}</div>
              <div>{labels.table.actions}</div>
            </div>
            {items.map((flight) => {
              const pic = flightPicPerson(flight);
              const typeTone: BadgeTone = flight.flightType === 'SCHOOL' ? 'info' : '';
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
                      <div className="student-sub mono">{instructorLabel(flight)}</div>
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
                  <div>
                    <div className="mono num" style={{ fontWeight: 600 }}>
                      {formatCents(flight.breakdown.totalAmountCents, moneyLocale)}
                    </div>
                    {/* Story 19.6 (D-10): a bare "0,00 €" would read as an error. */}
                    {flight.noCharge ? (
                      <div className="student-sub" data-testid="flight-no-charge">
                        {labels.table.noCharge}
                      </div>
                    ) : null}
                  </div>
                  <div data-testid="flight-pic-cell">{pic ? personLabel(pic) : labels.table.noValue}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* Every flight can be deleted or edited (story 19.6). */}
                    {canManage ? (
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

        {/* --- the phone face of this card (story 15.6, R3/R4) ---------------
            Same card, same head, same pagination: only the eleven-column table
            is swapped for one card per flight (template 289-296), whose two
            decisions live in the sheet (R-15.6-c). The "Totali" row is NOT repeated here: the KPI strip above the card
            already shows the same four numbers from the same `totals` object
            (ratifica R-15.6-i), and the e2e measures that they coincide. */}
        <div className="logbook-mobile">
          <div data-testid="mobile-flights-list">
            {items.length === 0 ? (
              <p className="mobile-card-empty" data-testid="mobile-flights-empty">
                {labels.empty}
              </p>
            ) : (
              items.map((flight) => {
                const pilotName = personLabel(flight.person);
                const dateLabel = formatDateOnly(flight.flightDate, moneyLocale);
                return (
                  <button
                    key={flight.id}
                    type="button"
                    className="mobile-row mobile-row-flight"
                    aria-label={`${labels.mobile.openDetail}: ${flight.aircraft.registration} · ${dateLabel} · ${pilotName}`}
                    onClick={() => openSheet(flight.id)}
                    data-testid="flight-row-mobile"
                  >
                    <span className="mobile-row-main">
                      <span className="mobile-row-title">
                        <span className="mobile-row-tail">{flight.aircraft.registration}</span>
                        <span className="mobile-row-name">{pilotName}</span>
                      </span>
                      <span className="mobile-row-sub">
                        {flightCardSubLine({
                          date: dateLabel,
                          route: flightRouteLabel(flight.departureAirfield, flight.arrivalAirfield),
                          typeLabel: flightTypeLabel(flight.flightType, labels.flightTypes),
                          instructorLabel: instructorLabel(flight),
                        })}
                      </span>
                    </span>
                    {/* The template's own right column: duration over amount — over
                        the no-charge wording instead on a no-charge flight (story
                        19.6, D-10: a bare "0,00 €" would read as an error). */}
                    <span className="mobile-row-side">
                      <span className="mobile-row-amount">{formatMinutes(flight.minutes)}</span>
                      {flight.noCharge ? (
                        <span className="mobile-row-note" data-testid="flight-no-charge-mobile">
                          {labels.table.noCharge}
                        </span>
                      ) : (
                        <span className="mobile-row-note">{formatCents(flight.breakdown.totalAmountCents, moneyLocale)}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {totalPages > 1 ? (
          <div className="card-body registry-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
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
          canForce={canForce}
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
            <p data-testid="flight-cancel-warning" style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              {labels.cancelModal.warning.replace('{person}', personLabel(cancellingFlight.person))}
            </p>
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
                  setCancelFormError(null);
                }}
              >
                {labels.cancelModal.close}
              </button>
              {/* Destructive-styled like the sheet's twin: the deletion cannot be undone. */}
              <button
                type="button"
                className="btn mini bad mini-modal-danger"
                disabled={cancelSubmitting}
                onClick={() => void submitCancel()}
                data-testid="flight-cancel-confirm"
              >
                {labels.cancelModal.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* The "Filtri" panel (ratifica R-15.6-e, AD-4). Rendered only while open,
          and reachable only from a trigger that is `display: none` above 640px,
          so nothing of it — not even its ~101 `<option>`s — exists in the
          desktop DOM. It reuses `SlideOver`'s full-screen mobile mode (15.2):
          fixed header with the X, primary action anchored in `.so-foot` at 44px.
          The controls are the desktop ones RE-RENDERED over a draft, not moved:
          the desktop head navigates on every change, this panel navigates once,
          and a single element cannot do both. */}
      {filterDraft !== null ? (
        <SlideOver
          open
          title={labels.mobile.filtersTitle}
          // No subtitle on purpose: `.so-sub` is a `--ink-4` line (3.66:1 on
          // `--panel` in the light theme, a PRE-EXISTING shortfall of the
          // desktop primitive this story does not own), and the panel's title
          // already says everything a second line would.
          onClose={dismissFilterPanel}
          closeLabel={labels.mobile.close}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilterDraft(null);
                  handleReset();
                }}
                data-testid="flight-filter-reset-mobile"
              >
                {labels.filters.reset}
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn primary" onClick={applyFilterDraft} data-testid="mobile-flight-filters-apply">
                {labels.mobile.apply}
              </button>
            </>
          }
        >
          <div className="logbook-filter-panel">
            <div className="fld">
              <label className="fld-label" htmlFor="flight-filter-date-from-mobile">
                {labels.filters.dateFrom}
              </label>
              <DateInput
                id="flight-filter-date-from-mobile"
                value={filterDraft.dateFrom}
                onChange={(event) => setFilterDraft({ ...filterDraft, dateFrom: event.target.value })}
                data-testid="flight-filter-date-from-mobile"
              />
            </div>
            <div className="fld">
              <label className="fld-label" htmlFor="flight-filter-date-to-mobile">
                {labels.filters.dateTo}
              </label>
              <DateInput
                id="flight-filter-date-to-mobile"
                value={filterDraft.dateTo}
                onChange={(event) => setFilterDraft({ ...filterDraft, dateTo: event.target.value })}
                data-testid="flight-filter-date-to-mobile"
              />
            </div>
            {canManage ? (
              <div className="fld">
                <label className="fld-label" htmlFor="flight-filter-aircraft-mobile">
                  {labels.filters.aircraft}
                </label>
                <select
                  id="flight-filter-aircraft-mobile"
                  className="input"
                  value={filterDraft.aircraftId}
                  onChange={(event) => setFilterDraft({ ...filterDraft, aircraftId: event.target.value })}
                  data-testid="flight-filter-aircraft-mobile"
                >
                  {aircraftSelectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="fld">
              <label className="fld-label" htmlFor="flight-filter-type-mobile">
                {labels.filters.flightType}
              </label>
              <select
                id="flight-filter-type-mobile"
                className="input"
                value={filterDraft.flightType}
                onChange={(event) => setFilterDraft({ ...filterDraft, flightType: event.target.value as LogbookFilters['flightType'] })}
                data-testid="flight-filter-type-mobile"
              >
                <option value="">{labels.filters.allTypes}</option>
                <option value="TOURISM">{labels.flightTypes.private}</option>
                <option value="SCHOOL">{labels.flightTypes.school}</option>
              </select>
            </div>
          </div>
        </SlideOver>
      ) : null}

      {/* The row-detail sheet (AD-7: rendered conditionally, so
          `mobile-flight-sheet` is ONE node). Its two actions are the desktop
          row's, under the SAME gate (`canManage`); "Modifica"
          CLOSES the sheet before opening the panel rather than stacking a z-50
          panel on a z-40 sheet (AD-9), and passes through the SAME
          `editorTarget` — the `key` that wipes a stale requirements body stays
          the only one (review 14.4 F1). */}
      {sheetFlight ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-flight-sheet"
          sub={flightSheetSub({
            date: formatDateOnly(sheetFlight.flightDate, moneyLocale),
            registration: sheetFlight.aircraft.registration,
            typeLabel: flightTypeLabel(sheetFlight.flightType, labels.flightTypes),
          })}
          // Never the "—" placeholder: a pre-11.1 flight has no route, and a
          // placeholder here would land in the dialog's accessible name
          // (review 15.5 F1). The pilot always exists, so the fallback is real.
          title={flightRouteLabel(sheetFlight.departureAirfield, sheetFlight.arrivalAirfield) ?? personLabel(sheetFlight.person)}
          rows={sheetRows(sheetFlight)}
          closeLabel={labels.mobile.close}
          actions={
            canManage ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  ref={sheetPrimaryRef}
                  onClick={() => {
                    const flight = sheetFlight;
                    closeSheet();
                    setEditorTarget({ mode: 'correct', flight });
                  }}
                  data-testid="flight-correct-action-mobile"
                >
                  {labels.table.correctAction}
                </button>
                {/* Second, and destructive-styled: the deletion is irreversible
                    (the flight goes together with its charge, story 19.6), so it
                    is never the button a thumb lands on by default. */}
                <button
                  type="button"
                  className="btn mini bad"
                  onClick={() => {
                    setSheetCancelError(null);
                    setSheetStep('cancel');
                  }}
                  data-testid="flight-cancel-action-mobile"
                >
                  {labels.table.cancelAction}
                </button>
              </>
            ) : undefined
          }
          secondStep={
            sheetStep === 'cancel' ? (
              <div className="bottom-sheet-step">
                <p className="fld-hint">{labels.cancelModal.title}</p>
                <p className="fld-hint" data-testid="flight-cancel-warning-mobile">
                  {labels.cancelModal.warning.replace('{person}', personLabel(sheetFlight.person))}
                </p>
                {sheetCancelError ? (
                  <p role="alert" className="fld-error" data-testid="flight-cancel-error-mobile">
                    {sheetCancelError}
                  </p>
                ) : null}
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" ref={sheetDismissRef} onClick={() => setSheetStep('none')} data-testid="flight-cancel-dismiss-mobile">
                    {labels.mobile.back}
                  </button>
                  <button
                    type="button"
                    className="btn mini bad"
                    disabled={cancelSubmitting}
                    onClick={() => void submitSheetCancel(sheetFlight.id)}
                    data-testid="flight-cancel-confirm-mobile"
                  >
                    {labels.cancelModal.submit}
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </>
  );
}
