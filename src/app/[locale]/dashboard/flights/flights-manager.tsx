'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ExportButton } from '@/components/export-button';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { buildExportHref, buildPdfExportHref } from '@/lib/export-href';
import { useRouter } from '@/i18n/navigation';
import { flightPicPerson } from '@/lib/flight-pic';
import { appendFlightsPage, groupFlightsByDay, hasActiveFlightFilter, insertFlightSorted } from '@/lib/flight-registry';
import { formatCents } from '@/lib/money';
import {
  flightTypeSchema,
  type FlightListItemDto,
  type FlightStatusDto,
  type FlightTypeDto,
  type RegisterFlightResponseDto,
} from '@/lib/schemas/flights';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { parseTimeShorthand } from '@/lib/time-input';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import { Button } from '@/components/ui/button';
import { Input, inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';
import { Dialog } from '@/components/ui/dialog';
import { Menu } from '@/components/ui/menu';
import { FlightDetailSheet } from './flight-detail-sheet';

/** The registry's own page size (story 5.4, NFR-6; unchanged by story 12.4) — mirrors `page.tsx`'s `FLIGHTS_PAGE_SIZE`, kept as a literal here since that file is server-only and cannot be imported into this client component. */
const FLIGHTS_PAGE_SIZE = 20;

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
    /** Story 11.1 (AC 1/2) — departure/arrival airport text fields, defaulted to the airfield's own name in registration mode. */
    departure: string;
    arrival: string;
    takeoffTime: string;
    landingTime: string;
    /** Story 11.1 (AC 2) — the read-only, live-computed `landing - takeoff` duration. */
    computedDuration: string;
    takeoffs: string;
    hourMeterStart: string;
    hourMeterEnd: string;
    landings: string;
    notes: string;
    submit: string;
    requiredField: string;
    invalidHourMeter: string;
    errors: {
      HOUR_METER_INVALID: string;
      FLIGHT_TIMES_INVALID: string;
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
      /** Story 11.2 (AC 1) — `partenza → arrivo`; `noValue` on a historical (pre-11.1) flight without logbook fields. */
      route: string;
      /** Story 11.2 (AC 1) — `HH:MM–HH:MM` (decollo–atterraggio, Europe/Rome); same `noValue` fallback as `route`. */
      times: string;
      aircraft: string;
      person: string;
      instructor: string;
      noInstructor: string;
      type: string;
      /** Story 9.4 (AC 1) — suffix appended to the type label when `flight.isSolo` ("Scuola — solista" / "School — solo"). */
      soloSuffix: string;
      duration: string;
      amount: string;
      /** Story 11.2 (AC 1) — `takeoffs / landings`, replaces the old standalone "Atterraggi" column (that i18n key stays, still used by `exports.service.ts`'s own column — story 11.3 scope). */
      movements: string;
      /** Story 11.2 (AC 2) — the derived PIC (pilota al comando, `flight-pic.ts`). */
      pic: string;
      noValue: string;
      /** Story 5.3 (AC 1) — the status column header; REGISTERED renders no badge at all (Contesto). */
      status: string;
      statusCancelled: string;
      /** Literal `{date}`/`{reason}` placeholders, CLIENT-filled — same `t.raw` pattern as `count` below. */
      cancelledDetail: string;
      correctionOf: string;
      correctedBy: string;
      actions: string;
      cancelAction: string;
      correctAction: string;
    };
    /** Story 12.4 (AC 4) — load-more button label, context-dependent (`hasActiveFlightFilter`): grouped registry says "load earlier days", flat says "load more flights". */
    loadMoreGrouped: string;
    loadMoreFlat: string;
    /** Story 12.4 (AC 4) — inline `role="alert"` on a failed load-more fetch; the SAME load-more button retries (no separate button, same pattern as `CancelFlightPanel`'s own error+retry). */
    loadMoreError: string;
    /** Story 12.4 (AC 4) — footer "N di M voli", literal `{loaded}`/`{total}` placeholders, CLIENT-filled (t.raw, same pattern as `cancelledDetail`). */
    count: string;
  };
  /** Story 12.3, AC 5 — the per-row detail sheet. */
  detail: {
    title: string;
    /** Also doubles as the per-row `flight-detail-action` button's label — one string, two call sites. */
    openAction: string;
    close: string;
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
  /** Story 12.5 (AC 1) — shared a11y/error strings for every `DatePicker` on this page (form's `flightDate` + the filter bar's `dateFrom`/`dateTo`). */
  datePicker: DatePickerLabels;
};

type FlightsManagerProps = {
  /** Story 5.4 — `flights.manage`: full manager (form + actions + every filter). Otherwise: the own-access read-only registry (period/type/status only). */
  canManage: boolean;
  /** Story 12.6 (AC 3) — the command palette's "Registra volo" deep-link (`?new=1`, already `canManage`-gated by the page): opens the registration dialog once on mount. */
  initialCreateOpen?: boolean;
  aircraftOptions: AircraftOption[];
  personOptions: PersonOption[];
  instructorOptions: PersonOption[];
  /** Filter-bar aircraft picker (staff only) — includes archived aircraft (Dev Notes: consulting the storico). */
  aircraftFilterOptions: AircraftFilterOption[];
  /** Filter-bar person picker (staff only) — includes archived people, same rationale. */
  personFilterOptions: PersonFilterOption[];
  initialFlights: FlightListItemDto[];
  /** Story 12.4 (AC 4) — the query's grand total (server-rendered page 1) driving the load-more button's `items.length === total` stop condition and the footer count. */
  initialTotal: number;
  /** Story 9.3's school drill-down param (AC 2/4) — not a `FilterBar` control, but STILL counts toward `hasActiveFlightFilter` (AC 2/3's mechanical rule) and must ride along on every load-more fetch to keep pages 2+ scoped the same way page 1 was. `undefined` outside the drill-down. */
  instructorPersonId?: string;
  moneyLocale: 'it' | 'en';
  /** Story 11.1 (AC 1) — `getAirfieldBranding().name`, the registration form's default for BOTH departure/arrival airport fields (a correction's prefill, when present, wins instead). */
  airfieldName: string;
  /** The filter values the current page was rendered with (from the URL, story 5.4) — the bar's initial/controlled state. */
  filters: FlightsFilters;
  /** Story 10.1 (AC 5) — "Esporta Excel" label; the href is built here from the LIVE `filters` state, not this initial snapshot. */
  exportLabel: string;
  /** Story 10.2 (AC 5) — "Esporta PDF" label, same live-filters href-building as `exportLabel`. */
  exportPdfLabel: string;
  /** Story 12.4 (AC 6) — the export overflow menu's trigger label ("Esporta"/"Export"). */
  exportMenuLabel: string;
  labels: FlightsManagerLabels;
};

