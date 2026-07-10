'use client';

import { useState } from 'react';
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
 * Admin-only airfield branding form (story 10.2, AC 1, 5) — name + logo
 * upload/preview/removal, `PUT /api/v1/settings/airfield` on save. Same
 * fetch/feedback shape as `dashboard/ppr/ppr-queue.tsx`'s
 * `PprOperatingInstructionsEditor`/`LandingFeeEditor`.
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
    <section className="rounded-[12px] border border-[#EAEAEA] bg-white p-6" data-testid="airfield-settings-form">
      <div>
        <label htmlFor="airfield-name" className="block text-sm font-medium text-[#2F3437]">
          {labels.nameLabel}
        </label>
        <input
          id="airfield-name"
          data-testid="airfield-name-input"
          type="text"
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full max-w-sm rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
        />
      </div>

      <div className="mt-6 border-t border-[#EAEAEA] pt-6">
        <p className="block text-sm font-medium text-[#2F3437]">{labels.logoLabel}</p>
        <p className="mt-1 text-sm text-[#787774]">{labels.logoHint}</p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset next/image can optimize.
            <img
              src={logoDataUrl}
              alt={labels.logoPreviewAlt}
              data-testid="airfield-logo-preview"
              className="h-16 w-16 rounded-[6px] border border-[#EAEAEA] object-contain"
            />
          ) : null}

          <label className="inline-flex min-h-[40px] cursor-pointer items-center rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-sm font-medium text-[#2F3437] transition-colors hover:bg-[#F7F6F3]">
            {labels.logoUpload}
            <input
              type="file"
              accept="image/png,image/jpeg"
              data-testid="airfield-logo-input"
              onChange={(event) => void handleLogoChange(event)}
              className="hidden"
            />
          </label>

          {logoDataUrl ? (
            <button
              type="button"
              onClick={removeLogo}
              data-testid="airfield-logo-remove"
              className="text-sm font-medium text-[#9F2F2D] underline-offset-4 hover:underline"
            >
              {labels.logoRemove}
            </button>
          ) : null}
        </div>

        {logoError ? (
          <p role="alert" data-testid="airfield-logo-error" className="mt-2 text-xs text-[#9F2F2D]">
            {logoError}
          </p>
        ) : null}
      </div>

      {feedback ? (
        <p role="status" data-testid="airfield-settings-feedback" className="mt-4 text-sm text-[#346538]">
          {feedback}
        </p>
      ) : null}

      <div className="mt-6">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          data-testid="airfield-settings-save"
          className="rounded-[6px] bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.save}
        </button>
      </div>
    </section>
  );
}
