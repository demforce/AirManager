'use client';

import { Fragment, useEffect, useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { useRouter } from '@/i18n/navigation';
import { buildExportHref } from '@/lib/export-href';
import { formatCents, parseCents } from '@/lib/money';
import type { PprRequestItemDto, PprStatusDto } from '@/lib/schemas/ppr';
import { formatDateTime } from '@/lib/time';
import { IDEMPOTENCY_KEY_HEADER, useIdempotencyKey } from '@/lib/use-idempotency-key';
import { TruncatedCell } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, inputBaseClasses } from '@/components/ui/input';
import { cn } from '@/components/ui/cn';
import { DatePicker, type DatePickerLabels } from '@/components/ui/date-picker';
import { FilterDisclosure, FilterDisclosurePanel, FilterDisclosureTrigger } from '@/components/ui/filter-disclosure';
import { CheckIcon, CircleXIcon } from '@/components/ui/icons';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';

export type PprRegisterFilters = { status: string; from: string; to: string };

export type PprRegisterLabels = {
  filters: {
    status: string;
    statusAll: string;
    statusOptions: { pending: string; approved: string; rejected: string; completed: string; cancelled: string };
    from: string;
    to: string;
    reset: string;
    /** Story 12.5 (AC 1) — shared `DatePicker` a11y/error strings. */
    datePicker: DatePickerLabels;
  };
  table: {
    pprNumber: string;
    requester: string;
    aircraft: string;
    eta: string;
    status: string;
    fee: string;
    actions: string;
    noValue: string;
  };
  actions: {
    complete: string;
    cancel: string;
    confirmCancelPrompt: string;
    confirmYes: string;
    confirmNo: string;
    feeLabel: string;
    feeHint: string;
    invalidFee: string;
    submitComplete: string;
    closePanel: string;
  };
  feedback: {
    completed: string;
    cancelled: string;
    conflictError: string;
    genericError: string;
  };
  empty: string;
};

type PprRegisterProps = {
  requests: PprRequestItemDto[];
  locale: 'it' | 'en';
  filters: PprRegisterFilters;
  /** Story 10.1 (AC 5) — "Esporta Excel" label; the href is built here from the LIVE `filters` state. */
  exportLabel: string;
  labels: PprRegisterLabels;
};

type ApiErrorBody = { error?: { code?: string } };

async function isConflict(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code === 'PPR_NOT_APPROVED';
}

/** `PprStatusDto` -> the badge palette already established across the dashboard (`FlightStatusCell`, `types-manager.tsx`, `account-statement-table.tsx`) — no new colors introduced. PENDING/COMPLETED keep their own established tones (outside the shared ok/warning/danger tripletta, AC 4: invariant). */
const STATUS_BADGE_TONE: Record<PprStatusDto, StatusTone | string> = {
  PENDING: 'bg-canvas text-ink-soft',
  APPROVED: 'ok',
  REJECTED: 'danger',
  COMPLETED: 'bg-[#E1F3FE] text-[#1F6C9F]',
  CANCELLED: 'warning',
};

function StatusBadge({ status, label }: { status: PprStatusDto; label: string }) {
  return <StatusPill tone={STATUS_BADGE_TONE[status]}>{label}</StatusPill>;
}

function statusOptionLabel(status: PprStatusDto, labels: PprRegisterLabels['filters']['statusOptions']): string {
  switch (status) {
    case 'PENDING':
      return labels.pending;
    case 'APPROVED':
      return labels.approved;
    case 'REJECTED':
      return labels.rejected;
    case 'COMPLETED':
      return labels.completed;
    case 'CANCELLED':
      return labels.cancelled;
  }
}

const inputClasses = cn(inputBaseClasses, 'mt-2 min-h-[40px]');

