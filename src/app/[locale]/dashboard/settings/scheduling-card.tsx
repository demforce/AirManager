'use client';

import { Field, Input, InputGroup } from '@/components/ui/field';
import type { SettingsDraft } from '@/lib/settings-draft';

type SchedulingValue = SettingsDraft['scheduling'];

export type SchedulingCardLabels = {
  title: string;
  sub: string;
  openTime: string;
  closeTime: string;
  minSlotMinutes: string;
  turnaroundMinutes: string;
  maxAdvanceDays: string;
  minutesSuffix: string;
  daysSuffix: string;
  hint: string;
};

export type SchedulingCardProps = {
  value: SchedulingValue;
  onChange: (patch: Partial<SchedulingValue>) => void;
  errors: Partial<Record<keyof SchedulingValue, string>>;
  labels: SchedulingCardLabels;
};

/**
 * "Pianificazione" section (story 12.11, AC 1/2/4) — the booking-window
 * settings: `openTime`/`closeTime`/`maxAdvanceDays` are ENFORCED server-side
 * (422 `BOOKING_OUTSIDE_WINDOW`, `bookings.service.ts`) and drive the
 * Pianificazione timeline axis; `minSlotMinutes`/`turnaroundMinutes` stay
 * ADVISORY (ratifica utente 3 — no server rejection). Controlled by the
 * page's draft since story 19.8: the defaults of an unconfigured install
 * come from `settings-draft.ts#SCHEDULING_DEFAULTS`, shown, never written
 * implicitly.
 */
export function SchedulingCard({ value, onChange, errors, labels }: SchedulingCardProps) {
  return (
    <div className="card settings-card" data-testid="scheduling-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <Field label={labels.openTime} error={errors.openTime}>
            <Input type="time" value={value.openTime} onChange={(event) => onChange({ openTime: event.target.value })} aria-invalid={Boolean(errors.openTime)} data-testid="scheduling-open-time-input" />
          </Field>
          <Field label={labels.closeTime} error={errors.closeTime}>
            <Input type="time" value={value.closeTime} onChange={(event) => onChange({ closeTime: event.target.value })} aria-invalid={Boolean(errors.closeTime)} data-testid="scheduling-close-time-input" />
          </Field>
          <Field label={labels.minSlotMinutes} error={errors.minSlotMinutes}>
            <InputGroup suffix={labels.minutesSuffix}>
              <Input
                type="number"
                min={15}
                step={15}
                value={value.minSlotMinutes}
                onChange={(event) => onChange({ minSlotMinutes: event.target.value })}
                aria-invalid={Boolean(errors.minSlotMinutes)}
                data-testid="scheduling-min-slot-input"
              />
            </InputGroup>
          </Field>
          <Field label={labels.turnaroundMinutes} error={errors.turnaroundMinutes}>
            <InputGroup suffix={labels.minutesSuffix}>
              <Input
                type="number"
                min={0}
                step={5}
                value={value.turnaroundMinutes}
                onChange={(event) => onChange({ turnaroundMinutes: event.target.value })}
                aria-invalid={Boolean(errors.turnaroundMinutes)}
                data-testid="scheduling-turnaround-input"
              />
            </InputGroup>
          </Field>
          <Field label={labels.maxAdvanceDays} wide error={errors.maxAdvanceDays}>
            <InputGroup suffix={labels.daysSuffix}>
              <Input
                type="number"
                min={1}
                value={value.maxAdvanceDays}
                onChange={(event) => onChange({ maxAdvanceDays: event.target.value })}
                aria-invalid={Boolean(errors.maxAdvanceDays)}
                data-testid="scheduling-max-advance-input"
              />
            </InputGroup>
          </Field>
        </div>

        <p className="hint" style={{ marginTop: 12 }}>
          {labels.hint.replace('{open}', value.openTime).replace('{close}', value.closeTime).replace('{slot}', value.minSlotMinutes).replace('{days}', value.maxAdvanceDays)}
        </p>
      </div>
    </div>
  );
}
