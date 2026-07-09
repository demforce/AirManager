'use client';

import { Fragment, useState } from 'react';
import { parseCents } from '@/lib/money';
import type { PprOperatingInstructionsDto, PprRequestItemDto } from '@/lib/schemas/ppr';
import { formatDateTime } from '@/lib/time';

export type PprQueueLabels = {
  table: {
    requester: string;
    aircraft: string;
    route: string;
    eta: string;
    persons: string;
    actions: string;
  };
  detail: {
    show: string;
    hide: string;
    email: string;
    phone: string;
    etd: string;
    noEtd: string;
    notes: string;
    noNotes: string;
    locale: string;
    localeIt: string;
    localeEn: string;
  };
  actions: {
    approve: string;
    reject: string;
    confirmApprove: string;
    confirmYes: string;
    confirmCancel: string;
    reasonLabel: string;
    reasonRequired: string;
    submitReject: string;
    cancelReject: string;
  };
  feedback: {
    /** Raw catalogue string, unresolved `{pprNumber}` placeholder — see `.replace()` below (pattern `cash-register.tsx`'s `reversalOfDate`). */
    approved: string;
    rejected: string;
    conflictError: string;
    genericError: string;
  };
  empty: string;
};

export type PprOperatingInstructionsLabels = {
  heading: string;
  description: string;
  it: string;
  en: string;
  save: string;
  saved: string;
  error: string;
};

/** Story 8.3, AC 1 — the default landing fee sub-block that joins the operating-instructions editor in the SAME settings section. */
export type PprLandingFeeLabels = {
  heading: string;
  description: string;
  amountLabel: string;
  invalidAmount: string;
  save: string;
  saved: string;
  error: string;
};

type PprQueueProps = {
  requests: PprRequestItemDto[];
  locale: 'it' | 'en';
  labels: PprQueueLabels;
  /** `settings.manage` only (Contesto: "l'editor ... visibile solo a chi ha settings.manage") — `null` hides the whole section. */
  instructionsEditor: {
    initial: PprOperatingInstructionsDto;
    labels: PprOperatingInstructionsLabels;
    /** Story 8.3, AC 1: default landing fee, same section, own independent save action. */
    landingFee: { initialCents: number; labels: PprLandingFeeLabels };
  } | null;
};

type PendingConfirm = { id: string; action: 'APPROVE' } | { id: string; action: 'REJECT' };

