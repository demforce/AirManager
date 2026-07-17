'use client';

import { useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { parseCents } from '@/lib/money';
import { SettingsForm, type SettingsFormLabels } from './settings-form';

export type ClubCardLabels = {
  title: string;
  sub: string;
  identityHeading: string;
  settingsForm: SettingsFormLabels;
  icao: string;
  contactEmail: string;
  metarStation: string;
  metarStationHint: string;
  landingFee: string;
  landingFeeHint: string;
  operatingInstructionsIt: string;
  operatingInstructionsEn: string;
  membershipFee: string;
  membershipFeeHint: string;
  save: string;
  saved: string;
  error: string;
};

export type ClubCardProps = {
  branding: { name: string; logoDataUrl: string | null };
  icao: string;
  contactEmail: string;
  metarStation: string;
  landingFeeCents: number;
  operatingInstructions: { it: string; en: string };
  membershipFeeCents: number;
  labels: ClubCardLabels;
};

/**
 * "Club" card (story 12.11, AC 2) — identity (nome/logo, the pre-existing
 * `SettingsForm`, own save action for e2e compatibility) plus, in ONE
 * second save action: ICAO, email di contatto, tassa PPR di default,
 * istruzioni operative PPR (IT/EN), and quota associativa (ratifica 1).
 * These 4 settings are functionally independent (different keys, different
 * services) but share ONE "Salva" here — a deliberate adaptation of the
 * prototype's single-button-per-card shape onto the real multi-endpoint
 * backend (Dev Notes: `settings/club` + `settings/ppr-landing-fee` +
 * `settings/ppr-operating-instructions` + `settings/membership-fee`, fired
 * together).
 */
export function ClubCard({ branding, icao, contactEmail, metarStation, landingFeeCents, operatingInstructions, membershipFeeCents, labels }: ClubCardProps) {
  const [icaoValue, setIcaoValue] = useState(icao);
  const [contactEmailValue, setContactEmailValue] = useState(contactEmail);
  const [metarStationValue, setMetarStationValue] = useState(metarStation);
  const [landingFee, setLandingFee] = useState(() => (landingFeeCents / 100).toFixed(2));
  const [instructionsIt, setInstructionsIt] = useState(operatingInstructions.it);
  const [instructionsEn, setInstructionsEn] = useState(operatingInstructions.en);
  const [membershipFee, setMembershipFee] = useState(() => (membershipFeeCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);

    let landingFeeCentsParsed: number | null;
    let membershipFeeCentsParsed: number | null;
    try {
      landingFeeCentsParsed = parseCents(landingFee);
    } catch {
      landingFeeCentsParsed = null;
    }
    try {
      membershipFeeCentsParsed = parseCents(membershipFee);
    } catch {
      membershipFeeCentsParsed = null;
    }
    if (landingFeeCentsParsed === null || landingFeeCentsParsed < 0 || membershipFeeCentsParsed === null || membershipFeeCentsParsed < 0) {
      setSaving(false);
      setFeedback(labels.error);
      return;
    }

    const responses = await Promise.all([
      fetch('/api/v1/settings/club', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icao: icaoValue, contactEmail: contactEmailValue }),
      }),
      fetch('/api/v1/settings/metar-station', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station: metarStationValue }),
      }),
      fetch('/api/v1/settings/ppr-landing-fee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landingFeeCents: landingFeeCentsParsed }),
      }),
      fetch('/api/v1/settings/ppr-operating-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ it: instructionsIt, en: instructionsEn }),
      }),
      fetch('/api/v1/settings/membership-fee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annualFeeCents: membershipFeeCentsParsed }),
      }),
    ]);

    setSaving(false);
    setFeedback(responses.every((response) => response.ok) ? labels.saved : labels.error);
  }

  return (
    <div className="card" data-testid="club-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>
        <div className="fld-label" style={{ marginBottom: 10 }}>
          {labels.identityHeading}
        </div>
        <SettingsForm initial={branding} labels={labels.settingsForm} />

        <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <div className="form-grid">
            <Field label={labels.icao}>
              <Input value={icaoValue} maxLength={10} onChange={(event) => setIcaoValue(event.target.value.toUpperCase())} data-testid="club-icao-input" />
            </Field>
            <Field label={labels.contactEmail}>
              <Input type="email" value={contactEmailValue} onChange={(event) => setContactEmailValue(event.target.value)} data-testid="club-contact-email-input" />
            </Field>
            <Field label={labels.metarStation}>
              <Input
                value={metarStationValue}
                maxLength={10}
                placeholder={icaoValue}
                onChange={(event) => setMetarStationValue(event.target.value.toUpperCase())}
                data-testid="club-metar-station-input"
              />
            </Field>
            <Field label={labels.landingFee}>
              <Input inputMode="decimal" value={landingFee} onChange={(event) => setLandingFee(event.target.value)} data-testid="club-landing-fee-input" />
            </Field>
            <Field label={labels.membershipFee}>
              <Input inputMode="decimal" value={membershipFee} onChange={(event) => setMembershipFee(event.target.value)} data-testid="club-membership-fee-input" />
            </Field>
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            {labels.metarStationHint}
          </p>
          <p className="hint" style={{ marginTop: 2 }}>
            {labels.landingFeeHint}
          </p>
          <p className="hint" style={{ marginTop: 2 }}>
            {labels.membershipFeeHint}
          </p>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label={labels.operatingInstructionsIt} wide>
              <textarea
                className="input"
                rows={3}
                value={instructionsIt}
                onChange={(event) => setInstructionsIt(event.target.value)}
                data-testid="club-instructions-it-input"
              />
            </Field>
            <Field label={labels.operatingInstructionsEn} wide>
              <textarea
                className="input"
                rows={3}
                value={instructionsEn}
                onChange={(event) => setInstructionsEn(event.target.value)}
                data-testid="club-instructions-en-input"
              />
            </Field>
          </div>
        </div>

        {feedback ? (
          <p role="status" data-testid="club-settings-feedback" style={{ marginTop: 14, fontSize: 12.5, color: feedback === labels.saved ? 'var(--ok)' : 'var(--bad)' }}>
            {feedback}
          </p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <button type="button" disabled={saving} onClick={() => void save()} data-testid="club-settings-save" className="btn primary">
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}
