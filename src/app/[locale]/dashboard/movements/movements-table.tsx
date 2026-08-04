'use client';

/**
 * "Registro movimenti" table (epic 8, story 8.3; epic 12, story 12.4, AC 3)
 * — port of `docs/design-reference/airops/src/Ops.jsx#VisitingView`'s
 * table onto real data, extended with the fee/actions columns the
 * prototype's own static mock never needed (it has no completion
 * workflow). Model: `flights-manager.tsx`'s `FilterBar` for the
 * status/period controls (live-apply, "Azzera filtri" TD-5 semantics,
 * UNCHANGED from the pre-12.4 register), `finance/cash-register.tsx`'s
 * `ReverseForm` for the per-row "Completa" panel (remount via row `key`,
 * `useIdempotencyKey`). `router.refresh()` after any mutation (AD-1).
 *
 * Story 15.7 added the phone face (ratifiche R-15.7-c/d/f): the nine-column
 * table becomes one card per transit plus a detail sheet, the stato becomes a
 * chip strip, the periodo moves into a "Filtri" panel that applies in ONE
 * navigation, and the closure — which writes a real `CashMovement` and cannot
 * be undone from the UI — becomes a `secondStep` INSIDE that sheet, rendering
 * the very same `CompleteForm` the desktop row panel renders. Measured
 * pre-fix at 375px: reaching "Completa" took 483px of horizontal scroll and
 * the panel then opened 483px to the LEFT of the finger that had just tapped.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { DateInput } from '@/components/ui/date-input';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Select } from '@/components/ui/field';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { requesterLabel, transitCardSubLine, transitRouteLabel, transitSheetSub } from '@/lib/mobile-movements';
import { formatCents, parseCents } from '@/lib/money';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';
import { formatDateTime, formatTimeOfDay } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import type { ApprovedPprMovementStatus } from '@/lib/ppr-movement-status';

export type MovementStatusLabel = ApprovedPprMovementStatus | 'PARTITO' | 'PENDING' | 'REJECTED' | 'CANCELLED';

export type MovementRowDto = PprRequestItemDto & { movementStatus: MovementStatusLabel };

export type MovementsFilters = { status: string; from: string; to: string };

export type MovementsTableLabels = {
  filters: {
    status: string;
    statusAll: string;
    statusOptions: { pending: string; approved: string; rejected: string; completed: string; cancelled: string };
    from: string;
    to: string;
    reset: string;
  };
  card: { title: string; subTemplate: string };
  table: {
    aircraft: string;
    type: string;
    route: string;
    requester: string;
    eta: string;
    etd: string;
    status: string;
    fee: string;
    actions: string;
    noValue: string;
  };
  status: Record<MovementStatusLabel, string>;
  actions: {
    complete: string;
    cancel: string;
    confirmCancelPrompt: string;
    confirmYes: string;
    confirmNo: string;
    feeLabel: string;
    feeHint: string;
    invalidFee: string;
    /** Story Billing-1 review D2: the completion panel's mandatory payment-method Select — same pattern as `billing/transaction-editor.tsx`'s own method field. */
    methodLabel: string;
    methods: { CASH: string; BANK_TRANSFER: string; POS: string };
    submitComplete: string;
    closePanel: string;
  };
  toast: { completed: string; cancelled: string; conflictError: string; genericError: string };
  empty: string;
  /**
   * Story 15.7 — only the words the phone face has no desktop equivalent for.
   * Everything the desktop already spells out (the nine column heads, the two
   * action labels, the cancel prompt) is borrowed from `table.*`/`actions.*`.
   */
  mobile: {
    openDetail: string;
    close: string;
    back: string;
    pprNumber: string;
    email: string;
    phone: string;
    personsOnBoard: string;
    notes: string;
    source: string;
    sourcePublic: string;
    rejectionReason: string;
    closedAt: string;
    filters: string;
    /** `{count}` filled client-side (`t.raw`) — how many PANEL filters are active. */
    filtersCount: string;
    filtersTitle: string;
    apply: string;
  };
};

