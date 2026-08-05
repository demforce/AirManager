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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { DateInput } from '@/components/ui/date-input';
import { Avatar } from '@/components/ui/avatar';
import { SlideOver } from '@/components/ui/slide-over';
import { useToast } from '@/components/ui/toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PaymentMethodDto } from '@/lib/schemas/accounts';
import { ledgerSide, transactionCardSubLine, transactionCardTitle, transactionSheetSub, transactionStatusIsAnomalous } from '@/lib/mobile-billing';
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

/** The phone sheet's own step (story 15.8a): the detail, or one of the three writes rendered as a `secondStep`. */
type SheetStep = 'none' | 'adjust' | 'reverse' | 'reclassify';

/** Free-text pilot filter (story 13.5, AC 1) — `personQuery` replaces the old `SearchCombobox`-driven `personId`, same idiom as `pilots-console.tsx`'s own name filter. `bookType`/`categoryId`/`unattributed` (story Billing-2) replace the old combined `type` param. */
export type BillingFilters = { dateFrom: string; dateTo: string; bookType: string; categoryId: string; personQuery: string; unattributed: boolean };

/**
 * Same debounce-before-navigating idiom as `pilots-console.tsx`/`fleet-console.tsx`,
 * plus the `cancel` this page needs (review 15.6 MINOR-1, re-measured here):
 * a navigation REMOUNTS this console (`page.tsx:175`'s own `key` —
 * `{"before":"ZZZ-remount-probe","after":"","remounted":true}`), so a timer
 * still pending when the "Filtri" panel opens would close that panel ~400ms
 * later, under the reader's thumb.
 */
