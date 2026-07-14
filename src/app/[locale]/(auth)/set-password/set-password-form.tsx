'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { setPasswordSchema } from '@/lib/schemas/auth-tokens';

const setPasswordFormSchema = setPasswordSchema
  .omit({ token: true })
  .extend({ confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'MISMATCH',
    path: ['confirmPassword'],
  });

type SetPasswordFormValues = z.infer<typeof setPasswordFormSchema>;

type Labels = {
  password: string;
  confirmPassword: string;
  submit: string;
  submitting: string;
  success: string;
  goToLogin: string;
  errorMismatch: string;
  errorTooShort: string;
  errorGeneric: string;
};

type SetPasswordFormProps = {
  token: string;
  locale: AppLocale;
  labels: Labels;
};

/** AirOps visual pass (story 12.1, AC 5) — same fields/API call/redirect as before, `.fld`/`.input`/`.btn.primary` markup only. */
export function SetPasswordForm({ token, locale, labels }: SetPasswordFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit(values: SetPasswordFormValues) {
    setFormError(null);

    const response = await fetch('/api/v1/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: values.password }),
    });

    if (!response.ok) {
      // AC 1/3: an unknown/expired/reused token is the only failure mode
      // exposed here — the service doesn't distinguish invite from reset,
      // so neither does this message.
      setFormError(labels.errorGeneric);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div>
        <p
          role="status"
          data-testid="set-password-success"
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--ok-soft)',
            color: 'oklch(0.35 0.1 155)',
            fontSize: 12.5,
          }}
        >
          {labels.success}
        </p>
        <Link href="/login" locale={locale} style={{ marginTop: 20, display: 'inline-block', fontSize: 12.5 }}>
          {labels.goToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label={labels.password}>
        <Input type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register('password')} />
      </Field>
      {errors.password ? (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--bad)' }}>{labels.errorTooShort}</p>
      ) : null}

      <Field label={labels.confirmPassword}>
        <Input type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} {...register('confirmPassword')} />
      </Field>
      {errors.confirmPassword ? (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--bad)' }}>{labels.errorMismatch}</p>
      ) : null}

      {formError ? (
        <p
          role="alert"
          data-testid="set-password-error"
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bad-soft)',
            color: 'oklch(0.4 0.17 25)',
            fontSize: 12.5,
          }}
        >
          {formError}
        </p>
      ) : null}

      <button type="submit" className="btn primary" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
        {isSubmitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
