'use client';

/**
 * Billing (Contabilità) console (story 12.9, AC 2/3/4/5/6) — port of
 * `docs/design-reference/airops/src/BillingView.jsx` onto the real, unified
 * ledger (`transactions.service.ts`), same shell idiom as
 * `fleet-console.tsx`/`pilots-console.tsx`/`logbook-console.tsx` (`.card` +
 * `.card-head` filters/export/new-button, `.students`/`.student-row` grid
 * table, `.split` for the two secondary cards). `finance.manage` only — no
 * own-access face (unlike logbook/bookings): the page.tsx redirect-gate is
 * the ONLY door, every consumer here already has full access.
 *
 * Action buttons (AC 2: "bottoni Estratti conto e Nuova transazione" in the
 * prototype's page-head) live in THIS card's head instead, deliberately
 * matching the established codebase deviation from the prototype's own
 * page-head-button placement (fleet/pilots/instructors all do the same —
 * `docs/design-reference/airops/src/Fleet.jsx` ALSO shows "Aggiungi
 * aeromobile" in its page-head, yet `fleet-console.tsx` moved it into the
 * card-head; the Dev Notes' "come fleet/pilots/logbook" template reference
 * is the binding instruction here, not the prototype's exact DOM position).
 *
 * Per-row Rettifica/Storna (AC 3) reuse the EXISTING, already-tested
 * endpoints directly (`POST /account/adjustments` with `originalMovementId`,
 * `POST /cash-movements/{id}/reverse`) — NOT the new unified
 * `POST /api/v1/transactions`, which only backs the "Nuova transazione"
 * SlideOver's 3 STANDALONE branches (AC 4).
 */
import { useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { Icon } from '@/components/ui/icons';
import { Avatar } from '@/components/ui/avatar';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { formatCents, parseCents } from '@/lib/money';
import type { AccountMovementTypeDto } from '@/lib/schemas/accounts';
import type { TransactionRowDto } from '@/lib/schemas/transactions';
import { formatDateOnly, formatMinutes } from '@/lib/time';
import { SearchCombobox, type SearchComboboxOption } from '@/components/search-combobox';
import { StatementDialog, type StatementDialogLabels } from './statement-dialog';
import { TransactionEditor, type TransactionEditorLabels } from './transaction-editor';

type PersonOption = { id: string; firstName: string; lastName: string };
type CategoryOption = { id: string; name: string };
type CompensationRow = { personId: string; firstName: string; lastName: string; mtdMinutes: number; payoutRateCents: number | null; owedMtdCents: number | null };
type NegativeBalanceRow = { personId: string; firstName: string; lastName: string; balanceCents: number };

export type BillingFilters = { dateFrom: string; dateTo: string; type: string; personId: string };

export type BillingConsoleLabels = {
  newTransaction: string;
  statements: string;
  revenueByCategory: { title: string; sub: string; empty: string };
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
    amount: string;
    status: string;
    actions: string;
    noValue: string;
    empty: string;
    statusOptions: { registered: string; reversed: string; reversal: string };
    kinds: Record<AccountMovementTypeDto, string>;
    methods: { CASH: string; BANK_TRANSFER: string; POS: string };
  };
  filters: {
    dateFrom: string;
    dateTo: string;
    type: string;
    allTypes: string;
    accountGroup: string;
    cashGroup: string;
    pilot: string;
    allPilots: string;
    reset: string;
  };
  pagination: { prev: string; next: string };
  picker: { placeholder: string; noResults: string };
  actions: { adjust: string; reverse: string };
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
  statementsDialog: StatementDialogLabels;
};

export type BillingConsoleProps = {
  items: TransactionRowDto[];
  page: number;
  totalPages: number;
  filters: BillingFilters;
  personOptions: PersonOption[];
  categoryOptions: CategoryOption[];
  revenueByKind: { kind: string; amountCents: number }[];
  compensation: CompensationRow[];
  negativeBalances: NegativeBalanceRow[];
  exportHref: string;
  cashReportPdfHref: string;
  moneyLocale: 'it' | 'en';
  locale: 'it' | 'en';
  labels: BillingConsoleLabels;
};

