'use client';

import { createContext, useContext, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from './badge';
import { Button } from './button';

type FilterDisclosureState = {
  open: boolean;
  toggle: () => void;
  activeCount: number;
  testId: string;
};

const FilterDisclosureContext = createContext<FilterDisclosureState | null>(null);

function useFilterDisclosureContext(caller: string): FilterDisclosureState {
  const context = useContext(FilterDisclosureContext);
  if (!context) throw new Error(`${caller} must be rendered inside <FilterDisclosure>`);
  return context;
}

export type FilterDisclosureProps = {
  /** Count of currently-active filter fields — shown as a `Badge` on the trigger when > 0. */
  activeCount: number;
  /** Open state at mount (caller passes its own `hasActiveFilter`) — this component owns the open/closed toggle from then on, it does not resync on later prop changes. A fresh page load or deep link always mounts with the URL's own `hasActiveFilter`, so it lands pre-opened correctly regardless of surface. Two of the four adopting surfaces (flights, ppr-register) additionally key their manager on the filters (`key={JSON.stringify(filters)}`, pre-existing pattern), so an in-session filter change there also remounts this disclosure — closing it back down after "Azzera filtri". The other two (cash-register, expiry-dashboard) don't remount on a live tweak, so the panel simply stays as the user left it. */
  defaultOpen: boolean;
  /** Base testid — the trigger button gets `${testId}-toggle`, the active-count badge `${testId}-count`. The panel itself is the caller's own pre-existing testid (e.g. `flight-filter-bar`), left untouched. */
  testId: string;
  children: React.ReactNode;
};

/**
 * Reusable "Filtri" disclosure (TD-6, AC 1 — DESIGN.md: outline `Button` +
 * solid `Badge` counter, both existing primitives, no new visual language).
 * Hides a multi-control filter bar behind a toggle by default; auto-opens
 * only when a filter is already active at mount (deep links, drill-downs).
 *
 * Compound shape (UI-audit follow-up 2026-07-13, user: the "Filtri" trigger
 * belongs NEXT TO the "Esporta" action, not alone on its own row): the state
 * lives here in a context provider, `FilterDisclosureTrigger` renders inside
 * the caller's header/action row and `FilterDisclosurePanel` spans full-width
 * below it. The provider renders `children` bare (no wrapper element), so the
 * caller's own layout (`space-y`, borders) applies directly.
 *
 * The trigger label reads `DashboardShell.filtersToggle` directly
 * (`useTranslations`, same client-side shell-string pattern as
 * `search-trigger.tsx`) — ONE shared i18n key for all 4 adopting surfaces.
 */
export function FilterDisclosure({ activeCount, defaultOpen, testId, children }: FilterDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <FilterDisclosureContext.Provider
      value={{ open, toggle: () => setOpen((current) => !current), activeCount, testId }}
    >
      {children}
    </FilterDisclosureContext.Provider>
  );
}

/** The "Filtri" toggle button — place it in the same action row as the export/new-item buttons. `min-h-[40px]` matches `ExportButton`/`Menu`'s trigger height so the row reads as one aligned group. */
export function FilterDisclosureTrigger() {
  const { open, toggle, activeCount, testId } = useFilterDisclosureContext('FilterDisclosureTrigger');
  const t = useTranslations('DashboardShell');

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      aria-expanded={open}
      data-testid={`${testId}-toggle`}
      className="min-h-[40px] gap-2"
    >
      {t('filtersToggle')}
      {activeCount > 0 ? (
        <Badge variant="solid" data-testid={`${testId}-count`}>
          {activeCount}
        </Badge>
      ) : null}
    </Button>
  );
}

/** The filter bar itself — rendered only while the disclosure is open. */
export function FilterDisclosurePanel({ children }: { children: React.ReactNode }) {
  const { open } = useFilterDisclosureContext('FilterDisclosurePanel');
  return open ? children : null;
}
