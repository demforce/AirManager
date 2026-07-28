'use client';

/**
 * Billing (Contabilità) console (story 12.9, story Billing-2) — port of
 * `docs/design-reference/airops/src/BillingView.jsx` onto the real, unified
 * ledger (`transactions.service.ts`), same shell idiom as
 * `fleet-console.tsx`/`pilots-console.tsx`/`logbook-console.tsx` (`.card` +
 * `.card-head` filters/export/new-button, `.students`/`.student-row` grid
 * table, `.split` for the two secondary cards). `finance.manage` only — no
 * own-access face (unlike logbook/bookings): the page.tsx redirect-gate is
 * the ONLY door, every consumer here already has full access.
 *
 * Story Billing-2 rework (AC 2/3): the old single signed "Importo" column
 * is gone — Entrate/Uscite columns instead, plus a "Tipo" column/filter on
 * the coarse `bookType` classification (ricavo/costo/acconto/giroconto),
 * REPLACING the old raw-kind/cash-category "Tipo" select (two confusing
 * optgroups behind one control) with two separate, single-purpose selects:
 * "Tipo" (bookType) and "Categoria" (cash categories only — the
 * account-side raw kind filter, `movementType`, has no UI control anymore;
 * still supported at the schema/service level for API consumers,
 * per-category detail lives in the "Per categoria" panel below instead). The
 * secchiello (AC 3, unattributed CASH rows) is reached via the Liquidità
 * riquadro's own link (`billing-panels.tsx`) — no separate filter-bar
 * control needed, since it is only ever worth reaching when non-empty; a
 * `?unattributed=true` arrival is declared in the filter bar via a
 * dismissible chip (review F11). A `CASH` row with no `paymentMethod` shows
 * an inline reclassify `<select>` in the Metodo column instead of "—",
 * regardless of which filter is active.
 *
 * Entrate/Uscite (review F7, PO ratifica 2026-07-27 — SUPERSEDES the design
 * mock's pilot-centric example): the split is CLUB PERSPECTIVE for every
 * row, both `ACCOUNT` and `CASH` — `lib/schemas/transactions.ts#ledgerClubAmountCents`,
 * the ONE shared helper this table and the xlsx export both call, never two
 * copies of the rule (see its own doc-comment for the full sign derivation).
 *
 * Per-row Rettifica/Storna (AC 3, story 12.9) reuse the EXISTING,
 * already-tested endpoints directly (`POST /account/adjustments` with
 * `originalMovementId`, `POST /cash-movements/{id}/reverse`) — NOT the new
 * unified `POST /api/v1/transactions`, which only backs the "Nuova
 * transazione" SlideOver's 3 STANDALONE branches (AC 4).
 */
import { useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { DateInput } from '@/components/ui/date-input';
import { Avatar } from '@/components/ui/avatar';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PaymentMethodDto } from '@/lib/schemas/accounts';
import { formatCents, parseCents } from '@/lib/money';
import { ledgerClubAmountCents, type BookTypeDto, type TransactionRowDto } from '@/lib/schemas/transactions';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { TransactionEditor, type TransactionEditorLabels } from './transaction-editor';

type PersonOption = { id: string; firstName: string; lastName: string };
type CategoryOption = { id: string; name: string };
type CompensationRow = { personId: string; firstName: string; lastName: string; mtdMinutes: number; payoutRateCents: number | null; owedMtdCents: number | null };
type NegativeBalanceRow = { personId: string; firstName: string; lastName: string; balanceCents: number };
/** Mirrors `cash.service.ts#CashReportCategoryTotal` — the "Per categoria" panel's own row (story Billing-2: replaces the old Σ-positivi `revenueByKind` bars). */
type CategoryTotal = { categoryId: string; categoryName: string; inCents: number; outCents: number; netCents: number };

/** Free-text pilot filter (story 13.5, AC 1) — `personQuery` replaces the old `SearchCombobox`-driven `personId`, same idiom as `pilots-console.tsx`'s own name filter. `bookType`/`categoryId`/`unattributed` (story Billing-2) replace the old combined `type` param. */
export type BillingFilters = { dateFrom: string; dateTo: string; bookType: string; categoryId: string; personQuery: string; unattributed: boolean };

