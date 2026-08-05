'use client';

import { useState } from 'react';
import { Field, Input, Select } from '@/components/ui/field';
import { parseApiError } from '@/lib/api-field-errors';
import type { SmtpSecurityDto } from '@/lib/schemas/settings';

export type SmtpCardLabels = {
  title: string;
  sub: string;
  testEmail: string;
  testEmailSent: string;
  testEmailFailed: string;
  testEmailNoContact: string;
  host: string;
  port: string;
  security: string;
  securityOptions: Record<SmtpSecurityDto, string>;
  from: string;
  user: string;
  pass: string;
  passHint: string;
  passConfigured: string;
  save: string;
  saved: string;
  error: string;
  /** Story 14.2, AC 3: `smtpSettingsInputSchema`'s own SSRF `.refine` (CWE-918) 422s with `fieldErrors.host` for a private/loopback/link-local address — this card has no client-side check for it, a genuinely reachable field-shaped 422. */
  invalidHost: string;
};

export type SmtpCardProps = {
  initial: {
    host: string | null;
    port: number | null;
    security: SmtpSecurityDto | null;
    user: string | null;
    from: string | null;
    hasPassword: boolean;
  };
  labels: SmtpCardLabels;
};

const SECURITY_VALUES: readonly SmtpSecurityDto[] = ['NONE', 'STARTTLS', 'SSL_TLS'];

/**
 * "Email (SMTP)" card (story 12.11, AC 1/2) — settings-first mailer config
 * (`smtp-mail-sender.ts`), `pass` write-only (a blank field on save leaves
 * the stored password untouched). "Invia email di prova" is REAL (AC 2):
 * `POST /api/v1/settings/smtp/test-email`, sending via the CURRENT mailer to
 * the airfield contact email (Mailpit-verifiable via e2e).
 */
export function SmtpCard({ initial, labels }: SmtpCardProps) {
  const [host, setHost] = useState(initial.host ?? '');
  const [port, setPort] = useState(String(initial.port ?? 587));
  const [security, setSecurity] = useState<SmtpSecurityDto>(initial.security ?? 'STARTTLS');
  const [from, setFrom] = useState(initial.from ?? '');
  const [user, setUser] = useState(initial.user ?? '');
  const [pass, setPass] = useState('');
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);
  const [hostError, setHostError] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setFeedback(null);
    setHostError(false);

    const response = await fetch('/api/v1/settings/smtp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port: Number(port), security, from, user, ...(pass ? { pass } : {}) }),
    });

    setSaving(false);
    if (response.ok) {
      setFeedback(labels.saved);
      if (pass) setHasPassword(true);
      setPass('');
      return;
    }

    if (response.status === 422) {
      const { fieldErrors } = await parseApiError(response);
      if (fieldErrors.has('host')) {
        setHostError(true);
        setFeedback(labels.error);
        return;
      }
    }
    setFeedback(labels.error);
  }

  async function sendTestEmail(): Promise<void> {
    setTestSending(true);
    setTestFeedback(null);

    const response = await fetch('/api/v1/settings/smtp/test-email', { method: 'POST' });
    setTestSending(false);

    if (response.status === 422) {
      setTestFeedback(labels.testEmailNoContact);
      return;
    }
    if (!response.ok) {
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
        <button type="button" className="btn" disabled={testSending} onClick={() => void sendTestEmail()} data-testid="smtp-test-email-button">
          {labels.testEmail}
        </button>
      </div>
      <div style={{ padding: '18px 20px' }}>
        {testFeedback ? (
          <p role="status" data-testid="smtp-test-email-feedback" style={{ marginBottom: 12, fontSize: 12.5, color: testFeedback === labels.testEmailSent ? 'var(--ok)' : 'var(--bad)' }}>
            {testFeedback}
          </p>
        ) : null}

        <div className="form-grid">
          <Field label={labels.host} error={hostError ? labels.invalidHost : undefined}>
            <Input
              value={host}
              onChange={(event) => {
                setHost(event.target.value);
                if (hostError) setHostError(false);
              }}
              aria-invalid={hostError}
              placeholder="smtp.example.com"
              data-testid="smtp-host-input"
            />
          </Field>
          <Field label={labels.port}>
            <Input type="number" value={port} onChange={(event) => setPort(event.target.value)} placeholder="587" data-testid="smtp-port-input" />
          </Field>
          <Field label={labels.security}>
            <Select value={security} onChange={(event) => setSecurity(event.target.value as SmtpSecurityDto)} data-testid="smtp-security-select">
              {SECURITY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {labels.securityOptions[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={labels.from}>
            <Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Club Ops <ops@example.com>" data-testid="smtp-from-input" />
          </Field>
          <Field label={labels.user}>
            <Input value={user} onChange={(event) => setUser(event.target.value)} autoComplete="off" data-testid="smtp-user-input" />
          </Field>
          <Field label={labels.pass}>
            <Input
              type="password"
              value={pass}
              onChange={(event) => setPass(event.target.value)}
              placeholder={hasPassword ? labels.passConfigured : '••••••••'}
              autoComplete="new-password"
              data-testid="smtp-pass-input"
            />
          </Field>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {labels.passHint}
        </p>

        {feedback ? (
          <p role="status" data-testid="smtp-settings-feedback" style={{ marginTop: 14, fontSize: 12.5, color: feedback === labels.saved ? 'var(--ok)' : 'var(--bad)' }}>
            {feedback}
          </p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <button type="button" disabled={saving} onClick={() => void save()} data-testid="smtp-settings-save" className="btn primary">
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}
