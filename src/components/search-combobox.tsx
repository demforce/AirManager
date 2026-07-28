'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { anchorPositionStyle, computeFixedPopoverAnchor, POPOVER_PORTAL_Z_INDEX, type FixedPopoverAnchor } from './ui/fixed-popover';

/**
 * Story 14.1, AC 1: the dropdown's own natural rendered height cap (mirrors
 * `.combo-listbox`'s CSS `max-height`, `airops.css`) — `computeFixedPopoverAnchor`
 * uses this only to decide whether flipping ABOVE the field is worth it, same
 * "estimate, never a hard floor" role as `CalendarPopover`'s
 * `CAL_POPOVER_HEIGHT_*` constants.
 */
const COMBO_LISTBOX_HEIGHT = 240;

/**
 * Story 14.1 review F3: floor for `computeFixedPopoverAnchor`'s flip-ABOVE
 * `maxHeight`, smaller than `CalendarPopover`'s default `MIN_POPOVER_HEIGHT`
 * (200) — the listbox's option rows are far shorter than a calendar's day
 * grid, so there is no reason to force 200px of height even when the real
 * space above the trigger is smaller, which used to push the popover's top
 * edge past the viewport's own top edge (measured: first option
 * unreachable).
 */
const COMBO_MIN_ABOVE_HEIGHT = 96;

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
  /** Story 14.2, AC 1: same contract as `Field`'s own `error` prop (this component renders its OWN `.fld`, see the doc-comment above) — sets `aria-invalid` on the input and an inline `.fld-error` message right below it. */
  error?: string;
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
  error,
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
  // Story 14.1, AC 1: the listbox's viewport-fixed position, measured off
  // `wrapperRef` (the `.fld` root below) every time it (re)opens — see
  // `openWithOptions`.
  const [anchor, setAnchor] = useState<FixedPopoverAnchor | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // Story 14.1 review F4: the portaled listbox's own root, so the
  // scroll/resize close listener below can tell an internal scroll of the
  // OPTIONS LIST (keep open) apart from a scroll/resize of anything else
  // (close — the anchor measured on open is now stale).
  const listboxRef = useRef<HTMLUListElement | null>(null);
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

  // Story 14.1 review F4 (major): the portaled listbox is `position: fixed`
  // off a rect measured once on open — a scroll of any ANCESTOR (a
  // `SlideOver`'s `.so-body`, the page itself) or a viewport resize moves or
  // resizes the trigger without re-measuring, leaving the listbox floating
  // over unrelated content or (after a resize) partly outside the viewport.
  // Same pattern as `useFixedPopover`'s own close effect (`fixed-popover.ts`)
  // — capture-phase `scroll` (bubbling `scroll` events don't fire on
  // `window` for an inner scrollable container) + `resize`, both closing the
  // popup, EXCEPT when the scroll originated INSIDE the listbox itself
  // (`overflow-y: auto`, scrolling through the options must not close it).
  useEffect(() => {
    if (!open) return;
    function close(event: Event) {
      if (event.target instanceof Node && listboxRef.current?.contains(event.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

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
    // Story 14.1, AC 1: re-measured on every call (focus, arrow key, or each
    // keystroke while typing) — cheap (one `getBoundingClientRect` + pure
    // math) and keeps the popover correctly placed even if the page
    // scrolled since it last opened.
    if (wrapperRef.current) {
      setAnchor(
        computeFixedPopoverAnchor(wrapperRef.current.getBoundingClientRect(), COMBO_LISTBOX_HEIGHT, {
          // Story 14.1 review F2/F3: the combobox's own tradeoffs, see
          // `FixedPopoverAnchorOptions` — `CalendarPopover`/`date-input`/
          // `datetime-input` keep the defaults (no options passed) untouched.
          neverOverlapTrigger: true,
          minAboveHeight: COMBO_MIN_ABOVE_HEIGHT,
        }),
      );
    }
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
    // No `position: relative` needed (story 14.1): the listbox below is
    // `position: fixed` + portaled, measured off `wrapperRef` directly
    // rather than relying on this box as its containing block.
    <div className="fld" style={{ minWidth: 200 }} ref={wrapperRef}>
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
        aria-invalid={Boolean(error)}
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
      {/* Story 14.2, AC 1: same `.fld-error` inline message as `Field`. */}
      {error ? (
        <span className="fld-error" role="alert">
          {error}
        </span>
      ) : null}
      {open && anchor
        ? createPortal(
            <ul
              id={listboxId}
              role="listbox"
              // Deliberately NO `aria-label` here: the input already carries
              // the accessible name (its sibling `<label>`) and the
              // combobox/listbox relationship is established via
              // `aria-controls`/`aria-activedescendant` — an `aria-label`
              // matching the input's own label text made Playwright's
              // `getByLabel` resolve TWO elements (the input AND this
              // listbox) for the same name, a real strict-mode collision
              // caught empirically by the e2e run.
              // Prevents the input from blurring when an option is clicked
              // (mousedown fires before click) — without this, `onBlur`
              // would close the popup and revert the query before `onClick`
              // ever runs. Still works across the portal boundary: React
              // dispatches synthetic events along the REACT tree, not the
              // DOM tree, so this handler sees the same mousedown it always
              // did (`react-dom`'s documented portal event behavior).
              onMouseDown={(event) => event.preventDefault()}
              ref={listboxRef}
              className="combo-listbox"
              style={{
                position: 'fixed',
                ...anchorPositionStyle(anchor),
                left: anchor.triggerRect.left,
                width: anchor.triggerRect.width,
                // Story 14.1 review F1 (major): `anchor.maxHeight` is the
                // SPACE AVAILABLE (up to 616px measured with 80-100 options),
                // not a rendering cap — capping it to the CSS class's own
                // `max-height: 240px` (`.combo-listbox`, airops.css) keeps
                // that rule the one real source of truth instead of dead
                // code always overridden by this inline style.
                maxHeight: Math.min(COMBO_LISTBOX_HEIGHT, anchor.maxHeight),
                zIndex: POPOVER_PORTAL_Z_INDEX,
                overflowY: 'auto',
              }}
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
