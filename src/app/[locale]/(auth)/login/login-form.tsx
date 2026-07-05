'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@/lib/schemas/login';

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
        <label htmlFor="email" className="block text-sm font-medium text-[#2F3437]">
          {labels.email}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[#2F3437]">
          {labels.password}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="mt-2 w-full rounded-[6px] border border-[#EAEAEA] bg-white px-3 py-2 text-base text-[#111111] outline-none transition-colors focus:border-[#2F3437]"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </div>

      {formError ? (
        <p
          role="alert"
          data-testid="login-error"
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
