'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
          className="rounded-[8px] bg-[#EDF3EC] px-4 py-3 text-sm text-[#346538]"
        >
          {labels.success}
        </p>
        <Link
          href="/login"
          locale={locale}
          className="mt-6 inline-block text-sm font-medium text-[#2F3437] underline underline-offset-4"
        >
          {labels.goToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-6">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[#2F3437]">
          {labels.password}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        {errors.password ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.errorTooShort}</p> : null}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#2F3437]">
          {labels.confirmPassword}
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword ? <p className="mt-1 text-xs text-[#9F2F2D]">{labels.errorMismatch}</p> : null}
      </div>

      {formError ? (
        <p
          role="alert"
          data-testid="set-password-error"
          className="rounded-[8px] bg-[#FDEBEC] px-4 py-3 text-sm text-[#9F2F2D]"
        >
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-[6px] bg-[#111111] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#333333] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
