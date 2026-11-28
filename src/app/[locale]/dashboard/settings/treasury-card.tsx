'use client';

import { DateInput } from '@/components/ui/date-input';
import { Field, Input } from '@/components/ui/field';
import type { SettingsDraft } from '@/lib/settings-draft';

type TreasuryValue = SettingsDraft['treasury'];

export type TreasuryCardLabels = {
  title: string;
  sub: string;
  openingCash: string;
  openingBank: string;
  openingDate: string;
  hint: string;
};

export type TreasuryCardProps = {
  value: TreasuryValue;
  onChange: (patch: Partial<TreasuryValue>) => void;
  errors: Partial<Record<keyof TreasuryValue, string>>;
  labels: TreasuryCardLabels;
};

/**
 * Tesoreria section (story Billing-2, AC 4) — the opening cash/bank balances
 * + the date from which `getBillingSummary`'s treasury running totals start
 * summing `CashMovement`s (Billing-1, AC 3). Controlled by the page's draft
 * since story 19.8 (the per-field checks of story 14.2 moved to
 * `settings-draft.ts#validateDraft`, one message per kind of field).
 */
export function TreasuryCard({ value, onChange, errors, labels }: TreasuryCardProps) {
  return (
    <div className="card settings-card" data-testid="treasury-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <Field label={labels.openingCash} error={errors.cash}>
            <Input inputMode="decimal" value={value.cash} onChange={(event) => onChange({ cash: event.target.value })} aria-invalid={Boolean(errors.cash)} data-testid="treasury-opening-cash-input" />
          </Field>
          <Field label={labels.openingBank} error={errors.bank}>
            <Input inputMode="decimal" value={value.bank} onChange={(event) => onChange({ bank: event.target.value })} aria-invalid={Boolean(errors.bank)} data-testid="treasury-opening-bank-input" />
          </Field>
          <Field label={labels.openingDate} error={errors.date}>
            <DateInput value={value.date} onChange={(event) => onChange({ date: event.target.value })} aria-invalid={Boolean(errors.date)} data-testid="treasury-opening-date-input" />
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          {labels.hint}
        </p>
      </div>
    </div>
  );
}
