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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { ExportMenu } from '@/components/ui/export-menu';
import { useToast } from '@/components/ui/toast';
import { BOOKING_STATUS_VALUES } from '@/lib/booking-status-filter';
import { formatDateOnly, formatTimeOfDay } from '@/lib/time';
import {
  bookingErrorMessage,
  postBookingTransition,
  readBookingApiError,
  type BookingTransitionErrorLabels,
  type BookingTransitionOutcome,
  type BookingTransitionTarget,
} from './booking-transition';
import { EditBookingForm, type EditBookingFormLabels } from './edit-booking-form';
import { NewBookingForm, type AircraftOption, type InstructorOption, type NewBookingFormLabels, type NewBookingFormMode, type PersonOption } from './new-booking-form';
import type { BookingCalendarView } from './schedule';

export type BookingStatusDto = 'PENDING' | 'APPROVED' | 'DENIED' | 'FLOWN' | 'NO_SHOW' | 'CANCELLED';

export type BookingRowDto = {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  personId: string;
  /** `null` on a masked (non-own, `bookings.read.names`-less) row — story 14.5, ratifica R3: rendered as `labels.occupied`. */
  personName: string | null;
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
  /** Review 15.4 F6: the card sub while `?status` narrows the list — the "in attesa" count is NOT filtered (it is a separate PENDING query), so with `?status=DENIED` the two halves contradicted each other ("2 in attesa · 0 totali", measured at 375px AND at 1280px). Under a filter only the filtered total is shown. */
  filteredSummary: string;
  newButton: string;
  /** Story 14.5 (ratifica R3): shown instead of `booking.personName` when it's `null` (masked). */
  occupied: string;
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
    /** Story 15.3, AD-2: the same labels the shared `postBookingTransition` maps codes onto — the mobile Panoramica queue passes this very object. */
    errors: BookingTransitionErrorLabels;
  };
  denyModal: {
    title: string;
    subtitle: string;
    reasonPlaceholder: string;
    reasonRequired: string;
    submit: string;
    cancel: string;
  };
  /** Story 15.4 — the phone list and its decision sheet. Everything else (statuses, actions, deny modal copy) is reused from above: the two faces must never word the same thing differently. */
  mobile: {
    /** Verb of a card's accessible name ("Apri dettaglio"), never rendered as text. */
    openDetail: string;
    close: string;
    /** "Tutte" — the status chip that clears the filter. */
    statusAll: string;
    startsAt: string;
    endsAt: string;
    aircraft: string;
    instructor: string;
    notes: string;
    /** Sheet row shown on a DENIED booking. */
    denyReason: string;
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
  /** Whether this actor could ever open a booking form at all (`bookings.manage.*`) — decides whether the two panels are MOUNTED. */
  canCreate: boolean;
  /**
   * Whether the "Nuova prenotazione" CTA is shown (story 15.4, ratifica
   * R-15.4-f, closing TD 14.6 F2). Narrower than `canCreate`: booking for
   * ONESELF also needs an active pilot/instructor profile, and the PO's
   * instruction is that whoever lacks it must not see the button at all rather
   * than click it into a 403.
   */
  canCreateNew: boolean;
  /** The list's current `?status` (ratifica R-15.4-e), `null` when unfiltered — echoed by every href this card builds. */
  status: string | null;
  formMode: NewBookingFormMode;
  personOptions: PersonOption[];
  instructorOptions: InstructorOption[];
  studentOptions: PersonOption[];
  newBookingLabels: NewBookingFormLabels;
  editBookingLabels: EditBookingFormLabels;
  labels: BookingsTableLabels;
};

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
  canCreateNew,
  status,
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
  // --- phone sheet (story 15.4) ------------------------------------------
  // Its own state, deliberately NOT the desktop's `denyForId`/
  // `confirmingCancelId`: reusing those would render the desktop mini-modal
  // (z-index 60) on top of the sheet (z-index 40) on a phone. The two steps a
  // decision can need — the mandatory reject reason and the cancel confirm —
  // are the sheet's `secondStep` instead (R-15.2-a), same shape as the
  // Panoramica's pending queue.
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'none' | 'deny' | 'cancel'>('none');
  const [sheetDenyReason, setSheetDenyReason] = useState('');
  const [sheetDenyError, setSheetDenyError] = useState<string | null>(null);
  const sheetPrimaryRef = useRef<HTMLButtonElement>(null);
  const sheetReasonRef = useRef<HTMLTextAreaElement>(null);
  const sheetCancelConfirmRef = useRef<HTMLButtonElement>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setSheetId(null);
    setSheetStep('none');
    setSheetDenyReason('');
    setSheetDenyError(null);
  }, []);

  /**
   * Same fix as review 15.2 F1 / story 15.3: swapping the sheet's body removes
   * the very button that was pressed, and `document.activeElement` falls back
   * to `<body>` — the dialog context is lost for assistive technology even
   * though the node survives. Inert while no sheet is open (every ref is null
   * then), so `MobileSheet`'s own focus-on-open baseline is untouched.
   */
  useEffect(() => {
    if (sheetStep === 'deny') sheetReasonRef.current?.focus();
    else if (sheetStep === 'cancel') sheetCancelConfirmRef.current?.focus();
    else sheetPrimaryRef.current?.focus();
  }, [sheetStep]);

  function isOwnRow(booking: BookingRowDto): boolean {
    if (!canManageOwn) return false;
    if (booking.personId === ownPersonId) return true;
    return booking.instructorProfileId !== null && booking.instructorProfileId === ownInstructorProfileId;
  }

  /**
   * Story 15.3, AD-2: the request, the 409 branch and the code -> message
   * mapping now live in `./booking-transition` and are shared with the mobile
   * Panoramica queue. Same behaviour, same messages.
   *
   * Story 15.4 returns the OUTCOME rather than a boolean: the phone sheet has
   * to tell a stale row (422 `BOOKING_TRANSITION_INVALID`) from a plain
   * failure — on a stale one it closes itself and refreshes, or it would keep
   * re-opening over a booking that no longer exists in that state (review 15.3
   * F2). The desktop reads `.ok` and behaves exactly as before.
   */
  async function transition(id: string, to: BookingTransitionTarget, reason?: string): Promise<BookingTransitionOutcome> {
    setPendingActionId(id);
    const outcome = await postBookingTransition(id, to, labels.actions.errors, reason);
    setPendingActionId(null);

    if (!outcome.ok) {
      toast.show(outcome.message, 'bad');
      if (outcome.stale) {
        closeSheet();
        router.refresh();
      }
    }
    return outcome;
  }

  async function handleApprove(id: string): Promise<void> {
    if ((await transition(id, 'APPROVED')).ok) {
      closeSheet();
      toast.show(labels.actions.approveSuccess, 'ok');
      router.refresh();
    }
  }

  async function handleReopen(id: string): Promise<void> {
    if ((await transition(id, 'PENDING')).ok) {
      closeSheet();
      toast.show(labels.actions.reopenSuccess, 'ok');
      router.refresh();
    }
  }

  async function handleFlown(id: string): Promise<void> {
    if ((await transition(id, 'FLOWN')).ok) {
      closeSheet();
      toast.show(labels.actions.flownSuccess, 'ok');
      router.refresh();
    }
  }

  async function handleNoShow(id: string): Promise<void> {
    if ((await transition(id, 'NO_SHOW')).ok) {
      closeSheet();
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
    const { ok } = await transition(denyForId, 'DENIED', trimmed);
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
      const body = await readBookingApiError(response);
      toast.show(bookingErrorMessage(body?.error?.code, body, labels.actions.errors), 'bad');
      return;
    }

    setConfirmingCancelId(null);
    closeSheet();
    toast.show(labels.actions.cancelSuccess, 'ok');
    router.refresh();
  }

  /** The phone sheet's own reject: the reason is mandatory and an empty one NEVER reaches the network (same client guard as the desktop mini-modal). */
  async function submitSheetDeny(id: string): Promise<void> {
    const reason = sheetDenyReason.trim();
    if (reason.length === 0) {
      setSheetDenyError(labels.denyModal.reasonRequired);
      return;
    }

    setSheetDenyError(null);
    const outcome = await transition(id, 'DENIED', reason);
    if (!outcome.ok) {
      // `transition` already closed the sheet on a stale row; on anything else
      // the step stays open with the reason the user typed, and says why.
      if (!outcome.stale) setSheetDenyError(outcome.message);
      return;
    }

    closeSheet();
    toast.show(labels.actions.rejectSuccess, 'bad');
    router.refresh();
  }

  /** Mirrors `page.tsx#calendarHref`'s non-default check (review 12.3 F2): a pagination link carries `?view`/`?date` too, whenever they aren't the page's own default, so paging never drops the timeline's current view. Story 15.4: `?status` rides along for the same reason. */
  function pageHref(targetPage: number) {
    return {
      pathname: '/dashboard/bookings' as const,
      query: {
        ...(view !== 'day' ? { view } : {}),
        ...(date !== today ? { date } : {}),
        ...(status ? { status } : {}),
        page: targetPage,
      },
    };
  }

  /**
   * A status chip's href (story 15.4, ratifica R-15.4-e). It keeps the
   * timeline's `?view`/`?date` — and deliberately drops `?page`: a different
   * filter is a different result set, so page 7 of the old one means nothing
   * (the server would clamp it anyway, leaving a URL that lies).
   */
  function statusHref(nextStatus: string | null) {
    return {
      pathname: '/dashboard/bookings' as const,
      query: {
        ...(view !== 'day' ? { view } : {}),
        ...(date !== today ? { date } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
      },
    };
  }

  const cols = 'minmax(160px,1.6fr) 140px 140px 100px 130px minmax(180px,1fr)';

  const sheetBooking = items.find((booking) => booking.id === sheetId) ?? null;

  /** Parity with the desktop row (AC 5): everything the row shows, plus the notes and the rejection reason it only shows in part. */
  function sheetRows(booking: BookingRowDto): BottomSheetRow[] {
    const rows: BottomSheetRow[] = [
      { k: labels.mobile.aircraft, v: booking.aircraftRegistration },
      { k: labels.mobile.startsAt, v: `${formatDateOnly(booking.startsAtDateOnly, locale)} · ${formatTimeOfDay(new Date(booking.startsAt), locale)}` },
      { k: labels.mobile.endsAt, v: `${formatDateOnly(booking.endsAtDateOnly, locale)} · ${formatTimeOfDay(new Date(booking.endsAt), locale)}` },
      { k: labels.mobile.instructor, v: booking.instructorName ?? '—' },
      { k: labels.mobile.notes, v: booking.notes ?? '—' },
    ];
    if (booking.status === 'DENIED' && booking.denyReason) {
      rows.push({ k: labels.mobile.denyReason, v: booking.denyReason });
    }
    return rows;
  }

  /** A row's sheet always opens on its first step, never on a leftover one from the previous row. */
  function openSheet(id: string): void {
    setSheetStep('none');
    setSheetDenyReason('');
    setSheetDenyError(null);
    setSheetId(id);
  }

  /**
   * The decisions this booking admits, in the desktop row's own order and
   * under its own gates (`canManageAny` / `isOwnRow`) — full parity, ratifica
   * R-15.4-d. The FIRST button carries `sheetPrimaryRef` so that coming back
   * from a second step lands the focus on something real, whichever action
   * happens to be first for this row.
   */
  function renderSheetActions(booking: BookingRowDto): ReactNode {
    const canManageRow = canManageAny || isOwnRow(booking);
    const busy = pendingActionId === booking.id;
    const actions: ReactNode[] = [];

    if (booking.status === 'PENDING' && canManageAny) {
      actions.push(
        <button
          key="approve"
          type="button"
          className="btn primary"
          ref={actions.length === 0 ? sheetPrimaryRef : undefined}
          disabled={busy}
          onClick={() => void handleApprove(booking.id)}
          data-testid="booking-approve-action-mobile"
        >
          {labels.actions.approve}
        </button>,
      );
      actions.push(
        <button
          key="reject"
          type="button"
          className="btn mini bad"
          disabled={busy}
          onClick={() => {
            setSheetStep('deny');
            setSheetDenyError(null);
          }}
          data-testid="booking-reject-action-mobile"
        >
          {labels.actions.reject}
        </button>,
      );
    }

    if ((booking.status === 'PENDING' || booking.status === 'APPROVED') && canManageRow) {
      actions.push(
        <button
          key="move"
          type="button"
          className="btn"
          ref={actions.length === 0 ? sheetPrimaryRef : undefined}
          disabled={busy}
          onClick={() => {
            // Ratifica R-15.4-d: the sheet goes away FIRST, then the panel
            // opens from the list — no z-50 panel stacked on a z-40 sheet.
            closeSheet();
            setEditingBooking(booking);
          }}
          data-testid="booking-move-action-mobile"
        >
          {labels.actions.move}
        </button>,
      );
    }

    if (booking.status === 'APPROVED' && canManageAny) {
      actions.push(
        <button
          key="flown"
          type="button"
          className="btn"
          ref={actions.length === 0 ? sheetPrimaryRef : undefined}
          disabled={busy}
          onClick={() => void handleFlown(booking.id)}
          data-testid="booking-flown-action-mobile"
        >
          {labels.actions.markFlown}
        </button>,
      );
      actions.push(
        <button key="noshow" type="button" className="btn" disabled={busy} onClick={() => void handleNoShow(booking.id)} data-testid="booking-noshow-action-mobile">
          {labels.actions.markNoShow}
        </button>,
      );
    }

    if ((booking.status === 'PENDING' || booking.status === 'APPROVED') && canManageRow) {
      actions.push(
        <button
          key="cancel"
          type="button"
          className="btn"
          ref={actions.length === 0 ? sheetPrimaryRef : undefined}
          disabled={busy}
          onClick={() => setSheetStep('cancel')}
          data-testid="booking-cancel-action-mobile"
        >
          {labels.actions.cancel}
        </button>,
      );
    }

    if ((booking.status === 'DENIED' || booking.status === 'FLOWN' || booking.status === 'NO_SHOW') && canManageAny) {
      actions.push(
        <button
          key="reopen"
          type="button"
          className="btn"
          ref={actions.length === 0 ? sheetPrimaryRef : undefined}
          disabled={busy}
          onClick={() => void handleReopen(booking.id)}
          data-testid="booking-reopen-action-mobile"
        >
          {labels.actions.reopen}
        </button>,
      );
    }

    // No decision at all (a CANCELLED row, or a viewer without the permission):
    // `BottomSheet` renders no action row rather than an empty one.
    return actions.length > 0 ? <>{actions}</> : undefined;
  }

  return (
    <>
    <div className="card" data-testid="bookings-list-section">
      <div className="card-head bookings-head">
        <div className="card-title">{labels.cardTitle}</div>
        <span className="card-sub" data-testid="bookings-pending-summary">
          {/* `total` is the FILTERED total, `pendingCount` never is (review 15.4
              F6): while a filter is active only the total is shown, on both
              faces of the card — desktop and phone read the same node. */}
          {(status === null ? labels.pendingSummary.replace('{pending}', String(pendingCount)) : labels.filteredSummary).replace('{total}', String(total))}
        </span>
        <div className="spacer" />
        <ExportMenu label={labels.exportLabel} xlsLabel={labels.exportXls} xlsHref={exportHref} pdfLabel={labels.exportPdf} pdfHref={exportPdfHref} />
        {/* `canCreateNew`, not `canCreate` (ratifica R-15.4-f): the panels below
            stay mounted for anyone with a booking permission, but the CTA is
            hidden from whoever `createBooking` would answer 403 to. */}
        {canCreateNew ? (
          <button type="button" className="btn primary" onClick={() => setShowNew(true)} data-testid="new-booking-button">
            {labels.newButton}
          </button>
        ) : null}
      </div>

      <div className="students bookings-desktop-body">
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
                <div className="student-name">{booking.personName ?? labels.occupied}</div>
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

      {/* --- the phone face of this card (story 15.4, R3/R4) ---------------
          Same card, same head, same pagination: only the six-column table is
          swapped for one card per booking, whose decisions live in the sheet
          (R-15.2-b/R-15.3-b). The status chips are the filter the desktop list
          has never had and the URL now understands (R-15.4-e). */}
      <div className="bookings-mobile">
        <div className="mobile-chip-strip" data-testid="mobile-status-chips">
          <Link
            href={statusHref(null)}
            locale={locale as AppLocale}
            className={`btn ${status === null ? 'primary' : ''}`}
            aria-current={status === null ? 'true' : undefined}
            data-testid="mobile-status-chip-all"
          >
            {labels.mobile.statusAll}
          </Link>
          {BOOKING_STATUS_VALUES.map((value) => (
            <Link
              key={value}
              href={statusHref(value)}
              locale={locale as AppLocale}
              className={`btn ${status === value ? 'primary' : ''}`}
              aria-current={status === value ? 'true' : undefined}
              data-testid={`mobile-status-chip-${value}`}
            >
              {labels.status[value]}
            </Link>
          ))}
        </div>

        <div data-testid="mobile-bookings-list">
          {items.length === 0 ? (
            <p className="mobile-card-empty" data-testid="mobile-bookings-empty">
              {labels.empty}
            </p>
          ) : (
            items.map((booking) => {
              const subLine = `${formatDateOnly(booking.startsAtDateOnly, locale)} · ${formatTimeOfDay(new Date(booking.startsAt), locale)}`;
              const title = booking.personName ?? labels.occupied;
              return (
                <button
                  key={booking.id}
                  type="button"
                  className="mobile-row"
                  aria-label={`${labels.mobile.openDetail}: ${title} · ${booking.aircraftRegistration} · ${subLine}`}
                  onClick={() => openSheet(booking.id)}
                  data-testid="booking-row-mobile"
                >
                  <span className="mobile-row-main">
                    <span className="mobile-row-title">
                      <span className="mobile-row-tail">{booking.aircraftRegistration}</span>
                      <span className="mobile-row-name">{title}</span>
                    </span>
                    <span className="mobile-row-sub">{subLine}</span>
                  </span>
                  <Badge tone={STATUS_TONE[booking.status]} dot>
                    {labels.status[booking.status]}
                  </Badge>
                </button>
              );
            })
          )}
        </div>
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

    {/* The decision sheet (AD-7: rendered conditionally, so `mobile-booking-sheet`
        is ONE node even with two sheet owners on this page). Every action is the
        desktop row's, under the SAME state+permission gate — the only difference
        is "Modifica", which CLOSES the sheet before opening the full-screen
        panel rather than stacking a z-50 panel on a z-40 sheet (ratifica
        R-15.4-d). */}
    {sheetBooking ? (
      <BottomSheet
        open
        onClose={closeSheet}
        testId="mobile-booking-sheet"
        sub={`${sheetBooking.aircraftRegistration} · ${formatDateOnly(sheetBooking.startsAtDateOnly, locale)}`}
        title={sheetBooking.personName ?? labels.occupied}
        badge={
          <Badge tone={STATUS_TONE[sheetBooking.status]} dot>
            {labels.status[sheetBooking.status]}
          </Badge>
        }
        rows={sheetRows(sheetBooking)}
        closeLabel={labels.mobile.close}
        actions={renderSheetActions(sheetBooking)}
        secondStep={
          sheetStep === 'deny' ? (
            <div className="bottom-sheet-step">
              <p className="fld-hint">{labels.denyModal.subtitle}</p>
              <textarea
                className="input"
                rows={3}
                maxLength={500}
                value={sheetDenyReason}
                onChange={(event) => setSheetDenyReason(event.target.value)}
                placeholder={labels.denyModal.reasonPlaceholder}
                aria-label={labels.denyModal.title}
                aria-invalid={Boolean(sheetDenyError)}
                ref={sheetReasonRef}
                data-testid="booking-deny-reason-mobile"
              />
              {sheetDenyError ? (
                <p role="alert" className="fld-error" data-testid="booking-deny-error-mobile">
                  {sheetDenyError}
                </p>
              ) : null}
              <div className="bottom-sheet-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSheetStep('none');
                    setSheetDenyError(null);
                  }}
                  data-testid="booking-deny-cancel-mobile"
                >
                  {labels.denyModal.cancel}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={pendingActionId === sheetBooking.id}
                  onClick={() => void submitSheetDeny(sheetBooking.id)}
                  data-testid="booking-deny-submit-mobile"
                >
                  {labels.denyModal.submit}
                </button>
              </div>
            </div>
          ) : sheetStep === 'cancel' ? (
            <div className="bottom-sheet-step">
              <p className="fld-hint">{labels.actions.cancelPrompt}</p>
              <div className="bottom-sheet-actions">
                <button type="button" className="btn" onClick={() => setSheetStep('none')} data-testid="booking-cancel-dismiss-mobile">
                  {labels.actions.dismiss}
                </button>
                <button
                  type="button"
                  className="btn mini bad"
                  ref={sheetCancelConfirmRef}
                  disabled={pendingActionId === sheetBooking.id}
                  onClick={() => void confirmCancel(sheetBooking.id)}
                  data-testid="booking-cancel-confirm-mobile"
                >
                  {labels.actions.cancelConfirm}
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
