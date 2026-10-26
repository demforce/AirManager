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
 *
 * Story 15.5 adds the PHONE face of the same card (`.fleet-mobile`, two
 * columns, hours bar, detail sheet) as a SIBLING of `FleetCardGrid`, never
 * inside it (AD-2): that component is also rendered by the Overview's
 * `FleetCard` widget, and a testid added there would exist twice on
 * `/dashboard` — which `mobile-overview.spec.ts` asserts against at 375 AND
 * 1280px. The switch between the two faces is CSS only, on the two classes
 * this file owns (`.fleet-desktop-body`/`.fleet-mobile`), never on
 * `.fleet-grid`/`.ac-card` (shared) — precedent `.ppr-queue-mobile` (15.2),
 * `.bookings-mobile` (15.4).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FleetCardGrid, badgeFor, type FleetCardItem } from '@/components/dashboard/fleet-card';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { hoursBarPercent } from '@/lib/mobile-registries';
import { formatCents } from '@/lib/money';
import { formatMinutes } from '@/lib/time';
import { AircraftEditor, type AircraftEditorLabels } from './aircraft-editor';

export type { FleetCardItem } from '@/components/dashboard/fleet-card';

/**
 * The fleet page's own row: the shared card item PLUS `outOfServiceUntil`
 * (story AOG-1a), which only the editor's Disponibilità section reads.
 * Deliberately widened HERE and not on `FleetCardItem` itself: R-AOG-e keeps
 * every card surface — including the Panoramica's `FleetCardGrid`, which shares
 * that type — out of this story's perimeter. `FleetCardGrid`/`badgeFor` accept
 * the narrower type and are handed these rows unchanged.
 */
export type FleetConsoleItem = FleetCardItem & { outOfServiceUntil: string | null };

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
  /** Story 15.5 — the phone face only (card caption + detail sheet). */
  mobile: {
    monthHours: string;
    openDetail: string;
    close: string;
    edit: string;
    sheet: { status: string; aogReason: string; rate: string; seats: string; fuel: string; hourMeter: string; monthHours: string; notes: string };
    noValue: string;
  };
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
  items: FleetConsoleItem[];
  page: number;
  totalPages: number;
  initialQuery: string;
  initialIncludeArchived: boolean;
  exportHref: string;
  locale: 'it' | 'en';
  /** Story 15.5 (R-15.5-b): flown minutes of the CURRENT MONTH, per aircraft of THIS page — `sumFlightMinutesByAircraft`. Missing key = did not fly. */
  monthMinutesById: Record<string, number>;
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

type EditorTarget = { mode: 'new' } | { mode: 'edit'; aircraft: FleetConsoleItem };

