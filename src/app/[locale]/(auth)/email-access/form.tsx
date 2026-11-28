'use client';

import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { confirmMailbox, confirmNewAddress, confirmReactivation, proposeNewAddress, requestLink } from './actions';

export function EmailAccessForm({ purpose, locale }: { purpose: 'verify' | 'login' | 'request' | 'reactivate' | 'change-current' | 'change-new'; locale: string }) {
  const t = useTranslations('auth.emailTrial');
  const token = useRef('');
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<'invalid' | 'sent' | 'verified' | 'reactivated' | 'changeSubmitted' | 'changeCompleted' | 'changeInvalid' | null>(null);
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
      } else if (purpose === 'verify') {
        setOutcome(await confirmMailbox(token.current) ? 'verified' : 'invalid');
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
    <button type="submit" className="btn primary" disabled={pending || outcome === 'verified' || outcome === 'reactivated' || outcome === 'changeCompleted' || outcome === 'changeSubmitted'}>{t(purpose)}</button>
    {outcome && <p role="status">{t(outcome)}</p>}
  </form>;
}
