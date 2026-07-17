'use client';

import { useState } from 'react';
import { Field } from '@/components/ui/field';
import type { AirfieldBrandingDto } from '@/lib/schemas/settings';

export type SettingsFormLabels = {
  nameLabel: string;
  logoLabel: string;
  logoHint: string;
  logoUpload: string;
  logoRemove: string;
  logoPreviewAlt: string;
  logoTooLarge: string;
  logoInvalidType: string;
  save: string;
  saved: string;
  error: string;
};

export type SettingsFormProps = {
  initial: AirfieldBrandingDto;
  labels: SettingsFormLabels;
};

/** Same ~200KB guard as `airfieldBrandingSchema`'s `.max(280_000)` base64-char bound (`src/lib/schemas/settings.ts`) — a client-side early check on the RAW file size, the server stays the real guardian (AD-5). */
const MAX_LOGO_BYTES = 200 * 1024;
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg'];

/** Reads a `File` as a base64 data URL — the client-side upload path (Dev Notes: no storage infrastructure). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Name + logo (story 10.2, AC 1, 5) — the "nome"/logo half of the
 * Impostazioni "Club" card (story 12.11, AC 2). AirOps-restyled (`Field`/
 * `.input`/`.btn`) but the SAME `data-testid`s and behavior as before this
 * story (`pdf-exports.spec.ts` drives this exact form) — a surgical visual
 * port, no logic change. `PUT /api/v1/settings/airfield` on save.
 */
export function SettingsForm({ initial, labels }: SettingsFormProps) {
  const [name, setName] = useState(initial.name);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(initial.logoDataUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setFeedback(null);

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setLogoError(labels.logoInvalidType);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(labels.logoTooLarge);
      return;
    }

    setLogoError(null);
    setLogoDataUrl(await readFileAsDataUrl(file));
  }

  function removeLogo(): void {
    setLogoDataUrl(null);
    setLogoError(null);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);
    const response = await fetch('/api/v1/settings/airfield', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, logoDataUrl }),
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

      <div style={{ marginTop: 18 }}>
        <div className="fld-label">{labels.logoLabel}</div>
        <p className="hint" style={{ marginTop: 4 }}>
          {labels.logoHint}
        </p>

        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset next/image can optimize.
            <img
              src={logoDataUrl}
              alt={labels.logoPreviewAlt}
              data-testid="airfield-logo-preview"
              style={{ height: 56, width: 56, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'contain', background: 'var(--bg)' }}
            />
          ) : null}

          <label className="btn" style={{ cursor: 'pointer' }}>
            {labels.logoUpload}
            <input
              type="file"
              accept="image/png,image/jpeg"
              data-testid="airfield-logo-input"
              onChange={(event) => void handleLogoChange(event)}
              style={{ display: 'none' }}
            />
          </label>

          {logoDataUrl ? (
            <button type="button" onClick={removeLogo} data-testid="airfield-logo-remove" className="btn mini bad">
              {labels.logoRemove}
            </button>
          ) : null}
        </div>

        {logoError ? (
          <p role="alert" data-testid="airfield-logo-error" style={{ marginTop: 8, fontSize: 12, color: 'var(--bad)' }}>
            {logoError}
          </p>
        ) : null}
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
