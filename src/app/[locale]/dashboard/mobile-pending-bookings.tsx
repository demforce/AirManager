'use client';

/**
 * "Prenotazioni in attesa" card of the mobile Panoramica (story 15.3, AC 3,
 * template lines 90-105) — the fourth list of ratifica R-15.3-h and the only
 * one that DECIDES.
 *
 * A NEW component, deliberately not a mobile tree inside `bookings-table.tsx`
 * (AD-2): that table is also embedded on `/dashboard/bookings`, so a tree
 * added there would appear on two pages at once and pre-empt story 15.4. No
 * network logic is duplicated for it either — the request, the 409 branch and
 * the code -> message mapping are the shared `postBookingTransition` the
 * desktop table now calls too.
 *
 * Ratifica R-15.3-b: Approva/Nega live ONLY inside the sheet, exactly like the
 * PPR queue (R-15.2-b) — the card stays one `<button>` with no nested control,
 * and two destructive buttons never sit under the thumb while scrolling. The
 * bullet of the epic plan ("Approva/Nega inline", which the template also
 * shows) is superseded by that ratification; and it could not have completed
 * anyway, because a rejection needs a REASON by domain rule
 * (`lib/schemas/bookings.ts`: `reason` is mandatory for `to: 'DENIED'`), which
 * is the sheet's `secondStep` (R-15.2-a).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { postBookingTransition, type BookingTransitionErrorLabels } from './bookings/booking-transition';

export type MobilePendingBookingRow = {
  id: string;
  /** Requester (`personName`, or the masked placeholder the desktop uses). */
  title: string;
  /** Mono line: registration and when, already formatted server-side. */
  sub: string;
  /** Mono over-line of the sheet. */
  sheetSub: string;
  detail: BottomSheetRow[];
};

export type MobilePendingBookingsLabels = {
  title: string;
  /** Mono count in the head — the WINDOW's pending total, not the all-time KPI. */
  count: string;
  empty: string;
  openDetail: string;
  close: string;
  /** Badge text of a PENDING booking (`list.status.PENDING`). */
  pendingStatus: string;
  approve: string;
  reject: string;
  approveSuccess: string;
  rejectSuccess: string;
  reasonSubtitle: string;
  reasonPlaceholder: string;
  reasonRequired: string;
  reasonTitle: string;
  reasonSubmit: string;
  reasonCancel: string;
  errors: BookingTransitionErrorLabels;
};

export type MobilePendingBookingsProps = {
  rows: MobilePendingBookingRow[];
  labels: MobilePendingBookingsLabels;
};

