'use client';

import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { adminPasswordSchema } from '@/lib/schemas/auth-tokens';
import { Field, Input } from '@/components/ui/field';
import { confirmMailbox, confirmMyPasswordChange, confirmNewAddress, confirmReactivation, proposeNewAddress, requestLink } from './actions';

export function EmailAccessForm({ purpose, locale }: { purpose: 'verify' | 'login' | 'request' | 'reactivate' | 'change-current' | 'change-new' | 'change-password'; locale: string }) {
  const t = useTranslations('auth.emailTrial');
  const tPassword = useTranslations('auth.setPassword');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<'adminPolicy' | 'adminBlocked' | 'errorMismatch' | 'tooLong' | null>(null);
  const token = useRef('');
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<'invalid' | 'sent' | 'verified' | 'adminVerified' | 'reactivated' | 'changeSubmitted' | 'changeCompleted' | 'changeInvalid' | 'passwordSaved' | null>(null);
  useEffect(() => {
    if (window.location.hash) {
      token.current = window.location.hash.slice(1);
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  }, []);

  return <form method="post" onSubmit={async event => {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    busy.current = true;
    setPending(true);
    try {
      if (purpose === 'request') {
        setOutcome(await requestLink(form) ? 'sent' : 'invalid');
      } else if (purpose === 'change-current' || purpose === 'change-new') {
        const ok = purpose === 'change-current' ? await proposeNewAddress(token.current, form) : await confirmNewAddress(token.current);
        if (ok) token.current = '';
        setOutcome(ok ? purpose === 'change-current' ? 'changeSubmitted' : 'changeCompleted' : 'changeInvalid');
      } else if (purpose === 'reactivate') {
        const confirmed = await confirmReactivation(token.current);
        if (confirmed) token.current = '';
        setOutcome(confirmed ? 'reactivated' : 'invalid');
      } else if (purpose === 'verify' || purpose === 'change-password') {
        const choosingPassword = needsPassword || purpose === 'change-password';
        const password = choosingPassword ? form.get('password') : undefined;
        if (choosingPassword) {
          const parsed = adminPasswordSchema.safeParse(password);
          if (!parsed.success) {
            setPasswordError(parsed.error.issues.some(issue => issue.code === 'too_big') ? 'tooLong' : 'adminPolicy');
            return;
          }
          if (password !== form.get('confirmPassword')) { setPasswordError('errorMismatch'); return; }
        }
        setPasswordError(null);
        if (purpose === 'change-password') {
          const result = await confirmMyPasswordChange(token.current, form);
          if (result === 'policy') { setPasswordError('adminBlocked'); return; }
          if (result === 'mismatch') { setPasswordError('errorMismatch'); return; }
          if (result === 'saved') token.current = '';
          setOutcome(result === 'saved' ? 'passwordSaved' : 'invalid');
          return;
        }
        const result = await confirmMailbox(token.current, typeof password === 'string' ? password : undefined);
        if (result === 'passwordRequired') {
          if (needsPassword) setPasswordError('adminBlocked');
          setNeedsPassword(true);
          setOutcome(null);
        } else {
          setOutcome(result === 'verified' && needsPassword ? 'adminVerified' : result);
          if (result === 'verified') {
            token.current = '';
            setNeedsPassword(false);
          }
        }
      } else {
        const result = await signIn('email-link', { email: form.get('email'), token: token.current, redirect: false });
        if (result?.ok && !result.error) {
          token.current = '';
          window.location.assign('/' + locale + '/dashboard');
        } else setOutcome('invalid');
      }
    } catch { setOutcome('invalid'); }
    finally { busy.current = false; setPending(false); }
  }} style={{ display: 'grid', gap: 14 }}>
    {(purpose === 'request' || purpose === 'login') && <Field label={t('email')}><Input type="email" name="email" autoComplete="email" required maxLength={254} /></Field>}
    {purpose === 'change-current' && <Field label={t('newEmail')}><Input type="email" name="email" autoComplete="email" required maxLength={254} /></Field>}
    {(needsPassword || purpose === 'change-password' && outcome !== 'passwordSaved') && <>
      <Field label={tPassword('passwordLabel')} hint={tPassword('adminPolicy')} error={passwordError === 'tooLong' ? t('passwordTooLong') : (passwordError === 'adminPolicy' || passwordError === 'adminBlocked') ? tPassword(passwordError) : undefined}>
        <Input type="password" name="password" autoComplete="new-password" autoFocus required aria-invalid={passwordError === 'adminPolicy' || passwordError === 'adminBlocked' || passwordError === 'tooLong'} />
      </Field>
      <Field label={tPassword('confirmPasswordLabel')} error={passwordError === 'errorMismatch' ? tPassword(passwordError) : undefined}>
        <Input type="password" name="confirmPassword" autoComplete="new-password" required aria-invalid={passwordError === 'errorMismatch'} />
      </Field>
    </>}
    <button type="submit" className="btn primary" disabled={pending || outcome === 'passwordSaved' || outcome === 'verified' || outcome === 'adminVerified' || outcome === 'reactivated' || outcome === 'changeCompleted' || outcome === 'changeSubmitted'}>{t(needsPassword ? 'verifyAdmin' : purpose)}</button>
    {outcome && <p role="status">{t(outcome)}</p>}
  </form>;
}
