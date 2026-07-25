'use client';

/**
 * Fleet card-grid console (story 12.5, AC 2/3) — port of
 * `docs/design-reference/airops/src/Fleet.jsx#FleetCard` onto real,
 * paginated/searchable data. Card-grid coherence with the shell (`.card` +
 * `.card-head` search/toggle, same idiom `People.jsx`'s own list-in-card
 * layout uses) rather than the prototype's own bare embedded-tile markup —
 * this is a full standalone page, not a dashboard widget.
 *
 * The `.fleet-grid`/`.ac-card` markup itself moved to
 * `@/components/dashboard/fleet-card.tsx` (story 12.12 AC 3), so this
 * console and the Overview's compact widget render the SAME grid — this
 * file now CONSUMES `FleetCardGrid`, re-exporting `FleetCardItem` for its
 * existing consumers (`aircraft-editor.tsx`, `fleet/page.tsx`).
 */
import { useEffect, useRef, useState } from 'react';
import { FleetCardGrid, type FleetCardItem } from '@/components/dashboard/fleet-card';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { AircraftEditor, type AircraftEditorLabels } from './aircraft-editor';

export type { FleetCardItem } from '@/components/dashboard/fleet-card';

export type FleetConsoleLabels = {
  cardTitle: string;
  searchPlaceholder: string;
  includeArchivedLabel: string;
  empty: string;
  newAircraft: string;
  rateLabel: string;
  exportLabel: string;
  exportXls: string;
  pagination: { prev: string; next: string };
  badge: { aog: string; reserved: string; available: string; archived: string };
  editor: AircraftEditorLabels;
  toast: {
    created: string;
    updated: string;
    archived: string;
    unarchived: string;
    setOutOfService: string;
    returnedToService: string;
    hourMeterAdjusted: string;
    rateAdded: string;
  };
};

type FleetConsoleProps = {
  items: FleetCardItem[];
  page: number;
  totalPages: number;
  initialQuery: string;
  initialIncludeArchived: boolean;
  canManageSettings: boolean;
  exportHref: string;
  locale: 'it' | 'en';
  labels: FleetConsoleLabels;
};

/** Same debounce-before-navigating idiom as `people-manager.tsx`/the legacy `aircraft-manager.tsx` this replaces. */
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

type EditorTarget = { mode: 'new' } | { mode: 'edit'; aircraft: FleetCardItem };

export function FleetConsole({
  items,
  page,
  totalPages,
  initialQuery,
  initialIncludeArchived,
  canManageSettings,
  exportHref,
  locale,
  labels,
}: FleetConsoleProps) {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);
  const [target, setTarget] = useState<EditorTarget | null>(null);

  function navigate(next: { q: string; includeArchived: boolean }): void {
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.includeArchived) params.set('includeArchived', 'true');
    const search = params.toString();
    router.push(`/dashboard/fleet${search ? `?${search}` : ''}`);
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    navigate({ q: value, includeArchived });
  }, 400);

  function handleQueryChange(value: string): void {
    setQueryInput(value);
    debouncedSearch(value);
  }

  function handleIncludeArchivedChange(checked: boolean): void {
    setIncludeArchived(checked);
    navigate({ q: queryInput, includeArchived: checked });
  }

  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/fleet' as const,
      query: { page: targetPage, ...(queryInput ? { q: queryInput } : {}), ...(includeArchived ? { includeArchived: 'true' } : {}) },
    };
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          <button
            type="button"
            className={`btn ${includeArchived ? 'on' : ''}`}
            aria-pressed={includeArchived}
            onClick={() => handleIncludeArchivedChange(!includeArchived)}
            data-testid="fleet-toggle-archived"
          >
            {includeArchived ? <Icon.check /> : null}
            {labels.includeArchivedLabel}
          </button>
          <div className="search" style={{ width: 240 }}>
            <Icon.search />
            <input
              className="bare-input"
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              value={queryInput}
              onChange={(event) => handleQueryChange(event.target.value)}
              data-testid="fleet-search"
            />
          </div>
          <ExportMenu label={labels.exportLabel} xlsLabel={labels.exportXls} xlsHref={exportHref} pdfLabel="" />
          <button type="button" className="btn primary" onClick={() => setTarget({ mode: 'new' })} data-testid="fleet-new-button">
            <Icon.plus /> {labels.newAircraft}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="card-body" data-testid="fleet-empty">
            {labels.empty}
          </p>
        ) : (
          <FleetCardGrid
            items={items}
            locale={locale}
            rateLabel={labels.rateLabel}
            badgeLabels={labels.badge}
            onCardClick={(ac) => setTarget({ mode: 'edit', aircraft: ac })}
          />
        )}

        {totalPages > 1 ? (
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              data-testid="fleet-page-prev"
              className="btn"
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="fleet-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              data-testid="fleet-page-next"
              className="btn"
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      <AircraftEditor
        // Remounts per target (same rationale as the legacy `key={panel.aircraft.id}`
        // trick): a fresh internal copy of the aircraft's fields every time a
        // DIFFERENT card (or "new") is opened, so no stale state bleeds across.
        key={target === null ? 'closed' : target.mode === 'new' ? 'new' : target.aircraft.id}
        target={target}
        onClose={() => setTarget(null)}
        onMutated={() => router.refresh()}
        canManageSettings={canManageSettings}
        locale={locale}
        labels={labels.editor}
        toastLabels={labels.toast}
      />
    </>
  );
}