export function MobilePendingBookings({ rows, labels }: MobilePendingBookingsProps) {
  const router = useRouter();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [denying, setDenying] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [denyError, setDenyError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => {
    setOpenId(null);
    setDenying(false);
    setDenyReason('');
    setDenyError(null);
  }, []);

  /**
   * Same fix as review 15.2 F1 on the PPR sheet: swapping the sheet's body
   * removes the very button that was pressed and `document.activeElement`
   * falls back to `<body>`, losing the dialog context for assistive
   * technology even though the node survives. Each step takes the focus to
   * what it is about; inert while no sheet is open (both refs are null then),
   * so `MobileSheet`'s own focus-on-open/return baseline is untouched.
   */
  useEffect(() => {
    if (denying) reasonRef.current?.focus();
    else rejectButtonRef.current?.focus();
  }, [denying]);

  const openRow = rows.find((row) => row.id === openId) ?? null;

  async function handleApprove(id: string): Promise<void> {
    setBusyId(id);
    const outcome = await postBookingTransition(id, 'APPROVED', labels.errors);
    setBusyId(null);

    if (!outcome.ok) {
      toast.show(outcome.message, 'bad');
      // Review 15.2 F4's lesson: a 409 means somebody else decided this
      // booking, so the row on screen is stale — it has to go, or the same
      // card keeps re-opening a sheet that can only produce another 409.
      if (outcome.conflict) {
        closeSheet();
        router.refresh();
      }
      return;
    }

    closeSheet();
    toast.show(labels.approveSuccess, 'ok');
    router.refresh();
  }

  async function submitDeny(id: string): Promise<void> {
    const reason = denyReason.trim();
    if (reason.length === 0) {
      // Same client-side guard as the desktop deny modal: an empty reason
      // never reaches the network (AC 3).
      setDenyError(labels.reasonRequired);
      return;
    }

    setDenyError(null);
    setBusyId(id);
    const outcome = await postBookingTransition(id, 'DENIED', labels.errors, reason);
    setBusyId(null);

    if (!outcome.ok) {
      toast.show(outcome.message, 'bad');
      if (outcome.conflict) {
        closeSheet();
        router.refresh();
      } else {
        setDenyError(outcome.message);
      }
      return;
    }

    closeSheet();
    toast.show(labels.rejectSuccess, 'bad');
    router.refresh();
  }

  return (
    <>
      <div className="card" data-testid="mobile-overview-pending-bookings">
        <div className="mobile-card-head">
          <span className="mobile-card-title">{labels.title}</span>
          <span className="mobile-card-count">{labels.count}</span>
        </div>

        {rows.length === 0 ? (
          <p className="mobile-card-empty" data-testid="mobile-overview-pending-empty">
            {labels.empty}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="mobile-row"
              aria-label={`${labels.openDetail}: ${row.title} · ${row.sub}`}
              onClick={() => setOpenId(row.id)}
              data-testid="mobile-overview-pending-row"
            >
              <span className="mobile-row-main">
                <span className="mobile-row-title">
                  <span className="mobile-row-name">{row.title}</span>
                </span>
                <span className="mobile-row-sub">{row.sub}</span>
              </span>
              {/* The three read-only lists fill this slot with a status badge;
                  here every row is PENDING by construction (the head already
                  says how many), so a badge would state nothing. The chevron
                  takes the slot instead as the row's affordance: ratifica
                  R-15.3-b moved Approva/Nega into the sheet, which took away
                  the inline buttons that made the template's row look
                  actionable. */}
              <span className="mobile-row-chev" aria-hidden="true">
                <Icon.chevR />
              </span>
            </button>
          ))
        )}
        {/* No "tutte le prenotazioni" footer here on purpose: the hidden
            calendar AND the hidden full table both live at
            `/dashboard/bookings`, so the page carries ONE link to it (the
            `.mobile-shortcuts` row at the end of the Panoramica) instead of two
            CTAs with the same destination. */}
      </div>

      {openRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-booking-sheet"
          sub={openRow.sheetSub}
          title={openRow.title}
          badge={
            <Badge tone="warn" dot>
              {labels.pendingStatus}
            </Badge>
          }
          rows={openRow.detail}
          closeLabel={labels.close}
          actions={
            <>
              <button
                type="button"
                className="btn primary"
                disabled={busyId === openRow.id}
                onClick={() => void handleApprove(openRow.id)}
                data-testid="mobile-overview-approve"
              >
                {labels.approve}
              </button>
              <button
                type="button"
                className="btn mini bad"
                disabled={busyId === openRow.id}
                onClick={() => {
                  setDenying(true);
                  setDenyError(null);
                }}
                ref={rejectButtonRef}
                data-testid="mobile-overview-deny"
              >
                {labels.reject}
              </button>
            </>
          }
          secondStep={
            denying ? (
              <div className="bottom-sheet-step">
                <p className="fld-hint">{labels.reasonSubtitle}</p>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={500}
                  value={denyReason}
                  onChange={(event) => setDenyReason(event.target.value)}
                  placeholder={labels.reasonPlaceholder}
                  aria-label={labels.reasonTitle}
                  aria-invalid={Boolean(denyError)}
                  ref={reasonRef}
                  data-testid="mobile-overview-deny-reason"
                />
                {denyError ? (
                  <p role="alert" className="fld-error" data-testid="mobile-overview-deny-error">
                    {denyError}
                  </p>
                ) : null}
                <div className="bottom-sheet-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDenying(false);
                      setDenyError(null);
                    }}
                    data-testid="mobile-overview-deny-cancel"
                  >
                    {labels.reasonCancel}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busyId === openRow.id}
                    onClick={() => void submitDeny(openRow.id)}
                    data-testid="mobile-overview-deny-submit"
                  >
                    {labels.reasonSubmit}
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