type MovementsTableProps = {
  rows: MovementRowDto[];
  locale: 'it' | 'en';
  filters: MovementsFilters;
  /** Export trigger button text (e.g. "Esporta") — distinct from `exportXlsLabel` (the dropdown entry text, e.g. "Esporta Excel"), same `ExportMenu` split as `bookings-table.tsx`. */
  exportTriggerLabel: string;
  exportXlsLabel: string;
  exportHref: string;
  /** Story 13.6, AC 4 — the PDF counterpart of `exportXlsLabel`/`exportHref` (was `pdfLabel=""`, xlsx-only). */
  exportPdfLabel: string;
  exportPdfHref: string;
  labels: MovementsTableLabels;
};

type ApiErrorBody = { error?: { code?: string } };

async function isConflict(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code === 'PPR_NOT_APPROVED';
}

const MOVEMENT_STATUS_TONE: Record<MovementStatusLabel, BadgeTone> = {
  ATTESO: 'warn',
  IN_ARRIVO: 'info',
  AL_SUOLO: 'ok',
  PARTITO: '',
  PENDING: 'warn',
  REJECTED: 'bad',
  CANCELLED: '',
};

/** The six values of the desktop `<select>`, in its own order — the chip strip renders exactly these (AC 2 covers all seven statuses the list can show). */
const STATUS_FILTER_VALUES = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'] as const;

const inputClasses = 'input';

