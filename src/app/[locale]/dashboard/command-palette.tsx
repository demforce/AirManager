'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/components/ui/cn';
import { useNativeDialog } from '@/components/ui/dialog';

export type CommandPaletteNavItem = { key: string; href: string; label: string };

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  /** `visibleNavItems(actor)` resolved server-side in `layout.tsx`, labels already translated — the SAME data/gating the sidebar renders from (AC 2). */
  navItems: CommandPaletteNavItem[];
  /** "Registra volo" (`flights.manage`, AC 3) — same permission as the flight register's own trigger button. */
  canRegisterFlight: boolean;
  /** "Nuova persona" (`people.read`, AC 3) — same permission that gates reaching the People page, where the existing button has no gate of its own. */
  canCreatePerson: boolean;
  /** The "Risultati" group (AC 4) — staff-only: both `/api/v1/people` and `/api/v1/aircraft` free-text search require staff-level permissions server-side. */
  canSearch: boolean;
};

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const RESULTS_PAGE_SIZE = '5';

type PersonResult = { id: string; label: string };
type AircraftResult = { id: string; label: string; meta: string };

/**
 * Staff-only cross-entity search (AC 4, decision "NESSUN endpoint nuovo") —
 * same query-building pattern as `flights-manager.tsx`'s `searchPeople`/
 * `searchAircraft` (`q` + `pageSize`), kept local rather than shared: the two
 * call sites want different result shapes (a combobox option there, a
 * two-action person row / single aircraft row here). A non-OK response
 * (including the 403 a non-staff actor would get if this ever ran for them,
 * which it never does — `canSearch` gates the whole group client-side) is
 * swallowed into an empty list, never thrown (AC 5: "niente crash").
 */
async function fetchPersonResults(query: string): Promise<PersonResult[]> {
  const response = await fetch(`/api/v1/people?${new URLSearchParams({ q: query, pageSize: RESULTS_PAGE_SIZE })}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; firstName: string; lastName: string }[] };
  return body.items.map((person) => ({ id: person.id, label: `${person.lastName} ${person.firstName}` }));
}

async function fetchAircraftResults(query: string): Promise<AircraftResult[]> {
  const response = await fetch(`/api/v1/aircraft?${new URLSearchParams({ q: query, pageSize: RESULTS_PAGE_SIZE })}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; registration: string; model: string }[] };
  return body.items.map((aircraft) => ({ id: aircraft.id, label: aircraft.registration, meta: aircraft.model }));
}

/** One flat, keyboard-navigable row (AC 5 — single `aria-activedescendant` sweep across every group). */
type PaletteOption =
  | { id: string; kind: 'nav'; label: string; href: string }
  | { id: string; kind: 'create-flight'; label: string }
  | { id: string; kind: 'create-person'; label: string }
  | { id: string; kind: 'person'; label: string; personId: string }
  | { id: string; kind: 'person-flights'; label: string; personId: string }
  | { id: string; kind: 'aircraft'; label: string; meta: string; aircraftId: string };

type Segment = { heading: string; options: PaletteOption[] };

/**
 * The ⌘K/Ctrl+K command palette (story 12.6, AC 1) — a top-aligned native
 * `<dialog>` (DESIGN.md "Search Trigger": the palette itself, not just the
 * trigger, reads as the desktop-app spine), built on the SAME
 * `useNativeDialog` plumbing as `Dialog`/`Sheet` (`ui/dialog.tsx`) so
 * showModal/close, the native Esc→focus-return and the backdrop-click are
 * all free/identical. `SearchTrigger` (this file's sibling) owns `open` and
 * the global keydown listener; this component is purely controlled.
 *
 * Groups (AC 2/3/4, in this fixed order): "Vai a" (the sidebar's own nav
 * items, filtered by label), "Crea" (permission-gated deep-links, NOT
 * dialogs — `?new=1`, decision in the story's Contesto: one point of truth
 * for the create forms), "Risultati" (staff-only, ≥2 chars, debounced).
 * Every option lives in ONE flat array (`flatOptions`) so arrow keys/Enter
 * and `aria-activedescendant` traverse the whole list regardless of group —
 * the per-group headings below are plain non-interactive rows, never
 * `role="option"`, so they never receive the active index.
 */
