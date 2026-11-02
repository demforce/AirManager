'use client';

import { Field, Input } from '@/components/ui/field';
import type { SettingsDraft } from '@/lib/settings-draft';

type MembershipValue = SettingsDraft['membership'];

export type MembershipCardLabels = { title: string; sub: string; fee: string; feeHint: string };

export type MembershipCardProps = {
  value: MembershipValue;
  onChange: (patch: Partial<MembershipValue>) => void;
  errors: Partial<Record<keyof MembershipValue, string>>;
  labels: MembershipCardLabels;
};

/**
 * "Quota associativa" section (story 19.8, R-19-k) — its own section, out of
 * the Club card: the annual amount the Scadenze "Quota associativa" action
 * precompiles. The 12-month validity is fixed by the service (story 19.7a),
 * so the amount is the only thing to configure.
 */
export function MembershipCard({ value, onChange, errors, labels }: MembershipCardProps) {
  return (
    <div className="card settings-card" data-testid="membership-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <Field label={labels.fee} error={errors.fee} hint={labels.feeHint}>
            <Input
              inputMode="decimal"
              value={value.fee}
              onChange={(event) => onChange({ fee: event.target.value })}
              aria-invalid={Boolean(errors.fee)}
              data-testid="membership-settings-fee-input"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
