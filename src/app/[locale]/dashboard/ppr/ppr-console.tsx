'use client';

/**
 * PPR console table (epic 8 stories 8.1/8.2; epic 12 story 12.4, AC 2) —
 * port of `docs/design-reference/airops/src/Ops.jsx#PPRView`'s "Richieste
 * in arrivo" card onto real data: approve is a DIRECT action (no two-step
 * confirm — matches BOTH the prototype's own `onClick` AND `bookings-table.tsx`'s
 * "Approva" precedent, story 12.3), reject opens a `.mini-modal` with a
 * mandatory reason (same shape as `bookings-table.tsx`'s deny modal). NO
 * "Riapri" button (D13: `PPR_ALREADY_DECIDED`, the domain has no reopen
 * path) — a non-PENDING row simply renders no actions at all.
 * `router.refresh()` on every successful mutation (AD-1).
 */
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/time';
import { parseCents } from '@/lib/money';
import type { PprOperatingInstructionsDto, PprRequestItemDto, PprStatusDto } from '@/lib/schemas/ppr';
import type { QueueStatus } from './page';

export type PprConsoleLabels = {
  filters: {
    status: string;
    statusAll: string;
    statusOptions: { pending: string; approved: string; rejected: string; completed: string; cancelled: string };
  };
  card: { title: string; subTemplate: string };
  table: { aircraft: string; requester: string; schedule: string; persons: string; status: string; actions: string };
  badge: { fromPublicForm: string };
  actions: { approve: string; reject: string };
  rejectModal: { title: string; subtitle: string; reasonPlaceholder: string; reasonRequired: string; submit: string; cancel: string };
  /** `{pprNumber}` unresolved placeholder — client `.replace()`, same pattern as the pre-12.4 page. */
  toast: { approved: string; rejected: string; conflictError: string; genericError: string };
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

export type PprLandingFeeLabels = {
  heading: string;
  description: string;
  amountLabel: string;
  invalidAmount: string;
  save: string;
  saved: string;
  error: string;
};

type PprConsoleProps = {
  requests: PprRequestItemDto[];
  locale: 'it' | 'en';
  status: QueueStatus;
  labels: PprConsoleLabels;
  instructionsEditor: {
    initial: PprOperatingInstructionsDto;
    labels: PprOperatingInstructionsLabels;
    landingFee: { initialCents: number; labels: PprLandingFeeLabels };
  } | null;
};

type ApiErrorBody = { error?: { code?: string } };

async function errorCodeOf(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiErrorBody | null)?.error?.code ?? null;
}

const STATUS_BADGE_TONE: Record<PprStatusDto, BadgeTone> = {
  PENDING: 'warn',
  APPROVED: 'ok',
  REJECTED: 'bad',
  COMPLETED: 'info',
  CANCELLED: '',
};

