'use client';

import { useId, useState } from 'react';
import { Field, Input, Select } from '@/components/ui/field';
import type { SettingsDraft, SmtpSecurity } from '@/lib/settings-draft';

type SmtpValue = SettingsDraft['smtp'];

export type SmtpCardLabels = {
  title: string;
  sub: string;
  testEmail: string;
  testEmailSent: string;
  testEmailFailed: string;
  testEmailNoContact: string;
  /** Story 19.8 (D-9): why the test button waits — it sends through the SAVED configuration. */
  testEmailNeedsSave: string;
  host: string;
  port: string;
  security: string;
  securityOptions: Record<SmtpSecurity, string>;
  from: string;
  user: string;
  pass: string;
  passHint: string;
  passConfigured: string;
};

export type SmtpCardProps = {
  value: SmtpValue;
  onChange: (patch: Partial<SmtpValue>) => void;
  errors: Partial<Record<keyof SmtpValue, string>>;
  /** SMTP or the contact email have unsaved changes (`settings-draft.ts#testEmailBlocked`). */
  testEmailBlocked: boolean;
  labels: SmtpCardLabels;
};

const SECURITY_VALUES: readonly SmtpSecurity[] = ['NONE', 'STARTTLS', 'SSL_TLS'];

/**
 * "Email (SMTP)" section (story 12.11, AC 1/2) — settings-first mailer
 * config (`smtp-mail-sender.ts`), `pass` write-only (a blank field leaves the
 * stored password untouched). Controlled by the page's draft since story
 * 19.8. "Invia email di prova" stays an ACTION of its own (R-19-m, D-9):
 * `POST /api/v1/settings/smtp/test-email` sends through the SAVED mailer to
 * the SAVED contact email, so it is disabled — with the reason next to it —
 * while either has unsaved changes. It never touches the draft.
 */
export function SmtpCard({ value, onChange, errors, testEmailBlocked, labels }: SmtpCardProps) {
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const hintId = useId();

  async function sendTestEmail(): Promise<void> {
    setTestSending(true);
    setTestFeedback(null);

    const response = await fetch('/api/v1/settings/smtp/test-email', { method: 'POST' }).catch(() => null);
    setTestSending(false);

    if (response?.status === 422) {
      setTestFeedback(labels.testEmailNoContact);
      return;
    }
    if (!response?.ok) {
      setTestFeedback(labels.testEmailFailed);
      return;
    }
    const body = (await response.json()) as { sent: boolean };
    setTestFeedback(body.sent ? labels.testEmailSent : labels.testEmailFailed);
  }

  return (
    <div className="card settings-card" data-testid="smtp-settings-card">
      <div className="card-head">
        <div className="card-title">{labels.title}</div>
        <span className="card-sub">{labels.sub}</span>
        <div className="spacer" />
        <button
          type="button"
          className="btn"
          disabled={testSending || testEmailBlocked}
          aria-describedby={testEmailBlocked ? hintId : undefined}
          onClick={() => void sendTestEmail()}
          data-testid="smtp-test-email-button"
        >
          {labels.testEmail}
        </button>
      </div>
      <div style={{ padding: '18px 20px' }}>
        {testEmailBlocked ? (
          <p id={hintId} className="fld-hint" data-testid="smtp-test-email-hint" style={{ marginBottom: 12 }}>
            {labels.testEmailNeedsSave}
          </p>
        ) : null}
        {testFeedback ? (
          <p role="status" data-testid="smtp-test-email-feedback" style={{ marginBottom: 12, fontSize: 12.5, color: testFeedback === labels.testEmailSent ? 'var(--ok)' : 'var(--bad)' }}>
            {testFeedback}
          </p>
        ) : null}

        <div className="form-grid">
          <Field label={labels.host} error={errors.host}>
            <Input
              value={value.host}
              onChange={(event) => onChange({ host: event.target.value })}
              aria-invalid={Boolean(errors.host)}
              placeholder="smtp.example.com"
              data-testid="smtp-host-input"
            />
          </Field>
          <Field label={labels.port} error={errors.port}>
            <Input type="number" value={value.port} onChange={(event) => onChange({ port: event.target.value })} aria-invalid={Boolean(errors.port)} placeholder="587" data-testid="smtp-port-input" />
          </Field>
          <Field label={labels.security}>
            <Select value={value.security} onChange={(event) => onChange({ security: event.target.value as SmtpSecurity })} data-testid="smtp-security-select">
              {SECURITY_VALUES.map((security) => (
                <option key={security} value={security}>
                  {labels.securityOptions[security]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={labels.from} error={errors.from}>
            <Input
              value={value.from}
              onChange={(event) => onChange({ from: event.target.value })}
              aria-invalid={Boolean(errors.from)}
              placeholder="Club Ops <ops@example.com>"
              data-testid="smtp-from-input"
            />
          </Field>
          <Field label={labels.user}>
            <Input value={value.user} onChange={(event) => onChange({ user: event.target.value })} autoComplete="off" data-testid="smtp-user-input" />
          </Field>
          <Field label={labels.pass}>
            <Input
              type="password"
              value={value.pass}
              onChange={(event) => onChange({ pass: event.target.value })}
              placeholder={value.hasPassword ? labels.passConfigured : '••••••••'}
              autoComplete="new-password"
              data-testid="smtp-pass-input"
            />
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {labels.passHint}
        </p>
      </div>
    </div>
  );
}