export function MovementsTable({
  rows,
  locale,
  filters,
  exportTriggerLabel,
  exportXlsLabel,
  exportHref,
  exportPdfLabel,
  exportPdfHref,
  labels,
}: MovementsTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [rowAction, setRowAction] = useState<{ id: string; mode: 'complete' | 'cancelConfirm' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- phone-only state (story 15.7) ---------------------------------------
  // The row-detail sheet and its two second steps (the closure form and the
  // cancel confirmation), plus the draft of the "Filtri" panel. All of it dies
  // with the console at every navigation (`page.tsx`'s own `key`), which is
  // exactly why the panel applies ONCE instead of navigating per change (AD-4).
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'none' | 'complete' | 'cancelConfirm'>('none');
  /** `null` while the panel is closed; the filter values being edited while it is open. */
  const [filterDraft, setFilterDraft] = useState<MovementsFilters | null>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('none');
  }, []);

  function navigate(next: MovementsFilters): void {
    const params = new URLSearchParams();
    if (next.status !== 'APPROVED') params.set('status', next.status);
    if (next.from) params.set('from', next.from);
    if (next.to) params.set('to', next.to);
    const search = params.toString();
    router.push(`/dashboard/movements${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<MovementsFilters>): void {
    navigate({ ...filters, ...patch });
  }

  function handleResetFilters(): void {
    // TD-5 AC 4: back to the page's own default (`APPROVED`, no period bound).
    navigate({ status: 'APPROVED', from: '', to: '' });
  }

  const hasActiveFilter = filters.status !== 'APPROVED' || filters.from !== '' || filters.to !== '';

  /**
   * A status chip's href. It produces the SAME URL the desktop `<select>`
   * would and drops `?page`: a different filter is a different result set
   * (precedent 15.4/15.6). A `Link` is safe here — unlike the Scadenze
   * console, this component IS remounted on every navigation (`page.tsx`'s
   * `key`), so its props are always the URL's own truth.
   */
  function statusChipHref(nextStatus: string) {
    const query: Record<string, string> = {};
    if (nextStatus !== 'APPROVED') query['status'] = nextStatus;
    if (filters.from) query['from'] = filters.from;
    if (filters.to) query['to'] = filters.to;
    return { pathname: '/dashboard/movements' as const, query };
  }

  /** How many of the filters the phone HIDES inside the panel are active — the count on its trigger. Stato is not counted: it is in plain sight, on the chips. */
  const panelActiveCount = (filters.from !== '' || filters.to !== '' ? 1 : 0);

  /** Opening the panel seeds the draft with the values in force (AD-4); there is no debounced control on this head, so nothing has to be cancelled. */
  function openFilterPanel(): void {
    setFilterDraft({ ...filters });
  }

  /** ONE navigation on "Applica" (AD-4) — navigating per `onChange`, as the desktop head does, would remount this component and close the panel under the reader's thumb. */
  function applyFilterDraft(): void {
    if (filterDraft === null) return;
    const next = filterDraft;
    setFilterDraft(null);
    navigate(next);
  }

  function startComplete(id: string): void {
    setRowAction({ id, mode: 'complete' });
  }

  function startCancelConfirm(id: string): void {
    setRowAction({ id, mode: 'cancelConfirm' });
  }

  function closeRowAction(): void {
    setRowAction(null);
  }

  async function confirmCancel(id: string): Promise<void> {
    setBusyId(id);
    const response = await fetch(`/api/v1/ppr-requests/${id}/cancel`, { method: 'POST' });
    setBusyId(null);

    if (!response.ok) {
      setRowAction(null);
      toast.show((await isConflict(response)) ? labels.toast.conflictError : labels.toast.genericError, 'bad');
      return;
    }

    setRowAction(null);
    toast.show(labels.toast.cancelled, 'ok');
    router.refresh();
  }

  /** The phone twin of the desktop's inline confirmation: the SAME network path (AD-8), only the place the decision is taken changes. */
  async function confirmCancelFromSheet(id: string): Promise<void> {
    await confirmCancel(id);
    closeSheet();
  }

  const cols = '90px 90px 120px 1.2fr 1fr 1fr 110px 90px 170px';

  /** Re-read from `rows` on every render: after a closure the same row comes back COMPLETED, and the sheet must not keep showing the copy it was opened with. */
  const sheetRow = rows.find((row) => row.id === sheetId) ?? null;

  /**
   * Parity of the sheet with the desktop row (AC 3, lesson 15.5 F2): the nine
   * columns — marche (the title), tipo (the over-line), rotta, richiedente +
   * email + telefono, ETA, ETD, stato (the badge), tassa, azioni (the action
   * row) — plus the fields the DTO carries and the table has no room for
   * (`pprNumber` on the over-line, `personsOnBoard`, `notes`, `fromPublicForm`)
   * and the two that exist only on some rows (`rejectionReason`, `closedAt`).
   */
  function sheetRows(row: MovementRowDto): BottomSheetRow[] {
    const detail: BottomSheetRow[] = [
      { k: labels.table.route, v: transitRouteLabel(row.origin, row.destination) ?? labels.table.noValue },
      { k: labels.table.requester, v: requesterLabel(row) },
      { k: labels.mobile.email, v: row.email ?? labels.table.noValue },
      { k: labels.mobile.phone, v: row.phone },
      { k: labels.table.eta, v: formatDateTime(new Date(row.eta), locale) },
      { k: labels.table.etd, v: row.etd ? formatDateTime(new Date(row.etd), locale) : labels.table.noValue },
      { k: labels.mobile.personsOnBoard, v: row.personsOnBoard },
      { k: labels.table.fee, v: row.landingFeeCents !== null ? formatCents(row.landingFeeCents, locale) : labels.table.noValue },
      { k: labels.mobile.notes, v: row.notes ?? labels.table.noValue },
    ];
    if (row.pprNumber) detail.unshift({ k: labels.mobile.pprNumber, v: row.pprNumber });
    if (row.fromPublicForm) detail.push({ k: labels.mobile.source, v: <Badge>{labels.mobile.sourcePublic}</Badge> });
    if (row.rejectionReason) detail.push({ k: labels.mobile.rejectionReason, v: row.rejectionReason });
    if (row.closedAt) detail.push({ k: labels.mobile.closedAt, v: formatDateTime(new Date(row.closedAt), locale) });
    return detail;
  }

  return (
    <div className="card" data-testid="ppr-register">
      {/* ONE head at every width (AD-2/AD-5): every control keeps its testid
          and its state. On a phone the two period filters move into the
          "Filtri" panel (`movements-filter-inpanel`) and are re-rendered there
          over a DRAFT, because the panel applies once instead of navigating
          per change (AD-4) — the only behavioural difference, and the reason
          those two cannot be the same elements. DIRECT children only (lesson
          15.3 F1): this card also mounts portalled date popovers. */}
      <div className="card-head movements-head">
        <div className="card-title">{labels.card.title}</div>
        <span className="card-sub">{labels.card.subTemplate.replace('{total}', String(rows.length))}</span>
        <div className="fld movements-filter-status" style={{ minWidth: 0 }} data-testid="ppr-register-filter-bar">
          <select
            className={inputClasses}
            value={filters.status}
            onChange={(event) => handleFilterChange({ status: event.target.value })}
            aria-label={labels.filters.status}
            data-testid="ppr-register-filter-status"
          >
            <option value="ALL">{labels.filters.statusAll}</option>
            <option value="PENDING">{labels.filters.statusOptions.pending}</option>
            <option value="APPROVED">{labels.filters.statusOptions.approved}</option>
            <option value="REJECTED">{labels.filters.statusOptions.rejected}</option>
            <option value="COMPLETED">{labels.filters.statusOptions.completed}</option>
            <option value="CANCELLED">{labels.filters.statusOptions.cancelled}</option>
          </select>
        </div>
        <div className="fld movements-filter-inpanel" style={{ minWidth: 0 }}>
          <DateInput className={inputClasses} value={filters.from} onChange={(event) => handleFilterChange({ from: event.target.value })} aria-label={labels.filters.from} data-testid="ppr-register-filter-from" />
        </div>
        <div className="fld movements-filter-inpanel" style={{ minWidth: 0 }}>
          <DateInput className={inputClasses} value={filters.to} onChange={(event) => handleFilterChange({ to: event.target.value })} aria-label={labels.filters.to} data-testid="ppr-register-filter-to" />
        </div>
        {hasActiveFilter ? (
          <button type="button" className="btn movements-filter-inpanel" onClick={handleResetFilters} data-testid="ppr-register-filter-reset">
            {labels.filters.reset}
          </button>
        ) : null}
        <div className="spacer" />
        {/* Phone only (`display: none` above 640px): the door to the panel that
            holds the two period filters, with the number of them currently
            active — a filter one cannot see is a filter one forgets. */}
        <button type="button" className="btn movements-filters-trigger" onClick={openFilterPanel} data-testid="mobile-movements-filters-button">
          {panelActiveCount === 0 ? labels.mobile.filters : labels.mobile.filtersCount.replace('{count}', String(panelActiveCount))}
        </button>
        <ExportMenu label={exportTriggerLabel} xlsLabel={exportXlsLabel} xlsHref={exportHref} pdfLabel={exportPdfLabel} pdfHref={exportPdfHref} />
      </div>
      {/* `<div className="students">` below is a CSS-grid list, not a real `<table>` (`airops.css`'s `.student-row` convention, same as `ppr-console.tsx`/`bookings-table.tsx`) — every row is a `<div>`. */}

      {rows.length === 0 ? (
        <p className="card-body movements-desktop-body" data-testid="ppr-register-empty">
          {labels.empty}
        </p>
      ) : (
        <div className="students movements-desktop-body">
          <div className="student-row header" style={{ gridTemplateColumns: cols }}>
            <div>{labels.table.aircraft}</div>
            <div>{labels.table.type}</div>
            <div>{labels.table.route}</div>
            <div>{labels.table.requester}</div>
            <div>{labels.table.eta}</div>
            <div>{labels.table.etd}</div>
            <div>{labels.table.status}</div>
            <div>{labels.table.fee}</div>
            <div>{labels.table.actions}</div>
          </div>

          {rows.map((row) => {
            const isBusy = busyId === row.id;
            const action = rowAction?.id === row.id ? rowAction.mode : null;

            return (
              <Fragment key={row.id}>
                <div className="student-row" style={{ gridTemplateColumns: cols }} data-testid="ppr-register-row">
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {row.aircraftRegistration}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {row.aircraftType}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5 }}>
                    {row.origin} &rarr; {row.destination}
                  </div>
                  <div>
                    <div className="student-name">
                      {row.firstName} {row.lastName}
                    </div>
                    {/* Story 13.6, AC 2: email and phone each get their OWN line (instead of one `.student-sub`-truncated "email · phone" string) — `.student-sub`'s `nowrap`/`ellipsis` (`airops.css`) was clipping the 2nd segment (the phone) off entirely. */}
                    {row.email ? <div className="student-sub mono">{row.email}</div> : null}
                    {row.phone ? <div className="student-sub mono">{row.phone}</div> : null}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {formatDateTime(new Date(row.eta), locale)}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {row.etd ? formatDateTime(new Date(row.etd), locale) : labels.table.noValue}
                  </div>
                  <div>
                    <Badge tone={MOVEMENT_STATUS_TONE[row.movementStatus]} dot>
                      {labels.status[row.movementStatus]}
                    </Badge>
                  </div>
                  <div className="mono" style={{ fontSize: 11.5 }}>
                    {row.landingFeeCents !== null ? formatCents(row.landingFeeCents, locale) : labels.table.noValue}
                  </div>
                  <div>
                    {row.status !== 'APPROVED' ? null : action === 'cancelConfirm' ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <span className="student-sub">{labels.actions.confirmCancelPrompt}</span>
                        <button type="button" className="btn mini bad" disabled={isBusy} onClick={() => void confirmCancel(row.id)} data-testid="ppr-register-cancel-confirm">
                          {labels.actions.confirmYes}
                        </button>
                        <button type="button" className="btn mini" onClick={closeRowAction} data-testid="ppr-register-cancel-abort">
                          {labels.actions.confirmNo}
                        </button>
                      </div>
                    ) : action === 'complete' ? null : (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" className="btn mini ok" disabled={isBusy} onClick={() => startComplete(row.id)} data-testid="ppr-register-complete-button">
                          {labels.actions.complete}
                        </button>
                        <button type="button" className="btn mini" disabled={isBusy} onClick={() => startCancelConfirm(row.id)} data-testid="ppr-register-cancel-button">
                          {labels.actions.cancel}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {action === 'complete' ? (
                  <div className="student-row" style={{ gridTemplateColumns: '1fr', background: 'var(--bg-sunken)' }}>
                    <CompleteForm
                      key={row.id}
                      id={row.id}
                      pprNumber={row.pprNumber}
                      labels={labels.actions}
                      genericErrorLabel={labels.toast.genericError}
                      onCancel={closeRowAction}
                      onSuccess={() => {
                        setRowAction(null);
                        toast.show(labels.toast.completed, 'ok');
                        router.refresh();
                      }}
                      onConflict={() => {
                        setRowAction(null);
                        toast.show(labels.toast.conflictError, 'bad');
                      }}
                    />
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* --- the phone face of this card (story 15.7, R3/R4) ---------------
          Same card, same head, same pagination: only the nine-column table is
          swapped for one card per transit (template 207-225) — callsign +
          type on the title, `rotta · richiedente · ETA` on the mono sub-line,
          and the app's own status `Badge` on the right, whose four derived
          tones coincide 1:1 with the template's `_badge` (script 563). The
          stato is the one filter that stays in plain sight, because a register
          whose default silently hides everything but the APPROVED rows is the
          easiest way to believe nobody is on the ground. */}
      <div className="movements-mobile">
        <div className="mobile-chip-strip" data-testid="mobile-movements-status-chips">
          {STATUS_FILTER_VALUES.map((value) => {
            const label =
              value === 'ALL'
                ? labels.filters.statusAll
                : value === 'PENDING'
                  ? labels.filters.statusOptions.pending
                  : value === 'APPROVED'
                    ? labels.filters.statusOptions.approved
                    : value === 'REJECTED'
                      ? labels.filters.statusOptions.rejected
                      : value === 'COMPLETED'
                        ? labels.filters.statusOptions.completed
                        : labels.filters.statusOptions.cancelled;
            return (
              <Link
                key={value}
                href={statusChipHref(value)}
                locale={locale as AppLocale}
                className={`btn ${filters.status === value ? 'primary' : ''}`}
                aria-current={filters.status === value ? 'true' : undefined}
                data-testid={`mobile-movements-status-chip-${value}`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div data-testid="mobile-movements-list">
          {rows.length === 0 ? (
            <p className="mobile-card-empty" data-testid="mobile-movements-empty">
              {labels.empty}
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="mobile-row mobile-row-transit"
                aria-label={`${labels.mobile.openDetail}: ${row.aircraftRegistration} · ${labels.status[row.movementStatus]}`}
                onClick={() => {
                  setSheetStep('none');
                  setSheetId(row.id);
                }}
                data-testid="ppr-register-row-mobile"
              >
                <span className="mobile-row-main">
                  <span className="mobile-row-title">
                    <span className="mobile-row-tail">{row.aircraftRegistration}</span>
                    <span className="mobile-row-model">{row.aircraftType}</span>
                  </span>
                  <span className="mobile-row-sub">
                    {transitCardSubLine({
                      route: transitRouteLabel(row.origin, row.destination),
                      requester: requesterLabel(row),
                      etaLabel: `${labels.table.eta} ${formatTimeOfDay(new Date(row.eta), locale)}`,
                    })}
                  </span>
                </span>
                <span className="mobile-row-side">
                  <Badge tone={MOVEMENT_STATUS_TONE[row.movementStatus]} dot>
                    {labels.status[row.movementStatus]}
                  </Badge>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* The "Filtri" panel (ratifica R-15.7-f, AD-4). Rendered only while
          open, and reachable only from a trigger that is `display: none` above
          640px, so nothing of it exists in the desktop DOM. The two
          `DateInput`s keep their portalled popovers (z 65/66), which sit above
          the panel by construction. */}
      {filterDraft !== null ? (
        <SlideOver
          open
          title={labels.mobile.filtersTitle}
          onClose={() => setFilterDraft(null)}
          closeLabel={labels.mobile.close}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilterDraft(null);
                  handleResetFilters();
                }}
                data-testid="ppr-register-filter-reset-mobile"
              >
                {labels.filters.reset}
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn primary" onClick={applyFilterDraft} data-testid="mobile-movements-filters-apply">
                {labels.mobile.apply}
              </button>
            </>
          }
        >
          <div className="movements-filter-panel" data-testid="mobile-movements-filter-panel">
            <div className="fld">
              <label className="fld-label" htmlFor="ppr-register-filter-from-mobile">
                {labels.filters.from}
              </label>
              <DateInput
                id="ppr-register-filter-from-mobile"
                value={filterDraft.from}
                onChange={(event) => setFilterDraft({ ...filterDraft, from: event.target.value })}
                data-testid="ppr-register-filter-from-mobile"
              />
            </div>
            <div className="fld">
              <label className="fld-label" htmlFor="ppr-register-filter-to-mobile">
                {labels.filters.to}
              </label>
              <DateInput
                id="ppr-register-filter-to-mobile"
                value={filterDraft.to}
                onChange={(event) => setFilterDraft({ ...filterDraft, to: event.target.value })}
                data-testid="ppr-register-filter-to-mobile"
              />
            </div>
          </div>
        </SlideOver>
      ) : null}

      {/* The row-detail sheet (AD-7: rendered conditionally, so
          `mobile-movement-sheet` is ONE node). Its two actions are the desktop
          row's, under the SAME gate (`status === 'APPROVED'`), and both
          complete INSIDE the sheet as a `secondStep` (ratifica R-15.7-d):
          the closure writes a real `CashMovement` and cannot be undone from
          the UI, so the decision stays where the finger started it instead of
          stacking a z-50 panel on a z-40 sheet (AD-9). */}
      {sheetRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-movement-sheet"
          sub={transitSheetSub({ pprNumber: sheetRow.pprNumber, aircraftType: sheetRow.aircraftType })}
          title={sheetRow.aircraftRegistration}
          badge={
            <Badge tone={MOVEMENT_STATUS_TONE[sheetRow.movementStatus]} dot>
              {labels.status[sheetRow.movementStatus]}
            </Badge>
          }
          rows={sheetRows(sheetRow)}
          closeLabel={labels.mobile.close}
          actions={
            sheetRow.status === 'APPROVED' ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busyId === sheetRow.id}
                  onClick={() => setSheetStep('complete')}
                  data-testid="ppr-register-complete-button-mobile"
                >
                  {labels.actions.complete}
                </button>
                {/* Second, and destructive-styled: cancelling a PPR is
                    irreversible, so it is never the button a thumb lands on. */}
                <button
                  type="button"
                  className="btn mini bad"
                  disabled={busyId === sheetRow.id}
                  onClick={() => setSheetStep('cancelConfirm')}
                  data-testid="ppr-register-cancel-button-mobile"
                >
                  {labels.actions.cancel}
                </button>
              </>
            ) : undefined
          }
          secondStep={
            sheetStep === 'complete' ? (
              <div className="bottom-sheet-step mobile-complete-step">
                {/* The SAME component the desktop row panel renders (AD-8):
                    same validation, same `Idempotency-Key` and its
                    regeneration, same 409 mapping, same best-effort prefill.
                    Only where it is rendered — and its testid suffix — changes. */}
                <CompleteForm
                  key={sheetRow.id}
                  id={sheetRow.id}
                  pprNumber={sheetRow.pprNumber}
                  labels={labels.actions}
                  genericErrorLabel={labels.toast.genericError}
                  testIdSuffix="-mobile"
                  autoFocusFee
                  onCancel={() => setSheetStep('none')}
                  onSuccess={() => {
                    closeSheet();
                    toast.show(labels.toast.completed, 'ok');
                    router.refresh();
                  }}
                  onConflict={() => {
                    closeSheet();
                    toast.show(labels.toast.conflictError, 'bad');
                  }}
                />
              </div>
            ) : sheetStep === 'cancelConfirm' ? (
              <div className="bottom-sheet-step">
                <p className="fld-hint">{labels.actions.confirmCancelPrompt}</p>
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" onClick={() => setSheetStep('none')} data-testid="ppr-register-cancel-abort-mobile">
                    {labels.mobile.back}
                  </button>
                  <button
                    type="button"
                    className="btn mini bad"
                    disabled={busyId === sheetRow.id}
                    onClick={() => void confirmCancelFromSheet(sheetRow.id)}
                    data-testid="ppr-register-cancel-confirm-mobile"
                  >
                    {labels.actions.confirmYes}
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}

function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

type CompleteFormProps = {
  id: string;
  pprNumber: string | null;
  labels: MovementsTableLabels['actions'];
  genericErrorLabel: string;
  /**
   * Story 15.7 — `'-mobile'` when this form is rendered as the detail sheet's
   * second step, so the phone twin and the desktop row panel never share a
   * testid (epic convention 15.1). Empty on the desktop row panel, whose
   * testids are the ones every existing spec reads.
   */
  testIdSuffix?: string;
  /** Story 15.7 — entering the sheet's second step removes the very button that was pressed; focus has to land somewhere inside the dialog (lesson 15.2 F1). */
  autoFocusFee?: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  onConflict: () => void;
};

/** Per-row "Completa" panel (story 8.3, AC 1) — same shape as the pre-12.4 register's own `CompleteForm`, restyled. */
function CompleteForm({ id, pprNumber, labels, genericErrorLabel, testIdSuffix = '', autoFocusFee = false, onCancel, onSuccess, onConflict }: CompleteFormProps) {
  const [feeInput, setFeeInput] = useState('');
  const [fieldError, setFieldError] = useState(false);
  // Story Billing-1 review D2: mandatory payment method, default CASH — same default as `billing/transaction-editor.tsx`'s own method Select.
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'POS'>('CASH');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { idempotencyKey, regenerateIdempotencyKey } = useIdempotencyKey();

  useEffect(() => {
    let cancelled = false;
    async function loadDefault(): Promise<void> {
      try {
        const response = await fetch('/api/v1/settings/ppr-landing-fee');
        if (!response.ok) return;
        const body = (await response.json()) as { landingFeeCents: number };
        if (!cancelled) setFeeInput((current) => (current === '' ? centsToEuroInput(body.landingFeeCents) : current));
      } catch {
        // Best-effort prefill only — the field stays editable either way.
      }
    }
    void loadDefault();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    let landingFeeCents: number;
    try {
      landingFeeCents = parseCents(feeInput);
    } catch {
      setFieldError(true);
      return;
    }
    if (!Number.isInteger(landingFeeCents) || landingFeeCents < 0 || landingFeeCents > 2_147_483_647) {
      setFieldError(true);
      return;
    }
    setFieldError(false);

    setSubmitting(true);
    let response: Response;
    try {
      response = await fetch(`/api/v1/ppr-requests/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
        body: JSON.stringify({ landingFeeCents, paymentMethod: method }),
      });
    } catch {
      setSubmitting(false);
      setFormError(genericErrorLabel);
      return;
    }
    regenerateIdempotencyKey();
    setSubmitting(false);

    if (!response.ok) {
      if (response.status === 409) {
        onConflict();
        return;
      }
      setFormError(genericErrorLabel);
      return;
    }

    onSuccess();
  }

  return (
    // The three inline styles this form carried (its own padding/flex, the two
    // 200px field caps and the action row) moved into classes: an inline
    // declaration cannot be overridden by a media query, and inside the phone
    // sheet the form has to lose the padding, use the full width and grow its
    // targets to 44px. Identical computed style above 640px, measured.
    <form onSubmit={(event) => void handleSubmit(event)} noValidate data-testid={`ppr-complete-form${testIdSuffix}`} className="ppr-complete-form">
      <h4 style={{ fontSize: 14, fontWeight: 600 }}>
        {labels.complete}
        {pprNumber ? <span className="mono" style={{ marginLeft: 8, fontWeight: 400, color: 'var(--ink-3)' }}>{pprNumber}</span> : null}
      </h4>
      <div className="fld ppr-complete-field">
        <label className="fld-label-group">
          <span className="fld-label">{labels.feeLabel}</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={fieldError}
            autoFocus={autoFocusFee}
            value={feeInput}
            onChange={(event) => {
              setFeeInput(event.target.value);
              if (fieldError) setFieldError(false);
            }}
            data-testid={`ppr-complete-fee-input${testIdSuffix}`}
          />
        </label>
        {fieldError ? (
          <span className="fld-error" role="alert">
            {labels.invalidFee}
          </span>
        ) : null}
      </div>
      <p className="fld-label">{labels.feeHint}</p>

      <div className="ppr-complete-field">
        <Field label={labels.methodLabel}>
          <Select value={method} onChange={(event) => setMethod(event.target.value as 'CASH' | 'BANK_TRANSFER' | 'POS')} data-testid={`ppr-complete-method${testIdSuffix}`}>
            <option value="CASH">{labels.methods.CASH}</option>
            <option value="BANK_TRANSFER">{labels.methods.BANK_TRANSFER}</option>
            <option value="POS">{labels.methods.POS}</option>
          </Select>
        </Field>
      </div>

      {formError ? (
        <p role="alert" className="fld-label" style={{ color: 'var(--bad)' }}>
          {formError}
        </p>
      ) : null}

      <div className="ppr-complete-actions">
        <button type="submit" disabled={submitting} className="btn primary" data-testid={`ppr-complete-submit${testIdSuffix}`}>
          {labels.submitComplete}
        </button>
        <button type="button" onClick={onCancel} className="btn" data-testid={`ppr-complete-close${testIdSuffix}`}>
          {labels.closePanel}
        </button>
      </div>
    </form>
  );
}
