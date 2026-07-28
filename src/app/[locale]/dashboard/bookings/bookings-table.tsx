'use client';

/**
 * "Prenotazioni" card (story 12.3, AC 3) — port of
 * `docs/design-reference/airops/src/Ops.jsx#BookingsTable` onto real data
 * and the 12.2 approval workflow. Owns EVERY row action's local state (which
 * row is being denied/edited/cancel-confirmed) — one client component for
 * the whole card, same "why one component, not a server shell + scattered
 * islands" reasoning `bookings-list.tsx` (the file this replaces) already
 * documented. `router.refresh()` on every successful mutation — no local
 * list reconciliation (AD-1): the server re-fetches with the SAME filters,
 * same pattern as the legacy list.
 */
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ExportMenu } from '@/components/ui/export-menu';
import { useToast } from '@/components/ui/toast';
import { formatDateOnly, formatTimeOfDay } from '@/lib/time';
import { EditBookingForm, type EditBookingFormLabels } from './edit-booking-form';
import { NewBookingForm, type AircraftOption, type InstructorOption, type NewBookingFormLabels, type NewBookingFormMode, type PersonOption } from './new-booking-form';
import type { BookingCalendarView } from './schedule';

export type BookingStatusDto = 'PENDING' | 'APPROVED' | 'DENIED' | 'FLOWN' | 'NO_SHOW' | 'CANCELLED';

export type BookingRowDto = {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  personId: string;
  personName: string;
  instructorProfileId: string | null;
  instructorName: string | null;
  /** ISO 8601 instant (server `Date` already serialized). */
  startsAt: string;
  endsAt: string;
  /** Europe/Rome `YYYY-MM-DD`, precomputed server-side (`dateOnlyInZone`) — `zoned-time.ts` is server-only, this client component never re-derives it (Dev Notes, story 7.1's own lesson). */
  startsAtDateOnly: string;
  endsAtDateOnly: string;
  notes: string | null;
  status: BookingStatusDto;
  denyReason: string | null;
};

export type BookingsTableLabels = {
  cardTitle: string;
  pendingSummary: string;
  newButton: string;
  exportLabel: string;
  exportXls: string;
  /** Story 13.7, AC 2 — the PDF counterpart of `exportXls` (was `pdfLabel=""`, xlsx-only). */
  exportPdf: string;
  empty: string;
  table: { pilot: string; startsAt: string; endsAt: string; aircraft: string; status: string; actions: string };
  status: Record<BookingStatusDto, string>;
  actions: {
    approve: string;
    reject: string;
    move: string;
    markFlown: string;
    markNoShow: string;
    cancel: string;
    reopen: string;
    cancelPrompt: string;
    cancelConfirm: string;
    dismiss: string;
    moveTitle: string;
    save: string;
    approveSuccess: string;
    rejectSuccess: string;
    reopenSuccess: string;
    flownSuccess: string;
    noShowSuccess: string;
    moveSuccess: string;
    cancelSuccess: string;
    errors: {
      BOOKING_ALREADY_STARTED: string;
      BOOKING_TRANSITION_INVALID: string;
      BOOKING_DENY_REASON_REQUIRED: string;
      /** `{documents}` placeholder, client-filled. */
      EXPIRED_DOCUMENTS: string;
      /** `{reason}` placeholder, client-filled. */
      AIRCRAFT_OUT_OF_SERVICE: string;
      conflict: string;
      generic: string;
    };
  };
  denyModal: {
    title: string;
    subtitle: string;
    reasonPlaceholder: string;
    reasonRequired: string;
    submit: string;
    cancel: string;
  };
};

type BookingsTableProps = {
  items: BookingRowDto[];
  pendingCount: number;
  total: number;
  aircraftOptions: AircraftOption[];
  canManageAny: boolean;
  canManageOwn: boolean;
  ownPersonId: string | null;
  ownInstructorProfileId: string | null;
  locale: 'it' | 'en';
  page: number;
  totalPages: number;
  /** The timeline's current `?view`/`?date` (lesson 6.4 M1, review 12.3 F2): every pagination link below must preserve them, never reset — mirrors `page.tsx#calendarHref`'s own non-default check. */
  view: BookingCalendarView;
  date: string;
  today: string;
  exportHref: string;
  /** Story 13.7, AC 2 — the PDF counterpart of `exportHref` (`GET /api/v1/bookings/pdf`, dedicated route, same filters). */
  exportPdfHref: string;
  canCreate: boolean;
  formMode: NewBookingFormMode;
  personOptions: PersonOption[];
  instructorOptions: InstructorOption[];
  studentOptions: PersonOption[];
  newBookingLabels: NewBookingFormLabels;
  editBookingLabels: EditBookingFormLabels;
  labels: BookingsTableLabels;
};