export function CommandPalette({ open, onClose, navItems, canRegisterFlight, canCreatePerson, canSearch }: CommandPaletteProps) {
  const t = useTranslations('DashboardShell.commandPalette');
  const router = useRouter();
  const { ref, handleBackdropClick } = useNativeDialog(open);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [aircraft, setAircraft] = useState<AircraftResult[]>([]);
  // The query the CURRENT `people`/`aircraft` were fetched for (`null` =
  // nothing fetched yet this session) — `searching` below is DERIVED from
  // comparing this to the live `trimmedQuery`, so there is no separate
  // "loading" flag to keep in sync by hand.
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const [lastQuery, setLastQuery] = useState(query);
  const seqRef = useRef(0);

  // Fresh state on every open (AC 1: the dialog stays mounted across
  // navigations, so nothing else would ever clear a stale query/results).
  // React's documented "adjust state during render" idiom (same pattern as
  // `SearchCombobox`'s `reconciledValue`) — NOT a `useEffect`: calling
  // `setState` synchronously inside an effect body is exactly what
  // `react-hooks/set-state-in-effect` flags, and there is nothing here that
  // synchronizes with an external system anyway.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setPeople([]);
      setAircraft([]);
      setResultsQuery(null);
    }
  }

  // Re-anchor to the top match on every keystroke — same idiom as above.
  // Without this, a row highlighted by an earlier keystroke (or a mouse
  // hover before typing) can keep pointing at an unrelated row once the
  // list has been re-filtered, since the clamp below only guards against
  // running past the END of a shorter list, not against a stale index that
  // still happens to be in-bounds.
  if (query !== lastQuery) {
    setLastQuery(query);
    setActiveIndex(0);
  }

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const showResultsGroup = canSearch && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const searching = showResultsGroup && resultsQuery !== trimmedQuery;

  // The debounced fetch itself IS synchronizing with an external system
  // (the search endpoints) — `setState` only ever runs inside the async
  // `.then()` callback below, never synchronously in the effect body.
  useEffect(() => {
    if (!showResultsGroup) return;
    const seq = ++seqRef.current;
    const timer = setTimeout(() => {
      void Promise.all([fetchPersonResults(trimmedQuery), fetchAircraftResults(trimmedQuery)]).then(([personResults, aircraftResults]) => {
        if (seqRef.current !== seq) return; // superseded by a newer query — discard
        setPeople(personResults);
        setAircraft(aircraftResults);
        setResultsQuery(trimmedQuery);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedQuery, showResultsGroup]);

  const filteredNavItems = trimmedQuery === '' ? navItems : navItems.filter((item) => item.label.toLowerCase().includes(normalizedQuery));

  const createFlightLabel = t('createFlight');
  const createPersonLabel = t('createPerson');
  const showCreateFlight = canRegisterFlight && (trimmedQuery === '' || createFlightLabel.toLowerCase().includes(normalizedQuery));
  const showCreatePerson = canCreatePerson && (trimmedQuery === '' || createPersonLabel.toLowerCase().includes(normalizedQuery));

  const segments: Segment[] = [];
  if (filteredNavItems.length > 0) {
    segments.push({
      heading: t('navGroup'),
      options: filteredNavItems.map((item) => ({ id: `nav-${item.key}`, kind: 'nav' as const, label: item.label, href: item.href })),
    });
  }
  const createOptions: PaletteOption[] = [];
  if (showCreateFlight) createOptions.push({ id: 'create-flight', kind: 'create-flight', label: createFlightLabel });
  if (showCreatePerson) createOptions.push({ id: 'create-person', kind: 'create-person', label: createPersonLabel });
  if (createOptions.length > 0) segments.push({ heading: t('createGroup'), options: createOptions });
  // Only ever built from results already resolved FOR `trimmedQuery`
  // (`resultsQuery === trimmedQuery`) — while a debounced fetch is still
  // pending (`searching`), `people`/`aircraft` still hold the PREVIOUS
  // query's rows, which must not flash into this group.
  if (showResultsGroup && !searching) {
    const resultOptions: PaletteOption[] = [];
    for (const person of people) {
      resultOptions.push({ id: `person-${person.id}`, kind: 'person', label: person.label, personId: person.id });
      resultOptions.push({
        id: `person-flights-${person.id}`,
        kind: 'person-flights',
        label: t('resultsPersonFlights', { name: person.label }),
        personId: person.id,
      });
    }
    for (const item of aircraft) {
      resultOptions.push({ id: `aircraft-${item.id}`, kind: 'aircraft', label: item.label, meta: item.meta, aircraftId: item.id });
    }
    // Same convention as the nav/create groups above: a heading only ever
    // renders alongside at least one option — a genuinely empty search
    // falls through to the single global empty state below instead of a
    // dangling "Risultati" label over nothing.
    if (resultOptions.length > 0) segments.push({ heading: t('resultsGroup'), options: resultOptions });
  }

  const flatOptions = segments.flatMap((segment) => segment.options);
  // Clamped rather than reset-on-change (simplicity: no extra render-time
  // adjustment needed) — safe even right after the list shrinks out from
  // under a higher `activeIndex`.
  const safeActiveIndex = Math.min(activeIndex, Math.max(flatOptions.length - 1, 0));
  const activeOption = flatOptions[safeActiveIndex];
  const isEmpty = flatOptions.length === 0 && !searching;

  function activate(option: PaletteOption): void {
    onClose();
    switch (option.kind) {
      case 'nav':
        router.push(option.href);
        return;
      case 'create-flight':
        router.push('/dashboard/flights?new=1');
        return;
      case 'create-person':
        router.push('/dashboard/people?new=1');
        return;
      case 'person':
        router.push(`/dashboard/people/${option.personId}`);
        return;
      case 'person-flights':
        router.push(`/dashboard/flights?personId=${option.personId}`);
        return;
      case 'aircraft':
        router.push(`/dashboard/flights?aircraftId=${option.aircraftId}`);
        return;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(safeActiveIndex + 1, flatOptions.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(safeActiveIndex - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeOption) activate(activeOption);
    }
  }

  const listboxId = 'command-palette-listbox';
  const activeOptionId = activeOption ? `command-palette-option-${activeOption.id}` : undefined;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-label={t('dialogLabel')}
      data-testid="command-palette-dialog"
      className="m-0 mx-auto mt-[14vh] w-[calc(100%-2rem)] max-w-xl border-0 bg-transparent p-0 outline-none backdrop:bg-ink/40"
    >
      <div className="flex max-h-[65vh] flex-col overflow-hidden rounded-cards border border-hairline bg-paper shadow-subtle">
        <div className="border-b border-hairline p-3">
          {/* Story 12.6 (AC 1/5): no classic dialog title — this input IS the
              dialog's whole visible header, its own `aria-label` names the
              combobox (SearchCombobox convention: the listbox itself carries
              no separate label, see below). */}
          <input
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label={t('inputLabel')}
            autoComplete="off"
            placeholder={t('placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            data-testid="command-palette-input"
            className="w-full border-0 bg-transparent text-base text-ink outline-none placeholder:text-mid-gray"
          />
        </div>
        <ul id={listboxId} role="listbox" className="flex-1 overflow-y-auto p-2">
          {segments.map((segment) => (
            <Fragment key={segment.heading}>
              <li className="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-[0.06em] text-mid-gray">{segment.heading}</li>
              {segment.options.map((option) => (
                <li
                  key={option.id}
                  id={`command-palette-option-${option.id}`}
                  role="option"
                  aria-selected={option.id === activeOption?.id}
                  onMouseEnter={() => setActiveIndex(flatOptions.findIndex((candidate) => candidate.id === option.id))}
                  onClick={() => activate(option)}
                  className={cn(
                    'cursor-pointer rounded-nested px-3 py-2 text-sm text-ink',
                    option.id === activeOption?.id && 'bg-canvas',
                    option.kind === 'person-flights' && 'ml-3 text-mid-gray',
                  )}
                >
                  {option.label}
                  {option.kind === 'aircraft' ? <span className="ml-2 text-xs text-mid-gray">{option.meta}</span> : null}
                </li>
              ))}
            </Fragment>
          ))}
          {isEmpty ? (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-6 text-center text-sm text-mid-gray">
              {t('empty')}
            </li>
          ) : null}
        </ul>
        <div className="border-t border-hairline px-3 py-2 text-xs text-mid-gray">{t('footerHint')}</div>
      </div>
    </dialog>
  );
}
