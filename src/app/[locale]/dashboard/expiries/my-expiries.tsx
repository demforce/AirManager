'use client';

import { useCallback, useState } from 'react';
import { useLocale } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { BottomSheet, type BottomSheetRow } from '@/components/ui/bottom-sheet';
import { myExpiryCardSubLine } from '@/lib/mobile-expiries';
import type { ExpiryItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';

export type MyExpiriesLabels = {
  empty: string;
  table: {
    type: string;
    expiresAt: string;
    notes: string;
    noNotes: string;
    statusHeader: string;
    status: Record<ExpiryStatusDto, string>;
    pendingBadge: string;
  };
  /** Story 15.7 — the two words the phone face needs and the desktop table has no equivalent for; everything else it says is borrowed from `table.*`. */
  mobile: { openDetail: string; close: string };
};

type MyExpiriesProps = {
  expiries: ExpiryItemDto[];
  labels: MyExpiriesLabels;
};

const STATUS_TONE: Record<ExpiryStatusDto, BadgeTone> = { ok: 'ok', expiring: 'warn', expired: 'bad' };
const COLS = 'minmax(150px,1.4fr) 120px 130px minmax(140px,1.4fr)';

/**
 * "Le mie scadenze" (story 6.2, AC 2; AirOps restyle, story 12.11 AC 3) —
 * own-access view, `.students` grid instead of a raw `<table>`. Story 12.13
 * (ratifica utente 4b) retired the titolare-facing "Proponi aggiornamento"
 * flow — `pendingBadge` is a READ-ONLY leftover: it can still show on a row
 * whose pre-cutover proposal is still `PENDING`, but there is no more
 * action to take on it from here.
 *
 * Story 15.7 (ratifica R-15.7-i) added the phone face: the same four columns
 * as one card per scadenza plus a detail sheet, because this page is one of
 * the FIVE tab-bar entries a pilota/allievo/istruttore has (measured:
 * `mobile-tab-scadenze` is in the bar, not in "Altro", for all three) and it
 * was still a 600px-wide table inside 317px of screen.
 */
export function MyExpiries({ expiries, labels }: MyExpiriesProps) {
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);
  const [sheetId, setSheetId] = useState<string | null>(null);
  /** Stable by contract: `MobileSheet` gates its focus effect on this callback's identity. */
  const closeSheet = useCallback((): void => setSheetId(null), []);
  const sheetExpiry = expiries.find((expiry) => expiry.id === sheetId) ?? null;

  function sheetRows(expiry: ExpiryItemDto): BottomSheetRow[] {
    const rows: BottomSheetRow[] = [
      { k: labels.table.expiresAt, v: formatDateOnly(expiry.expiresAt, moneyLocale) },
      { k: labels.table.statusHeader, v: labels.table.status[expiry.status] },
      { k: labels.table.notes, v: expiry.notes ?? labels.table.noNotes },
    ];
    if (expiry.pendingProposal) rows.push({ k: labels.table.pendingBadge, v: formatDateOnly(expiry.pendingProposal.proposedExpiresAt, moneyLocale) });
    return rows;
  }

  return (
    <div className="card" data-testid="my-expiries">
      {expiries.length === 0 ? (
        <p className="my-expiries-desktop-body" data-testid="my-expiries-empty" style={{ padding: '16px 20px', color: 'var(--ink-3)', fontSize: 13 }}>
          {labels.empty}
        </p>
      ) : (
        <div className="students my-expiries-desktop-body">
          <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
            <div>{labels.table.type}</div>
            <div>{labels.table.expiresAt}</div>
            <div>{labels.table.statusHeader}</div>
            <div>{labels.table.notes}</div>
          </div>
          {expiries.map((expiry) => (
            <MyExpiryRow key={expiry.id} expiry={expiry} labels={labels} moneyLocale={moneyLocale} />
          ))}
        </div>
      )}

      {/* --- the phone face (story 15.7, R3/R4) ---------------------------
          Same card, one row per scadenza instead of the four-column table
          (measured pre-fix: 317 visible against 600 of table, with the
          certificate name clipped WITHOUT an ellipsis). The note, which the
          desktop keeps in its fourth column, rides on the sub-line when it
          is there and in the sheet in full. */}
      <div className="my-expiries-mobile" data-testid="mobile-my-expiries-list">
        {expiries.length === 0 ? (
          <p className="mobile-card-empty" data-testid="mobile-my-expiries-empty">
            {labels.empty}
          </p>
        ) : (
          expiries.map((expiry) => {
            const dateLabel = formatDateOnly(expiry.expiresAt, moneyLocale);
            return (
              <button
                key={expiry.id}
                type="button"
                className="mobile-row mobile-row-expiry"
                aria-label={`${labels.mobile.openDetail}: ${expiry.typeName} · ${dateLabel}`}
                onClick={() => setSheetId(expiry.id)}
                data-testid="my-expiry-row-mobile"
              >
                <span className="mobile-row-main">
                  <span className="mobile-row-title">
                    <span className="mobile-row-name">{expiry.typeName}</span>
                  </span>
                  <span className="mobile-row-sub">{myExpiryCardSubLine({ dateLabel, notes: expiry.notes })}</span>
                </span>
                <span className="mobile-row-side">
                  <Badge tone={STATUS_TONE[expiry.status]} dot>
                    {labels.table.status[expiry.status]}
                  </Badge>
                </span>
                {expiry.pendingProposal ? (
                  <span className="mobile-row-flag" data-testid="my-expiry-pending-badge-mobile">
                    <Badge>{labels.table.pendingBadge}</Badge>
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {/* AD-7: rendered conditionally, so `mobile-my-expiry-sheet` is ONE node. */}
      {sheetExpiry ? (
        <BottomSheet
          open
          onClose={closeSheet}
          testId="mobile-my-expiry-sheet"
          sub={formatDateOnly(sheetExpiry.expiresAt, moneyLocale)}
          title={sheetExpiry.typeName}
          badge={
            <Badge tone={STATUS_TONE[sheetExpiry.status]} dot>
              {labels.table.status[sheetExpiry.status]}
            </Badge>
          }
          rows={sheetRows(sheetExpiry)}
          closeLabel={labels.mobile.close}
        />
      ) : null}
    </div>
  );
}

type MyExpiryRowProps = {
  expiry: ExpiryItemDto;
  labels: MyExpiriesLabels;
  moneyLocale: 'it' | 'en';
};

function MyExpiryRow({ expiry, labels, moneyLocale }: MyExpiryRowProps) {
  return (
    <div data-testid="my-expiry-row" className="student-row" style={{ gridTemplateColumns: COLS }}>
      <div>
        <div className="student-name">{expiry.typeName}</div>
        {expiry.pendingProposal ? (
          <span data-testid="my-expiry-pending-badge" className="badge" style={{ marginTop: 4, fontSize: 10 }}>
            {labels.table.pendingBadge}
          </span>
        ) : null}
      </div>
      <div className="mono" style={{ fontSize: 12 }}>
        {formatDateOnly(expiry.expiresAt, moneyLocale)}
      </div>
      <div data-testid="my-expiry-status-badge">
        <Badge tone={STATUS_TONE[expiry.status]} dot>
          {labels.table.status[expiry.status]}
        </Badge>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{expiry.notes ?? labels.table.noNotes}</div>
    </div>
  );
}
