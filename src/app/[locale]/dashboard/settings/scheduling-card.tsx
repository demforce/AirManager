'use client';

import { useState } from 'react';
import { Field, Input, InputGroup } from '@/components/ui/field';
import { parseApiError } from '@/lib/api-field-errors';

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
  save: string;
  saved: string;
  error: string;
  /** Story 14.2, AC 3: `schedulingSettingsSchema`'s own `closeTime > openTime` refine 422s with `fieldErrors.closeTime` — this card has no client-side check for it (unlike the other cards' required-field checks), so it's a genuinely reachable field-shaped 422. */
  invalidRange: string;
};

export type SchedulingCardProps = {
  initial: {
    openTime: string | null;
    closeTime: string | null;
    minSlotMinutes: number | null;
    turnaroundMinutes: number | null;
    maxAdvanceDays: number | null;
  };
  labels: SchedulingCardLabels;
};

/** 1:1 default of the prototype's own `defaults.sched` (`SettingsView.jsx:10`) — used only when nothing is configured yet, never written implicitly. */
const DEFAULTS = { openTime: '07:00', closeTime: '21:00', minSlotMinutes: '60', turnaroundMinutes: '15', maxAdvanceDays: '30' };

/**
 * "Pianificazione" card (story 12.11, AC 1/2/4) — the booking-window
 * settings: `openTime`/`closeTime`/`maxAdvanceDays` are ENFORCED server-side
 * (422 `BOOKING_OUTSIDE_WINDOW`, `bookings.service.ts`) and drive the
 * Pianificazione timeline axis; `minSlotMinutes`/`turnaroundMinutes` stay
 * ADVISORY (ratifica utente 3 — no server rejection).
 */
export function SchedulingCard({ initial, labels }: SchedulingCardProps) {
  const [openTime, setOpenTime] = useState(initial.openTime ?? DEFAULTS.openTime);
  const [closeTime, setCloseTime] = useState(initial.closeTime ?? DEFAULTS.closeTime);
  const [minSlotMinutes, setMinSlotMinutes] = useState(String(initial.minSlotMinutes ?? DEFAULTS.minSlotMinutes));
  const [turnaroundMinutes, setTurnaroundMinutes] = useState(String(initial.turnaroundMinutes ?? DEFAULTS.turnaroundMinutes));
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(String(initial.maxAdvanceDays ?? DEFAULTS.maxAdvanceDays));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [closeTimeError, setCloseTimeError] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);
    setCloseTimeError(false);

    const response = await fetch('/api/v1/settings/scheduling', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openTime,
        closeTime,
        minSlotMinutes: Number(minSlotMinutes),
        turnaroundMinutes: Number(turnaroundMinutes),
        maxAdvanceDays: Number(maxAdvanceDays),
      }),
    });

    setSaving(false);

    if (!response.ok && response.status === 422) {
      const { fieldErrors } = await parseApiError(response);
      if (fieldErrors.has('closeTime')) {
        setCloseTimeError(true);
        setFeedback(labels.error);
        return;
      }
    }

    setFeedback(response.ok ? labels.saved : labels.error);
  }

  return (
    <div className="card" data-testid="scheduling-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <Field label={labels.openTime}>
            <Input type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} data-testid="scheduling-open-time-input" />
          </Field>
          <Field label={labels.closeTime} error={closeTimeError ? labels.invalidRange : undefined}>
            <Input
              type="time"
              value={closeTime}
              onChange={(event) => {
                setCloseTime(event.target.value);
                if (closeTimeError) setCloseTimeError(false);
              }}
              aria-invalid={closeTimeError}
              data-testid="scheduling-close-time-input"
            />
          </Field>
          <Field label={labels.minSlotMinutes}>
            <InputGroup suffix={labels.minutesSuffix}>
              <Input type="number" min={15} step={15} value={minSlotMinutes} onChange={(event) => setMinSlotMinutes(event.target.value)} data-testid="scheduling-min-slot-input" />
            </InputGroup>
          </Field>
          <Field label={labels.turnaroundMinutes}>
            <InputGroup suffix={labels.minutesSuffix}>
              <Input type="number" min={0} step={5} value={turnaroundMinutes} onChange={(event) => setTurnaroundMinutes(event.target.value)} data-testid="scheduling-turnaround-input" />
            </InputGroup>
          </Field>
          <Field label={labels.maxAdvanceDays} wide>
            <InputGroup suffix={labels.daysSuffix}>
              <Input type="number" min={1} value={maxAdvanceDays} onChange={(event) => setMaxAdvanceDays(event.target.value)} data-testid="scheduling-max-advance-input" />
            </InputGroup>
          </Field>
        </div>

        <p className="hint" style={{ marginTop: 12 }}>
          {labels.hint.replace('{open}', openTime).replace('{close}', closeTime).replace('{slot}', minSlotMinutes).replace('{days}', maxAdvanceDays)}
        </p>

        {feedback ? (
          <p role="status" data-testid="scheduling-settings-feedback" style={{ marginTop: 14, fontSize: 12.5, color: feedback === labels.saved ? 'var(--ok)' : 'var(--bad)' }}>
            {feedback}
          </p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <button type="button" disabled={saving} onClick={() => void save()} data-testid="scheduling-settings-save" className="btn primary">
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}
