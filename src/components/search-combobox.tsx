'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';

/**
 * One selectable entry (story TD-3, AC 1/2). `meta` is an optional secondary
 * detail rendered muted next to `label` inside the option row — part of the
 * documented contract, unused by today's consumers (kept for a future
 * picker that needs a disambiguating detail, e.g. an email next to a name).
 */
export type SearchComboboxOption = {
  id: string;
  label: string;
  meta?: string;
};

export type SearchComboboxProps = {
  /** Also used to derive the listbox id (`${id}-listbox`) and option ids (`${id}-option-${optionId}`). */
  id: string;
  /** Rendered as a `<label htmlFor={id}>` SIBLING of the input (lezione 5.4 — MAI label-wrap): this component owns that pairing so every call site gets it for free. */
  label: string;
  /** Selected option's `id`, or `''` for "nothing selected". */
  value: string;
  onChange: (id: string) => void;
  /** Server-side search, called debounced while the user types a non-empty query. */
  fetchOptions: (query: string) => Promise<SearchComboboxOption[]>;
  /**
   * The page's server-rendered first page of candidates (≤100, story 5.4's
   * `OPTIONS_PAGE_SIZE`/AC 1) — shown verbatim on focus (browse mode, no
   * fetch: the ≤100 case works with ZERO extra network calls) and filtered
   * client-side as an optimistic placeholder the instant the user starts
   * typing, replaced by `fetchOptions`'s authoritative results once they
   * resolve. A caller that needs a "no selection" choice reachable from the
   * keyboard (the flight filter bar's "Tutti i velivoli", the optional
   * istruttore's "Nessun istruttore") prepends a `{ id: '', label: ... }`
   * entry here — this component has no built-in "clear" affordance by
   * design (exact prop contract, story TD-3).
   */
  initialOptions: SearchComboboxOption[];
  placeholder?: string;
  /** Shown as a non-selectable row when a search yields zero matches. */
  emptyText: string;
  disabled?: boolean;
};

const DEBOUNCE_MS = 250;

function findLabel(id: string, options: SearchComboboxOption[]): string {
  if (id === '') return options.find((option) => option.id === '')?.label ?? '';
  return options.find((option) => option.id === id)?.label ?? '';
}

/**
 * Accessible, debounced typeahead picker (story TD-3, AC 1/2/3) — the single
 * reusable replacement for the flight registry's native `<select>` pickers,
 * which silently missed any entry past `listPeople`/`listAircraft`'s 100-row
 * page cap once the anagrafica grew past it (finding 5.4 D1). WAI-ARIA
 * combobox pattern (`role="combobox"` + a popup `role="listbox"`, NOT
 * `aria-owns`): `aria-expanded`/`aria-controls`/`aria-activedescendant` on
 * the input, `role="option"`/`aria-selected` on each row. Keyboard: arrow
 * down/up move the active option (opening the popup first if it was
 * closed), Enter commits the active option (falls through to the
 * surrounding `<form>`'s native submit when the popup is closed — a filled
 * field still submits on Enter, same as a `<select>` did), Escape closes
 * and reverts the visible text to the committed selection.
 *
 * FOCUS = browse (`initialOptions` verbatim, zero fetch, text pre-selected
 * so typing replaces it — same "click a select, see everything" UX as
 * before). TYPING = search: an immediate client-side filter of
 * `initialOptions` as a placeholder, superseded ~250ms later by
 * `fetchOptions`'s server-authoritative results (a monotonic sequence
 * counter discards a stale response that resolves after a newer one — no
 * `AbortController` needed for a same-origin JSON fetch this small).
 *
 * The committed selection's label is tracked in its OWN state
 * (`committedLabel`, set only at the moment of an actual selection or a
 * genuine external `value` change), never re-derived from the transient
 * `options` list — the whole point of this component is that a selected
 * entry can live PAST `initialOptions`' page cap, so `options` may no
 * longer contain it after a later, unrelated search in the same field.
 */
