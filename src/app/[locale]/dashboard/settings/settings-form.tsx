'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import { parseApiError } from '@/lib/api-field-errors';
import type { AirfieldBrandingDto } from '@/lib/schemas/settings';

export type SettingsFormLabels = {
  nameLabel: string;
  save: string;
  saved: string;
  error: string;
  /** Review F3: `airfieldBrandingSchema.name` is `.trim().min(1)` — an empty save used to 422 with a MUTE field (no client check, no `fieldErrors.name` handling). */
  requiredField: string;
};

export type SettingsFormProps = {
  initial: AirfieldBrandingDto;
  labels: SettingsFormLabels;
};

/**
 * Name (story 10.2, AC 1; story 13.8, AC 4 — the logo upload/preview/remove
 * UI was removed, never exercised by any admin) — the identity half of the
 * Impostazioni "Club" card (story 12.11, AC 2). AirOps-restyled (`Field`/
 * `.input`/`.btn`) but the SAME `data-testid`s and behavior as before this
 * story (`pdf-exports.spec.ts` drives this exact form) — a surgical visual
 * port, no logic change. `PUT /api/v1/settings/airfield` on save.
 */
export function SettingsForm({ initial, labels }: SettingsFormProps) {
  const [name, setName] = useState(initial.name);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [nameError, setNameError] = useState(false);

  async function save(): Promise<void> {
    setFeedback(null);

    if (name.trim().length === 0) {
      setNameError(true);
      return;
    }
    setNameError(false);

    setSaving(true);
    const response = await fetch('/api/v1/settings/airfield', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false);

    if (!response.ok) {
      if (response.status === 422) {
        const { fieldErrors } = await parseApiError(response);
        if (fieldErrors.has('name')) {
          // Review F1's rule: the field marker below IS the feedback — no
          // redundant (and wrongly-colored, pre-fix) card-wide banner on top.
          setNameError(true);
          return;
        }
      }
      setFeedback({ message: labels.error, isError: true });
      return;
    }

    setFeedback({ message: labels.saved, isError: false });
  }

  return (
    <div data-testid="airfield-settings-form">
      <div className="form-grid">
        <Field label={labels.nameLabel} error={nameError ? labels.requiredField : undefined}>
          <input
            id="airfield-name"
            data-testid="airfield-name-input"
            type="text"
            maxLength={200}
            className="input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (nameError) setNameError(false);
            }}
            aria-invalid={nameError}
          />
        </Field>
      </div>

      {feedback ? (
        <p
          role="status"
          data-testid="airfield-settings-feedback"
          style={{ marginTop: 14, fontSize: 12.5, color: feedback.isError ? 'var(--bad)' : 'var(--ok)' }}
        >
          {feedback.message}
        </p>
      ) : null}

      <div style={{ marginTop: 18 }}>
        <button type="button" disabled={saving} onClick={() => void save()} data-testid="airfield-settings-save" className="btn primary">
          {labels.save}
        </button>
      </div>
    </div>
  );
}
