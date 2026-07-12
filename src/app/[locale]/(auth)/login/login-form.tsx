'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@/lib/schemas/login';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type LoginFormLabels = {
  email: string;
  password: string;
  submit: string;
  submitting: string;
  errorGeneric: string;
};

type LoginFormProps = {
  labels: LoginFormLabels;
  /** Where to send the user after a successful sign-in (already locale-prefixed). */
  callbackUrl: string;
};

export function LoginForm({ labels, callbackUrl }: LoginFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput) {
    setFormError(null);

    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    // AC 2: never distinguish "wrong password" from "no such user" — Auth.js
    // itself only ever reports the generic `CredentialsSignin` error here.
    if (!result || result.error) {
      setFormError(labels.errorGeneric);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          {labels.password}
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="mt-2 w-full"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </div>

      {formError ? (
        <p
          role="alert"
          data-testid="login-error"
          className="rounded-nested bg-canvas px-4 py-3 text-sm text-ember"
        >
          {formError}
        </p>
      ) : null}

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