type ApiErrorBody = { error?: { code?: string; details?: { reason?: string; documents?: Array<{ typeName: string }> } } };

async function errorBodyOf(response: Response): Promise<ApiErrorBody | null> {
  return (await response.json().catch(() => null)) as ApiErrorBody | null;
}

const STATUS_TONE: Record<BookingStatusDto, BadgeTone> = {
  PENDING: 'warn',
  APPROVED: 'ok',
  DENIED: 'bad',
  FLOWN: 'info',
  NO_SHOW: '',
  CANCELLED: '',
};

export function BookingsTable({
  items,
  pendingCount,
  total,
  aircraftOptions,
  canManageAny,
  canManageOwn,
  ownPersonId,
  ownInstructorProfileId,
  locale,
  page,
  totalPages,
  view,
  date,
  today,
  exportHref,
  exportPdfHref,
  canCreate,
  formMode,
  personOptions,
  instructorOptions,
  studentOptions,
  newBookingLabels,
  editBookingLabels,
  labels,
}: BookingsTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editingBooking, setEditingBooking] = useState<BookingRowDto | null>(null);
  const [denyForId, setDenyForId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [denyError, setDenyError] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  function isOwnRow(booking: BookingRowDto): boolean {
    if (!canManageOwn) return false;
    if (booking.personId === ownPersonId) return true;
    return booking.instructorProfileId !== null && booking.instructorProfileId === ownInstructorProfileId;
  }

  function errorMessage(code: string | undefined, body: ApiErrorBody | null): string {
    switch (code) {
      case 'BOOKING_ALREADY_STARTED':
        return labels.actions.errors.BOOKING_ALREADY_STARTED;
      case 'BOOKING_TRANSITION_INVALID':
        return labels.actions.errors.BOOKING_TRANSITION_INVALID;
      case 'BOOKING_DENY_REASON_REQUIRED':
        return labels.actions.errors.BOOKING_DENY_REASON_REQUIRED;
      case 'EXPIRED_DOCUMENTS': {
        const documentNames = (body?.error?.details?.documents ?? []).map((document) => document.typeName);
        return labels.actions.errors.EXPIRED_DOCUMENTS.replace('{documents}', documentNames.join(', '));
      }
      case 'AIRCRAFT_OUT_OF_SERVICE':
        return labels.actions.errors.AIRCRAFT_OUT_OF_SERVICE.replace('{reason}', body?.error?.details?.reason ?? '');
      default:
        return labels.actions.errors.generic;
    }
  }

  async function transition(id: string, to: Exclude<BookingStatusDto, 'CANCELLED'>, reason?: string): Promise<boolean> {
    setPendingActionId(id);
    const response = await fetch(`/api/v1/bookings/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { to, reason } : { to }),
    });
    setPendingActionId(null);

    if (!response.ok) {
      if (response.status === 409) {
        toast.show(labels.actions.errors.conflict, 'bad');
        return false;
      }
      const body = await errorBodyOf(response);
      toast.show(errorMessage(body?.error?.code, body), 'bad');
      return false;
    }
    return true;
  }

  async function handleApprove(id: string): Promise<void> {
    if (await transition(id, 'APPROVED')) {
      toast.show(labels.actions.approveSuccess, 'ok');
      router.refresh();
    }
  }

  async function handleReopen(id: string): Promise<void> {
    if (await transition(id, 'PENDING')) {
      toast.show(labels.actions.reopenSuccess, 'ok');
      router.refresh();
    }
  }

  async function handleFlown(id: string): Promise<void> {
    if (await transition(id, 'FLOWN')) {
      toast.show(labels.actions.flownSuccess, 'ok');
      router.refresh();
    }
  }

  async function handleNoShow(id: string): Promise<void> {
    if (await transition(id, 'NO_SHOW')) {
      toast.show(labels.actions.noShowSuccess, 'ok');
      router.refresh();
    }
  }

  async function submitDeny(): Promise<void> {
    const trimmed = denyReason.trim();
    if (trimmed.length === 0) {
      setDenyError(labels.denyModal.reasonRequired);
      return;
    }
    if (!denyForId) return;

    setDenyError(null);
    const ok = await transition(denyForId, 'DENIED', trimmed);
    if (ok) {
      toast.show(labels.actions.rejectSuccess, 'bad');
      setDenyForId(null);
      setDenyReason('');
      router.refresh();
    } else {
      setDenyError(labels.actions.errors.generic);
    }
  }

  async function confirmCancel(id: string): Promise<void> {
    setPendingActionId(id);
    const response = await fetch(`/api/v1/bookings/${id}/cancel`, { method: 'POST' });
    setPendingActionId(null);

    if (!response.ok) {
      if (response.status === 409) {
        toast.show(labels.actions.errors.conflict, 'bad');
        return;
      }
      const body = await errorBodyOf(response);
      toast.show(errorMessage(body?.error?.code, body), 'bad');
      return;
    }

    setConfirmingCancelId(null);
    toast.show(labels.actions.cancelSuccess, 'ok');
    router.refresh();
  }

  /** Mirrors `page.tsx#calendarHref`'s non-default check (review 12.3 F2): a pagination link carries `?view`/`?date` too, whenever they aren't the page's own default, so paging never drops the timeline's current view. */
  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/bookings' as const,
      query: {
        ...(view !== 'day' ? { view } : {}),
        ...(date !== today ? { date } : {}),
        page: targetPage,
      },
    };
  }

  const cols = 'minmax(160px,1.6fr) 140px 140px 100px 130px minmax(180px,1fr)';

  return (
    <div className="card" data-testid="bookings-list-section">
      <div className="card-head">
        <div className="card-title">{labels.cardTitle}</div>
        <span className="card-sub" data-testid="bookings-pending-summary">
          {labels.pendingSummary.replace('{pending}', String(pendingCount)).replace('{total}', String(total))}
        </span>
        <div className="spacer" />
        <ExportMenu label={labels.exportLabel} xlsLabel={labels.exportXls} xlsHref={exportHref} pdfLabel={labels.exportPdf} pdfHref={exportPdfHref} />
        {canCreate ? (
          <button type="button" className="btn primary" onClick={() => setShowNew(true)} data-testid="new-booking-button">
            {labels.newButton}
          </button>
        ) : null}
      </div>

      <div className="students">
        <div className="student-row header" style={{ gridTemplateColumns: cols }}>
          <div>{labels.table.pilot}</div>
          <div>{labels.table.startsAt}</div>
          <div>{labels.table.endsAt}</div>
          <div>{labels.table.aircraft}</div>
          <div>{labels.table.status}</div>
          <div>{labels.table.actions}</div>
        </div>

        {items.length === 0 ? (
          <p style={{ marginTop: 16, fontSize: 14, lineHeight: '20px', padding: '12px 18px' }}>
            {labels.empty}
          </p>
        ) : null}

        {items.map((booking) => {
          const canManageRow = canManageAny || isOwnRow(booking);
          const busy = pendingActionId === booking.id;
          const subLine = booking.instructorName ?? booking.notes;

          return (
            <div key={booking.id} className="student-row" style={{ gridTemplateColumns: cols }} data-testid="booking-row">
              <div>
                <div className="student-name">{booking.personName}</div>
                {subLine ? (
                  <div className="student-sub mono" style={{ fontSize: 11 }}>
                    {subLine}
                  </div>
                ) : null}
              </div>
              {/* `data-starts-at` carries the raw ISO instant so an ordering assert compares instants, never the localized `DD/MM · HH:MM` text (which sorts 01/08 before 27/07) — see `e2e/home-dashboard.spec.ts`. */}
              <div className="mono" style={{ fontSize: 11.5 }} data-testid="booking-row-starts-at" data-starts-at={booking.startsAt}>
                {formatDateOnly(booking.startsAtDateOnly, locale)} · {formatTimeOfDay(new Date(booking.startsAt), locale)}
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                {formatDateOnly(booking.endsAtDateOnly, locale)} · {formatTimeOfDay(new Date(booking.endsAt), locale)}
              </div>
              <div className="mono" style={{ fontWeight: 600 }}>
                {booking.aircraftRegistration}
              </div>
              <div>
                <Badge tone={STATUS_TONE[booking.status]} dot>
                  {labels.status[booking.status]}
                </Badge>
                {booking.status === 'DENIED' && booking.denyReason ? (
                  <div className="student-sub" style={{ marginTop: 2 }}>
                    {booking.denyReason}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {confirmingCancelId === booking.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <span className="student-sub">{labels.actions.cancelPrompt}</span>
                      <button
                        type="button"
                        className="btn mini bad"
                        disabled={busy}
                        onClick={() => void confirmCancel(booking.id)}
                        data-testid="booking-cancel-confirm"
                      >
                        {labels.actions.cancelConfirm}
                      </button>
                      <button type="button" className="btn mini" disabled={busy} onClick={() => setConfirmingCancelId(null)}>
                        {labels.actions.dismiss}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {booking.status === 'PENDING' && canManageAny ? (
                      <>
                        <button type="button" className="btn mini ok" disabled={busy} onClick={() => void handleApprove(booking.id)} data-testid="booking-approve-action">
                          {labels.actions.approve}
                        </button>
                        <button
                          type="button"
                          className="btn mini bad"
                          disabled={busy}
                          onClick={() => {
                            setDenyForId(booking.id);
                            setDenyReason('');
                            setDenyError(null);
                          }}
                          data-testid="booking-reject-action"
                        >
                          {labels.actions.reject}
                        </button>
                      </>
                    ) : null}
                    {(booking.status === 'PENDING' || booking.status === 'APPROVED') && canManageRow ? (
                      <button type="button" className="btn mini" disabled={busy} onClick={() => setEditingBooking(booking)} data-testid="booking-move-action">
                        {labels.actions.move}
                      </button>
                    ) : null}
                    {booking.status === 'APPROVED' && canManageAny ? (
                      <>
                        <button type="button" className="btn mini" disabled={busy} onClick={() => void handleFlown(booking.id)} data-testid="booking-flown-action">
                          {labels.actions.markFlown}
                        </button>
                        <button type="button" className="btn mini" disabled={busy} onClick={() => void handleNoShow(booking.id)} data-testid="booking-noshow-action">
                          {labels.actions.markNoShow}
                        </button>
                      </>
                    ) : null}
                    {/* Review 12.3 F3: Annulla is available on a PENDING row too (not
                        only APPROVED) — a pilot/instructor must be able to withdraw
                        their own still-undecided request, same two-step confirm,
                        same `canManageRow` gate the Modifica button above already uses. */}
                    {(booking.status === 'PENDING' || booking.status === 'APPROVED') && canManageRow ? (
                      <button type="button" className="btn mini" disabled={busy} onClick={() => setConfirmingCancelId(booking.id)} data-testid="booking-cancel-action">
                        {labels.actions.cancel}
                      </button>
                    ) : null}
                    {(booking.status === 'DENIED' || booking.status === 'FLOWN' || booking.status === 'NO_SHOW') && canManageAny ? (
                      <button type="button" className="btn mini" disabled={busy} onClick={() => void handleReopen(booking.id)} data-testid="booking-reopen-action">
                        {labels.actions.reopen}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 ? (
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Link
            href={pageHref(page - 1)}
            locale={locale as AppLocale}
            aria-disabled={page <= 1}
            data-testid="booking-page-prev"
            className="btn"
          >
            &larr;
          </Link>
          <span className="mono" data-testid="booking-pagination-status">
            {page} / {totalPages}
          </span>
          <Link
            href={pageHref(page + 1)}
            locale={locale as AppLocale}
            aria-disabled={page >= totalPages}
            data-testid="booking-page-next"
            className="btn"
          >
            &rarr;
          </Link>
        </div>
      ) : null}

      {denyForId ? (
        <div className="mini-modal">
          <div className="mini-modal-card">
            <div className="so-title" style={{ fontSize: 16 }}>
              {labels.denyModal.title}
            </div>
            <div className="so-sub">{labels.denyModal.subtitle}</div>
            <textarea
              className="input"
              rows={3}
              value={denyReason}
              onChange={(event) => setDenyReason(event.target.value)}
              placeholder={labels.denyModal.reasonPlaceholder}
              aria-invalid={Boolean(denyError)}
              data-testid="booking-deny-reason"
            />
            {denyError ? (
              <p role="alert" data-testid="booking-deny-error" className="fld-error">
                {denyError}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDenyForId(null);
                  setDenyReason('');
                  setDenyError(null);
                }}
              >
                {labels.denyModal.cancel}
              </button>
              <button type="button" className="btn primary" disabled={pendingActionId === denyForId} onClick={() => void submitDeny()} data-testid="booking-deny-submit">
                {labels.denyModal.submit}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mounted only for an actor who could ever open one (`canCreate` — the
          same `bookings.manage.any || bookings.manage.own` gate as the
          "Nuova prenotazione" button/every row's Modifica) — a pure
          `self.read` viewer (e.g. an allievo with no booking permission at
          all) gets neither in the DOM, not merely visually hidden behind
          `SlideOver`'s CSS, matching the legacy page's own `{canCreate ? ... : null}`. */}
      {canCreate ? (
        <>
          <NewBookingForm
            open={showNew}
            onClose={() => setShowNew(false)}
            mode={formMode}
            aircraftOptions={aircraftOptions}
            personOptions={personOptions}
            instructorOptions={instructorOptions}
            studentOptions={studentOptions}
            ownPersonId={ownPersonId}
            ownInstructorProfileId={ownInstructorProfileId}
            labels={newBookingLabels}
          />

          <EditBookingForm
            open={editingBooking !== null}
            booking={editingBooking}
            aircraftOptions={aircraftOptions}
            onClose={() => setEditingBooking(null)}
            onSuccess={() => {
              setEditingBooking(null);
              toast.show(labels.actions.moveSuccess, 'ok');
              router.refresh();
            }}
            labels={editBookingLabels}
          />
        </>
      ) : null}
    </div>
  );
}
