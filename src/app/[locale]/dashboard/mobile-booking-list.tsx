'use client';

/**
 * Read-only booking list in the mobile language of the epic (story 15.3) —
 * three of the four lists ratifica R-15.3-h asks for:
 * - "In corso ora" (Panoramica admin, template lines 78-89);
 * - "I miei prossimi voli" (pilota/allievo, template 416-424);
 * - "La mia giornata" (istruttore, template 447-456) — the only one with the
 *   template's LEFT time column, hence `withTimeColumn`.
 *
 * The three differ by one grid track and by which fields the row shows, so
 * they are ONE component with the caller passing already-formatted strings,
 * not three near-copies: dates, times and money never cross into a client
 * component in this codebase (story 7.1's lesson, `bookings-table.tsx`'s own
 * `startsAtDateOnly`).
 *
 * The card IS the trigger of the `BottomSheet` (R3 + the `.ppr-card` idiom of
 * 15.2): one `<button>`, `<span>` children only, no nested interactive
 * element, one honest 44px+ target. Nothing here decides anything — the
 * decision queue is `mobile-pending-bookings.tsx`.
 *
 * Testid convention of the epic (15.1): the callers pass the names, because
 * two of these lists DUPLICATE a desktop one (`-mobile` suffix) and one exists
 * only on mobile (`mobile-` prefix).
 */
import { useCallback, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';

export type MobileBookingRow = {
  id: string;
  /** Mono chip before the title (the registration). Omitted where the title already IS the registration. */
  tail?: string;
  title: string;
  sub: string;
  /** `withTimeColumn` only: start (bold) and end (quiet) of the slot. */
  timeStart?: string;
  timeEnd?: string;
  badgeTone: BadgeTone;
  badgeLabel: string;
  /** Mono over-line of the sheet; with `sheetTitle` it also builds the dialog's accessible name. */
  sheetSub: string;
  sheetTitle: string;
  detail: BottomSheetRow[];
};

export type MobileBookingListLabels = {
  title: string;
  /** Mono count beside the title. Omitted where the list has no count worth stating. */
  count?: string;
  empty: string;
  /** Verb of the card's accessible name ("Apri dettaglio"), never rendered as text. */
  openDetail: string;
  close: string;
};

export type MobileBookingListProps = {
  rows: MobileBookingRow[];
  labels: MobileBookingListLabels;
  withTimeColumn?: boolean;
  testId: string;
  rowTestId: string;
  emptyTestId: string;
};

export function MobileBookingList({ rows, labels, withTimeColumn = false, testId, rowTestId, emptyTestId }: MobileBookingListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => setOpenId(null), []);

  /** The sheet follows the LIST, exactly like the PPR console's: no row, no sheet. */
  const openRow = rows.find((row) => row.id === openId) ?? null;

  return (
    <>
      <div className="card" data-testid={testId}>
        <div className="mobile-card-head">
          <span className="mobile-card-title">{labels.title}</span>
          {labels.count ? <span className="mobile-card-count">{labels.count}</span> : null}
        </div>

        {rows.length === 0 ? (
          <p className="mobile-card-empty" data-testid={emptyTestId}>
            {labels.empty}
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={withTimeColumn ? 'mobile-row mobile-row-timed' : 'mobile-row'}
              // A speaking name, not a bare "Apri": the row is identified by
              // what the card itself shows (AC 8).
              aria-label={`${labels.openDetail}: ${row.title} · ${row.sub}`}
              onClick={() => setOpenId(row.id)}
              data-testid={rowTestId}
            >
              {withTimeColumn ? (
                <span className="mobile-row-times">
                  <span className="mobile-row-t1">{row.timeStart}</span>
                  <span className="mobile-row-t2">{row.timeEnd}</span>
                </span>
              ) : null}
              <span className="mobile-row-main">
                <span className="mobile-row-title">
                  {row.tail ? <span className="mobile-row-tail">{row.tail}</span> : null}
                  <span className="mobile-row-name">{row.title}</span>
                </span>
                <span className="mobile-row-sub">{row.sub}</span>
              </span>
              <Badge tone={row.badgeTone} dot>
                {row.badgeLabel}
              </Badge>
            </button>
          ))
        )}
      </div>

      {openRow ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-booking-sheet"
          sub={openRow.sheetSub}
          title={openRow.sheetTitle}
          badge={
            <Badge tone={openRow.badgeTone} dot>
              {openRow.badgeLabel}
            </Badge>
          }
          rows={openRow.detail}
          closeLabel={labels.close}
        />
      ) : null}
    </>
  );
}
