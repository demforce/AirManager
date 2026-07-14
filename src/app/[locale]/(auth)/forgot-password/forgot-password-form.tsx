'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, Input } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/schemas/auth-tokens';

type Labels = {
  email: string;
  submit: string;
  submitting: string;
  confirmation: string;
  backToLogin: string;
};

type ForgotPasswordFormProps = {
  locale: AppLocale;
  labels: Labels;
};

/** AirOps visual pass (story 12.1, AC 5) — same request/neutral-confirmation behavior as before, `.fld`/`.input`/`.btn.primary` markup only. */
export function ForgotPasswordForm({ locale, labels }: ForgotPasswordFormProps) {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    // AC 3: fire the request and always show the same neutral confirmation —
    // the response body/status is deliberately not inspected here beyond
    // "the request was sent", so the UI itself can't become an enumeration
    // channel even if a future change to the API response were careless.
    await fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div>
        <p
          role="status"
          data-testid="forgot-password-confirmation"
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--info-soft)',
            color: 'oklch(0.38 0.12 245)',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {labels.confirmation}
        </p>
        <Link href="/login" locale={locale} style={{ marginTop: 20, display: 'inline-block', fontSize: 12.5 }}>
          {labels.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label={labels.email}>
        <Input type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
      </Field>

      <button type="submit" className="btn primary" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
        {isSubmitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
