'use client';

import { useLocale } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { ExpiryItemDto, ExpiryStatusDto } from '@/lib/schemas/expiries';
import { formatDateOnly } from '@/lib/time';

export type MyExpiriesLabels = {
  empty: string;
  table: {
    type: string;
    issuedAt: string;
    expiresAt: string;
    notes: string;
    noNotes: string;
    statusHeader: string;
    status: Record<ExpiryStatusDto, string>;
    pendingBadge: string;
  };
};

type MyExpiriesProps = {
  expiries: ExpiryItemDto[];
  labels: MyExpiriesLabels;
};

const STATUS_TONE: Record<ExpiryStatusDto, BadgeTone> = { ok: 'ok', expiring: 'warn', expired: 'bad' };
const COLS = 'minmax(150px,1.4fr) 120px 120px 130px minmax(140px,1.4fr)';

/**
 * "Le mie scadenze" (story 6.2, AC 2; AirOps restyle, story 12.11 AC 3) —
 * own-access view, `.students` grid instead of a raw `<table>`. Story 12.13
 * (ratifica utente 4b) retired the titolare-facing "Proponi aggiornamento"
 * flow — `pendingBadge` is a READ-ONLY leftover: it can still show on a row
 * whose pre-cutover proposal is still `PENDING`, but there is no more
 * action to take on it from here.
 */
export function MyExpiries({ expiries, labels }: MyExpiriesProps) {
  if (expiries.length === 0) {
    return (
      <div className="card" data-testid="my-expiries">
        <p style={{ padding: '16px 20px', color: 'var(--ink-3)', fontSize: 13 }}>{labels.empty}</p>
      </div>
    );
  }

  return (
    <div className="card" data-testid="my-expiries">
      <div className="students">
        <div className="student-row header" style={{ gridTemplateColumns: COLS }}>
          <div>{labels.table.type}</div>
          <div>{labels.table.issuedAt}</div>
          <div>{labels.table.expiresAt}</div>
          <div>{labels.table.statusHeader}</div>
          <div>{labels.table.notes}</div>
        </div>
        {expiries.map((expiry) => (
          <MyExpiryRow key={expiry.id} expiry={expiry} labels={labels} />
        ))}
      </div>
    </div>
  );
}

type MyExpiryRowProps = {
  expiry: ExpiryItemDto;
  labels: MyExpiriesLabels;
};

function MyExpiryRow({ expiry, labels }: MyExpiryRowProps) {
  const moneyLocale = useLocale() === 'en' ? ('en' as const) : ('it' as const);

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
        {formatDateOnly(expiry.issuedAt, moneyLocale)}
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
