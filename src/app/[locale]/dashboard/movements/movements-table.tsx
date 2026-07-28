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
 */
import { Fragment, useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DateInput } from '@/components/ui/date-input';
import { ExportMenu } from '@/components/ui/export-menu';
import { Field, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { formatCents, parseCents } from '@/lib/money';
import type { PprRequestItemDto } from '@/lib/schemas/ppr';
import { formatDateTime } from '@/lib/time';
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

  const cols = '90px 90px 120px 1.2fr 1fr 1fr 110px 90px 170px';

  return (
    <div className="card" data-testid="ppr-register">
      <div className="card-head">
        <div className="card-title">{labels.card.title}</div>
        <span className="card-sub">{labels.card.subTemplate.replace('{total}', String(rows.length))}</span>
        <div className="fld" style={{ minWidth: 0 }} data-testid="ppr-register-filter-bar">
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
        <div className="fld" style={{ minWidth: 0 }}>
          <DateInput className={inputClasses} value={filters.from} onChange={(event) => handleFilterChange({ from: event.target.value })} aria-label={labels.filters.from} data-testid="ppr-register-filter-from" />
        </div>
        <div className="fld" style={{ minWidth: 0 }}>
          <DateInput className={inputClasses} value={filters.to} onChange={(event) => handleFilterChange({ to: event.target.value })} aria-label={labels.filters.to} data-testid="ppr-register-filter-to" />
        </div>
        {hasActiveFilter ? (
          <button type="button" className="btn" onClick={handleResetFilters} data-testid="ppr-register-filter-reset">
            {labels.filters.reset}
          </button>
        ) : null}
        <div className="spacer" />
        <ExportMenu label={exportTriggerLabel} xlsLabel={exportXlsLabel} xlsHref={exportHref} pdfLabel={exportPdfLabel} pdfHref={exportPdfHref} />
      </div>
      {/* `<div className="students">` below is a CSS-grid list, not a real `<table>` (`airops.css`'s `.student-row` convention, same as `ppr-console.tsx`/`bookings-table.tsx`) — every row is a `<div>`. */}

      {rows.length === 0 ? (
        <p className="card-body" data-testid="ppr-register-empty">
          {labels.empty}
        </p>
      ) : (
        <div className="students">
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
  onCancel: () => void;
  onSuccess: () => void;
  onConflict: () => void;
};

/** Per-row "Completa" panel (story 8.3, AC 1) — same shape as the pre-12.4 register's own `CompleteForm`, restyled. */
function CompleteForm({ id, pprNumber, labels, genericErrorLabel, onCancel, onSuccess, onConflict }: CompleteFormProps) {
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
    <form onSubmit={(event) => void handleSubmit(event)} noValidate data-testid="ppr-complete-form" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600 }}>
        {labels.complete}
        {pprNumber ? <span className="mono" style={{ marginLeft: 8, fontWeight: 400, color: 'var(--ink-3)' }}>{pprNumber}</span> : null}
      </h4>
      <div className="fld" style={{ maxWidth: 200 }}>
        <label className="fld-label-group">
          <span className="fld-label">{labels.feeLabel}</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={fieldError}
            value={feeInput}
            onChange={(event) => {
              setFeeInput(event.target.value);
              if (fieldError) setFieldError(false);
            }}
            data-testid="ppr-complete-fee-input"
          />
        </label>
        {fieldError ? (
          <span className="fld-error" role="alert">
            {labels.invalidFee}
          </span>
        ) : null}
      </div>
      <p className="fld-label">{labels.feeHint}</p>

      <div style={{ maxWidth: 200 }}>
        <Field label={labels.methodLabel}>
          <Select value={method} onChange={(event) => setMethod(event.target.value as 'CASH' | 'BANK_TRANSFER' | 'POS')} data-testid="ppr-complete-method">
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

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting} className="btn primary" data-testid="ppr-complete-submit">
          {labels.submitComplete}
        </button>
        <button type="button" onClick={onCancel} className="btn" data-testid="ppr-complete-close">
          {labels.closePanel}
        </button>
      </div>
    </form>
  );
}
