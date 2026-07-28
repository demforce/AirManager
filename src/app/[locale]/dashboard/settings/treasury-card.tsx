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
  /** Review F7: split from the single `invalid` string ("Inserisci importi validi...") reused (up to 3x, and wrong even under the date field) across all three fields — one message per KIND of field now. */
  invalidAmount: string;
  requiredDate: string;
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
  // Story 14.2 (AC 1/2): one boolean per field instead of a single combined
  // banner — each invalid input is marked individually (review F7: with its
  // OWN per-kind message, `labels.invalidAmount`/`labels.requiredDate`).
  const [cashError, setCashError] = useState(false);
  const [bankError, setBankError] = useState(false);
  const [dateError, setDateError] = useState(false);

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
    const nextCashError = openingCashCentsParsed === null;
    const nextBankError = openingBankCentsParsed === null;
    const nextDateError = date.trim() === '';
    setCashError(nextCashError);
    setBankError(nextBankError);
    setDateError(nextDateError);
    // `=== null` repeats `next*Error`'s own check (a `let` only narrows on the
    // checked VARIABLE, not a derived boolean) — kept explicit so both
    // `opening*CentsParsed` narrow to `number` below.
    if (nextCashError || nextBankError || nextDateError || openingCashCentsParsed === null || openingBankCentsParsed === null) {
      setSaving(false);
      // Review F7: each invalid field already shows its OWN inline message —
      // a card-wide banner on top would only duplicate it (up to 3x).
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
          <Field label={labels.openingCash} error={cashError ? labels.invalidAmount : undefined}>
            <Input
              inputMode="decimal"
              value={cash}
              onChange={(event) => {
                setCash(event.target.value);
                if (cashError) setCashError(false);
              }}
              aria-invalid={cashError}
              data-testid="treasury-opening-cash-input"
            />
          </Field>
          <Field label={labels.openingBank} error={bankError ? labels.invalidAmount : undefined}>
            <Input
              inputMode="decimal"
              value={bank}
              onChange={(event) => {
                setBank(event.target.value);
                if (bankError) setBankError(false);
              }}
              aria-invalid={bankError}
              data-testid="treasury-opening-bank-input"
            />
          </Field>
          <Field label={labels.openingDate} error={dateError ? labels.requiredDate : undefined}>
            <DateInput
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                if (dateError) setDateError(false);
              }}
              aria-invalid={dateError}
              data-testid="treasury-opening-date-input"
            />
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