type ApiErrorBody = { error?: { code?: string } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

/**
 * Staff PPR approval queue (epic 8, story 8.2; FR-23, FR-41). Model:
 * `expiries/proposals-queue.tsx` (PENDING queue, per-row actions, decided
 * rows removed from local state on success) for the overall shape, plus
 * `bookings-list.tsx`'s expandable-row pattern for the detail toggle and
 * `finance/cash-register.tsx`'s `ReverseForm` for the reject-with-reason
 * form-in-row. Approve is a simple two-step confirm (no extra input);
 * reject additionally requires a non-empty reason, validated client-side
 * BEFORE any network call (AC 2: "senza motivo -> nessuna chiamata").
 */
export function PprQueue({ requests: initialRequests, locale, labels, instructionsEditor }: PprQueueProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function toggleExpanded(id: string): void {
    setExpandedId((current) => (current === id ? null : id));
  }

  function startConfirm(id: string, action: 'APPROVE' | 'REJECT'): void {
    setFeedback(null);
    setPendingConfirm({ id, action });
  }

  function cancelConfirm(): void {
    setPendingConfirm(null);
  }

  function handleErrorCode(code: string | null): void {
    setFeedback(code === 'PPR_ALREADY_DECIDED' ? labels.feedback.conflictError : labels.feedback.genericError);
  }

  async function confirmApprove(id: string): Promise<void> {
    setBusyId(id);
    const response = await fetch(`/api/v1/ppr-requests/${id}/approve`, { method: 'POST' });
    setBusyId(null);
    setPendingConfirm(null);

    if (!response.ok) {
      handleErrorCode(await errorCodeOf(response));
      return;
    }

    const decided = (await response.json()) as PprRequestItemDto;
    setRequests((current) => current.filter((request) => request.id !== id));
    setFeedback(labels.feedback.approved.replace('{pprNumber}', decided.pprNumber ?? ''));
  }

  async function submitReject(id: string): Promise<void> {
    const reason = (reasonDrafts[id] ?? '').trim();
    if (reason.length === 0) {
      setReasonErrors((current) => ({ ...current, [id]: true }));
      return;
    }

    setBusyId(id);
    const response = await fetch(`/api/v1/ppr-requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setBusyId(null);

    if (!response.ok) {
      setPendingConfirm(null);
      handleErrorCode(await errorCodeOf(response));
      return;
    }

    setPendingConfirm(null);
    setReasonErrors((current) => ({ ...current, [id]: false }));
    setRequests((current) => current.filter((request) => request.id !== id));
    setFeedback(labels.feedback.rejected);
  }

  const feedbackBanner = feedback ? (
    <p role="status" data-testid="ppr-queue-feedback" className="mb-4 text-sm text-[#346538]">
      {feedback}
    </p>
  ) : null;

  return (
    <div data-testid="ppr-queue">
      {feedbackBanner}

      {requests.length === 0 ? (
        <p className="text-sm text-[#787774]" data-testid="ppr-queue-empty">
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#EAEAEA]">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#EAEAEA] text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">
                <th className="px-5 py-3">{labels.table.requester}</th>
                <th className="px-5 py-3">{labels.table.aircraft}</th>
                <th className="px-5 py-3">{labels.table.route}</th>
                <th className="px-5 py-3">{labels.table.eta}</th>
                <th className="px-5 py-3">{labels.table.persons}</th>
                <th className="px-5 py-3">{labels.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const isExpanded = expandedId === request.id;
                const isBusy = busyId === request.id;
                const confirming = pendingConfirm?.id === request.id ? pendingConfirm.action : null;

                return (
                  <Fragment key={request.id}>
                    <tr data-testid="ppr-row" className="border-b border-[#EAEAEA] align-top text-[#111111]">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(request.id)}
                          data-testid="ppr-row-detail-toggle"
                          className="block text-left font-medium underline-offset-4 hover:underline"
                        >
                          {request.firstName} {request.lastName}
                        </button>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {request.aircraftRegistration} &middot; {request.aircraftType}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {request.origin} &rarr; {request.destination}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">{formatDateTime(new Date(request.eta), locale)}</td>
                      <td className="px-5 py-3">{request.personsOnBoard}</td>
                      <td className="px-5 py-3">
                        {confirming === 'APPROVE' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-[#787774]">{labels.actions.confirmApprove}</span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void confirmApprove(request.id)}
                              data-testid="ppr-approve-confirm"
                              className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
                            >
                              {labels.actions.confirmYes}
                            </button>
                            <button
                              type="button"
                              onClick={cancelConfirm}
                              data-testid="ppr-approve-cancel"
                              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                            >
                              {labels.actions.confirmCancel}
                            </button>
                          </div>
                        ) : confirming === 'REJECT' ? null : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => startConfirm(request.id, 'APPROVE')}
                              data-testid="ppr-approve-button"
                              className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
                            >
                              {labels.actions.approve}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => startConfirm(request.id, 'REJECT')}
                              data-testid="ppr-reject-button"
                              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3] disabled:opacity-50"
                            >
                              {labels.actions.reject}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {confirming === 'REJECT' ? (
                      <tr className="border-b border-[#EAEAEA] bg-[#F7F6F3]">
                        <td colSpan={6} className="px-5 py-4">
                          <label htmlFor={`ppr-reject-reason-${request.id}`} className="block text-sm font-medium text-[#2F3437]">
                            {labels.actions.reasonLabel}
                          </label>
                          <textarea
                            id={`ppr-reject-reason-${request.id}`}
                            data-testid="ppr-reject-reason"
                            rows={2}
                            maxLength={500}
                            aria-invalid={Boolean(reasonErrors[request.id])}
                            value={reasonDrafts[request.id] ?? ''}
                            onChange={(event) =>
                              setReasonDrafts((current) => ({ ...current, [request.id]: event.target.value }))
                            }
                            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
                          />
                          {reasonErrors[request.id] ? (
                            <p role="alert" className="mt-1 text-xs text-[#9F2F2D]">
                              {labels.actions.reasonRequired}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void submitReject(request.id)}
                              data-testid="ppr-reject-submit"
                              className="rounded-[6px] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50"
                            >
                              {labels.actions.submitReject}
                            </button>
                            <button
                              type="button"
                              onClick={cancelConfirm}
                              data-testid="ppr-reject-cancel"
                              className="rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]"
                            >
                              {labels.actions.cancelReject}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}

                    {isExpanded ? (
                      <tr data-testid="ppr-row-detail" className="border-b border-[#EAEAEA] bg-[#FAFAF8]">
                        <td colSpan={6} className="px-5 py-4">
                          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.detail.email}</dt>
                              <dd className="mt-1 text-[#111111]">{request.email}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.detail.phone}</dt>
                              <dd className="mt-1 text-[#111111]">{request.phone}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.detail.etd}</dt>
                              <dd className="mt-1 text-[#111111]">
                                {request.etd ? formatDateTime(new Date(request.etd), locale) : labels.detail.noEtd}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.detail.locale}</dt>
                              <dd className="mt-1 text-[#111111]">{request.locale === 'it' ? labels.detail.localeIt : labels.detail.localeEn}</dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="text-xs font-medium uppercase tracking-[0.05em] text-[#787774]">{labels.detail.notes}</dt>
                              <dd className="mt-1 text-[#111111]">{request.notes || labels.detail.noNotes}</dd>
                            </div>
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {instructionsEditor ? (
        <PprOperatingInstructionsEditor
          initial={instructionsEditor.initial}
          labels={instructionsEditor.labels}
          landingFee={instructionsEditor.landingFee}
        />
      ) : null}
    </div>
  );
}

type PprOperatingInstructionsEditorProps = {
  initial: PprOperatingInstructionsDto;
  labels: PprOperatingInstructionsLabels;
  landingFee: { initialCents: number; labels: PprLandingFeeLabels };
};

/**
 * Admin-only operating-instructions editor (AC 1) — a section of THIS page,
 * not a general `/settings` page (Contesto: "SCOPO CONTROLLATO"). Kept as an
 * internal (non-exported) sub-component of `ppr-queue.tsx` rather than its
 * own file, matching the story's Project Structure Notes (only `page.tsx` +
 * `ppr-queue.tsx` are new files) — same "one file, several sub-components"
 * shape as `finance/cash-register.tsx`'s `ReverseForm`.
 */
function PprOperatingInstructionsEditor({ initial, labels, landingFee }: PprOperatingInstructionsEditorProps) {
  const [it, setIt] = useState(initial.it);
  const [en, setEn] = useState(initial.en);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);
    const response = await fetch('/api/v1/settings/ppr-operating-instructions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ it, en }),
    });
    setSaving(false);

    if (!response.ok) {
      setFeedback(labels.error);
      return;
    }

    setFeedback(labels.saved);
  }

  return (
    <section className="mt-10 rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="ppr-instructions-editor">
      <h2 className="font-[family-name:var(--font-serif)] text-xl font-medium tracking-[-0.02em] text-[#111111]">{labels.heading}</h2>
      <p className="mt-1 text-sm text-[#787774]">{labels.description}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ppr-instructions-it" className="block text-sm font-medium text-[#2F3437]">
            {labels.it}
          </label>
          <textarea
            id="ppr-instructions-it"
            data-testid="ppr-instructions-it"
            rows={5}
            maxLength={2000}
            value={it}
            onChange={(event) => setIt(event.target.value)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          />
        </div>
        <div>
          <label htmlFor="ppr-instructions-en" className="block text-sm font-medium text-[#2F3437]">
            {labels.en}
          </label>
          <textarea
            id="ppr-instructions-en"
            data-testid="ppr-instructions-en"
            rows={5}
            maxLength={2000}
            value={en}
            onChange={(event) => setEn(event.target.value)}
            className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          />
        </div>
      </div>

      {feedback ? (
        <p role="status" data-testid="ppr-instructions-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          data-testid="ppr-instructions-save"
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.save}
        </button>
      </div>

      <div className="mt-8 border-t border-[#EAEAEA] pt-6">
        <LandingFeeEditor initialCents={landingFee.initialCents} labels={landingFee.labels} />
      </div>
    </section>
  );
}

/** Euro string (comma decimal), the exact inverse of `parseCents` — same helper as `dashboard/ppr/register/ppr-register.tsx`'s `centsToEuroInput` (this file has no shared money-input module to import it from; the project keeps each dashboard route's client components self-contained, same as e.g. `sanitizeDateParam` being redefined per page). */
function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

type LandingFeeEditorProps = {
  initialCents: number;
  labels: PprLandingFeeLabels;
};

/**
 * Default landing fee editor (story 8.3, AC 1) — a second, INDEPENDENT
 * save action within the same settings section as the operating
 * instructions above (a different `AppSetting` key,
 * `PUT /api/v1/settings/ppr-landing-fee`, own gate `settings.manage`,
 * same as the instructions PUT). Euro-string input + `parseCents` at
 * submit (AD-2 boundary), same pattern as `cash-register.tsx`'s
 * `NewMovementForm`; 0 is a valid, distinct amount (Contesto: "0 ammesso").
 */
function LandingFeeEditor({ initialCents, labels }: LandingFeeEditorProps) {
  const [amount, setAmount] = useState(centsToEuroInput(initialCents));
  const [fieldError, setFieldError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save(): Promise<void> {
    setFeedback(null);
    let landingFeeCents: number;
    try {
      landingFeeCents = parseCents(amount);
    } catch {
      setFieldError(true);
      return;
    }
    if (!Number.isInteger(landingFeeCents) || landingFeeCents < 0 || landingFeeCents > 2_147_483_647) {
      setFieldError(true);
      return;
    }
    setFieldError(false);

    setSaving(true);
    const response = await fetch('/api/v1/settings/ppr-landing-fee', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landingFeeCents }),
    });
    setSaving(false);

    if (!response.ok) {
      setFeedback(labels.error);
      return;
    }

    setFeedback(labels.saved);
  }

  return (
    <div data-testid="ppr-landing-fee-editor">
      <h3 className="font-[family-name:var(--font-serif)] text-lg font-medium tracking-[-0.02em] text-[#111111]">{labels.heading}</h3>
      <p className="mt-1 text-sm text-[#787774]">{labels.description}</p>

      <div className="mt-4">
        <label htmlFor="ppr-landing-fee-amount" className="block text-sm font-medium text-[#2F3437]">
          {labels.amountLabel}
        </label>
        <input
          id="ppr-landing-fee-amount"
          data-testid="ppr-landing-fee-amount"
          inputMode="decimal"
          placeholder="0,00"
          aria-invalid={fieldError}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-2 w-full max-w-[200px] rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
        />
        {fieldError ? (
          <p role="alert" className="mt-1 text-xs text-[#9F2F2D]">
            {labels.invalidAmount}
          </p>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" data-testid="ppr-landing-fee-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          data-testid="ppr-landing-fee-save"
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.save}
        </button>
      </div>
    </div>
  );
}