/** `<input type="date">` default — same browser-local-time convention as the other panels' `todayDateOnly`. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Exported for `flight-detail-sheet.tsx` (story 12.3, AC 5) — same "Cognome Nome" convention used everywhere on this page. */
export function personLabel(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`;
}

/** Exported for `flight-detail-sheet.tsx` (story 12.3, AC 5). */
export function flightTypeLabel(type: FlightListItemDto['flightType'], labels: FlightsManagerLabels['form']['flightTypes']): string {
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
 * The registry's FIRST page is server-rendered (NFR-6) — the parent server
 * component re-renders this whole client component with fresh `key`/props on
 * every filter change (a hand-edited URL or a filter select navigates), so
 * `flights`'s local state below always starts clean from the CURRENT
 * filters' page 1. Story 12.4 (AC 4): further pages are the client's own
 * job now — `handleLoadMore` fetches `GET /api/v1/flights?page=N` directly
 * and appends, no navigation, no numbered pager (removed).
 *
 * Story 12.4 (AC 1/2): in the GROUPED context the table below intentionally
 * has NO `overflow-x-auto` wrapper — with the row cut down to its compact
 * columns it fits the Card's content width at desktop sizes (desktop-first,
 * ratified brainstorm decision); the FLAT context re-gains a scoped wrapper
 * because its extra date column overflows the panel at the design's
 * canonical 1280px width and it has no sticky day headers to break (review
 * 12.4, 124-F3). In grouped mode `overflow-x-auto`
 * would silently break the day header's `position: sticky` (AC 2): per the
 * CSS Overflow spec, setting ANY non-`visible` `overflow-x` forces the
 * computed `overflow-y` to `auto` too, which turns that wrapper itself into
 * the "nearest scrolling ancestor" sticky positions against — and since the
 * wrapper's own height always exactly fits its content (nothing constrains
 * it), its OWN scrollTop never moves, so a sticky child inside it would
 * never visibly stick to the page. Removing the wrapper lets the day header
 * stick against the real scrolling ancestor instead: the dashboard shell's
 * `overflow-y-auto` panel (`dashboard/layout.tsx`).
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
  initialCreateOpen,
  aircraftOptions,
  personOptions,
  instructorOptions,
  aircraftFilterOptions,
  personFilterOptions,
  initialFlights,
  initialTotal,
  instructorPersonId,
  moneyLocale,
  airfieldName,
  filters: initialFilters,
  exportLabel,
  exportPdfLabel,
  exportMenuLabel,
  labels,
}: FlightsManagerProps) {
  const router = useRouter();
  const [flights, setFlights] = useState<FlightListItemDto[]>(initialFlights);
  // Story 12.4 (AC 4) — the query's grand total, kept in lockstep with every
  // OPTIMISTIC row-count change this component already makes (register/
  // correct each add one new row; cancel patches a row in place). This
  // preserves the `flights.length === total` "no more pages" invariant
  // without a second round-trip — see `handleRegistered`/`handleCorrected`.
  const [total, setTotal] = useState(initialTotal);
  // How many server pages (of `FLIGHTS_PAGE_SIZE`) are already loaded —
  // starts at 1 (the server-rendered first page); load-more increments it.
  const [loadedPages, setLoadedPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RegisterFlightResponseDto | null>(null);
  const [correctingFlight, setCorrectingFlight] = useState<FlightListItemDto | null>(null);
  const [cancellingFlight, setCancellingFlight] = useState<FlightListItemDto | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [filters, setFilters] = useState<FlightsFilters>(initialFilters);
  // Story 12.3 (AC 1/2): the register/correct form now lives in a `Dialog`
  // instead of always being on-page — `dialogOpen` is the ONE switch that
  // controls it, orthogonal to `correctingFlight` (which decides WHICH mode
  // the form renders in via its existing `key`-remount idiom). Story 12.6
  // (AC 3): `initialCreateOpen` (the command palette's `?new=1` deep-link)
  // seeds it open from the very first render — a lazy initializer, not an
  // effect, since this only ever matters at mount (same assumption the
  // `key`-remount idiom above already relies on).
  const [dialogOpen, setDialogOpen] = useState(() => Boolean(initialCreateOpen));

  // Review 12.6, 126-F1: reaching `?new=1` while ALREADY on this page
  // re-renders the server page (the prop flips to true) but never remounts
  // this component, so the lazy initializer above misses it and the
  // deep-link was a silent no-op. Adjust-state-during-render (the React-
  // sanctioned "derive from prop transition" pattern — no setState in
  // effects) opens the dialog on the false->true edge; the effect below
  // only strips the param (replace with the current filters — `navigate`
  // never emits `new`) so the URL stays clean and the action repeatable.
  const [prevCreateOpen, setPrevCreateOpen] = useState(() => Boolean(initialCreateOpen));
  if (Boolean(initialCreateOpen) !== prevCreateOpen) {
    setPrevCreateOpen(Boolean(initialCreateOpen));
    if (initialCreateOpen) setDialogOpen(true);
  }
  useEffect(() => {
    if (!initialCreateOpen) return;
    navigate(filters, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- transition-triggered: only the prop matters
  }, [initialCreateOpen]);
  // Story 12.3 (AC 5): the detail sheet — open iff non-null, driven by the
  // row's already-in-memory `FlightListItemDto` (same data the table itself
  // renders from, no extra round-trip; the new `GET /flights/{id}` endpoint,
  // AC 6, is an independent additive API surface, not this sheet's data
  // source).
  const [detailFlight, setDetailFlight] = useState<FlightListItemDto | null>(null);

  // Story 12.4 (AC 2/3) — the mechanical grouped-vs-flat rule, INCLUDING the
  // school drill-down's `instructorPersonId` (not a `FilterBar` control, see
  // its own prop doc-comment).
  const activeFilter = hasActiveFlightFilter({ ...filters, instructorPersonId });

  /**
   * Pushes the new filter values into the URL (dropping `page` — any filter
   * change goes back to page 1, same behavior as `CashRegister`'s own
   * `navigate`). The parent server page re-reads `searchParams`, re-queries
   * `listFlights` with the new filters, and re-renders this component with a
   * fresh `key` (`page.tsx`), so there is nothing else to sync here.
   */
  function navigate(next: FlightsFilters, options?: { replace?: boolean }): void {
    const params = new URLSearchParams();
    if (next.dateFrom) params.set('dateFrom', next.dateFrom);
    if (next.dateTo) params.set('dateTo', next.dateTo);
    if (canManage && next.aircraftId) params.set('aircraftId', next.aircraftId);
    if (canManage && next.personId) params.set('personId', next.personId);
    if (next.flightType) params.set('flightType', next.flightType);
    if (next.status) params.set('status', next.status);
    const search = params.toString();
    const href = `/dashboard/flights${search ? `?${search}` : ''}`;
    if (options?.replace) router.replace(href);
    else router.push(href);
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
    // Sorted insert, not a bare prepend: a backdated flight prepended on top
    // breaks the day grouping (out-of-order/duplicate day headers — review
    // 12.4, 124-F1).
    setFlights((current) => insertFlightSorted(current, result.flight));
    // Story 12.4 (AC 4) — one new DB row, so the grand total grows by one
    // too (keeps `flights.length === total` meaningful for the load-more
    // button/footer count without a re-fetch).
    setTotal((current) => current + 1);
    setDialogOpen(false);
  }

  function handleCorrected(result: RegisterFlightResponseDto, originalFlightId: string, reason: string): void {
    setLastResult(result);
    setFlights((current) =>
      insertFlightSorted(
        current.map((flight) =>
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
        result.flight,
      ),
    );
    // Story 12.4 (AC 4) — a correction ADDS a new row (the original stays,
    // just re-statused), so the total grows by one, same as registration.
    setTotal((current) => current + 1);
    setCorrectingFlight(null);
    setDialogOpen(false);
  }

  function handleCancelled(result: RegisterFlightResponseDto): void {
    setFlights((current) => current.map((flight) => (flight.id === result.flight.id ? result.flight : flight)));
    setCancellingFlight(null);
    setCancelFeedback(labels.cancelPanel.success);
  }

  /** Opens the dialog fresh, in registration mode (AC 2). */
  function handleOpenRegister(): void {
    setCorrectingFlight(null);
    setDialogOpen(true);
  }

  /** Opens the SAME dialog, remounted (via `correctingFlight`'s existing `key`) in correction mode (AC 2). */
  function handleOpenCorrect(flight: FlightListItemDto): void {
    setCorrectingFlight(flight);
    setDialogOpen(true);
  }

  function handleDialogClose(): void {
    setDialogOpen(false);
  }

  /** "Esci dalla correzione" — nothing meaningful is left to show once correction mode is abandoned, so this closes the dialog outright rather than falling back to a blank register form underneath it. */
  function handleExitCorrection(): void {
    setCorrectingFlight(null);
    setDialogOpen(false);
  }

  /** Story 12.3 (AC 5) — the sheet's Correggi/Annulla actions hand off to the SAME dialog/panel the row actions use; the sheet closes first so only one overlay is ever on screen. */
  function handleDetailCorrect(flight: FlightListItemDto): void {
    setDetailFlight(null);
    handleOpenCorrect(flight);
  }

  function handleDetailCancel(flight: FlightListItemDto): void {
    setDetailFlight(null);
    setCancelFeedback(null);
    setCancellingFlight(flight);
  }

  /** The per-row "Annulla" action (`FlightRow`) — same reset-feedback-then-open-panel sequence as `handleDetailCancel`, minus the sheet-close step (there is no sheet open here). */
  function handleCancelClick(flight: FlightListItemDto): void {
    setCancelFeedback(null);
    setCancellingFlight(flight);
  }

  /**
   * Fetches the next server page and appends it (story 12.4, AC 4) — the
   * SAME endpoint/filters the page was rendered with, `page` incremented,
   * `pageSize` omitted (the schema's own default is 20, same as
   * `FLIGHTS_PAGE_SIZE`). `instructorPersonId` rides along so pages 2+ stay
   * scoped exactly like page 1 (see its own prop doc-comment). A failed
   * fetch leaves `flights`/`total`/`loadedPages` untouched and shows an
   * inline `role="alert"` — the SAME load-more button below is the retry
   * (no separate button, matching `CancelFlightPanel`'s error+retry).
   */
  async function handleLoadMore(): Promise<void> {
    setLoadMoreError(null);
    setLoadingMore(true);

    const nextPage = loadedPages + 1;
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(FLIGHTS_PAGE_SIZE) });
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (canManage && filters.aircraftId) params.set('aircraftId', filters.aircraftId);
    if (canManage && filters.personId) params.set('personId', filters.personId);
    if (filters.flightType) params.set('flightType', filters.flightType);
    if (filters.status) params.set('status', filters.status);
    if (instructorPersonId) params.set('instructorPersonId', instructorPersonId);

    let response: Response;
    try {
      response = await fetch(`/api/v1/flights?${params.toString()}`);
    } catch {
      setLoadMoreError(labels.list.loadMoreError);
      setLoadingMore(false);
      return;
    }
    if (!response.ok) {
      setLoadMoreError(labels.list.loadMoreError);
      setLoadingMore(false);
      return;
    }

    const body = (await response.json()) as { items: FlightListItemDto[]; total: number };
    // Dedup by id: an optimistic insert shifts the server's page offsets, so
    // the previous page's boundary row can come back as the next page's
    // first row (review 12.4, 124-F2 — duplicate React key).
    setFlights((current) => appendFlightsPage(current, body.items));
    setTotal(body.total);
    setLoadedPages(nextPage);
    setLoadingMore(false);
  }

  return (
    <div className="space-y-10">
      {canManage ? (
        <div>
          <Button type="button" data-testid="flight-open-register" onClick={handleOpenRegister}>
            {labels.form.submit}
          </Button>

          {/* Story 12.3 (AC 1/2): unconditionally mounted (native `showModal()`/`close()` toggles visibility via `dialogOpen`) so `RegisterFlightForm`'s own `key`-remount idiom keeps working exactly as before. `labelledBy` points at the form's OWN `<h3>` (`flight-form-title`) — the dialog never renders a second, redundant title (AC 7). */}
          <Dialog open={dialogOpen} onClose={handleDialogClose} labelledBy="flight-form-title">
            <RegisterFlightForm
              key={correctingFlight?.id ?? 'register'}
              aircraftOptions={aircraftOptions}
              personOptions={personOptions}
              instructorOptions={instructorOptions}
              airfieldName={airfieldName}
              labels={labels.form}
              correctLabels={labels.correctPanel}
              pickerLabels={labels.picker}
              datePickerLabels={labels.datePicker}
              correctingFlight={correctingFlight}
              onExitCorrection={handleExitCorrection}
              onSuccess={handleRegistered}
              onCorrected={handleCorrected}
            />
          </Dialog>

          {lastResult ? (
            <Card data-testid="flight-result-panel" className="mt-6 p-6">
              <h4 className="text-sm font-medium uppercase tracking-[0.05em] text-mid-gray">{labels.result.title}</h4>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                <div className="flex justify-between gap-2 sm:justify-start">
                  <dt className="text-mid-gray">{labels.result.minutes}</dt>
                  <dd className="font-[family-name:var(--font-mono,monospace)] text-ink">
                    {formatMinutes(lastResult.flight.minutes)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 sm:justify-start">
                  <dt className="text-mid-gray">{labels.result.aircraftRate}</dt>
                  <dd className="text-ink">{formatCents(lastResult.flight.breakdown.aircraftRateCentsPerHour, moneyLocale)}/h</dd>
                </div>
                {lastResult.flight.breakdown.packageCoveredMinutes > 0 ? (
                  <>
                    <div className="flex justify-between gap-2 sm:justify-start">
                      <dt className="text-mid-gray">{labels.result.packageCovered}</dt>
                      <dd className="text-ink">{formatMinutes(lastResult.flight.breakdown.packageCoveredMinutes)}</dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:justify-start">
                      <dt className="text-mid-gray">{labels.result.chargedMinutes}</dt>
                      <dd className="text-ink">{formatMinutes(lastResult.flight.breakdown.chargedMinutes)}</dd>
                    </div>
                    {lastResult.flight.breakdown.packageConsumptions.length > 1 ? (
                      <div className="sm:col-span-2">
                        <ul data-testid="flight-result-packages" className="mt-1 space-y-1 border-t border-hairline pt-2 text-xs text-mid-gray">
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
                  <dt className="text-mid-gray">{labels.result.aircraftAmount}</dt>
                  <dd className="text-ink">{formatCents(lastResult.flight.breakdown.aircraftAmountCents, moneyLocale)}</dd>
                </div>
                {lastResult.flight.breakdown.instructorAmountCents !== undefined &&
                lastResult.flight.breakdown.instructorRateCentsPerHour !== undefined ? (
                  <>
                    <div className="flex justify-between gap-2 sm:justify-start">
                      <dt className="text-mid-gray">{labels.result.instructorRate}</dt>
                      <dd className="text-ink">
                        {formatCents(lastResult.flight.breakdown.instructorRateCentsPerHour, moneyLocale)}/h
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 sm:justify-start">
                      <dt className="text-mid-gray">{labels.result.instructorAmount}</dt>
                      <dd className="text-ink">{formatCents(lastResult.flight.breakdown.instructorAmountCents, moneyLocale)}</dd>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between gap-2 sm:justify-start">
                  <dt className="font-medium text-mid-gray">{labels.result.total}</dt>
                  <dd data-testid="flight-result-total" className="font-medium text-ink">
                    {formatCents(lastResult.flight.breakdown.totalAmountCents, moneyLocale)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 sm:justify-start">
                  <dt className="font-medium text-mid-gray">{labels.result.newBalance}</dt>
                  <dd data-testid="flight-result-new-balance" className="font-medium text-ink">
                    {formatCents(lastResult.account.balanceCents, moneyLocale)}
                  </dd>
                </div>
              </dl>
            </Card>
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

      {/* Story 12.4 (AC 1) — the registry table lives in a Card (nested
          CardHeader for title/filters/export, CardFooter for load-more +
          count), never bare on the canvas. */}
      <Card>
        <CardHeader className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {labels.list.heading}
            </h3>
            <div className="flex items-center gap-4">
              {cancelFeedback ? (
                <p role="status" data-testid="flight-cancel-feedback" className="text-sm text-[#346538]">
                  {cancelFeedback}
                </p>
              ) : null}
              {/* Story 12.4 (AC 6): the two export actions collected into one overflow menu — testids stay on the menu ITEMS, unchanged. */}
              <Menu label={exportMenuLabel} triggerTestId="flights-export-menu-trigger">
                <ExportButton
                  variant="menuItem"
                  // Story 10.1 (AC 5): built from the LIVE filter-bar state (`filters`), not `initialFilters` — reflects
                  // whatever the registry is currently showing, including a hand-edited URL or a just-changed filter.
                  href={buildExportHref(
                    '/api/v1/flights',
                    {
                      dateFrom: filters.dateFrom,
                      dateTo: filters.dateTo,
                      aircraftId: filters.aircraftId,
                      personId: filters.personId,
                      flightType: filters.flightType,
                      status: filters.status,
                    },
                    moneyLocale,
                  )}
                  label={exportLabel}
                  testId="flights-export-button"
                />
                <ExportButton
                  variant="menuItem"
                  // Story 10.2 (AC 5): same live-filters href-building, dedicated PDF route.
                  href={buildPdfExportHref(
                    '/api/v1/flights/pdf',
                    {
                      dateFrom: filters.dateFrom,
                      dateTo: filters.dateTo,
                      aircraftId: filters.aircraftId,
                      personId: filters.personId,
                      flightType: filters.flightType,
                      status: filters.status,
                    },
                    moneyLocale,
                  )}
                  label={exportPdfLabel}
                  testId="flights-export-pdf-button"
                />
              </Menu>
            </div>
          </div>
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
            datePickerLabels={labels.datePicker}
          />
        </CardHeader>

        {flights.length === 0 ? (
          <p className="text-sm text-mid-gray">{labels.list.empty}</p>
        ) : (
          // Flat context only: the extra date column overflows the panel at
          // the design's canonical 1280px width (review 12.4, 124-F3), and
          // flat has no sticky day headers to break — so it gets a scoped
          // horizontal scroll wrapper. Grouped stays wrapperless (sticky).
          <div className={activeFilter ? 'overflow-x-auto' : undefined}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-[0.05em] text-mid-gray">
                {/* Story 12.4 (AC 3): the date column exists ONLY in the flat (any filter active) context — the grouped context carries the date on its day header instead. */}
                {activeFilter ? <th className="py-2 pr-4 font-medium">{labels.list.table.date}</th> : null}
                <th className="py-2 pr-4 font-medium">{labels.list.table.route}</th>
                <th className="py-2 pr-4 font-medium">{labels.list.table.aircraft}</th>
                <th className="py-2 pr-4 font-medium">{labels.list.table.duration}</th>
                <th className="py-2 pr-4 font-medium">{labels.list.table.amount}</th>
                <th className="py-2 pr-4 font-medium">{labels.list.table.pic}</th>
                <th className="py-2 pr-4 font-medium">{labels.list.table.status}</th>
                <th className="py-2 font-medium">{labels.list.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {activeFilter
                ? flights.map((flight) => (
                    <FlightRow
                      key={flight.id}
                      flight={flight}
                      showDate
                      canManage={canManage}
                      moneyLocale={moneyLocale}
                      labels={labels}
                      onDetail={setDetailFlight}
                      onCancel={handleCancelClick}
                      onCorrect={handleOpenCorrect}
                    />
                  ))
                : groupFlightsByDay(flights).map((group) => (
                    <Fragment key={group.flightDate}>
                      {/* Story 12.4 (AC 2) — day divider, `data-testid="flight-day-header"` (NEVER `flight-row`), sticky against the dashboard panel's own scroll (no `overflow-x-auto` ancestor on this table — see the module doc-comment). */}
                      <tr>
                        <th
                          colSpan={GROUPED_COLUMN_COUNT}
                          scope="colgroup"
                          data-testid="flight-day-header"
                          className="sticky top-0 z-10 border-b border-hairline bg-canvas px-2 py-2 text-left text-sm font-medium text-ink"
                        >
                          {formatDateOnly(group.flightDate, moneyLocale)}
                        </th>
                      </tr>
                      {group.flights.map((flight) => (
                        <FlightRow
                          key={flight.id}
                          flight={flight}
                          showDate={false}
                          canManage={canManage}
                          moneyLocale={moneyLocale}
                          labels={labels}
                          onDetail={setDetailFlight}
                          onCancel={handleCancelClick}
                          onCorrect={handleOpenCorrect}
                        />
                      ))}
                    </Fragment>
                  ))}
            </tbody>
          </table>
          </div>
        )}

        {flights.length > 0 ? (
          <CardFooter className="flex flex-wrap items-center justify-between gap-4">
            <p data-testid="flight-registry-count" className="text-sm text-mid-gray">
              {labels.list.count.replace('{loaded}', String(flights.length)).replace('{total}', String(total))}
            </p>
            {flights.length < total ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="flight-load-more"
                  disabled={loadingMore}
                  onClick={() => void handleLoadMore()}
                >
                  {activeFilter ? labels.list.loadMoreFlat : labels.list.loadMoreGrouped}
                </Button>
                {loadMoreError ? (
                  <span role="alert" data-testid="flight-load-more-error" className="text-sm text-ember">
                    {loadMoreError}
                  </span>
                ) : null}
              </div>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>

      <FlightDetailSheet
        flight={detailFlight}
        onClose={() => setDetailFlight(null)}
        canManage={canManage}
        onCorrect={handleDetailCorrect}
        onCancel={handleDetailCancel}
        labels={labels}
        moneyLocale={moneyLocale}
      />
    </div>
  );
}

/** Column count of the GROUPED context's `<thead>` (tratta, velivolo, durata, costo, PIC, stato, azioni — no date column) — the day header's own `colSpan`. */
const GROUPED_COLUMN_COUNT = 7;

type FlightRowProps = {
  flight: FlightListItemDto;
  /** `true` in the flat context (AC 3): renders the leading date cell. `false` in the grouped context (AC 2): the day header carries the date instead. */
  showDate: boolean;
  canManage: boolean;
  moneyLocale: 'it' | 'en';
  labels: FlightsManagerLabels;
  onDetail: (flight: FlightListItemDto) => void;
  onCancel: (flight: FlightListItemDto) => void;
  onCorrect: (flight: FlightListItemDto) => void;
};

/**
 * One compact registry row (story 12.4, AC 1) — fixed height, a single line
 * of text per cell (the status/lineage cell is the one declared exception:
 * a CANCELLED/corrected flight's badge + reason legitimately wraps to a
 * second line — "un registro contabile deve mostrare gli storni"). Tratta
 * and PIC are the two fields that can run long (a free-text airfield name,
 * a full person name) — `max-w-*` + `truncate` + a native `title` tooltip
 * on both (FR-51), same ellipsis-with-tooltip convention used nowhere else
 * on this page yet (12.4 is the first).
 */
function FlightRow({ flight, showDate, canManage, moneyLocale, labels, onDetail, onCancel, onCorrect }: FlightRowProps) {
  const pic = flightPicPerson(flight);
  const route =
    flight.departureAirfield && flight.arrivalAirfield
      ? `${flight.departureAirfield} → ${flight.arrivalAirfield}`
      : labels.list.table.noValue;
  const picLabel = pic ? personLabel(pic) : labels.list.table.noValue;

  return (
    <tr data-testid="flight-row" className="border-b border-hairline text-ink">
      {showDate ? (
        <td className="py-2 pr-4 whitespace-nowrap text-mid-gray">{formatDateOnly(flight.flightDate, moneyLocale)}</td>
      ) : null}
      <td className="max-w-[220px] truncate py-2 pr-4" title={route}>
        {route}
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">{flight.aircraft.registration}</td>
      <td className="py-2 pr-4 whitespace-nowrap">
        <span className="font-[family-name:var(--font-mono,monospace)]">{formatMinutes(flight.minutes)}</span>
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">{formatCents(flight.breakdown.totalAmountCents, moneyLocale)}</td>
      <td data-testid="flight-pic-cell" className="max-w-[160px] truncate py-2 pr-4" title={picLabel}>
        {picLabel}
      </td>
      <td className="py-2 pr-4">
        <FlightStatusCell flight={flight} labels={labels.list.table} locale={moneyLocale} />
      </td>
      <td className="py-2 whitespace-nowrap">
        <div className="flex gap-2">
          {/* Story 12.3 (AC 5) — available on EVERY row, own-access included (a per-row VIEW, not a management action). */}
          <button
            type="button"
            data-testid="flight-detail-action"
            onClick={() => onDetail(flight)}
            className="rounded-buttons border border-hairline bg-paper px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-canvas"
          >
            {labels.detail.openAction}
          </button>
          {canManage && flight.status === 'REGISTERED' ? (
            <>
              <button
                type="button"
                data-testid="flight-cancel-action"
                onClick={() => onCancel(flight)}
                className="rounded-buttons border border-hairline bg-paper px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-canvas"
              >
                {labels.list.table.cancelAction}
              </button>
              <button
                type="button"
                data-testid="flight-correct-action"
                onClick={() => onCorrect(flight)}
                className="rounded-buttons border border-hairline bg-paper px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-canvas"
              >
                {labels.list.table.correctAction}
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
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
/** Exported for `flight-detail-sheet.tsx` (story 12.3, AC 5) — reused verbatim for the sheet's status/lineage line. */
export function FlightStatusCell({
  flight,
  labels,
  locale,
}: {
  flight: FlightListItemDto;
  labels: FlightsManagerLabels['list']['table'];
  /** Story 11.2 (AC 3) — same `moneyLocale` source the caller already threads through the rest of the row. */
  locale: 'it' | 'en';
}) {
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
            <p className="text-xs text-mid-gray" title={flight.cancelReason}>
              {labels.cancelledDetail.replace('{date}', formatDateOnly(flight.cancelledAt.slice(0, 10), locale)).replace('{reason}', flight.cancelReason)}
            </p>
          ) : null}
        </>
      ) : null}
      {flight.correctionOfId ? <p className="text-xs text-mid-gray">{labels.correctionOf}</p> : null}
      {flight.correctedByFlightId ? <p className="text-xs text-mid-gray">{labels.correctedBy}</p> : null}
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
  datePickerLabels: FlightsManagerLabels['datePicker'];
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
function FilterBar({
  canManage,
  filters,
  onChange,
  onReset,
  aircraftOptions,
  personOptions,
  labels,
  flightTypeLabels,
  pickerLabels,
  datePickerLabels,
}: FilterBarProps) {
  const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[40px]');
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
    // Story 12.4 (AC 6): no own bottom border/padding anymore — this bar is
    // now the LAST element inside `CardHeader`, whose own `border-b` is the
    // single divider between the header band and the table body (two close
    // hairlines would otherwise stack here).
    <div className="flex flex-wrap items-end gap-4" data-testid="flight-filter-bar">
      {/* `<label htmlFor>` as a SIBLING of its control, never wrapping it: a
          wrapping `<label>` around a `<select>` folds every `<option>`'s
          text into the label's own accessible name (browsers compute it from
          textContent), which can accidentally collide with an unrelated
          label elsewhere on the page once option text is dynamic (e.g. a
          person's name) — the same footgun `CashRegister`'s filter bar has,
          fixed here instead of repeated. */}
      <DatePicker
        id="flight-filter-date-from"
        label={labels.dateFrom}
        value={filters.dateFrom}
        onChange={(next) => onChange({ dateFrom: next })}
        labels={datePickerLabels}
        testId="flight-filter-date-from"
        className="min-w-[160px]"
      />
      <DatePicker
        id="flight-filter-date-to"
        label={labels.dateTo}
        value={filters.dateTo}
        onChange={(next) => onChange({ dateTo: next })}
        labels={datePickerLabels}
        testId="flight-filter-date-to"
        className="min-w-[160px]"
      />
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
      <div className="flex flex-col text-sm text-ink">
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
      <div className="flex flex-col text-sm text-ink">
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
          className="min-h-[40px] rounded-buttons border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas"
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
    <Card data-testid="flight-cancel-panel" className="p-6">
      <h4 className="text-xl font-semibold tracking-[-0.02em] text-ink">{labels.title}</h4>
      <p className="mt-2 text-sm text-mid-gray">
        {flight.aircraft.registration} — {formatDateOnly(flight.flightDate, moneyLocale)} — {formatCents(flight.breakdown.totalAmountCents, moneyLocale)}
      </p>

      <div className="mt-4 max-w-md">
        <label htmlFor="cancel-reason" className="block text-sm font-medium text-ink">
          {labels.reason}
        </label>
        <Input
          id="cancel-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={reasonError}
          maxLength={500}
          className="mt-2 min-h-[44px] w-full"
        />
        {reasonError ? <p className="mt-1 text-xs text-ember">{labels.requiredReason}</p> : null}
      </div>

      {formError ? (
        <p role="alert" data-testid="flight-cancel-error" className="mt-4 rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          data-testid="flight-cancel-confirm"
          disabled={submitting}
          onClick={() => void handleConfirm()}
          className="min-h-[44px]"
        >
          {labels.submit}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onClose}
          className="min-h-[44px]"
        >
          {labels.close}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Local, UI-only schema (never sent over the wire as-is — same "convert only
 * at the boundary" pattern as `TopUpForm`): every numeric field stays a raw
 * string end to end while the user types. `hourMeterStart`/`hourMeterEnd`
 * are two plain OPTIONAL fields since story 11.1 (no radio/mode anymore,
 * Dev Notes) — validated as a self-consistent pair in `onSubmit`, not here.
 *
 * Story TD-3: `aircraftId`/`personId`/`instructorPersonId` are deliberately
 * NOT part of this schema anymore — they moved to plain component state
 * driven by `SearchCombobox` (same "plain local state, not an RHF field"
 * pattern already used here for `reason`, for the identical reason: a
 * controlled value that isn't read via RHF's `watch()`). Their "required"
 * check moved from the Zod resolver to a manual pre-submit check in
 * `onSubmit`, reusing the SAME `labels.requiredField` message `flightDate`
 * already showed inline — see `onSubmit` below.
 */
const flightFormSchema = z.object({
  flightDate: z.string().trim().min(1),
  flightType: flightTypeSchema,
  // Story 11.1 (AC 1/2): the logbook fields — required non-empty (server
  // mirrors the same non-empty/instant requirements, `registerFlightSchema`).
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

/**
 * Composes `takeoffAt`/`landingAt` `Date`s from the form's date + two
 * `type="time"` fields — the BOOKINGS pattern (`new-booking-form.tsx:255-256`:
 * `new Date(...).toISOString()`, browser wall-time) extended for a second
 * clock reading on the SAME calendar date. `null` when any of the three raw
 * strings is empty/unparsable (Dev Notes/AC 2). If `landingTime <=
 * takeoffTime`, the landing is interpreted as the FOLLOWING day (attraversamento
 * mezzanotte) — added on the already-local `Date` object directly
 * (`setDate`), never via `zoned-time.ts#addDaysDateOnly` (Dev Notes: that
 * module is SERVER-side only, not importable from this client component).
 */
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

