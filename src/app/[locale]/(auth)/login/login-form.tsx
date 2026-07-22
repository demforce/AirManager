'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, Input } from '@/components/ui/field';
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

/**
 * AirOps visual pass (story 12.1, AC 5) — same fields, same `signIn` call,
 * same redirect and error message as before; only the markup/classes
 * changed (`.fld`/`.input`/`.btn.primary` instead of the old Tailwind
 * card). `Field` wraps the `<input>` inside its `<label>` (implicit
 * association), which `page.getByLabel(...)` resolves the same way an
 * explicit `htmlFor`/`id` pair would — `e2e/login.spec.ts` selectors are
 * untouched.
 */
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

  // method="post" is the no-JS fallback: without it a pre-hydration submit
  // would be a native GET putting the credentials in the URL.
  return (
    <form method="post" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label={labels.email}>
        <Input type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register('email')} />
      </Field>

      <Field label={labels.password}>
        <Input type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} {...register('password')} />
      </Field>

      {formError ? (
        <p
          role="alert"
          data-testid="login-error"
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