function useDebouncedCallback(callback: (value: string) => void, delayMs: number): { run: (value: string) => void; cancel: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function cancel(): void {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  return {
    run: (value: string) => {
      cancel();
      timerRef.current = setTimeout(() => callback(value), delayMs);
    },
    cancel,
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
  /** Phone-only strings (story 15.8a) — the chip strip, the "Filtri" panel, the detail sheet and its three second steps. */
  mobile: {
    bookTypeAll: string;
    unattributedChip: string;
    filters: string;
    filtersCount: string;
    filtersTitle: string;
    apply: string;
    close: string;
    back: string;
    openDetail: string;
    empty: string;
    source: string;
    sourceAccount: string;
    sourceCash: string;
    reference: string;
    id: string;
    reclassify: string;
    reclassifyConfirm: string;
    unattributedMethod: string;
  };
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
  const toast = useToast();
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

  // --- phone-only state (story 15.8a) -------------------------------------
  // The row-detail sheet and its three second steps (rettifica, storno,
  // riclassifica — ratifica R-15.8a-g), plus the draft of the "Filtri" panel.
  // All of it dies with the console at every navigation (`page.tsx:175`'s own
  // `key`, re-measured), which is exactly why the panel applies ONCE instead
  // of navigating per change (AD-3).
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<SheetStep>('none');
  const [sheetAmount, setSheetAmount] = useState('');
  const [sheetReason, setSheetReason] = useState('');
  const [sheetAmountError, setSheetAmountError] = useState(false);
  const [sheetReasonError, setSheetReasonError] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetMethod, setSheetMethod] = useState<PaymentMethodDto | null>(null);
  /** `null` while the panel is closed; the filter values being edited while it is open. */
  const [filterDraft, setFilterDraft] = useState<BillingFilters | null>(null);
  /**
   * One ref per action button and one per step's first control: the sheet moves
   * focus INTO a step when it opens and BACK to the button that opened THAT
   * step when it closes (AC 3). Review 15.8a MINOR-2: a single ref, held by the
   * ACCOUNT branch's button alone, covered one branch out of three — on a CASH
   * row it was `null`, so the return was a no-op and `document.activeElement`
   * fell back to `<body>`, which is exactly the defect review 15.2 F1 named.
   */
  const sheetAdjustActionRef = useRef<HTMLButtonElement>(null);
  const sheetReclassifyActionRef = useRef<HTMLButtonElement>(null);
  const sheetReverseActionRef = useRef<HTMLButtonElement>(null);
  const sheetAmountRef = useRef<HTMLInputElement>(null);
  const sheetReasonRef = useRef<HTMLTextAreaElement>(null);
  const sheetMethodRef = useRef<HTMLButtonElement>(null);
  /** The step being LEFT, read by the focus effect to pick which button gets the focus back. */
  const sheetPreviousStepRef = useRef<SheetStep>('none');

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
    debouncedPersonQuery.run(value);
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

  /**
   * The client-side gate of a rettifica's importo, shared by the two faces
   * (AD-8): an unparsable OR zero amount never reaches the network, on the
   * desktop `.mini-modal` and in the phone sheet alike.
   */
  function parseAdjustAmount(raw: string): number | null {
    let parsed: number | null;
    try {
      parsed = parseCents(raw);
    } catch {
      parsed = null;
    }
    return parsed === null || parsed === 0 ? null : parsed;
  }

  /**
   * The ONE network path of a rettifica (AD-8): same historical endpoint
   * (`POST /account/adjustments` with `originalMovementId`, never the unified
   * `POST /transactions`), same 409-vs-generic mapping, whether the decision
   * was taken in the desktop `.mini-modal` or in the phone sheet. Returns the
   * message to show, or `null` on success — the CALLER decides where the
   * outcome is announced (a `role="status"` in the card head on desktop, a
   * toast on the phone, where that paragraph is off-screen: R-15.8a-j).
   */
  async function postAdjust(personId: string, originalMovementId: string, amountCents: number, reason: string): Promise<string | null> {
    setAdjustSubmitting(true);
    const response = await fetch(`/api/v1/people/${personId}/account/adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents, reason, originalMovementId }),
    });
    setAdjustSubmitting(false);
    if (response.ok) return null;
    return response.status === 409 ? labels.adjustModal.conflictError : labels.adjustModal.genericError;
  }

  async function submitAdjust(): Promise<void> {
    if (!adjustingRow || !adjustingRow.personId) return;
    const parsedAmount = parseAdjustAmount(adjustAmount);
    if (parsedAmount === null) {
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

    const error = await postAdjust(adjustingRow.personId, adjustingRow.id, parsedAmount, trimmedReason);
    if (error !== null) {
      setAdjustFormError(error);
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

  /** The ONE network path of a storno (AD-8) — same historical endpoint, same 409 mapping, whether it starts in the desktop `.mini-modal` or in the phone sheet. */
  async function postReverse(rowId: string, reason: string): Promise<string | null> {
    setReverseSubmitting(true);
    const response = await fetch(`/api/v1/cash-movements/${rowId}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setReverseSubmitting(false);
    if (response.ok) return null;
    return response.status === 409 ? labels.reverseModal.conflictError : labels.reverseModal.genericError;
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

    const error = await postReverse(reversingRow.id, trimmed);
    if (error !== null) {
      setReverseFormError(error);
      return;
    }

    setReversingRow(null);
    setReverseFeedback(labels.reverseModal.success);
    router.refresh();
  }

  /** The ONE network path of a riclassifica (AD-8): the SAME `PATCH /cash-movements/{id}` with the SAME body, on both faces. Returns `true` on success. */
  async function postReclassify(rowId: string, method: PaymentMethodDto): Promise<boolean> {
    setReclassifyingId(rowId);
    const response = await fetch(`/api/v1/cash-movements/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod: method }),
    });
    setReclassifyingId(null);
    return response.ok;
  }

  /** Assigns a payment method to an unattributed CASH row (story Billing-2, AC 3) — DESKTOP face: immediate on-change, no confirmation (a single-field, low-risk correction). The phone face makes the same write EXPLICIT (R-15.8a-g). */
  async function handleReclassify(rowId: string, method: PaymentMethodDto): Promise<void> {
    setReclassifyFeedback(null);
    const ok = await postReclassify(rowId, method);
    if (!ok) {
      setReclassifyFeedback({ ok: false, message: labels.actions.reclassifyError });
      return;
    }
    setReclassifyFeedback({ ok: true, message: labels.actions.reclassifySuccess });
    router.refresh();
  }

  // --- phone face (story 15.8a) -------------------------------------------

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('none');
    setSheetAmount('');
    setSheetReason('');
    setSheetAmountError(false);
    setSheetReasonError(false);
    setSheetError(null);
    setSheetMethod(null);
  }, []);

  /** A row's sheet always opens on its first step, never on a leftover one from the previous row. */
  function openSheet(id: string): void {
    setSheetStep('none');
    setSheetAmount('');
    setSheetReason('');
    setSheetAmountError(false);
    setSheetReasonError(false);
    setSheetError(null);
    setSheetMethod(null);
    setSheetId(id);
  }

  /**
   * Review 15.2 F1: entering a second step removes the very button that was
   * pressed, and `document.activeElement` falls back to `<body>` — the dialog
   * context is lost for assistive technology even though the node survives.
   * Both directions are covered on ALL THREE branches (review 15.8a MINOR-2):
   * entering focuses the step's first control, leaving returns the focus to the
   * button that opened THAT step — read from `sheetPreviousStepRef`, because by
   * the time the effect runs the step is already `none` and the branch alone
   * (ACCOUNT/CASH, or a row that offers two actions at once) cannot say which
   * button the finger came from. Inert while no sheet is open (every ref is
   * null then), so `MobileSheet`'s own focus-on-open baseline is untouched.
   */
  useEffect(() => {
    const leaving = sheetPreviousStepRef.current;
    sheetPreviousStepRef.current = sheetStep;
    if (sheetStep === 'adjust') sheetAmountRef.current?.focus();
    else if (sheetStep === 'reverse') sheetReasonRef.current?.focus();
    else if (sheetStep === 'reclassify') sheetMethodRef.current?.focus();
    else if (leaving === 'adjust') sheetAdjustActionRef.current?.focus();
    else if (leaving === 'reverse') sheetReverseActionRef.current?.focus();
    else if (leaving === 'reclassify') sheetReclassifyActionRef.current?.focus();
  }, [sheetStep]);

  /** Re-read from `items` on every render: after a storno or a riclassifica the very same row comes back changed, and the sheet must not keep showing the stale copy it was opened with. */
  const sheetRow = items.find((row) => row.id === sheetId) ?? null;

  /** The phone twin of `submitAdjust`, on the sheet's second step. Same gate, same request, same mapping — only the announcement moves to a toast. */
  async function submitSheetAdjust(row: TransactionRowDto): Promise<void> {
    if (!row.personId) return;
    const parsedAmount = parseAdjustAmount(sheetAmount);
    if (parsedAmount === null) {
      setSheetAmountError(true);
      return;
    }
    setSheetAmountError(false);
    const trimmedReason = sheetReason.trim();
    if (trimmedReason === '') {
      setSheetReasonError(true);
      return;
    }
    setSheetReasonError(false);
    setSheetError(null);

    const error = await postAdjust(row.personId, row.id, parsedAmount, trimmedReason);
    if (error !== null) {
      setSheetError(error);
      return;
    }
    closeSheet();
    toast.show(labels.adjustModal.success, 'ok');
    router.refresh();
  }

  /** The phone twin of `submitReverse`. */
  async function submitSheetReverse(row: TransactionRowDto): Promise<void> {
    const trimmed = sheetReason.trim();
    if (trimmed === '') {
      setSheetReasonError(true);
      return;
    }
    setSheetReasonError(false);
    setSheetError(null);

    const error = await postReverse(row.id, trimmed);
    if (error !== null) {
      setSheetError(error);
      return;
    }
    closeSheet();
    toast.show(labels.reverseModal.success, 'ok');
    router.refresh();
  }

  /** The phone twin of `handleReclassify` — EXPLICIT (choose, then confirm), never a `<select>` that writes on change (R-15.8a-g). Same single `PATCH`, same body. */
  async function submitSheetReclassify(row: TransactionRowDto): Promise<void> {
    if (sheetMethod === null) return;
    setSheetError(null);
    const ok = await postReclassify(row.id, sheetMethod);
    if (!ok) {
      setSheetError(labels.actions.reclassifyError);
      return;
    }
    closeSheet();
    toast.show(labels.actions.reclassifySuccess, 'ok');
    router.refresh();
  }

  /**
   * A bookType chip's href (R-15.8a-e). It produces the SAME URL the desktop
   * `<select>` would (`buildFilterQuery`) and drops `?page`: a different
   * filter is a different result set (precedent 15.4).
   */
  function bookTypeChipHref(nextBookType: string) {
    return { pathname: '/dashboard/billing' as const, query: buildFilterQuery({ ...filters, bookType: nextBookType }) };
  }

  /** The secchiello chip is the only visible NAME of `?unattributed=true` on the phone (comportamento 9): tapping it drops the filter, exactly as the desktop chip's ✕ does. */
  function unattributedChipHref() {
    return { pathname: '/dashboard/billing' as const, query: buildFilterQuery({ ...filters, unattributed: false }) };
  }

  /**
   * How many of the filters the phone HIDES inside the panel are active — the
   * count on its trigger. A filter one cannot see is a filter one forgets;
   * tipo, pilota and il secchiello are not counted because they are on the
   * head, in plain sight (chips and search box).
   */
  const panelActiveCount = (filters.dateFrom !== '' || filters.dateTo !== '' ? 1 : 0) + (filters.categoryId !== '' ? 1 : 0);

  /**
   * Opening the panel takes the pending search OVER (review 15.6 MINOR-1).
   * Cancelling that timer is what keeps the panel open (its navigation would
   * remount the console); carrying `personQueryInput` — the text as TYPED,
   * not the last applied one — into the draft is what keeps the typing:
   * "Applica" then sends search and panel filters in the SAME single
   * navigation (AD-3).
   */
  function openFilterPanel(): void {
    debouncedPersonQuery.cancel();
    setFilterDraft({ ...filters, personQuery: personQueryInput });
  }

  /** Dismissing (✕, scrim, Escape) drops the panel's own edits — never the typing that preceded it: the search re-arms and lands on its own, as it would have without the panel. */
  function dismissFilterPanel(): void {
    setFilterDraft(null);
    if (personQueryInput !== filters.personQuery) debouncedPersonQuery.run(personQueryInput);
  }

  /** ONE navigation on "Applica" (AD-3) — navigating per `onChange`, as the desktop head does, would remount the console and close the panel under the reader's thumb. */
  function applyFilterDraft(): void {
    if (filterDraft === null) return;
    const next = filterDraft;
    setFilterDraft(null);
    setFilters(next);
    navigate(next);
  }

  /** Parity of the sheet with the desktop row (AC 2, lesson 15.5 F2): the nine columns, plus the three things the DTO carries that the table has no room for (`source`, `reference`, `id`). */
  function sheetRows(row: TransactionRowDto): BottomSheetRow[] {
    const clubAmountCents = ledgerClubAmountCents(row);
    const side = ledgerSide(clubAmountCents);
    return [
      { k: labels.table.date, v: formatDateOnly(row.date, moneyLocale) },
      { k: labels.table.pilot, v: row.personName ?? labels.table.noValue },
      {
        k: labels.table.type,
        v: `${labels.table.bookTypes[row.bookType]}${row.bookType === 'DEPOSIT' || row.bookType === 'TRANSFER' ? ` — ${labels.table.noResultImpact}` : ''}`,
      },
      { k: labels.table.description, v: transactionCardTitle({ kindLabel: kindLabel(row, labels), description: row.description }) },
      { k: labels.table.method, v: row.method === null && row.source === 'CASH' ? labels.mobile.unattributedMethod : methodLabel(row, labels) },
      { k: labels.table.entrate, v: side === 'in' ? formatCents(clubAmountCents, moneyLocale) : labels.table.noValue },
      { k: labels.table.uscite, v: side === 'out' ? formatCents(-clubAmountCents, moneyLocale) : labels.table.noValue },
      { k: labels.table.status, v: statusInfo(row, labels).label },
      { k: labels.mobile.source, v: row.source === 'ACCOUNT' ? labels.mobile.sourceAccount : labels.mobile.sourceCash },
      { k: labels.mobile.reference, v: row.reference ?? labels.table.noValue },
      { k: labels.mobile.id, v: <span className="mono">{row.id}</span> },
    ];
  }

  const maxCategoryFlow = byCategory.reduce((max, entry) => Math.max(max, Math.abs(entry.inCents), Math.abs(entry.outCents)), 1);

  return (
    <>
      <div className="card">
        {/* ONE head at every width (AD-2): every control keeps its testid and
            its state. On a phone the two filters ratifica R-15.8a-e moves into
            the "Filtri" panel are hidden here (`.billing-filter-inpanel`) and
            re-rendered there over a DRAFT, because the panel applies once
            instead of navigating per change (AD-3) — the only behavioural
            difference, and the reason those two cannot be the same elements. */}
        <div className="card-head billing-head">
          <div className="card-title">{labels.table.cardTitle}</div>
          <span className="card-sub">{labels.table.shown}</span>
          <div className="spacer" />
          {/* R-15.8a-j: on the phone these three outcomes are toasts (the phone
              writes never set them — their only triggers, the `.mini-modal`s and
              the inline `<select>`, live inside the desktop body). The paragraphs
              stay for the desktop; hidden at <=640px so a stray one can never
              grow the head this story is shrinking, and so the outcome is never
              announced twice. */}
          {adjustFeedback ? (
            <p role="status" className="billing-feedback" data-testid="billing-adjust-feedback" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
              {adjustFeedback}
            </p>
          ) : null}
          {reverseFeedback ? (
            <p role="status" className="billing-feedback" data-testid="billing-reverse-feedback" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
              {reverseFeedback}
            </p>
          ) : null}
          {reclassifyFeedback ? (
            <p role="status" className="billing-feedback" data-testid="billing-reclassify-feedback" style={{ fontSize: 12.5, color: reclassifyFeedback.ok ? 'var(--ok)' : 'var(--bad)' }}>
              {reclassifyFeedback.message}
            </p>
          ) : null}
          {/* The inline `display: flex` this pair used to carry moved into
              `.billing-filter-range` (identical computed style above 640px,
              measured): an inline `display` cannot be overridden by a media
              query, and the phone head has to hide it. Same move `.registry-
              search` needed in 15.5 and `.logbook-filter-range` in 15.6. */}
          <div className="filter-date-range billing-filter-range billing-filter-inpanel" title={`${labels.filters.dateFrom} – ${labels.filters.dateTo}`}>
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
          {/* Tipo does NOT move into the panel: on the phone it is the chip
              strip below (R-15.8a-e), so the select is simply hidden — through a
              class of THIS head, never a rule on `.input`. */}
          <select
            className="input billing-filter-booktype-desktop"
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
            className="input billing-filter-inpanel"
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
          {/* Width moved out of the inline style into `.billing-search` for the
              same reason as the date pair above: the phone head gives this box
              its own full-width row, and an inline `width` wins over a media
              query. Identical computed width above 640px, measured. */}
          <div className="search billing-search">
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
            <span className="billing-filter-chip-desktop">
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
            </span>
          ) : null}
          {hasActiveFilter ? (
            <button type="button" className="btn billing-filter-inpanel" onClick={handleReset} data-testid="billing-filter-reset">
              {labels.filters.reset}
            </button>
          ) : null}
          {/* Phone only (`display: none` above 640px): the door to the panel that
              holds periodo and categoria, with the number of them currently
              active — a filter one cannot see is a filter one forgets. */}
          <button type="button" className="btn billing-filters-trigger" onClick={openFilterPanel} data-testid="mobile-billing-filters-button">
            {panelActiveCount === 0 ? labels.mobile.filters : labels.mobile.filtersCount.replace('{count}', String(panelActiveCount))}
          </button>
          <ExportMenu label={labels.exportMenu.label} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={cashReportPdfHref} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={exportHref} />
          <button type="button" className="btn primary" onClick={() => setEditorOpen(true)} data-testid="billing-new-transaction-button">
            <Icon.plus /> {labels.newTransaction}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="card-body billing-desktop-body" data-testid="billing-empty">
            {labels.table.empty}
          </p>
        ) : (
          <div className="students billing-desktop-body">
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

        {/* --- the phone face of this card (story 15.8a, R3/R4) --------------
            Same card, same head, same pagination: only the nine-column table is
            swapped for one card per transaction (template 325-334), whose three
            writes live in the sheet (R-15.8a-g). The bookType chips are the one
            filter that stays in plain sight, and the secchiello chip with them —
            `?unattributed=true` has no other visible name on a phone
            (comportamento 9). */}
        <div className="billing-mobile">
          <div className="mobile-chip-strip" data-testid="mobile-billing-booktype-chips">
            <Link
              href={bookTypeChipHref('')}
              locale={locale as AppLocale}
              className={`btn ${filters.bookType === '' ? 'primary' : ''}`}
              aria-current={filters.bookType === '' ? 'true' : undefined}
              data-testid="mobile-billing-booktype-chip-all"
            >
              {labels.mobile.bookTypeAll}
            </Link>
            {BOOK_TYPES.map((bookType) => (
              <Link
                key={bookType}
                href={bookTypeChipHref(bookType)}
                locale={locale as AppLocale}
                className={`btn ${filters.bookType === bookType ? 'primary' : ''}`}
                aria-current={filters.bookType === bookType ? 'true' : undefined}
                data-testid={`mobile-billing-booktype-chip-${bookType}`}
              >
                {labels.table.bookTypes[bookType]}
              </Link>
            ))}
            {filters.unattributed ? (
              <Link
                href={unattributedChipHref()}
                locale={locale as AppLocale}
                className="btn primary"
                aria-current="true"
                data-testid="mobile-billing-unattributed-chip"
              >
                {labels.mobile.unattributedChip}
              </Link>
            ) : null}
          </div>

          <div data-testid="mobile-billing-list">
            {items.length === 0 ? (
              <p className="mobile-card-empty" data-testid="mobile-billing-empty">
                {labels.mobile.empty}
              </p>
            ) : (
              items.map((row) => {
                // Review F7 again, on the phone: club perspective, from the ONE
                // shared helper — never `row.amountCents`.
                const clubAmountCents = ledgerClubAmountCents(row);
                const side = ledgerSide(clubAmountCents);
                const status = statusInfo(row, labels);
                const title = transactionCardTitle({ kindLabel: kindLabel(row, labels), description: row.description });
                const amountText = side === 'none' ? labels.table.noValue : formatCents(side === 'in' ? clubAmountCents : -clubAmountCents, moneyLocale);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="mobile-row mobile-row-transaction"
                    aria-label={`${labels.mobile.openDetail}: ${title} · ${amountText}`}
                    onClick={() => openSheet(row.id)}
                    data-testid="transaction-row-mobile"
                  >
                    <span className="mobile-row-main">
                      <span className="mobile-row-title">
                        <span className="mobile-row-tail">{labels.table.bookTypes[row.bookType]}</span>
                        <span className="mobile-row-name">{title}</span>
                      </span>
                      <span className="mobile-row-sub">
                        {transactionCardSubLine({
                          personName: row.personName,
                          date: formatDateOnly(row.date, moneyLocale),
                          methodLabel: row.method === null ? null : methodLabel(row, labels),
                        })}
                      </span>
                    </span>
                    {/* The template's own right column (325-334): the amount,
                        mono, coloured by the club's own direction. `.stat-tone-*`
                        rather than the raw token — the same medicine the
                        Entrate/Uscite columns already use (10.63 / 9.82). */}
                    <span className="mobile-row-side">
                      <span className={`mobile-row-amount ${side === 'in' ? 'stat-tone-ok' : side === 'out' ? 'stat-tone-bad' : ''}`}>{amountText}</span>
                    </span>
                    {/* Only when the row is NOT ordinary (R-15.8a-d), and on its
                        own line: measured in 15.5, a `Badge` beside an identifier
                        on a 317px card eats the identifier. */}
                    {transactionStatusIsAnomalous(row) ? (
                      <span className="mobile-row-flag">
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {totalPages > 1 ? (
          <div className="card-body registry-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
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

      {/* R-15.8a-f: the `1fr 1fr` this node used to carry INLINE now lives in
          `.billing-split`, declared OUTSIDE the media query so the desktop stays
          measured-identical (488/488 at 1280) — `.split`'s own base is `2fr 1fr`,
          so simply dropping the inline would have moved it to ~660/326 — and
          neutralised inside `@media (max-width: 640px)`, where an inline style
          could never have been overridden. It was the only `.split` of the app
          that did not collapse: two 151.5px cards at 375px, each with its own
          horizontal scroller. */}
      <div className="split billing-split">
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
                  {/* `.billing-cat-line`/`.billing-cat-name`: at 320px the name and
                      the three mono values measured 226 of clientWidth against 259 of
                      content — the card's own `overflow: hidden` was cutting the
                      "Netto" column off. The phone rules let the line wrap and give
                      the free-text name an ellipsis. */}
                  <div className="billing-cat-line" style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11.5, marginBottom: 6 }}>
                    <span className="billing-cat-name" style={{ color: 'var(--ink-2)' }}>{entry.categoryName}</span>
                    <span style={{ display: 'flex', gap: 10 }}>
                      {/* R-15.8a-i: `.stat-tone-*` instead of the raw token — measured
                          2.73:1 (in) and 3.96:1 (out) as body-sized text on `--panel`
                          in the light theme, both under the 4.5 floor; the class the
                          riquadri and the Entrate/Uscite columns already use measures
                          10.63 / 9.82 and keeps the dark theme on its own tokens. */}
                      <span className="stat-tone-ok" title={labels.byCategory.in}>
                        {formatCents(entry.inCents, moneyLocale)}
                      </span>
                      <span className="stat-tone-bad" title={labels.byCategory.out}>
                        {formatCents(entry.outCents, moneyLocale)}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }} title={labels.byCategory.net}>
                        {formatCents(entry.netCents, moneyLocale)}
                      </span>
                    </span>
                  </div>
                  {/* The two flow segments are GRAPHIC OBJECTS on `--bg-sunken`:
                      measured 2.47:1 (in) and 3.59:1 (out) in the light theme, the
                      first under the 3:1 floor. `.flow-bar-in`/`.flow-bar-out` carry
                      the same `color-mix` on the same tokens `.mobile-row-edge-*`
                      already uses (15.4) — no new colour literal, no token changed. */}
                  <div style={{ height: 10, background: 'var(--bg-sunken)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex' }}>
                    <div className="flow-bar-in" style={{ height: '100%', width: `${(entry.inCents / maxCategoryFlow) * 100}%` }} />
                    <div className="flow-bar-out" style={{ height: '100%', width: `${(Math.abs(entry.outCents) / maxCategoryFlow) * 100}%` }} />
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
        <div className="card billing-negative-card" style={{ marginTop: 16 }} data-testid="billing-negative-balances-card">
          <div className="card-head">
            <div className="card-title">{labels.negativeBalances.title}</div>
            <span className="card-sub">{negativeBalances.length}</span>
            <div className="spacer" />
            <Link href="/dashboard/pilots" locale={locale as AppLocale} className="card-sub" style={{ textDecoration: 'underline' }}>
              {labels.negativeBalances.link}
            </Link>
          </div>
          {/* The `max-height`/`overflow-y` this node used to carry inline moved
              into `.billing-negative-list` (identical computed style above 640px,
              measured): an inline `max-height` cannot be overridden by a media
              query, and on a phone 220px of a 61-row list, with 44px rows, shows
              four names. */}
          <div className="card-body billing-negative-list">
            {negativeBalances.map((item) => (
              <div key={item.personId} className="billing-negative-row" data-testid="negative-balance-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <Link href={`/dashboard/people/${item.personId}`} locale={locale as AppLocale}>
                  {item.lastName} {item.firstName}
                </Link>
                {/* R-15.8a-i: measured 3.96:1 as body-sized text on `--panel` in the light theme. */}
                <span className="mono num stat-tone-bad">{formatCents(item.balanceCents, moneyLocale)}</span>
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

      {/* The "Filtri" panel (R-15.8a-e, AD-3). Rendered only while open, and
          reachable only from a trigger that is `display: none` above 640px, so
          nothing of it — not even its 21 `<option>`s — exists in the desktop
          DOM, and `cash-register.spec.ts`'s own `billing-filter-category` stays
          ONE node there. It reuses `SlideOver`'s full-screen mobile mode (15.2):
          fixed header with the X, primary action anchored in `.so-foot` at 44px.
          The controls are the desktop ones RE-RENDERED over a draft, not moved:
          the desktop head navigates on every change, this panel navigates once,
          and a single element cannot do both. */}
      {filterDraft !== null ? (
        <SlideOver
          open
          title={labels.mobile.filtersTitle}
          onClose={dismissFilterPanel}
          closeLabel={labels.mobile.close}
          footer={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilterDraft(null);
                  handleReset();
                }}
                data-testid="billing-filter-reset-mobile"
              >
                {labels.filters.reset}
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn primary" onClick={applyFilterDraft} data-testid="mobile-billing-filters-apply">
                {labels.mobile.apply}
              </button>
            </>
          }
        >
          <div className="billing-filter-panel" data-testid="mobile-billing-filter-panel">
            <div className="fld">
              <label className="fld-label" htmlFor="billing-filter-date-from-mobile">
                {labels.filters.dateFrom}
              </label>
              <DateInput
                id="billing-filter-date-from-mobile"
                value={filterDraft.dateFrom}
                onChange={(event) => setFilterDraft({ ...filterDraft, dateFrom: event.target.value })}
                data-testid="billing-filter-date-from-mobile"
              />
            </div>
            <div className="fld">
              <label className="fld-label" htmlFor="billing-filter-date-to-mobile">
                {labels.filters.dateTo}
              </label>
              <DateInput
                id="billing-filter-date-to-mobile"
                value={filterDraft.dateTo}
                onChange={(event) => setFilterDraft({ ...filterDraft, dateTo: event.target.value })}
                data-testid="billing-filter-date-to-mobile"
              />
            </div>
            <div className="fld">
              <label className="fld-label" htmlFor="billing-filter-category-mobile">
                {labels.filters.category}
              </label>
              <select
                id="billing-filter-category-mobile"
                className="input"
                value={filterDraft.categoryId}
                onChange={(event) => setFilterDraft({ ...filterDraft, categoryId: event.target.value })}
                data-testid="billing-filter-category-mobile"
              >
                <option value="">{labels.filters.allCategories}</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SlideOver>
      ) : null}

      {/* The row-detail sheet (AD-7: rendered conditionally, so
          `mobile-transaction-sheet` is ONE node). Its three writes are the
          desktop row's, under the SAME gates, and all three complete INSIDE the
          sheet as a `secondStep` (R-15.8a-g): they move real money and cannot be
          undone from the UI, so the decision stays where the finger started it
          instead of stacking a z-60 `.mini-modal` on a z-40 sheet (AD-9). */}
      {sheetRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-transaction-sheet"
          sub={transactionSheetSub({
            date: formatDateOnly(sheetRow.date, moneyLocale),
            bookTypeLabel: labels.table.bookTypes[sheetRow.bookType],
            personName: sheetRow.personName,
          })}
          title={transactionCardTitle({ kindLabel: kindLabel(sheetRow, labels), description: sheetRow.description })}
          badge={
            <Badge tone={statusInfo(sheetRow, labels).tone} dot>
              {statusInfo(sheetRow, labels).label}
            </Badge>
          }
          rows={sheetRows(sheetRow)}
          closeLabel={labels.mobile.close}
          actions={
            sheetRow.actionable || (sheetRow.source === 'CASH' && sheetRow.method === null) ? (
              <>
                {sheetRow.actionable && sheetRow.source === 'ACCOUNT' ? (
                  <button
                    type="button"
                    className="btn primary"
                    ref={sheetAdjustActionRef}
                    onClick={() => {
                      setSheetAmountError(false);
                      setSheetReasonError(false);
                      setSheetError(null);
                      setSheetStep('adjust');
                    }}
                    data-testid="transaction-adjust-action-mobile"
                  >
                    {labels.actions.adjust}
                  </button>
                ) : null}
                {sheetRow.source === 'CASH' && sheetRow.method === null ? (
                  <button
                    type="button"
                    className="btn primary"
                    ref={sheetReclassifyActionRef}
                    onClick={() => {
                      setSheetMethod(null);
                      setSheetError(null);
                      setSheetStep('reclassify');
                    }}
                    data-testid="transaction-reclassify-action-mobile"
                  >
                    {labels.mobile.reclassify}
                  </button>
                ) : null}
                {/* Destructive-styled and last: a storno writes the reversal movement and is irreversible, so it is never the button a thumb lands on by default. */}
                {sheetRow.actionable && sheetRow.source === 'CASH' ? (
                  <button
                    type="button"
                    className="btn mini bad"
                    ref={sheetReverseActionRef}
                    onClick={() => {
                      setSheetReasonError(false);
                      setSheetError(null);
                      setSheetStep('reverse');
                    }}
                    data-testid="transaction-reverse-action-mobile"
                  >
                    {labels.actions.reverse}
                  </button>
                ) : null}
              </>
            ) : undefined
          }
          secondStep={
            sheetStep === 'adjust' ? (
              <div className="bottom-sheet-step billing-sheet-step">
                <p className="fld-hint">{labels.adjustModal.linkedTo.replace('{date}', formatDateOnly(sheetRow.date, moneyLocale))}</p>
                <label className="fld-label" htmlFor="billing-adjust-amount-mobile">
                  {labels.adjustModal.amount}
                </label>
                <input
                  id="billing-adjust-amount-mobile"
                  className="input"
                  inputMode="decimal"
                  value={sheetAmount}
                  onChange={(event) => setSheetAmount(event.target.value)}
                  aria-invalid={sheetAmountError}
                  ref={sheetAmountRef}
                  data-testid="transaction-adjust-amount-mobile"
                />
                <p className="fld-hint">{labels.adjustModal.amountHint}</p>
                {sheetAmountError ? (
                  <p className="fld-error" data-testid="transaction-adjust-invalid-mobile">
                    {labels.adjustModal.invalidAmount}
                  </p>
                ) : null}
                <label className="fld-label" htmlFor="billing-adjust-reason-mobile">
                  {labels.adjustModal.reason}
                </label>
                <input
                  id="billing-adjust-reason-mobile"
                  className="input"
                  value={sheetReason}
                  onChange={(event) => setSheetReason(event.target.value)}
                  aria-invalid={sheetReasonError}
                  maxLength={500}
                  data-testid="transaction-adjust-reason-mobile"
                />
                {sheetReasonError ? (
                  <p className="fld-error" data-testid="transaction-adjust-required-mobile">
                    {labels.adjustModal.requiredReason}
                  </p>
                ) : null}
                {sheetError ? (
                  <p role="alert" className="fld-error" data-testid="transaction-adjust-error-mobile">
                    {sheetError}
                  </p>
                ) : null}
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" onClick={() => setSheetStep('none')} data-testid="transaction-adjust-dismiss-mobile">
                    {labels.mobile.back}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={adjustSubmitting}
                    onClick={() => void submitSheetAdjust(sheetRow)}
                    data-testid="transaction-adjust-confirm-mobile"
                  >
                    {labels.adjustModal.submit}
                  </button>
                </div>
              </div>
            ) : sheetStep === 'reverse' ? (
              <div className="bottom-sheet-step billing-sheet-step">
                <p className="fld-hint">{labels.reverseModal.title}</p>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={500}
                  value={sheetReason}
                  onChange={(event) => setSheetReason(event.target.value)}
                  aria-label={labels.reverseModal.reason}
                  aria-invalid={sheetReasonError}
                  ref={sheetReasonRef}
                  data-testid="transaction-reverse-reason-mobile"
                />
                {sheetReasonError ? (
                  <p className="fld-error" data-testid="transaction-reverse-required-mobile">
                    {labels.reverseModal.requiredReason}
                  </p>
                ) : null}
                {sheetError ? (
                  <p role="alert" className="fld-error" data-testid="transaction-reverse-error-mobile">
                    {sheetError}
                  </p>
                ) : null}
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" onClick={() => setSheetStep('none')} data-testid="transaction-reverse-dismiss-mobile">
                    {labels.mobile.back}
                  </button>
                  <button
                    type="button"
                    className="btn mini bad"
                    disabled={reverseSubmitting}
                    onClick={() => void submitSheetReverse(sheetRow)}
                    data-testid="transaction-reverse-confirm-mobile"
                  >
                    {labels.reverseModal.confirm}
                  </button>
                </div>
              </div>
            ) : sheetStep === 'reclassify' ? (
              <div className="bottom-sheet-step billing-sheet-step">
                {/* R-15.8a-g: choose, THEN confirm — the desktop's write-on-change
                    `<select>` has no place on a phone, where the same gesture that
                    scrolls a list also picks an option. Same PATCH, same body. */}
                <p className="fld-hint">{labels.actions.reclassifyPlaceholder}</p>
                <div className="billing-method-choice" role="group" aria-label={labels.actions.reclassifyPlaceholder}>
                  {(['CASH', 'BANK_TRANSFER', 'POS'] as const).map((method, index) => (
                    <button
                      key={method}
                      type="button"
                      ref={index === 0 ? sheetMethodRef : undefined}
                      className={`btn ${sheetMethod === method ? 'primary' : ''}`}
                      aria-pressed={sheetMethod === method}
                      onClick={() => setSheetMethod(method)}
                      data-testid={`transaction-reclassify-method-mobile-${method}`}
                    >
                      {labels.table.methods[method]}
                    </button>
                  ))}
                </div>
                {sheetError ? (
                  <p role="alert" className="fld-error" data-testid="transaction-reclassify-error-mobile">
                    {sheetError}
                  </p>
                ) : null}
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" onClick={() => setSheetStep('none')} data-testid="transaction-reclassify-dismiss-mobile">
                    {labels.mobile.back}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={sheetMethod === null || reclassifyingId === sheetRow.id}
                    onClick={() => void submitSheetReclassify(sheetRow)}
                    data-testid="transaction-reclassify-confirm-mobile"
                  >
                    {labels.mobile.reclassifyConfirm}
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </>
  );
}
