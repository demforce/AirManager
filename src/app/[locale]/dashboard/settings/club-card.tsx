'use client';

import { Field, Input } from '@/components/ui/field';
import type { SettingsDraft } from '@/lib/settings-draft';

type ClubValue = SettingsDraft['club'];

export type ClubCardLabels = {
  title: string;
  sub: string;
  nameLabel: string;
  icao: string;
  contactEmail: string;
  /** Story 19.8 (AC 12, TD 19.1-a closed): what the contact email is FOR — the recipient of the SMTP test email (`smtp-test-email.service.ts`). */
  contactEmailHint: string;
  metarStation: string;
  metarStationHint: string;
};

export type ClubCardProps = {
  value: ClubValue;
  onChange: (patch: Partial<ClubValue>) => void;
  /** Messages by field, already translated by the page (story 19.8, AD-5). */
  errors: Partial<Record<keyof ClubValue, string>>;
  labels: ClubCardLabels;
};

/**
 * "Club" section (story 12.11, AC 2; story 19.8, AD-6) — nome, ICAO, email
 * di contatto and stazione METAR in ONE grid, controlled by the page's
 * draft: nothing here saves, the page's single "Salva" does (R-19-m). The
 * name keeps the `airfield-settings-form`/`airfield-name-input` testids of
 * the name form it absorbed (`pdf-exports.spec.ts` drives them).
 */
export function ClubCard({ value, onChange, errors, labels }: ClubCardProps) {
  return (
    <div className="card settings-card" data-testid="club-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="form-grid">
          <div data-testid="airfield-settings-form">
            <Field label={labels.nameLabel} error={errors.name}>
              <Input
                id="airfield-name"
                data-testid="airfield-name-input"
                type="text"
                maxLength={200}
                value={value.name}
                onChange={(event) => onChange({ name: event.target.value })}
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
          </div>
          <Field label={labels.icao} error={errors.icao}>
            <Input
              value={value.icao}
              maxLength={10}
              onChange={(event) => onChange({ icao: event.target.value.toUpperCase() })}
              aria-invalid={Boolean(errors.icao)}
              data-testid="club-icao-input"
            />
          </Field>
          <Field label={labels.contactEmail} error={errors.contactEmail} hint={labels.contactEmailHint}>
            <Input
              type="email"
              value={value.contactEmail}
              onChange={(event) => onChange({ contactEmail: event.target.value })}
              aria-invalid={Boolean(errors.contactEmail)}
              data-testid="club-contact-email-input"
            />
          </Field>
          <Field label={labels.metarStation} error={errors.metarStation} hint={labels.metarStationHint}>
            <Input
              value={value.metarStation}
              maxLength={10}
              placeholder={value.icao}
              onChange={(event) => onChange({ metarStation: event.target.value.toUpperCase() })}
              aria-invalid={Boolean(errors.metarStation)}
              data-testid="club-metar-station-input"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
