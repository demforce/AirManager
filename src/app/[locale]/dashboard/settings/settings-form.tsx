'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import type { AirfieldBrandingDto } from '@/lib/schemas/settings';

export type SettingsFormLabels = {
  nameLabel: string;
  save: string;
  saved: string;
  error: string;
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
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);
    const response = await fetch('/api/v1/settings/airfield', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false);

    if (!response.ok) {
      setFeedback(labels.error);
      return;
    }

    setFeedback(labels.saved);
  }

  return (
    <div data-testid="airfield-settings-form">
      <div className="form-grid">
        <Field label={labels.nameLabel}>
          <input
            id="airfield-name"
            data-testid="airfield-name-input"
            type="text"
            maxLength={200}
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </div>

      {feedback ? (
        <p role="status" data-testid="airfield-settings-feedback" style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ok)' }}>
          {feedback}
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