/** Same debounce-before-navigating idiom as `pilots-console.tsx`/`fleet-console.tsx`. */
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

export type BillingConsoleLabels = {
  newTransaction: string;
  byCategory: { title: string; sub: string; empty: string; in: string; out: string; net: string };
  instructorCompensation: { title: string; sub: string; noRate: string; empty: string };
  negativeBalances: { title: string; empty: string; link: string };
  exportMenu: { label: string; xlsLabel: string; pdfLabel: string };
  table: {
    cardTitle: string;
    shown: string;
    date: string;
    pilot: string;
    type: string;
    description: string;
    method: string;
    entrate: string;
    uscite: string;
    status: string;
    actions: string;
    noValue: string;
    empty: string;
    statusOptions: { registered: string; reversed: string; reversal: string };
    kinds: Record<string, string>;
    methods: { CASH: string; BANK_TRANSFER: string; POS: string };
    bookTypes: Record<BookTypeDto, string>;
    noResultImpact: string;
  };
  filters: {
    dateFrom: string;
    dateTo: string;
    bookType: string;
    allBookTypes: string;
    category: string;
    allCategories: string;
    pilot: string;
    personSearchPlaceholder: string;
    reset: string;
    /** Review F11: the active-filter chip shown when arriving via `?unattributed=true` (the secchiello link) — otherwise only "Azzera filtri" hinted an active filter with no name attached to it. */
    unattributedChip: string;
    unattributedChipDismiss: string;
  };
  pagination: { prev: string; next: string };
  actions: { adjust: string; reverse: string; reclassifyPlaceholder: string; reclassifySuccess: string; reclassifyError: string };
  adjustModal: {
    title: string;
    linkedTo: string;
    amount: string;
    amountHint: string;
    reason: string;
    submit: string;
    cancel: string;
    invalidAmount: string;
    requiredReason: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
  reverseModal: {
    title: string;
    reason: string;
    confirm: string;
    cancel: string;
    requiredReason: string;
    conflictError: string;
    genericError: string;
    success: string;
  };
  newTransactionForm: TransactionEditorLabels;
};

export type BillingConsoleProps = {
  items: TransactionRowDto[];
  page: number;
  totalPages: number;
  filters: BillingFilters;
  personOptions: PersonOption[];
  categoryOptions: CategoryOption[];
  byCategory: CategoryTotal[];
  compensation: CompensationRow[];
  negativeBalances: NegativeBalanceRow[];
  exportHref: string;
  cashReportPdfHref: string;
  moneyLocale: 'it' | 'en';
  locale: 'it' | 'en';
  labels: BillingConsoleLabels;
};

/* 9 columns now (story Billing-2): Data/Pilota/Tipo/Descrizione/Metodo/Entrate/Uscite/Stato/Azioni — Metodo widened to fit the inline reclassify <select> (AC 3); Tipo narrowed (ricavo/costo/acconto/giroconto are all short, unlike the old raw kind labels). */
const COLS = '92px 1.1fr 112px minmax(160px,1.3fr) 126px 96px 96px 104px 72px';

const BOOK_TYPES: readonly BookTypeDto[] = ['REVENUE', 'COST', 'DEPOSIT', 'TRANSFER'];

const BOOK_TYPE_TONE: Record<BookTypeDto, BadgeTone> = {
  REVENUE: 'ok',
  COST: 'bad',
  DEPOSIT: 'info',
  TRANSFER: '',
};

const ACCOUNT_KIND_KEYS = new Set(['TOP_UP', 'ADJUSTMENT', 'PACKAGE_PURCHASE', 'FLIGHT_CHARGE', 'FLIGHT_CHARGE_REVERSAL']);

/** The granular label (raw AccountMovementType or CashCategory name), folded into the Descrizione cell now that Tipo shows the coarse bookType instead (story Billing-2). */
function kindLabel(row: TransactionRowDto, labels: BillingConsoleLabels): string {
  if (row.source === 'ACCOUNT' && ACCOUNT_KIND_KEYS.has(row.kind)) return labels.table.kinds[row.kind] ?? row.kind;
  return row.kind;
}

function methodLabel(row: TransactionRowDto, labels: BillingConsoleLabels): string {
  if (row.method === 'CASH') return labels.table.methods.CASH;
  if (row.method === 'BANK_TRANSFER') return labels.table.methods.BANK_TRANSFER;
  if (row.method === 'POS') return labels.table.methods.POS;
  return labels.table.noValue;
}

function statusInfo(row: TransactionRowDto, labels: BillingConsoleLabels): { tone: BadgeTone; label: string } {
  if (row.reversed) return { tone: 'bad', label: labels.table.statusOptions.reversed };
  if (row.reversal) return { tone: 'warn', label: labels.table.statusOptions.reversal };
  return { tone: '', label: labels.table.statusOptions.registered };
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function BillingConsole({
  items,
  page,
  totalPages,
  filters: initialFilters,
  personOptions,
  categoryOptions,
  byCategory,
  compensation,
  negativeBalances,
  exportHref,
  cashReportPdfHref,
  moneyLocale,
  locale,
  labels,
}: BillingConsoleProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<BillingFilters>(initialFilters);
  const [personQueryInput, setPersonQueryInput] = useState(initialFilters.personQuery);
  const [editorOpen, setEditorOpen] = useState(false);

  const [adjustingRow, setAdjustingRow] = useState<TransactionRowDto | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustAmountError, setAdjustAmountError] = useState(false);
  const [adjustReasonError, setAdjustReasonError] = useState(false);
  const [adjustFormError, setAdjustFormError] = useState<string | null>(null);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustFeedback, setAdjustFeedback] = useState<string | null>(null);

  const [reversingRow, setReversingRow] = useState<TransactionRowDto | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseReasonError, setReverseReasonError] = useState(false);
  const [reverseFormError, setReverseFormError] = useState<string | null>(null);
  const [reverseSubmitting, setReverseSubmitting] = useState(false);
  const [reverseFeedback, setReverseFeedback] = useState<string | null>(null);

  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [reclassifyFeedback, setReclassifyFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function buildFilterQuery(next: BillingFilters): Record<string, string> {
    const query: Record<string, string> = {};
    if (next.dateFrom) query['dateFrom'] = next.dateFrom;
    if (next.dateTo) query['dateTo'] = next.dateTo;
    if (next.bookType) query['bookType'] = next.bookType;
    if (next.categoryId) query['categoryId'] = next.categoryId;
    if (next.personQuery) query['personQuery'] = next.personQuery;
    if (next.unattributed) query['unattributed'] = 'true';
    return query;
  }

  function navigate(next: BillingFilters): void {
    const params = new URLSearchParams(buildFilterQuery(next));
    const search = params.toString();
    router.push(`/dashboard/billing${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<BillingFilters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    navigate(next);
  }

  const debouncedPersonQuery = useDebouncedCallback((value: string) => {
    handleFilterChange({ personQuery: value });
  }, 400);

  function handlePersonQueryChange(value: string): void {
    setPersonQueryInput(value);
    debouncedPersonQuery(value);
  }

  function handleReset(): void {
    const cleared: BillingFilters = { dateFrom: '', dateTo: '', bookType: '', categoryId: '', personQuery: '', unattributed: false };
    setFilters(cleared);
    setPersonQueryInput('');
    navigate(cleared);
  }

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/billing' as const, query: { page: targetPage, ...buildFilterQuery(filters) } };
  }

  const hasActiveFilter = filters.dateFrom !== '' || filters.dateTo !== '' || filters.bookType !== '' || filters.categoryId !== '' || filters.personQuery !== '' || filters.unattributed;

  function openAdjust(row: TransactionRowDto): void {
    setAdjustFeedback(null);
    setAdjustingRow(row);
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustAmountError(false);
    setAdjustReasonError(false);
    setAdjustFormError(null);
  }

  function closeAdjust(): void {
    setAdjustingRow(null);
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustAmountError(false);
    setAdjustReasonError(false);
    setAdjustFormError(null);
  }

  async function submitAdjust(): Promise<void> {
    if (!adjustingRow || !adjustingRow.personId) return;
    let parsedAmount: number | null;
    try {
      parsedAmount = parseCents(adjustAmount);
    } catch {
      parsedAmount = null;
    }
    if (parsedAmount === null || parsedAmount === 0) {
      setAdjustAmountError(true);
      return;
    }
    setAdjustAmountError(false);
    const trimmedReason = adjustReason.trim();
    if (trimmedReason === '') {
      setAdjustReasonError(true);
      return;
    }
    setAdjustReasonError(false);
    setAdjustFormError(null);
    setAdjustSubmitting(true);

    const response = await fetch(`/api/v1/people/${adjustingRow.personId}/account/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents: parsedAmount, reason: trimmedReason, originalMovementId: adjustingRow.id }),
    });
    setAdjustSubmitting(false);

    if (!response.ok) {
      setAdjustFormError(response.status === 409 ? labels.adjustModal.conflictError : labels.adjustModal.genericError);
      return;
    }

    setAdjustingRow(null);
    setAdjustFeedback(labels.adjustModal.success);
    router.refresh();
  }

  function openReverse(row: TransactionRowDto): void {
    setReverseFeedback(null);
    setReversingRow(row);
    setReverseReason('');
    setReverseReasonError(false);
    setReverseFormError(null);
  }

  function closeReverse(): void {
    setReversingRow(null);
    setReverseReason('');
    setReverseReasonError(false);
    setReverseFormError(null);
  }

  async function submitReverse(): Promise<void> {
    if (!reversingRow) return;
    const trimmed = reverseReason.trim();
    if (trimmed === '') {
      setReverseReasonError(true);
      return;
    }
    setReverseReasonError(false);
    setReverseFormError(null);
    setReverseSubmitting(true);

    const response = await fetch(`/api/v1/cash-movements/${reversingRow.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: trimmed }),
    });
    setReverseSubmitting(false);

    if (!response.ok) {
      setReverseFormError(response.status === 409 ? labels.reverseModal.conflictError : labels.reverseModal.genericError);
      return;
    }

    setReversingRow(null);
    setReverseFeedback(labels.reverseModal.success);
    router.refresh();
  }

  /** Assigns a payment method to an unattributed CASH row (story Billing-2, AC 3) — immediate on-change, no confirmation modal (a single-field, low-risk correction). */
  async function handleReclassify(rowId: string, method: PaymentMethodDto): Promise<void> {
    setReclassifyFeedback(null);
    setReclassifyingId(rowId);

    const response = await fetch(`/api/v1/cash-movements/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod: method }),
    });

    setReclassifyingId(null);
    if (!response.ok) {
      setReclassifyFeedback({ ok: false, message: labels.actions.reclassifyError });
      return;
    }
    setReclassifyFeedback({ ok: true, message: labels.actions.reclassifySuccess });
    router.refresh();
  }

  const maxCategoryFlow = byCategory.reduce((max, entry) => Math.max(max, Math.abs(entry.inCents), Math.abs(entry.outCents)), 1);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{labels.table.cardTitle}</div>
          <span className="card-sub">{labels.table.shown}</span>
          <div className="spacer" />
          {adjustFeedback ? (
            <p role="status" data-testid="billing-adjust-feedback" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
              {adjustFeedback}
            </p>
          ) : null}
          {reverseFeedback ? (
            <p role="status" data-testid="billing-reverse-feedback" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
              {reverseFeedback}
            </p>
          ) : null}
          {reclassifyFeedback ? (
            <p role="status" data-testid="billing-reclassify-feedback" style={{ fontSize: 12.5, color: reclassifyFeedback.ok ? 'var(--ok)' : 'var(--bad)' }}>
              {reclassifyFeedback.message}
            </p>
          ) : null}
          <div className="filter-date-range" style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={`${labels.filters.dateFrom} – ${labels.filters.dateTo}`}>
            <DateInput
              inline
              style={{ width: 'auto', fontSize: 12 }}
              value={filters.dateFrom}
              onChange={(event) => handleFilterChange({ dateFrom: event.target.value })}
              data-testid="billing-filter-date-from"
              aria-label={labels.filters.dateFrom}
            />
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>–</span>
            <DateInput
              inline
              style={{ width: 'auto', fontSize: 12 }}
              value={filters.dateTo}
              onChange={(event) => handleFilterChange({ dateTo: event.target.value })}
              data-testid="billing-filter-date-to"
              aria-label={labels.filters.dateTo}
            />
          </div>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 120, fontSize: 12 }}
            value={filters.bookType}
            onChange={(event) => handleFilterChange({ bookType: event.target.value })}
            data-testid="billing-filter-booktype"
            aria-label={labels.filters.bookType}
          >
            <option value="">{labels.filters.allBookTypes}</option>
            {BOOK_TYPES.map((bookType) => (
              <option key={bookType} value={bookType}>
                {labels.table.bookTypes[bookType]}
              </option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 140, fontSize: 12 }}
            value={filters.categoryId}
            onChange={(event) => handleFilterChange({ categoryId: event.target.value })}
            data-testid="billing-filter-category"
            aria-label={labels.filters.category}
          >
            <option value="">{labels.filters.allCategories}</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <div className="search" style={{ width: 190 }}>
            <Icon.search />
            <input
              className="bare-input"
              placeholder={labels.filters.personSearchPlaceholder}
              aria-label={labels.filters.pilot}
              value={personQueryInput}
              onChange={(event) => handlePersonQueryChange(event.target.value)}
              data-testid="billing-filter-person"
            />
          </div>
          {filters.unattributed ? (
            <Badge tone="info">
              {labels.filters.unattributedChip}
              <button
                type="button"
                onClick={() => handleFilterChange({ unattributed: false })}
                aria-label={labels.filters.unattributedChipDismiss}
                data-testid="billing-filter-unattributed-dismiss"
                style={{ marginLeft: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', lineHeight: 1 }}
              >
                ×
              </button>
            </Badge>
          ) : null}
          {hasActiveFilter ? (
            <button type="button" className="btn" onClick={handleReset} data-testid="billing-filter-reset">
              {labels.filters.reset}
            </button>
          ) : null}
          <ExportMenu label={labels.exportMenu.label} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={cashReportPdfHref} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={exportHref} />
          <button type="button" className="btn primary" onClick={() => setEditorOpen(true)} data-testid="billing-new-transaction-button">
            <Icon.plus /> {labels.newTransaction}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="card-body" data-testid="billing-empty">
            {labels.table.empty}
          </p>
        ) : (
          <div className="students">
            <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
              <div>{labels.table.date}</div>
              <div>{labels.table.pilot}</div>
              <div>{labels.table.type}</div>
              <div>{labels.table.description}</div>
              <div>{labels.table.method}</div>
              <div style={{ textAlign: 'right' }}>{labels.table.entrate}</div>
              <div style={{ textAlign: 'right' }}>{labels.table.uscite}</div>
              <div>{labels.table.status}</div>
              <div>{labels.table.actions}</div>
            </div>
            {items.map((row) => {
              const status = statusInfo(row, labels);
              const unattributedCash = row.source === 'CASH' && row.method === null;
              // Review F7: club perspective for BOTH Entrate/Uscite columns, shared with the xlsx export — never `row.amountCents` directly.
              const clubAmountCents = ledgerClubAmountCents(row);
              return (
                <div key={row.id} className="student-row" data-testid="transaction-row" style={{ gridTemplateColumns: COLS }}>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {formatDateOnly(row.date, moneyLocale)}
                  </div>
                  <div className="student-name">{row.personName ?? labels.table.noValue}</div>
                  <div>
                    <Badge tone={BOOK_TYPE_TONE[row.bookType]}>{labels.table.bookTypes[row.bookType]}</Badge>
                    {row.bookType === 'DEPOSIT' || row.bookType === 'TRANSFER' ? (
                      <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 2 }}>{labels.table.noResultImpact}</div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--ink)' }}>{kindLabel(row, labels)}</span>
                    {row.description ? <span> — {row.description}</span> : null}
                  </div>
                  <div>
                    {unattributedCash ? (
                      <select
                        className="input"
                        style={{ fontSize: 11, padding: '2px 4px', width: '100%' }}
                        defaultValue=""
                        disabled={reclassifyingId === row.id}
                        onChange={(event) => void handleReclassify(row.id, event.target.value as PaymentMethodDto)}
                        data-testid="transaction-reclassify-method"
                        aria-label={labels.actions.reclassifyPlaceholder}
                      >
                        <option value="" disabled>
                          {labels.actions.reclassifyPlaceholder}
                        </option>
                        <option value="CASH">{labels.table.methods.CASH}</option>
                        <option value="BANK_TRANSFER">{labels.table.methods.BANK_TRANSFER}</option>
                        <option value="POS">{labels.table.methods.POS}</option>
                      </select>
                    ) : (
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                        {methodLabel(row, labels)}
                      </span>
                    )}
                  </div>
                  <div className="mono num stat-tone-ok" style={{ fontWeight: 600, textAlign: 'right' }}>
                    {clubAmountCents > 0 ? formatCents(clubAmountCents, moneyLocale) : labels.table.noValue}
                  </div>
                  <div className="mono num stat-tone-bad" style={{ fontWeight: 600, textAlign: 'right' }}>
                    {clubAmountCents < 0 ? formatCents(-clubAmountCents, moneyLocale) : labels.table.noValue}
                  </div>
                  <div>
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </div>
                  <div>
                    {row.actionable && row.source === 'ACCOUNT' ? (
                      <button type="button" className="btn mini" data-testid="transaction-adjust-action" onClick={() => openAdjust(row)}>
                        {labels.actions.adjust}
                      </button>
                    ) : null}
                    {row.actionable && row.source === 'CASH' ? (
                      <button type="button" className="btn mini" data-testid="transaction-reverse-action" onClick={() => openReverse(row)}>
                        {labels.actions.reverse}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Link
              href={pageHref(page - 1)}
              locale={locale as AppLocale}
              aria-disabled={page <= 1}
              data-testid="billing-page-prev"
              className="btn"
            >
              {labels.pagination.prev}
            </Link>
            <span className="mono" data-testid="billing-pagination-status">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              locale={locale as AppLocale}
              aria-disabled={page >= totalPages}
              data-testid="billing-page-next"
              className="btn"
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.byCategory.title}</div>
            <span className="card-sub">{labels.byCategory.sub}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {byCategory.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }} data-testid="billing-by-category-empty">
                {labels.byCategory.empty}
              </p>
            ) : (
              byCategory.map((entry) => (
                <div key={entry.categoryId} data-testid="billing-by-category-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11.5, marginBottom: 6 }}>
                    <span style={{ color: 'var(--ink-2)' }}>{entry.categoryName}</span>
                    <span style={{ display: 'flex', gap: 10 }}>
                      <span style={{ color: 'var(--ok)' }} title={labels.byCategory.in}>
                        {formatCents(entry.inCents, moneyLocale)}
                      </span>
                      <span style={{ color: 'var(--bad)' }} title={labels.byCategory.out}>
                        {formatCents(entry.outCents, moneyLocale)}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }} title={labels.byCategory.net}>
                        {formatCents(entry.netCents, moneyLocale)}
                      </span>
                    </span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg-sunken)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex' }}>
                    <div style={{ height: '100%', width: `${(entry.inCents / maxCategoryFlow) * 100}%`, background: 'var(--ok)' }} />
                    <div style={{ height: '100%', width: `${(Math.abs(entry.outCents) / maxCategoryFlow) * 100}%`, background: 'var(--bad)' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.instructorCompensation.title}</div>
            <span className="card-sub">{labels.instructorCompensation.sub}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {compensation.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{labels.instructorCompensation.empty}</p>
            ) : (
              compensation.map((row) => (
                <div key={row.personId} data-testid="billing-instructor-compensation-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Avatar init={initialsFor(`${row.firstName} ${row.lastName}`)} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.lastName} {row.firstName}
                    </span>
                  </span>
                  <span className="mono num" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                    {formatMinutes(row.mtdMinutes)} · {row.payoutRateCents === null ? labels.instructorCompensation.noRate : `${formatCents(row.payoutRateCents, moneyLocale)}/h`}
                  </span>
                  <span className="mono num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {row.owedMtdCents === null ? labels.instructorCompensation.noRate : formatCents(row.owedMtdCents, moneyLocale)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {negativeBalances.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }} data-testid="billing-negative-balances-card">
          <div className="card-head">
            <div className="card-title">{labels.negativeBalances.title}</div>
            <span className="card-sub">{negativeBalances.length}</span>
            <div className="spacer" />
            <Link href="/dashboard/pilots" locale={locale as AppLocale} className="card-sub" style={{ textDecoration: 'underline' }}>
              {labels.negativeBalances.link}
            </Link>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {negativeBalances.map((item) => (
              <div key={item.personId} data-testid="negative-balance-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <Link href={`/dashboard/people/${item.personId}`} locale={locale as AppLocale}>
                  {item.lastName} {item.firstName}
                </Link>
                <span className="mono num" style={{ color: 'var(--bad)' }}>
                  {formatCents(item.balanceCents, moneyLocale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <TransactionEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onMutated={() => router.refresh()}
        personOptions={personOptions}
        categoryOptions={categoryOptions}
        moneyLocale={moneyLocale}
        labels={labels.newTransactionForm}
      />

      {adjustingRow ? (
        <div className="mini-modal">
          <div className="mini-modal-card" data-testid="transaction-adjust-panel">
            <div className="so-title" style={{ fontSize: 16 }}>
              {labels.adjustModal.title}
            </div>
            <div className="so-sub">{labels.adjustModal.linkedTo.replace('{date}', formatDateOnly(adjustingRow.date, moneyLocale))}</div>
            <label htmlFor="billing-adjust-amount" className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.adjustModal.amount}
            </label>
            <input
              id="billing-adjust-amount"
              className="input"
              inputMode="decimal"
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              aria-invalid={adjustAmountError}
              data-testid="transaction-adjust-amount"
            />
            <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>{labels.adjustModal.amountHint}</p>
            {adjustAmountError ? <p className="fld-error">{labels.adjustModal.invalidAmount}</p> : null}
            <label htmlFor="billing-adjust-reason" className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.adjustModal.reason}
            </label>
            <input
              id="billing-adjust-reason"
              className="input"
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              aria-invalid={adjustReasonError}
              maxLength={500}
              data-testid="transaction-adjust-reason"
            />
            {adjustReasonError ? <p className="fld-error">{labels.adjustModal.requiredReason}</p> : null}
            {adjustFormError ? (
              <p role="alert" data-testid="transaction-adjust-error" style={{ color: 'var(--bad)', fontSize: 12.5, marginTop: 6 }}>
                {adjustFormError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn" onClick={closeAdjust}>
                {labels.adjustModal.cancel}
              </button>
              <button type="button" className="btn primary" disabled={adjustSubmitting} onClick={() => void submitAdjust()} data-testid="transaction-adjust-confirm">
                {labels.adjustModal.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reversingRow ? (
        <div className="mini-modal">
          <div className="mini-modal-card" data-testid="transaction-reverse-panel">
            <div className="so-title" style={{ fontSize: 16 }}>
              {labels.reverseModal.title}
            </div>
            <div className="so-sub">
              {reversingRow.kind} — {formatDateOnly(reversingRow.date, moneyLocale)} — {formatCents(reversingRow.amountCents, moneyLocale)}
            </div>
            <label htmlFor="billing-reverse-reason" className="fld-label" style={{ display: 'block', marginTop: 10 }}>
              {labels.reverseModal.reason}
            </label>
            <textarea
              id="billing-reverse-reason"
              className="input"
              rows={3}
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              aria-invalid={reverseReasonError}
              maxLength={500}
              data-testid="transaction-reverse-reason"
            />
            {reverseReasonError ? <p className="fld-error">{labels.reverseModal.requiredReason}</p> : null}
            {reverseFormError ? (
              <p role="alert" data-testid="transaction-reverse-error" style={{ color: 'var(--bad)', fontSize: 12.5 }}>
                {reverseFormError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn" onClick={closeReverse}>
                {labels.reverseModal.cancel}
              </button>
              <button type="button" className="btn primary" disabled={reverseSubmitting} onClick={() => void submitReverse()} data-testid="transaction-reverse-confirm">
                {labels.reverseModal.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