/** The `YYYY-MM-DD` LOCAL (browser) calendar date an ISO instant falls on — the inverse of the `${date}T${time}` composition above, for correction prefill (Dev Notes). */
function localDateFromIso(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The `HH:MM` LOCAL (browser) time-of-day an ISO instant falls on — same rationale as {@link localDateFromIso}. */
function localTimeFromIso(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Blank/registration defaults (departure/arrival default to the airfield's own name, AC 1), or (story 5.3/11.1) pre-filled from the flight being corrected — an original WITHOUT logbook fields (pre-11.1 history) leaves them blank for the user to fill (AC 5). */
function flightFormDefaults(correctingFlight: FlightListItemDto | null, airfieldName: string): FlightFormValues {
  if (!correctingFlight) {
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
  return {
    flightDate: correctingFlight.takeoffAt ? localDateFromIso(correctingFlight.takeoffAt) : correctingFlight.flightDate,
    flightType: correctingFlight.flightType,
    departureAirfield: correctingFlight.departureAirfield ?? '',
    arrivalAirfield: correctingFlight.arrivalAirfield ?? '',
    takeoffTime: correctingFlight.takeoffAt ? localTimeFromIso(correctingFlight.takeoffAt) : '',
    landingTime: correctingFlight.landingAt ? localTimeFromIso(correctingFlight.landingAt) : '',
    hourMeterStart: correctingFlight.hourMeterStart !== null ? String(correctingFlight.hourMeterStart) : '',
    hourMeterEnd: correctingFlight.hourMeterEnd !== null ? String(correctingFlight.hourMeterEnd) : '',
    takeoffs: String(correctingFlight.takeoffs),
    landings: String(correctingFlight.landings),
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
  /** Story 11.1 (AC 1) — the registration-mode default for departure/arrival. */
  airfieldName: string;
  labels: FlightsManagerLabels['form'];
  correctLabels: FlightsManagerLabels['correctPanel'];
  pickerLabels: FlightsManagerLabels['picker'];
  datePickerLabels: FlightsManagerLabels['datePicker'];
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
  airfieldName,
  labels,
  correctLabels,
  pickerLabels,
  datePickerLabels,
  correctingFlight,
  onExitCorrection,
  onSuccess,
  onCorrected,
}: RegisterFlightFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const defaults = flightFormDefaults(correctingFlight, airfieldName);
  // Story 9.4 (AC 1): `flightType` stays `register`-only (RHF reads it from
  // the DOM at submit, same as before) — this mirrors it into plain state,
  // via `register`'s own `onChange` option (NOT `watch()`, the React
  // Compiler flags RHF's `watch()` as unmemoizable, same documented
  // exception as `data-table.tsx`), purely so the dual/solo radio below can
  // decide whether to render. `isSolo` itself is likewise plain state, never
  // an RHF field — same rationale.
  const [selectedFlightType, setSelectedFlightType] = useState<FlightTypeDto>(defaults.flightType);
  const [isSolo, setIsSolo] = useState(correctingFlight?.isSolo ?? false);
  // Story 11.1 (AC 2): the live-computed duration display mirrors
  // flightDate/takeoffTime/landingTime into plain state (same
  // register-onChange, non-`watch()` pattern as `selectedFlightType` above)
  // — RHF itself stays the single source of truth for what gets submitted.
  const [flightDateValue, setFlightDateValue] = useState(defaults.flightDate);
  const [takeoffTimeValue, setTakeoffTimeValue] = useState(defaults.takeoffTime);
  const [landingTimeValue, setLandingTimeValue] = useState(defaults.landingTime);
  // Story 5.3 (AC 2): the mandatory motivo, only rendered/required in
  // correction mode — same "plain local state, not a schema field" pattern
  // as above (the field only exists in correction mode).
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  // Story TD-3: the 3 picker fields, plain component state driven by
  // `SearchCombobox` instead of RHF-registered `<select>`s (same rationale
  // as `reason` above) — initialized from the SAME defaults
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FlightFormValues>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: defaults,
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

    // Story 12.3 (AC 3): the takeoff/landing fields are free text now
    // (shorthand entry: `1430`, `930`, `9:30`) — normalize to `HH:MM` before
    // composing. `composeFlightTimes` itself is UNCHANGED and still only
    // ever sees a valid `HH:MM` pair; an unparsable shorthand reuses the
    // SAME `FLIGHT_TIMES_INVALID` message a bad `composeFlightTimes` result
    // already showed pre-12.3 (Dev Notes: the wire semantics stay identical).
    const parsedTakeoffTime = parseTimeShorthand(values.takeoffTime);
    const parsedLandingTime = parseTimeShorthand(values.landingTime);
    if (!parsedTakeoffTime || !parsedLandingTime) {
      setFormError(labels.errors.FLIGHT_TIMES_INVALID);
      return;
    }

    // Story 11.1 (AC 2): the ONLY source of `takeoffAt`/`landingAt` — the
    // resolver already guarantees the three raw strings are non-empty, so a
    // `null` here only defends against an unparsable browser value.
    const times = composeFlightTimes(values.flightDate, parsedTakeoffTime, parsedLandingTime);
    if (!times) {
      setFormError(labels.errors.FLIGHT_TIMES_INVALID);
      return;
    }

    // Story 11.1 (AC 6): hourMeterStart/hourMeterEnd are two independent
    // OPTIONAL fields now (no radio/mode) — validated as a self-consistent
    // pair only when either is filled in, mirroring the server's own
    // HOUR_METER_INVALID check.
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
          departureAirfield: values.departureAirfield.trim(),
          arrivalAirfield: values.arrivalAirfield.trim(),
          takeoffAt: times.takeoffAt.toISOString(),
          landingAt: times.landingAt.toISOString(),
          flightType: values.flightType,
          // Story 9.4 (AC 1) — meaningful only on SCHOOL; the same body is
          // used for both registration and correction (correctFlight
          // re-validates/re-persists it exactly like every other field).
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
    const blankValues = flightFormDefaults(null, airfieldName);
    reset(blankValues);
    // Story TD-3: the 3 picker fields reset alongside the RHF-managed ones
    // above — `SearchCombobox` is controlled, so setting these back to the
    // blank/first-active defaults is enough to re-sync its visible text (see
    // its own doc-comment on the external-value sync effect).
    const blankPickerValues = pickerDefaults(aircraftOptions, null);
    setAircraftId(blankPickerValues.aircraftId);
    setPersonId(blankPickerValues.personId);
    setInstructorPersonId(blankPickerValues.instructorPersonId);
    setSelectedFlightType('TOURISM');
    setIsSolo(false);
    setReason('');
    // Story 11.1: the live-duration mirror state resets alongside the
    // RHF-managed fields above (`reset()` alone does not re-run our
    // `register(..., { onChange })` side effects).
    setFlightDateValue(blankValues.flightDate);
    setTakeoffTimeValue(blankValues.takeoffTime);
    setLandingTimeValue(blankValues.landingTime);
  }

  // Story 11.1 (AC 2): the live-computed duration, `null` until both times
  // (plus the date) are filled in and parse to a valid pair. Story 12.3
  // (AC 3): the two mirrors are free-typed shorthand now — normalized
  // through `parseTimeShorthand` before `composeFlightTimes` ever sees them,
  // same as `onSubmit`.
  const liveTakeoffTime = parseTimeShorthand(takeoffTimeValue);
  const liveLandingTime = parseTimeShorthand(landingTimeValue);
  const liveTimes =
    liveTakeoffTime && liveLandingTime ? composeFlightTimes(flightDateValue, liveTakeoffTime, liveLandingTime) : null;
  const computedMinutes = liveTimes ? Math.round((liveTimes.landingAt.getTime() - liveTimes.takeoffAt.getTime()) / 60_000) : null;

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-5" data-testid="flight-form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Story 12.3 (AC 7): `id` is the Dialog's `aria-labelledby` target — the dialog renders no title of its own, this heading IS it. */}
        <h3 id="flight-form-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
          {isCorrecting ? correctLabels.title : labels.title}
        </h3>
        {isCorrecting ? (
          <button
            type="button"
            data-testid="flight-correct-exit"
            onClick={onExitCorrection}
            className="text-xs font-medium text-mid-gray underline-offset-4 hover:underline"
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
          {noAircraft ? <p className="mt-1 text-xs text-mid-gray">{labels.noAircraftAvailable}</p> : null}
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
          {noPerson ? <p className="mt-1 text-xs text-mid-gray">{labels.noPersonAvailable}</p> : null}
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
          <DatePicker
            id="flight-date"
            label={labels.flightDate}
            value={flightDateValue}
            onChange={(next) => {
              setFlightDateValue(next);
              setValue('flightDate', next);
            }}
            labels={datePickerLabels}
            ariaInvalid={Boolean(errors.flightDate)}
          />
          {errors.flightDate ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>

        <div>
          <label htmlFor="flight-type" className="block text-sm font-medium text-ink">
            {labels.flightType}
          </label>
          <select
            id="flight-type"
            className="mt-2 min-h-[44px] w-full rounded-buttons border border-hairline bg-paper px-3 py-2 text-base text-ink outline-none transition-colors focus:border-ink"
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
          <label htmlFor="flight-departure" className="block text-sm font-medium text-ink">
            {labels.departure}
          </label>
          <Input
            id="flight-departure"
            aria-invalid={Boolean(errors.departureAirfield)}
            className="mt-2 min-h-[44px] w-full"
            {...register('departureAirfield')}
          />
          {errors.departureAirfield ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>

        <div>
          <label htmlFor="flight-arrival" className="block text-sm font-medium text-ink">
            {labels.arrival}
          </label>
          <Input
            id="flight-arrival"
            aria-invalid={Boolean(errors.arrivalAirfield)}
            className="mt-2 min-h-[44px] w-full"
            {...register('arrivalAirfield')}
          />
          {errors.arrivalAirfield ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>

        <div>
          <label htmlFor="flight-landings" className="block text-sm font-medium text-ink">
            {labels.landings}
          </label>
          <Input
            id="flight-landings"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            className="mt-2 min-h-[44px] w-full"
            {...register('landings')}
          />
        </div>

        <div>
          <label htmlFor="flight-takeoffs" className="block text-sm font-medium text-ink">
            {labels.takeoffs}
          </label>
          <Input
            id="flight-takeoffs"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            className="mt-2 min-h-[44px] w-full"
            {...register('takeoffs')}
          />
        </div>
      </div>

      {selectedFlightType === 'SCHOOL' ? (
        <fieldset>
          <legend className="block text-sm font-medium text-ink">{labels.soloMode}</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            <label htmlFor="flight-solo-dual" className="flex items-center gap-2 text-sm text-ink">
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
            <label htmlFor="flight-solo-solo" className="flex items-center gap-2 text-sm text-ink">
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

      {/* Story 11.1 (AC 2): the durata is ALWAYS derived from these two clock
          readings — the live display below is read-only, never an input.
          Story 12.3 (AC 3): free-text shorthand entry (`1430`, `930`,
          `9:30`) instead of the native time picker — `parseTimeShorthand`
          normalizes to `HH:MM` at submit/live-calc time; the field itself
          stays whatever the user typed. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:max-w-[660px]">
        <div>
          <label htmlFor="flight-takeoff-time" className="block text-sm font-medium text-ink">
            {labels.takeoffTime}
          </label>
          <Input
            id="flight-takeoff-time"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="14:30"
            aria-invalid={Boolean(errors.takeoffTime) || formError === labels.errors.FLIGHT_TIMES_INVALID}
            className="mt-2 min-h-[44px] w-full"
            {...register('takeoffTime', { onChange: (event: { target: { value: string } }) => setTakeoffTimeValue(event.target.value) })}
          />
          {errors.takeoffTime ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>
        <div>
          <label htmlFor="flight-landing-time" className="block text-sm font-medium text-ink">
            {labels.landingTime}
          </label>
          <Input
            id="flight-landing-time"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="14:30"
            aria-invalid={Boolean(errors.landingTime) || formError === labels.errors.FLIGHT_TIMES_INVALID}
            className="mt-2 min-h-[44px] w-full"
            {...register('landingTime', { onChange: (event: { target: { value: string } }) => setLandingTimeValue(event.target.value) })}
          />
          {errors.landingTime ? <p className="mt-1 text-xs text-ember">{labels.requiredField}</p> : null}
        </div>
        <div>
          <span className="block text-sm font-medium text-ink">{labels.computedDuration}</span>
          <p data-testid="flight-computed-duration" className="mt-2 flex min-h-[44px] items-center font-[family-name:var(--font-mono,monospace)] text-base text-ink">
            {computedMinutes !== null ? formatMinutes(computedMinutes) : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-[440px]">
        <div>
          <label htmlFor="flight-hour-meter-start" className="block text-sm font-medium text-ink">
            {labels.hourMeterStart}
          </label>
          <Input
            id="flight-hour-meter-start"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            className="mt-2 min-h-[44px] w-full"
            {...register('hourMeterStart')}
          />
        </div>
        <div>
          <label htmlFor="flight-hour-meter-end" className="block text-sm font-medium text-ink">
            {labels.hourMeterEnd}
          </label>
          <Input
            id="flight-hour-meter-end"
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            className="mt-2 min-h-[44px] w-full"
            {...register('hourMeterEnd')}
          />
        </div>
      </div>

      <div>
        <label htmlFor="flight-notes" className="block text-sm font-medium text-ink">
          {labels.notes}
        </label>
        <Input
          id="flight-notes"
          maxLength={1000}
          className="mt-2 min-h-[44px] w-full"
          {...register('notes')}
        />
      </div>

      {isCorrecting ? (
        <div className="max-w-md">
          <label htmlFor="flight-correct-reason" className="block text-sm font-medium text-ink">
            {correctLabels.reason}
          </label>
          <Input
            id="flight-correct-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={reasonError}
            maxLength={500}
            className="mt-2 min-h-[44px] w-full"
          />
          {reasonError ? <p className="mt-1 text-xs text-ember">{correctLabels.requiredReason}</p> : null}
        </div>
      ) : null}

      {formError ? (
        <p role="alert" data-testid="flight-form-error" className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isSubmitting || noAircraft || noPerson}
        className="min-h-[44px]"
      >
        {isCorrecting ? correctLabels.submit : labels.submit}
      </Button>
    </form>
  );
}
