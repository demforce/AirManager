'use client';

/**
 * Fleet card-grid console (story 12.5, AC 2/3) — port of
 * `docs/design-reference/airops/src/Fleet.jsx#FleetCard` onto real,
 * paginated/searchable data. Card-grid coherence with the shell (`.card` +
 * `.card-head` search/toggle, same idiom `People.jsx`'s own list-in-card
 * layout uses) rather than the prototype's own bare embedded-tile markup —
 * this is a full standalone page, not a dashboard widget (that's story
 * 12.12's FleetCard reuse, out of scope here).
 */
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents } from '@/lib/money';
import { AircraftEditor, type AircraftEditorLabels } from './aircraft-editor';

export type FleetCardItem = {
  id: string;
  registration: string;
  type: string;
  model: string;
  hourMeterMinutes: number;
  notes: string | null;
  status: 'OPERATIONAL' | 'OUT_OF_SERVICE';
  statusReason: string | null;
  seats: number | null;
  fuelType: string | null;
  owner: 'CLUB' | 'PRIVATE';
  based: boolean;
  /** ISO string or `null` — active. */
  archivedAt: string | null;
  /** The wet hourly rate in effect TODAY (batched `getEffectiveRates`), or `null` if none is on file. */
  wetRateCents: number | null;
  /** Derived, presentational (AC 2): an APPROVED booking covers `now`. */
  reserved: boolean;
};

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

  function badgeFor(item: FleetCardItem): React.JSX.Element {
    if (item.archivedAt !== null) {
      return <Badge dot>{labels.badge.archived}</Badge>;
    }
    if (item.status === 'OUT_OF_SERVICE') {
      return (
        <Badge tone="bad" dot>
          {labels.badge.aog}
        </Badge>
      );
    }
    if (item.reserved) {
      return (
        <Badge tone="warn" dot>
          {labels.badge.reserved}
        </Badge>
      );
    }
    return (
      <Badge tone="ok" dot>
        {labels.badge.available}
      </Badge>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.cardTitle}</div>
          <div className="spacer" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={includeArchived} onChange={(event) => handleIncludeArchivedChange(event.target.checked)} />
            {labels.includeArchivedLabel}
          </label>
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
          <div className="fleet-grid">
            {items.map((ac) => (
              <div
                key={ac.id}
                className={`ac-card ${ac.status === 'OUT_OF_SERVICE' ? 'aog' : ''}`}
                onClick={() => setTarget({ mode: 'edit', aircraft: ac })}
                data-testid={`ac-card-${ac.id}`}
              >
                <div className="ac-head">
                  <div className="ac-tail">{ac.registration}</div>
                  {badgeFor(ac)}
                </div>
                <div className="ac-silhouette">
                  <Icon.acsmall />
                </div>
                <div className="ac-model">{ac.model}</div>
                <div className="meter-row" style={{ marginTop: 2 }}>
                  <span>{labels.rateLabel}</span>
                  <span className="v mono">{ac.wetRateCents === null ? '—' : `${formatCents(ac.wetRateCents, locale)}/h`}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              data-testid="fleet-page-prev"
              className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
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
              className={`btn ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
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