const COLS = '92px 1.2fr 108px minmax(190px,1.6fr) 92px 108px 104px 72px';

const ACCOUNT_MOVEMENT_TYPES: readonly AccountMovementTypeDto[] = ['TOP_UP', 'ADJUSTMENT', 'PACKAGE_PURCHASE', 'FLIGHT_CHARGE', 'FLIGHT_CHARGE_REVERSAL'];

const ACCOUNT_KIND_TONE: Record<AccountMovementTypeDto, BadgeTone> = {
  TOP_UP: 'ok',
  FLIGHT_CHARGE: 'info',
  ADJUSTMENT: 'warn',
  FLIGHT_CHARGE_REVERSAL: 'bad',
  PACKAGE_PURCHASE: '',
};

function isAccountKind(kind: string): kind is AccountMovementTypeDto {
  return (ACCOUNT_MOVEMENT_TYPES as readonly string[]).includes(kind);
}

function kindBadgeTone(row: TransactionRowDto): BadgeTone {
  if (row.source === 'CASH') return '';
  return isAccountKind(row.kind) ? ACCOUNT_KIND_TONE[row.kind] : '';
}

function kindLabel(row: TransactionRowDto, labels: BillingConsoleLabels): string {
  if (row.source === 'ACCOUNT' && isAccountKind(row.kind)) return labels.table.kinds[row.kind];
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

function personLabel(person: PersonOption): string {
  return `${person.lastName} ${person.firstName}`;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

async function searchPersonFilter(query: string): Promise<SearchComboboxOption[]> {
  const params = new URLSearchParams({ q: query, pageSize: '50', profile: 'pilot-or-student' });
  const response = await fetch(`/api/v1/people?${params.toString()}`);
  if (!response.ok) return [];
  const body = (await response.json()) as { items: { id: string; firstName: string; lastName: string }[] };
  return body.items.map((person) => ({ id: person.id, label: personLabel(person) }));
}

export function BillingConsole({
  items,
  page,
  totalPages,
  filters: initialFilters,
  personOptions,
  categoryOptions,
  revenueByKind,
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [statementsOpen, setStatementsOpen] = useState(false);

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

  function buildFilterQuery(next: BillingFilters): Record<string, string> {
    const query: Record<string, string> = {};
    if (next.dateFrom) query['dateFrom'] = next.dateFrom;
    if (next.dateTo) query['dateTo'] = next.dateTo;
    if (next.type) query['type'] = next.type;
    if (next.personId) query['personId'] = next.personId;
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

  function handleReset(): void {
    const cleared: BillingFilters = { dateFrom: '', dateTo: '', type: '', personId: '' };
    setFilters(cleared);
    navigate(cleared);
  }

  function pageHref(targetPage: number) {
    return { pathname: '/dashboard/billing' as const, query: { page: targetPage, ...buildFilterQuery(filters) } };
  }

  const hasActiveFilter = Object.values(filters).some((value) => value !== '');

  const personComboOptions: SearchComboboxOption[] = [
    { id: '', label: labels.filters.allPilots },
    ...personOptions.map((person) => ({ id: person.id, label: personLabel(person) })),
  ];

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

  const maxRevenue = revenueByKind.reduce((max, entry) => Math.max(max, entry.amountCents), 1);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={`${labels.filters.dateFrom} – ${labels.filters.dateTo}`}>
            <input
              type="date"
              className="input"
              style={{ width: 'auto', fontSize: 12 }}
              value={filters.dateFrom}
              onChange={(event) => handleFilterChange({ dateFrom: event.target.value })}
              data-testid="billing-filter-date-from"
              aria-label={labels.filters.dateFrom}
            />
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>–</span>
            <input
              type="date"
              className="input"
              style={{ width: 'auto', fontSize: 12 }}
              value={filters.dateTo}
              onChange={(event) => handleFilterChange({ dateTo: event.target.value })}
              data-testid="billing-filter-date-to"
              aria-label={labels.filters.dateTo}
            />
          </div>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 150, fontSize: 12 }}
            value={filters.type}
            onChange={(event) => handleFilterChange({ type: event.target.value })}
            data-testid="billing-filter-type"
            aria-label={labels.filters.type}
          >
            <option value="">{labels.filters.allTypes}</option>
            <optgroup label={labels.filters.accountGroup}>
              {ACCOUNT_MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labels.table.kinds[type]}
                </option>
              ))}
            </optgroup>
            <optgroup label={labels.filters.cashGroup}>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          </select>
          <div style={{ width: 190 }}>
            <SearchCombobox
              id="billing-filter-person"
              label={labels.filters.pilot}
              value={filters.personId}
              onChange={(id) => handleFilterChange({ personId: id })}
              fetchOptions={searchPersonFilter}
              initialOptions={personComboOptions}
              placeholder={labels.picker.placeholder}
              emptyText={labels.picker.noResults}
            />
          </div>
          {hasActiveFilter ? (
            <button type="button" className="btn" onClick={handleReset} data-testid="billing-filter-reset">
              {labels.filters.reset}
            </button>
          ) : null}
          <ExportMenu label={labels.exportMenu.label} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={cashReportPdfHref} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={exportHref} />
          <button type="button" className="btn" onClick={() => setStatementsOpen(true)} data-testid="billing-statements-button">
            <Icon.doc /> {labels.statements}
          </button>
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
              <div style={{ textAlign: 'right' }}>{labels.table.amount}</div>
              <div>{labels.table.status}</div>
              <div>{labels.table.actions}</div>
            </div>
            {items.map((row) => {
              const status = statusInfo(row, labels);
              return (
                <div key={row.id} className="student-row" data-testid="transaction-row" style={{ gridTemplateColumns: COLS }}>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                    {formatDateOnly(row.date, moneyLocale)}
                  </div>
                  <div>
                    <div className="student-name">{row.personName ?? labels.table.noValue}</div>
                    <div className="student-sub mono" style={{ fontSize: 10.5 }}>
                      {row.id}
                    </div>
                  </div>
                  <div>
                    <Badge tone={kindBadgeTone(row)}>{kindLabel(row, labels)}</Badge>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description ?? ''}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                    {methodLabel(row, labels)}
                  </div>
                  <div className="mono num" style={{ fontWeight: 600, textAlign: 'right', color: row.amountCents < 0 ? 'var(--ok)' : 'var(--ink)' }}>
                    {formatCents(row.amountCents, moneyLocale)}
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
              className={`btn ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
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
              className={`btn ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
            >
              {labels.pagination.next}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">{labels.revenueByCategory.title}</div>
            <span className="card-sub">{labels.revenueByCategory.sub}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {revenueByKind.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }} data-testid="billing-revenue-by-category-empty">
                {labels.revenueByCategory.empty}
              </p>
            ) : (
              revenueByKind.map((entry) => (
                <div key={entry.kind} data-testid="billing-revenue-by-category-row">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11.5, marginBottom: 6 }}>
                    <span style={{ color: 'var(--ink-2)' }}>{isAccountKind(entry.kind) ? labels.table.kinds[entry.kind] : entry.kind}</span>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatCents(entry.amountCents, moneyLocale)}</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--bg-sunken)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ height: '100%', width: `${(entry.amountCents / maxRevenue) * 100}%`, background: 'var(--accent)' }} />
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

      <StatementDialog open={statementsOpen} onClose={() => setStatementsOpen(false)} personOptions={personOptions} locale={locale} labels={labels.statementsDialog} />

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
            {adjustAmountError ? <p style={{ color: 'var(--bad)', fontSize: 12 }}>{labels.adjustModal.invalidAmount}</p> : null}
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
            {adjustReasonError ? <p style={{ color: 'var(--bad)', fontSize: 12 }}>{labels.adjustModal.requiredReason}</p> : null}
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
            {reverseReasonError ? <p style={{ color: 'var(--bad)', fontSize: 12 }}>{labels.reverseModal.requiredReason}</p> : null}
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