export function SearchCombobox({
  id,
  label,
  value,
  onChange,
  fetchOptions,
  initialOptions,
  placeholder,
  emptyText,
  disabled = false,
}: SearchComboboxProps) {
  const [committedLabel, setCommittedLabel] = useState<string>(() => findLabel(value, initialOptions));
  const [query, setQuery] = useState<string>(committedLabel);
  const [options, setOptions] = useState<SearchComboboxOption[]>(initialOptions);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Tracks the last `value` already reconciled into `committedLabel`/`query`
  // (by `selectOption` OR the render-time adjustment below) — distinguishes
  // "the parent echoed back our own selection" (nothing left to do) from a
  // genuinely EXTERNAL change (a filter reset, a form reset after a
  // successful submit).
  const [reconciledValue, setReconciledValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const listboxId = `${id}-listbox`;

  // Adjusting state when a prop changes, done DURING RENDER (React's
  // documented pattern — https://react.dev/learn/you-might-not-need-an-effect
  // — not a `useEffect`, so there is no extra render-then-flicker and no
  // "setState in an effect" cascade). Skipped while the user is actively
  // browsing/typing (`open`) so an external change never clobbers
  // in-progress interaction — the next render after `open` flips back to
  // `false` re-evaluates this and reconciles then.
  if (value !== reconciledValue && !open) {
    setReconciledValue(value);
    const label = findLabel(value, initialOptions);
    setCommittedLabel(label);
    setQuery(label);
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function openWithOptions(nextOptions: SearchComboboxOption[]): void {
    // Invalidate any pending/in-flight search (review TD-3 D3): without the
    // seq bump, a fetch scheduled by earlier typing could resolve AFTER a
    // blur→refocus reopened browse mode and clobber `nextOptions` with stale
    // results. `runSearch`'s own fetch takes a NEWER seq right after this,
    // so live searches are unaffected.
    seqRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOptions(nextOptions);
    setActiveIndex(nextOptions.length > 0 ? 0 : -1);
    setOpen(true);
  }

  /** Browse mode (focus, or an arrow key while closed) — `initialOptions` verbatim, no fetch. */
  function openBrowseMode(): void {
    openWithOptions(initialOptions);
  }

  /** Search mode (typing) — optimistic client filter now, server-authoritative results ~250ms later. */
  function runSearch(q: string): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim() === '') {
      openWithOptions(initialOptions);
      return;
    }
    const clientMatches = initialOptions.filter((option) => option.label.toLowerCase().includes(q.toLowerCase()));
    openWithOptions(clientMatches);

    const seq = ++seqRef.current;
    debounceRef.current = setTimeout(() => {
      void fetchOptions(q).then((results) => {
        if (seqRef.current !== seq) return; // superseded by a newer search — discard
        setOptions(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
      });
    }, DEBOUNCE_MS);
  }

  function selectOption(option: SearchComboboxOption): void {
    setReconciledValue(option.id);
    setCommittedLabel(option.label);
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(-1);
    onChange(option.id);
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    if (disabled) return;
    openBrowseMode();
    event.target.select();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value;
    setQuery(next);
    runSearch(next);
  }

  function handleBlur(): void {
    setOpen(false);
    setActiveIndex(-1);
    setQuery(committedLabel);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openBrowseMode();
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, options.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openBrowseMode();
        return;
      }
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && options[activeIndex]) {
        // Only swallow Enter when it actually commits a highlighted option —
        // otherwise it falls through to the surrounding <form>'s native
        // submit, same as a plain <select> never intercepted Enter either.
        event.preventDefault();
        selectOption(options[activeIndex]);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      setQuery(committedLabel);
    }
  }

  const activeOptionId = open && activeIndex >= 0 && options[activeIndex] ? `${id}-option-${options[activeIndex].id}` : undefined;

  // No `w-full` on the ROOT (the input itself keeps its own `w-full`,
  // relative to this wrapper): a grid cell (the registration form's
  // `sm:grid-cols-2`) already stretches a block-level child to fill the
  // column by CSS Grid's default `justify-items: stretch`, no explicit
  // width needed — but the SAME `w-full` on a `flex flex-wrap` row (the
  // filter bar) resolves against the whole row's width and forces the item
  // onto its own line. `minWidth: 200` (inline style, story 13.11 — Tailwind
  // retired) alone gives the filter bar a sane floor while staying correct
  // in the grid.
  return (
    // `.fld` (airops.css) gives the same label/control stack as every other
    // slide-over field — the combobox label/input must read EXACTLY like a
    // `Field`+`Input` pair (user decision 2026-07-21: uniform form typography).
    <div className="fld" style={{ position: 'relative', minWidth: 200 }}>
      <label htmlFor={id} className="fld-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        data-testid={id}
        // Review F6: hardcoded light-only colors (`#EAEAEA`/`bg-white`/`#111111`)
        // stayed white in dark theme (billing/logbook/people/Scadenze filter/
        // Quota associativa picker all share this component) — swapped for
        // `airops.css`'s CSS variables, the app's existing dark-mode mechanism
        // (`html[data-theme]`), same as the listbox/options below.
        className="input"
      />
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          // Deliberately NO `aria-label` here: the input already carries the
          // accessible name (its sibling `<label>`) and the combobox/listbox
          // relationship is established via `aria-controls`/
          // `aria-activedescendant` — an `aria-label` matching the input's
          // own label text made Playwright's `getByLabel` resolve TWO
          // elements (the input AND this listbox) for the same name, a real
          // strict-mode collision caught empirically by the e2e run.
          // Prevents the input from blurring when an option is clicked
          // (mousedown fires before click) — without this, `onBlur` would
          // close the popup and revert the query before `onClick` ever runs.
          onMouseDown={(event) => event.preventDefault()}
          // Story 13.5, AC 8: ported off raw Tailwind utilities onto
          // airops.css (`.combo-listbox`/`.combo-option`) — the previous
          // classes never set `font-family` of their own, unlike every other
          // AirOps control; this dropdown's font depended entirely on
          // inheritance reaching <body> instead (see the CSS block's own
          // doc-comment). Now explicit and self-contained, same as the rest
          // of the design system.
          className="combo-listbox"
        >
          {options.length === 0 ? (
            <li role="option" aria-disabled="true" aria-selected="false" className="combo-option combo-option-empty">
              {emptyText}
            </li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.id}
                id={`${id}-option-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={`combo-option${index === activeIndex ? ' active' : ''}`}
              >
                {option.label}
                {option.meta ? <span className="combo-meta">{option.meta}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
