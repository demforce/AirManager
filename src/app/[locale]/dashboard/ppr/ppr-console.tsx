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
 *
 * Story 15.2 — first consumer of the epic's mobile primitives. The page
 * renders BOTH trees and lets a media query pick one (`display: none` on the
 * other, epic architecture: no `matchMedia`, no parallel route):
 * - `>640px`: the table above, byte-for-byte as it was;
 * - `<=640px`: one card per request, and the card IS the trigger of a
 *   `BottomSheet` holding the full detail plus Approva/Nega.
 * Ratifica R-15.2-b: the decision buttons live ONLY in the sheet, never on
 * the card — a DELIBERATE divergence from the template (which also puts them
 * inline, lines 167-170), so two destructive buttons never sit under the
 * thumb while scrolling the list. Ratifica R-15.2-a: "Nega" swaps the sheet's
 * own body for the reason step instead of stacking a second overlay.
 * Ratifica R-15.2-d: ONE list driven by the existing status filter, not the
 * template's two "Da esaminare"/"Esaminate" sections (which would need a
 * second query per page and would drift from the desktop at equal filter).
 * No network logic is duplicated: both trees call the same handlers below.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet } from '@/components/ui/bottom-sheet';
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
  /**
   * Story 15.2 — the <=640px card list and its detail sheet. `detail` reuses
   * the manual-form field labels (same nouns, already translated in both
   * locales) so the sheet adds only the three strings that genuinely did not
   * exist: the trigger's accessible verb, "Chiudi", and the rejection reason.
   */
  mobile: {
    openDetail: string;
    close: string;
    /** Story 15.9 (R-15.9-h): the sheet's deep link to the transits register, filtered on THIS request's own number. */
    viewInMovements: string;
    /** Sheet's mono over-line, template `openPPR`'s own `sub`: "Richiesta PPR-2026-0001" (or "—" while still PENDING). */
    requestLabel: string;
    detail: {
      requester: string;
      email: string;
      phone: string;
      origin: string;
      destination: string;
      eta: string;
      etd: string;
      personsOnBoard: string;
      notes: string;
      rejectionReason: string;
    };
  };
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
  /** Desktop only: which row's `.mini-modal` is open. The mobile tree never sets it (R-15.2-a: no overlay on overlay), so the two surfaces can never both be up. */
  const [rejectForId, setRejectForId] = useState<string | null>(null);
  /** Mobile only: which row's detail sheet is open, and whether it is showing its reason step. */
  const [sheetForId, setSheetForId] = useState<string | null>(null);
  const [sheetRejecting, setSheetRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const sheetRejectButtonRef = useRef<HTMLButtonElement>(null);
  const sheetReasonRef = useRef<HTMLTextAreaElement>(null);

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
      // Review 15.2 F4: a 409 means the list on screen is STALE (someone else
      // decided this request), so the row has to go — without this the same
      // card keeps re-opening a sheet that can only produce another 409.
      router.refresh();
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

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetForId(null);
    setSheetRejecting(false);
    setRejectReason('');
    setRejectError(null);
  }, []);

  /**
   * The reason step (R-15.2-a) only swaps what the sheet renders — the sheet
   * itself is never unmounted, so focus stays inside the same `role="dialog"`
   * node. Leaving the step keeps whatever was typed (nothing was decided) and
   * drops only the now-stale error.
   */
  function startSheetReject(): void {
    setSheetRejecting(true);
    setRejectError(null);
  }

  function cancelSheetReject(): void {
    setSheetRejecting(false);
    setRejectError(null);
  }

  /**
   * Review 15.2 F1 — AC 4 says "the focus stays inside the panel", and it did
   * NOT: swapping the sheet's body removes the very button that was pressed,
   * nothing else claims the focus, and `document.activeElement` fell back to
   * `body` (measured, both entering the step and leaving it) — the dialog
   * context is lost for assistive technology even though the node survives.
   * So each step explicitly takes the focus to what it is about. The effect is
   * inert when no sheet is open (both refs are null then), which is why the
   * sheet's own focus-on-open / focus-return baseline (`MobileSheet`) is
   * untouched: it only ever fires on a real step change.
   */
  useEffect(() => {
    if (sheetRejecting) sheetReasonRef.current?.focus();
    else sheetRejectButtonRef.current?.focus();
  }, [sheetRejecting]);

  async function submitReject(id: string): Promise<void> {
    const reason = rejectReason.trim();
    if (reason.length === 0) {
      setRejectError(labels.rejectModal.reasonRequired);
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
      const code = await errorCodeOf(response);
      closeReject();
      closeSheet();
      toast.show(code === 'PPR_ALREADY_DECIDED' ? labels.toast.conflictError : labels.toast.genericError, 'bad');
      // Review 15.2 F4, same reason as `handleApprove`: the stale row must go.
      router.refresh();
      return;
    }

    closeReject();
    closeSheet();
    toast.show(labels.toast.rejected, 'bad');
    router.refresh();
  }

  const cols = '110px 1.4fr 1.2fr 60px 1fr 180px';

  /** The sheet follows the LIST: once a decision removes the row, `find` returns nothing and the sheet is gone with it. */
  const sheetRequest = requests.find((request) => request.id === sheetForId) ?? null;

  function detailRows(request: PprRequestItemDto) {
    const { detail } = labels.mobile;
    // Every field the desktop row shows (status included — it is the sheet's
    // own badge, not a duplicated line) PLUS the three the desktop table has
    // no column for: origin, destination, notes. Mobile may show more than
    // desktop, never less (AC 4).
    return [
      { k: detail.requester, v: `${request.firstName} ${request.lastName}` },
      { k: detail.email, v: request.email ?? '—' },
      { k: detail.phone, v: request.phone || '—' },
      { k: detail.origin, v: request.origin },
      { k: detail.destination, v: request.destination },
      { k: detail.eta, v: formatDateTime(new Date(request.eta), locale) },
      { k: detail.etd, v: request.etd ? formatDateTime(new Date(request.etd), locale) : '—' },
      { k: detail.personsOnBoard, v: String(request.personsOnBoard) },
      { k: detail.notes, v: request.notes ?? '—' },
      ...(request.status === 'REJECTED' && request.rejectionReason ? [{ k: detail.rejectionReason, v: request.rejectionReason }] : []),
    ];
  }

  return (
    <>
      <div className="card" data-testid="ppr-queue">
        {/* `ppr-queue-head`: a class this console OWNS, so story 15.10's 44px
            floor reaches the status filter and the Esporta trigger without
            touching `.card-head`, which 13 consoles share (lesson 15.3 F1). */}
        <div className="card-head ppr-queue-head">
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
          <>
          {/* Story 15.2: the switch hangs off THESE two page-owned classes,
              never off `.students` (13 consoles share it) and never off a
              generic `.only-mobile` utility (which would have to pick one
              fixed `display` for every tree that ever uses it). */}
          <div className="students ppr-queue-desktop">
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

          <div className="ppr-queue-mobile">
            {requests.map((request) => (
              <button
                key={request.id}
                type="button"
                className="ppr-card"
                // AC 3: a speaking name, not a bare "Apri" — the row is
                // identified by requester + registration, exactly what the
                // card shows. The card carries no nested control (R-15.2-b),
                // so there is nothing for a screen reader to get stuck on.
                aria-label={`${labels.mobile.openDetail}: ${request.firstName} ${request.lastName} · ${request.aircraftRegistration}`}
                onClick={() => setSheetForId(request.id)}
                data-testid="ppr-row-mobile"
              >
                <span className="ppr-card-head">
                  <span className="ppr-card-main">
                    <span className="ppr-card-name">
                      {request.firstName} {request.lastName}
                    </span>
                    <span className="ppr-card-sub">
                      {request.aircraftRegistration} · {request.aircraftType} · {formatDateTime(new Date(request.eta), locale)}
                    </span>
                    {request.fromPublicForm ? (
                      <span className="badge info" style={{ marginTop: 4, fontSize: 9.5 }} data-testid="ppr-from-public-badge-mobile">
                        {labels.badge.fromPublicForm}
                      </span>
                    ) : null}
                  </span>
                  <span className="ppr-card-side">
                    {request.pprNumber ? <span className="ppr-card-id">{request.pprNumber}</span> : null}
                    {request.status === 'PENDING' ? null : (
                      <Badge tone={STATUS_BADGE_TONE[request.status]} dot>
                        {statusOptionLabel(request.status, labels.filters.statusOptions)}
                      </Badge>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
          </>
        )}
      </div>

      {sheetRequest ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-ppr-sheet"
          // Review 15.2 F6: the number is assigned on approval, so a PENDING
          // request has none — and the em-dash placeholder the template used
          // for it landed in the dialog's accessible name, which `BottomSheet`
          // builds as `${sub} — ${title}`: "Richiesta — — I-PK7X9 · C172".
          // A missing value is simply not part of the name (nor of the
          // over-line): "Richiesta" alone reads right in both places.
          sub={sheetRequest.pprNumber ? `${labels.mobile.requestLabel} ${sheetRequest.pprNumber}` : labels.mobile.requestLabel}
          title={`${sheetRequest.aircraftRegistration} · ${sheetRequest.aircraftType}`}
          badge={
            <Badge tone={STATUS_BADGE_TONE[sheetRequest.status]} dot>
              {statusOptionLabel(sheetRequest.status, labels.filters.statusOptions)}
            </Badge>
          }
          rows={detailRows(sheetRequest)}
          closeLabel={labels.mobile.close}
          actions={
            // Same rule as the desktop row: no actions on a decided request
            // (D13 — `PPR_ALREADY_DECIDED`, the domain has no reopen path).
            // Story 15.9 (R-15.9-h): a DECIDED request that owns a number gets
            // exactly one action instead — the deep link to its transit. The
            // number is `null` while PENDING and forever on a REJECTED one, so
            // the link is never offered towards an empty filter; both pages are
            // gated on the same `ppr.manage` permission, so an actor who can
            // see this sheet can always see the destination.
            sheetRequest.pprNumber ? (
              <Link
                href={{ pathname: '/dashboard/movements', query: { status: 'ALL', pprNumber: sheetRequest.pprNumber } }}
                locale={locale}
                className="btn"
                data-testid="ppr-view-in-movements-mobile"
              >
                {labels.mobile.viewInMovements}
              </Link>
            ) : sheetRequest.status === 'PENDING' ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busyId === sheetRequest.id}
                  onClick={() => void handleApprove(sheetRequest.id).then(closeSheet)}
                  data-testid="ppr-approve-button-mobile"
                >
                  {labels.actions.approve}
                </button>
                <button
                  type="button"
                  className="btn mini bad"
                  disabled={busyId === sheetRequest.id}
                  onClick={startSheetReject}
                  ref={sheetRejectButtonRef}
                  data-testid="ppr-reject-button-mobile"
                >
                  {labels.actions.reject}
                </button>
              </>
            ) : undefined
          }
          secondStep={
            sheetRejecting ? (
              <div className="bottom-sheet-step">
                <p className="fld-hint">{labels.rejectModal.subtitle}</p>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={500}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder={labels.rejectModal.reasonPlaceholder}
                  aria-label={labels.rejectModal.title}
                  aria-invalid={Boolean(rejectError)}
                  ref={sheetReasonRef}
                  data-testid="ppr-reject-reason-mobile"
                />
                {rejectError ? (
                  <p role="alert" className="fld-error" data-testid="ppr-reject-error-mobile">
                    {rejectError}
                  </p>
                ) : null}
                <div className="bottom-sheet-actions">
                  <button type="button" className="btn" onClick={cancelSheetReject} data-testid="ppr-reject-cancel-mobile">
                    {labels.rejectModal.cancel}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busyId === sheetRequest.id}
                    onClick={() => void submitReject(sheetRequest.id)}
                    data-testid="ppr-reject-submit-mobile"
                  >
                    {labels.rejectModal.submit}
                  </button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}

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
              aria-invalid={Boolean(rejectError)}
              data-testid="ppr-reject-reason"
            />
            {rejectError ? (
              <p role="alert" data-testid="ppr-reject-error" className="fld-error">
                {rejectError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={closeReject} data-testid="ppr-reject-cancel">
                {labels.rejectModal.cancel}
              </button>
              <button type="button" className="btn primary" disabled={busyId === rejectForId} onClick={() => void submitReject(rejectForId)} data-testid="ppr-reject-submit">
                {labels.rejectModal.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
