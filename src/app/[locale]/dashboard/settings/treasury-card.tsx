'use client';

import { useState } from 'react';
import { DateInput } from '@/components/ui/date-input';
import { Field, Input } from '@/components/ui/field';
import { parseCents } from '@/lib/money';

export type TreasuryCardLabels = {
  title: string;
  sub: string;
  openingCash: string;
  openingBank: string;
  openingDate: string;
  hint: string;
  save: string;
  saved: string;
  error: string;
  invalid: string;
};

export type TreasuryCardProps = {
  openingCashCents: number;
  openingBankCents: number;
  openingDate: string | null;
  labels: TreasuryCardLabels;
};

/**
 * Tesoreria card (story Billing-2, AC 4) — the opening cash/bank balances +
 * the date from which `getBillingSummary`'s treasury running totals start
 * summing `CashMovement`s (Billing-1, AC 3). Same single-card-save pattern
 * as `ClubCard`/`SmtpCard`. Server component (`page.tsx`) reads the current
 * values via `getTreasurySettings` directly (D5, ratifica Billing-1/story
 * Billing-2 dev choice) — no GET route: this card is the ONLY consumer, and
 * a server component read makes a round-trip HTTP GET pointless.
 */
export function TreasuryCard({ openingCashCents, openingBankCents, openingDate, labels }: TreasuryCardProps) {
  const [cash, setCash] = useState(() => (openingCashCents / 100).toFixed(2));
  const [bank, setBank] = useState(() => (openingBankCents / 100).toFixed(2));
  const [date, setDate] = useState(openingDate ?? '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);

    let openingCashCentsParsed: number | null;
    let openingBankCentsParsed: number | null;
    try {
      openingCashCentsParsed = parseCents(cash);
    } catch {
      openingCashCentsParsed = null;
    }
    try {
      openingBankCentsParsed = parseCents(bank);
    } catch {
      openingBankCentsParsed = null;
    }
    if (openingCashCentsParsed === null || openingBankCentsParsed === null || date.trim() === '') {
      setSaving(false);
      setFeedback(labels.invalid);
      return;
    }

    const response = await fetch('/api/v1/settings/treasury', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingCashCents: openingCashCentsParsed, openingBankCents: openingBankCentsParsed, openingDate: date }),
    });

    setSaving(false);
    setFeedback(response.ok ? labels.saved : labels.error);
  }

  return (
    <div className="card" data-testid="treasury-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <Field label={labels.openingCash}>
            <Input inputMode="decimal" value={cash} onChange={(event) => setCash(event.target.value)} data-testid="treasury-opening-cash-input" />
          </Field>
          <Field label={labels.openingBank}>
            <Input inputMode="decimal" value={bank} onChange={(event) => setBank(event.target.value)} data-testid="treasury-opening-bank-input" />
          </Field>
          <Field label={labels.openingDate}>
            <DateInput value={date} onChange={(event) => setDate(event.target.value)} data-testid="treasury-opening-date-input" />
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          {labels.hint}
        </p>

        {feedback ? (
          <p role="status" data-testid="treasury-settings-feedback" style={{ marginTop: 14, fontSize: 12.5, color: feedback === labels.saved ? 'var(--ok)' : 'var(--bad)' }}>
            {feedback}
          </p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <button type="button" disabled={saving} onClick={() => void save()} data-testid="treasury-settings-save" className="btn primary">
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}
