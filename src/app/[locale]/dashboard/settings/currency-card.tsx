'use client';

import { Field, Input, InputGroup } from '@/components/ui/field';
import { CURRENCY_LIMITS } from '@/lib/currency';
import type { SettingsDraft } from '@/lib/settings-draft';

type CurrencyValue = SettingsDraft['currency'];

export type CurrencyCardLabels = {
  title: string;
  sub: string;
  minFlights: string;
  windowDays: string;
  flightsSuffix: string;
  daysSuffix: string;
  hint: string;
};

export type CurrencyCardProps = {
  value: CurrencyValue;
  onChange: (patch: Partial<CurrencyValue>) => void;
  errors: Partial<Record<keyof CurrencyValue, string>>;
  labels: CurrencyCardLabels;
};

/**
 * "Currency" section (story 19.8, R-19-i): X flights on board in the last Y
 * days make a pilot or student current (`currency.service.ts`). The bounds
 * are the ones of `currencySettingsSchema`, read from the same pure module.
 */
export function CurrencyCard({ value, onChange, errors, labels }: CurrencyCardProps) {
  return (
    <div className="card settings-card" data-testid="currency-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <Field label={labels.minFlights} error={errors.minFlights}>
            <InputGroup suffix={labels.flightsSuffix}>
              <Input
                type="number"
                inputMode="numeric"
                min={CURRENCY_LIMITS.minFlights.min}
                max={CURRENCY_LIMITS.minFlights.max}
                value={value.minFlights}
                onChange={(event) => onChange({ minFlights: event.target.value })}
                aria-invalid={Boolean(errors.minFlights)}
                data-testid="currency-min-flights-input"
              />
            </InputGroup>
          </Field>
          <Field label={labels.windowDays} error={errors.windowDays}>
            <InputGroup suffix={labels.daysSuffix}>
              <Input
                type="number"
                inputMode="numeric"
                min={CURRENCY_LIMITS.windowDays.min}
                max={CURRENCY_LIMITS.windowDays.max}
                value={value.windowDays}
                onChange={(event) => onChange({ windowDays: event.target.value })}
                aria-invalid={Boolean(errors.windowDays)}
                data-testid="currency-window-days-input"
              />
            </InputGroup>
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          {labels.hint}
        </p>
      </div>
    </div>
  );
}