function statusOptionLabel(status: PprStatusDto, labels: PprConsoleLabels['filters']['statusOptions']): string {
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

/** `email`/`phone` joined into one contact line — `email` is `null` for a phone-only manual entry (story 12.4, AC 1); an empty `phone` (email-only manual entry) is filtered out rather than shown as a blank segment. */
function contactLine(request: PprRequestItemDto): string {
  return [request.email, request.phone].filter((value): value is string => Boolean(value && value.length > 0)).join(' · ');
}

export function PprConsole({ requests, locale, status, labels, instructionsEditor }: PprConsoleProps) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectForId, setRejectForId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  function navigateStatus(next: string): void {
    router.push(next === 'PENDING' ? '/dashboard/ppr' : `/dashboard/ppr?status=${next}`);
  }

  async function handleApprove(id: string): Promise<void> {
    setBusyId(id);
    const response = await fetch(`/api/v1/ppr-requests/${id}/approve`, { method: 'POST' });
    setBusyId(null);

    if (!response.ok) {
      const code = await errorCodeOf(response);
      toast.show(code === 'PPR_ALREADY_DECIDED' ? labels.toast.conflictError : labels.toast.genericError, 'bad');
      return;
    }

    const decided = (await response.json()) as PprRequestItemDto;
    toast.show(labels.toast.approved.replace('{pprNumber}', decided.pprNumber ?? ''), 'ok');
    router.refresh();
  }

  function startReject(id: string): void {
    setRejectForId(id);
    setRejectReason('');
    setRejectError(null);
  }

  function closeReject(): void {
    setRejectForId(null);
    setRejectReason('');
    setRejectError(null);
  }

  async function submitReject(): Promise<void> {
    const reason = rejectReason.trim();
    if (reason.length === 0) {
      setRejectError(labels.rejectModal.reasonRequired);
      return;
    }
    if (!rejectForId) return;

    setBusyId(rejectForId);
    const response = await fetch(`/api/v1/ppr-requests/${rejectForId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setBusyId(null);

    if (!response.ok) {
      const code = await errorCodeOf(response);
      closeReject();
      toast.show(code === 'PPR_ALREADY_DECIDED' ? labels.toast.conflictError : labels.toast.genericError, 'bad');
      return;
    }

    closeReject();
    toast.show(labels.toast.rejected, 'bad');
    router.refresh();
  }

  const cols = '110px 1.4fr 1.2fr 60px 1fr 180px';

  return (
    <>
      <div className="card" data-testid="ppr-queue">
        <div className="card-head">
          <div className="card-title">{labels.card.title}</div>
          <span className="card-sub">{labels.card.subTemplate.replace('{total}', String(requests.length))}</span>
          <div className="spacer" />
          <div className="fld" style={{ minWidth: 0 }}>
            <select
              className="input"
              value={status}
              onChange={(event) => navigateStatus(event.target.value)}
              aria-label={labels.filters.status}
              data-testid="ppr-queue-filter-status"
            >
              <option value="PENDING">{labels.filters.statusOptions.pending}</option>
              <option value="APPROVED">{labels.filters.statusOptions.approved}</option>
              <option value="REJECTED">{labels.filters.statusOptions.rejected}</option>
              <option value="COMPLETED">{labels.filters.statusOptions.completed}</option>
              <option value="CANCELLED">{labels.filters.statusOptions.cancelled}</option>
              <option value="ALL">{labels.filters.statusAll}</option>
            </select>
          </div>
        </div>

        {requests.length === 0 ? (
          <p className="card-body" data-testid="ppr-queue-empty">
            {labels.empty}
          </p>
        ) : (
          <div className="students">
            <div className="student-row header" style={{ gridTemplateColumns: cols }}>
              <div>{labels.table.aircraft}</div>
              <div>{labels.table.requester}</div>
              <div>{labels.table.schedule}</div>
              <div>{labels.table.persons}</div>
              <div>{labels.table.status}</div>
              <div>{labels.table.actions}</div>
            </div>

            {requests.map((request) => {
              const isBusy = busyId === request.id;
              return (
                <div key={request.id} className="student-row" style={{ gridTemplateColumns: cols }} data-testid="ppr-row">
                  <div>
                    <div className="mono" style={{ fontWeight: 600 }}>
                      {request.aircraftRegistration}
                    </div>
                    <div className="student-sub mono">{request.aircraftType}</div>
                  </div>
                  <div>
                    <div className="student-name">
                      {request.firstName} {request.lastName}
                    </div>
                    <div className="student-sub mono">{contactLine(request)}</div>
                    {request.fromPublicForm ? (
                      <span className="badge info" style={{ marginTop: 3, fontSize: 9.5 }} data-testid="ppr-from-public-badge">
                        {labels.badge.fromPublicForm}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: 11.5 }}>{formatDateTime(new Date(request.eta), locale)}</div>
                    <div className="student-sub mono">&rarr; {request.etd ? formatDateTime(new Date(request.etd), locale) : '—'}</div>
                  </div>
                  <div className="mono num">{request.personsOnBoard}</div>
                  <div>
                    <Badge tone={STATUS_BADGE_TONE[request.status]} dot>
                      {statusOptionLabel(request.status, labels.filters.statusOptions)}
                    </Badge>
                    {request.status === 'REJECTED' && request.rejectionReason ? (
                      <div className="student-sub" style={{ marginTop: 2 }}>
                        {request.rejectionReason}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {request.status === 'PENDING' ? (
                      <>
                        <button
                          type="button"
                          className="btn mini ok"
                          disabled={isBusy}
                          onClick={() => void handleApprove(request.id)}
                          data-testid="ppr-approve-button"
                        >
                          {labels.actions.approve}
                        </button>
                        <button type="button" className="btn mini bad" disabled={isBusy} onClick={() => startReject(request.id)} data-testid="ppr-reject-button">
                          {labels.actions.reject}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {rejectForId ? (
        <div className="mini-modal">
          <div className="mini-modal-card">
            <div className="so-title" style={{ fontSize: 16 }}>
              {labels.rejectModal.title}
            </div>
            <div className="so-sub">{labels.rejectModal.subtitle}</div>
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={labels.rejectModal.reasonPlaceholder}
              data-testid="ppr-reject-reason"
            />
            {rejectError ? (
              <p role="alert" data-testid="ppr-reject-error" className="text-xs" style={{ color: 'var(--bad)' }}>
                {rejectError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={closeReject} data-testid="ppr-reject-cancel">
                {labels.rejectModal.cancel}
              </button>
              <button type="button" className="btn primary" disabled={busyId === rejectForId} onClick={() => void submitReject()} data-testid="ppr-reject-submit">
                {labels.rejectModal.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {instructionsEditor ? (
        <PprOperatingInstructionsEditor
          initial={instructionsEditor.initial}
          labels={instructionsEditor.labels}
          landingFee={instructionsEditor.landingFee}
        />
      ) : null}
    </>
  );
}

type PprOperatingInstructionsEditorProps = {
  initial: PprOperatingInstructionsDto;
  labels: PprOperatingInstructionsLabels;
  landingFee: { initialCents: number; labels: PprLandingFeeLabels };
};

/**
 * Admin-only operating-instructions editor (story 8.2, AC 1) — a section of
 * THIS page, not a general `/settings` page. Reachable via the "Regole
 * pubblicate" header anchor link (`id="ppr-instructions"` below); the
 * section itself is unconditionally rendered when `settings.manage` allows
 * it (same "visibile con settings.manage come oggi" contract as before this
 * story — only the DISCOVERY path changed, from always-inline to
 * anchor-scrolled).
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
    <section className="card" id="ppr-instructions" data-testid="ppr-instructions-editor">
      <div className="card-head">
        <div className="card-title">{labels.heading}</div>
      </div>
      <div className="card-body">
        <p className="fld-label">{labels.description}</p>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="fld wide">
            <span className="fld-label">{labels.it}</span>
            <textarea
              className="input"
              rows={5}
              maxLength={2000}
              value={it}
              onChange={(event) => setIt(event.target.value)}
              data-testid="ppr-instructions-it"
            />
          </label>
          <label className="fld wide">
            <span className="fld-label">{labels.en}</span>
            <textarea
              className="input"
              rows={5}
              maxLength={2000}
              value={en}
              onChange={(event) => setEn(event.target.value)}
              data-testid="ppr-instructions-en"
            />
          </label>
        </div>

        {feedback ? (
          <p role="status" data-testid="ppr-instructions-feedback" className="fld-label" style={{ color: 'var(--ok)', marginTop: 10 }}>
            {feedback}
          </p>
        ) : null}

        <div style={{ marginTop: 10 }}>
          <button type="button" disabled={saving} onClick={() => void save()} className="btn primary" data-testid="ppr-instructions-save">
            {labels.save}
          </button>
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <LandingFeeEditor initialCents={landingFee.initialCents} labels={landingFee.labels} />
        </div>
      </div>
    </section>
  );
}

/** Euro string (comma decimal), the exact inverse of `parseCents`. */
function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

type LandingFeeEditorProps = { initialCents: number; labels: PprLandingFeeLabels };

/** Default landing fee editor (story 8.3, AC 1) — second, independent save action within the same settings section. */
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
      <div className="fld-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
        {labels.heading}
      </div>
      <p className="fld-label" style={{ marginTop: 4 }}>
        {labels.description}
      </p>

      <label className="fld" style={{ marginTop: 10, maxWidth: 200 }}>
        <span className="fld-label">{labels.amountLabel}</span>
        <input
          className="input"
          inputMode="decimal"
          placeholder="0,00"
          aria-invalid={fieldError}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          data-testid="ppr-landing-fee-amount"
        />
      </label>
      {fieldError ? (
        <p role="alert" className="fld-label" style={{ color: 'var(--bad)', marginTop: 4 }}>
          {labels.invalidAmount}
        </p>
      ) : null}

      {feedback ? (
        <p role="status" data-testid="ppr-landing-fee-feedback" className="fld-label" style={{ color: 'var(--ok)', marginTop: 10 }}>
          {feedback}
        </p>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <button type="button" disabled={saving} onClick={() => void save()} className="btn primary" data-testid="ppr-landing-fee-save">
          {labels.save}
        </button>
      </div>
    </div>
  );
}