export function FleetConsole({
  items,
  page,
  totalPages,
  initialQuery,
  initialIncludeArchived,
  exportHref,
  locale,
  monthMinutesById,
  labels,
}: FleetConsoleProps) {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [includeArchived, setIncludeArchived] = useState(initialIncludeArchived);
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => setSheetId(null), []);

  const sheetAircraft = items.find((item) => item.id === sheetId) ?? null;
  /** The page's busiest aircraft — the bar's 100% (see `hoursBarPercent`'s doc-comment). */
  const maxMonthMinutes = items.reduce((max, item) => Math.max(max, monthMinutesById[item.id] ?? 0), 0);

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
        {/* ONE head at every width (AD-3): the four controls keep their testids
            and their state, and ratifica R-15.5-g's phone layout (search
            full-width, "Archiviati" as a chip, CTA full-width) is CSS on the
            `.registry-head` class this card owns — a second, mobile-only copy of
            any of them would be a second source of truth for the same query
            string and a duplicate testid at 1280px. The search box's width moved
            from an inline style to `.registry-search` for exactly that reason:
            an inline `width: 240` cannot be widened by a media query. */}
        <div className="card-head registry-head">
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
          <div className="search registry-search">
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

        <div className="fleet-desktop-body">
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
              /* The grid hands back the NARROW shared `FleetCardItem` (story
                 AOG-1a leaves `fleet-card.tsx` untouched, R-AOG-e) — the row
                 with the fermo date is looked up here, in this page's own
                 `items`. */
              onCardClick={(ac) => {
                const aircraft = items.find((item) => item.id === ac.id);
                if (aircraft) setTarget({ mode: 'edit', aircraft });
              }}
            />
          )}
        </div>

        {/* --- the phone face of the same list (template 191-201) -------------
            Two equal columns of ONE `<button>` each (R-15.5-i): the card is the
            trigger of the detail sheet, so there is no nested interactive
            element and the touch target IS the card. The AOG tint stays the
            app's own `.ac-card.aog` recipe, not the template's `color-mix`. */}
        <div className="fleet-mobile" data-testid="mobile-fleet-grid">
          {items.length === 0 ? (
            <p className="mobile-card-empty" data-testid="mobile-fleet-empty">
              {labels.empty}
            </p>
          ) : (
            items.map((aircraft) => {
              const minutes = monthMinutesById[aircraft.id] ?? 0;
              const aog = aircraft.status === 'OUT_OF_SERVICE';
              return (
                <button
                  key={aircraft.id}
                  type="button"
                  className={`mobile-ac-card ${aog ? 'aog' : ''}`}
                  aria-label={`${labels.mobile.openDetail}: ${aircraft.registration} · ${aircraft.model}`}
                  onClick={() => setSheetId(aircraft.id)}
                  data-testid={`mobile-fleet-card-${aircraft.id}`}
                >
                  <span className="mobile-ac-tail">{aircraft.registration}</span>
                  <span className="mobile-ac-status">{badgeFor(aircraft, labels.badge)}</span>
                  <span className="mobile-ac-model">{aircraft.model}</span>
                  <span className="mobile-ac-meter">
                    <span>{labels.rateLabel}</span>
                    <span className="v">{aircraft.wetRateCents === null ? labels.mobile.noValue : `${formatCents(aircraft.wetRateCents, locale)}/h`}</span>
                  </span>
                  <span className="meter-bar">
                    <span className={`fill ${aog ? 'bad' : ''}`} style={{ width: `${hoursBarPercent(minutes, maxMonthMinutes)}%` }} />
                  </span>
                  <span className="mobile-ac-meter">
                    <span>{labels.mobile.monthHours}</span>
                    <span className="v">{formatMinutes(minutes)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {totalPages > 1 ? (
          <div className="card-body registry-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
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
        locale={locale}
        labels={labels.editor}
        toastLabels={labels.toast}
      />

      {/* Rendered conditionally (AD-7): `mobile-fleet-sheet` is ONE node.
          "Modifica" CLOSES the sheet before opening the full-screen editor
          rather than stacking a z-50 panel on a z-40 sheet (R-15.4-d). */}
      {sheetAircraft ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-fleet-sheet"
          // Review 15.5 F1: the `sub` ends up inside the dialog's accessible
          // name (`${sub} — ${title}`, `bottom-sheet.tsx`), so an ABSENT segment
          // is OMITTED here, never replaced by the "—" placeholder: 115 of the
          // 121 active aircraft have no `fuelType`, and the placeholder made
          // every one of their names read "Basato · — — I-ABCD · …".
          sub={[sheetAircraft.based ? labels.editor.identity.basedOptions.based : labels.editor.identity.basedOptions.guest, sheetAircraft.fuelType]
            .filter((part): part is string => Boolean(part))
            .join(' · ')}
          title={`${sheetAircraft.registration} · ${sheetAircraft.model}`}
          badge={badgeFor(sheetAircraft, labels.badge)}
          rows={fleetSheetRows(sheetAircraft, monthMinutesById[sheetAircraft.id] ?? 0, locale, labels)}
          closeLabel={labels.mobile.close}
          actions={
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const aircraft = sheetAircraft;
                closeSheet();
                setTarget({ mode: 'edit', aircraft });
              }}
              data-testid="aircraft-edit-mobile"
            >
              {labels.mobile.edit}
            </button>
          }
        />
      ) : null}
    </>
  );
}

/** Detail rows of the fleet sheet — the template's own `openTail` builder (script 598-599), with the app's fields. */
function fleetSheetRows(aircraft: FleetConsoleItem, monthMinutes: number, locale: 'it' | 'en', labels: FleetConsoleLabels): BottomSheetRow[] {
  const statusLabel = aircraft.archivedAt !== null ? labels.badge.archived : aircraft.status === 'OUT_OF_SERVICE' ? labels.badge.aog : aircraft.reserved ? labels.badge.reserved : labels.badge.available;
  const rows: BottomSheetRow[] = [{ k: labels.mobile.sheet.status, v: statusLabel }];
  if (aircraft.status === 'OUT_OF_SERVICE' && aircraft.statusReason) {
    rows.push({ k: labels.mobile.sheet.aogReason, v: aircraft.statusReason });
  }
  rows.push(
    { k: labels.mobile.sheet.rate, v: aircraft.wetRateCents === null ? labels.mobile.noValue : `${formatCents(aircraft.wetRateCents, locale)}/h` },
    { k: labels.mobile.sheet.seats, v: aircraft.seats === null ? labels.mobile.noValue : String(aircraft.seats) },
    { k: labels.mobile.sheet.fuel, v: aircraft.fuelType ?? labels.mobile.noValue },
    { k: labels.mobile.sheet.hourMeter, v: formatMinutes(aircraft.hourMeterMinutes) },
    { k: labels.mobile.sheet.monthHours, v: formatMinutes(monthMinutes) },
    { k: labels.mobile.sheet.notes, v: aircraft.notes ?? labels.mobile.noValue },
  );
  return rows;
}
