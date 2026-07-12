'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/schemas/auth-tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
          className="rounded-nested bg-[#E1F3FE] px-4 py-3 text-sm leading-[1.6] text-[#1F6C9F]"
        >
          {labels.confirmation}
        </p>
        <Link
          href="/login"
          locale={locale}
          className="mt-6 inline-block text-sm font-medium text-ink underline underline-offset-4"
        >
          {labels.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          {labels.email}
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="mt-2 w-full"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
