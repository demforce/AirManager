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
        <p role="status" data-testid="set-password-success" className="alert-box ok">
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
      <Field label={labels.password} error={errors.password ? labels.errorTooShort : undefined}>
        <Input type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register('password')} />
      </Field>

      <Field label={labels.confirmPassword} error={errors.confirmPassword ? labels.errorMismatch : undefined}>
        <Input type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} {...register('confirmPassword')} />
      </Field>

      {formError ? (
        <p role="alert" data-testid="set-password-error" className="alert-box bad">
          {formError}
        </p>
      ) : null}

      <button type="submit" className="btn primary" disabled={isSubmitting} style={{ width: '100%', justifyContent: 'center' }}>
        {isSubmitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