/**
 * PPR register (epic 8, story 8.3, AC 1/2). Model: `flights-manager.tsx`'s
 * `FilterBar` for the status/period controls (live-apply, no "Applica"
 * button, "Azzera filtri" resets to the unfiltered `ALL`/no-period view),
 * `bookings-list.tsx` for the overall data-flow shape (`requests` rendered
 * straight from props, `router.refresh()` after any mutation instead of
 * local list reconciliation, AD-1: the server stays the single read path),
 * and `finance/cash-register.tsx`'s `ReverseForm` for the per-row
 * "Completa" panel (remount via row `key`, explicit confirm,
 * `useIdempotencyKey`). "Annulla PPR" is a lighter two-step confirm
 * in-cell, same shape as `ppr-queue.tsx`'s approve confirm. Both actions
 * render ONLY on `APPROVED` rows (Dev Notes: every other status is
 * read-only history here).
 */
export function PprRegister({ requests, locale, filters, exportLabel, labels }: PprRegisterProps) {
  const router = useRouter();
  const [rowAction, setRowAction] = useState<{ id: string; mode: 'complete' | 'cancelConfirm' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function navigate(next: PprRegisterFilters): void {
    const params = new URLSearchParams();
    if (next.status !== 'APPROVED') params.set('status', next.status);
    if (next.from) params.set('from', next.from);
    if (next.to) params.set('to', next.to);
    const search = params.toString();
    router.push(`/dashboard/ppr/register${search ? `?${search}` : ''}`);
  }

  function handleFilterChange(patch: Partial<PprRegisterFilters>): void {
    navigate({ ...filters, ...patch });
  }

  function handleResetFilters(): void {
    // "Azzera filtri" -> back to the page's own default (`APPROVED`, no
    // period bound), NOT the register's unfiltered `'ALL'` — `'ALL'` remains
    // a selectable filter VALUE (TD-5 AC 4), just no longer the reset target.
    navigate({ status: 'APPROVED', from: '', to: '' });
  }

  // TD-5 AC 4: `APPROVED` is the page's own default (`page.tsx`'s
  // `sanitizeStatus(sp.status) ?? 'APPROVED'`), so it must NOT count as an
  // "active filter" — otherwise the button shows on a freshly opened
  // register with no URL params at all.
  const hasActiveFilter = filters.status !== 'APPROVED' || filters.from !== '' || filters.to !== '';
  // TD-6 (AC 1) — the "Filtri" disclosure's badge count, same three-field
  // scope as `hasActiveFilter` above.
  const activeFilterCount = (filters.status !== 'APPROVED' ? 1 : 0) + (filters.from !== '' ? 1 : 0) + (filters.to !== '' ? 1 : 0);

  function startComplete(id: string): void {
    setFeedback(null);
    setRowAction({ id, mode: 'complete' });
  }

  function startCancelConfirm(id: string): void {
    setFeedback(null);
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
      setFeedback((await isConflict(response)) ? labels.feedback.conflictError : labels.feedback.genericError);
      return;
    }

    setRowAction(null);
    setFeedback(labels.feedback.cancelled);
    router.refresh();
  }

  const columnCount = 7;

  // Story 10.1 (AC 5): built from the LIVE filter-bar state (`filters`) on
  // every render — reflects a hand-edited URL or a just-changed filter the
  // same way `flights-manager.tsx`'s own export button does.
  const exportHref = buildExportHref('/api/v1/ppr-requests', { status: filters.status, from: filters.from, to: filters.to }, locale);

  return (
    <div data-testid="ppr-register">
      {/* UI-audit follow-up 2026-07-13 (user): the "Filtri" trigger sits right next to "Esporta" in one action row; the panel spans full-width below (compound FilterDisclosure). */}
      <div className="border-b border-hairline pb-6">
        <FilterDisclosure activeCount={activeFilterCount} defaultOpen={hasActiveFilter} testId="ppr-register-filter-bar">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <FilterDisclosureTrigger />
          <ExportButton href={exportHref} label={exportLabel} testId="ppr-register-export-button" />
        </div>
        <FilterDisclosurePanel>
          <div className="mt-6 flex flex-wrap items-end gap-4" data-testid="ppr-register-filter-bar">
            <div className="flex flex-col text-sm text-ink">
              <label htmlFor="ppr-register-filter-status">{labels.filters.status}</label>
              <select
                id="ppr-register-filter-status"
                value={filters.status}
                onChange={(event) => handleFilterChange({ status: event.target.value })}
                className={inputClasses}
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
            <DatePicker
              id="ppr-register-filter-from"
              label={labels.filters.from}
              value={filters.from}
              onChange={(next) => handleFilterChange({ from: next })}
              labels={labels.filters.datePicker}
              testId="ppr-register-filter-from"
              className="min-w-[160px]"
            />
            <DatePicker
              id="ppr-register-filter-to"
              label={labels.filters.to}
              value={filters.to}
              onChange={(next) => handleFilterChange({ to: next })}
              labels={labels.filters.datePicker}
              testId="ppr-register-filter-to"
              className="min-w-[160px]"
            />
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={handleResetFilters}
                data-testid="ppr-register-filter-reset"
                className="min-h-[40px] rounded-buttons border border-hairline bg-paper px-3 text-sm font-medium text-ink transition-colors hover:bg-canvas"
              >
                {labels.filters.reset}
              </button>
            ) : null}
          </div>
        </FilterDisclosurePanel>
        </FilterDisclosure>
      </div>

      {feedback ? (
        <p role="status" data-testid="ppr-register-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      {requests.length === 0 ? (
        <p className="mt-6 text-sm text-mid-gray" data-testid="ppr-register-empty">
          {labels.empty}
        </p>
      ) : (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs font-medium uppercase tracking-[0.05em] text-mid-gray">
                <th className="px-5 py-3">{labels.table.pprNumber}</th>
                <th className="px-5 py-3">{labels.table.requester}</th>
                <th className="px-5 py-3">{labels.table.aircraft}</th>
                <th className="px-5 py-3">{labels.table.eta}</th>
                <th className="px-5 py-3">{labels.table.status}</th>
                <th className="px-5 py-3">{labels.table.fee}</th>
                <th className="px-5 py-3">{labels.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const isBusy = busyId === request.id;
                const action = rowAction?.id === request.id ? rowAction.mode : null;

                return (
                  <Fragment key={request.id}>
                    <tr data-testid="ppr-register-row" className="border-b border-hairline align-top text-ink">
                      <td className="px-5 py-3 whitespace-nowrap">{request.pprNumber ?? labels.table.noValue}</td>
                      <td className="px-5 py-3">
                        <TruncatedCell value={`${request.firstName} ${request.lastName}`} className="max-w-[200px]" />
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">{request.aircraftRegistration}</td>
                      <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(new Date(request.eta), locale)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={request.status} label={statusOptionLabel(request.status, labels.filters.statusOptions)} />
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {request.landingFeeCents !== null ? formatCents(request.landingFeeCents, locale) : labels.table.noValue}
                      </td>
                      <td className="px-5 py-3">
                        {request.status !== 'APPROVED' ? null : action === 'cancelConfirm' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-mid-gray">{labels.actions.confirmCancelPrompt}</span>
                            <Button size="sm"
                              type="button"
                              disabled={isBusy}
                              onClick={() => void confirmCancel(request.id)}
                              data-testid="ppr-register-cancel-confirm"
                            >
                              {labels.actions.confirmYes}
                            </Button>
                            <Button variant="outline" size="sm"
                              type="button"
                              onClick={closeRowAction}
                              data-testid="ppr-register-cancel-abort"
                            >
                              {labels.actions.confirmNo}
                            </Button>
                          </div>
                        ) : action === 'complete' ? null : (
                          <div className="flex flex-wrap gap-2">
                            <Button size="icon"
                              type="button"
                              disabled={isBusy}
                              onClick={() => startComplete(request.id)}
                              data-testid="ppr-register-complete-button"
                              aria-label={labels.actions.complete}
                              title={labels.actions.complete}
                            >
                              <CheckIcon />
                            </Button>
                            <Button variant="outline" size="icon"
                              type="button"
                              disabled={isBusy}
                              onClick={() => startCancelConfirm(request.id)}
                              data-testid="ppr-register-cancel-button"
                              aria-label={labels.actions.cancel}
                              title={labels.actions.cancel}
                            >
                              <CircleXIcon />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {action === 'complete' ? (
                      <tr className="border-b border-hairline bg-canvas">
                        <td colSpan={columnCount} className="px-5 py-4">
                          <CompleteForm
                            // Remount per target row (review 2.4 F1 pattern,
                            // already used by `ReverseForm`): the default-fee
                            // fetch and local field state must start fresh
                            // for each row this panel opens against.
                            key={request.id}
                            id={request.id}
                            pprNumber={request.pprNumber}
                            labels={labels.actions}
                            genericErrorLabel={labels.feedback.genericError}
                            onCancel={closeRowAction}
                            onSuccess={() => {
                              setRowAction(null);
                              setFeedback(labels.feedback.completed);
                              router.refresh();
                            }}
                            onConflict={() => {
                              setRowAction(null);
                              setFeedback(labels.feedback.conflictError);
                            }}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/** Euro string (comma decimal), the exact inverse of `parseCents` — used ONLY to prefill the fee input from the admin default (`GET /api/v1/settings/ppr-landing-fee`). */
function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

type CompleteFormProps = {
  id: string;
  pprNumber: string | null;
  labels: PprRegisterLabels['actions'];
  /** `labels.feedback.genericError` (network/500) — distinct from `labels.invalidFee` (client-side parse validation), same split as `NewMovementForm`'s `genericError`/`invalidAmount`. */
  genericErrorLabel: string;
  onCancel: () => void;
  onSuccess: () => void;
  onConflict: () => void;
};

/**
 * Per-row "Completa" panel (AC 1) — shape of `cash-register.tsx`'s
 * `ReverseForm`: a per-row confirmation panel, explicit submit,
 * `useIdempotencyKey` (TD-2: complete is a monetary POST). The fee field is
 * PREFILLED from the admin-configured default (`GET
 * /api/v1/settings/ppr-landing-fee`), fetched once on mount and left
 * editable — a fetch failure leaves the field at its blank default rather
 * than blocking the panel (Dev Notes: the completion flow must not depend
 * on this best-effort prefill). Plain local state, not react-hook-form,
 * same "single-field panel" shape as `ppr-queue.tsx`'s reject-reason panel
 * (its own direct sibling, not `cash-register.tsx`'s multi-field forms).
 */
function CompleteForm({ id, pprNumber, labels, genericErrorLabel, onCancel, onSuccess, onConflict }: CompleteFormProps) {
  const [feeInput, setFeeInput] = useState('');
  const [fieldError, setFieldError] = useState(false);
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
        // Never clobber a value the user already typed while the fetch was in
        // flight — the prefill only fills the still-untouched blank field.
        if (!cancelled) setFeeInput((current) => (current === '' ? centsToEuroInput(body.landingFeeCents) : current));
      } catch {
        // Best-effort prefill only (Dev Notes) — the field stays editable either way.
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
        body: JSON.stringify({ landingFeeCents }),
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
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4" data-testid="ppr-complete-form">
      <h4 className="text-base font-medium text-ink">
        {labels.complete}
        {pprNumber ? <span className="ml-2 font-normal text-mid-gray">{pprNumber}</span> : null}
      </h4>
      <div>
        <label htmlFor={`ppr-complete-fee-${id}`} className="block text-sm font-medium text-ink">
          {labels.feeLabel}
        </label>
        <Input
          id={`ppr-complete-fee-${id}`}
          data-testid="ppr-complete-fee-input"
          inputMode="decimal"
          placeholder="0,00"
          aria-invalid={fieldError}
          value={feeInput}
          onChange={(event) => setFeeInput(event.target.value)}
          className="mt-2 w-full max-w-[200px]"
        />
        <p className="mt-1 text-xs text-mid-gray">{labels.feeHint}</p>
        {fieldError ? (
          <p role="alert" className="mt-1 text-xs text-ember">
            {labels.invalidFee}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-ember">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={submitting}
          data-testid="ppr-complete-submit"
        >
          {labels.submitComplete}
        </Button>
        <Button variant="outline"
          type="button"
          onClick={onCancel}
          data-testid="ppr-complete-close"
        >
          {labels.closePanel}
        </Button>
      </div>
    </form>
  );
}
