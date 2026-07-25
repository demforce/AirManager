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
import { ExportMenu } from '@/components/ui/export-menu';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/time';
import type { PprRequestItemDto, PprStatusDto } from '@/lib/schemas/ppr';
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
  /** Story 13.6, AC 5 — single `ExportMenu` dropdown (pattern already used by fleet/pilots/billing), same `ppr-requests` endpoint as Voli in transito, filtered by the console's own status filter. */
  exportMenu: { label: string; xlsLabel: string; pdfLabel: string };
};

type PprConsoleProps = {
  requests: PprRequestItemDto[];
  locale: 'it' | 'en';
  status: QueueStatus;
  labels: PprConsoleLabels;
  xlsHref: string;
  pdfHref: string;
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

export function PprConsole({ requests, locale, status, labels, xlsHref, pdfHref }: PprConsoleProps) {
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
          <div className="spacer" />
          <ExportMenu label={labels.exportMenu.label} xlsLabel={labels.exportMenu.xlsLabel} xlsHref={xlsHref} pdfLabel={labels.exportMenu.pdfLabel} pdfHref={pdfHref} />
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
                    {/* Story 13.6 (review F2): email and phone each get their OWN line, matching movements-table — `.student-sub`'s nowrap/ellipsis (airops.css) otherwise clips the 2nd segment (the phone). */}
                    {request.email ? <div className="student-sub mono">{request.email}</div> : null}
                    {request.phone ? <div className="student-sub mono">{request.phone}</div> : null}
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
              <p role="alert" data-testid="ppr-reject-error" style={{ fontSize: 12, lineHeight: '16px', color: 'var(--bad)' }}>
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
    </>
  );
}
