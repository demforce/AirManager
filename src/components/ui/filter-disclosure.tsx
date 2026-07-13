'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from './badge';
import { Button } from './button';

export type FilterDisclosureProps = {
  /** Count of currently-active filter fields — shown as a `Badge` on the toggle when > 0. */
  activeCount: number;
  /** Open state at mount (caller passes its own `hasActiveFilter`) — this component owns the open/closed toggle from then on, it does not resync on later prop changes. A fresh page load or deep link always mounts with the URL's own `hasActiveFilter`, so it lands pre-opened correctly regardless of surface. Two of the four adopting surfaces (flights, ppr-register) additionally key their manager on the filters (`key={JSON.stringify(filters)}`, pre-existing pattern), so an in-session filter change there also remounts this disclosure — closing it back down after "Azzera filtri". The other two (cash-register, expiry-dashboard) don't remount on a live tweak, so the panel simply stays as the user left it. */
  defaultOpen: boolean;
  /** Base testid — the toggle button gets `${testId}-toggle`, the active-count badge `${testId}-count`. The panel itself is `children`'s own pre-existing testid (e.g. `flight-filter-bar`), left untouched. */
  testId: string;
  children: React.ReactNode;
};

/**
 * Reusable "Filtri" disclosure (TD-6, AC 1 — DESIGN.md: outline `Button` +
 * solid `Badge` counter, both existing primitives, no new visual language).
 * Hides a multi-control filter bar behind a toggle by default; auto-opens
 * only when a filter is already active at mount (deep links, drill-downs).
 * A native `<details>` was considered (story Dev Notes) but its `<summary>`
 * marker needs UA-style overrides to read as an outline `Button` with a
 * `Badge` — a plain `useState` toggle keeps the trigger a normal `Button`
 * and stays simpler for that visual requirement.
 *
 * The toggle label reads `DashboardShell.filtersToggle` directly (`useTranslations`,
 * same client-side shell-string pattern as `search-trigger.tsx`) — ONE shared
 * i18n key for all 4 adopting surfaces (Dev Notes: "scegliere UNA collocazione
 * condivisa e dichiararla") instead of threading a `label` prop through every
 * page.tsx/manager.
 */
export function FilterDisclosure({ activeCount, defaultOpen, testId, children }: FilterDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const t = useTranslations('DashboardShell');

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
        className="w-fit gap-2"
      >
        {t('filtersToggle')}
        {activeCount > 0 ? (
          <Badge variant="solid" data-testid={`${testId}-count`}>
            {activeCount}
          </Badge>
        ) : null}
      </Button>
      {open ? children : null}
    </div>
  );
}
